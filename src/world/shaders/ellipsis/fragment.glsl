varying float vDist;
varying float vAlpha;
varying float vStationary;
varying float vColorPhase;

uniform float uMaxDist;
uniform float uCoreMaxDist;
uniform float uVisibility;
uniform float uTransitionVisibility;
uniform vec3 uGeminiColors[5];

vec3 geminiGradient(float value) {
    float p = fract(value);
    vec3 coolKey = mix(uGeminiColors[0], uGeminiColors[4], smoothstep(0.06, 0.94, p));
    float violetFill = smoothstep(0.16, 0.40, p) *
        (1.0 - smoothstep(0.60, 0.84, p));
    vec3 graded = mix(coolKey, uGeminiColors[2], violetFill * 0.46);

    float greenAccent = exp(-pow((p - 0.095) / 0.032, 2.0));
    float redAccent = exp(-pow((p - 0.90) / 0.03, 2.0));
    graded = mix(graded, uGeminiColors[1], greenAccent * 0.11);
    graded = mix(graded, uGeminiColors[3], redAccent * 0.13);

    return graded;
}

void main() {
    float pointDistance = length(gl_PointCoord - 0.5);
    if(pointDistance > 0.5)
        discard;

    float radialDistance = clamp(vDist / uMaxDist, 0.0, 1.0);
    float inward = 1.0 - radialDistance;

    vec3 color = geminiGradient(vColorPhase + inward * 0.08);

    float pointMask = 1.0 - smoothstep(0.02, 0.70, pointDistance);
    float coreDistance = clamp(vDist / uCoreMaxDist, 0.0, 1.0);
    float coreEdgeFade = 1.0 - smoothstep(0.30, 1.00, coreDistance);
    float xAxisEdgeFade = 1.0 - smoothstep(0.40, 1.00, radialDistance);
    float edgeFade = mix(pow(coreEdgeFade, 0.65), pow(xAxisEdgeFade, 0.65), step(0.5, vStationary));
    float edgeBrightness = mix(0.04, 1.0, pow(edgeFade, 0.55));

    color *= edgeBrightness;

    float visibilityFade = smoothstep(0.0, 0.55, uVisibility);

    float alpha = vAlpha *
        visibilityFade *
        uTransitionVisibility *
        pointMask *
        edgeFade;

    gl_FragColor = vec4(color, alpha);
}
