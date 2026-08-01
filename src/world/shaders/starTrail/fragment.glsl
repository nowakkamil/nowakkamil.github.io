uniform float uOpacity;
varying float vTrail;

void main() {
    float tail = pow(clamp(vTrail, 0.0, 1.0), 2.2);
    float softTip = 1.0 - smoothstep(0.82, 1.0, vTrail);
    gl_FragColor = vec4(vec3(1.0), uOpacity * tail * softTip);
}