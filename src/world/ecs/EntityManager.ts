import type { Entity } from './Entity';

export class EntityManager {
    private nextEntity: Entity = 1;
    private readonly alive = new Set<Entity>();

    public create(): Entity {
        const entity = this.nextEntity;
        this.nextEntity += 1;
        this.alive.add(entity);

        return entity;
    }

    public destroy(entity: Entity): void {
        this.alive.delete(entity);
    }

    public has(entity: Entity): boolean {
        return this.alive.has(entity);
    }

    public all(): Iterable<Entity> {
        return this.alive.values();
    }
}
