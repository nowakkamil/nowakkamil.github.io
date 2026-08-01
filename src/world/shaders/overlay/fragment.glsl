uniform float uFade;
uniform float uTime;
uniform float uGrainStrength;

float interleavedGradientNoise(vec2 pixel) {
    return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
    float fade = clamp(uFade, 0.0, 1.0);
    float frame = floor(uTime * 24.0);
    vec2 frameOffset = vec2(mod(frame * 17.0, 61.0), mod(frame * 29.0, 47.0));
    float grainA = interleavedGradientNoise(gl_FragCoord.xy + frameOffset);
    float grainB = interleavedGradientNoise(gl_FragCoord.yx * 0.75487766 - frameOffset);
    float triangularGrain = grainA + grainB - 1.0;
    float grainEnvelope = 4.0 * fade * (1.0 - fade);
    float ditheredFade = clamp(fade +
        triangularGrain *
        uGrainStrength *
        grainEnvelope, 0.0, 1.0);
    gl_FragColor = vec4(vec3(0.0), ditheredFade);
}