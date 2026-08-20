varying vec2 vWakeUv;

void main() {
    vWakeUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
