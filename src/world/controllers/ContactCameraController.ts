import * as THREE from 'three';
import { smoothstep } from '../../utils/animation';
import { BaseCameraController } from './BaseCameraController';

class ContactCameraController extends BaseCameraController<THREE.PerspectiveCamera> {
    private readonly startPosition = new THREE.Vector3();
    private readonly startRotation = new THREE.Euler();
    private readonly loopZoomStartPosition = new THREE.Vector3();
    private readonly loopZoomStartRotation = new THREE.Euler();
    private tugProgress = 0;
    private hasStartPose = false;
    private startFov = 50;

    beginTransitionFromCurrentCamera(): void {
        this.startPosition.copy(this.camera.position);
        this.startPosition.z = this.cameraConfig.projectsMinZ;
        this.startRotation.copy(this.camera.rotation);
        this.startFov = this.camera.fov;
        this.hasStartPose = true;
    }

    update(scrollProgress: number): void {
        if (!this.hasStartPose) {
            this.beginTransitionFromCurrentCamera();
        }

        const entryZoomDistance = this.cameraConfig.contactEntryDistance;
        const settledZoomOutDistance = this.cameraConfig.contactSettledDistance;
        const tugZoomDistance = this.cameraConfig.contactTugDistance;
        const t = THREE.MathUtils.clamp(scrollProgress, 0, 1);
        const cameraEased = smoothstep(t);
        const phaseProgress = t < 0.5 ? t * 2 : (t - 0.5) * 2;
        const eased = smoothstep(phaseProgress);
        const zOffset =
            t < 0.5
                ? -entryZoomDistance * eased
                : THREE.MathUtils.lerp(-entryZoomDistance, settledZoomOutDistance, eased);

        this.camera.position.x = this.startPosition.x;
        this.camera.position.y = this.startPosition.y;
        this.camera.position.z =
            this.startPosition.z + zOffset - tugZoomDistance * this.tugProgress;
        this.camera.rotation.copy(this.startRotation);
        this.setFov(THREE.MathUtils.lerp(this.startFov, this.cameraConfig.contactFov, cameraEased));
    }

    setTugProgress(progress: number): void {
        const t = THREE.MathUtils.clamp(progress, 0, 1);
        this.tugProgress = smoothstep(t);
    }

    beginLoopZoomOut(): void {
        this.loopZoomStartPosition.copy(this.camera.position);
        this.loopZoomStartRotation.copy(this.camera.rotation);
    }

    updateLoopZoomOut(progress: number): void {
        const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
        const eased = 1 - Math.pow(1 - clampedProgress, 3);

        this.camera.position.x = THREE.MathUtils.lerp(this.loopZoomStartPosition.x, 0, eased);
        this.camera.position.y = THREE.MathUtils.lerp(this.loopZoomStartPosition.y, 0, eased);
        this.camera.position.z =
            this.loopZoomStartPosition.z - this.cameraConfig.contactLoopDistance * eased;
        this.camera.rotation.copy(this.loopZoomStartRotation);
        this.setFov(this.cameraConfig.contactFov);
    }

    private setFov(fov: number): void {
        if (Math.abs(this.camera.fov - fov) < 0.001) {
            return;
        }

        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
    }
}

export { ContactCameraController };
