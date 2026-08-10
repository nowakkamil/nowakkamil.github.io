import * as THREE from 'three';

export const compileShaderMaterials = async (
    renderer: THREE.WebGLRenderer,
    materials: THREE.Material[],
): Promise<void> => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry);
    scene.add(mesh);

    try {
        for (const material of materials) {
            mesh.material = material;
            await renderer.compileAsync(scene, camera);
        }
    } finally {
        geometry.dispose();
    }
};
