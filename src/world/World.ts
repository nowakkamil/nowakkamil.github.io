import * as THREE from 'three';
import { yieldToMainThread } from '../utils/yieldToMainThread';
import gsap from 'gsap';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { refreshResponsiveConfig, type ResponsiveConfig } from '../app/responsiveConfig';
import { IntroCameraController } from './controllers/IntroCameraController';
import { ContactCameraController } from './controllers/ContactCameraController';
import { ProjectsCameraController } from './controllers/ProjectsCameraController';
import { ComponentStore } from './ecs/ComponentStore';
import { EntityManager } from './ecs/EntityManager';
import type { Entity } from './ecs/Entity';
import type {
    FadeOverlayComponent,
    MorphComponent,
    PositionComponent,
    RaycastInteractionComponent,
    RenderableComponent,
    SceneStateComponent,
    ShaderUniformComponent,
} from './ecs/components';
import { FadeOverlaySystem } from './systems/FadeOverlaySystem';
import { MorphSystem } from './systems/MorphSystem';
import { RaycasterSystem } from './systems/RaycasterSystem';
import { RenderSystem } from './systems/RenderSystem';
import { SceneContentSystem } from './systems/SceneContentSystem';
import { SelectiveBloomSystem } from './systems/SelectiveBloomSystem';
import { ShaderUniformSystem } from './systems/ShaderUniformSystem';
import type { ShootingStarSystem } from './systems/ShootingStarSystem';
import { createCloudParticleGeometryFromData } from './factories/GeometryFactory';
import {
    createBloomCompositePassMaterial,
    createColoredLightMaterial,
    createMainParticleMaterial,
} from './factories/MaterialFactory';
import { createColoredLightMesh } from './factories/SceneObjectFactory';
import { compileShaderMaterials } from './rendering/compileShaderMaterials';
import { generateSceneGeometry } from './workers/generateSceneGeometry';
import type { MainCloudGeometryData } from './workers/sceneGeometryTypes';
import type {
    PortfolioConstellation,
    PortfolioProject,
    PortfolioProjectPreviewState,
} from '../sections/projects/portfolioConstellation';

type PortfolioProjectSelectionListener = (project: PortfolioProject | undefined) => void;

type CameraController = 'intro' | 'projects' | 'contact';
type CameraOwner = CameraController | 'contact-loop';

interface WorldInitializationCallbacks {
    initialViewportSize?: { width: number; height: number };
    onSceneBuildStart?: () => void;
}

const getRendererViewportSize = (canvas: HTMLCanvasElement) => ({
    width: Math.max(1, canvas.clientWidth),
    height: Math.max(1, canvas.clientHeight),
});

const TEXT_TRANSFORM_PROGRESS_MIN = 0;
const TEXT_TRANSFORM_PROGRESS_MAX = 1;
const TEXT_COMPACT_ARC_STRENGTH = 0.05;
const TEXT_DEFAULT_ARC_STRENGTH = 0.1;
const TEXT_COMPACT_DRIFT_STRENGTH = 0.005;
const TEXT_DEFAULT_DRIFT_STRENGTH = 0.01;
const TEXT_DRIFT_FREQUENCY = 1.2;

export class World {
    public readonly ready: Promise<void>;

    private readonly scene: THREE.Scene;
    private readonly camera: THREE.PerspectiveCamera;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly afterimagePass: AfterimagePass;
    private readonly selectiveBloomSystem: SelectiveBloomSystem;
    private readonly finalComposer: EffectComposer;
    private readonly bloomCompositePass: ShaderPass;
    private readonly introCameraController: IntroCameraController;
    private readonly projectsCameraController: ProjectsCameraController;
    private readonly contactCameraController: ContactCameraController;
    private portfolioConstellation: PortfolioConstellation | undefined;
    private portfolioConstellationPromise: Promise<PortfolioConstellation> | undefined;
    private portfolioConstellationReveal = 0;
    private portfolioConstellationRevealImmediate = false;
    private portfolioConstellationScrollProgress = 0;
    private projectPanelBoundaryActive = false;
    private portfolioProjectPreviewHandler:
        | ((state: PortfolioProjectPreviewState) => void)
        | undefined;
    private responsiveConfig: ResponsiveConfig;
    private coloredLightMaterial: THREE.ShaderMaterial | undefined;
    private rendererPixelRatio = 0;
    private finalPixelRatio = 0;
    private rendererViewportWidth = 0;
    private rendererViewportHeight = 0;
    private devicePixelRatio = 0;
    private resizePending = false;
    private mainCloudMaterial!: THREE.ShaderMaterial;

    private readonly entities = new EntityManager();
    private readonly positions = new ComponentStore<PositionComponent>();
    private readonly fadeOverlays = new ComponentStore<FadeOverlayComponent>();
    private readonly morphs = new ComponentStore<MorphComponent>();
    private readonly renderables = new ComponentStore<RenderableComponent>();
    private readonly raycastInteractions = new ComponentStore<RaycastInteractionComponent>();
    private readonly shaderUniforms = new ComponentStore<ShaderUniformComponent>();
    private readonly sceneStates = new ComponentStore<SceneStateComponent>();

    private fadeOverlaySystem!: FadeOverlaySystem;
    private readonly morphSystem: MorphSystem;
    private readonly raycasterSystem: RaycasterSystem;
    private readonly renderSystem: RenderSystem;
    private readonly shaderSystem: ShaderUniformSystem;
    private shootingStarSystem: ShootingStarSystem | undefined;
    private shootingStarSystemPromise: Promise<void> | undefined;
    private shootingStarContext: 'experience' | 'projects' = 'experience';
    private shootingStarVisibility = 0;
    private contentSystem!: SceneContentSystem;

    private selectedPortfolioProject: PortfolioProject | undefined;
    private readonly portfolioProjectSelectionListeners =
        new Set<PortfolioProjectSelectionListener>();

    private readonly sceneState: SceneStateComponent;
    private cameraOwner: CameraOwner = 'intro';
    private projectsCameraProgress = 0;
    private contactCameraProgress = 0;
    private contactLoopZoomProgress = 0;
    private clearAfterimageHistory = false;
    private elapsedTime = 0;
    private mainCloudEntity!: Entity;
    private mainCloudPositions!: Float32Array;
    private mainCloudMorphFactor!: THREE.BufferAttribute;
    private resolveReady!: () => void;

    public addPortfolioProjectSelectionListener(listener: PortfolioProjectSelectionListener): void {
        this.portfolioProjectSelectionListeners.add(listener);
    }

    public removePortfolioProjectSelectionListener(
        listener: PortfolioProjectSelectionListener,
    ): void {
        this.portfolioProjectSelectionListeners.delete(listener);
    }

    private setSelectedPortfolioProject(project: PortfolioProject | undefined): void {
        if (this.selectedPortfolioProject?.id === project?.id) {
            return;
        }

        this.selectedPortfolioProject = project;

        for (const listener of this.portfolioProjectSelectionListeners) {
            listener(project);
        }
    }

    constructor(
        canvas: HTMLCanvasElement,
        responsiveConfig: ResponsiveConfig = refreshResponsiveConfig(),
        initializationCallbacks: WorldInitializationCallbacks = {},
    ) {
        this.responsiveConfig = responsiveConfig;
        const initialViewportSize =
            initializationCallbacks.initialViewportSize ?? getRendererViewportSize(canvas);
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true,
            stencil: false,
            powerPreference: 'high-performance',
        });
        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, this.responsiveConfig.renderer.pixelRatioCap),
        );
        this.renderer.setClearColor(0x000000, 1);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            this.responsiveConfig.camera.fov,
            initialViewportSize.width / initialViewportSize.height,
            0.1,
            1000,
        );
        const baseRenderPass = new RenderPass(this.scene, this.camera);
        this.selectiveBloomSystem = new SelectiveBloomSystem(
            this.renderer,
            this.scene,
            this.camera,
            initialViewportSize.width,
            initialViewportSize.height,
        );
        this.bloomCompositePass = createBloomCompositePassMaterial();
        this.bloomCompositePass.uniforms.bloomTexture.value = this.selectiveBloomSystem.texture;
        this.finalComposer = new EffectComposer(this.renderer);
        this.finalComposer.addPass(baseRenderPass);
        this.finalComposer.addPass(this.bloomCompositePass);
        this.afterimagePass = new AfterimagePass(0);
        this.afterimagePass.enabled = true;
        this.finalComposer.addPass(this.afterimagePass);

        this.introCameraController = new IntroCameraController(
            this.camera,
            this.responsiveConfig.camera,
        );
        this.projectsCameraController = new ProjectsCameraController(
            this.camera,
            this.responsiveConfig.camera,
        );
        this.contactCameraController = new ContactCameraController(
            this.camera,
            this.responsiveConfig.camera,
        );
        this.sceneState = this.sceneStates.add(this.entities.create(), {
            scrollProgress: 0,
            backgroundParticlesVisibility: 0,
            coloredLightVisibility: 0,
            ellipsisVisibility: 0,
            scrollVelocity: 0,
        });

        this.morphSystem = new MorphSystem(this.morphs, this.positions);
        this.raycasterSystem = new RaycasterSystem(
            this.camera,
            canvas,
            this.renderables,
            this.raycastInteractions,
            this.responsiveConfig,
        );
        this.renderSystem = new RenderSystem(this.positions, this.renderables);
        this.shaderSystem = new ShaderUniformSystem(this.shaderUniforms, this.sceneStates);

        this.ready = new Promise((resolve) => {
            this.resolveReady = resolve;
        });

        void this.init3d(initialViewportSize, initializationCallbacks.onSceneBuildStart).catch(
            (error) => {
                console.error('Failed to initialise ECS world', error);
                this.resolveReady();
            },
        );
    }

    public update(delta: number, elapsed: number): void {
        this.elapsedTime = elapsed;
        const safeDelta = Math.min(delta, 0.1);

        this.portfolioConstellation?.update(safeDelta, elapsed);
        this.raycasterSystem.update(safeDelta, elapsed);
        this.updateOwnedCamera();
        this.shootingStarSystem?.update(safeDelta);
        this.contentSystem.update(safeDelta, elapsed);
        this.morphSystem.update(safeDelta, elapsed);
        this.shaderSystem.update(safeDelta, elapsed);
        this.renderSystem.update(safeDelta, elapsed);
        this.fadeOverlaySystem.update(safeDelta, elapsed);

        const motionBlurDamp = this.fadeOverlaySystem.getMotionBlurDamp();
        const shouldClearAfterimage = this.clearAfterimageHistory;
        this.afterimagePass.enabled = shouldClearAfterimage || motionBlurDamp > 0.001;
        this.afterimagePass.damp = shouldClearAfterimage ? 0 : motionBlurDamp;
        this.clearAfterimageHistory = false;

        this.renderFrame();
    }

    private readonly requestResize = (): void => {
        if (this.resizePending) {
            return;
        }

        this.resizePending = true;
        gsap.ticker.add(this.commitResize);
    };

    private readonly commitResize = (): void => {
        gsap.ticker.remove(this.commitResize);
        this.resizePending = false;
        this.resize();
    };

    public resize = (viewportSize = getRendererViewportSize(this.renderer.domElement)): void => {
        const { width, height } = viewportSize;
        const devicePixelRatio = window.devicePixelRatio || 1;
        const viewportChanged =
            width !== this.rendererViewportWidth || height !== this.rendererViewportHeight;
        const pixelRatioChanged = devicePixelRatio !== this.devicePixelRatio;

        if (!viewportChanged && !pixelRatioChanged) {
            return;
        }

        this.rendererViewportWidth = width;
        this.rendererViewportHeight = height;
        this.devicePixelRatio = devicePixelRatio;

        const nextResponsiveConfig = refreshResponsiveConfig(window.innerWidth, height);
        const rendererPixelRatio = Math.min(
            devicePixelRatio,
            nextResponsiveConfig.renderer.pixelRatioCap,
        );
        const bloomPixelRatio = Math.min(
            devicePixelRatio,
            nextResponsiveConfig.renderer.bloomPixelRatioCap,
        );

        this.responsiveConfig = nextResponsiveConfig;
        this.updateMainCloudResponsiveStyle();
        this.introCameraController.setResponsiveConfig(nextResponsiveConfig.camera);
        this.projectsCameraController.setResponsiveConfig(nextResponsiveConfig.camera);
        this.contactCameraController.setResponsiveConfig(nextResponsiveConfig.camera);
        this.portfolioConstellation?.setResponsiveConfig(nextResponsiveConfig);
        this.shootingStarSystem?.setResponsiveConfig(nextResponsiveConfig);
        this.shootingStarSystem?.setViewportSize(width, height);
        this.raycasterSystem.setResponsiveConfig(nextResponsiveConfig);
        this.fadeOverlaySystem.setResponsiveConfig(nextResponsiveConfig);
        const tunnelBokehSizeUniform = this.mainCloudMaterial?.uniforms.uTunnelBokehSizeScale;
        if (tunnelBokehSizeUniform) {
            tunnelBokehSizeUniform.value = nextResponsiveConfig.particles.tunnelBokehSizeScale;
        }
        const tunnelRadiusUniform = this.mainCloudMaterial?.uniforms.uTunnelRadiusScale;
        if (tunnelRadiusUniform) {
            tunnelRadiusUniform.value = nextResponsiveConfig.particles.tunnelRadiusScale;
        }
        const textCurveStrengthUniform = this.mainCloudMaterial?.uniforms.uCurveStrength;
        if (textCurveStrengthUniform) {
            textCurveStrengthUniform.value = nextResponsiveConfig.text.curveStrength;
        }
        const textCurveBowUniform = this.mainCloudMaterial?.uniforms.uCurveBow;
        if (textCurveBowUniform) {
            textCurveBowUniform.value = nextResponsiveConfig.text.curveBow;
        }
        this.applyColoredLightResponsiveConfig(nextResponsiveConfig.coloredLight);

        if (this.rendererPixelRatio !== rendererPixelRatio) {
            this.renderer.setPixelRatio(rendererPixelRatio);
            this.rendererPixelRatio = rendererPixelRatio;
        }
        this.renderer.setSize(width, height, false);
        this.selectiveBloomSystem.setStrengthScale(
            nextResponsiveConfig.renderer.bloomPassStrengthScale,
        );
        this.selectiveBloomSystem.setSize(width, height, bloomPixelRatio);
        if (this.finalPixelRatio !== rendererPixelRatio) {
            this.finalComposer.setPixelRatio(rendererPixelRatio);
            this.finalPixelRatio = rendererPixelRatio;
        }
        this.finalComposer.setSize(width, height);
        this.camera.fov = nextResponsiveConfig.camera.fov;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.fadeOverlaySystem.setViewportSize(width, height);
        this.shaderSystem.setViewportSize(width, height);
        this.contentSystem.setTextBloomStrengthScale(
            nextResponsiveConfig.renderer.textBloomStrengthScale,
        );
        this.contentSystem.setScrollTextDepthOffset(nextResponsiveConfig.text.scrollDepthOffset);
        this.contentSystem.setViewportSize(width);
        this.updateOwnedCamera();
    };

    public startIntroReveal(onSettled?: () => void): void {
        this.clearAfterimageHistory = onSettled !== undefined;
        this.contentSystem.restartScrollTextReveal(this.elapsedTime);
        this.fadeOverlaySystem.startHyperspaceZoom(onSettled);
    }

    public prepareForReveal(): void {
        this.renderFrame();
    }

    public setScrollLocked(locked: boolean, resetPosition = true): void {
        if (locked) {
            this.fadeOverlaySystem.lockScroll(resetPosition);
        } else {
            this.fadeOverlaySystem.unlockScroll();
        }
    }

    public setFade(value: number, immediate = false): void {
        this.fadeOverlaySystem.setFade(value, immediate);
    }

    public setScrollProgress(value: number): void {
        this.sceneState.scrollProgress = THREE.MathUtils.clamp(value, 0, 1);
    }

    public updateProjectsCamera(progress: number): void {
        this.projectsCameraProgress = THREE.MathUtils.clamp(progress, 0, 1);
    }

    public setProjectsCameraActive(active: boolean): void {
        if (!active) {
            return;
        }

        this.setBaseCameraFov();
        this.activateCameraController('projects');
    }

    public syncProjectsCamera(): void {
        this.activateCameraController('projects');
        this.setBaseCameraFov();
        this.projectsCameraController.update(this.projectsCameraProgress);
    }

    public updateContactCamera(progress: number): void {
        this.contactCameraProgress = THREE.MathUtils.clamp(progress, 0, 1);
    }

    public syncContactCamera(progress: number): void {
        this.updateContactCamera(progress);
        if (this.cameraOwner !== 'contact') {
            this.contactCameraController.beginTransitionFromCurrentCamera();
        }
        this.activateCameraController('contact');
        this.contactCameraController.update(this.contactCameraProgress);
    }

    public setContactCameraTug(progress: number): void {
        this.contactCameraController.setTugProgress(progress);
    }

    public setContactCameraActive(active: boolean): void {
        if (!active) {
            return;
        }

        if (this.cameraOwner !== 'contact') {
            this.contactCameraController.beginTransitionFromCurrentCamera();
        }
        this.activateCameraController('contact');
    }

    public beginContactLoopZoomOut(): void {
        this.cameraOwner = 'contact-loop';
        this.contactLoopZoomProgress = 0;
        this.contactCameraController.beginLoopZoomOut();
    }

    public updateContactLoopZoomOut(progress: number): void {
        this.contactLoopZoomProgress = THREE.MathUtils.clamp(progress, 0, 1);
        this.contactCameraController.updateLoopZoomOut(this.contactLoopZoomProgress);
    }

    public syncIntroCamera(): void {
        this.activateCameraController('intro');
        this.setBaseCameraFov();
        this.introCameraController.update(this.sceneState.scrollProgress);
    }

    public setPortfolioConstellationReveal(progress: number, immediate = false): void {
        this.portfolioConstellationReveal = progress;
        this.portfolioConstellationRevealImmediate = immediate;
        this.portfolioConstellation?.setReveal(progress, immediate);
    }

    public setShootingStarsAppearance(
        context: 'experience' | 'projects',
        visibility: number,
    ): void {
        this.shootingStarContext = context;
        this.shootingStarVisibility = visibility;

        if (this.shootingStarSystem) {
            this.shootingStarSystem.setAppearance(context, visibility);
            return;
        }
        if (visibility <= 0.001) {
            return;
        }

        void this.prepareShootingStars();
    }

    public prepareShootingStars(): Promise<void> {
        if (this.shootingStarSystem) {
            return Promise.resolve();
        }

        this.shootingStarSystemPromise ??= import('./systems/ShootingStarSystem')
            .then(({ ShootingStarSystem }) => {
                const system = new ShootingStarSystem(
                    this.scene,
                    this.camera,
                    this.responsiveConfig,
                );
                system.setViewportSize(this.rendererViewportWidth, this.rendererViewportHeight);
                system.setAppearance(this.shootingStarContext, this.shootingStarVisibility);
                this.shootingStarSystem = system;
            })
            .catch((error) => {
                this.shootingStarSystemPromise = undefined;
                console.error('Failed to initialize shooting stars', error);
            });

        return this.shootingStarSystemPromise;
    }

    public async preparePortfolioConstellation(): Promise<void> {
        try {
            await this.loadPortfolioConstellation();
        } catch (error) {
            console.error('Failed to prepare portfolio constellation', error);
        }
    }

    public setPortfolioConstellationScrollProgress(progress: number): void {
        this.portfolioConstellationScrollProgress = progress;
        this.portfolioConstellation?.setConstellationScrollProgress(progress);
    }

    public setActivePortfolioProjectByScroll(progress: number): void {
        this.portfolioConstellationScrollProgress = progress;
        this.portfolioConstellation?.setActiveProjectByScroll(progress);
    }

    public setProjectPanelBoundaryActive(active: boolean): void {
        this.projectPanelBoundaryActive = active;
        this.portfolioConstellation?.setProjectPanelBoundaryActive(active);
    }

    public isProjectPanelBoundaryActive(): boolean {
        return (
            this.portfolioConstellation?.getProjectPanelBoundaryActive() ??
            this.projectPanelBoundaryActive
        );
    }

    public setPortfolioProjectPreviewHandler(
        onProjectPreviewChange?: (state: PortfolioProjectPreviewState) => void,
    ): void {
        this.portfolioProjectPreviewHandler = onProjectPreviewChange;
        this.portfolioConstellation?.setProjectPreviewHandler(onProjectPreviewChange);
    }

    public clearSelectedPortfolioProject(): void {
        this.portfolioConstellation?.clearSelectedProject();

        this.setSelectedPortfolioProject(undefined);
    }

    public selectAdjacentPortfolioProject(direction: -1 | 1): void {
        void this.loadPortfolioConstellation()
            .then((constellation) => {
                constellation.selectAdjacentProject(direction);
            })
            .catch((error) => {
                console.error('Failed to select adjacent portfolio project', error);
            });
    }

    public selectPortfolioProjectById(projectId: string): void {
        void this.loadPortfolioConstellation()
            .then((constellation) => {
                constellation.selectProjectById(projectId);
            })
            .catch((error) => {
                console.error(`Failed to select portfolio project "${projectId}"`, error);
            });
    }

    public setScrollVelocity(value: number): void {
        this.sceneState.scrollVelocity = value;
    }

    public morphToShape(fromKey: string, toKey: string, progress: number): void {
        this.contentSystem.morphToShape(fromKey, toKey, progress);
    }

    public updateTextTransform(progress: number, config: ResponsiveConfig): void {
        const scale =
            config.text.transformScaleStart +
            (config.text.transformScaleEnd - config.text.transformScaleStart) * progress +
            config.text.transformScaleArcStrength * Math.sin(progress * Math.PI);
        this.setTextScale(scale);

        const useCompactTextMotion = config.isCompact || config.hasCoarsePointer;
        const arcStrength = config.reducedMotion
            ? TEXT_TRANSFORM_PROGRESS_MIN
            : useCompactTextMotion
              ? TEXT_COMPACT_ARC_STRENGTH
              : TEXT_DEFAULT_ARC_STRENGTH;
        const driftStrength = config.reducedMotion
            ? TEXT_TRANSFORM_PROGRESS_MIN
            : useCompactTextMotion
              ? TEXT_COMPACT_DRIFT_STRENGTH
              : TEXT_DEFAULT_DRIFT_STRENGTH;
        const arc = Math.sin(progress * Math.PI) * arcStrength;
        const drift =
            Math.sin(progress * TEXT_DRIFT_FREQUENCY) *
            driftStrength *
            (TEXT_TRANSFORM_PROGRESS_MAX - progress);
        const { y } = this.getTextTopPosition();

        this.setTextPosition(y * progress + arc + drift);
        this.setMainTextRelativeOffsetY(config.text.relativeOffsetYFactor * progress);
        this.setTextTilt(progress);
    }

    public setTextScale(value: number): void {
        this.contentSystem.setTextScale(value);
    }

    public setTextPosition(y: number): void {
        this.contentSystem.setTextPosition(y);
    }

    public setMainTextRelativeOffsetY(y: number): void {
        this.contentSystem.setMainTextRelativeOffsetY(y);
    }

    public setTextTilt(progress: number): void {
        this.contentSystem.setTextTilt(progress);
    }

    public getTextTopPosition(): { y: number } {
        const cameraDistance = Math.abs(this.camera.position.z);
        const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
        const height = 2 * Math.tan(verticalFov / 2) * cameraDistance;

        return { y: height * this.responsiveConfig.text.topAnchor };
    }

    public setBackgroundParticlesVisibility(visibility: number): void {
        this.sceneState.backgroundParticlesVisibility = THREE.MathUtils.clamp(visibility, 0, 1);
    }

    public setColoredLightVisibility(visibility: number): void {
        const clampedVisibility = THREE.MathUtils.clamp(visibility, 0, 1);
        this.sceneState.coloredLightVisibility = clampedVisibility;

        if (clampedVisibility > 0) {
            this.prepareColoredLight();
        }
    }

    public prepareColoredLight(): THREE.ShaderMaterial {
        const existingMaterial = this.coloredLightMaterial;
        if (existingMaterial) {
            return existingMaterial;
        }

        return this.addColoredLight();
    }

    public setEllipsisVisibility(visibility: number): void {
        this.sceneState.ellipsisVisibility = THREE.MathUtils.clamp(visibility, 0, 1);
    }

    public setMainParticlesOpacity(opacity: number): void {
        const uniform = this.mainCloudMaterial?.uniforms.uGlobalOpacity;
        if (uniform) {
            uniform.value = THREE.MathUtils.clamp(opacity, 0, 1);
        }
    }

    public setMainParticlesDensity(density: number): void {
        const uniform = this.mainCloudMaterial?.uniforms.uParticleDensity;
        if (uniform) {
            uniform.value = THREE.MathUtils.clamp(density, 0, 1);
        }
    }

    public setMainParticlesSparkle(strength: number): void {
        const uniform = this.mainCloudMaterial?.uniforms.uSparkleStrength;
        if (uniform) {
            uniform.value = THREE.MathUtils.clamp(strength, 0, 1);
        }
    }

    public setTunnelSpinStrength(strength: number): void {
        const uniform = this.mainCloudMaterial?.uniforms.uTunnelSpinStrength;
        if (uniform) {
            uniform.value = THREE.MathUtils.clamp(strength, 0, 1);
        }
    }

    public setTunnelColorStrength(strength: number): void {
        const uniform = this.mainCloudMaterial?.uniforms.uTunnelColorStrength;
        if (uniform) {
            uniform.value = THREE.MathUtils.clamp(strength, 0, 1);
        }
    }

    public getDebugTargets() {
        const coloredLightMaterial = this.prepareColoredLight();

        return {
            camera: this.camera,
            mainCloudMaterial: this.mainCloudMaterial,
            coloredLightMaterial,
            shaderUniformComponents: Array.from(
                this.shaderUniforms.all(),
                ([, component]) => component,
            ),
            selectiveBloom: this.selectiveBloomSystem,
            bloomPass: this.selectiveBloomSystem.pass,
            afterimagePass: this.afterimagePass,
        };
    }

    public dispose(): void {
        window.removeEventListener('resize', this.requestResize);
        gsap.ticker.remove(this.commitResize);
        this.resizePending = false;
        this.portfolioConstellation?.dispose();
        this.shootingStarSystem?.dispose();
        this.raycasterSystem.dispose();
        this.renderer.dispose();
    }

    private async init3d(
        initialViewportSize: { width: number; height: number },
        onSceneBuildStart?: () => void,
    ): Promise<void> {
        const sceneGeometry = generateSceneGeometry(
            this.responsiveConfig.particles,
            onSceneBuildStart,
        );
        const shootingStars = this.prepareShootingStars();

        await yieldToMainThread();
        this.fadeOverlaySystem = new FadeOverlaySystem(
            this.scene,
            this.camera,
            this.entities,
            this.fadeOverlays,
            this.responsiveConfig,
        );

        await yieldToMainThread();
        this.addColoredLight();

        const [generated] = await Promise.all([sceneGeometry, shootingStars]);
        await yieldToMainThread();
        this.createMainCloudParticles(generated.mainCloud);

        await yieldToMainThread();
        this.contentSystem = new SceneContentSystem({
            scene: this.scene,
            camera: this.camera,
            entities: this.entities,
            positions: this.positions,
            morphs: this.morphs,
            renderables: this.renderables,
            raycastInteractions: this.raycastInteractions,
            shaderUniforms: this.shaderUniforms,
            mainCloudEntity: this.mainCloudEntity,
            mainCloudPositions: this.mainCloudPositions,
            mainCloudMorphFactor: this.mainCloudMorphFactor,
            ambientParticleCount: this.responsiveConfig.particles.ambient,
            getScrollProgress: () => this.sceneState.scrollProgress,
        });
        this.resize(initialViewportSize);
        window.addEventListener('resize', this.requestResize, {
            passive: true,
        });

        await yieldToMainThread();
        await this.contentSystem.initialize(generated);
        await yieldToMainThread();
        await this.renderer.compileAsync(this.scene, this.camera);
        await yieldToMainThread();
        await this.compilePostprocessingShaders();
        await yieldToMainThread();
        this.selectiveBloomSystem.prepare(this.renderer);
        await this.prepareInitialComposerFrame();
        this.resolveReady();
    }

    private async prepareInitialComposerFrame(): Promise<void> {
        const currentRenderTarget = this.renderer.getRenderTarget();

        try {
            for (let index = 0; index < this.finalComposer.passes.length; index += 1) {
                const pass = this.finalComposer.passes[index];
                if (!pass.enabled) {
                    continue;
                }

                pass.renderToScreen =
                    this.finalComposer.renderToScreen &&
                    this.finalComposer.isLastEnabledPass(index);
                pass.render(
                    this.renderer,
                    this.finalComposer.writeBuffer,
                    this.finalComposer.readBuffer,
                    0,
                    false,
                );
                if (pass.needsSwap) {
                    this.finalComposer.swapBuffers();
                }
                await yieldToMainThread();
            }
        } finally {
            this.renderer.setRenderTarget(currentRenderTarget);
        }
    }

    private async compilePostprocessingShaders(): Promise<void> {
        const previousRenderTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.finalComposer.renderTarget1);

        try {
            await compileShaderMaterials(this.renderer, [
                ...(this.shootingStarSystem?.getPreparationMaterials() ?? []),
                ...this.selectiveBloomSystem.getPreparationMaterials(),
                this.bloomCompositePass.material,
                this.afterimagePass.compFsMaterial,
                this.afterimagePass.copyFsMaterial,
            ]);
        } finally {
            this.renderer.setRenderTarget(previousRenderTarget);
        }
    }

    private renderFrame(): void {
        this.selectiveBloomSystem.render(this.contentSystem.getTextBloomState());
        this.finalComposer.render();
    }

    private loadPortfolioConstellation(): Promise<PortfolioConstellation> {
        if (this.portfolioConstellation) {
            return Promise.resolve(this.portfolioConstellation);
        }
        if (this.portfolioConstellationPromise) {
            return this.portfolioConstellationPromise;
        }

        this.portfolioConstellationPromise = Promise.all([
            import('../sections/projects/portfolioConstellation'),
            import('../sections/projects/portfolioProjects'),
            import('../sections/projects/constellations'),
            import('../sections/projects/portfolioSkills'),
        ])
            .then(
                ([
                    { PortfolioConstellation },
                    { portfolioProjects },
                    { constellations },
                    { portfolioSkills },
                ]) => {
                    const constellation = new PortfolioConstellation({
                        scene: this.scene,
                        camera: this.camera,
                        domElement: this.renderer.domElement,
                        projects: portfolioProjects,
                        constellations,
                        skills: portfolioSkills,
                        responsiveConfig: this.responsiveConfig,
                        onProjectSelect: (project) => {
                            this.setSelectedPortfolioProject(project);
                        },
                        onProjectClear: () => {
                            this.setSelectedPortfolioProject(undefined);
                        },
                    });

                    constellation.setProjectPreviewHandler(this.portfolioProjectPreviewHandler);
                    return constellation.prepare(this.renderer).then(
                        () => {
                            this.portfolioConstellation = constellation;
                            constellation.setResponsiveConfig(this.responsiveConfig);
                            constellation.setReveal(
                                this.portfolioConstellationReveal,
                                this.portfolioConstellationRevealImmediate,
                            );
                            constellation.setConstellationScrollProgress(
                                this.portfolioConstellationScrollProgress,
                            );
                            constellation.setProjectPanelBoundaryActive(
                                this.projectPanelBoundaryActive,
                            );
                            constellation.setActiveProjectByScroll(
                                this.portfolioConstellationScrollProgress,
                            );

                            return constellation;
                        },
                        (error) => {
                            constellation.dispose();
                            throw error;
                        },
                    );
                },
            )
            .catch((error) => {
                this.portfolioConstellationPromise = undefined;
                throw error;
            });

        return this.portfolioConstellationPromise;
    }

    private activateCameraController(controller: CameraController): void {
        this.cameraOwner = controller;
    }

    private updateOwnedCamera(): void {
        const controller = this.cameraOwner;

        if (controller === 'projects') {
            this.setBaseCameraFov();
            this.projectsCameraController.update(this.projectsCameraProgress);
        } else if (controller === 'contact') {
            this.contactCameraController.update(this.contactCameraProgress);
        } else if (controller === 'intro') {
            this.setBaseCameraFov();
            this.introCameraController.update(this.sceneState.scrollProgress);
        } else if (controller === 'contact-loop') {
            this.contactCameraController.updateLoopZoomOut(this.contactLoopZoomProgress);
        }
    }

    private setBaseCameraFov(): void {
        const fov = this.responsiveConfig.camera.fov;
        if (Math.abs(this.camera.fov - fov) < 0.001) {
            return;
        }

        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
    }

    private updateMainCloudResponsiveStyle(): void {
        const config = this.responsiveConfig.mainCloud;

        this.mainCloudMaterial.uniforms.uSizeBase.value = config.sizeBase;
        this.mainCloudMaterial.uniforms.uCloudPointSizeScale.value = config.pointSizeScale;
        this.mainCloudMaterial.uniforms.uCloudBrightness.value = 1;
        this.mainCloudMaterial.uniforms.uMobileIntroParticleControl.value =
            config.introParticleControl;
    }

    private createMainCloudParticles(data: MainCloudGeometryData): void {
        const geometry = createCloudParticleGeometryFromData(data.position, data.random);
        const particleMaterial = createMainParticleMaterial();
        particleMaterial.uniforms.uTunnelBokehSizeScale.value =
            this.responsiveConfig.particles.tunnelBokehSizeScale;
        particleMaterial.uniforms.uTunnelRadiusScale.value =
            this.responsiveConfig.particles.tunnelRadiusScale;
        this.mainCloudMaterial = particleMaterial;
        this.updateMainCloudResponsiveStyle();

        const points = new THREE.Points(geometry, particleMaterial);
        points.frustumCulled = false;
        this.scene.add(points);

        const entity = this.entities.create();
        const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;

        this.mainCloudEntity = entity;
        this.mainCloudPositions = new Float32Array(positionAttribute.array);
        this.mainCloudMorphFactor = geometry.getAttribute('morphFactor') as THREE.BufferAttribute;

        this.positions.add(entity, {
            current: new Float32Array(this.mainCloudPositions),
            dirty: false,
        });
        this.renderables.add(entity, { object: points });
        this.raycastInteractions.add(entity, {
            rotationStrength: 0.12,
        });
        this.shaderUniforms.add(entity, {
            material: particleMaterial,
            bindScrollFloatStrength: true,
        });
    }

    private addColoredLight(): THREE.ShaderMaterial {
        const coloredLightMaterial = createColoredLightMaterial(
            this.sceneState.scrollProgress,
            this.responsiveConfig.coloredLight,
        );
        this.coloredLightMaterial = coloredLightMaterial;
        this.scene.add(createColoredLightMesh(coloredLightMaterial));

        this.shaderUniforms.add(this.entities.create(), {
            material: coloredLightMaterial,
            shiftSpeed: 0.2,
            bindScrollProgress: true,
            bindColoredLightVisibility: true,
        });

        return coloredLightMaterial;
    }

    private applyColoredLightResponsiveConfig(config: ResponsiveConfig['coloredLight']): void {
        const uniforms = this.coloredLightMaterial?.uniforms;
        if (!uniforms) {
            return;
        }

        uniforms.uHorizontalScale.value = config.horizontalScale;
        uniforms.uHorizonY.value = config.horizonY;
        uniforms.uSpeed.value = config.speed;
        uniforms.uIntensity.value = config.intensity;
        uniforms.uWidth.value = config.width;
        uniforms.uHeight.value = config.height;
        uniforms.uWaveAmplitudeScale.value = config.waveAmplitudeScale;
        uniforms.uColorWindowSize.value = config.colorWindowSize;
    }
}
