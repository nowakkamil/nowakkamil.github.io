import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';

import type { ComponentStore } from '../ecs/ComponentStore';
import type { RaycastInteractionComponent, RenderableComponent } from '../ecs/components';
import type { System } from '../ecs/System';
import { sectionSelectors } from '../../sections/sectionIds';

export class RaycasterSystem implements System {
    private readonly raycaster = new THREE.Raycaster();
    private readonly pointer = new THREE.Vector2();
    private readonly smoothedPointer = new THREE.Vector2();
    private readonly camera: THREE.PerspectiveCamera;
    private readonly canvas: HTMLCanvasElement;
    private readonly projectsSection = document.querySelector<HTMLElement>(
        sectionSelectors.projects,
    );
    private readonly renderables: ComponentStore<RenderableComponent>;
    private readonly interactions: ComponentStore<RaycastInteractionComponent>;
    private responsiveConfig: ResponsiveConfig;
    private readonly interactionEuler = new THREE.Euler();
    private readonly interactionOffset = new THREE.Quaternion();
    private readonly rotationOffset = new THREE.Quaternion();
    private readonly interactionTarget = new THREE.Quaternion();
    private pointerActive = false;
    private pointerOverProjects = false;
    private focusStrength = 0;
    private raycastElapsed = 0;
    private pointerListenersAttached = false;
    private readonly hitObjects = new Set<THREE.Object3D>();
    private readonly raycastObjects: THREE.Object3D[] = [];
    private readonly raycastHits: THREE.Intersection<THREE.Object3D>[] = [];

    constructor(
        camera: THREE.PerspectiveCamera,
        canvas: HTMLCanvasElement,
        renderables: ComponentStore<RenderableComponent>,
        interactions: ComponentStore<RaycastInteractionComponent>,
        responsiveConfig: ResponsiveConfig,
    ) {
        this.camera = camera;
        this.canvas = canvas;
        this.renderables = renderables;
        this.interactions = interactions;
        this.responsiveConfig = responsiveConfig;
        this.raycaster.params.Points = { threshold: 1.4 };

        this.syncPointerListeners();
    }

    public update(delta: number, _elapsed: number): void {
        if (!this.responsiveConfig.hasFinePointer || this.responsiveConfig.reducedMotion) {
            this.updateObjectRotations(delta);
            return;
        }

        const pointerDamping = 1 - Math.exp(-delta * 7.5);
        const cameraDamping = 1 - Math.exp(-delta * 5.5);
        const focusDamping = 1 - Math.exp(-delta * 8);
        const pointerInteractionActive =
            this.responsiveConfig.hasFinePointer &&
            !this.responsiveConfig.reducedMotion &&
            this.pointerActive;
        const pointerTarget = pointerInteractionActive ? this.pointer : RaycasterSystem.center;

        this.smoothedPointer.lerp(pointerTarget, pointerDamping);
        this.raycastElapsed += delta;

        if (pointerInteractionActive && this.raycastElapsed >= 1 / 24) {
            this.raycastElapsed = 0;
            this.updateFocusTarget(focusDamping);
        } else if (!pointerInteractionActive) {
            this.focusStrength = THREE.MathUtils.lerp(this.focusStrength, 0, focusDamping);
        }

        const focusBoost = 1 + this.focusStrength * 0.35;
        const targetX = -this.smoothedPointer.x * 0.2875 * focusBoost;
        const targetY = -this.smoothedPointer.y * 0.175 * focusBoost;
        const targetRotationX = this.smoothedPointer.y * 0.000125;
        const targetRotationY = -this.smoothedPointer.x * 0.005;
        const targetRotationZ =
            -this.smoothedPointer.x * this.smoothedPointer.y * 0.0005 * this.focusStrength;

        this.camera.position.x = THREE.MathUtils.lerp(
            this.camera.position.x,
            targetX,
            cameraDamping,
        );
        this.camera.position.y = THREE.MathUtils.lerp(
            this.camera.position.y,
            targetY,
            cameraDamping,
        );
        this.camera.rotation.x = THREE.MathUtils.lerp(
            this.camera.rotation.x,
            targetRotationX,
            cameraDamping,
        );
        this.camera.rotation.y = THREE.MathUtils.lerp(
            this.camera.rotation.y,
            targetRotationY,
            cameraDamping,
        );
        this.camera.rotation.z = THREE.MathUtils.lerp(
            this.camera.rotation.z,
            targetRotationZ,
            cameraDamping,
        );

        this.updateInteractionUniforms(delta);
        this.updateObjectRotations(delta);
    }

    private updateObjectRotations(delta: number): void {
        const damping = 1 - Math.exp(-delta * 8.5);
        const focusBoost = 1 + this.focusStrength * 0.45;

        for (const [entity, interaction] of this.interactions.all()) {
            if (
                interaction.rotationStrength === 0 &&
                !interaction.faceCamera &&
                !interaction.rotationOffset
            ) {
                continue;
            }

            const object = this.renderables.get(entity)?.object;
            if (!object) {
                continue;
            }

            const strength = interaction.rotationStrength * focusBoost;
            const baseRotationX = interaction.baseRotationX ?? 0;
            const pointerRotationX = -this.smoothedPointer.y * strength;
            const interactiveRotationX =
                baseRotationX > 0 ? Math.min(pointerRotationX, 0) : pointerRotationX;
            this.interactionEuler.set(
                baseRotationX + interactiveRotationX,
                this.smoothedPointer.x * strength,
                this.smoothedPointer.x * this.smoothedPointer.y * strength * 0.28,
            );
            this.interactionOffset.setFromEuler(this.interactionEuler);

            this.interactionTarget.copy(
                interaction.faceCamera
                    ? this.camera.quaternion
                    : RaycasterSystem.identityQuaternion,
            );

            if (interaction.rotationOffset) {
                this.rotationOffset.setFromEuler(interaction.rotationOffset);
                this.interactionTarget.multiply(this.rotationOffset);
            }

            this.interactionTarget.multiply(this.interactionOffset);

            object.quaternion.slerp(this.interactionTarget, damping);
        }
    }

    private updateInteractionUniforms(delta: number): void {
        const strength =
            this.responsiveConfig.hasFinePointer &&
            !this.responsiveConfig.reducedMotion &&
            this.pointerActive &&
            !this.pointerOverProjects
                ? 0.72 + this.focusStrength * 0.28
                : 0;

        for (const [entity, renderable] of this.renderables.all()) {
            const powerStrength = this.interactions.get(entity)?.powerStrength ?? 0;
            const { material } = renderable.object;

            if (Array.isArray(material)) {
                for (const item of material) {
                    this.updateMaterialUniforms(
                        item,
                        renderable.object,
                        strength,
                        powerStrength,
                        delta,
                    );
                }
            } else {
                this.updateMaterialUniforms(
                    material,
                    renderable.object,
                    strength,
                    powerStrength,
                    delta,
                );
            }
        }
    }

    private updateMaterialUniforms(
        material: THREE.Material,
        object: THREE.Object3D,
        strength: number,
        powerStrength: number,
        delta: number,
    ): void {
        if (!(material instanceof THREE.ShaderMaterial)) {
            return;
        }

        const pointerUniform = material.uniforms.uPointer;
        if (pointerUniform?.value instanceof THREE.Vector2) {
            pointerUniform.value.copy(this.smoothedPointer);
        }
        if (material.uniforms.uPointerStrength) {
            material.uniforms.uPointerStrength.value = strength;
        }
        if (material.uniforms.uPointerPower) {
            material.uniforms.uPointerPower.value = THREE.MathUtils.damp(
                material.uniforms.uPointerPower.value,
                this.hitObjects.has(object) ? strength * powerStrength : 0,
                9,
                delta,
            );
        }
    }

    private updateFocusTarget(damping: number): void {
        this.camera.updateMatrixWorld();
        this.raycaster.setFromCamera(this.smoothedPointer, this.camera);

        const objects = this.raycastObjects;
        objects.length = 0;
        for (const [, renderable] of this.renderables.all()) {
            if (renderable.object.visible) {
                objects.push(renderable.object);
            }
        }

        const hits = this.raycastHits;
        hits.length = 0;
        this.raycaster.intersectObjects(objects, false, hits);
        this.hitObjects.clear();
        for (const hit of hits) {
            this.hitObjects.add(hit.object);
        }
        const hasHit = hits.length > 0;
        this.focusStrength = THREE.MathUtils.lerp(this.focusStrength, hasHit ? 1 : 0, damping);
    }

    private readonly handlePointerMove = (event: PointerEvent): void => {
        if (
            !this.responsiveConfig.hasFinePointer ||
            this.responsiveConfig.reducedMotion ||
            event.pointerType !== 'mouse'
        ) {
            this.pointerActive = false;
            return;
        }

        const bounds = this.canvas.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) {
            return;
        }

        this.pointer.set(
            ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        const projectsBounds = this.projectsSection?.getBoundingClientRect();
        this.pointerOverProjects = Boolean(
            projectsBounds &&
            event.clientX >= projectsBounds.left &&
            event.clientX <= projectsBounds.right &&
            event.clientY >= projectsBounds.top &&
            event.clientY <= projectsBounds.bottom,
        );
        this.pointerActive = true;
    };

    public setResponsiveConfig(responsiveConfig: ResponsiveConfig): void {
        this.responsiveConfig = responsiveConfig;
        this.syncPointerListeners();

        if (!responsiveConfig.hasFinePointer || responsiveConfig.reducedMotion) {
            this.pointerActive = false;
            this.pointerOverProjects = false;
            this.pointer.set(0, 0);
            this.smoothedPointer.set(0, 0);
            this.focusStrength = 0;
        }
    }

    public dispose(): void {
        this.detachPointerListeners();
    }

    private syncPointerListeners(): void {
        const shouldListen =
            this.responsiveConfig.hasFinePointer && !this.responsiveConfig.reducedMotion;
        if (shouldListen === this.pointerListenersAttached) {
            return;
        }

        if (shouldListen) {
            window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
            window.addEventListener('pointerout', this.handlePointerOut, { passive: true });
            window.addEventListener('blur', this.handlePointerLeave);
            this.pointerListenersAttached = true;
            return;
        }

        this.detachPointerListeners();
    }

    private detachPointerListeners(): void {
        if (!this.pointerListenersAttached) {
            return;
        }

        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerout', this.handlePointerOut);
        window.removeEventListener('blur', this.handlePointerLeave);
        this.pointerListenersAttached = false;
    }

    private readonly handlePointerLeave = (): void => {
        this.pointerActive = false;
        this.pointerOverProjects = false;
    };

    private readonly handlePointerOut = (event: PointerEvent): void => {
        if (event.relatedTarget === null) {
            this.handlePointerLeave();
        }
    };

    private static readonly center = new THREE.Vector2();
    private static readonly identityQuaternion = new THREE.Quaternion();
}
