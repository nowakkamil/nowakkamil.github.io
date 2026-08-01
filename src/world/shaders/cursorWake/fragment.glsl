uniform float uOpacity;
uniform float uSpeedFactor;
uniform float uTime;

varying vec2 vWakeUv;

void main() {
    float across = vWakeUv.x - 0.5;
    float trail = vWakeUv.y;
    float flowReveal = smoothstep(0.08, 0.34, trail);
    float flowCurve = (
        sin(trail * 3.2 - uTime * 0.12) * 0.068 +
        sin(trail * 5.0 + uTime * 0.08 + 1.2) * 0.024
    ) * flowReveal;

    float trailAge = smoothstep(0.1, 0.9, trail);
    float visibleWidth = mix(1.0, 0.52, trailAge);
    float crossDistance = min(
        1.0,
        abs(across - flowCurve) * 2.0 / visibleWidth
    );
    float outerGlow =
        1.0 - smoothstep(0.08, 1.0, crossDistance);
    float innerGlow =
        1.0 - smoothstep(0.02, 0.72, crossDistance);
    float softCore =
        1.0 - smoothstep(0.0, 0.52, crossDistance);
    float centerLift =
        1.0 - smoothstep(0.0, 0.32, crossDistance);
    float bloom = pow(outerGlow, 0.58);
    float centeredDistance = abs(across - flowCurve);
    float headGap = smoothstep(0.055, 0.17, trail);
    float tailFade = 1.0 - smoothstep(0.42, 0.88, trail);
    tailFade *= tailFade;
    float groupedEnvelope =
        1.0 - smoothstep(0.37, 0.49, centeredDistance);
    float taper = headGap * groupedEnvelope;
    float speedOpacity = uOpacity;
    float fade = tailFade;
    float nearCursorGlow = 1.0 - smoothstep(0.12, 0.62, trail);
    float longitudinalTaper = mix(1.0, 0.28, trailAge);
    float stretchedVariation =
        1.0 +
        sin(trail * 8.5 - uTime * 0.08) * 0.035 +
        sin(trail * 16.0 + across * 3.0 + uTime * 0.05) * 0.015;
    float alpha =
        bloom * (0.09 + nearCursorGlow * 0.04) +
        outerGlow * 0.085 +
        innerGlow * 0.11 +
        softCore * 0.135 +
        centerLift * 0.07;
    alpha *=
        taper *
        longitudinalTaper *
        stretchedVariation *
        speedOpacity *
        fade;

    vec3 paleBlue = vec3(0.54, 0.65, 0.74);
    vec3 highSpeedTint = vec3(0.62, 0.67, 0.78);
    vec3 ribbonColor = mix(
        paleBlue,
        highSpeedTint,
        uSpeedFactor * 0.14
    );
    vec3 trailColor = mix(
        ribbonColor,
        vec3(0.72, 0.8, 0.86),
        softCore * 0.34
    );

    gl_FragColor = vec4(trailColor, alpha);
}
