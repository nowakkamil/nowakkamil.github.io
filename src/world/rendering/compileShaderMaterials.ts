import * as THREE from 'three';

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
    materials.forEach((material) => {
        scene.add(new THREE.Mesh(geometry, material));
    });

    try {
        await renderer.compileAsync(scene, camera);
    } finally {
        geometry.dispose();
    }
};
