export type SceneMorphTargetKey = 'name' | 'experience' | 'education' | 'projects' | 'tunnel';

export interface SceneGeometryRequest {
    mainCloudCount: number;
    floatingTextCount: number;
    ellipsisCount: number;
}

export interface MainCloudGeometryData {
    position: Float32Array;
    random: Float32Array;
}

export interface FloatingTextGeometryData {
    position: Float32Array;
    offset: Float32Array;
    start: Float32Array;
}

export interface SceneGeometryData {
    mainCloud: MainCloudGeometryData;
    floatingText: FloatingTextGeometryData;
    shapeTargets: Record<SceneMorphTargetKey, Float32Array>;
    ellipsisTargets: Record<'cloud' | SceneMorphTargetKey, Float32Array>;
}

export type SceneGeometryWorkerResponse =
    | { ok: true; phase: 'assets-ready' }
    | { ok: true; data: SceneGeometryData }
    | { ok: false; error: string };
