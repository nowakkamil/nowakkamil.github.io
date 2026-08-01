import * as THREE from 'three';
import type { ResponsiveConfig } from '../../app/responsiveConfig';

abstract class BaseCameraController<TCamera extends THREE.Camera = THREE.Camera> {
    protected readonly camera: TCamera;
    protected cameraConfig: ResponsiveConfig['camera'];

    constructor(camera: TCamera, cameraConfig: ResponsiveConfig['camera']) {
        this.camera = camera;
        this.cameraConfig = cameraConfig;
    }

    setResponsiveConfig(cameraConfig: ResponsiveConfig['camera']): void {
        this.cameraConfig = cameraConfig;
    }
}

export { BaseCameraController };
