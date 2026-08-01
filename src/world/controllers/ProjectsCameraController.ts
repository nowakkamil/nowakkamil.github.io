import { smoothstep } from '../../utils/animation';
import { BaseCameraController } from './BaseCameraController';

class ProjectsCameraController extends BaseCameraController {
    update(scrollProgress: number): void {
        const minZ = this.cameraConfig.projectsMinZ;
        const maxZ = this.cameraConfig.projectsMaxZ;

        const t = Math.min(scrollProgress * 1.5, 1.0);
        const eased = smoothstep(t);

        const inverted = 1 - eased;

        this.camera.position.z = minZ + (maxZ - minZ) * inverted;
    }
}

export { ProjectsCameraController };
