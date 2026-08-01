export const createCollapseTransitionField = (
    from: Float32Array,
    to: Float32Array,
    seed: number,
): { offsets: Float32Array; delays: Float32Array } => {
    const count = from.length / 3;
    const offsets = new Float32Array(from.length);
    const delays = new Float32Array(count);
    let maxRadius = 0;
    let randomState = seed >>> 0;
    const random = (): number => {
        randomState += 0x6d2b79f5;
        let value = randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };

    for (let index = 0; index < count; index += 1) {
        const index3 = index * 3;
        const midpointX = (from[index3] + to[index3]) * 0.5;
        const midpointY = (from[index3 + 1] + to[index3 + 1]) * 0.5;
        maxRadius = Math.max(maxRadius, Math.hypot(midpointX, midpointY));
    }

    maxRadius = Math.max(maxRadius, 0.001);

    for (let index = 0; index < count; index += 1) {
        const index3 = index * 3;
        const midpointX = (from[index3] + to[index3]) * 0.5;
        const midpointY = (from[index3 + 1] + to[index3 + 1]) * 0.5;
        const radialProgress = Math.min(Math.hypot(midpointX, midpointY) / maxRadius, 1);

        delays[index] = (1 - radialProgress) * 0.82 + random() * 0.18;
        offsets[index3 + 2] = -(0.82 + random() * 0.34);
    }

    return { offsets, delays };
};
