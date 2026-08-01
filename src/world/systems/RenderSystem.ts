import type * as THREE from 'three';
import type { ComponentStore } from '../ecs/ComponentStore';
import type { PositionComponent, RenderableComponent } from '../ecs/components';
import type { System } from '../ecs/System';

export class RenderSystem implements System {
    private readonly positions: ComponentStore<PositionComponent>;
    private readonly renderables: ComponentStore<RenderableComponent>;

    constructor(
        positions: ComponentStore<PositionComponent>,
        renderables: ComponentStore<RenderableComponent>,
    ) {
        this.positions = positions;
        this.renderables = renderables;
    }

    public update(_delta: number, _elapsed: number): void {
        for (const [entity, renderable] of this.renderables.all()) {
            const position = this.positions.get(entity);
            if (!position?.dirty) {
                continue;
            }

            const attribute = renderable.object.geometry.getAttribute('position') as
                | THREE.BufferAttribute
                | undefined;

            if (!attribute) {
                continue;
            }

            attribute.array.set(position.current);
            attribute.needsUpdate = true;
            position.dirty = false;
        }
    }
}
