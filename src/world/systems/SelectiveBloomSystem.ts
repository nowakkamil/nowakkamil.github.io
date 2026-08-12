import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const BLOOM_LAYER = 1;

export interface TextBloomState {
    object?: THREE.Object3D;
    material?: THREE.ShaderMaterial;
    presence: number;
    visualScale: number;
    strengthScale: number;
}

export class SelectiveBloomSystem {
    private static readonly ambientStrength = 0.12;

    private readonly camera: THREE.Camera;
    private readonly composer: EffectComposer;
    private readonly bloomPass: UnrealBloomPass;
    private pixelRatio = 0;
    private strengthScaleValue = 1;

    constructor(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        width: number,
        height: number,
    ) {
        this.camera = camera;
        this.composer = new EffectComposer(renderer);
        this.composer.renderToScreen = false;
        this.composer.addPass(new RenderPass(scene, camera));
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.5, 0.5, 0.4);
        this.composer.addPass(this.bloomPass);
    }

    public get texture(): THREE.Texture {
        return this.composer.renderTarget2.texture;
    }

    public get pass(): UnrealBloomPass {
        return this.bloomPass;
    }

    public get strengthScale(): number {
        return this.strengthScaleValue;
    }

    public set strengthScale(value: number) {
        this.strengthScaleValue = Math.max(value, 0);
    }

    public render(state: TextBloomState): void {
        const { object, material, presence, visualScale, strengthScale } = state;
        const bloomActive = presence > 0;
        const scaleBloom = THREE.MathUtils.lerp(
            0.8,
            1,
            THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(visualScale, 0.25, 1), 0.25, 1),
        );
        const textStrength = bloomActive ? presence * 0.5 * scaleBloom * strengthScale : 0;
        const bloomStrength = Math.max(textStrength, SelectiveBloomSystem.ambientStrength);
        const textPassOpacity = bloomActive ? Math.min(textStrength / bloomStrength, 1) : 0;

        if (object) {
            if (bloomActive) {
                object.layers.enable(BLOOM_LAYER);
            } else {
                object.layers.disable(BLOOM_LAYER);
            }
        }

        if (material?.uniforms.uBloomStrength) {
            material.uniforms.uBloomStrength.value = 0.024 * strengthScale;
        }
        if (material?.uniforms.uHazeStrength) {
            material.uniforms.uHazeStrength.value = 0.065 * strengthScale;
        }

        this.bloomPass.strength = bloomStrength * this.strengthScaleValue;
        this.renderBloomLayer(material, textPassOpacity);
    }

    public getPreparationMaterials(): THREE.Material[] {
        return [
            this.bloomPass.materialHighPassFilter,
            ...this.bloomPass.separableBlurMaterials,
            this.bloomPass.compositeMaterial,
            this.bloomPass.blendMaterial,
        ];
    }

    public prepare(renderer: THREE.WebGLRenderer): void {
        const previousRenderTarget = renderer.getRenderTarget();

        for (const renderTarget of [
            this.composer.renderTarget1,
            this.composer.renderTarget2,
            this.bloomPass.renderTargetBright,
            ...this.bloomPass.renderTargetsHorizontal,
            ...this.bloomPass.renderTargetsVertical,
        ]) {
            renderer.initRenderTarget(renderTarget);
        }

        renderer.setRenderTarget(this.composer.renderTarget2);
        try {
            renderer.clear();
        } finally {
            renderer.setRenderTarget(previousRenderTarget);
        }
    }

    public setStrengthScale(value: number): void {
        this.strengthScale = value;
    }

    public setSize(width: number, height: number, pixelRatio: number): void {
        if (this.pixelRatio !== pixelRatio) {
            this.composer.setPixelRatio(pixelRatio);
            this.pixelRatio = pixelRatio;
        }
        this.composer.setSize(width, height);
    }

    private renderBloomLayer(
        material: THREE.ShaderMaterial | undefined,
        textPassOpacity: number,
    ): void {
        const cameraLayerMask = this.camera.layers.mask;
        const opacityUniform = material?.uniforms.uGlobalOpacity;
        const baseOpacity =
            typeof opacityUniform?.value === 'number' ? opacityUniform.value : undefined;

        this.camera.layers.set(BLOOM_LAYER);
        if (opacityUniform && baseOpacity !== undefined) {
            opacityUniform.value = baseOpacity * textPassOpacity;
        }

        try {
            this.composer.render();
        } finally {
            if (opacityUniform && baseOpacity !== undefined) {
                opacityUniform.value = baseOpacity;
            }
            this.camera.layers.mask = cameraLayerMask;
        }
    }
}
