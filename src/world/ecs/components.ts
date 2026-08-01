import type * as THREE from 'three';

export interface PositionComponent {
    current: Float32Array;
    dirty: boolean;
}

export interface MorphComponent {
    from: Float32Array;
    to: Float32Array;
    progress: number;
    lastProgress: number;
    transitionOffsets?: Float32Array;
    transitionDelays?: Float32Array;
    transitionStrength?: number;
    transitionMode?: 'direct' | 'cinematic' | 'collapse' | 'collapseCinematic';
    transitionVisibilityUniform?: { value: number };
    factorAttribute?: THREE.BufferAttribute;
}

export interface RenderableComponent {
    object: THREE.Points<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
}

export interface RaycastInteractionComponent {
    rotationStrength: number;
    powerStrength?: number;
    faceCamera?: boolean;
    baseRotationX?: number;
    rotationOffset?: THREE.Euler;
}

export interface FadeOverlayComponent {
    value: number;
    material: THREE.ShaderMaterial;
}

export interface SceneStateComponent {
    scrollProgress: number;
    backgroundParticlesVisibility: number;
    coloredLightVisibility: number;
    ellipsisVisibility: number;
    scrollVelocity: number;
}

export interface ShaderUniformComponent {
    material: THREE.ShaderMaterial;
    bindScrollProgress?: boolean;
    bindScrollFloatStrength?: boolean;
    bindBackgroundVisibility?: boolean;
    bindColoredLightVisibility?: boolean;
    bindEllipsisVisibility?: boolean;
    shiftSpeed?: number;
}
