attribute float speed;
attribute float offset;

uniform float uTime;
uniform float uAspect;
uniform vec2 uPointer;
uniform float uPointerStrength;

varying float vAlpha;
varying float vPointerInfluence;
varying float vTwinkle;

void main() {
    vec3 pos = position;

    const float referenceAspect = 1.7777778;

    float horizontalScale = max(1.0, uAspect / referenceAspect) * 1.15;

    pos.x *= horizontalScale;

    const float rangeMin = -20.0;
    const float rangeMax = 20.0;

    float safeSpeed = max(speed, 0.22);

    float phase = fract(offset +
        uTime * safeSpeed * 0.012 +
        position.y * 0.013);

    float y = mix(rangeMin, rangeMax, phase);

    pos.y = y;

    pos.x += sin(uTime * 0.17 +
        offset * 12.0 +
        position.y * 0.16 +
        safeSpeed * 8.0) * 0.13;

    pos.z += cos(uTime * 0.14 +
        offset * 9.0 +
        position.x * 0.12 +
        safeSpeed * 6.0) * 0.07;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    mvPosition.xyz += cameraPosition;

    vec4 clipPosition = projectionMatrix * mvPosition;

    vec2 ndc = clipPosition.xy / clipPosition.w;
    float viewportY = ndc.y * 0.5 + 0.5;

    float bottomMask = smoothstep(0.15, 0.75, viewportY);

    float worldFadeIn = smoothstep(-20.0, -7.0, pos.y);
    float worldFadeOut = 1.0 - smoothstep(13.0, 20.0, pos.y);

    vAlpha = bottomMask * worldFadeIn * worldFadeOut;

    vec2 screenPosition = ndc;
    vec2 pointerDelta = screenPosition - uPointer;
    vec2 aspectDelta = vec2(pointerDelta.x * uAspect, pointerDelta.y);
    float pointerDistance = length(aspectDelta);

    const float repulsionRadius = 0.42;
    float repulsion = 1.0 -
        smoothstep(0.02, repulsionRadius, pointerDistance);
    repulsion = repulsion * repulsion * uPointerStrength;

    vec2 aspectDirection = aspectDelta / max(pointerDistance, 0.0001);
    float depthParallax = mix(0.82, 1.12, clamp(safeSpeed, 0.0, 1.0));
    float pushDistance = repulsion * 0.06 * depthParallax;
    screenPosition += vec2(aspectDirection.x / uAspect, aspectDirection.y) * pushDistance;

    clipPosition.xy = screenPosition * clipPosition.w;
    gl_Position = clipPosition;

    vPointerInfluence = repulsion;
    vTwinkle = 0.72 + 0.28 * sin(uTime * (0.08 + safeSpeed * 0.08) +
        offset * 5.0 +
        safeSpeed * 4.0);

    float growth = smoothstep(-20.0, 20.0, pos.y);

    float baseSize = mix(1.55, 2.15, growth);

    float breathing = sin(uTime * 0.28 +
        offset * 10.0 +
        safeSpeed * 7.0) * 0.025;

    gl_PointSize = (baseSize + breathing) *
        mix(1.0, 1.04, repulsion);
}
