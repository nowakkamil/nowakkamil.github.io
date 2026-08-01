attribute vec3 aStart;
attribute float aOffset;

uniform float uTime;
uniform float uAmplitude;
uniform float uSpeed;
uniform float uSize;
uniform float uScroll;
uniform float uRevealStartTime;
uniform float uRevealDelay;
uniform float uRevealVisibility;
uniform vec2 uPointer;
uniform float uPointerPower;
uniform float uAspect;

varying float vAlpha;
varying float vGlow;
varying float vPointerInfluence;

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

float smootherstep01(float value) {
    value = clamp(value, 0.0, 1.0);
    return value * value * value *
        (value * (value * 6.0 - 15.0) + 10.0);
}

float settleEase01(float value) {
    float smoothProgress = clamp(smootherstep01(value), 0.0, 1.0);
    float remaining = max(1.0 - smoothProgress, 0.0);
    return clamp(1.0 - pow(remaining, 1.35), 0.0, 1.0);
}

void main() {
    float revealTime = max(uTime - uRevealStartTime - uRevealDelay, 0.0);
    float personality = hash(aOffset * 17.31);
    float orbitAngle = revealTime * uSpeed * mix(0.55, 0.9, personality) + aOffset;
    float orbitRadius = uAmplitude * mix(0.35, 0.75, personality);

    float progress = settleEase01((revealTime - 0.15) / 3.35);

    vec3 pos = mix(aStart, position, progress);

    float orbitReveal = smoothstep(1.6, 3.0, revealTime);
    vec3 orbitOffset = vec3(cos(orbitAngle), sin(orbitAngle), sin(orbitAngle * 0.73 + aOffset) * 0.35) * orbitRadius * orbitReveal;

    pos += orbitOffset;

    float dissolve = smoothstep(0.0, 1.0, uScroll);
    float rnd = hash(aOffset * 123.456);

    float threshold = smoothstep(0.0, 1.0, rnd + dissolve * 0.35);

    vec3 dissolveOffset = vec3((rnd - 0.5) * 0.02, (hash(rnd + 1.0) - 0.5) * 0.02, (hash(rnd + 2.0) - 0.5) * 0.02) * dissolve;

    pos += dissolveOffset * threshold;

    float alphaIn = progress;

    float alphaOut = 1.0 - smoothstep(0.04, 0.24, uScroll);

    float alphaDissolve = 1.0 - threshold;

    vAlpha = alphaIn * alphaOut * alphaDissolve * uRevealVisibility;
    vGlow = progress * alphaOut * uRevealVisibility;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clipPosition = projectionMatrix * mv;
    vec2 screenPosition = clipPosition.xy / max(clipPosition.w, 0.001);
    vec2 pointerDelta = screenPosition - uPointer;
    vec2 aspectDelta = vec2(pointerDelta.x * uAspect, pointerDelta.y);
    float pointerDistance = length(aspectDelta);

    const float repulsionRadius = 0.42;
    float edgeProgress = (pointerDistance - 0.16) / (repulsionRadius - 0.16);
    float edgeFalloff = 1.0 - smootherstep01(edgeProgress);
    float repulsion = edgeFalloff * uPointerPower;

    vec2 aspectDirection = aspectDelta / max(pointerDistance, 0.0001);
    float depthParallax = mix(0.82, 1.12, personality);
    float pushDistance = repulsion * 0.065 * depthParallax;
    screenPosition += vec2(aspectDirection.x / uAspect, aspectDirection.y) * pushDistance;

    clipPosition.xy = screenPosition * clipPosition.w;
    vPointerInfluence = repulsion;

    float pulse = 0.9 + 0.1 * sin(orbitAngle * 1.35);
    float sizeVariation = mix(0.94, 1.06, personality);
    float viewDepth = max(-mv.z, 0.001);
    gl_PointSize = uSize * pulse * sizeVariation *
        (300.0 / viewDepth) * mix(1.0, 1.10, repulsion);
    gl_Position = clipPosition;
}
