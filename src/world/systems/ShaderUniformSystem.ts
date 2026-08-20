import type { ComponentStore } from '../ecs/ComponentStore';
import type { SceneStateComponent, ShaderUniformComponent } from '../ecs/components';
import type { System } from '../ecs/System';

export class ShaderUniformSystem implements System {
    private readonly shaderUniforms: ComponentStore<ShaderUniformComponent>;
    private readonly sceneStates: ComponentStore<SceneStateComponent>;

    constructor(
        shaderUniforms: ComponentStore<ShaderUniformComponent>,
        sceneStates: ComponentStore<SceneStateComponent>,
    ) {
        this.shaderUniforms = shaderUniforms;
        this.sceneStates = sceneStates;
    }

    public update(delta: number, elapsed: number): void {
        const sceneState = this.getSceneState();

        for (const [, shader] of this.shaderUniforms.all()) {
            const { uniforms } = shader.material;

            if (uniforms.uTime) {
                uniforms.uTime.value = elapsed;
            }

            if (uniforms.uTunnelRotation && uniforms.uTunnelSpinStrength) {
                const spinStrength = Math.min(Math.max(uniforms.uTunnelSpinStrength.value, 0), 1);
                const easedSpinStrength = spinStrength * spinStrength * (3 - 2 * spinStrength);

                if (spinStrength <= 0.0001) {
                    uniforms.uTunnelRotation.value = 0;
                } else {
                    uniforms.uTunnelRotation.value +=
                        Math.min(delta, 1 / 20) * 0.085 * easedSpinStrength;
                }
            }

            if (uniforms.uScroll && shader.bindScrollProgress) {
                uniforms.uScroll.value = sceneState.scrollProgress;
            }

            if (uniforms.uShift && shader.shiftSpeed !== undefined) {
                uniforms.uShift.value += delta * shader.shiftSpeed;
            }

            if (uniforms.uVisibility && shader.bindBackgroundVisibility) {
                uniforms.uVisibility.value = sceneState.backgroundParticlesVisibility;
            }

            if (uniforms.uVisibility && shader.bindColoredLightVisibility) {
                uniforms.uVisibility.value = sceneState.coloredLightVisibility;
            }

            if (uniforms.uVisibility && shader.bindEllipsisVisibility) {
                uniforms.uVisibility.value = sceneState.ellipsisVisibility;
            }

            if (shader.bindScrollFloatStrength) {
                const floatStrength = 1 - sceneState.scrollProgress * sceneState.scrollProgress;

                if (uniforms.uFloatStrength) {
                    uniforms.uFloatStrength.value = floatStrength;
                }

                if (uniforms.uWindStrength) {
                    uniforms.uWindStrength.value = floatStrength;
                }
            }
        }
    }

    public setViewportSize(width: number, height: number): void {
        const aspect = width / Math.max(height, 1);

        for (const [, shader] of this.shaderUniforms.all()) {
            const aspectUniform = shader.material.uniforms.uAspect;
            if (aspectUniform) {
                aspectUniform.value = aspect;
            }
        }
    }

    private getSceneState(): SceneStateComponent {
        for (const [, sceneState] of this.sceneStates.all()) {
            return sceneState;
        }

        return {
            scrollProgress: 0,
            backgroundParticlesVisibility: 0,
            coloredLightVisibility: 0,
            ellipsisVisibility: 0,
            scrollVelocity: 0,
        };
    }
}
