import type { Entity } from './Entity';

export class ComponentStore<TComponent> {
    private readonly components = new Map<Entity, TComponent>();

    public add(entity: Entity, component: TComponent): TComponent {
        this.components.set(entity, component);

        return component;
    }

    public get(entity: Entity): TComponent | undefined {
        return this.components.get(entity);
    }

    public remove(entity: Entity): void {
        this.components.delete(entity);
    }

    public has(entity: Entity): boolean {
        return this.components.has(entity);
    }

    public all(): Iterable<[Entity, TComponent]> {
        return this.components.entries();
    }

    public clear(): void {
        this.components.clear();
    }
}
