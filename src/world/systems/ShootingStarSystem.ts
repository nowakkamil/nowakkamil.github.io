import * as THREE from 'three';

import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { compileShaderMaterials } from '../rendering/compileShaderMaterials';
import { BLOOM_LAYER } from './SelectiveBloomSystem';

import trailVertexShader from '../shaders/starTrail/vertex.glsl';
import trailFragmentShader from '../shaders/starTrail/fragment.glsl';
import glowVertexShader from '../shaders/starGlow/vertex.glsl';
import glowFragmentShader from '../shaders/starGlow/fragment.glsl';

type ShootingStarContext = 'experience' | 'projects';
type HorizontalSide = -1 | 1;

type ShootingStar = {
    glow: THREE.Mesh;
    line: THREE.Line;
    glowMaterial: THREE.ShaderMaterial;
    lineMaterial: THREE.ShaderMaterial;
    position: THREE.Vector2;
    direction: THREE.Vector2;
    age: number;
    duration: number;
    length: number;
    active: boolean;
};

const TRAIL_SEGMENTS = 18;
const STAR_DEPTH = 64;

const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3);

/**
 * A small camera-space meteor layer used only through the experience and
 * projects chapters. Keeping the pool tiny makes the effect feel incidental,
 * rather than turning the portfolio into a constant meteor shower.
 */
export class ShootingStarSystem {
    private readonly group = new THREE.Group();
    private readonly stars: ShootingStar[] = [];
    private readonly camera: THREE.PerspectiveCamera;
    private readonly sideBag: HorizontalSide[] = [];
    private context: ShootingStarContext = 'experience';
    private targetVisibility = 0;
    private visibility = 0;
    private spawnTimer = 0.35;
    private reducedMotion: boolean;
    private compact: boolean;
    private viewportWidth = 1;
    private viewportHeight = 1;

    constructor(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera,
        responsiveConfig: ResponsiveConfig,
    ) {
        this.camera = camera;
        this.reducedMotion = responsiveConfig.reducedMotion;
        this.compact = responsiveConfig.isCompact;
        this.group.name = 'ShootingStars';
        this.group.renderOrder = 100;
        this.group.visible = false;
        scene.add(this.group);

        const starCount = this.compact ? 3 : 4;
        for (let index = 0; index < starCount; index += 1) {
            this.stars.push(this.createStar());
        }
    }

    public setResponsiveConfig(config: ResponsiveConfig): void {
        this.reducedMotion = config.reducedMotion;
        this.compact = config.isCompact;
        if (this.reducedMotion) {
            this.targetVisibility = 0;
        }
    }

    public setViewportSize(width: number, height: number): void {
        this.viewportWidth = Math.max(1, width);
        this.viewportHeight = Math.max(1, height);
    }

    public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
        const star = this.stars[0];
        if (!star) {
            return;
        }

        await compileShaderMaterials(renderer, [star.glowMaterial, star.lineMaterial]);
    }

    public setAppearance(context: ShootingStarContext, visibility: number): void {
        this.context = context;
        const nextVisibility = this.reducedMotion ? 0 : THREE.MathUtils.clamp(visibility, 0, 1);
        this.targetVisibility = nextVisibility;

        if (nextVisibility <= 0.001) {
            this.visibility = 0;
            this.group.visible = false;
            for (const star of this.stars) {
                if (star.active) {
                    this.hide(star);
                }
            }
        }
    }

    public update(delta: number): void {
        this.group.position.copy(this.camera.position);
        this.group.quaternion.copy(this.camera.quaternion);

        const visibilityEase = 1 - Math.exp(-delta * 5);
        this.visibility = THREE.MathUtils.lerp(
            this.visibility,
            this.targetVisibility,
            visibilityEase,
        );
        this.group.visible = this.visibility > 0.002;

        if (!this.group.visible) {
            for (const star of this.stars) {
                if (star.active) {
                    this.hide(star);
                }
            }
            this.spawnTimer = Math.max(this.spawnTimer, 0.4);
            return;
        }

        this.spawnTimer -= delta;
        if (this.spawnTimer <= 0 && this.visibility > 0.18) {
            const availableStar = this.stars.find((star) => !star.active);
            if (availableStar) {
                this.spawn(availableStar);
            }
            this.spawnTimer = this.getNextSpawnDelay();
        }

        for (const star of this.stars) {
            if (!star.active) {
                continue;
            }

            star.age += delta;
            const progress = star.age / star.duration;
            if (progress >= 1) {
                this.hide(star);
                continue;
            }

            const travel = easeOutCubic(progress);
            star.position.addScaledVector(star.direction, delta * (this.compact ? 11 : 13));
            const envelope =
                THREE.MathUtils.smoothstep(progress, 0, 0.14) *
                (1 - THREE.MathUtils.smoothstep(progress, 0.72, 1));
            const opacity = envelope * this.visibility;

            this.updateGeometry(star, travel);
            star.glowMaterial.uniforms.uOpacity.value = opacity * 0.2;
            star.lineMaterial.uniforms.uOpacity.value = opacity * 0.42;
        }
    }

    public dispose(): void {
        this.group.removeFromParent();
        for (const star of this.stars) {
            star.glow.geometry.dispose();
            star.line.geometry.dispose();
            star.glowMaterial.dispose();
            star.lineMaterial.dispose();
        }
    }

    private createStar(): ShootingStar {
        const glowGeometry = this.createGlowGeometry();
        const glowMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uOpacity: { value: 0 },
            },
            vertexShader: glowVertexShader,
            fragmentShader: glowFragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            toneMapped: false,
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.frustumCulled = false;
        glow.renderOrder = 100;
        glow.layers.enable(BLOOM_LAYER);
        this.group.add(glow);

        const trailPositions = new Float32Array(TRAIL_SEGMENTS * 3);
        const trailProgress = new Float32Array(TRAIL_SEGMENTS);
        for (let index = 0; index < TRAIL_SEGMENTS; index += 1) {
            trailProgress[index] = index / (TRAIL_SEGMENTS - 1);
        }

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage),
        );
        lineGeometry.setAttribute('aTrail', new THREE.BufferAttribute(trailProgress, 1));
        const lineMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uOpacity: { value: 0 },
            },
            vertexShader: trailVertexShader,
            fragmentShader: trailFragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.frustumCulled = false;
        line.renderOrder = 101;
        line.layers.enable(BLOOM_LAYER);
        this.group.add(line);

        return {
            glow,
            line,
            glowMaterial,
            lineMaterial,
            position: new THREE.Vector2(),
            direction: new THREE.Vector2(),
            age: 0,
            duration: 1,
            length: 5,
            active: false,
        };
    }

    private createGlowGeometry(): THREE.BufferGeometry {
        const positions = new Float32Array(TRAIL_SEGMENTS * 2 * 3);
        const trailProgress = new Float32Array(TRAIL_SEGMENTS * 2);
        const across = new Float32Array(TRAIL_SEGMENTS * 2);
        const indices = new Uint16Array((TRAIL_SEGMENTS - 1) * 6);

        for (let index = 0; index < TRAIL_SEGMENTS; index += 1) {
            const vertexIndex = index * 2;
            const progress = index / (TRAIL_SEGMENTS - 1);
            trailProgress[vertexIndex] = progress;
            trailProgress[vertexIndex + 1] = progress;
            across[vertexIndex] = -1;
            across[vertexIndex + 1] = 1;

            if (index === TRAIL_SEGMENTS - 1) {
                continue;
            }
            const indexOffset = index * 6;
            indices[indexOffset] = vertexIndex;
            indices[indexOffset + 1] = vertexIndex + 1;
            indices[indexOffset + 2] = vertexIndex + 2;
            indices[indexOffset + 3] = vertexIndex + 1;
            indices[indexOffset + 4] = vertexIndex + 3;
            indices[indexOffset + 5] = vertexIndex + 2;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
        );
        geometry.setAttribute('aTrail', new THREE.BufferAttribute(trailProgress, 1));
        geometry.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        return geometry;
    }

    private spawn(star: ShootingStar): void {
        const aspect = this.viewportWidth / this.viewportHeight;
        const halfHeight = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * STAR_DEPTH;
        const halfWidth = halfHeight * aspect;
        const spawnSide = this.getNextSpawnSide();
        star.position.copy(this.sampleSpawnPosition(halfWidth, halfHeight, spawnSide));

        const angleDegrees =
            spawnSide === 1
                ? THREE.MathUtils.lerp(195, 255, Math.random())
                : THREE.MathUtils.lerp(285, 345, Math.random());
        const angle = THREE.MathUtils.degToRad(angleDegrees);
        star.direction.set(Math.cos(angle), Math.sin(angle));
        star.age = 0;
        star.duration = THREE.MathUtils.lerp(0.85, 1.25, Math.random());
        star.length = THREE.MathUtils.lerp(
            this.compact ? 5 : 6.5,
            this.compact ? 7.5 : 9.5,
            Math.random(),
        );
        star.active = true;
        star.glow.visible = true;
        star.line.visible = true;
        this.updateGeometry(star, 0);
    }

    /**
     * Rejection-samples a full-screen probability field. The small non-zero
     * floor means the center remains possible, while the radial curve makes
     * occurrences increasingly likely toward the viewport perimeter.
     */
    private sampleSpawnPosition(
        halfWidth: number,
        halfHeight: number,
        side: HorizontalSide,
    ): THREE.Vector2 {
        const centerSuppressionPower = this.context === 'projects' ? 3.1 : 2.8;

        for (let attempt = 0; attempt < 16; attempt += 1) {
            const normalizedX = side * THREE.MathUtils.lerp(0, 1.05, Math.random());
            const normalizedY = THREE.MathUtils.lerp(-1, 1, Math.random());
            const distanceFromCenter = Math.min(1, Math.hypot(normalizedX / 1.05, normalizedY));
            const probability =
                0.025 + 0.975 * Math.pow(distanceFromCenter, centerSuppressionPower);

            if (Math.random() <= probability || attempt === 15) {
                return new THREE.Vector2(normalizedX * halfWidth, normalizedY * halfHeight);
            }
        }

        return new THREE.Vector2(side * halfWidth, halfHeight);
    }

    /**
     * Uses a shuffled two-item bag so each pair contains one left and one
     * right origin without imposing a predictable alternating order.
     */
    private getNextSpawnSide(): HorizontalSide {
        if (this.sideBag.length === 0) {
            if (Math.random() > 0.5) {
                this.sideBag.push(-1, 1);
            } else {
                this.sideBag.push(1, -1);
            }
        }

        return this.sideBag.pop() ?? 1;
    }

    private updateGeometry(star: ShootingStar, travel: number): void {
        const linePositions = star.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const lineArray = linePositions.array as Float32Array;
        const visibleLength = star.length * Math.min(1, travel * 4 + 0.08);

        for (let index = 0; index < TRAIL_SEGMENTS; index += 1) {
            const trailProgress = index / (TRAIL_SEGMENTS - 1);
            const offset = visibleLength * (1 - trailProgress);
            const arrayIndex = index * 3;
            lineArray[arrayIndex] = star.position.x - star.direction.x * offset;
            lineArray[arrayIndex + 1] = star.position.y - star.direction.y * offset;
            lineArray[arrayIndex + 2] = -STAR_DEPTH;
        }
        linePositions.needsUpdate = true;

        const glowPositions = star.glow.geometry.getAttribute('position') as THREE.BufferAttribute;
        const glowArray = glowPositions.array as Float32Array;
        const normalX = -star.direction.y;
        const normalY = star.direction.x;

        for (let index = 0; index < TRAIL_SEGMENTS; index += 1) {
            const trailProgress = index / (TRAIL_SEGMENTS - 1);
            const offset = visibleLength * (1 - trailProgress);
            const centerX = star.position.x - star.direction.x * offset;
            const centerY = star.position.y - star.direction.y * offset;
            const halfWidth = 0.34;
            const vertexOffset = index * 6;

            glowArray[vertexOffset] = centerX - normalX * halfWidth;
            glowArray[vertexOffset + 1] = centerY - normalY * halfWidth;
            glowArray[vertexOffset + 2] = -STAR_DEPTH - 0.02;
            glowArray[vertexOffset + 3] = centerX + normalX * halfWidth;
            glowArray[vertexOffset + 4] = centerY + normalY * halfWidth;
            glowArray[vertexOffset + 5] = -STAR_DEPTH - 0.02;
        }
        glowPositions.needsUpdate = true;
    }

    private hide(star: ShootingStar): void {
        star.active = false;
        star.glow.visible = false;
        star.line.visible = false;
        star.glowMaterial.uniforms.uOpacity.value = 0;
        star.lineMaterial.uniforms.uOpacity.value = 0;
    }

    private getNextSpawnDelay(): number {
        const baseDelay = this.compact ? 4.2 : 3.4;
        return baseDelay + Math.random() * (this.compact ? 3.2 : 2.8);
    }
}
