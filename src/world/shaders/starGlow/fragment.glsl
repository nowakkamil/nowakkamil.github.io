uniform float uOpacity;
varying float vTrail;
varying float vAcross;

void main() {
    float tail = pow(clamp(vTrail, 0.0, 1.0), 1.75);
    float softTip = 1.0 - smoothstep(0.84, 1.0, vTrail);
    float lateralBlur = exp(-4.5 * vAcross * vAcross);
    float alpha = uOpacity * tail * softTip * lateralBlur;

    if(alpha < 0.004)
        discard;
    gl_FragColor = vec4(vec3(1.0), alpha);
}