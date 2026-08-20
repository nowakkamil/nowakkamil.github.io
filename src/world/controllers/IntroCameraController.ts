import { smoothstep } from '../../utils/animation';
import { BaseCameraController } from './BaseCameraController';

class IntroCameraController extends BaseCameraController {
    update(scrollProgress: number): void {
        const minZ = this.cameraConfig.introMinZ;
        const maxZ = this.cameraConfig.introMaxZ;

        const t = Math.min(scrollProgress * 1.5, 1.0);
        const eased = smoothstep(t);

        this.camera.position.z = minZ + (maxZ - minZ) * eased;
        this.camera.position.x = 0;
        this.camera.position.y = 0;
    }
}

export { IntroCameraController };
