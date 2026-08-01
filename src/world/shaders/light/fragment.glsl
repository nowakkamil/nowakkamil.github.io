varying vec3 vModelPos;

uniform float uTime;
uniform float uShift;
uniform float uSpeed;
uniform float uIntensity;
uniform float uWidth;
uniform float uHeight;
uniform float uHorizontalScale;
uniform float uHorizonY;
uniform float uWaveAmplitudeScale;
uniform float uColorWindowSize;
uniform float uVisibility;
uniform float uScroll;
uniform vec3 uGeminiColors[5];
uniform vec3 uMobileLightColors[2];

float blueNoise(vec2 p) {
    p = fract(p * vec2(5.3983, 5.4427));

    float n = dot(p, vec2(127.1, 311.7));
    float h1 = fract(sin(n) * 43758.5453123);

    n = dot(p, vec2(269.5, 183.3));
    float h2 = fract(sin(n) * 24634.6345123);

    n = dot(p, vec2(113.5, 271.9));
    float h3 = fract(sin(n) * 56445.2345123);

    return (h1 + h2 * 0.5 + h3 * 0.25) / 1.75;
}

float hash(float n) {
    return fract(sin(n) * 43758.5453123);
}

float smoothNoise(float x) {
    float i = floor(x);
    float f = fract(x);
    float u = f * f * (3.0 - 2.0 * f);

    return mix(hash(i), hash(i + 1.0), u);
}

void main() {
    float U = vModelPos.x;
    float V = vModelPos.y;

    float X = U * uHorizontalScale;
    float Y = V * 100.0;

    float horizonY = uHorizonY;
    float above = Y - horizonY;

    if(above < 0.0) {
        gl_FragColor = vec4(0.0);
        return;
    }

    float rawScroll = clamp(uScroll, 0.0, 1.0);

    float scrollStart = 0.44;
    float scrollEnd = 1.0;

    float reveal = clamp((rawScroll - scrollStart) / (scrollEnd - scrollStart), 0.0, 1.0);

    float revealEase = smoothstep(0.0, 1.0, reveal);

    float effectiveHeight = mix(uHeight * 0.18, uHeight, revealEase);
    float effectiveSpread = mix(35.0, 180.0, revealEase);
    float fadeIn = smoothstep(0.0, 0.12, reveal);

    float verticalFade = exp(-above / effectiveHeight) *
        smoothstep(0.0, 8.0, above);

    float lateralFade = exp(-(X * X) / (effectiveSpread * effectiveSpread));

    vec3 geminiColors[5];
    geminiColors[0] = uGeminiColors[0];
    geminiColors[1] = uGeminiColors[1];
    geminiColors[2] = uGeminiColors[2];
    geminiColors[3] = uGeminiColors[3];
    geminiColors[4] = uGeminiColors[4];

    vec3 geminiBlue = uGeminiColors[0];
    geminiColors[1] = mix(geminiColors[1], geminiBlue, 0.34);
    geminiColors[2] = mix(geminiColors[2], geminiBlue, 0.16);
    geminiColors[3] = mix(geminiColors[3], geminiBlue, 0.52);
    geminiColors[4] = mix(geminiColors[4], geminiBlue, 0.22);

    float colorWindowSize = clamp(floor(uColorWindowSize + 0.5), 2.0, 5.0);
    if(colorWindowSize < 5.0) {
        geminiColors[0] = mix(uMobileLightColors[0], geminiBlue, 0.28);
        geminiColors[1] = mix(uMobileLightColors[1], geminiBlue, 0.38);
    }

    float colorWindowPhase = uTime * 0.04;
    float colorWindowProgress = mod(colorWindowPhase, colorWindowSize);

    vec3 finalColor = vec3(0.0);
    float totalAlpha = 0.0;

    {
        float fillArg = X * 0.01 + uTime * 0.03;
        float fillCenter = (smoothNoise(fillArg) - 0.5) * 26.0;
        float fillDist = Y - (horizonY + 5.0) - fillCenter;

        float fillWidth = uWidth * 0.16 * (1.0 + above * 0.004);

        float fillBand = exp(-(fillDist * fillDist) /
            (fillWidth * fillWidth * 2.2));

        float fillColorPhase = mod(colorWindowProgress + X * 0.004, colorWindowSize);

        float fillColorIndex0 = floor(fillColorPhase);
        float fillColorIndex1 = mod(fillColorIndex0 + 1.0, colorWindowSize);
        int fc0 = int(fillColorIndex0);
        int fc1 = int(fillColorIndex1);

        vec3 fillColor = mix(geminiColors[fc0], geminiColors[fc1], smoothstep(0.0, 1.0, fract(fillColorPhase)));

        float fillGlow = fillBand *
            verticalFade *
            lateralFade *
            uIntensity *
            0.38 *
            uVisibility;

        finalColor += fillColor * fillGlow;
        totalAlpha += fillGlow;
    }

    const int NUM_WAVES = 5;

    float waveDir[5];
    waveDir[0] = 1.0;
    waveDir[1] = -1.0;
    waveDir[2] = 1.0;
    waveDir[3] = -1.0;
    waveDir[4] = 0.6;

    float waveSpeedMult[5];
    waveSpeedMult[0] = 1.00;
    waveSpeedMult[1] = 0.78;
    waveSpeedMult[2] = 1.25;
    waveSpeedMult[3] = 0.91;
    waveSpeedMult[4] = 1.10;

    float wavePhase[5];
    wavePhase[0] = 0.00;
    wavePhase[1] = 2.09;
    wavePhase[2] = 4.19;
    wavePhase[3] = 1.05;
    wavePhase[4] = 3.14;

    float waveSinFreq[5];
    waveSinFreq[0] = 0.52;
    waveSinFreq[1] = 0.38;
    waveSinFreq[2] = 0.61;
    waveSinFreq[3] = 0.44;
    waveSinFreq[4] = 0.29;

    float waveSinAmp[5];
    waveSinAmp[0] = 22.0;
    waveSinAmp[1] = 18.0;
    waveSinAmp[2] = 26.0;
    waveSinAmp[3] = 20.0;
    waveSinAmp[4] = 30.0;

    float waveSplay[5];
    waveSplay[0] = 0.90;
    waveSplay[1] = 1.10;
    waveSplay[2] = 0.70;
    waveSplay[3] = 1.25;
    waveSplay[4] = 0.80;

    float waveEntryY[5];
    waveEntryY[0] = 0.0;
    waveEntryY[1] = 5.0;
    waveEntryY[2] = 2.0;
    waveEntryY[3] = 8.0;
    waveEntryY[4] = 3.5;

    for(int i = 0; i < NUM_WAVES; i++) {
        float fi = float(i);

        float travelSpeed = uSpeed *
            0.004 *
            waveSpeedMult[i] *
            waveDir[i];

        float traveled = uTime * travelSpeed +
            uShift * waveDir[i] +
            wavePhase[i];

        float waveArg = X * 0.018 * waveSplay[i] -
            traveled * waveSinFreq[i];

        float centerlineY = (sin(waveArg) * waveSinAmp[i] +
            cos(waveArg * 0.618 + fi) * waveSinAmp[i] * 0.4) * uWaveAmplitudeScale;

        float distFromCenter = Y -
            (horizonY + 5.0) -
            centerlineY -
            waveEntryY[i];

        float heightFactor = 1.0 + above * 0.006;
        float widthBase = uWidth * (0.065 * heightFactor + 0.05);

        float widthPulse = widthBase *
            (1.0 + 0.15 * sin(uTime * 0.3 + fi * 1.2));

        float ribbon = exp(-(distFromCenter * distFromCenter) /
            (widthPulse * widthPulse * 3.2));

        float intensityMod = 1.0 + 0.20 * sin(uTime * 0.25 + fi * 0.9);

        float waveIntensity = uIntensity *
            1.82 *
            intensityMod;

        float glow = ribbon *
            verticalFade *
            lateralFade *
            waveIntensity *
            uVisibility;

        float colorPhase = mod(fi + colorWindowProgress, colorWindowSize);

        float colorIndex0 = floor(colorPhase);
        float colorIndex1 = mod(colorIndex0 + 1.0, colorWindowSize);
        int c0 = int(colorIndex0);
        int c1 = int(colorIndex1);
        float cf = fract(colorPhase);

        vec3 waveColor = mix(geminiColors[c0], geminiColors[c1], smoothstep(0.0, 1.0, cf));

        finalColor += waveColor * glow;
        totalAlpha += glow;
    }

    for(int i = 0; i < NUM_WAVES; i++) {
        float fi = float(i);

        float travelSpeed = uSpeed *
            0.004 *
            waveSpeedMult[i] *
            waveDir[i];

        float traveled = uTime * travelSpeed +
            uShift * waveDir[i] +
            wavePhase[i];

        float waveArg = X * 0.018 * waveSplay[i] -
            traveled * waveSinFreq[i];

        float centerlineY = (sin(waveArg) * waveSinAmp[i] +
            cos(waveArg * 0.618 + fi) * waveSinAmp[i] * 0.4) * uWaveAmplitudeScale;

        float distFromCenter = Y -
            (horizonY + 5.0) -
            centerlineY -
            waveEntryY[i];

        float shimmerWidth = uWidth * 0.012;

        float shimmer = exp(-(distFromCenter * distFromCenter) /
            (shimmerWidth * shimmerWidth));

        shimmer = pow(shimmer, 2.5);

        float shimmerGlow = shimmer *
            verticalFade *
            lateralFade *
            uIntensity *
            0.45 *
            uVisibility;

        finalColor += vec3(0.85, 0.92, 1.0) * shimmerGlow;
        totalAlpha += shimmerGlow;
    }

    finalColor *= fadeIn;
    totalAlpha *= fadeIn;

    float brightness = max(finalColor.r, max(finalColor.g, finalColor.b));

    if(brightness > 1.0) {
        finalColor *= (1.0 + brightness * 0.15) /
            (brightness * (1.0 + brightness * 0.15));
    }

    finalColor = pow(finalColor, vec3(0.92));
    finalColor *= vec3(0.98, 1.00, 1.04);

    float d = blueNoise(gl_FragCoord.xy + uTime * 12.37);
    d = d - 0.5;

    float alphaMask = pow(clamp(totalAlpha, 0.0, 1.0), 0.35);

    float darkMask = 1.0 -
        smoothstep(0.15, 0.85, max(finalColor.r, max(finalColor.g, finalColor.b)));

    finalColor += d * 0.026 * alphaMask * darkMask;

    finalColor = max(finalColor, vec3(0.0));

    gl_FragColor = vec4(finalColor, 1.0);
}
