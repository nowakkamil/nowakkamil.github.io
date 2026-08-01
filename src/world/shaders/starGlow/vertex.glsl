attribute float aTrail;
attribute float aAcross;
varying float vTrail;
varying float vAcross;

void main() {
    vTrail = aTrail;
    vAcross = aAcross;
    gl_Position = projectionMatrix * modelViewMatrix *
        vec4(position, 1.0);
}