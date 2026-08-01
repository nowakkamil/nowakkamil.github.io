attribute float velocity;
attribute float life;
attribute float stationary;

uniform float uTime;
uniform float uCoreMaxDist;
uniform float uRingMaxRadius;
uniform float uRingAspect;
uniform vec3 uGlowCenter;
uniform vec2 uPointer;
uniform float uPointerPower;
uniform float uAspect;

varying float vDist;
varying float vAlpha;
varying float vStationary;
varying float vColorPhase;

float smootherstep01(float value) {
    value = clamp(value, 0.0, 1.0);
    return value * value * value *
        (value * (value * 6.0 - 15.0) + 10.0);
}

void main() {
    vec2 orbitPosition = position.xy - uGlowCenter.xy;
    float radialDistance = length(orbitPosition) / max(uCoreMaxDist, 0.001);
    float radialFalloff = smoothstep(0.04, 1.0, clamp(radialDistance, 0.0, 1.0));
    float coreSpeedMask = 1.0 - smoothstep(0.04, 0.30, radialDistance);
    float angularSpeed = mix(0.105, 0.012, radialFalloff) +
        0.12 * coreSpeedMask * coreSpeedMask;
    float particleSpeed = mix(0.88, 1.12, velocity);
    float rotation = uTime * angularSpeed * particleSpeed;
    float cosine = cos(rotation);
    float sine = sin(rotation);
    vec3 pos = position;
    vec2 rotatedPosition = mat2(cosine, -sine, sine, cosine) * orbitPosition + uGlowCenter.xy;

    vec2 normalizedRingPosition = vec2(orbitPosition.x, (position.z - uGlowCenter.z) / max(uRingAspect, 0.01));
    float ringDistance = length(normalizedRingPosition) /
        max(uRingMaxRadius, 0.001);
    float ringFalloff = smoothstep(0.04, 1.0, clamp(ringDistance, 0.0, 1.0));
    float ringSpeed = mix(0.105, 0.012, ringFalloff) * particleSpeed;
    float ringRotation = uTime * ringSpeed;
    float ringCosine = cos(ringRotation);
    float ringSine = sin(ringRotation);
    vec2 ringOrbit = mat2(ringCosine, -ringSine, ringSine, ringCosine) * normalizedRingPosition;
    vec2 ringPositionXZ = vec2(ringOrbit.x, ringOrbit.y * uRingAspect) + uGlowCenter.xz;

    pos.xy = mix(rotatedPosition, position.xy, stationary);
    pos.xz = mix(pos.xz, ringPositionXZ, stationary);
    pos.z += sin(uTime * 0.25 + life * 6.28318) *
        velocity *
        0.12 *
        (1.0 - stationary);

    vDist = distance(pos, uGlowCenter);
    vAlpha = 0.72 + sin(uTime * 0.4 + life * 6.28318) * 0.2;
    vStationary = stationary;
    float colorAngle = atan(pos.z - uGlowCenter.z, pos.x - uGlowCenter.x) / 6.28318 + 0.5;
    vColorPhase = fract(colorAngle * 0.72 +
        radialDistance * 0.16 +
        life * 0.055 +
        uTime * 0.0025);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec4 clipPosition = projectionMatrix * mv;
    vec2 screenPosition = clipPosition.xy / max(clipPosition.w, 0.001);
    vec2 pointerDelta = screenPosition - uPointer;
    vec2 aspectDelta = vec2(pointerDelta.x * uAspect, pointerDelta.y);
    float pointerDistance = length(aspectDelta);

    const float repulsionRadius = 0.42;
    float edgeProgress = (pointerDistance - 0.16) / (repulsionRadius - 0.16);
    float repulsion = (1.0 - smootherstep01(edgeProgress)) * uPointerPower;

    vec2 aspectDirection = aspectDelta / max(pointerDistance, 0.0001);
    float depthParallax = mix(0.82, 1.12, life);
    float pushDistance = repulsion * 0.05 * depthParallax;
    screenPosition += vec2(aspectDirection.x / uAspect, aspectDirection.y) * pushDistance;

    clipPosition.xy = screenPosition * clipPosition.w;
    gl_PointSize = 300.0 * (1.0 / -mv.z) *
        mix(1.0, 1.04, clamp(repulsion, 0.0, 1.0));
    gl_Position = clipPosition;
}
