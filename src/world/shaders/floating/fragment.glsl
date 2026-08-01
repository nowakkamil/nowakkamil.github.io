uniform vec3 uColor;
uniform float uVisibility;

varying float vAlpha;
varying float vPointerInfluence;
varying float vTwinkle;

void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);

    if(d > 0.5) {
        discard;
    }

    float core = 1.0 - smoothstep(0.08, 0.5, d);
    float glow = 1.0 - smoothstep(0.0, 0.5, d);

    float alpha = core * glow;

    alpha *= vAlpha;
    alpha *= uVisibility;

    float interactionGlow = 1.0 + vPointerInfluence * (0.05 + vTwinkle * 0.025);

    gl_FragColor = vec4(uColor, alpha * 0.62 * interactionGlow);
}
