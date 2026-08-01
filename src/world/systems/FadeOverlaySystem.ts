import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';

import type { ComponentStore } from '../ecs/ComponentStore';
import type { EntityManager } from '../ecs/EntityManager';
import type { FadeOverlayComponent } from '../ecs/components';
import type { System } from '../ecs/System';
import { createFadeOverlayMaterial } from '../factories/MaterialFactory';
import { createFadeOverlayMesh } from '../factories/SceneObjectFactory';
import {
    clamp01,
    easeOutCubic,
    easeOutQuart,
    easeOutQuint,
    smootherstep,
} from '../../utils/animation';

type IntroState = 'hidden/loading' | 'hyperspaceZoom' | 'settled';

const INTRO_DURATION = 1.85;
const BLACK_HOLD = 0.08;
const REVEAL_DURATION = 1.18;
const MOTION_BLUR_DURATION = 1.25;

const DESKTOP_ZOOM_DISTANCE = -86;
const MOBILE_ZOOM_DISTANCE = -72;

const DESKTOP_FOV_BOOST = 10;
const MOBILE_FOV_BOOST = 7;

const MAX_DELTA = 1 / 30;
const BLUR_OPACITY_REDUCTION = 0.42;

export class FadeOverlaySystem implements System {
    private readonly overlays: ComponentStore<FadeOverlayComponent>;
    private readonly overlay: FadeOverlayComponent;
    private readonly camera: THREE.PerspectiveCamera;
    private responsiveConfig: ResponsiveConfig;

    private readonly finalPosition = new THREE.Vector3();
    private readonly finalQuaternion = new THREE.Quaternion();

    private readonly blackoutElement: HTMLElement | null;

    private state: IntroState = 'hidden/loading';
    private introRequested = false;
    private coverDomDuringReveal = false;
    private introElapsed = 0;
    private onSettled: (() => void) | undefined;

    private finalFov = 50;
    private startFov = 50;
    private zoomDistance = DESKTOP_ZOOM_DISTANCE;

    private scrollLocked = false;
    private scrollLayoutLocked = false;
    private previousBodyPosition = '';
    private previousBodyTop = '';
    private previousBodyWidth = '';
    private previousHtmlOverflow = '';
    private bodyPositionLocked = false;

    private readonly preventScroll = (event: Event): void => {
        event.preventDefault();
    };

    private readonly preventScrollKeys = (event: KeyboardEvent): void => {
        const blockedKeys = new Set([
            ' ',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'PageUp',
            'PageDown',
            'Home',
            'End',
        ]);

        if (blockedKeys.has(event.key)) {
            event.preventDefault();
        }
    };

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        entities: EntityManager,
        overlays: ComponentStore<FadeOverlayComponent>,
        responsiveConfig: ResponsiveConfig,
    ) {
        this.resetScrollToTop();

        this.overlays = overlays;
        this.camera = camera;
        this.responsiveConfig = responsiveConfig;
        this.blackoutElement = document.getElementById('intro-blackout');

        const material = createFadeOverlayMaterial();

        const entity = entities.create();

        this.overlay = overlays.add(entity, {
            value: 1,
            material,
        });

        scene.add(createFadeOverlayMesh(material));

        material.uniforms.uFade.value = 1;
    }

    public setFade(value: number, immediate = false): void {
        if (this.state !== 'settled') {
            return;
        }

        const fade = THREE.MathUtils.clamp(value, 0, 1.2);

        this.overlay.value = fade;
        if (immediate) {
            this.overlay.material.uniforms.uFade.value = fade;
        }

        if (this.blackoutElement) {
            if (fade > 0) {
                this.showBlackout(clamp01(fade));
            } else {
                this.releaseInitialBlackout();
            }
        }
    }

    public startHyperspaceZoom(onSettled?: () => void): void {
        if (this.state === 'settled') {
            this.state = 'hidden/loading';
            this.coverDomDuringReveal = true;
            this.overlay.value = 1;
            this.overlay.material.uniforms.uFade.value = 1;
            if (this.blackoutElement) {
                this.showBlackout(1);
            }
        }

        if (this.state !== 'hidden/loading') {
            return;
        }

        if (this.responsiveConfig.reducedMotion) {
            this.state = 'settled';
            this.introRequested = false;
            this.introElapsed = 0;
            this.overlay.value = 0;
            this.overlay.material.uniforms.uFade.value = 0;
            this.coverDomDuringReveal = false;
            this.releaseInitialBlackout();
            this.unlockScroll();
            document.documentElement.classList.add('scrollbar-ready');
            onSettled?.();
            return;
        }

        this.onSettled = onSettled;
        this.introRequested = true;
    }

    public setResponsiveConfig(responsiveConfig: ResponsiveConfig): void {
        this.responsiveConfig = responsiveConfig;

        if (responsiveConfig.reducedMotion && this.state === 'hyperspaceZoom') {
            this.settle();
        }
    }

    public setViewportSize(_width: number, _height: number): void {}

    public getMotionBlurDamp(): number {
        if (this.state !== 'hyperspaceZoom') {
            return 0;
        }

        const strength = this.getMotionBlurStrength();

        if (strength <= 0.001) {
            return 0;
        }

        const damp = THREE.MathUtils.lerp(0.84, 0.985, easeOutCubic(strength));

        return damp * strength;
    }

    private getMotionBlurStrength(): number {
        const progress = clamp01(this.introElapsed / MOTION_BLUR_DURATION);
        const fadeOut = 1 - smootherstep(progress);

        return Math.pow(fadeOut, 1.15);
    }

    public update(delta: number, elapsed: number): void {
        const safeDelta = Math.min(delta, MAX_DELTA);

        if (this.state === 'hidden/loading' && this.introRequested) {
            this.beginHyperspaceZoom();
        }

        if (this.state === 'hidden/loading') {
            this.overlay.value = 1;
        } else if (this.state === 'hyperspaceZoom') {
            this.updateHyperspaceZoom(safeDelta);
        }

        for (const [, overlay] of this.overlays.all()) {
            overlay.material.uniforms.uFade.value = overlay.value;
            overlay.material.uniforms.uTime.value = elapsed;
        }
    }

    private beginHyperspaceZoom(): void {
        this.state = 'hyperspaceZoom';
        this.introRequested = false;
        this.introElapsed = 0;

        this.lockScroll();

        this.finalPosition.copy(this.camera.position);
        this.finalQuaternion.copy(this.camera.quaternion);

        this.finalFov = this.camera.fov;

        const isCompact = this.responsiveConfig.isCompact;

        this.zoomDistance = isCompact ? MOBILE_ZOOM_DISTANCE : DESKTOP_ZOOM_DISTANCE;

        const fovBoost = isCompact ? MOBILE_FOV_BOOST : DESKTOP_FOV_BOOST;

        this.startFov = this.finalFov + fovBoost;

        this.overlay.value = 1;
        this.applyIntroCamera(0);

        if (!this.coverDomDuringReveal) {
            this.releaseInitialBlackout();
        }
    }

    private updateHyperspaceZoom(delta: number): void {
        this.introElapsed += delta;

        const progress = clamp01(this.introElapsed / INTRO_DURATION);

        const revealProgress = smootherstep(
            clamp01((this.introElapsed - BLACK_HOLD) / REVEAL_DURATION),
        );

        const travelProgress = easeOutQuint(progress);
        const blurStrength = this.getMotionBlurStrength();

        const visibleStrength = revealProgress * (1 - blurStrength * BLUR_OPACITY_REDUCTION);

        this.overlay.value = 1 - visibleStrength;
        if (this.coverDomDuringReveal && this.blackoutElement) {
            this.blackoutElement.style.opacity = String(clamp01(this.overlay.value));
        }

        this.applyIntroCamera(travelProgress);

        if (progress >= 1) {
            this.settle();
        }
    }

    private applyIntroCamera(travelProgress: number): void {
        const inverseProgress = 1 - travelProgress;
        const distance = this.zoomDistance * inverseProgress;

        this.camera.position.set(
            this.finalPosition.x,
            this.finalPosition.y,
            this.finalPosition.z + distance,
        );

        this.camera.quaternion.copy(this.finalQuaternion);

        const fovProgress = easeOutQuart(travelProgress);

        const nextFov = THREE.MathUtils.lerp(this.startFov, this.finalFov, fovProgress);

        if (Math.abs(this.camera.fov - nextFov) > 0.001) {
            this.camera.fov = nextFov;
            this.camera.updateProjectionMatrix();
        }
    }

    private settle(): void {
        this.state = 'settled';

        this.unlockScroll();

        this.overlay.value = 0;
        this.coverDomDuringReveal = false;
        this.releaseInitialBlackout();

        this.camera.position.copy(this.finalPosition);
        this.camera.quaternion.copy(this.finalQuaternion);

        if (this.camera.fov !== this.finalFov) {
            this.camera.fov = this.finalFov;
            this.camera.updateProjectionMatrix();
        }

        const onSettled = this.onSettled;
        this.onSettled = undefined;
        onSettled?.();
    }

    public lockScroll(resetPosition = true): void {
        if (this.scrollLocked) {
            return;
        }

        this.scrollLocked = true;
        this.scrollLayoutLocked = true;
        this.bodyPositionLocked = resetPosition;

        this.previousHtmlOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';

        if (resetPosition) {
            this.resetScrollToTop();
            this.previousBodyPosition = document.body.style.position;
            this.previousBodyTop = document.body.style.top;
            this.previousBodyWidth = document.body.style.width;

            document.body.style.position = 'fixed';
            document.body.style.top = '0';
            document.body.style.width = '100%';
        }

        window.addEventListener('wheel', this.preventScroll, { passive: false });
        window.addEventListener('touchmove', this.preventScroll, { passive: false });
        window.addEventListener('keydown', this.preventScrollKeys, { passive: false });
    }
    public unlockScroll(): void {
        if (!this.scrollLocked) {
            return;
        }

        this.scrollLocked = false;

        window.removeEventListener('wheel', this.preventScroll);
        window.removeEventListener('touchmove', this.preventScroll);
        window.removeEventListener('keydown', this.preventScrollKeys);

        if (this.scrollLayoutLocked) {
            document.documentElement.style.overflow = this.previousHtmlOverflow;

            if (this.bodyPositionLocked) {
                document.body.style.position = this.previousBodyPosition;
                document.body.style.top = this.previousBodyTop;
                document.body.style.width = this.previousBodyWidth;
                this.resetScrollToTop();
            }

            document.documentElement.classList.add('scrollbar-ready');
        }

        this.scrollLayoutLocked = false;
        this.bodyPositionLocked = false;
    }

    private resetScrollToTop(): void {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }

        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }

    private releaseInitialBlackout(): void {
        if (!this.blackoutElement) {
            return;
        }

        this.blackoutElement.remove();
    }

    private showBlackout(opacity: number): void {
        if (!this.blackoutElement) {
            return;
        }

        if (!this.blackoutElement.isConnected) {
            document.body.prepend(this.blackoutElement);
        }

        this.blackoutElement.style.display = 'block';
        this.blackoutElement.style.opacity = String(opacity);
    }
}
