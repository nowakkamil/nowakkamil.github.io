import * as THREE from 'three';
import { yieldToMainThread } from '../../utils/yieldToMainThread';

export const compileShaderMaterials = async (
    renderer: THREE.WebGLRenderer,
    materials: THREE.Material[],
): Promise<void> => {
    if (materials.length === 0) {
        return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, materials[0]);
    scene.add(mesh);

    try {
        for (const material of materials) {
            mesh.material = material;
            // Compile one material at a time so each GPU-flush stays under 50 ms
            // and the browser can handle input events between compilations.
            await renderer.compileAsync(scene, camera);
            await yieldToMainThread();
        }
    } finally {
        geometry.dispose();
    }
};
