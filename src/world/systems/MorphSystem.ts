import type { ComponentStore } from '../ecs/ComponentStore';
import type { MorphComponent, PositionComponent } from '../ecs/components';
import type { System } from '../ecs/System';

export class MorphSystem implements System {
    private readonly morphs: ComponentStore<MorphComponent>;
    private readonly positions: ComponentStore<PositionComponent>;
    constructor(
        morphs: ComponentStore<MorphComponent>,
        positions: ComponentStore<PositionComponent>,
    ) {
        this.morphs = morphs;
        this.positions = positions;
    }

    public update(_delta: number, _elapsed: number): void {
        for (const [entity, morph] of this.morphs.all()) {
            const position = this.positions.get(entity);
            if (!position) {
                continue;
            }

            const progress = Math.min(Math.max(morph.progress, 0), 1);

            if (progress === morph.lastProgress) {
                continue;
            }

            const { from, to } = morph;
            const offsets = morph.transitionOffsets;
            const delays = morph.transitionDelays;
            const strength = morph.transitionStrength ?? 0;
            const collapseTransition =
                morph.transitionMode === 'collapse' || morph.transitionMode === 'collapseCinematic';

            if (morph.transitionVisibilityUniform) {
                const distanceFromMidpoint = Math.abs(progress * 2 - 1);
                morph.transitionVisibilityUniform.value = collapseTransition
                    ? distanceFromMidpoint * distanceFromMidpoint * (3 - 2 * distanceFromMidpoint)
                    : 1;
            }

            if (collapseTransition) {
                const expanding = progress >= 0.5;
                const phase = expanding ? (progress - 0.5) * 2 : progress * 2;
                const shape = expanding ? to : from;
                const cinematic = morph.transitionMode === 'collapseCinematic';

                for (let index = 0; index < position.current.length; index += 3) {
                    const particleIndex = index / 3;
                    const delay = cinematic ? (delays?.[particleIndex] ?? 0) * 0.12 : 0;
                    const localPhase = Math.min(Math.max((phase - delay) / (1 - delay), 0), 1);
                    const easedPhase =
                        localPhase *
                        localPhase *
                        localPhase *
                        (localPhase * (localPhase * 6 - 15) + 10);
                    const scale = expanding ? easedPhase : 1 - easedPhase;
                    const depthEnvelope =
                        localPhase <= 0 || localPhase >= 1
                            ? 0
                            : 16 * localPhase * localPhase * (1 - localPhase) * (1 - localPhase);
                    const depthOffset = (offsets?.[index + 2] ?? 0) * depthEnvelope * strength;

                    position.current[index] = shape[index] * scale;
                    position.current[index + 1] = shape[index + 1] * scale;
                    position.current[index + 2] = shape[index + 2] * scale + depthOffset;
                }
            } else {
                for (let index = 0; index < position.current.length; index += 3) {
                    const particleIndex = index / 3;
                    const delay = (delays?.[particleIndex] ?? 0) * 0.14;
                    const localProgress = Math.min(
                        Math.max((progress - delay) / (1 - delay), 0),
                        1,
                    );
                    const eased =
                        localProgress *
                        localProgress *
                        localProgress *
                        (localProgress * (localProgress * 6 - 15) + 10);
                    const transitionEnvelope =
                        localProgress <= 0 || localProgress >= 1
                            ? 0
                            : 16 *
                              localProgress *
                              localProgress *
                              (1 - localProgress) *
                              (1 - localProgress);
                    const displacement = transitionEnvelope * strength;

                    position.current[index] =
                        from[index] +
                        (to[index] - from[index]) * eased +
                        (offsets?.[index] ?? 0) * displacement;
                    position.current[index + 1] =
                        from[index + 1] +
                        (to[index + 1] - from[index + 1]) * eased +
                        (offsets?.[index + 1] ?? 0) * displacement;
                    position.current[index + 2] =
                        from[index + 2] +
                        (to[index + 2] - from[index + 2]) * eased +
                        (offsets?.[index + 2] ?? 0) * displacement;
                }
            }

            if (morph.factorAttribute) {
                const factors = morph.factorAttribute.array as Float32Array;
                const eased =
                    progress * progress * progress * (progress * (progress * 6 - 15) + 10);
                factors.fill(eased);
                morph.factorAttribute.needsUpdate = true;
            }

            morph.lastProgress = progress;
            position.dirty = true;
        }
    }
}
