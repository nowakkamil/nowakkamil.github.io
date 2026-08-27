import gsap from 'gsap';
import * as THREE from 'three';

import wakeFragmentShader from '../shaders/cursorWake/fragment.glsl';
import wakeVertexShader from '../shaders/cursorWake/vertex.glsl';
import { smoothstep } from '../../utils/animation';

const INTERACTIVE_SELECTOR = 'a, button, [data-scroll], [data-cursor], [data-magnetic]';
const WAKE_POINT_COUNT = 14;
const WAKE_FADE_SECONDS = 0.6;
const PAN_DEAD_ZONE = 18;
const PAN_MAX_SPEED = 12800;
const SCROLL_CUE_REVEAL_OFFSET = 16;
// Startup frames are long enough that exponential damping can resolve in a
// single step, which would pop the cues in instead of fading them.
const CUE_FADE_MAX_DELTA = 1 / 30;
const SOUND_CUE_INTRO_DURATION = 1.1;
const CORE_IDLE_COLOR = new THREE.Color(0xffffff);
const CORE_HOVER_COLOR = new THREE.Color(0.72, 0.52, 1);

export interface CursorAutoScrollController {
    getPosition(): number;
    setPosition(position: number): void;
    getMaxPosition(): number;
}

export class CursorSystem {
    private readonly enabled = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.OrthographicCamera();
    private readonly renderer?: THREE.WebGLRenderer;
    private readonly core = new THREE.Group();
    private readonly orbit = new THREE.Group();
    private readonly ring = new THREE.Group();
    private readonly panAnchor = new THREE.Group();
    private readonly panAnchorMaterial = CursorSystem.createMaterial(0xffffff, 0.5);
    private readonly panUpMaterial = CursorSystem.createMaterial(0xffffff, 0.32);
    private readonly panDownMaterial = CursorSystem.createMaterial(0xffffff, 0.32);
    private readonly panLineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.08,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
    });
    private readonly panLineGeometry = new THREE.BufferGeometry();
    private readonly panLinePositions = new Float32Array(6);
    private readonly panLine = new THREE.Line(this.panLineGeometry, this.panLineMaterial);
    private readonly coreMaterial = CursorSystem.createMaterial(CORE_IDLE_COLOR, 1);
    private readonly orbitMaterial = CursorSystem.createMaterial(0xffffff, 0.72);
    private readonly glowMaterial = CursorSystem.createMaterial(0xffffff, 0.22);
    private readonly satelliteMaterial = CursorSystem.createMaterial(0xffffff, 0.9);
    private projectCueSprite?: THREE.Sprite;
    private soundCueSprite?: THREE.Sprite;
    private readonly scrollCueGroup = new THREE.Group();
    private readonly scrollCueOutlineMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.52,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });
    private readonly scrollCueDotMaterial = CursorSystem.createMaterial(0xffffff, 0.8);
    private readonly scrollCuePrimarySatelliteMaterial = CursorSystem.createMaterial(
        0xffffff,
        0.78,
    );
    private readonly scrollCueSecondarySatelliteMaterial = CursorSystem.createMaterial(
        0xffffff,
        0.56,
    );
    private scrollCueDot?: THREE.Mesh;
    private scrollCuePrimarySatellite?: THREE.Mesh;
    private scrollCueSecondarySatellite?: THREE.Mesh;
    private scrollCuePathPoints: THREE.Vector3[] = [];
    private scrollCuePathDistances: number[] = [];
    private scrollCuePathLength = 0;
    private projectCueRequestedVisible = false;
    private soundCueRequestedVisibility = 0;
    private projectCueTargetOpacity = 0;
    private soundCueTargetOpacity = 0;
    private soundCueIntroProgress = 0;
    private soundCueIntroComplete = false;
    private scrollCueVisibility = 0;
    private scrollCueTargetVisibility = 0;
    private scrollCueBaseY = 0;
    private readonly autoScroll?: CursorAutoScrollController;
    private readonly wakePoints = new Float32Array(WAKE_POINT_COUNT * 2);
    private readonly wakeVertices = new Float32Array(WAKE_POINT_COUNT * 2 * 3);
    private wake?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    private wakePositionAttribute?: THREE.BufferAttribute;
    private readonly setCoreX?: (value: number) => void;
    private readonly setCoreY?: (value: number) => void;
    private readonly setOrbitX?: (value: number) => void;
    private readonly setOrbitY?: (value: number) => void;
    private active = false;
    private hovering = false;
    private domHovering = false;
    private sceneHovering = false;
    private pressed = false;
    private nativeScrollbarActive = false;
    private panning = false;
    private panAnchorClientX = 0;
    private panAnchorClientY = 0;
    private pointerClientX = 0;
    private pointerClientY = 0;
    private orbitAngle = 0;
    private orbitSpeed = 0.55;
    private wakeInitialized = false;
    private wakePreviousX = 0;
    private wakePreviousY = 0;
    private wakeDirectionX = 1;
    private wakeDirectionY = 0;
    private wakeSpeed = 0;
    private wakeEnergy = 0;
    private wakeWarmupFrames = 0;
    private lastPointerTarget: EventTarget | null = null;
    private htmlCursorHandoffPending = false;
    private scrollCueInitialized = false;

    constructor(autoScroll?: CursorAutoScrollController) {
        this.autoScroll = autoScroll;
        if (!this.enabled) {
            return;
        }

        this.renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: 'low-power',
        });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.domElement.className = 'three-cursor';
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this.renderer.domElement);

        this.createCursor();
        this.projectCueSprite = this.createCueSprite('✦', 'Select a project star to learn more');
        this.soundCueSprite = this.createCueSprite('♫', 'Click to enable sound');
        // Scroll-cue geometry is created lazily on first reveal to keep it
        // out of the startup / TBT critical path (see ensureScrollCueInitialized).
        this.resize();

        const coreDuration = this.reducedMotion ? 0.01 : 0.08;
        const orbitDuration = this.reducedMotion ? 0.01 : 0.32;
        this.setCoreX = gsap.quickTo(this.core.position, 'x', {
            duration: coreDuration,
            ease: 'power3.out',
        });
        this.setCoreY = gsap.quickTo(this.core.position, 'y', {
            duration: coreDuration,
            ease: 'power3.out',
        });
        this.setOrbitX = gsap.quickTo(this.orbit.position, 'x', {
            duration: orbitDuration,
            ease: 'power3.out',
        });
        this.setOrbitY = gsap.quickTo(this.orbit.position, 'y', {
            duration: orbitDuration,
            ease: 'power3.out',
        });
        this.takeOverFromHtmlCursor();

        window.addEventListener('pointermove', this.handlePointerMove, {
            passive: true,
        });
        window.addEventListener('three-cursor-hover', this.handleSceneHover);
        window.addEventListener('pointerdown', this.handlePointerDown);
        window.addEventListener('pointerup', this.handlePointerUp, {
            passive: true,
        });
        window.addEventListener('auxclick', this.handleAuxClick);
        window.addEventListener('wheel', this.handleWheel, { passive: true });
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('pointercancel', this.handlePointerCancel, {
            passive: true,
        });
        window.addEventListener('pointerout', this.handlePointerOut, {
            passive: true,
        });
        window.addEventListener('blur', this.handlePointerCancel);
        document.addEventListener('dragstart', this.handleDragStart);
        document.addEventListener('dragend', this.handleDragEnd, {
            passive: true,
        });
        window.addEventListener('resize', this.resize, { passive: true });
    }

    private takeOverFromHtmlCursor(): void {
        const htmlCursor = document.querySelector<HTMLElement>('#html-loading-cursor');
        if (htmlCursor) {
            this.htmlCursorHandoffPending = true;
            htmlCursor.style.color = this.coreMaterial.color.getStyle();
            const htmlGlow = htmlCursor.querySelector<HTMLElement>('.html-loading-cursor__glow');
            const htmlOrbit = htmlCursor.querySelector<HTMLElement>('.html-loading-cursor__orbit');

            if (htmlGlow) {
                htmlGlow.style.backgroundColor = this.glowMaterial.color.getStyle();
                htmlGlow.style.opacity = String(this.glowMaterial.opacity);
            }
            if (htmlOrbit) {
                htmlOrbit.style.borderColor = this.orbitMaterial.color.getStyle();
                htmlOrbit.style.opacity = String(this.orbitMaterial.opacity);
            }
        }
        const pointerX = Number(htmlCursor?.dataset.pointerX);
        const pointerY = Number(htmlCursor?.dataset.pointerY);

        if (htmlCursor && Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
            const x = pointerX - document.documentElement.clientWidth * 0.5;
            const y = document.documentElement.clientHeight * 0.5 - pointerY;
            this.active = true;
            this.core.position.set(x, y, 0);
            this.orbit.position.set(x, y, 0);
            this.core.visible = true;
            this.orbit.visible = true;
            if (!this.htmlCursorHandoffPending) {
                this.setCursorLabelActive(true);
            }
        }

        if (!this.htmlCursorHandoffPending) {
            this.renderer?.render(this.scene, this.camera);
        } else {
            this.renderer?.compile(this.scene, this.camera);
        }
    }

    public update(delta: number, elapsed: number): void {
        if (!this.renderer) {
            return;
        }

        if (this.panning) {
            this.updateAutoScroll(delta, elapsed);
        }

        if (!this.reducedMotion) {
            const targetSpeed = this.panning
                ? 2.15
                : this.pressed
                  ? 1.65
                  : this.hovering
                    ? -0.85
                    : 0.55;
            const speedDamping = 1 - Math.exp(-delta * 7);
            this.orbitSpeed = THREE.MathUtils.lerp(this.orbitSpeed, targetSpeed, speedDamping);
            this.orbitAngle += delta * this.orbitSpeed;
            this.ring.rotation.z = this.orbitAngle;

            const pulse = 1 + Math.sin(elapsed * 2.4) * 0.035;
            this.core.scale.setScalar(pulse);
            if (this.panning) {
                const anchorPulse = 1 + Math.sin(elapsed * 3.1) * 0.025;
                this.panAnchor.scale.setScalar(anchorPulse);
            }

            if (this.active) {
                this.updateWake(delta, elapsed);
            } else if (this.wake?.visible) {
                this.hideWake();
            }
        }

        this.updateScrollCueFade(delta);
        this.updateMouseScrollCue(elapsed);
        this.updateCueFades(delta);

        if (this.htmlCursorHandoffPending) {
            this.setCursorLabelActive(this.active);
        }

        this.updateCuePosition(this.projectCueSprite);
        this.updateCuePosition(this.soundCueSprite);
        this.renderer.render(this.scene, this.camera);

        if (this.htmlCursorHandoffPending) {
            this.htmlCursorHandoffPending = false;
            window.dispatchEvent(new Event('three-cursor-ready'));
        }
    }

    private setCursorLabelActive(active: boolean): void {
        this.syncCueVisibility(active);
    }

    public setProjectCueVisible(visible: boolean): void {
        this.projectCueRequestedVisible = visible;
        this.syncCueVisibility(this.active);
    }

    public setSoundCueVisibility(visibility: number): void {
        this.soundCueRequestedVisibility = THREE.MathUtils.clamp(visibility, 0, 1);
        this.syncCueVisibility(this.active);
    }

    public setScrollCueVisibility(visibility: number): void {
        this.scrollCueTargetVisibility = THREE.MathUtils.clamp(visibility, 0, 1);
        if (this.scrollCueTargetVisibility > 0.001) {
            // Lazily build geometry the first time the cue becomes visible,
            // keeping THREE allocations out of the startup long-task window.
            this.ensureScrollCueInitialized();
            this.scrollCueGroup.visible = true;
        }
    }

    private syncCueVisibility(active: boolean): void {
        const showProject = active && this.projectCueRequestedVisible;
        const soundVisibility = active && !showProject ? this.soundCueRequestedVisibility : 0;

        this.projectCueTargetOpacity = showProject ? 1 : 0;
        this.soundCueTargetOpacity = soundVisibility;

        if (showProject && this.projectCueSprite) {
            this.projectCueSprite.visible = true;
        }
        if (soundVisibility > 0.001 && this.soundCueSprite) {
            this.soundCueSprite.visible = true;
        }
    }

    private updateCueFades(delta: number): void {
        const fadeDelta = Math.min(delta, CUE_FADE_MAX_DELTA);
        const projectDamping = this.reducedMotion ? 1 : 1 - Math.exp(-fadeDelta * 10);
        this.updateCueFade(this.projectCueSprite, this.projectCueTargetOpacity, projectDamping);
        this.updateSoundCueFade(fadeDelta);
    }

    private updateSoundCueFade(delta: number): void {
        if (!this.soundCueSprite) {
            return;
        }

        const material = this.soundCueSprite.material;
        if (!this.soundCueIntroComplete) {
            if (this.soundCueTargetOpacity > 0) {
                this.soundCueIntroProgress = this.reducedMotion
                    ? 1
                    : Math.min(1, this.soundCueIntroProgress + delta / SOUND_CUE_INTRO_DURATION);
                material.opacity =
                    smoothstep(this.soundCueIntroProgress) * this.soundCueTargetOpacity;
                this.soundCueIntroComplete = this.soundCueIntroProgress >= 1;
                return;
            }

            if (material.opacity <= 0) {
                return;
            }

            this.soundCueIntroComplete = true;
        }

        const soundFadeRate = this.soundCueTargetOpacity > material.opacity ? 2.5 : 10;
        const soundDamping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * soundFadeRate);
        this.updateCueFade(this.soundCueSprite, this.soundCueTargetOpacity, soundDamping);
    }

    private updateCueFade(sprite: THREE.Sprite | undefined, target: number, damping: number): void {
        if (!sprite) {
            return;
        }

        const material = sprite.material as THREE.SpriteMaterial;
        material.opacity = THREE.MathUtils.lerp(material.opacity, target, damping);
        if (target <= 0 && material.opacity < 0.01) {
            material.opacity = 0;
            sprite.visible = false;
        }
    }

    private updateCuePosition(sprite?: THREE.Sprite): void {
        if (!this.active || !sprite?.visible) {
            return;
        }

        const cursorRadius = 19.5 * this.ring.scale.x;
        const cursorGap = 12;
        sprite.position.set(
            this.core.position.x + cursorRadius + cursorGap + sprite.scale.x * 0.5,
            this.core.position.y,
            2,
        );
    }

    private createCueSprite(symbol: string, label: string): THREE.Sprite | undefined {
        const pixelRatio = 2;
        const height = 26;
        const horizontalPadding = 9;
        const symbolGap = 6;
        const symbolFont = '14px sans-serif';
        const labelFont = '300 12px Urbanist, sans-serif';
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        context.font = symbolFont;
        const symbolWidth = context.measureText(symbol).width;
        context.font = labelFont;
        const labelWidth = context.measureText(label).width;
        const width = Math.ceil(horizontalPadding * 2 + symbolWidth + symbolGap + labelWidth);
        canvas.width = width * pixelRatio;
        canvas.height = height * pixelRatio;
        context.scale(pixelRatio, pixelRatio);
        context.clearRect(0, 0, width, height);
        const glassGradient = context.createLinearGradient(0, 0, 0, height);
        glassGradient.addColorStop(0, 'rgba(18, 20, 26, 0.58)');
        glassGradient.addColorStop(0.5, 'rgba(5, 6, 10, 0.48)');
        glassGradient.addColorStop(1, 'rgba(0, 0, 0, 0.56)');
        context.fillStyle = glassGradient;
        context.beginPath();
        context.roundRect(0, 0, width, height, height * 0.5);
        context.fill();
        context.strokeStyle = 'rgba(255, 255, 255, 0.18)';
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(0.5, 0.5, width - 1, height - 1, height * 0.5 - 0.5);
        context.stroke();
        context.strokeStyle = 'rgba(255, 255, 255, 0.035)';
        context.lineWidth = 1;
        context.beginPath();
        context.roundRect(1.5, 1.5, width - 3, height - 3, height * 0.5 - 1.5);
        context.stroke();
        context.fillStyle = 'rgba(255, 255, 255, 0.82)';
        context.font = symbolFont;
        context.textBaseline = 'middle';
        context.fillText(symbol, horizontalPadding, height * 0.5);
        context.fillStyle = 'rgba(255, 255, 255, 0.7)';
        context.font = labelFont;
        context.fillText(label, horizontalPadding + symbolWidth + symbolGap, height * 0.5);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        const material = new THREE.SpriteMaterial({
            map: texture,
            opacity: 0,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(width, height, 1);
        sprite.visible = false;
        this.scene.add(sprite);
        return sprite;
    }

    private ensureScrollCueInitialized(): void {
        if (this.scrollCueInitialized) {
            return;
        }
        this.scrollCueInitialized = true;
        this.createMouseScrollCue();
    }

    private createMouseScrollCue(): void {
        const points: THREE.Vector3[] = [];
        const halfWidth = 19;
        const halfHeight = 31;
        const radius = 18;
        const cornerSegments = 8;
        const addCorner = (centerX: number, centerY: number, startAngle: number): void => {
            for (let index = 0; index <= cornerSegments; index++) {
                const angle = startAngle + (index / cornerSegments) * Math.PI * 0.5;
                points.push(
                    new THREE.Vector3(
                        centerX + Math.cos(angle) * radius,
                        centerY + Math.sin(angle) * radius,
                        0,
                    ),
                );
            }
        };

        addCorner(halfWidth - radius, halfHeight - radius, 0);
        addCorner(-halfWidth + radius, halfHeight - radius, Math.PI * 0.5);
        addCorner(-halfWidth + radius, -halfHeight + radius, Math.PI);
        addCorner(halfWidth - radius, -halfHeight + radius, Math.PI * 1.5);

        const outlineGeometry = new THREE.BufferGeometry().setFromPoints(points);
        const outline = new THREE.LineLoop(outlineGeometry, this.scrollCueOutlineMaterial);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(2, 16), this.scrollCueDotMaterial);
        dot.scale.y = 1.8;
        const primarySatellite = new THREE.Mesh(
            new THREE.CircleGeometry(1.45, 16),
            this.scrollCuePrimarySatelliteMaterial,
        );
        const secondarySatellite = new THREE.Mesh(
            new THREE.CircleGeometry(0.95, 16),
            this.scrollCueSecondarySatelliteMaterial,
        );
        dot.position.z = 1;
        primarySatellite.position.z = 1;
        secondarySatellite.position.z = 1;
        this.scrollCueGroup.add(outline, dot, primarySatellite, secondarySatellite);
        this.scrollCueGroup.visible = false;
        this.scene.add(this.scrollCueGroup);
        this.scrollCueDot = dot;
        this.scrollCuePrimarySatellite = primarySatellite;
        this.scrollCueSecondarySatellite = secondarySatellite;
        this.scrollCuePathPoints = points;
        this.scrollCuePathDistances = [0];
        for (let index = 1; index <= points.length; index++) {
            const previous = points[index - 1];
            const current = points[index % points.length];
            this.scrollCuePathLength += previous.distanceTo(current);
            this.scrollCuePathDistances.push(this.scrollCuePathLength);
        }
    }

    private updateScrollCueFade(delta: number): void {
        if (!this.scrollCueInitialized && this.scrollCueTargetVisibility <= 0) {
            return;
        }
        const fadeRate = this.scrollCueTargetVisibility > this.scrollCueVisibility ? 3.5 : 9;
        const damping = this.reducedMotion ? 1 : 1 - Math.exp(-delta * fadeRate);
        this.scrollCueVisibility = THREE.MathUtils.lerp(
            this.scrollCueVisibility,
            this.scrollCueTargetVisibility,
            damping,
        );
        this.scrollCueOutlineMaterial.opacity = 0.52 * this.scrollCueVisibility;
        this.scrollCueGroup.position.y =
            this.scrollCueBaseY - (1 - this.scrollCueVisibility) * SCROLL_CUE_REVEAL_OFFSET;

        if (this.scrollCueTargetVisibility <= 0 && this.scrollCueVisibility < 0.01) {
            this.scrollCueVisibility = 0;
            this.scrollCueGroup.visible = false;
        }
    }

    private updateMouseScrollCue(elapsed: number): void {
        const dot = this.scrollCueDot;
        if (!this.scrollCueGroup.visible || !dot) {
            return;
        }

        if (this.reducedMotion) {
            dot.position.y = 18;
            this.setScrollCueSatellitePosition(this.scrollCuePrimarySatellite, 0);
            this.setScrollCueSatellitePosition(this.scrollCueSecondarySatellite, 0.5);
            this.scrollCueDotMaterial.opacity = 0.72 * this.scrollCueVisibility;
            this.scrollCuePrimarySatelliteMaterial.opacity = 0.78 * this.scrollCueVisibility;
            this.scrollCueSecondarySatelliteMaterial.opacity = 0.56 * this.scrollCueVisibility;
            return;
        }

        const progress = (elapsed % 1.8) / 1.8;
        const easedProgress = progress * progress * (3 - 2 * progress);
        dot.position.y = THREE.MathUtils.lerp(18, -2, easedProgress);
        this.scrollCueDotMaterial.opacity =
            Math.sin(progress * Math.PI) * 0.82 * this.scrollCueVisibility;
        const orbitProgress = (elapsed % 5.8) / 5.8;
        this.setScrollCueSatellitePosition(this.scrollCuePrimarySatellite, orbitProgress);
        this.setScrollCueSatellitePosition(
            this.scrollCueSecondarySatellite,
            (orbitProgress + 0.5) % 1,
        );
        this.scrollCuePrimarySatelliteMaterial.opacity = 0.78 * this.scrollCueVisibility;
        this.scrollCueSecondarySatelliteMaterial.opacity = 0.56 * this.scrollCueVisibility;
    }

    private setScrollCueSatellitePosition(
        satellite: THREE.Mesh | undefined,
        progress: number,
    ): void {
        if (!satellite || this.scrollCuePathLength <= 0) {
            return;
        }

        const targetDistance = progress * this.scrollCuePathLength;
        let segmentIndex = 1;
        while (
            segmentIndex < this.scrollCuePathDistances.length - 1 &&
            this.scrollCuePathDistances[segmentIndex] < targetDistance
        ) {
            segmentIndex++;
        }
        const segmentStart = this.scrollCuePathDistances[segmentIndex - 1];
        const segmentEnd = this.scrollCuePathDistances[segmentIndex];
        const segmentProgress =
            segmentEnd > segmentStart
                ? (targetDistance - segmentStart) / (segmentEnd - segmentStart)
                : 0;
        const start = this.scrollCuePathPoints[segmentIndex - 1];
        const end = this.scrollCuePathPoints[segmentIndex % this.scrollCuePathPoints.length];
        satellite.position.lerpVectors(start, end, segmentProgress);
        satellite.position.z = 1;
    }

    private createCursor(): void {
        const coreGlow = new THREE.Mesh(new THREE.CircleGeometry(7.5, 32), this.glowMaterial);
        const coreDot = new THREE.Mesh(new THREE.CircleGeometry(2.35, 32), this.coreMaterial);
        this.core.add(coreGlow, coreDot);

        const halo = new THREE.Mesh(new THREE.RingGeometry(18.5, 19.5, 80), this.orbitMaterial);
        const satelliteGeometry = new THREE.CircleGeometry(1.15, 16);
        const satelliteA = new THREE.Mesh(satelliteGeometry, this.satelliteMaterial);
        const satelliteB = new THREE.Mesh(satelliteGeometry, this.satelliteMaterial);
        satelliteA.position.set(19, 0, 0);
        satelliteB.position.set(-19, 0, 0);
        satelliteA.scale.setScalar(1.05);
        satelliteB.scale.setScalar(0.62);

        this.ring.add(halo, satelliteA, satelliteB);
        this.orbit.add(this.ring);
        this.createPanCursor();
        if (!this.reducedMotion) {
            this.createWake();
        }
        this.core.visible = false;
        this.orbit.visible = false;
        this.scene.add(this.core, this.orbit);
    }

    private createPanCursor(): void {
        const anchorHalo = new THREE.Mesh(
            new THREE.RingGeometry(11.7, 12.5, 64),
            this.panAnchorMaterial,
        );
        const anchorCore = new THREE.Mesh(
            new THREE.RingGeometry(3.1, 3.8, 32),
            this.panAnchorMaterial,
        );
        const arrowGeometry = new THREE.BufferGeometry();
        arrowGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute([-3.4, -2.4, 0, 3.4, -2.4, 0, 0, 3.2, 0], 3),
        );

        const upArrow = new THREE.Mesh(arrowGeometry, this.panUpMaterial);
        const downArrow = new THREE.Mesh(arrowGeometry.clone(), this.panDownMaterial);
        upArrow.position.y = 19;
        downArrow.position.y = -19;
        downArrow.rotation.z = Math.PI;

        this.panAnchor.add(anchorHalo, anchorCore, upArrow, downArrow);
        this.panAnchor.visible = false;
        this.panAnchor.renderOrder = 3;

        this.panLineGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(this.panLinePositions, 3).setUsage(THREE.DynamicDrawUsage),
        );
        this.panLine.visible = false;
        this.panLine.frustumCulled = false;
        this.panLine.renderOrder = 2;
        this.scene.add(this.panLine, this.panAnchor);
    }

    private createWake(): void {
        const geometry = new THREE.BufferGeometry();
        const uv = new Float32Array(WAKE_POINT_COUNT * 2 * 2);
        const indices = new Uint16Array((WAKE_POINT_COUNT - 1) * 6);

        for (let i = 0; i < WAKE_POINT_COUNT; i++) {
            const trailProgress = i / (WAKE_POINT_COUNT - 1);
            const uvOffset = i * 4;
            uv[uvOffset] = 0;
            uv[uvOffset + 1] = trailProgress;
            uv[uvOffset + 2] = 1;
            uv[uvOffset + 3] = trailProgress;

            if (i === WAKE_POINT_COUNT - 1) {
                continue;
            }
            const vertexOffset = i * 2;
            const indexOffset = i * 6;
            indices[indexOffset] = vertexOffset;
            indices[indexOffset + 1] = vertexOffset + 2;
            indices[indexOffset + 2] = vertexOffset + 1;
            indices[indexOffset + 3] = vertexOffset + 1;
            indices[indexOffset + 4] = vertexOffset + 2;
            indices[indexOffset + 5] = vertexOffset + 3;
        }

        this.wakePositionAttribute = new THREE.BufferAttribute(this.wakeVertices, 3).setUsage(
            THREE.DynamicDrawUsage,
        );
        geometry.setAttribute('position', this.wakePositionAttribute);
        geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uOpacity: { value: 0 },
                uSpeedFactor: { value: 0 },
                uTime: { value: 0 },
            },
            vertexShader: wakeVertexShader,
            fragmentShader: wakeFragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        });

        this.wake = new THREE.Mesh(geometry, material);
        this.wake.frustumCulled = false;
        this.wake.renderOrder = -1;
        this.wake.visible = false;
        this.scene.add(this.wake);
    }

    private updateWake(delta: number, elapsed: number): void {
        const wake = this.wake;
        const positionAttribute = this.wakePositionAttribute;
        if (!wake || !positionAttribute) {
            return;
        }

        const x = this.orbit.position.x;
        const y = this.orbit.position.y;
        if (!this.wakeInitialized) {
            this.resetWake(x, y);
            return;
        }

        const frameDelta = Math.min(Math.max(delta, 1 / 240), 1 / 20);
        const frameX = x - this.wakePreviousX;
        const frameY = y - this.wakePreviousY;
        const frameDistance = Math.sqrt(frameX * frameX + frameY * frameY);

        if (frameDistance > 240) {
            this.resetWake(x, y);
            return;
        }

        this.wakePreviousX = x;
        this.wakePreviousY = y;

        if (frameDistance > 0.01) {
            const inverseDistance = 1 / frameDistance;
            this.wakeDirectionX = frameX * inverseDistance;
            this.wakeDirectionY = frameY * inverseDistance;
        }

        const rawSpeed = Math.min(frameDistance / frameDelta, 1400);
        const speedDamping = 1 - Math.exp(-frameDelta * 12);
        this.wakeSpeed += (rawSpeed - this.wakeSpeed) * speedDamping;
        const speedFactor = THREE.MathUtils.clamp((this.wakeSpeed - 18) / 1180, 0, 1);

        if (rawSpeed > 12) {
            const targetEnergy = 0.35 + speedFactor * 0.65;
            const energyDamping = 1 - Math.exp(-frameDelta * 18);
            this.wakeEnergy += (targetEnergy - this.wakeEnergy) * energyDamping;
        } else {
            this.wakeEnergy = Math.max(0, this.wakeEnergy - frameDelta / WAKE_FADE_SECONDS);
        }

        if (this.wakeEnergy <= 0 && rawSpeed <= 12) {
            wake.visible = false;
            return;
        }

        const cursorRadius = 19.5 * this.ring.scale.x;
        const gap = cursorRadius + 4 + speedFactor * 2;
        const headX = x - this.wakeDirectionX * gap;
        const headY = y - this.wakeDirectionY * gap;
        this.wakePoints[0] = headX;
        this.wakePoints[1] = headY;

        const followRate = 74 - speedFactor * 16;
        const follow = 1 - Math.exp(-frameDelta * followRate);
        for (let i = 1; i < WAKE_POINT_COUNT; i++) {
            const pointOffset = i * 2;
            const previousOffset = pointOffset - 2;
            this.wakePoints[pointOffset] +=
                (this.wakePoints[previousOffset] - this.wakePoints[pointOffset]) * follow;
            this.wakePoints[pointOffset + 1] +=
                (this.wakePoints[previousOffset + 1] - this.wakePoints[pointOffset + 1]) * follow;
        }

        const lengthScale = 0.82 + speedFactor * 0.28;
        const halfWidth = 9 + speedFactor * 1.5;
        for (let i = 0; i < WAKE_POINT_COUNT; i++) {
            const pointOffset = i * 2;
            const previousIndex = Math.max(0, i - 1);
            const nextIndex = Math.min(WAKE_POINT_COUNT - 1, i + 1);
            const previousOffset = previousIndex * 2;
            const nextOffset = nextIndex * 2;

            const centerX = headX + (this.wakePoints[pointOffset] - headX) * lengthScale;
            const centerY = headY + (this.wakePoints[pointOffset + 1] - headY) * lengthScale;
            const previousX = headX + (this.wakePoints[previousOffset] - headX) * lengthScale;
            const previousY = headY + (this.wakePoints[previousOffset + 1] - headY) * lengthScale;
            const nextX = headX + (this.wakePoints[nextOffset] - headX) * lengthScale;
            const nextY = headY + (this.wakePoints[nextOffset + 1] - headY) * lengthScale;

            const tangentX = nextX - previousX;
            const tangentY = nextY - previousY;
            const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
            const inverseTangent = tangentLength > 0.001 ? 1 / tangentLength : 0;
            const normalX =
                tangentLength > 0.001 ? -tangentY * inverseTangent : -this.wakeDirectionY;
            const normalY = tangentLength > 0.001 ? tangentX * inverseTangent : this.wakeDirectionX;

            const trailProgress = i / (WAKE_POINT_COUNT - 1);
            const headTaper = Math.min(1, trailProgress / 0.2);
            const tailTaper = Math.min(1, (1 - trailProgress) / 0.42);
            const pointWidth = halfWidth * headTaper * tailTaper * tailTaper;
            const vertexOffset = i * 6;

            this.wakeVertices[vertexOffset] = centerX - normalX * pointWidth;
            this.wakeVertices[vertexOffset + 1] = centerY - normalY * pointWidth;
            this.wakeVertices[vertexOffset + 2] = -1;
            this.wakeVertices[vertexOffset + 3] = centerX + normalX * pointWidth;
            this.wakeVertices[vertexOffset + 4] = centerY + normalY * pointWidth;
            this.wakeVertices[vertexOffset + 5] = -1;
        }

        positionAttribute.needsUpdate = true;
        wake.material.uniforms.uTime.value = elapsed;
        wake.material.uniforms.uSpeedFactor.value = speedFactor;
        wake.material.uniforms.uOpacity.value = this.wakeEnergy * (0.305 + speedFactor * 0.235);
        this.wakeWarmupFrames++;
        wake.visible = this.wakeWarmupFrames >= 2;
    }

    private resetWake(x: number, y: number): void {
        const gap = 19.5 * this.ring.scale.x + 4;
        const startX = x - this.wakeDirectionX * gap;
        const startY = y - this.wakeDirectionY * gap;
        for (let i = 0; i < WAKE_POINT_COUNT; i++) {
            const offset = i * 2;
            this.wakePoints[offset] = startX;
            this.wakePoints[offset + 1] = startY;
        }
        this.wakePreviousX = x;
        this.wakePreviousY = y;
        this.wakeSpeed = 0;
        this.wakeEnergy = 0;
        this.wakeWarmupFrames = 0;
        this.wakeInitialized = true;
        if (this.wake) {
            this.wake.visible = false;
        }
    }

    private hideWake(): void {
        if (this.wake) {
            this.wake.visible = false;
        }
        this.wakeInitialized = false;
        this.wakeSpeed = 0;
        this.wakeEnergy = 0;
        this.wakeWarmupFrames = 0;
    }

    private updateAutoScroll(delta: number, elapsed: number): void {
        const controller = this.autoScroll;
        if (!controller) {
            return;
        }

        const displacementY = this.pointerClientY - this.panAnchorClientY;
        const distance = Math.abs(displacementY);
        const activeDistance = Math.max(0, distance - PAN_DEAD_ZONE);
        const direction = Math.sign(displacementY);
        const speed = direction * Math.min(PAN_MAX_SPEED, Math.pow(activeDistance / 64, 1.2) * 720);
        const maxPosition = Math.max(0, controller.getMaxPosition());
        const currentPosition = controller.getPosition();
        const nextPosition = THREE.MathUtils.clamp(
            currentPosition + speed * Math.min(delta, 1 / 20),
            0,
            maxPosition,
        );
        const canMove =
            (speed < 0 && currentPosition > 0) || (speed > 0 && currentPosition < maxPosition);

        if (canMove && Math.abs(nextPosition - currentPosition) > 0.01) {
            controller.setPosition(nextPosition);
        }

        const anchorX = this.panAnchorClientX - document.documentElement.clientWidth * 0.5;
        const anchorY = document.documentElement.clientHeight * 0.5 - this.panAnchorClientY;
        const pointerX = this.pointerClientX - document.documentElement.clientWidth * 0.5;
        const pointerY = document.documentElement.clientHeight * 0.5 - this.pointerClientY;
        this.panLinePositions[0] = anchorX;
        this.panLinePositions[1] = anchorY;
        this.panLinePositions[2] = -0.5;
        this.panLinePositions[3] = pointerX;
        this.panLinePositions[4] = pointerY;
        this.panLinePositions[5] = -0.5;
        const linePosition = this.panLineGeometry.getAttribute('position') as THREE.BufferAttribute;
        linePosition.needsUpdate = true;

        const speedFactor = THREE.MathUtils.clamp(activeDistance / 150, 0, 1);
        this.panLineMaterial.opacity = activeDistance > 0 ? 0.12 + speedFactor * 0.34 : 0.06;
        const activeOpacity = canMove ? 0.96 : 0.38;
        this.panUpMaterial.opacity = speed < 0 ? activeOpacity : speed === 0 ? 0.44 : 0.2;
        this.panDownMaterial.opacity = speed > 0 ? activeOpacity : speed === 0 ? 0.44 : 0.2;
        this.panAnchorMaterial.opacity = 0.48 + speedFactor * 0.18;

        if (!this.reducedMotion) {
            this.panAnchor.rotation.z = Math.sin(elapsed * 1.7) * 0.025;
        }
    }

    private startAutoScroll(event: PointerEvent): void {
        if (!this.autoScroll || this.autoScroll.getMaxPosition() <= 0) {
            return;
        }

        event.preventDefault();
        this.setNativeScrollbarActive(false);
        this.releasePointer();
        this.panning = true;
        this.active = true;
        this.panAnchorClientX = event.clientX;
        this.panAnchorClientY = event.clientY;
        this.pointerClientX = event.clientX;
        this.pointerClientY = event.clientY;

        const x = event.clientX - document.documentElement.clientWidth * 0.5;
        const y = document.documentElement.clientHeight * 0.5 - event.clientY;
        this.core.position.set(x, y, 0);
        this.orbit.position.set(x, y, 0);
        this.panAnchor.position.set(x, y, 0);
        this.panAnchor.rotation.z = 0;
        this.panAnchor.scale.setScalar(this.reducedMotion ? 1 : 0.72);
        this.panAnchor.visible = true;
        this.panLine.visible = true;
        gsap.set([this.core, this.orbit], { visible: true });
        gsap.killTweensOf(this.panAnchor.scale);
        gsap.to(this.panAnchor.scale, {
            x: 1,
            y: 1,
            duration: this.reducedMotion ? 0.01 : 0.28,
            ease: 'back.out(1.8)',
        });
        gsap.killTweensOf(this.ring.scale);
        gsap.to(this.ring.scale, {
            x: 0.82,
            y: 0.82,
            duration: this.reducedMotion ? 0.01 : 0.2,
            ease: 'power3.out',
        });
        this.setHoverState(false);
        this.setCursorLabelActive(false);
        this.hideWake();
    }

    private stopAutoScroll(): void {
        if (!this.panning) {
            return;
        }

        this.panning = false;
        this.panAnchor.visible = false;
        this.panLine.visible = false;
        this.panLineMaterial.opacity = 0.08;
        this.panUpMaterial.opacity = 0.32;
        this.panDownMaterial.opacity = 0.32;
        this.panAnchorMaterial.opacity = 0.5;
        this.setCursorLabelActive(this.active);

        const hovering = this.domHovering || this.sceneHovering;
        this.setHoverState(hovering);
        gsap.killTweensOf(this.ring.scale);
        gsap.to(this.ring.scale, {
            x: hovering ? 1.55 : 1,
            y: hovering ? 1.55 : 1,
            duration: this.reducedMotion ? 0.01 : 0.24,
            ease: 'power3.out',
        });
    }

    private setHoverState(hovering: boolean): void {
        if (this.hovering === hovering) {
            return;
        }
        this.hovering = hovering;

        if (!this.pressed) {
            gsap.killTweensOf(this.ring.scale);
            gsap.to(this.ring.scale, {
                x: hovering ? 1.55 : 1,
                y: hovering ? 1.55 : 1,
                duration: this.reducedMotion ? 0.01 : 0.38,
                ease: 'back.out(1.8)',
            });
        }
        gsap.to(this.coreMaterial.color, {
            r: hovering ? CORE_HOVER_COLOR.r : CORE_IDLE_COLOR.r,
            g: hovering ? CORE_HOVER_COLOR.g : CORE_IDLE_COLOR.g,
            b: hovering ? CORE_HOVER_COLOR.b : CORE_IDLE_COLOR.b,
            duration: 0.28,
        });
        gsap.to(this.orbitMaterial, {
            opacity: hovering ? 0.95 : 0.72,
            duration: 0.28,
        });
    }

    private readonly handlePointerMove = (event: PointerEvent): void => {
        if (!this.panning && this.isScrollbarPointer(event)) {
            this.setNativeScrollbarActive(true);
            return;
        }
        if (this.nativeScrollbarActive) {
            this.setNativeScrollbarActive(false);
        }

        const x = event.clientX - document.documentElement.clientWidth * 0.5;
        const y = document.documentElement.clientHeight * 0.5 - event.clientY;
        this.pointerClientX = event.clientX;
        this.pointerClientY = event.clientY;

        if (!this.active) {
            this.active = true;
            this.core.position.set(x, y, 0);
            this.orbit.position.set(x, y, 0);
            gsap.set([this.core, this.orbit], { visible: true });
            this.setCursorLabelActive(true);
        }

        this.setCoreX?.(x);
        this.setCoreY?.(y);
        this.setOrbitX?.(x);
        this.setOrbitY?.(y);

        if (!this.panning && event.target !== this.lastPointerTarget) {
            this.lastPointerTarget = event.target;
            this.domHovering =
                event.target instanceof Element &&
                event.target.closest(INTERACTIVE_SELECTOR) !== null;
        }
        if (!this.panning) {
            this.setHoverState(this.domHovering || this.sceneHovering);
        }
    };

    private readonly handleSceneHover = (event: Event): void => {
        this.sceneHovering = (event as CustomEvent<boolean>).detail;
        if (!this.panning) {
            this.setHoverState(this.domHovering || this.sceneHovering);
        }
    };

    private readonly handlePointerDown = (event: PointerEvent): void => {
        if (this.isScrollbarPointer(event)) {
            this.setNativeScrollbarActive(true);
            return;
        }

        if (event.button === 1) {
            if (this.panning) {
                event.preventDefault();
                this.stopAutoScroll();
                return;
            }

            const target = event.target;
            const preservesNativeMiddleClick =
                target instanceof Element &&
                target.closest(
                    'a, button, input, textarea, select, option, summary, ' +
                        "[contenteditable], [draggable='true']",
                ) !== null;

            if (preservesNativeMiddleClick) {
                return;
            }
            this.startAutoScroll(event);
            return;
        }

        if (this.panning) {
            this.stopAutoScroll();
        }
        if (event.button !== 0) {
            return;
        }

        const target = event.target;
        if (target instanceof Element && 'setPointerCapture' in target) {
            (
                target as Element & {
                    setPointerCapture(pointerId: number): void;
                }
            ).setPointerCapture(event.pointerId);
        }

        this.pressed = true;
        gsap.killTweensOf(this.ring.scale);
        gsap.to(this.ring.scale, {
            x: 0.86,
            y: 0.86,
            duration: 0.12,
            ease: 'power2.out',
        });
        gsap.to(this.coreMaterial, { opacity: 0.72, duration: 0.1 });
        gsap.to(this.glowMaterial, { opacity: 0.38, duration: 0.12 });
    };

    private readonly handlePointerUp = (event: PointerEvent): void => {
        if (this.nativeScrollbarActive) {
            return;
        }
        if (event.button !== 0) {
            return;
        }
        this.releasePointer();
    };

    private readonly handlePointerCancel = (): void => {
        this.setNativeScrollbarActive(false);
        this.stopAutoScroll();
        this.releasePointer();
        this.active = false;
        this.hideWake();
        this.setCursorLabelActive(false);
        this.setHoverState(false);
        gsap.set([this.core, this.orbit], { visible: false });
    };

    private isScrollbarPointer(event: PointerEvent): boolean {
        const root = document.documentElement;
        const hasVerticalScrollbar = root.scrollHeight > root.clientHeight;
        const hasHorizontalScrollbar = root.scrollWidth > root.clientWidth;

        if (
            (hasVerticalScrollbar && event.clientX >= root.clientWidth) ||
            (hasHorizontalScrollbar && event.clientY >= root.clientHeight)
        ) {
            return true;
        }

        const target = event.target;
        if (!(target instanceof HTMLElement) || target === root) {
            return false;
        }

        const bounds = target.getBoundingClientRect();
        const verticalScrollbarStart = bounds.left + target.clientLeft + target.clientWidth;
        const horizontalScrollbarStart = bounds.top + target.clientTop + target.clientHeight;

        return (
            (target.scrollHeight > target.clientHeight &&
                event.clientX >= verticalScrollbarStart &&
                event.clientX <= bounds.right) ||
            (target.scrollWidth > target.clientWidth &&
                event.clientY >= horizontalScrollbarStart &&
                event.clientY <= bounds.bottom)
        );
    }

    private setNativeScrollbarActive(active: boolean): void {
        if (this.nativeScrollbarActive === active) {
            return;
        }

        this.nativeScrollbarActive = active;
        document.documentElement.classList.toggle('is-native-scrollbar-active', active);

        if (active) {
            this.stopAutoScroll();
            this.releasePointer();
            this.active = false;
            this.hideWake();
            this.setCursorLabelActive(false);
            this.setHoverState(false);
            gsap.set([this.core, this.orbit], { visible: false });
        }
    }

    private readonly handleAuxClick = (event: MouseEvent): void => {
        if (event.button === 1 && this.panning) {
            event.preventDefault();
        }
    };

    private readonly handleWheel = (): void => {
        this.stopAutoScroll();
    };

    private readonly handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
            this.stopAutoScroll();
        }
    };

    private releasePointer(): void {
        if (!this.pressed) {
            return;
        }
        this.pressed = false;
        const scale = this.hovering ? 1.55 : 1;
        gsap.killTweensOf(this.ring.scale);
        gsap.to(this.ring.scale, {
            x: scale,
            y: scale,
            duration: this.reducedMotion ? 0.01 : 0.2,
            ease: 'power3.out',
        });
        gsap.to(this.coreMaterial, { opacity: 1, duration: 0.2 });
        gsap.to(this.glowMaterial, { opacity: 0.22, duration: 0.24 });
    }

    private readonly handleDragStart = (event: DragEvent): void => {
        const target = event.target;
        const explicitlyDraggable =
            target instanceof Element && target.closest("[draggable='true']") !== null;

        if (!explicitlyDraggable) {
            event.preventDefault();
            return;
        }

        this.pressed = true;
        this.active = true;
        gsap.set([this.core, this.orbit], { visible: true });
        this.setCursorLabelActive(true);
    };

    private readonly handleDragEnd = (): void => {
        this.releasePointer();
    };

    private readonly handlePointerOut = (event: PointerEvent): void => {
        if (this.nativeScrollbarActive) {
            return;
        }
        if (this.pressed || this.panning) {
            return;
        }
        if (event.relatedTarget !== null) {
            return;
        }
        this.active = false;
        this.hideWake();
        this.setCursorLabelActive(false);
        this.setHoverState(false);
        gsap.set([this.core, this.orbit], { visible: false });
    };

    private readonly resize = (): void => {
        if (!this.renderer) {
            return;
        }

        const width = document.documentElement.clientWidth;
        const height = document.documentElement.clientHeight;
        this.renderer.setSize(width, height, false);
        this.camera.left = -width * 0.5;
        this.camera.right = width * 0.5;
        this.camera.top = height * 0.5;
        this.camera.bottom = -height * 0.5;
        this.camera.near = -10;
        this.camera.far = 10;
        this.camera.updateProjectionMatrix();
        const scrollCueBottom = THREE.MathUtils.clamp(height * 0.06, 32, 72);
        this.scrollCueBaseY = -height * 0.5 + scrollCueBottom + 31;
        this.scrollCueGroup.position.set(
            0,
            this.scrollCueBaseY - (1 - this.scrollCueVisibility) * SCROLL_CUE_REVEAL_OFFSET,
            0,
        );

        if (this.panning) {
            this.panAnchor.position.set(
                this.panAnchorClientX - width * 0.5,
                height * 0.5 - this.panAnchorClientY,
                0,
            );
        }
    };

    private static createMaterial(
        color: THREE.ColorRepresentation,
        opacity: number,
    ): THREE.MeshBasicMaterial {
        return new THREE.MeshBasicMaterial({
            color,
            opacity,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        });
    }
}
