attribute float aTrail;
varying float vTrail;

void main() {
    vTrail = aTrail;
    gl_Position = projectionMatrix * modelViewMatrix *
        vec4(position, 1.0);
}