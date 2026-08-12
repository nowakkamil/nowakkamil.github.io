import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';
import type { ResponsiveImageSource } from '../../utils/assetLoaders';

type PortfolioConstellationId = 'front-end' | 'full-stack' | 'back-end';

export interface PortfolioSkill {
    id: string;
    label: string;
}

export interface Constellation {
    id: PortfolioConstellationId;
    label: string;
}

export interface PortfolioProject {
    id: string;
    title: string;
    label: string;
    description: string;
    period: string;
    role: string;
    skills: string[];
    domain: string;
    owner: string;
    screenshot?: ResponsiveImageSource;
    detailsScreenshot?: ResponsiveImageSource;
    constellation: {
        id: PortfolioConstellationId;
        position: readonly [number, number, number];
        links: string[];
        labelOffset?: readonly [number, number];
    };
}

export type ProjectSelectionHandler = (project: PortfolioProject) => void;

export interface PortfolioProjectPreviewState {
    isProjectPanelBoundaryActive: boolean;
    activeProject?: PortfolioProject;
    hoveredProject?: PortfolioProject;
    selectedProject?: PortfolioProject;
}

export type ProjectPreviewHandler = (state: PortfolioProjectPreviewState) => void;

export interface PortfolioConstellationOptions {
    scene: THREE.Scene;
    camera: THREE.Camera;
    domElement: HTMLElement;
    projects: PortfolioProject[];
    skills: PortfolioSkill[];
    constellations: Constellation[];
    responsiveConfig: ResponsiveConfig;
    onProjectSelect?: ProjectSelectionHandler;
    onProjectClear?: () => void;
}

export interface SkillVisual {
    skill: PortfolioSkill;
    skillIndex: number;
    center: THREE.Vector3;
    layoutOffset: THREE.Vector3;
    fogColor: THREE.Color;
    starMaterial: THREE.PointsMaterial;
    lineMaterials: THREE.MeshBasicMaterial[];
    lineTintMaterials: THREE.MeshBasicMaterial[];
    fogMaterials: THREE.SpriteMaterial[];
    fogSprites: THREE.Sprite[];
    labelMaterial?: THREE.SpriteMaterial;
    labelSprite?: THREE.Sprite;
    projectStars: ProjectStarVisual[];
    stars: THREE.Points;
    lines: THREE.Group;
    hitArea: THREE.Mesh;
    intensity: number;
    driftPhase: number;
    zOffset: number;
    focusOffset: THREE.Vector3;
    focusScale: number;
    opacityMultiplier: number;
}

export interface ProjectStarVisual {
    project: PortfolioProject;
    skillId: string;
    entity: THREE.Group;
    hitTarget: THREE.Sprite;
    touchHitTarget: THREE.Sprite;
    labelMaterial?: THREE.SpriteMaterial;
    labelSprite?: THREE.Sprite;
    labelScale?: THREE.Vector2;
    labelBaseScale?: THREE.Vector2;
    labelOffset?: THREE.Vector3;
}

export type InteractionTarget = { type: 'skill'; id: string };
export type BoundaryPoint = { x: number; y: number };
export type TapCandidate = {
    pointerId: number;
    startX: number;
    startY: number;
    startScrollY: number;
    startTime: number;
    moved: boolean;
};
