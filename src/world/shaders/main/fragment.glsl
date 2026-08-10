varying float vMorph;
varying float vEdgeBoost;
varying float vWarpBoost;
varying float vRandom;
varying vec3 vLocalPosition;
varying float vCurveEdge;
varying float vCurveDepth;
varying float vBokeh;
varying float vViewDepth;
varying float vNearCameraFade;

uniform vec3 uColor;
uniform vec3 uBloomColor;
uniform vec3 uGeminiColors[5];
uniform float uBloomStrength;
uniform float uHazeStrength;
uniform float uTime;
uniform float uTextSharpness;
uniform float uGlobalOpacity;
uniform float uCloudBrightness;
uniform float uParticleDensity;
uniform float uSparkleStrength;
uniform float uTunnelColorStrength;

float noise3D(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

vec3 geminiGradient(float phase) {
    float p = fract(phase);

    vec3 coolKey = mix(uGeminiColors[0], uGeminiColors[4], smoothstep(0.08, 0.92, p));

    float violetFill = smoothstep(0.16, 0.42, p) *
        (1.0 - smoothstep(0.58, 0.84, p));

    vec3 graded = mix(coolKey, uGeminiColors[2], violetFill * 0.42);

    float greenAccent = exp(-pow((p - 0.10) / 0.045, 2.0));
    float redAccent = exp(-pow((p - 0.88) / 0.04, 2.0));

    graded = mix(graded, uGeminiColors[1], greenAccent * 0.14);
    graded = mix(graded, uGeminiColors[3], redAccent * 0.16);

    return graded;
}

vec3 cinematicGeminiPalette(float phase) {
    float p = fract(phase);
    float coolBlend = smoothstep(-0.72, 0.72, sin(p * 6.28318 + 0.45));
    vec3 color = mix(uGeminiColors[0], uGeminiColors[4], coolBlend);

    float purpleAccent = smoothstep(0.14, 0.30, p) *
        (1.0 - smoothstep(0.52, 0.70, p));
    float redAccent = exp(-pow((p - 0.82) / 0.085, 2.0));
    float greenAccent = exp(-pow((p - 0.06) / 0.07, 2.0));

    color = mix(color, uGeminiColors[2], purpleAccent * 0.72);
    color = mix(color, uGeminiColors[3], redAccent * 0.56);
    color = mix(color, uGeminiColors[1], greenAccent * 0.42);

    return color;
}

vec3 gentlyReduceBlue(vec3 color) {
    float blueReference = max(color.r, color.g);
    float blueExcess = max(color.b - blueReference, 0.0);
    color.b -= blueExcess * 0.10;
    return color;
}

void applyTunnelAtmosphere(
    inout vec3 color,
    inout float alpha,
    vec3 tunnelColor,
    float tunnelPresence
) {
    float radialDistance = length(vLocalPosition.xy);
    float wallGloom = smoothstep(19.0, 27.0, radialDistance);
    float farFog = smoothstep(38.0, 82.0, vViewDepth);
    float nearVeil = 1.0 - smoothstep(7.0, 23.0, vViewDepth);

    float fogVariation = mix(0.78, 1.0, noise3D(floor(vLocalPosition * vec3(0.10, 0.10, 0.055))));
    float fogAmount = clamp(farFog * 0.78 + nearVeil * 0.22, 0.0, 1.0) *
        fogVariation *
        tunnelPresence;

    float tunnelAngle = atan(vLocalPosition.y, vLocalPosition.x) / 6.28318 + 0.5;
    float paletteVariation = noise3D(floor(vLocalPosition * vec3(0.065, 0.065, 0.04)));
    float neonPhase = fract(tunnelAngle * 2.35 +
        vLocalPosition.z * 0.016 +
        paletteVariation * 0.28 -
        uTime * 0.006);
    float neonPulse = 0.88 + 0.12 * sin(uTime * 0.32 + vLocalPosition.z * 0.045);
    vec3 neonColor = cinematicGeminiPalette(neonPhase);

    vec3 fogColor = mix(vec3(0.045, 0.075, 0.15), tunnelColor * 0.52, 0.62);

    color = mix(color, fogColor, fogAmount * 0.30);
    color = mix(color * 0.94, neonColor * 0.98, tunnelPresence * (0.34 + fogAmount * 0.12));
    color *= mix(1.10, 0.88, wallGloom * tunnelPresence);
    color += neonColor *
        tunnelPresence *
        neonPulse *
        (0.065 + vBokeh * 0.07 + fogAmount * 0.04);

    alpha *= mix(1.0, 0.70, farFog * tunnelPresence);
    alpha *= mix(1.0, 0.88, wallGloom * tunnelPresence);
    alpha *= mix(1.0, 0.84, nearVeil * tunnelPresence);
}

void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);

    if(d > 0.5) {
        discard;
    }

    if(vRandom > uParticleDensity) {
        discard;
    }

    float tunnelStrength = clamp(uTunnelColorStrength, 0.0, 1.0);

    if(uTextSharpness < 0.001 &&
        tunnelStrength > 0.001 &&
        vMorph > 0.98) {
        float softParticle = smoothstep(0.33, 0.0, d);
        float bokehDisc = smoothstep(0.5, 0.32, d) * 0.52;
        float bokehShapeBlend = smoothstep(0.02, 0.24, vBokeh);
        float alpha = mix(softParticle, bokehDisc, bokehShapeBlend);

        float tunnelAngle = atan(vLocalPosition.y, vLocalPosition.x) / 6.28318 + 0.5;
        float tunnelDepth = vLocalPosition.z * 0.018;
        vec3 tunnelColor = cinematicGeminiPalette(tunnelAngle * 0.72 +
            tunnelDepth +
            vRandom * 0.08 -
            uTime * 0.018);
        float tunnelPresence = tunnelStrength * smoothstep(0.08, 0.72, vMorph);
        float sparklePower = clamp(uSparkleStrength, 0.0, 1.25);

        vec3 color = mix(uColor, tunnelColor * 0.86, tunnelPresence * 0.74);

        color *= mix(1.0, 1.06, sparklePower);
        color *= mix(1.0, 1.08, sparklePower);
        color += mix(vec3(0.62, 0.82, 1.0), tunnelColor, 0.48) *
            vBokeh *
            0.10;

        alpha *= mix(1.0, 1.10, sparklePower);
        alpha *= mix(1.0, 1.14, vEdgeBoost);
        alpha *= mix(1.0, 1.06, vBokeh);

        applyTunnelAtmosphere(color, alpha, tunnelColor, tunnelPresence);

        gl_FragColor = vec4(gentlyReduceBlue(color), alpha * uGlobalOpacity);
        return;
    }

    float softParticle = smoothstep(0.33, 0.0, d);

    float sharpParticle = 1.0 - smoothstep(0.105, 0.18, d);

    float bloomHalo = (1.0 - smoothstep(0.04, 0.4, d)) *
        uBloomStrength *
        uTextSharpness;

    float haze = exp(-d * d * 5.5) *
        (1.0 - smoothstep(0.42, 0.5, d)) *
        uHazeStrength *
        uTextSharpness;

    float resolvedParticle = min(1.0, max(sharpParticle, bloomHalo) + haze);

    float alpha = mix(softParticle, resolvedParticle, uTextSharpness);

    float bokehDisc = smoothstep(0.5, 0.32, d) * 0.52;
    float bokehShapeBlend = smoothstep(0.02, 0.24, vBokeh);

    alpha = mix(alpha, bokehDisc, bokehShapeBlend);

    float sparklePower = clamp(uSparkleStrength, 0.0, 1.25);

    float textFadeDamp = mix(0.46, 1.0, 1.0 - uTextSharpness);

    float subsetSeed = fract(vRandom * 73.137);

    float fadeSubset = smoothstep(0.28, 0.88, subsetSeed);

    float baseFlicker = 0.60 +
        0.48 *
        sin(uTime * mix(4.8, 6.6, subsetSeed) +
        vRandom * 32.0);

    baseFlicker = clamp(baseFlicker, 0.18, 1.08);

    float fadeMix = clamp(fadeSubset * textFadeDamp * sparklePower * 1.15, 0.0, 1.0);

    float subsetFade = mix(1.0, baseFlicker, fadeMix);

    float flickerPeak = smoothstep(0.92, 1.04, baseFlicker);

    float cluster = noise3D(vec3(vRandom * 10.0, uTime * 0.05, vRandom * 20.0));

    float clusterMask = smoothstep(0.85, 0.95, cluster);

    float twinkle = 1.0 +
        2.5 *
        pow(sin(uTime * 18.0 + vRandom * 200.0) * 0.5 + 0.5, 25.0);

    float twinkleStrength = clusterMask *
        flickerPeak *
        textFadeDamp *
        sparklePower;

    float sparkle = mix(1.0, twinkle, clamp(twinkleStrength, 0.0, 1.0));

    alpha *= subsetFade * sparkle;

    float tunnelPresence = tunnelStrength *
        smoothstep(0.08, 0.72, vMorph) *
        (1.0 - uTextSharpness);

    if(uTextSharpness < 0.001 && tunnelStrength > 0.001) {
        float fastTunnelAngle = atan(vLocalPosition.y, vLocalPosition.x) / 6.28318 + 0.5;

        float fastTunnelDepth = vLocalPosition.z * 0.018;

        vec3 fastTunnelColor = cinematicGeminiPalette(fastTunnelAngle * 0.72 +
            fastTunnelDepth +
            vRandom * 0.08 -
            uTime * 0.018);

        vec3 color = mix(uColor, fastTunnelColor * 0.86, tunnelPresence * 0.74);

        float morphGlow = sparklePower * (1.0 - uTextSharpness);

        color *= mix(1.0, 1.06, vMorph * morphGlow);

        color *= mix(1.0, 1.08, vWarpBoost * morphGlow);

        color += mix(vec3(0.62, 0.82, 1.0), fastTunnelColor, 0.48) *
            vBokeh *
            0.10;

        color *= mix(1.0, 1.14, clamp(twinkleStrength, 0.0, 1.0));

        color *= mix(1.0, 1.055, fadeSubset *
            baseFlicker *
            textFadeDamp *
            sparklePower *
            (1.0 - uTextSharpness));

        alpha *= mix(1.0, 1.10, vWarpBoost * morphGlow);

        alpha *= mix(1.0, 1.14, vEdgeBoost);

        alpha *= mix(1.0, 1.06, vBokeh);

        applyTunnelAtmosphere(color, alpha, fastTunnelColor, tunnelPresence);

        gl_FragColor = vec4(gentlyReduceBlue(color), alpha * uGlobalOpacity);
        return;
    }

    float prismPhase = 0.52 +
        vLocalPosition.x * 0.0075 +
        vLocalPosition.y * 0.012 +
        vLocalPosition.z * 0.018 -
        uTime * 0.006;

    vec3 prism = geminiGradient(prismPhase);

    float whiteCore = 1.0 - smoothstep(0.045, 0.18, d);

    float pearlEdge = smoothstep(0.055, 0.31, d);

    float depthRefraction = smoothstep(-0.9, 0.9, vLocalPosition.z);

    float curvedGlassEdge = smoothstep(0.08, 0.72, vCurveEdge);

    float curvedDepth = smoothstep(0.0015, 0.055, vCurveDepth);

    float colorPresence = mix(0.16, 0.34, pearlEdge);

    colorPresence += depthRefraction * 0.07;
    colorPresence += curvedGlassEdge * 0.10 + curvedDepth * 0.05;

    vec3 pearlWhite = vec3(0.94, 0.975, 1.0);

    vec3 textSurface = mix(pearlWhite, prism, colorPresence);

    textSurface = mix(textSurface, vec3(1.0), whiteCore * 0.86);

    textSurface += mix(vec3(0.72, 0.86, 1.0), prism, 0.58) *
        pow(curvedGlassEdge, 2.4) *
        0.12;

    float satinSweep = pow(max(0.0, sin(vLocalPosition.x * 0.055 - uTime * 0.28)), 18.0);

    float glintGate = smoothstep(0.965, 0.995, vRandom);

    float microGlint = pow(max(0.0, sin(uTime * 0.7 + vRandom * 81.0)), 36.0) *
        glintGate;

    textSurface += vec3(1.0, 0.985, 0.94) *
        (satinSweep * 0.14 + microGlint * 0.38);

    vec3 textBloom = mix(uBloomColor, prism, 0.72);

    vec3 bloomColor = mix(textBloom, textSurface, whiteCore);

    vec3 color = mix(uColor, bloomColor, uTextSharpness);

    color *= mix(1.0, 0.87, pow(curvedGlassEdge, 1.45));

    float tunnelAngle = atan(vLocalPosition.y, vLocalPosition.x) / 6.28318 + 0.5;

    float tunnelDepth = vLocalPosition.z * 0.018;

    vec3 tunnelColor = cinematicGeminiPalette(tunnelAngle * 0.72 +
        tunnelDepth +
        vRandom * 0.08 -
        uTime * 0.018);

    color = mix(color, tunnelColor * 0.72, tunnelPresence * 0.68);

    float morphGlow = sparklePower * (1.0 - uTextSharpness);

    color *= mix(1.0, 1.06, vMorph * morphGlow);

    color *= mix(1.0, 1.08, vWarpBoost * morphGlow);

    color += prism *
        vEdgeBoost *
        0.055 *
        uTextSharpness;

    color += mix(vec3(0.62, 0.82, 1.0), prism, 0.48) *
        vBokeh *
        0.10;

    color *= mix(1.0, 1.14, clamp(twinkleStrength, 0.0, 1.0));

    color *= mix(1.0, 1.055, fadeSubset *
        baseFlicker *
        textFadeDamp *
        sparklePower *
        (1.0 - uTextSharpness));

    alpha *= mix(1.0, 1.10, vWarpBoost * morphGlow);

    alpha *= mix(1.0, 1.14, vEdgeBoost);

    alpha *= mix(1.0, 0.90, curvedGlassEdge);

    alpha *= mix(1.0, 1.06, vBokeh);

    float cloudBrightness = mix(uCloudBrightness, 1.0, vMorph * (1.0 - uTextSharpness));
    color *= cloudBrightness;
    alpha *= cloudBrightness;

    gl_FragColor = vec4(
        gentlyReduceBlue(color),
        alpha * uGlobalOpacity * vNearCameraFade
    );
}
