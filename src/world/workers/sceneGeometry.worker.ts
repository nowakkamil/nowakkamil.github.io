import * as THREE from 'three';

import regularFontUrl from '../../assets/fonts/Urbanist_Regular.typeface.json?url';
import italicFontUrl from '../../assets/fonts/Urbanist_Italic.typeface.json?url';
import { loadFontAsset } from '../loadFontAsset';
import {
    createFloatingTextParticleGeometry,
    createTextMorphPositions,
    createTopDownGalaxyParticlePositions,
    createViewportTunnelParticlePositions,
} from '../factories/GeometryFactory';
import type {
    FloatingTextGeometryData,
    SceneGeometryData,
    SceneGeometryRequest,
    SceneGeometryWorkerResponse,
    SceneMorphTargetKey,
} from './sceneGeometryTypes';

interface WorkerScope {
    onmessage: ((event: MessageEvent<SceneGeometryRequest>) => void) | null;
    postMessage(message: SceneGeometryWorkerResponse, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as WorkerScope;

const getFloatAttribute = (geometry: THREE.BufferGeometry, name: string): Float32Array => {
    const attribute = geometry.getAttribute(name);
    if (!(attribute?.array instanceof Float32Array)) {
        throw new Error(`Geometry attribute "${name}" is missing`);
    }
    return attribute.array;
};

const collectTransferables = (data: SceneGeometryData): Transferable[] => {
    const arrays: Float32Array[] = [
        data.floatingText.position,
        data.floatingText.offset,
        data.floatingText.start,
        ...Object.values(data.shapeTargets),
        ...Object.values(data.ellipsisTargets),
    ];

    return arrays.map((array) => array.buffer);
};

workerScope.onmessage = (event) => {
    (async () => {
        try {
            const { cloudPositions, floatingTextCount, ellipsisCount } = event.data;
            const [regularFont, italicFont] = await Promise.all([
                loadFontAsset(regularFontUrl, 'regular Urbanist'),
                loadFontAsset(italicFontUrl, 'italic Urbanist'),
            ]);
            workerScope.postMessage({ ok: true, phase: 'assets-ready' }, []);

            const floatingGeometry = createFloatingTextParticleGeometry(
                regularFont,
                italicFont,
                floatingTextCount,
            );
            const floatingText: FloatingTextGeometryData = {
                position: getFloatAttribute(floatingGeometry, 'position'),
                offset: getFloatAttribute(floatingGeometry, 'aOffset'),
                start: getFloatAttribute(floatingGeometry, 'aStart'),
            };
            const shapeTargets: Record<SceneMorphTargetKey, Float32Array> = {
                name: createTextMorphPositions(regularFont, 'KAMIL NOWAK', cloudPositions),
                experience: createTextMorphPositions(regularFont, 'EXPERIENCE', cloudPositions),
                education: createTextMorphPositions(regularFont, 'EDUCATION', cloudPositions),
                projects: createTextMorphPositions(regularFont, 'PROJECTS', cloudPositions),
                tunnel: createViewportTunnelParticlePositions(cloudPositions),
            };
            const ellipsisTargets: SceneGeometryData['ellipsisTargets'] = {
                cloud: createTopDownGalaxyParticlePositions(ellipsisCount, 43.4, 3, 11),
                name: createTopDownGalaxyParticlePositions(ellipsisCount, 30, 3, 23),
                experience: createTopDownGalaxyParticlePositions(ellipsisCount, 33, 5, 37),
                education: createTopDownGalaxyParticlePositions(ellipsisCount, 33, 5, 37),
                projects: createTopDownGalaxyParticlePositions(ellipsisCount, 33.6, 2.1, 53),
                tunnel: createTopDownGalaxyParticlePositions(ellipsisCount, 29.2, 2, 71),
            };
            const data: SceneGeometryData = {
                floatingText,
                shapeTargets,
                ellipsisTargets,
            };

            floatingGeometry.dispose();
            workerScope.postMessage({ ok: true, data }, collectTransferables(data));
        } catch (error) {
            workerScope.postMessage(
                {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                },
                [],
            );
        }
    })();
};
