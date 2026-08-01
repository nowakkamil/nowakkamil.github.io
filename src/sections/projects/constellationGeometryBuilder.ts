import * as THREE from 'three';
import type { BoundaryPoint, PortfolioProject } from './constellationTypes';

/**
 * Builds the list of undirected edges between project star positions.
 * Uses explicit `constellation.links` when present; falls back to a
 * sequential chain when no links are defined.
 */
export function createProjectEdges(
    projects: PortfolioProject[],
): readonly (readonly [number, number])[] {
    const edges: [number, number][] = [];
    const projectIndexById = new Map(projects.map((project, index) => [project.id, index]));

    projects.forEach((project, fromIndex) => {
        for (const linkedProjectId of project.constellation.links) {
            const toIndex = projectIndexById.get(linkedProjectId);

            if (toIndex === undefined || toIndex === fromIndex) {
                continue;
            }
            if (
                edges.some(
                    ([from, to]) =>
                        (from === fromIndex && to === toIndex) ||
                        (from === toIndex && to === fromIndex),
                )
            ) {
                continue;
            }

            edges.push([fromIndex, toIndex]);
        }
    });

    if (edges.length === 0 && projects.length > 1) {
        for (let index = 1; index < projects.length; index += 1) {
            edges.push([index - 1, index]);
        }
    }

    return edges;
}

/**
 * Creates a flat quad (ribbon) geometry for a single constellation line
 * segment with a given half-width. UVs run along the length so the blur
 * texture fades toward both endpoints.
 */
function createLineRibbonGeometry(
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
): THREE.BufferGeometry {
    const direction = end.clone().sub(start);
    const normal = new THREE.Vector3(-direction.y, direction.x, 0);

    if (normal.lengthSq() < 0.0001) {
        normal.set(1, 0, 0);
    } else {
        normal.normalize();
    }

    const halfWidth = width * 0.5;
    const offset = normal.multiplyScalar(halfWidth);
    const positions = new Float32Array([
        start.x + offset.x,
        start.y + offset.y,
        start.z,
        start.x - offset.x,
        start.y - offset.y,
        start.z,
        end.x + offset.x,
        end.y + offset.y,
        end.z,
        end.x - offset.x,
        end.y - offset.y,
        end.z,
    ]);
    const uvs = new Float32Array([0, 1, 0, 0, 1, 1, 1, 0]);
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 1, 3, 2]);

    return geometry;
}

/**
 * Builds a `THREE.Group` of ribbon meshes for all provided edges.
 * Each edge gets three overlapping quads: a broad colour veil, a bright
 * white core, and an optional narrow colour-tint overlay.
 */
export function createLineRibbons(
    edges: readonly (readonly [number, number])[],
    starPositions: Float32Array,
    veilMaterial: THREE.MeshBasicMaterial,
    coreMaterial: THREE.MeshBasicMaterial,
    tintMaterial?: THREE.MeshBasicMaterial,
    tintWidth?: number,
    isMobile = false,
): THREE.Group {
    const group = new THREE.Group();
    const veilWidth = isMobile ? 0.26 : 0.34;
    const coreWidth = isMobile ? 0.085 : 0.11;

    for (const [from, to] of edges) {
        const fromOffset = from * 3;
        const toOffset = to * 3;
        const start = new THREE.Vector3(
            starPositions[fromOffset],
            starPositions[fromOffset + 1],
            starPositions[fromOffset + 2],
        );
        const end = new THREE.Vector3(
            starPositions[toOffset],
            starPositions[toOffset + 1],
            starPositions[toOffset + 2],
        );
        const veil = new THREE.Mesh(createLineRibbonGeometry(start, end, veilWidth), veilMaterial);
        const core = new THREE.Mesh(createLineRibbonGeometry(start, end, coreWidth), coreMaterial);

        veil.renderOrder = 4;
        core.renderOrder = 5;
        group.add(veil, core);

        if (tintMaterial && tintWidth) {
            const tint = new THREE.Mesh(
                createLineRibbonGeometry(start, end, tintWidth),
                tintMaterial,
            );
            tint.renderOrder = 6;
            group.add(tint);
        }
    }

    return group;
}

/**
 * Computes the 2D distance from `point` to the line segment [start, end].
 * Uses only x/y components of each vector.
 */
function getPointToSegmentDistance2D(
    point: THREE.Vector3,
    start: THREE.Vector3,
    end: THREE.Vector3,
): number {
    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const lengthSq = segmentX * segmentX + segmentY * segmentY;

    if (lengthSq < 0.0001) {
        return Math.hypot(point.x - start.x, point.y - start.y);
    }

    const rawT = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSq;
    const t = THREE.MathUtils.clamp(rawT, 0, 1);
    const projectedX = start.x + segmentX * t;
    const projectedY = start.y + segmentY * t;

    return Math.hypot(point.x - projectedX, point.y - projectedY);
}

/**
 * Determines the best local offset vector for a project star label so that
 * it avoids constellation line edges and stays as far as possible from the
 * cluster centre.
 */
export function getProjectLabelOffset(
    starIndex: number,
    center: THREE.Vector3,
    starPositions: THREE.Vector3[],
    edges: readonly (readonly [number, number])[],
    labelScale: THREE.Vector2,
    baseOffset: number,
): THREE.Vector3 {
    const starPosition = starPositions[starIndex];
    const outward = starPosition.clone().sub(center);

    outward.z = 0;
    if (outward.lengthSq() < 0.0001) {
        outward.set(starIndex % 2 === 0 ? 1 : -1, 0.4, 0);
    }
    outward.normalize();

    const tangent = new THREE.Vector3(-outward.y, outward.x, 0).normalize();
    const candidates = [
        outward.clone(),
        outward.clone().multiplyScalar(0.88).add(tangent.clone().multiplyScalar(0.48)).normalize(),
        outward.clone().multiplyScalar(0.88).add(tangent.clone().multiplyScalar(-0.48)).normalize(),
        tangent.clone(),
        tangent.clone().negate(),
        new THREE.Vector3(0, outward.y >= 0 ? 1 : -1, 0),
        new THREE.Vector3(outward.x >= 0 ? 1 : -1, 0, 0),
    ];
    const labelRadius = Math.max(labelScale.x * 0.34, labelScale.y * 0.58);
    let bestOffset = candidates[0].clone().multiplyScalar(baseOffset);
    let bestScore = -Infinity;

    for (const direction of candidates) {
        const candidateOffset = direction.clone().multiplyScalar(baseOffset);
        const labelCenter = starPosition.clone().add(candidateOffset);
        let nearestLine = Infinity;

        for (const [from, to] of edges) {
            const edgeStart = starPositions[from];
            const edgeEnd = starPositions[to];

            if (!edgeStart || !edgeEnd) {
                continue;
            }

            nearestLine = Math.min(
                nearestLine,
                getPointToSegmentDistance2D(labelCenter, edgeStart, edgeEnd),
            );
        }

        const outsideScore = labelCenter.clone().sub(center).length();
        const directionScore = direction.dot(outward) * 0.42;
        const clearanceScore = nearestLine - labelRadius;
        const score = clearanceScore * 2.6 + outsideScore * 0.12 + directionScore;

        if (score > bestScore) {
            bestScore = score;
            bestOffset = candidateOffset;
        }
    }

    bestOffset.z = 0.34 + starIndex * 0.012;

    return bestOffset;
}

/**
 * Computes the convex hull of `points` (Andrew's monotone chain) and expands
 * each hull vertex outward from `center` by `padding` world units.
 */
export function createExpandedBoundaryHull(
    points: BoundaryPoint[],
    center: THREE.Vector3,
    padding: number,
): BoundaryPoint[] {
    if (points.length < 3) {
        return createFallbackBoundary(points, center, padding);
    }

    const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (origin: BoundaryPoint, a: BoundaryPoint, b: BoundaryPoint): number =>
        (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
    const lower: BoundaryPoint[] = [];
    const upper: BoundaryPoint[] = [];

    for (const point of sorted) {
        while (
            lower.length >= 2 &&
            cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
        ) {
            lower.pop();
        }
        lower.push(point);
    }

    for (let index = sorted.length - 1; index >= 0; index -= 1) {
        const point = sorted[index];

        while (
            upper.length >= 2 &&
            cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
        ) {
            upper.pop();
        }
        upper.push(point);
    }

    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));

    if (hull.length < 3) {
        return createFallbackBoundary(points, center, padding);
    }

    return hull.map((point) => {
        const fromCenter = new THREE.Vector2(point.x - center.x, point.y - center.y);

        if (fromCenter.lengthSq() < 0.0001) {
            return point;
        }

        fromCenter.normalize().multiplyScalar(padding);

        return {
            x: point.x + fromCenter.x,
            y: point.y + fromCenter.y,
        };
    });
}

/**
 * Generates a circular boundary approximation for degenerate cases
 * where fewer than 3 points are available or the hull is collinear.
 */
function createFallbackBoundary(
    points: BoundaryPoint[],
    center: THREE.Vector3,
    padding: number,
): BoundaryPoint[] {
    const radius =
        Math.max(
            padding,
            ...points.map((point) => Math.hypot(point.x - center.x, point.y - center.y)),
        ) + padding;
    const segments = 12;
    const boundary: BoundaryPoint[] = [];

    for (let index = 0; index < segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2;

        boundary.push({
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
        });
    }

    return boundary;
}
