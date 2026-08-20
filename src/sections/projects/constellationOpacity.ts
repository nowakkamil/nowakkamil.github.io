import type { InteractionTarget, ProjectStarVisual } from './constellationTypes';
import {
    PROJECT_STAR_ACTIVE_OPACITY,
    PROJECT_STAR_ACTIVE_SCALE,
    PROJECT_STAR_BASE_OPACITY,
    PROJECT_STAR_BASE_SCALE,
    PROJECT_STAR_DIM_OPACITY,
    PROJECT_STAR_DIM_SCALE,
    PROJECT_STAR_SELECTED_CONTEXT_HOVER_OPACITY,
    PROJECT_STAR_SELECTED_CONTEXT_HOVER_SCALE,
    PROJECT_STAR_SELECTED_OPACITY,
    SKILL_LABEL_BASE_OPACITY,
    SKILL_LABEL_HOVER_OPACITY,
    SKILL_LABEL_SELECTED_OPACITY,
    SKILL_STARS_DIM_OPACITY,
    SKILL_STARS_UNFOCUSED_OPACITY,
    SKILL_STARS_VISIBLE_OPACITY,
} from './constellationConstants';

/**
 * Returns the target opacity for the background star-field points of a
 * constellation cluster based on selection / activity state.
 */
export function getSkillStarsOpacity(
    hasSelectedProject: boolean,
    selectedSkill: boolean,
    selectedSkillOpacity: number,
    isProjectPanelBoundaryActive: boolean,
): number {
    if (hasSelectedProject) {
        return selectedSkill ? selectedSkillOpacity : SKILL_STARS_UNFOCUSED_OPACITY;
    }

    return isProjectPanelBoundaryActive ? SKILL_STARS_VISIBLE_OPACITY : SKILL_STARS_DIM_OPACITY;
}

/**
 * Returns the target opacity for a skill-cluster label sprite.
 */
export function getSkillLabelOpacityTarget(
    skillId: string,
    isHovered: boolean,
    isProjectPanelBoundaryActive: boolean,
    selected: InteractionTarget | undefined,
    selectedProjectStar: ProjectStarVisual | undefined,
): number {
    if (!isProjectPanelBoundaryActive) {
        return 0;
    }
    if (selectedProjectStar) {
        return 0;
    }
    if (selected?.id === skillId) {
        return SKILL_LABEL_SELECTED_OPACITY;
    }
    if (isHovered) {
        return SKILL_LABEL_HOVER_OPACITY;
    }

    return SKILL_LABEL_BASE_OPACITY;
}

/**
 * Returns the target opacity for an individual project-star label sprite.
 */
export function getProjectLabelOpacityTarget(
    skillId: string,
    selectedStar: boolean,
    isActiveStar: boolean,
    hoveredStar: boolean,
    isHoveredSkill: boolean,
    hasSelectedProject: boolean,
    hasActiveProject: boolean,
    isProjectPanelBoundaryActive: boolean,
    selected: InteractionTarget | undefined,
): number {
    if (!isProjectPanelBoundaryActive) {
        return 0;
    }
    if (selectedStar) {
        return PROJECT_STAR_SELECTED_OPACITY;
    }

    let target = hasSelectedProject ? 0.1 : hasActiveProject ? 0.18 : 0.42;

    if (isActiveStar) {
        target = Math.max(target, PROJECT_STAR_SELECTED_OPACITY);
    }

    if (isHoveredSkill) {
        target = Math.max(target, hoveredStar ? PROJECT_STAR_SELECTED_OPACITY : 0.68);
    }

    if (selected?.id === skillId) {
        target = Math.max(target, hasSelectedProject ? 0.3 : 0.78);
    }

    return target;
}

/** Returns the base opacity for an un-selected, un-hovered project star. */
export function getProjectStarBaseOpacity(
    hasSelectedProject: boolean,
    isProjectPanelBoundaryActive: boolean,
): number {
    return hasSelectedProject || !isProjectPanelBoundaryActive
        ? PROJECT_STAR_DIM_OPACITY
        : PROJECT_STAR_BASE_OPACITY;
}

/** Returns the base scale for an un-selected, un-hovered project star. */
export function getProjectStarBaseScale(hasSelectedProject: boolean): number {
    return hasSelectedProject ? PROJECT_STAR_DIM_SCALE : PROJECT_STAR_BASE_SCALE;
}

/** Returns the target intensity value for a constellation cluster. */
export function getSkillTargetIntensity(
    skillId: string,
    isProjectPanelBoundaryActive: boolean,
    hovered: InteractionTarget | undefined,
    selected: InteractionTarget | undefined,
): number {
    let target = 0.06;

    if (isProjectPanelBoundaryActive && hovered?.id === skillId) {
        target = Math.max(target, 0.14);
    }
    if (selected?.id === skillId) {
        target = Math.max(target, 0.28);
    }
    return target;
}

/**
 * Returns the target opacity and scale for a project star sprite based on
 * its hover / active / selected state.
 */
export interface ProjectStarVisualTargets {
    targetOpacity: number;
    targetScale: number;
}

export function getProjectStarVisualTargets(
    projectStar: ProjectStarVisual,
    hoveredProjectStar: ProjectStarVisual | undefined,
    selectedProjectStar: ProjectStarVisual | undefined,
    activeProjectStar: ProjectStarVisual | undefined,
    hasSelectedProject: boolean,
    isProjectPanelBoundaryActive: boolean,
    result: ProjectStarVisualTargets = {
        targetOpacity: 0,
        targetScale: 0,
    },
): ProjectStarVisualTargets {
    const hovered = isProjectPanelBoundaryActive && projectStar === hoveredProjectStar;
    const selected = projectStar === selectedProjectStar;
    const active = projectStar === activeProjectStar;
    const activeWithoutHover = active && hoveredProjectStar === undefined;

    let targetScale = getProjectStarBaseScale(hasSelectedProject);
    let targetOpacity = getProjectStarBaseOpacity(hasSelectedProject, isProjectPanelBoundaryActive);

    if (hovered) {
        targetScale = hasSelectedProject
            ? PROJECT_STAR_SELECTED_CONTEXT_HOVER_SCALE
            : PROJECT_STAR_ACTIVE_SCALE;
        targetOpacity = hasSelectedProject
            ? PROJECT_STAR_SELECTED_CONTEXT_HOVER_OPACITY
            : PROJECT_STAR_ACTIVE_OPACITY;
    }
    if (activeWithoutHover) {
        targetScale = hasSelectedProject ? targetScale : PROJECT_STAR_ACTIVE_SCALE;
        targetOpacity = hasSelectedProject ? targetOpacity : PROJECT_STAR_ACTIVE_OPACITY;
    }
    if (selected) {
        targetScale = hovered ? 1.82 : 1.66;
        targetOpacity = PROJECT_STAR_SELECTED_OPACITY;
    }

    result.targetOpacity = targetOpacity;
    result.targetScale = targetScale;

    return result;
}
