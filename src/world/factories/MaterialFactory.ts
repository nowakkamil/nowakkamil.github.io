import * as THREE from 'three';

import type { ResponsiveConfig } from '../../app/responsiveConfig';

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import vertexShader from '../shaders/main/vertex.glsl';
import fragmentShader from '../shaders/main/fragment.glsl';
import vertexFloatingShader from '../shaders/floating/vertex.glsl';
import fragmentFloatingShader from '../shaders/floating/fragment.glsl';
import coloredLightVertex from '../shaders/light/vertex.glsl';
import coloredLightFragment from '../shaders/light/fragment.glsl';
import vertexTextFloating from '../shaders/floatingText/vertex.glsl';
import fragmentTextFloating from '../shaders/floatingText/fragment.glsl';
import vertexEllipsis from '../shaders/ellipsis/vertex.glsl';
import fragmentEllipsis from '../shaders/ellipsis/fragment.glsl';
import vertexOverlay from '../shaders/overlay/vertex.glsl';
import fragmentOverlay from '../shaders/overlay/fragment.glsl';
import vertexBloomCompositePass from '../shaders/bloom/vertex.glsl';
import fragmentBloomCompositePass from '../shaders/bloom/fragment.glsl';

const GEMINI_TEAL = new THREE.Color(0.157, 0.659, 0.808);
const GEMINI_PURPLE = new THREE.Color(0.541, 0.361, 0.965);
const GEMINI_BLUE = new THREE.Color(0.259, 0.522, 0.957);
const GEMINI_GREEN = new THREE.Color(0.204, 0.659, 0.325);
const GEMINI_RED = new THREE.Color(0.918, 0.263, 0.208);

const GEMINI_COLORS: THREE.Color[] = [
    GEMINI_BLUE,
    GEMINI_GREEN,
    GEMINI_PURPLE,
    GEMINI_RED,
    GEMINI_TEAL,
];

const MOBILE_LIGHT_COLORS: THREE.Color[] = [GEMINI_PURPLE, GEMINI_TEAL];

export function createFadeOverlayMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        uniforms: {
            uFade: { value: 1 },
            uTime: { value: 0 },
            uGrainStrength: { value: 4 / 255 },
        },
        vertexShader: vertexOverlay,
        fragmentShader: fragmentOverlay,
    });
}

export function createBloomCompositePassMaterial(): ShaderPass {
    return new ShaderPass(
        new THREE.ShaderMaterial({
            uniforms: {
                baseTexture: { value: null },
                bloomTexture: { value: null },
            },
            vertexShader: vertexBloomCompositePass,
            fragmentShader: fragmentBloomCompositePass,
            defines: {},
        }),
        'baseTexture',
    );
}

export function createMainParticleMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uColor: { value: new THREE.Color(1, 1, 1) },
            uBloomColor: { value: GEMINI_TEAL.clone() },
            uGeminiColors: { value: GEMINI_COLORS },
            uBloomStrength: { value: 0.28 },
            uHazeStrength: { value: 0.075 },
            uSizeBase: { value: 175 },
            uSizeBoost: { value: 160 },
            uCloudPointSizeScale: { value: 1 },
            uMobileIntroParticleControl: { value: 0 },
            uTextSharpness: { value: 0 },
            uCurveStrength: { value: 1 },
            uCurveBow: { value: 0.2 },
            uFloatStrength: { value: 1 },
            uWindStrength: { value: 1 },
            uWindDirection: { value: new THREE.Vector3(1, 0.2, -0.4) },
            uGlobalOpacity: { value: 1 },
            uCloudBrightness: { value: 1 },
            uParticleDensity: { value: 1 },
            uSparkleStrength: { value: 1 },
            uTunnelSpinStrength: { value: 0 },
            uTunnelRotation: { value: 0 },
            uTunnelColorStrength: { value: 0 },
            uTunnelRadiusScale: { value: 1 },
            uTunnelBokehSizeScale: { value: 1 },
            uTime: { value: 0 },
        },
        vertexShader,
        fragmentShader,
    });
}

export function createAmbientFloatingParticlesMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,

        depthTest: false,

        blending: THREE.AdditiveBlending,
        toneMapped: false,

        uniforms: {
            uTime: {
                value: 0,
            },

            uAspect: {
                value: window.innerWidth / window.innerHeight,
            },

            uPointer: {
                value: new THREE.Vector2(999.0, 999.0),
            },

            uPointerStrength: {
                value: 0,
            },

            uColor: {
                value: new THREE.Color(0xffffff),
            },

            uVisibility: {
                value: 1,
            },

            uScroll: {
                value: 1,
            },
        },

        vertexShader: vertexFloatingShader,
        fragmentShader: fragmentFloatingShader,
    });
}

export function createColoredLightMaterial(
    scrollProgress: number,
    config: ResponsiveConfig['coloredLight'],
): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uShift: { value: 0 },
            uSpeed: { value: config.speed },
            uIntensity: { value: config.intensity },
            uWidth: { value: config.width },
            uHeight: { value: config.height },
            uHorizontalScale: { value: config.horizontalScale },
            uHorizonY: { value: config.horizonY },
            uWaveAmplitudeScale: { value: config.waveAmplitudeScale },
            uColorWindowSize: { value: config.colorWindowSize },
            uVisibility: { value: 1 },
            uScroll: { value: scrollProgress },
            uGeminiColors: { value: GEMINI_COLORS },
            uMobileLightColors: { value: MOBILE_LIGHT_COLORS },
        },
        vertexShader: coloredLightVertex,
        fragmentShader: coloredLightFragment,
    });
}

export function createFloatingTextMaterial(scrollProgress: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uTime: { value: 0 },
            uAmplitude: { value: 0.1 },
            uSpeed: { value: 3 },
            uSize: { value: 0.5 },
            uRevealStartTime: { value: 0 },
            uRevealDelay: { value: 2 },
            uRevealVisibility: { value: 0 },
            uBloomColor: { value: new THREE.Color(0x9eefff) },
            uBloomStrength: { value: 0.8 },
            uHazeStrength: { value: 0.4 },
            uScroll: { value: scrollProgress },
            uPointer: { value: new THREE.Vector2(999, 999) },
            uPointerPower: { value: 0 },
            uAspect: { value: window.innerWidth / window.innerHeight },
        },
        vertexShader: vertexTextFloating,
        fragmentShader: fragmentTextFloating,
    });
}

export function createEllipsisMaterial(geometry: THREE.BufferGeometry): THREE.ShaderMaterial {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();
    geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() * 0.5;
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const stationaryAttribute = geometry.getAttribute('stationary') as
        | THREE.BufferAttribute
        | undefined;
    let coreMaxDist = 0;
    let ringMaxX = 0;
    let ringMaxZ = 0;

    for (let index = 0; index < positionAttribute.count; index += 1) {
        const x = positionAttribute.getX(index) - center.x;
        const y = positionAttribute.getY(index) - center.y;
        const z = positionAttribute.getZ(index) - center.z;

        if (stationaryAttribute && stationaryAttribute?.getX?.(index) >= 0.5) {
            ringMaxX = Math.max(ringMaxX, Math.abs(x));
            ringMaxZ = Math.max(ringMaxZ, Math.abs(z));
            continue;
        }

        coreMaxDist = Math.max(coreMaxDist, Math.hypot(x, y, z));
    }

    const ringRadius = Math.max(ringMaxX, 1);
    const ringAspect = Math.max(ringMaxZ / ringRadius, 0.01);

    return new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
            uTime: { value: 0 },
            uGlowCenter: { value: center },
            uGlowRadius: { value: radius },
            uMaxDist: { value: Math.max(radius, 80) },
            uCoreMaxDist: { value: Math.max(coreMaxDist, 1) },
            uRingMaxRadius: { value: ringRadius },
            uRingAspect: { value: ringAspect },
            uGeminiColors: { value: GEMINI_COLORS },
            uTransitionVisibility: { value: 1 },
            uVisibility: { value: 0 },
            uPointer: { value: new THREE.Vector2(999, 999) },
            uPointerPower: { value: 0 },
            uAspect: { value: window.innerWidth / window.innerHeight },
        },
        vertexShader: vertexEllipsis,
        fragmentShader: fragmentEllipsis,
    });
}
