attribute float morphFactor;
attribute float aRandom;

varying float vMorph;
varying float vEdgeBoost;
varying float vWarpBoost;
varying vec3 vLocalPosition;
varying float vCurveEdge;
varying float vCurveDepth;
varying float vBokeh;
varying float vViewDepth;
varying float vNearCameraFade;

uniform float uSizeBase;
uniform float uSizeBoost;
uniform float uCloudPointSizeScale;
uniform float uMobileIntroParticleControl;
uniform float uTextSharpness;
uniform float uParticleDensity;
uniform float uCurveStrength;
uniform float uCurveBow;
uniform float uTime;
uniform float uFloatStrength;
uniform float uTunnelSpinStrength;
uniform float uTunnelRotation;
uniform float uTunnelColorStrength;
uniform float uTunnelRadiusScale;
uniform float uTunnelBokehSizeScale;

uniform float uWindStrength;
uniform vec3 uWindDirection;

varying float vRandom;

float smootherstep01(float x) {
    x = clamp(x, 0.0, 1.0);
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

void main() {
    if(aRandom > uParticleDensity) {
        gl_PointSize = 0.0;
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }

    vMorph = morphFactor;
    vWarpBoost = morphFactor;
    vRandom = aRandom;

    float dist = length((modelMatrix * vec4(position, 1.0)).xyz);
    vEdgeBoost = smoothstep(0.4, 1.0, dist);

    float t = uTime;

    vec3 drift1 = vec3(sin(t * 0.25 + position.x * 0.12), sin(t * 0.22 + position.y * 0.10), sin(t * 0.18 + position.z * 0.14)) * 0.20;

    vec3 drift2 = vec3(sin(t * 0.55 + position.y * 0.25), sin(t * 0.50 + position.z * 0.22), sin(t * 0.45 + position.x * 0.28)) * 0.12;

    vec3 drift3 = vec3(sin(t * 1.2 + position.z * 0.6), sin(t * 1.1 + position.x * 0.5), sin(t * 1.3 + position.y * 0.4)) * 0.05;

    vec3 floatOffset = (drift1 + drift2 + drift3) * uFloatStrength;

    vec3 windDir = normalize(uWindDirection);
    float windWave = sin(t * 0.7 + position.y * 0.1);
    vec3 windOffset = windDir * windWave * 0.15 * uWindStrength;

    float morphDamp = 1.0 - smoothstep(0.0, 1.0, vMorph);

    floatOffset *= morphDamp;
    windOffset *= morphDamp;

    vec3 finalPos = position + floatOffset + windOffset;

    float tunnelOrbit = smootherstep01(clamp(uTunnelSpinStrength, 0.0, 1.0)) *
        smoothstep(0.25, 0.75, vMorph);

    float scrollRotation = tunnelOrbit * 3.14159265359;
    float rotation = uTunnelRotation + scrollRotation;
    float spinSine = sin(rotation);
    float spinCosine = cos(rotation);

    finalPos.xy = mat2(spinCosine, -spinSine, spinSine, spinCosine) *
        finalPos.xy;

    float tunnelRadiusPresence = clamp(uTunnelColorStrength, 0.0, 1.0) *
        smoothstep(0.08, 0.72, vMorph);
    finalPos.xy *= mix(1.0, uTunnelRadiusScale, tunnelRadiusPresence);

    vLocalPosition = finalPos;

    float morphGrow = vMorph * (1.0 - vMorph);

    float size = uSizeBase + uSizeBoost * morphGrow * 0.6;
    size *= mix(1.0, 2.25, uTextSharpness);
    float responsivePointSizeProgress = max(vMorph, uTextSharpness);
    size *= mix(uCloudPointSizeScale, 1.0, responsivePointSizeProgress);

    float mobileIntroPresence = uMobileIntroParticleControl *
        (1.0 - smoothstep(0.0, 0.16, vMorph));
    float initialCameraEmphasis = 1.0 - smoothstep(-4.0, 18.0, cameraPosition.z);
    float sizeVariationStrength = mobileIntroPresence *
        mix(0.45, 0.85, initialCameraEmphasis);
    float randomSizeProfile = mix(0.55, 1.35, pow(aRandom, 1.4));
    size *= mix(1.0, randomSizeProfile, sizeVariationStrength);

    vec4 mv = modelViewMatrix * vec4(finalPos, 1.0);

    vec4 viewCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);

    float centerDepth = max(-viewCenter.z, 0.001);
    float pointDepth = max(-mv.z, 0.001);

    float viewAngle = atan(mv.x / pointDepth);

    float frustumEdge = clamp(abs(mv.x / pointDepth) * projectionMatrix[0][0], 0.0, 1.0);

    float localDepthOffset = viewCenter.z - mv.z;
    float monitorBow = 1.0 - uCurveBow * frustumEdge * frustumEdge;
    float curveRadius = max((centerDepth + localDepthOffset) * monitorBow, 0.001);

    vec2 curvedXZ = vec2(sin(viewAngle) * curveRadius, -cos(viewAngle) * curveRadius);

    float curveAmount = uCurveStrength * uTextSharpness;
    float originalViewZ = mv.z;

    mv.xz = mix(mv.xz, curvedXZ, curveAmount);

    vCurveEdge = frustumEdge * curveAmount;

    vCurveDepth = max(mv.z - originalViewZ, 0.0) /
        centerDepth *
        curveAmount;

    float bokehStartMorphPosition = 0.2;
    float viewDepth = max(-mv.z, 0.001);

    vViewDepth = viewDepth;

    vNearCameraFade = mix(1.0, smoothstep(1.5, 5.0, viewDepth), mobileIntroPresence);

    float proximity = 1.0 - smoothstep(8.0, 72.0, viewDepth);
    float coc = pow(proximity, 1.35);

    float bokehVariance = mix(0.72, 1.08, aRandom);

    vBokeh = coc *
        clamp(uTunnelColorStrength, 0.0, 1.0) *
        (1.0 - uTextSharpness) *
        smoothstep(bokehStartMorphPosition, 1.0, vMorph) *
        bokehVariance;

    vBokeh = clamp(vBokeh, 0.0, 1.0);

    float bokehSizeMultiplier = 1.0 + 4.0 * uTunnelBokehSizeScale;
    size *= mix(1.0, bokehSizeMultiplier, vBokeh);
    float tunnelSizePresence = clamp(uTunnelColorStrength, 0.0, 1.0) *
        smoothstep(0.35, 0.9, vMorph) *
        (1.0 - uTextSharpness);
    size *= mix(1.0, 1.75, tunnelSizePresence);

    float pointSizeCap = mix(84.0, 24.0, mobileIntroPresence);
    gl_PointSize = min(size * (1.0 / -mv.z), pointSizeCap);
    gl_Position = projectionMatrix * mv;
}
