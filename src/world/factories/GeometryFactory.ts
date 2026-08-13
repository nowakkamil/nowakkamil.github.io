import * as THREE from 'three';
import type { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createCloudParticleGeometry(count: number): THREE.BufferGeometry {
    const positions = createCloudParticlePositions(count);
    const randoms = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
        randoms[index] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute(
        'morphFactor',
        new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.center();

    return geometry;
}

export function createCloudParticleGeometryFromData(
    positions: Float32Array,
    randoms: Float32Array,
): THREE.BufferGeometry {
    const count = positions.length / 3;
    if (randoms.length !== count) {
        throw new Error('Cloud particle geometry attributes have mismatched counts');
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute(
        'morphFactor',
        new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage),
    );

    return geometry;
}

function createCloudParticlePositions(count: number, minRadius = 5, maxRadius = 40): Float32Array {
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
        const i3 = i * 3;
        const r = minRadius + Math.pow(Math.random(), 0.4) * (maxRadius - minRadius);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        positions[i3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i3 + 2] = r * Math.cos(phi);
    }

    return positions;
}

export function createTopDownGalaxyParticlePositions(
    count: number,
    radius = 40,
    thickness = 2.5,
    seed = 1,
): Float32Array {
    const positions = new Float32Array(count * 3);
    const diskCount = Math.floor(count / 2);
    const sphereCount = count - diskCount;
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

        if (index >= sphereCount) {
            const outerDiskRadius = radius * 2.2;
            const diskRadius = Math.sqrt(random()) * outerDiskRadius;
            const diskAngle = random() * Math.PI * 2;
            const xProgress = Math.cos(diskAngle) * (diskRadius / outerDiskRadius);
            const edgeTaper = Math.sqrt(Math.max(1 - xProgress * xProgress, 0));
            const diffuseParticle = random() < 0.28;
            const verticalScatter = (random() + random() + random() - 1.5) / 1.5;
            const ySpread = diffuseParticle ? 0.68 : 0.3;
            const midplaneDrift =
                Math.sin(xProgress * 8.0 + seed * 0.37) * radius * 0.02 * edgeTaper;

            positions[index3] = Math.cos(diskAngle) * diskRadius;
            positions[index3 + 1] =
                verticalScatter * radius * ySpread * (0.28 + edgeTaper * 0.72) +
                midplaneDrift +
                (random() - 0.5) * thickness * 0.35 -
                radius * 0.025;
            positions[index3 + 2] = Math.sin(diskAngle) * diskRadius * 0.7;
            continue;
        }

        const particleRadius = radius * Math.cbrt(random());
        const azimuth = random() * Math.PI * 2;
        const polarCosine = random() * 2 - 1;
        const polarSine = Math.sqrt(1 - polarCosine * polarCosine);

        positions[index3] = Math.cos(azimuth) * polarSine * particleRadius;
        positions[index3 + 1] = Math.sin(azimuth) * polarSine * particleRadius;
        positions[index3 + 2] = polarCosine * particleRadius;
    }

    return positions;
}

export function createViewportTunnelParticlePositions(
    sourcePositions: Float32Array,
    seed = 97,
): Float32Array {
    const count = sourcePositions.length / 3;
    const positions = new Float32Array(sourcePositions.length);
    let cloudRadius = 0;
    let randomState = seed >>> 0;
    const random = (): number => {
        randomState += 0x6d2b79f5;
        let value = randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };

    for (let index = 0; index < sourcePositions.length; index += 3) {
        cloudRadius = Math.max(
            cloudRadius,
            Math.hypot(
                sourcePositions[index],
                sourcePositions[index + 1],
                sourcePositions[index + 2],
            ),
        );
    }
    const safeCloudRadius = Math.max(cloudRadius, 1);
    const tunnelDepth = safeCloudRadius * 100;
    const tunnelOuterRadius = safeCloudRadius * 1.2;
    const tunnelInnerRadius = safeCloudRadius * 0.6;

    for (let index = 0; index < count; index += 1) {
        const index3 = index * 3;
        const sourceX = sourcePositions[index3];
        const sourceY = sourcePositions[index3 + 1];
        const sourceZ = sourcePositions[index3 + 2];
        const sourceRadiusXY = Math.hypot(sourceX, sourceY);
        const fallbackAngle = random() * Math.PI * 2;
        const baseAngle = sourceRadiusXY > 0.001 ? Math.atan2(sourceY, sourceX) : fallbackAngle;
        const depth = THREE.MathUtils.clamp(sourceZ, -tunnelDepth * 0.5, tunnelDepth * 0.5);
        const depthProgress = THREE.MathUtils.clamp((sourceZ / safeCloudRadius) * 0.5 + 0.5, 0, 1);
        const wallProgress = Math.pow(random(), 0.8);
        const wallRadius = THREE.MathUtils.lerp(tunnelInnerRadius, tunnelOuterRadius, wallProgress);
        const ringWarp =
            1 +
            Math.sin(baseAngle * 2.0 + depthProgress * Math.PI * 4.0) * 0.045 +
            Math.sin(baseAngle * 5.0 - depthProgress * Math.PI * 7.0 + seed) * 0.02;
        const tunnelAngle =
            baseAngle +
            Math.sin(depthProgress * Math.PI * 2.0 + seed) * 0.075 +
            Math.sin(depthProgress * Math.PI * 6.0 + baseAngle * 2.0) * 0.025;
        const radius = wallRadius * ringWarp + (random() - 0.5) * safeCloudRadius * 0.025;
        const scatter = safeCloudRadius * 0.012;

        positions[index3] = Math.cos(tunnelAngle) * radius + (random() - 0.5) * scatter;
        positions[index3 + 1] = Math.sin(tunnelAngle) * radius + (random() - 0.5) * scatter;
        positions[index3 + 2] = depth + (random() - 0.5) * safeCloudRadius * 0.08;
    }

    return positions;
}

export function createTextMorphPositions(
    font: Font,
    text: string,
    cloudPositions: Float32Array,
): Float32Array {
    const count = cloudPositions.length / 3;
    const PERFOMANCE_EFFICIENT_SEGMENTS_COUNT = 8;
    const textGeometry = new TextGeometry(text, {
        font,
        size: 2,
        depth: 0.4,
        curveSegments: PERFOMANCE_EFFICIENT_SEGMENTS_COUNT,
    });
    const samplerMaterial = new THREE.MeshBasicMaterial();
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(textGeometry, samplerMaterial)).build();
    const positions = new Float32Array(cloudPositions.length);
    const sample = new THREE.Vector3();

    for (let index = 0; index < count; index += 1) {
        sampler.sample(sample);

        const index3 = index * 3;
        positions[index3] = sample.x;
        positions[index3 + 1] = sample.y;
        positions[index3 + 2] = sample.z;
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    geometry.setAttribute('position', positionAttribute);
    geometry.center();

    for (let index = 0; index < positionAttribute.count; index += 1) {
        positionAttribute.setZ(index, positionAttribute.getZ(index) + Math.random() * 0.4 - 0.2);
    }

    const cloudAttribute = new THREE.BufferAttribute(cloudPositions, 3);
    const cloudSize = new THREE.Vector3();
    const textSize = new THREE.Vector3();
    new THREE.Box3().setFromBufferAttribute(cloudAttribute).getSize(cloudSize);
    new THREE.Box3().setFromBufferAttribute(positionAttribute).getSize(textSize);

    const textLength = textSize.length();
    if (textLength > 0) {
        const scale = cloudSize.length() / textLength;
        geometry.scale(scale, scale, scale);
    }

    geometry.rotateX(THREE.MathUtils.degToRad(6));

    const target = new Float32Array(
        (geometry.getAttribute('position') as THREE.BufferAttribute).array,
    );

    geometry.dispose();
    textGeometry.dispose();
    samplerMaterial.dispose();

    return target;
}

export function createAnimatedParticleGeometryFromPositions(
    positions: Float32Array,
    stationaryFraction = 0,
): THREE.BufferGeometry {
    const count = positions.length / 3;
    const velocities = new Float32Array(count);
    const lives = new Float32Array(count);
    const stationary = new Float32Array(count);
    const stationaryStart = count - Math.floor(count * stationaryFraction);

    for (let index = 0; index < count; index += 1) {
        velocities[index] = 0.4 + Math.random() * 0.6;
        lives[index] = Math.random();
        stationary[index] = index >= stationaryStart ? 1 : 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));
    geometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
    geometry.setAttribute('stationary', new THREE.BufferAttribute(stationary, 1));

    return geometry;
}

export function createAmbientFloatingParticlesGeometry(count = 2000): THREE.BufferGeometry {
    const positions = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const offset = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
        const i3 = i * 3;

        positions[i3] = (Math.random() - 0.5) * 30;
        positions[i3 + 1] = (Math.random() - 0.5) * 20;
        positions[i3 + 2] = -15 - Math.random() * 5;

        speed[i] = 0.35 + Math.random() * 0.45;

        offset[i] = (i + Math.random()) / count;
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('speed', new THREE.BufferAttribute(speed, 1));
    geometry.setAttribute('offset', new THREE.BufferAttribute(offset, 1));

    return geometry;
}

export function createFloatingTextParticleGeometry(
    regularFont: Font,
    italicFont: Font,
    count = 2600,
): THREE.BufferGeometry {
    const lineHeight = 3;
    const createTrackedLine = (
        text: string,
        font: Font,
        size: number,
        depth: number,
        curveSegments: number,
        tracking: number,
        wordSpacing: number,
        y: number,
    ): THREE.BufferGeometry[] => {
        const glyphs: THREE.BufferGeometry[] = [];
        let cursor = 0;
        let hasPreviousGlyph = false;

        const characters = Array.from(text);
        for (let index = 0; index < characters.length; index += 1) {
            const character = characters[index];
            if (character === ' ') {
                cursor += wordSpacing;
                hasPreviousGlyph = false;
                continue;
            }

            const glyph = new TextGeometry(character, {
                font,
                size,
                depth,
                curveSegments,
            });
            glyph.computeBoundingBox();

            const bounds = glyph.boundingBox;
            const width = bounds ? bounds.max.x - bounds.min.x : 0;
            if (hasPreviousGlyph) {
                cursor += tracking;
            }
            glyph.translate(cursor - (bounds?.min.x ?? 0), 0, 0);
            cursor += width;
            glyphs.push(glyph);
            hasPreviousGlyph = true;
        }

        glyphs.forEach((glyph) => glyph.translate(-cursor * 0.5, y, 0));
        return glyphs;
    };

    const lineGeometries = [
        ...createTrackedLine('scroll', italicFont, 3.2, 0.4, 8, 0.24, 0, -lineHeight),
        ...createTrackedLine('TO DIVE IN', regularFont, 1.45, 0.5, 4, 0.28, 0.82, -lineHeight * 2),
    ];

    const merged = mergeGeometries(lineGeometries);
    if (!merged) {
        throw new Error('Could not merge floating text geometries');
    }

    merged.translate(0, -1.5, -40);

    const samplerMesh = new THREE.Mesh(
        merged,
        new THREE.MeshBasicMaterial({
            wireframe: true,
            opacity: 0.1,
            transparent: true,
        }),
    );
    const sampler = new MeshSurfaceSampler(samplerMesh).build();

    const positions = new Float32Array(count * 3);
    const offsets = new Float32Array(count);
    const startPositions = new Float32Array(count * 3);
    const tmp = new THREE.Vector3();

    for (let i = 0; i < count; i += 1) {
        sampler.sample(tmp);

        const i3 = i * 3;
        positions[i3] = tmp.x;
        positions[i3 + 1] = tmp.y;
        positions[i3 + 2] = tmp.z;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const dx = Math.sin(phi) * Math.cos(theta);
        const dy = Math.sin(phi) * Math.sin(theta);
        const dz = Math.cos(phi);
        const dist = 1 + Math.random() * 2;

        startPositions[i3] = tmp.x + dx * dist;
        startPositions[i3 + 1] = tmp.y + dy * dist;
        startPositions[i3 + 2] = tmp.z + dz * dist - 2;
        offsets[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(startPositions, 3));

    lineGeometries.forEach((lineGeometry) => lineGeometry.dispose());
    samplerMesh.material.dispose();
    merged.dispose();

    return geometry;
}
