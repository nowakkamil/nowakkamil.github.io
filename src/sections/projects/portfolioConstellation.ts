import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { clamp01 } from '../../utils/animation';
import { yieldToMainThread } from '../../utils/yieldToMainThread';
import {
    CONSTELLATION_CAMERA_FADE_FAR,
    CONSTELLATION_CAMERA_FADE_NEAR,
    GEMINI_FOG_COLORS,
    HIDDEN_CONSTELLATION_OPACITY_EPSILON,
    MOBILE_CROSSFADE_END,
    MOBILE_CROSSFADE_START,
    MOBILE_SEQUENCE_SMOOTHING,
    MOBILE_STACK_CROSSFADE_PROJECT_SPAN,
    PORTFOLIO_CONSTELLATION_FOG_COLORS,
    PROJECT_STAR_ACTIVE_SCALE,
    PROJECT_STAR_SELECTED_OPACITY,
    RIGHTMOST_SELECTED_FOCUS_OFFSET_DESKTOP,
    RIGHTMOST_SELECTED_FOCUS_OFFSET_TABLET,
    SELECTED_PROJECT_FOCUS_OFFSET_MAX,
    SELECTED_PROJECT_FOCUS_OFFSET_MIN,
    SKILL_STARS_SELECTED_OPACITY,
    SKILL_STARS_SELECTED_RESET_OPACITY,
    seeded,
} from './constellationConstants';
import {
    createExpandedBoundaryHull,
    createLineRibbons,
    createProjectEdges,
} from './constellationGeometryBuilder';
import { ConstellationInteraction } from './constellationInteraction';
import { createLabelTexture, createProjectLabelTexture } from './constellationLabelRenderer';
import { getProjectLabelOffset } from './constellationGeometryBuilder';
import {
    getProjectLabelOpacityTarget,
    getProjectStarBaseOpacity,
    getProjectStarBaseScale,
    getProjectStarVisualTargets,
    getSkillLabelOpacityTarget,
    getSkillStarsOpacity,
    getSkillTargetIntensity,
} from './constellationOpacity';
import {
    createFogTexture,
    createLineBlurTexture,
    createStarTexture,
} from './constellationTextureFactory';
import type {
    BoundaryPoint,
    Constellation,
    InteractionTarget,
    PortfolioConstellationOptions,
    PortfolioProject,
    PortfolioProjectPreviewState,
    PortfolioSkill,
    ProjectPreviewHandler,
    ProjectSelectionHandler,
    ProjectStarVisual,
    SkillVisual,
} from './constellationTypes';

export type { Constellation, PortfolioProject, PortfolioProjectPreviewState, PortfolioSkill };
export { PORTFOLIO_CONSTELLATION_FOG_COLORS };

export class PortfolioConstellation {
    public readonly group = new THREE.Group();

    private readonly scene: THREE.Scene;
    private readonly camera: THREE.Camera;
    private readonly textures: THREE.Texture[] = [];
    private readonly skills = new Map<string, SkillVisual>();
    private readonly skillVisuals: SkillVisual[] = [];
    private readonly projectStars: ProjectStarVisual[] = [];
    private readonly projectsBySkill: Map<string, PortfolioProject[]>;
    private readonly constellationSkills: Constellation[];
    private readonly skillCenters: Map<string, THREE.Vector3>;
    private readonly interactionObjects: THREE.Object3D[] = [];
    private readonly coarseInteractionObjects: THREE.Object3D[] = [];
    private readonly basePosition = new THREE.Vector3();
    private baseScale = 1;
    private responsiveConfig: ResponsiveConfig;

    private onProjectSelect?: ProjectSelectionHandler;
    private onProjectClear?: () => void;
    private onProjectPreviewChange?: ProjectPreviewHandler;

    private readonly interaction: ConstellationInteraction;
    private initialized = false;

    private reveal = 0;
    private revealTarget = 0;
    private constellationScrollProgress = 0;
    private mobileSequencePosition = 0;
    private activeProjectIndex = -1;
    private hovered?: InteractionTarget;
    private selected?: InteractionTarget;
    private hoveredObject?: THREE.Object3D;
    private selectedObject?: THREE.Object3D;
    private selectedProjectStar?: ProjectStarVisual;
    private isProjectPanelBoundaryActive = false;
    private lastProjectPreviewStateKey = '';
    private readonly constellationWorldPosition = new THREE.Vector3();
    private readonly constellationViewPosition = new THREE.Vector3();
    private readonly clusterWorldPosition = new THREE.Vector3();
    private readonly clusterPushDirection = new THREE.Vector3();
    private readonly projectStarVisualTargets = {
        targetOpacity: 0,
        targetScale: 0,
    };
    private cursorHovering = false;

    constructor(options: PortfolioConstellationOptions) {
        this.scene = options.scene;
        this.camera = options.camera;
        this.responsiveConfig = options.responsiveConfig;
        this.onProjectSelect = options.onProjectSelect;
        this.onProjectClear = options.onProjectClear;
        this.updateResponsiveBaseTransform();
        this.group.name = 'PortfolioConstellation';
        this.group.position.copy(this.basePosition);
        this.group.scale.setScalar(this.baseScale);

        this.constellationSkills = options.constellations.slice(0, 3);
        this.projectsBySkill = this.createProjectsBySkill(
            options.projects,
            this.constellationSkills.map((skill) => skill.id),
        );
        this.skillCenters = this.createSkillCenters(this.constellationSkills);

        this.interaction = new ConstellationInteraction(this.camera, options.domElement, {
            getProjectStars: () => this.projectStars,
            getInteractionObjects: () => this.interactionObjects,
            getCoarseInteractionObjects: () => this.coarseInteractionObjects,
            isProjectPanelBoundaryActive: () => this.isProjectPanelBoundaryActive,
            getActiveMobileSkillId: () => this.getActiveMobileSkillId(),
            getActiveProjectStar: () => this.projectStars[this.activeProjectIndex],
            hasSelectedProjectInSkill: (id) => this.hasSelectedProjectInSkill(id),
            getSelectedProjectStar: () => this.selectedProjectStar,
            onHoverChange: (obj, target) => {
                const prev = this.hoveredObject;
                this.hoveredObject = obj;
                this.hovered = target;
                if (prev !== obj) {
                    this.emitProjectPreviewState();
                }
            },
            onSelectionChange: (obj, target) => {
                this.selectedObject = obj;
                this.selected = target;
            },
            onProjectStarSelect: (star) => this.selectProjectStar(star),
            onProjectClear: () => this.clearSelectedProject(),
            setCursorHovering: (h) => this.setCursorHovering(h),
            emitProjectPreviewState: () => this.emitProjectPreviewState(),
            responsiveConfig: () => this.responsiveConfig,
        });
    }

    private initialize(): void {
        if (this.initialized) {
            return;
        }
        this.initialized = true;

        const starTexture = createStarTexture();
        const fogTexture = createFogTexture();
        const lineBlurTexture = createLineBlurTexture();

        this.textures.push(starTexture, fogTexture, lineBlurTexture);

        this.constellationSkills.forEach((skill, index) => {
            const center = this.skillCenters.get(skill.id) ?? new THREE.Vector3();
            this.createSkillCluster(skill, center, starTexture, fogTexture, lineBlurTexture, index);
        });
        this.skillVisuals.push(...this.skills.values());
        this.interaction.syncKeyboardNavigator();
        this.interaction.setKeyboardActiveSkill(this.getActiveMobileSkillId());

        this.applyReveal(this.reveal);
        this.scene.add(this.group);
    }

    public update(delta: number, elapsed: number): void {
        this.reveal = THREE.MathUtils.damp(this.reveal, this.revealTarget, 5.5, delta);
        this.group.visible = this.reveal > 0.001 || this.revealTarget > 0.001;
        if (!this.group.visible) {
            return;
        }

        this.group.position.copy(this.basePosition);
        this.group.scale.setScalar(this.baseScale);

        this.group.updateMatrixWorld(false);
        this.camera.updateMatrixWorld(false);

        const skillVisuals = this.skillVisuals;
        const mobileSequenceTarget = this.getMobileSequencePosition(skillVisuals);
        const previousActiveMobileSkillId = this.getActiveMobileSkillId(skillVisuals);
        this.mobileSequencePosition =
            this.responsiveConfig.isMobile && !this.responsiveConfig.reducedMotion
                ? THREE.MathUtils.damp(
                      this.mobileSequencePosition,
                      mobileSequenceTarget,
                      MOBILE_SEQUENCE_SMOOTHING,
                      delta,
                  )
                : mobileSequenceTarget;
        const activeMobileSkillId = this.getActiveMobileSkillId(skillVisuals);

        if (previousActiveMobileSkillId !== activeMobileSkillId) {
            this.interaction.setKeyboardActiveSkill(activeMobileSkillId);
            this.clearHoverState();
            if (this.selectedProjectStar?.skillId !== activeMobileSkillId) {
                this.clearSelectedProject();
            }
        }

        for (const skill of skillVisuals) {
            this.updateSkillVisual(skill, delta, elapsed);
        }

        const motionScale = this.responsiveConfig.constellation.motionScale;
        this.group.rotation.y = Math.sin(elapsed * 0.035) * 0.05 * motionScale;
        this.group.rotation.x = Math.sin(elapsed * 0.045 + 1.3) * 0.03 * motionScale;
        this.group.rotation.z = Math.sin(elapsed * 0.025 + 0.5) * 0.015 * motionScale;
    }

    public setReveal(progress: number, immediate = false): void {
        const nextReveal = clamp01(progress);
        if (nextReveal > 0) {
            this.initialize();
        }

        if (immediate) {
            this.applyReveal(nextReveal);
            return;
        }

        this.revealTarget = nextReveal;
    }

    public async prepare(renderer: THREE.WebGLRenderer): Promise<void> {
        await yieldToMainThread();
        this.initialize();

        for (const texture of this.textures) {
            renderer.initTexture(texture);
            await yieldToMainThread();
        }

        await renderer.compileAsync(this.group, this.camera, this.scene);
        await yieldToMainThread();
    }

    public setConstellationScrollProgress(progress: number): void {
        const nextProgress = clamp01(progress);
        this.constellationScrollProgress = nextProgress;
    }

    public setActiveProjectByScroll(progress: number): void {
        if (!this.isProjectPanelBoundaryActive || this.projectStars.length === 0) {
            const hadActiveProject = this.activeProjectIndex !== -1;
            this.activeProjectIndex = -1;
            if (!this.isProjectPanelBoundaryActive) {
                this.clearSelectedProject();
            }
            if (hadActiveProject) {
                this.emitProjectPreviewState();
            }
            return;
        }

        const rawIndex = Math.floor(clamp01(progress) * this.projectStars.length);
        const nextActiveProjectIndex = THREE.MathUtils.clamp(
            rawIndex,
            0,
            this.projectStars.length - 1,
        );

        if (this.activeProjectIndex === nextActiveProjectIndex) {
            return;
        }

        this.activeProjectIndex = nextActiveProjectIndex;
        this.interaction.setKeyboardActiveProjectByScroll(
            this.projectStars[this.activeProjectIndex],
        );
        this.emitProjectPreviewState();
    }

    public setProjectPreviewHandler(onProjectPreviewChange?: ProjectPreviewHandler): void {
        this.onProjectPreviewChange = onProjectPreviewChange;
        this.lastProjectPreviewStateKey = '';
        this.emitProjectPreviewState();
    }

    public setProjectPanelBoundaryActive(active: boolean): void {
        if (active) {
            this.initialize();
        }
        this.interaction.setKeyboardNavigationActive(active);
        if (this.isProjectPanelBoundaryActive === active) {
            return;
        }

        this.isProjectPanelBoundaryActive = active;

        if (!active) {
            this.activeProjectIndex = -1;
            if (this.hoveredObject?.name.startsWith('SkillClusterHitArea:')) {
                this.hoveredObject = undefined;
                this.hovered = undefined;
            }
            this.clearSelectedProject();
        }

        this.emitProjectPreviewState();
    }

    public getProjectPanelBoundaryActive(): boolean {
        return this.isProjectPanelBoundaryActive;
    }

    public clearSelectedProject(): void {
        if (!this.selectedProjectStar && !this.selectedObject) {
            return;
        }

        this.selectedProjectStar = undefined;
        this.selectedObject = undefined;
        this.selected = undefined;
        this.interaction.setKeyboardSelectedProject();
        this.onProjectClear?.();
        this.emitProjectPreviewState();
    }

    public selectAdjacentProject(direction: number): void {
        this.initialize();
        if (!this.isProjectPanelBoundaryActive || this.projectStars.length === 0) {
            return;
        }

        const activeMobileSkillId = this.getActiveMobileSkillId();
        const candidates = activeMobileSkillId
            ? this.projectStars.filter((projectStar) => projectStar.skillId === activeMobileSkillId)
            : this.projectStars;
        if (candidates.length === 0) {
            return;
        }

        const selectedIndex = this.selectedProjectStar
            ? candidates.indexOf(this.selectedProjectStar)
            : -1;
        const activeProject = this.projectStars[this.activeProjectIndex];
        const activeIndex = activeProject ? candidates.indexOf(activeProject) : -1;
        const currentIndex = selectedIndex >= 0 ? selectedIndex : Math.max(activeIndex, 0);
        const nextIndex = THREE.MathUtils.euclideanModulo(
            currentIndex + Math.sign(direction || 1),
            candidates.length,
        );

        this.selectProjectStar(candidates[nextIndex]);
    }

    public selectProjectById(projectId: string): void {
        this.initialize();
        if (!this.isProjectPanelBoundaryActive) {
            return;
        }

        const projectStar = this.projectStars.find((star) => star.project.id === projectId);

        if (projectStar) {
            this.selectProjectStar(projectStar);
        }
    }

    public setResponsiveConfig(responsiveConfig: ResponsiveConfig): void {
        this.responsiveConfig = responsiveConfig;
        this.interaction.setKeyboardNavigationActive(this.isProjectPanelBoundaryActive);
        this.updateResponsiveBaseTransform();
        this.group.position.copy(this.basePosition);
        this.group.scale.setScalar(this.baseScale);
        this.applyResponsiveVisualCompensation();

        if (!responsiveConfig.hasFinePointer) {
            this.clearHoverState();
        }

        const activeMobileSkillId = this.getActiveMobileSkillId();
        this.interaction.setKeyboardActiveSkill(activeMobileSkillId);
        if (activeMobileSkillId && this.hovered?.id !== activeMobileSkillId) {
            this.clearHoverState();
        }
        if (activeMobileSkillId && this.selectedProjectStar?.skillId !== activeMobileSkillId) {
            this.clearSelectedProject();
        }
    }

    public dispose(): void {
        this.interaction.dispose();
        this.scene.remove(this.group);

        this.group.traverse((object) => {
            if ('geometry' in object) {
                (object.geometry as THREE.BufferGeometry | undefined)?.dispose();
            }

            if ('material' in object) {
                const material = object.material as THREE.Material | THREE.Material[] | undefined;

                if (Array.isArray(material)) {
                    for (const item of material) {
                        item.dispose();
                    }
                } else {
                    material?.dispose();
                }
            }
        });

        for (const texture of this.textures) {
            texture.dispose();
        }

        this.skills.clear();
        this.interactionObjects.length = 0;
        this.coarseInteractionObjects.length = 0;
    }

    private updateSkillVisual(skill: SkillVisual, delta: number, elapsed: number): void {
        this.updateSkillLayout(skill);
        const sequenceOpacity = this.getMobileSequenceOpacity(skill, this.mobileSequencePosition);
        const isHovered = this.isProjectPanelBoundaryActive && this.hovered?.id === skill.skill.id;
        const hasSelectedProject = this.selectedProjectStar !== undefined;
        const hasActiveProject = this.activeProjectIndex >= 0;
        const selectedSkill = this.hasSelectedProjectInSkill(skill.skill.id);
        const hideConstellationsForDetails = hasSelectedProject && this.responsiveConfig.isMobile;
        const target = getSkillTargetIntensity(
            skill.skill.id,
            this.isProjectPanelBoundaryActive,
            this.hovered,
            this.selected,
        );
        const visualCenterX = skill.center.x + skill.layoutOffset.x;
        const rightmostFocusOffset =
            selectedSkill &&
            !this.responsiveConfig.isMobile &&
            skill.skillIndex === this.skillVisuals.length - 1
                ? this.responsiveConfig.mode === 'desktop'
                    ? RIGHTMOST_SELECTED_FOCUS_OFFSET_DESKTOP
                    : RIGHTMOST_SELECTED_FOCUS_OFFSET_TABLET
                : 0;
        const focusXTarget = selectedSkill
            ? THREE.MathUtils.clamp(
                  this.responsiveConfig.constellation.selectedFocusX -
                      visualCenterX +
                      rightmostFocusOffset,
                  SELECTED_PROJECT_FOCUS_OFFSET_MIN,
                  SELECTED_PROJECT_FOCUS_OFFSET_MAX,
              )
            : 0;
        const focusZTarget = selectedSkill ? 1.46 : 0;
        const focusScaleTarget = selectedSkill ? 1.18 : 1;
        const opacityTarget = hideConstellationsForDetails
            ? 0
            : hasSelectedProject
              ? selectedSkill
                  ? 1
                  : 0
              : 1;

        skill.focusOffset.x = THREE.MathUtils.damp(skill.focusOffset.x, focusXTarget, 4.2, delta);
        skill.focusOffset.y = THREE.MathUtils.damp(skill.focusOffset.y, 0, 4.2, delta);
        skill.focusOffset.z = THREE.MathUtils.damp(skill.focusOffset.z, focusZTarget, 4.2, delta);
        skill.focusScale = THREE.MathUtils.damp(skill.focusScale, focusScaleTarget, 4.8, delta);
        skill.opacityMultiplier = THREE.MathUtils.damp(
            skill.opacityMultiplier,
            opacityTarget,
            3.1,
            delta,
        );
        const shouldHideUnfocusedSkill =
            hasSelectedProject && (hideConstellationsForDetails || !selectedSkill);
        if (
            shouldHideUnfocusedSkill &&
            skill.opacityMultiplier < HIDDEN_CONSTELLATION_OPACITY_EPSILON
        ) {
            skill.opacityMultiplier = 0;
        }
        skill.intensity = THREE.MathUtils.damp(skill.intensity, target, 2.8, delta);
        const focus = clamp01((skill.intensity - 0.06) / 0.22);
        const scale = THREE.MathUtils.lerp(1, 1.08, focus);
        const visualScale = scale * skill.focusScale;
        const focusScaleOffsetX = skill.center.x * (1 - visualScale);
        const focusScaleOffsetY = skill.center.y * (1 - visualScale);
        const focusScaleOffsetZ = skill.center.z * (1 - visualScale);

        const zTarget = isHovered ? 1.6 * this.responsiveConfig.constellation.motionScale : 0;
        skill.zOffset = THREE.MathUtils.damp(skill.zOffset, zTarget, 2.2, delta);

        const clusterWorld = this.clusterWorldPosition
            .copy(skill.center)
            .add(skill.layoutOffset)
            .applyMatrix4(this.group.matrixWorld);
        const pushDir = this.clusterPushDirection
            .copy(this.camera.position)
            .sub(clusterWorld)
            .normalize();
        const pushVec = pushDir.multiplyScalar(skill.zOffset);

        const drift =
            Math.sin(elapsed * 0.07 + skill.driftPhase) *
            0.06 *
            this.responsiveConfig.constellation.motionScale;
        const offsetX = skill.layoutOffset.x + pushVec.x + skill.focusOffset.x + focusScaleOffsetX;
        const offsetY =
            skill.layoutOffset.y + drift + pushVec.y + skill.focusOffset.y + focusScaleOffsetY;
        const offsetZ = skill.layoutOffset.z + pushVec.z + skill.focusOffset.z + focusScaleOffsetZ;
        skill.stars.position.set(offsetX, offsetY, offsetZ);
        skill.lines.position.copy(skill.stars.position);
        skill.hitArea.position
            .copy(skill.hitArea.userData.basePosition as THREE.Vector3)
            .multiplyScalar(visualScale);
        skill.hitArea.position.x += offsetX;
        skill.hitArea.position.y += offsetY;
        skill.hitArea.position.z += offsetZ;

        const fogHorizontalOffset =
            visualCenterX < 0
                ? visualCenterX * (this.responsiveConfig.constellation.fogSpreadScale - 1)
                : 0;
        for (const sprite of skill.fogSprites) {
            const base = sprite.userData.baseWorldPosition as THREE.Vector3 | undefined;
            if (base) {
                sprite.position.set(
                    base.x * visualScale + offsetX + fogHorizontalOffset,
                    base.y * visualScale + offsetY,
                    base.z * visualScale + offsetZ,
                );
            }
        }

        if (skill.labelSprite) {
            const base = skill.labelSprite.userData.baseLabelPosition as THREE.Vector3 | undefined;
            if (base) {
                skill.labelSprite.position.copy(base).add(skill.layoutOffset);
            }
        }
        skill.stars.scale.setScalar(visualScale);
        skill.lines.scale.setScalar(visualScale);
        skill.hitArea.scale.setScalar(visualScale);
        const cameraDepthFade = this.getConstellationCameraDepthFade(skill.stars);
        const skillPresence =
            this.reveal * skill.opacityMultiplier * sequenceOpacity * cameraDepthFade;
        skill.starMaterial.opacity =
            getSkillStarsOpacity(
                hasSelectedProject,
                selectedSkill,
                SKILL_STARS_SELECTED_OPACITY,
                this.isProjectPanelBoundaryActive,
            ) * skillPresence;

        skill.lineMaterials[0].opacity = THREE.MathUtils.lerp(0.16, 0.3, focus) * skillPresence;
        skill.lineMaterials[1].opacity = THREE.MathUtils.lerp(0.32, 0.52, focus) * skillPresence;
        if (skill.lineTintMaterials.length > 0) {
            skill.lineTintMaterials[0].opacity =
                THREE.MathUtils.lerp(0.1, 0.2, focus) * skillPresence;
        }
        skill.fogMaterials[0].opacity = THREE.MathUtils.lerp(0.2, 0.34, focus) * skillPresence;
        skill.fogMaterials[1].opacity = THREE.MathUtils.lerp(0.1, 0.2, focus) * skillPresence;
        this.updateFogSpriteScale(
            skill.fogSprites[0],
            skill.focusScale * THREE.MathUtils.lerp(1, 1.04, focus),
        );
        this.updateFogSpriteScale(
            skill.fogSprites[1],
            skill.focusScale * THREE.MathUtils.lerp(1, 1.06, focus),
        );
        if (skill.labelMaterial) {
            const labelTarget = getSkillLabelOpacityTarget(
                skill.skill.id,
                isHovered,
                this.isProjectPanelBoundaryActive,
                this.selected,
                this.selectedProjectStar,
            );

            skill.labelMaterial.opacity = THREE.MathUtils.damp(
                skill.labelMaterial.opacity,
                labelTarget * skillPresence,
                3.2,
                delta,
            );
        }

        for (const projectStar of skill.projectStars) {
            const hoveredStar =
                this.isProjectPanelBoundaryActive && projectStar.hitTarget === this.hoveredObject;
            const selectedStar = projectStar === this.selectedProjectStar;
            const activeStar = this.isActiveProject(projectStar);
            const labelTarget = getProjectLabelOpacityTarget(
                skill.skill.id,
                selectedStar,
                activeStar,
                hoveredStar,
                isHovered,
                hasSelectedProject,
                hasActiveProject,
                this.isProjectPanelBoundaryActive,
                this.selected,
            );

            if (projectStar.labelMaterial) {
                projectStar.labelMaterial.opacity = THREE.MathUtils.damp(
                    projectStar.labelMaterial.opacity,
                    labelTarget * skillPresence,
                    3.4,
                    delta,
                );
            }
        }

        const hoveredProjectStar = this.getHoveredProjectStar();
        const activeProjectStar = this.projectStars[this.activeProjectIndex];

        for (const projectStar of skill.projectStars) {
            const material = projectStar.hitTarget.material as THREE.SpriteMaterial;
            const basePosition = projectStar.entity.userData.basePosition as THREE.Vector3;
            const { targetScale, targetOpacity } = getProjectStarVisualTargets(
                projectStar,
                hoveredProjectStar,
                this.selectedProjectStar,
                activeProjectStar,
                hasSelectedProject,
                this.isProjectPanelBoundaryActive,
                this.projectStarVisualTargets,
            );

            projectStar.entity.position.copy(basePosition).multiplyScalar(visualScale);
            projectStar.entity.position.x += offsetX;
            projectStar.entity.position.y += offsetY;
            projectStar.entity.position.z += offsetZ;
            material.opacity = THREE.MathUtils.damp(
                material.opacity,
                targetOpacity * skillPresence,
                10.0,
                delta,
            );
            projectStar.entity.scale.setScalar(
                THREE.MathUtils.damp(projectStar.entity.scale.x, targetScale, 9.0, delta),
            );

            if (projectStar.labelSprite && projectStar.labelScale && projectStar.labelOffset) {
                const entityScale = Math.max(projectStar.entity.scale.x, 0.001);

                projectStar.labelSprite.position
                    .copy(projectStar.labelOffset)
                    .divideScalar(entityScale);
                projectStar.labelSprite.scale.set(
                    projectStar.labelScale.x / entityScale,
                    projectStar.labelScale.y / entityScale,
                    1,
                );
            }
        }
    }

    private createSkillCenters(skills: PortfolioSkill[]): Map<string, THREE.Vector3> {
        const map = new Map<string, THREE.Vector3>();
        const spreadX = this.responsiveConfig.constellation.clusterSpread;
        const rowY = 0.85;
        const rowZ = -3.2;
        const centerOffset = (skills.length - 1) * 0.5;

        skills.forEach((skill, index) => {
            map.set(skill.id, new THREE.Vector3((index - centerOffset) * spreadX, rowY, rowZ));
        });

        return map;
    }

    private createProjectsBySkill(
        projects: PortfolioProject[],
        visibleSkillIds: string[],
    ): Map<string, PortfolioProject[]> {
        const map = new Map<string, PortfolioProject[]>();

        for (const project of projects) {
            const skillId = project.constellation.id;

            if (!visibleSkillIds.includes(skillId)) {
                continue;
            }

            const bucket = map.get(skillId) ?? [];

            bucket.push(project);
            map.set(skillId, bucket);
        }

        return map;
    }

    private createSkillCluster(
        skill: PortfolioSkill,
        center: THREE.Vector3,
        starTexture: THREE.Texture,
        fogTexture: THREE.Texture,
        lineBlurTexture: THREE.Texture,
        skillIndex: number,
    ): void {
        const projects = this.projectsBySkill.get(skill.id) ?? [];
        const starGeometry = new THREE.BufferGeometry();
        const starPositions = new Float32Array(projects.length * 3);
        const starSizes = new Float32Array(projects.length);
        const nodeScale = 2;
        const tilt = (skillIndex - 1) * 0.055;
        const baseStarSize = this.responsiveConfig.isMobile ? 1.08 : 1.38;

        for (let index = 0; index < projects.length; index += 1) {
            const project = projects[index];
            const node = new THREE.Vector3(...project.constellation.position);
            const offset = index * 3;
            const x = node.x * nodeScale;
            const y = node.y * nodeScale;

            starPositions[offset] = center.x + x * Math.cos(tilt) - y * Math.sin(tilt);
            starPositions[offset + 1] = center.y + x * Math.sin(tilt) + y * Math.cos(tilt);
            starPositions[offset + 2] = center.z + node.z;

            const rand = seeded(project.id.length * 31 + index * 7);
            starSizes[index] = baseStarSize * (0.72 + rand * 0.72);
        }

        const fogColor = GEMINI_FOG_COLORS[skillIndex % GEMINI_FOG_COLORS.length];
        const fog = this.createSkillFog(skill, center, fogTexture, fogColor);

        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

        const starMaterial = new THREE.PointsMaterial({
            color: new THREE.Color(0xffffff),
            size: baseStarSize,
            map: starTexture,
            transparent: true,
            opacity: 0.98,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
            toneMapped: false,
        });
        const stars = new THREE.Points(starGeometry, starMaterial);
        stars.name = `SkillCluster:${skill.id}`;
        stars.renderOrder = 6;
        this.group.add(stars);

        const lineVeilMaterial = new THREE.MeshBasicMaterial({
            color: fogColor.clone().lerp(new THREE.Color(0xaaddff), 0.45),
            map: lineBlurTexture,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        const lineCoreMaterial = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0xffffff),
            map: lineBlurTexture,
            transparent: true,
            opacity: 0.32,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        const lineTintMaterial = new THREE.MeshBasicMaterial({
            color: fogColor.clone().lerp(new THREE.Color(0xffffff), 0.25),
            map: lineBlurTexture,
            transparent: true,
            opacity: 0.1,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        const mobile = this.responsiveConfig.isMobile;
        const tintWidth = mobile ? 0.04 : 0.05;
        const projectEdges = createProjectEdges(projects);
        const lines = createLineRibbons(
            projectEdges,
            starPositions,
            lineVeilMaterial,
            lineCoreMaterial,
            lineTintMaterial,
            tintWidth,
            mobile,
        );

        lines.name = `SkillTreeLines:${skill.id}`;
        lines.renderOrder = 5;
        this.group.add(lines);

        const projectStars = this.createSkillStarEntities(
            skill,
            projects,
            starPositions,
            starTexture,
        );
        const hitArea = this.createSkillAreaHitTarget(skill, starPositions);
        this.skills.set(skill.id, {
            skill,
            skillIndex,
            center,
            layoutOffset: new THREE.Vector3(),
            fogColor,
            starMaterial,
            lineMaterials: [lineVeilMaterial, lineCoreMaterial],
            lineTintMaterials: [lineTintMaterial],
            fogMaterials: fog.materials,
            fogSprites: fog.sprites,
            projectStars,
            stars,
            lines,
            hitArea,
            intensity: 0.06,
            driftPhase: skillIndex * 2.1,
            zOffset: 0,
            focusOffset: new THREE.Vector3(),
            focusScale: 1,
            opacityMultiplier: 1,
        });
        this.createSkillLabel(skill.id, skill.label, center);
        this.createProjectLabels(skill.id, center, projectStars, projectEdges);
    }

    private createSkillLabel(skillId: string, label: string, center: THREE.Vector3): void {
        const skill = this.skills.get(skillId);

        if (!skill) {
            return;
        }

        const labelTexture = createLabelTexture(label, this.responsiveConfig);
        const labelMaterial = new THREE.SpriteMaterial({
            map: labelTexture,
            color: skill.fogColor.clone().lerp(new THREE.Color(0xffffff), 0.68),
            transparent: true,
            opacity: 0.24 * this.reveal,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
        });
        const labelSprite = new THREE.Sprite(labelMaterial);
        const authoredLabelScale = this.responsiveConfig.isMobile ? 2.08 : 2.62;
        const labelScale = authoredLabelScale * this.responsiveConfig.constellation.labelScale;
        const labelRowY = 0.3 - (this.responsiveConfig.isMobile ? 3.25 : 4.25);
        const labelRowZ = -3.12;
        const labelImage = labelTexture.image as HTMLCanvasElement;

        labelSprite.name = `SkillClusterLabel:${skillId}`;
        labelSprite.position.set(center.x, labelRowY, labelRowZ);
        labelSprite.scale.set(labelScale, labelScale * (labelImage.height / labelImage.width), 1);
        labelSprite.renderOrder = 8;

        labelSprite.userData.baseLabelPosition = labelSprite.position.clone();
        labelSprite.userData.authoredBaseScale = new THREE.Vector2(
            authoredLabelScale,
            authoredLabelScale * (labelImage.height / labelImage.width),
        );

        this.textures.push(labelTexture);
        this.group.add(labelSprite);
        skill.labelMaterial = labelMaterial;
        skill.labelSprite = labelSprite;
    }

    private createProjectLabels(
        skillId: string,
        center: THREE.Vector3,
        projectStars: ProjectStarVisual[],
        edges: readonly (readonly [number, number])[],
    ): void {
        const skill = this.skills.get(skillId);

        if (!skill || projectStars.length === 0) {
            return;
        }

        const mobile = this.responsiveConfig.isMobile;
        const authoredLabelScale = mobile ? 1.66 : 2.06;
        const labelScale = authoredLabelScale * this.responsiveConfig.constellation.labelScale;
        const labelOffset = mobile ? 0.56 : 0.7;
        const starPositions = projectStars.map(
            (projectStar) => projectStar.entity.userData.basePosition as THREE.Vector3,
        );

        projectStars.forEach((projectStar, index) => {
            const project = projectStar.project;
            const labelTexture = createProjectLabelTexture(project.label, this.responsiveConfig);
            const material = new THREE.SpriteMaterial({
                map: labelTexture,
                transparent: true,
                opacity: 0.42 * this.reveal,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
            });
            const sprite = new THREE.Sprite(material);
            const labelImage = labelTexture.image as HTMLCanvasElement;
            const labelScaleVector = new THREE.Vector2(
                labelScale,
                labelScale * (labelImage.height / labelImage.width),
            );
            const labelOffsetVector = getProjectLabelOffset(
                index,
                center,
                starPositions,
                edges,
                labelScaleVector,
                labelOffset,
            );
            const [offsetX, offsetY] = project.constellation.labelOffset ?? [0, 0];
            labelOffsetVector.x += offsetX;
            labelOffsetVector.y += offsetY;

            sprite.name = `ProjectStarLabel:${skillId}:${project.id}`;
            sprite.position.copy(labelOffsetVector);
            sprite.scale.set(labelScaleVector.x, labelScaleVector.y, 1);
            sprite.renderOrder = 9;

            this.textures.push(labelTexture);
            projectStar.entity.add(sprite);
            projectStar.labelMaterial = material;
            projectStar.labelSprite = sprite;
            projectStar.labelScale = labelScaleVector;
            projectStar.labelBaseScale = new THREE.Vector2(
                authoredLabelScale,
                authoredLabelScale * (labelImage.height / labelImage.width),
            );
            projectStar.labelOffset = labelOffsetVector;
        });
    }

    private createSkillStarEntities(
        skill: PortfolioSkill,
        projects: PortfolioProject[],
        starPositions: Float32Array,
        starTexture: THREE.Texture,
    ): ProjectStarVisual[] {
        const projectStars: ProjectStarVisual[] = [];
        const hitScale = this.responsiveConfig.isMobile ? 1.6 : 2.05;

        for (let index = 0; index < projects.length; index += 1) {
            const project = projects[index];
            const offset = index * 3;
            const entity = new THREE.Group();
            const hitMaterial = new THREE.SpriteMaterial({
                color: 0xffffff,
                map: starTexture,
                transparent: true,
                opacity: 0.12,
                depthTest: false,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
            });
            const hitTarget = new THREE.Sprite(hitMaterial);
            const touchHitMaterial = new THREE.SpriteMaterial({
                transparent: true,
                opacity: 0,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
            });
            const touchHitTarget = new THREE.Sprite(touchHitMaterial);

            touchHitMaterial.colorWrite = false;

            entity.name = `ProjectStarEntity:${skill.id}:${project.id}`;
            entity.position.set(
                starPositions[offset],
                starPositions[offset + 1],
                starPositions[offset + 2],
            );
            entity.userData.basePosition = entity.position.clone();
            entity.userData.project = project;

            hitTarget.name = `SkillStarHit:${skill.id}:${project.id}`;
            hitTarget.scale.setScalar(hitScale);
            hitTarget.userData.constellationTarget = {
                type: 'skill',
                id: skill.id,
            } satisfies InteractionTarget;

            touchHitTarget.name = `SkillStarTouchHit:${skill.id}:${project.id}`;
            touchHitTarget.scale.setScalar(
                hitScale * this.responsiveConfig.constellation.touchHitScale,
            );
            touchHitTarget.userData.baseHitScale = hitScale;
            touchHitTarget.visible = this.responsiveConfig.hasCoarsePointer;
            touchHitTarget.userData.constellationTarget = {
                type: 'skill',
                id: skill.id,
            } satisfies InteractionTarget;

            entity.add(hitTarget, touchHitTarget);
            this.group.add(entity);
            this.interactionObjects.push(hitTarget);
            this.coarseInteractionObjects.push(touchHitTarget);
            const projectStar = {
                project,
                skillId: skill.id,
                entity,
                hitTarget,
                touchHitTarget,
            };

            projectStars.push(projectStar);
            this.projectStars.push(projectStar);
        }

        return projectStars;
    }

    private createSkillAreaHitTarget(
        skill: PortfolioSkill,
        starPositions: Float32Array,
    ): THREE.Mesh {
        const points: BoundaryPoint[] = [];
        const center = new THREE.Vector3();

        for (let index = 0; index < starPositions.length / 3; index += 1) {
            const offset = index * 3;
            const x = starPositions[offset];
            const y = starPositions[offset + 1];
            const z = starPositions[offset + 2];

            points.push({ x, y });
            center.x += x;
            center.y += y;
            center.z += z;
        }

        const pointCount = Math.max(points.length, 1);

        center.multiplyScalar(1 / pointCount);
        const authoredBoundaryPadding = this.responsiveConfig.isMobile ? 0.82 : 1.05;
        const boundaryPadding = this.responsiveConfig.hasCoarsePointer
            ? Math.max(
                  authoredBoundaryPadding,
                  this.responsiveConfig.constellation.boundaryHitScale,
              )
            : authoredBoundaryPadding;
        const hull = createExpandedBoundaryHull(points, center, boundaryPadding);
        const shape = new THREE.Shape(
            hull.map((point) => new THREE.Vector2(point.x - center.x, point.y - center.y)),
        );
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
        });
        const hitArea = new THREE.Mesh(geometry, material);

        hitArea.name = `SkillClusterHitArea:${skill.id}`;
        hitArea.position.set(center.x, center.y, center.z + 0.2);
        hitArea.userData.basePosition = hitArea.position.clone();
        hitArea.userData.constellationTarget = {
            type: 'skill',
            id: skill.id,
        } satisfies InteractionTarget;

        this.group.add(hitArea);
        this.interactionObjects.push(hitArea);

        return hitArea;
    }

    private createSkillFog(
        skill: PortfolioSkill,
        center: THREE.Vector3,
        texture: THREE.Texture,
        color: THREE.Color,
    ): { materials: THREE.SpriteMaterial[]; sprites: THREE.Sprite[] } {
        const mobile = this.responsiveConfig.isMobile;
        const broadMaterial = new THREE.SpriteMaterial({
            color: color.clone().multiplyScalar(1.05),
            map: texture,
            transparent: true,
            opacity: 0.16,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        });
        const coreMaterial = new THREE.SpriteMaterial({
            color: color.clone().lerp(new THREE.Color(0xf5fbff), 0.32),
            map: texture,
            transparent: true,
            opacity: 0.075,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
        });
        const broad = new THREE.Sprite(broadMaterial);
        const core = new THREE.Sprite(coreMaterial);
        const authoredBroadScale = mobile ? 11.4 : 15.2;
        const authoredCoreScale = mobile ? 7.4 : 9.8;
        const broadScale = authoredBroadScale * this.responsiveConfig.constellation.fogScale;
        const coreScale = authoredCoreScale * this.responsiveConfig.constellation.fogScale;

        const broadAspect = 1.05 + seeded(skill.id.length + 17) * 0.15;
        const coreAspect = 1.1 + seeded(skill.id.length + 31) * 0.12;

        broad.name = `SkillClusterFog:${skill.id}:broad`;
        broad.position.set(
            center.x + (seeded(skill.id.length + 43) - 0.5) * 0.5,
            center.y + (mobile ? 0.22 : 0.3),
            center.z - 0.18,
        );
        broad.scale.set(broadScale, broadScale * broadAspect, 1);
        broad.material.rotation = (seeded(skill.id.length + 59) - 0.5) * 0.9;
        broad.renderOrder = 3;
        broad.userData.baseScale = new THREE.Vector2(broadScale, broadScale * broadAspect);
        broad.userData.authoredBaseScale = new THREE.Vector2(
            authoredBroadScale,
            authoredBroadScale * broadAspect,
        );

        broad.userData.baseWorldPosition = broad.position.clone();

        core.name = `SkillClusterFog:${skill.id}:core`;
        core.position.set(
            center.x + (seeded(skill.id.length + 71) - 0.5) * 0.32,
            center.y + (mobile ? 0.28 : 0.36),
            center.z - 0.08,
        );
        core.scale.set(coreScale, coreScale * coreAspect, 1);
        core.material.rotation = (seeded(skill.id.length + 83) - 0.5) * 1.2;
        core.renderOrder = 4;
        core.userData.baseScale = new THREE.Vector2(coreScale, coreScale * coreAspect);
        core.userData.authoredBaseScale = new THREE.Vector2(
            authoredCoreScale,
            authoredCoreScale * coreAspect,
        );

        core.userData.baseWorldPosition = core.position.clone();

        this.group.add(broad, core);

        return {
            materials: [broadMaterial, coreMaterial],
            sprites: [broad, core],
        };
    }

    private updateSkillLayout(skill: SkillVisual): void {
        const skillCount = this.skills.size;
        const rowY = 0.85;
        const rowZ = -3.2;
        const centerOffset = (skillCount - 1) * 0.5;
        const targetX = this.responsiveConfig.isMobile
            ? 0
            : (skill.skillIndex - centerOffset) * this.responsiveConfig.constellation.clusterSpread;

        skill.layoutOffset.set(
            targetX - skill.center.x,
            rowY - skill.center.y,
            rowZ - skill.center.z,
        );
    }

    private updateResponsiveBaseTransform(): void {
        const [x, y, z] = this.responsiveConfig.constellation.position;

        this.basePosition.set(x, y, z);
        this.baseScale = this.responsiveConfig.constellation.scale;
    }

    private applyResponsiveVisualCompensation(): void {
        const { labelScale, fogScale, touchHitScale } = this.responsiveConfig.constellation;

        for (const skill of this.skills.values()) {
            for (const sprite of skill.fogSprites) {
                const authoredScale = sprite.userData.authoredBaseScale as
                    | THREE.Vector2
                    | undefined;

                if (!authoredScale) {
                    continue;
                }

                sprite.userData.baseScale = authoredScale.clone().multiplyScalar(fogScale);
                this.updateFogSpriteScale(sprite, skill.focusScale);
            }

            const skillLabel = skill.labelSprite;
            const authoredLabelScale = skillLabel?.userData.authoredBaseScale as
                | THREE.Vector2
                | undefined;
            if (skillLabel && authoredLabelScale) {
                skillLabel.scale.set(
                    authoredLabelScale.x * labelScale,
                    authoredLabelScale.y * labelScale,
                    1,
                );
            }

            for (const projectStar of skill.projectStars) {
                const baseHitScale = projectStar.touchHitTarget.userData.baseHitScale as
                    | number
                    | undefined;
                if (baseHitScale !== undefined) {
                    projectStar.touchHitTarget.scale.setScalar(baseHitScale * touchHitScale);
                }
                projectStar.touchHitTarget.visible = this.responsiveConfig.hasCoarsePointer;

                if (projectStar.labelBaseScale && projectStar.labelScale) {
                    projectStar.labelScale
                        .copy(projectStar.labelBaseScale)
                        .multiplyScalar(labelScale);
                }
            }
        }
    }

    private updateFogSpriteScale(sprite: THREE.Sprite, multiplier: number): void {
        const baseScale = sprite.userData.baseScale as THREE.Vector2 | undefined;

        if (!baseScale) {
            return;
        }

        sprite.scale.set(baseScale.x * multiplier, baseScale.y * multiplier, 1);
    }

    private getConstellationCameraDepthFade(object: THREE.Object3D): number {
        this.constellationWorldPosition.copy(object.position).applyMatrix4(this.group.matrixWorld);
        this.constellationViewPosition
            .copy(this.constellationWorldPosition)
            .applyMatrix4(this.camera.matrixWorldInverse);

        const distanceInFrontOfCamera = -this.constellationViewPosition.z;

        return THREE.MathUtils.smoothstep(
            distanceInFrontOfCamera,
            CONSTELLATION_CAMERA_FADE_NEAR,
            CONSTELLATION_CAMERA_FADE_FAR,
        );
    }

    private getMobileSequencePosition(skillVisuals = this.skillVisuals): number {
        if (!this.responsiveConfig.isMobile || skillVisuals.length <= 1) {
            return 0;
        }

        const projectCount = skillVisuals.reduce(
            (total, skill) => total + skill.projectStars.length,
            0,
        );
        if (projectCount === 0) {
            return 0;
        }

        const transitionHalfWidth = (MOBILE_STACK_CROSSFADE_PROJECT_SPAN * 0.5) / projectCount;
        let projectsBeforeBoundary = 0;
        let sequencePosition = 0;

        for (let index = 0; index < skillVisuals.length - 1; index += 1) {
            projectsBeforeBoundary += skillVisuals[index].projectStars.length;
            const boundary = projectsBeforeBoundary / projectCount;

            sequencePosition += THREE.MathUtils.smoothstep(
                this.constellationScrollProgress,
                boundary - transitionHalfWidth,
                boundary + transitionHalfWidth,
            );
        }

        return sequencePosition;
    }

    private getActiveMobileSkillId(skillVisuals = this.skillVisuals): string | undefined {
        if (!this.responsiveConfig.isMobile) {
            return undefined;
        }

        if (skillVisuals.length === 0) {
            return undefined;
        }

        const activeIndex = THREE.MathUtils.clamp(
            Math.round(this.mobileSequencePosition),
            0,
            skillVisuals.length - 1,
        );

        return skillVisuals[activeIndex]?.skill.id;
    }

    private getMobileSequenceOpacity(skill: SkillVisual, sequencePosition: number): number {
        if (!this.responsiveConfig.isMobile) {
            return 1;
        }

        if (this.responsiveConfig.reducedMotion) {
            return skill.skillIndex === Math.round(sequencePosition) ? 1 : 0;
        }

        const lowerIndex = Math.floor(sequencePosition);
        const upperIndex = Math.min(lowerIndex + 1, this.skills.size - 1);
        const blend = THREE.MathUtils.smoothstep(
            sequencePosition - lowerIndex,
            MOBILE_CROSSFADE_START,
            MOBILE_CROSSFADE_END,
        );

        if (skill.skillIndex === lowerIndex) {
            return 1 - blend;
        }
        if (skill.skillIndex === upperIndex) {
            return blend;
        }
        return 0;
    }

    private clearHoverState(): void {
        if (!this.hoveredObject && !this.hovered) {
            return;
        }

        this.hoveredObject = undefined;
        this.hovered = undefined;
        this.setCursorHovering(false);
        this.emitProjectPreviewState();
    }

    private setCursorHovering(hovering: boolean): void {
        if (this.cursorHovering === hovering) {
            return;
        }

        this.cursorHovering = hovering;
        window.dispatchEvent(
            new CustomEvent('three-cursor-hover', {
                detail: hovering,
            }),
        );
    }

    private applyReveal(progress: number): void {
        this.reveal = clamp01(progress);
        this.revealTarget = this.reveal;
        this.group.visible = this.reveal > 0.001;
        this.group.position.copy(this.basePosition);
        this.group.scale.setScalar(this.baseScale);

        for (const skill of this.skills.values()) {
            const hasSelectedProject = this.selectedProjectStar !== undefined;
            const hasActiveProject = this.activeProjectIndex >= 0;
            const selectedSkill = this.hasSelectedProjectInSkill(skill.skill.id);

            skill.stars.scale.setScalar(1);
            skill.lines.scale.setScalar(1);
            skill.hitArea.scale.setScalar(1);
            skill.hitArea.position.copy(skill.hitArea.userData.basePosition as THREE.Vector3);
            skill.starMaterial.opacity =
                getSkillStarsOpacity(
                    hasSelectedProject,
                    selectedSkill,
                    SKILL_STARS_SELECTED_RESET_OPACITY,
                    this.isProjectPanelBoundaryActive,
                ) * this.reveal;
            skill.lineMaterials[0].opacity = 0.16 * this.reveal;
            skill.lineMaterials[1].opacity = 0.32 * this.reveal;
            if (skill.lineTintMaterials.length > 0) {
                skill.lineTintMaterials[0].opacity = 0.1 * this.reveal;
            }
            skill.fogMaterials[0].opacity = 0.2 * this.reveal;
            skill.fogMaterials[1].opacity = 0.1 * this.reveal;
            if (skill.labelMaterial) {
                skill.labelMaterial.opacity =
                    getSkillLabelOpacityTarget(
                        skill.skill.id,
                        false,
                        this.isProjectPanelBoundaryActive,
                        this.selected,
                        this.selectedProjectStar,
                    ) * this.reveal;
            }
            for (const projectStar of skill.projectStars) {
                const selectedStar = projectStar === this.selectedProjectStar;
                const activeStar = this.isActiveProject(projectStar);

                projectStar.entity.scale.setScalar(
                    selectedStar
                        ? 1.66
                        : activeStar
                          ? PROJECT_STAR_ACTIVE_SCALE
                          : getProjectStarBaseScale(hasSelectedProject),
                );
                projectStar.entity.position.copy(
                    projectStar.entity.userData.basePosition as THREE.Vector3,
                );
                const material = projectStar.hitTarget.material as THREE.SpriteMaterial;
                material.opacity =
                    (selectedStar
                        ? PROJECT_STAR_SELECTED_OPACITY
                        : activeStar
                          ? PROJECT_STAR_ACTIVE_SCALE
                          : getProjectStarBaseOpacity(
                                hasSelectedProject,
                                this.isProjectPanelBoundaryActive,
                            )) * this.reveal;
                if (projectStar.labelMaterial) {
                    projectStar.labelMaterial.opacity =
                        getProjectLabelOpacityTarget(
                            skill.skill.id,
                            selectedStar,
                            activeStar,
                            false,
                            false,
                            hasSelectedProject,
                            hasActiveProject,
                            this.isProjectPanelBoundaryActive,
                            this.selected,
                        ) * this.reveal;
                }
            }
        }
    }

    private selectProjectStar(projectStar: ProjectStarVisual): void {
        if (!this.isProjectPanelBoundaryActive) {
            return;
        }
        const activeMobileSkillId = this.getActiveMobileSkillId();
        if (activeMobileSkillId && projectStar.skillId !== activeMobileSkillId) {
            return;
        }

        this.selectedProjectStar = projectStar;
        this.interaction.setKeyboardSelectedProject(projectStar);

        this.onProjectSelect?.(projectStar.project);
        this.emitProjectPreviewState();
    }

    private getHoveredProjectStar(): ProjectStarVisual | undefined {
        if (
            !this.isProjectPanelBoundaryActive ||
            !this.hoveredObject?.name.startsWith('SkillStarHit:')
        ) {
            return undefined;
        }

        return this.projectStars.find(
            (projectStar) => projectStar.hitTarget === this.hoveredObject,
        );
    }

    private emitProjectPreviewState(): void {
        const activeProject = this.projectStars[this.activeProjectIndex]?.project;
        const hoveredProject = this.getHoveredProjectStar()?.project;
        const selectedProject = this.selectedProjectStar?.project;
        const stateKey = [
            this.isProjectPanelBoundaryActive,
            activeProject?.id ?? '',
            hoveredProject?.id ?? '',
            selectedProject?.id ?? '',
        ].join(':');

        if (stateKey === this.lastProjectPreviewStateKey) {
            return;
        }

        this.lastProjectPreviewStateKey = stateKey;
        this.onProjectPreviewChange?.({
            isProjectPanelBoundaryActive: this.isProjectPanelBoundaryActive,
            activeProject,
            hoveredProject,
            selectedProject,
        });
    }

    private hasSelectedProjectInSkill(skillId: string): boolean {
        return this.selectedProjectStar?.skillId === skillId;
    }

    private isActiveProject(projectStar: ProjectStarVisual): boolean {
        return this.projectStars[this.activeProjectIndex] === projectStar;
    }
}
