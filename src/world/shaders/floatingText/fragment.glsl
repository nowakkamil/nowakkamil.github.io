varying float vAlpha;
varying float vGlow;
varying float vPointerInfluence;

uniform vec3 uBloomColor;
uniform float uBloomStrength;
uniform float uHazeStrength;

void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);

    if (d > 0.5) {
        discard;
    }

    float core =
        1.0 - smoothstep(0.18, 0.28, d);

    float bloom =
        pow(1.0 - smoothstep(0.04, 0.46, d), 1.15) *
        uBloomStrength *
        vGlow *
        4.8;

    float haze =
        exp(-d * d * 3.2) *
        (1.0 - smoothstep(0.30, 0.5, d)) *
        uHazeStrength *
        vGlow *
        5.4;

    float alpha =
        min(1.0, core + bloom * 0.9 + haze * 0.75) *
        vAlpha;

    vec3 baseColor = mix(uBloomColor, vec3(1.0), core);

    vec3 color =
        baseColor *
        (1.0 + bloom * 1.6 + haze * 0.9) *
        (1.0 + vPointerInfluence * 0.16);

    gl_FragColor = vec4(color, alpha);
}
