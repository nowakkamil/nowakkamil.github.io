import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';

import type { ComponentStore } from '../ecs/ComponentStore';
import type { Entity } from '../ecs/Entity';
import type { EntityManager } from '../ecs/EntityManager';
import type {
    MorphComponent,
    PositionComponent,
    RaycastInteractionComponent,
    RenderableComponent,
    ShaderUniformComponent,
} from '../ecs/components';
import type { System } from '../ecs/System';
import {
    createAmbientFloatingParticlesGeometry,
    createAnimatedParticleGeometryFromPositions,
} from '../factories/GeometryFactory';
import {
    createAmbientFloatingParticlesMaterial,
    createEllipsisMaterial,
    createFloatingTextMaterial,
} from '../factories/MaterialFactory';
import { MorphTargets } from './MorphTargets';
import { createCollapseTransitionField } from '../../utils/morph';
import { generateSceneGeometry } from '../workers/generateSceneGeometry';
import type { FloatingTextGeometryData, SceneMorphTargetKey } from '../workers/sceneGeometryTypes';
import { BLOOM_LAYER, type TextBloomState } from './SelectiveBloomSystem';

interface SceneContentSystemOptions {
    scene: THREE.Scene;
    camera: THREE.Camera;
    entities: EntityManager;
    positions: ComponentStore<PositionComponent>;
    morphs: ComponentStore<MorphComponent>;
    renderables: ComponentStore<RenderableComponent>;
    raycastInteractions: ComponentStore<RaycastInteractionComponent>;
    shaderUniforms: ComponentStore<ShaderUniformComponent>;
    mainCloudEntity: Entity;
    mainCloudPositions: Float32Array;
    mainCloudMorphFactor: THREE.BufferAttribute;
    particleCounts: ResponsiveConfig['particles'];
    getScrollProgress: () => number;
    onSceneBuildStart?: () => void;
}

const isTunnelTarget = (key: string): boolean => key === 'tunnel';

export class SceneContentSystem implements System {
    private static readonly textForegroundZ = 8;
    private static readonly textMorphOffsetY = -2.5;
    private static readonly ellipsisBackgroundZ = -3;
    private static readonly ellipsisBackgroundY = -15;

    private readonly targets = new MorphTargets();
    private readonly morphVisualEntities: Entity[] = [];
    private ellipsisEntity?: Entity;
    private pendingMorph?: {
        fromKey: string;
        toKey: string;
        progress: number;
    };
    private textScale = 1;
    private viewportScale = 1;
    private textPositionY = 0;
    private mainTextOffsetY = 0;
    private mainTextRelativeOffsetY = 0;
    private textBloomPresence = 0;
    private textBloomStrengthScale = 1;
    private scrollTextDepthOffset = 0;
    private scrollTextMaterial?: THREE.ShaderMaterial;
    private scrollTextObject?: THREE.Points;
    private readonly mainCloudMaterial?: THREE.ShaderMaterial;
    private readonly textBloomState: TextBloomState;
    private initialized = false;
    private readonly options: SceneContentSystemOptions;

    constructor(options: SceneContentSystemOptions) {
        this.options = options;
        this.morphVisualEntities.push(options.mainCloudEntity);
        const mainCloudObject = options.renderables.get(options.mainCloudEntity)?.object;
        const mainCloudMaterial =
            mainCloudObject instanceof THREE.Points ? mainCloudObject.material : undefined;
        this.mainCloudMaterial =
            mainCloudMaterial instanceof THREE.ShaderMaterial ? mainCloudMaterial : undefined;
        this.textBloomState = {
            object: mainCloudObject,
            material: this.mainCloudMaterial,
            presence: 0,
            visualScale: 1,
            strengthScale: 1,
        };
    }

    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        const { mainCloudPositions, particleCounts } = this.options;

        performance.mark('ecs-content-load-start');

        this.createFloatingParticles();
        const generated = await generateSceneGeometry(
            mainCloudPositions,
            particleCounts,
            this.options.onSceneBuildStart,
        );
        this.createSeparateFloatingParticles(generated.floatingText);
        this.targets.setShape('cloud', mainCloudPositions);
        this.targets.setEllipsis('cloud', generated.ellipsisTargets.cloud);

        for (const key of [
            'name',
            'experience',
            'education',
            'projects',
            'tunnel',
        ] as const satisfies readonly SceneMorphTargetKey[]) {
            const positions = generated.shapeTargets[key];
            this.assertMorphTargetCount(key, positions, mainCloudPositions);
            this.targets.setShape(key, positions);
            this.targets.setEllipsis(key, generated.ellipsisTargets[key]);
        }

        this.registerFirstMorph();
        this.createEllipsis();
        if (this.pendingMorph) {
            const { fromKey, toKey, progress } = this.pendingMorph;
            this.morphToShape(fromKey, toKey, progress);
            this.pendingMorph = undefined;
        }

        performance.mark('ecs-content-load-end');
        performance.measure(
            'ecs-content-load-duration',
            'ecs-content-load-start',
            'ecs-content-load-end',
        );
    }

    public update(_delta: number, _elapsed: number): void {}

    public getTextBloomState(): TextBloomState {
        this.textBloomState.presence = this.textBloomPresence;
        this.textBloomState.visualScale = this.textScale * this.viewportScale;
        this.textBloomState.strengthScale = this.textBloomStrengthScale;
        return this.textBloomState;
    }

    public restartScrollTextReveal(elapsed: number): void {
        const revealStartTime = this.scrollTextMaterial?.uniforms.uRevealStartTime;
        const revealVisibility = this.scrollTextMaterial?.uniforms.uRevealVisibility;
        if (revealStartTime) {
            revealStartTime.value = elapsed;
        }
        if (revealVisibility) {
            revealVisibility.value = 1;
        }
    }

    public morphToShape(fromKey: string, toKey: string, progress: number): void {
        this.updateTextLayerTransform(fromKey, toKey, progress);

        const mainUpdated = this.updateMorph(
            this.options.mainCloudEntity,
            this.targets.getShape(fromKey),
            this.targets.getShape(toKey),
            progress,
        );
        const supportMorphVisible = !isTunnelTarget(toKey);
        const ellipsisUpdated =
            !supportMorphVisible ||
            this.ellipsisEntity === undefined ||
            this.updateMorph(
                this.ellipsisEntity,
                this.targets.getEllipsis(fromKey),
                this.targets.getEllipsis(toKey),
                progress,
            );

        if (!mainUpdated || !ellipsisUpdated) {
            this.pendingMorph = { fromKey, toKey, progress };
        } else {
            this.pendingMorph = undefined;
        }
    }

    private updateTextLayerTransform(fromKey: string, toKey: string, progress: number): void {
        const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
        const foregroundProgress = THREE.MathUtils.smoothstep(clampedProgress, 0.5, 1);
        const foregroundZ = SceneContentSystem.textForegroundZ;
        const textTransitionProgress = THREE.MathUtils.smoothstep(clampedProgress, 0.35, 0.8);
        const textSharpness = isTunnelTarget(toKey)
            ? 0
            : fromKey === 'cloud'
              ? textTransitionProgress
              : toKey === 'cloud'
                ? 1 - textTransitionProgress
                : 1;
        this.textBloomPresence = toKey === 'cloud' ? 1 - clampedProgress : textSharpness;
        let textZ: number;

        if (isTunnelTarget(toKey)) {
            textZ = 0;
            this.mainTextOffsetY = 0;
        } else if (fromKey === 'cloud') {
            textZ = foregroundZ * foregroundProgress;
            this.mainTextOffsetY = SceneContentSystem.textMorphOffsetY * foregroundProgress;
        } else if (toKey === 'cloud') {
            textZ = foregroundZ * (1 - foregroundProgress);
            this.mainTextOffsetY = SceneContentSystem.textMorphOffsetY * (1 - foregroundProgress);
        } else {
            textZ = foregroundZ;
            this.mainTextOffsetY = SceneContentSystem.textMorphOffsetY;
        }

        const mainObject = this.options.renderables.get(this.options.mainCloudEntity)?.object as
            | THREE.Points
            | undefined;
        if (mainObject) {
            mainObject.position.z = textZ;
            mainObject.position.y =
                this.textPositionY + this.mainTextOffsetY + this.mainTextRelativeOffsetY;
        }

        const mainMaterial = mainObject?.material as THREE.ShaderMaterial | undefined;
        if (mainMaterial?.uniforms.uTextSharpness) {
            mainMaterial.uniforms.uTextSharpness.value = textSharpness;
            const blending = THREE.AdditiveBlending;
            if (mainMaterial.blending !== blending) {
                mainMaterial.blending = blending;
                mainMaterial.needsUpdate = true;
            }
        }
    }

    public setTextScale(value: number): void {
        this.textScale = value;
        for (const entity of this.morphVisualEntities) {
            this.options.renderables
                .get(entity)
                ?.object.scale.setScalar(value * this.viewportScale);
        }
    }

    public setViewportSize(width: number): void {
        this.viewportScale = width < 480 ? 0.78 : width < 768 ? 0.88 : 1;
        this.setTextScale(this.textScale);
    }

    public setTextBloomStrengthScale(value: number): void {
        this.textBloomStrengthScale = Math.max(value, 0);
    }

    public setTextPosition(y: number): void {
        this.textPositionY = y;
        for (const entity of this.morphVisualEntities) {
            const object = this.options.renderables.get(entity)?.object;
            if (object) {
                object.position.y =
                    y +
                    (entity === this.options.mainCloudEntity
                        ? this.mainTextOffsetY + this.mainTextRelativeOffsetY
                        : 0);
            }
        }
    }

    public setMainTextRelativeOffsetY(value: number): void {
        this.mainTextRelativeOffsetY = value;
        const mainObject = this.options.renderables.get(this.options.mainCloudEntity)?.object;
        if (mainObject) {
            mainObject.position.y =
                this.textPositionY + this.mainTextOffsetY + this.mainTextRelativeOffsetY;
        }
    }

    public setScrollTextDepthOffset(value: number): void {
        this.scrollTextDepthOffset = value;
        if (this.scrollTextObject) {
            this.scrollTextObject.position.z = value;
        }
    }

    public setTextTilt(progress: number): void {
        const mainObject = this.options.renderables.get(this.options.mainCloudEntity)?.object;
        const interaction = this.options.raycastInteractions.get(this.options.mainCloudEntity);
        if (!mainObject || !interaction) {
            return;
        }

        const cameraPosition = this.options.camera.position;
        const verticalDistance = mainObject.position.y - cameraPosition.y;

        const depth = Math.max(Math.abs(cameraPosition.z), 0.001);
        const downwardFacingAngle = Math.min(
            Math.atan2(verticalDistance, depth),
            THREE.MathUtils.degToRad(16),
        );
        const tiltProgress = THREE.MathUtils.smoothstep(
            THREE.MathUtils.clamp(progress, 0, 1),
            0.62,
            1,
        );

        interaction.baseRotationX = downwardFacingAngle * tiltProgress;
    }

    private registerFirstMorph(): void {
        const cloud = this.targets.getShape('cloud');
        const name = this.targets.getShape('name');
        if (!cloud || !name) {
            throw new Error('Initial morph targets are missing');
        }

        const { mainCloudEntity, mainCloudMorphFactor, morphs } = this.options;

        morphs.add(mainCloudEntity, {
            from: cloud,
            to: name,
            progress: 0,
            lastProgress: -1,
            factorAttribute: mainCloudMorphFactor,
        });
    }

    private assertMorphTargetCount(
        key: string,
        positions: Float32Array,
        sourcePositions: Float32Array,
    ): void {
        if (positions.length !== sourcePositions.length) {
            throw new Error(
                `Morph target "${key}" has ${positions.length / 3} particles, ` +
                    `expected ${sourcePositions.length / 3}.`,
            );
        }
    }

    private createFloatingParticles(): void {
        const entity = this.addPoints(
            createAmbientFloatingParticlesGeometry(this.options.particleCounts.ambient),
            createAmbientFloatingParticlesMaterial(),
            { bindBackgroundVisibility: true },
        );
        const particles = this.options.renderables.get(entity)?.object;
        if (particles) {
            particles.layers.enable(BLOOM_LAYER);
        }
    }

    private createSeparateFloatingParticles(data: FloatingTextGeometryData): void {
        const material = createFloatingTextMaterial(this.options.getScrollProgress());
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
        geometry.setAttribute('aOffset', new THREE.BufferAttribute(data.offset, 1));
        geometry.setAttribute('aStart', new THREE.BufferAttribute(data.start, 3));
        const entity = this.addPoints(geometry, material, { bindScrollProgress: true });
        this.options.raycastInteractions.add(entity, {
            rotationStrength: 0,
            powerStrength: 0.85,
        });
        this.scrollTextMaterial = material;
        const particles = this.options.renderables.get(entity)?.object;
        if (particles instanceof THREE.Points) {
            this.scrollTextObject = particles;
            particles.position.z = this.scrollTextDepthOffset;
            particles.layers.enable(BLOOM_LAYER);
        }
    }

    private createEllipsis(): void {
        const cloud = this.targets.getEllipsis('cloud');
        const name = this.targets.getEllipsis('name');
        if (!cloud || !name) {
            throw new Error('Ellipsis morph targets are missing');
        }

        const geometry = createAnimatedParticleGeometryFromPositions(cloud, 1 / 2);
        const material = createEllipsisMaterial(geometry);
        const entity = this.addPoints(geometry, material, { bindEllipsisVisibility: true });

        const backdropGalaxy = this.options.renderables.get(entity)?.object;
        if (backdropGalaxy) {
            backdropGalaxy.position.z = SceneContentSystem.ellipsisBackgroundZ;
            backdropGalaxy.position.y = SceneContentSystem.ellipsisBackgroundY;
        }

        this.ellipsisEntity = entity;
        this.options.raycastInteractions.add(entity, {
            rotationStrength: 0.095,
            powerStrength: 1.25,
            faceCamera: true,
            rotationOffset: new THREE.Euler(THREE.MathUtils.degToRad(4), 0, 0),
        });
        this.options.morphs.add(entity, {
            from: cloud,
            to: name,
            progress: 0,
            lastProgress: -1,
            transitionMode: 'cinematic',
            transitionVisibilityUniform: material.uniforms.uTransitionVisibility,
        });
        this.addMorphVisual(entity);
    }

    private updateMorph(
        entity: Entity,
        from: Float32Array | undefined,
        to: Float32Array | undefined,
        progress: number,
    ): boolean {
        const morph = this.options.morphs.get(entity);
        if (!from || !to || !morph) {
            return false;
        }

        const targetChanged = morph.from !== from || morph.to !== to;
        if (targetChanged) {
            morph.lastProgress = -1;
        }
        const cinematicBackground = entity === this.ellipsisEntity;
        if (
            cinematicBackground &&
            (targetChanged || morph.transitionOffsets?.length !== from.length)
        ) {
            const field = createCollapseTransitionField(from, to, entity * 101);
            morph.transitionOffsets = field.offsets;
            morph.transitionDelays = field.delays;
        } else if (!cinematicBackground) {
            morph.transitionOffsets = undefined;
            morph.transitionDelays = undefined;
        }
        morph.transitionMode = cinematicBackground ? 'cinematic' : 'direct';
        morph.from = from;
        morph.to = to;
        morph.progress = Math.min(Math.max(progress, 0), 1);
        morph.transitionStrength = cinematicBackground ? 10 : 0;

        return true;
    }

    private addMorphVisual(entity: Entity): void {
        const object = this.options.renderables.get(entity)?.object;
        if (object) {
            object.scale.setScalar(this.textScale * this.viewportScale);
            object.position.y = this.textPositionY;
        }
        this.morphVisualEntities.push(entity);
    }

    private addPoints(
        geometry: THREE.BufferGeometry,
        material: THREE.ShaderMaterial,
        shaderBindings: Omit<ShaderUniformComponent, 'material'> = {},
    ): Entity {
        const { scene, entities, positions, renderables, shaderUniforms } = this.options;
        const points = new THREE.Points(geometry, material);
        const entity = entities.create();
        const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;

        scene.add(points);
        positions.add(entity, {
            current: new Float32Array(positionAttribute.array),
            dirty: false,
        });
        renderables.add(entity, { object: points });
        shaderUniforms.add(entity, {
            material,
            ...shaderBindings,
        });

        return entity;
    }
}
