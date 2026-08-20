export class MorphTargets {
    private registry = new Map<string, Float32Array>();
    private ellipsisRegistry = new Map<string, Float32Array>();

    public setShape(key: string, arr: Float32Array) {
        this.registry.set(key, arr);
    }

    public getShape(key: string): Float32Array | undefined {
        return this.registry.get(key);
    }

    public setEllipsis(key: string, arr: Float32Array) {
        this.ellipsisRegistry.set(key, arr);
    }

    public getEllipsis(key: string): Float32Array | undefined {
        return this.ellipsisRegistry.get(key);
    }

    public has(key: string): boolean {
        return this.registry.has(key);
    }
}
