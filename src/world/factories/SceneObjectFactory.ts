import * as THREE from 'three';

const fullscreenPlaneGeometry = new THREE.PlaneGeometry(2, 2);

export function createFadeOverlayMesh(material: THREE.ShaderMaterial): THREE.Mesh {
    const overlay = new THREE.Mesh(fullscreenPlaneGeometry, material);
    overlay.frustumCulled = false;
    overlay.renderOrder = 999999;

    return overlay;
}

export function createColoredLightMesh(material: THREE.ShaderMaterial): THREE.Mesh {
    const mesh = new THREE.Mesh(fullscreenPlaneGeometry, material);

    mesh.frustumCulled = false;
    mesh.renderOrder = -2;

    return mesh;
}
