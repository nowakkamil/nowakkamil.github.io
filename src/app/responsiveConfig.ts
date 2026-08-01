export const MOBILE_MAX_WIDTH = 767;
export const TABLET_MAX_WIDTH = 1024;
export const DESKTOP_SCALE_REFERENCE_WIDTH = 3840;
const DESKTOP_PIXEL_RATIO_CAP = 2;
const DESKTOP_BLOOM_PIXEL_RATIO_CAP = 2;
const MOBILE_BLOOM_STRENGTH_SCALE = 0.5;
const TABLET_TEXT_CURVE_STRENGTH = 0.2;
const DESKTOP_TEXT_CURVE_STRENGTH = 1;
const TABLET_TEXT_CURVE_BOW = 0.2;
const DESKTOP_TEXT_CURVE_BOW = 0.4;
const TABLET_INTRO_TEXT_WIDTH = 900;
const DESKTOP_INTRO_TEXT_WIDTH = 1200;
const TABLET_EXPERIENCE_ROW_INLINE_PADDING = TABLET_MAX_WIDTH * 0.06;
const DESKTOP_EXPERIENCE_ROW_INLINE_PADDING = 800;
const DESKTOP_HTML_SPACING_GROWTH_FACTOR = 0.5;
const CONSTELLATION_FOG_SCALE_BOOST = 1.2;

type ViewportMode = 'mobile' | 'tablet' | 'desktop';

type ScrollAnimationConfig = {
    start: string;
    end: string;
    scrub: true | number;
};

export interface ResponsiveConfig {
    mode: ViewportMode;
    isMobile: boolean;
    isTablet: boolean;
    isCompact: boolean;
    isPortrait: boolean;
    hasFinePointer: boolean;
    hasCoarsePointer: boolean;
    reducedMotion: boolean;
    text: {
        curveStrength: number;
        curveBow: number;
    };
    layout: {
        introTextWidth: number;
        experienceRowInlinePadding: number;
    };
    sectionTextAnimations: {
        intro: ScrollAnimationConfig;
        contact: ScrollAnimationConfig;
    };
    renderer: {
        pixelRatioCap: number;
        bloomPixelRatioCap: number;
        bloomStrengthScale: number;
        textBloomScale: number;
    };
    coloredLight: {
        horizontalScale: number;
        horizonY: number;
        speed: number;
        intensity: number;
        width: number;
        height: number;
        waveAmplitudeScale: number;
        colorWindowSize: number;
    };
    particles: {
        main: number;
        ambient: number;
        floatingText: number;
        ellipsis: number;
        tunnelRadiusScale: number;
        tunnelBokehSizeScale: number;
    };
    camera: {
        fov: number;
        contactFov: number;
        introMinZ: number;
        introMaxZ: number;
        projectsMinZ: number;
        projectsMaxZ: number;
        contactEntryDistance: number;
        contactSettledDistance: number;
        contactTugDistance: number;
        contactLoopDistance: number;
    };
    constellation: {
        scale: number;
        position: readonly [number, number, number];
        clusterSpread: number;
        touchHitScale: number;
        boundaryHitScale: number;
        labelScale: number;
        fogScale: number;
        fogSpreadScale: number;
        selectedFocusX: number;
        motionScale: number;
    };
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

const interpolate = (start: number, end: number, progress: number): number =>
    start + (end - start) * progress;

const increaseProgressGrowth = (progress: number, factor: number): number =>
    clamp(progress + factor * progress * (1 - progress), 0, 1);

const DESKTOP_CONTACT_CAMERA_CONFIG = {
    contactFov: 50,
    contactEntryDistance: 30,
    contactSettledDistance: 35,
    contactTugDistance: 20,
    contactLoopDistance: 150,
} as const;

const MOBILE_CONTACT_CAMERA_CONFIG = {
    contactFov: 45,
    contactEntryDistance: 30,
    contactSettledDistance: 30,
    contactTugDistance: 15,
    contactLoopDistance: 100,
} as const;

const getResponsiveConfig = (
    width = window.innerWidth,
    height = window.innerHeight,
): ResponsiveConfig => {
    const mode: ViewportMode =
        width <= MOBILE_MAX_WIDTH ? 'mobile' : width <= TABLET_MAX_WIDTH ? 'tablet' : 'desktop';
    const isMobile = mode === 'mobile';
    const isTablet = mode === 'tablet';
    const isCompact = mode !== 'desktop';
    const isPortrait = height >= width;
    const hasFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const hasCoarsePointer =
        !hasFinePointer || window.matchMedia('(hover: none), (pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const useCompactMotion = isCompact || hasCoarsePointer;
    const lowPowerProfile = isMobile || hasCoarsePointer;
    const mobileConstellationScale = clamp(
        0.52 + (width / Math.max(height, 1) - 0.38) * 0.35,
        0.52,
        0.62,
    );
    const mobileTunnelBokehSizeScale = clamp(Math.min(width, height) / 3000, 0.2, 0.65);
    const desktopViewportProgress = clamp(
        (width - TABLET_MAX_WIDTH) / (DESKTOP_SCALE_REFERENCE_WIDTH - TABLET_MAX_WIDTH),
        0,
        1,
    );
    const tabletViewportProgress = clamp(
        (width - MOBILE_MAX_WIDTH) / (TABLET_MAX_WIDTH - MOBILE_MAX_WIDTH),
        0,
        1,
    );
    const tabletConstellationScale = isPortrait
        ? 0.5 + 0.2 * tabletViewportProgress
        : 0.68 + 0.14 * tabletViewportProgress;
    const desktopStartConstellationScale = isPortrait ? 0.68 : 0.82;
    const desktopConstellationScale =
        desktopStartConstellationScale +
        (1 - desktopStartConstellationScale) * desktopViewportProgress;
    const desktopConstellationSpread = 5 + 4 * desktopViewportProgress;
    const desktopHtmlSpacingProgress = increaseProgressGrowth(
        desktopViewportProgress,
        DESKTOP_HTML_SPACING_GROWTH_FACTOR,
    );
    const desktopExperienceRowInlinePadding = interpolate(
        TABLET_EXPERIENCE_ROW_INLINE_PADDING,
        DESKTOP_EXPERIENCE_ROW_INLINE_PADDING,
        desktopHtmlSpacingProgress,
    );
    const sharedResponsiveValues = {
        text: {
            curveStrength: isMobile
                ? 0
                : isTablet
                  ? TABLET_TEXT_CURVE_STRENGTH
                  : interpolate(
                        TABLET_TEXT_CURVE_STRENGTH,
                        DESKTOP_TEXT_CURVE_STRENGTH,
                        desktopViewportProgress,
                    ),
            curveBow: interpolate(
                TABLET_TEXT_CURVE_BOW,
                DESKTOP_TEXT_CURVE_BOW,
                desktopViewportProgress,
            ),
        },
        layout: {
            introTextWidth: interpolate(
                TABLET_INTRO_TEXT_WIDTH,
                DESKTOP_INTRO_TEXT_WIDTH,
                desktopHtmlSpacingProgress,
            ),
            experienceRowInlinePadding: desktopExperienceRowInlinePadding,
        },
        sectionTextAnimations: {
            intro: {
                start: useCompactMotion ? '70% top' : 'center+=1000 top',
                end: 'bottom top',
                scrub: reducedMotion ? true : useCompactMotion ? 0.6 : 1.2,
            },
            contact: {
                start: isMobile ? 'center bottom' : 'top top',
                end: isMobile ? 'bottom bottom' : 'center top',
                scrub: reducedMotion ? true : isMobile ? 0.45 : useCompactMotion ? 0.6 : 1.2,
            },
        },
    } satisfies Pick<ResponsiveConfig, 'text' | 'layout' | 'sectionTextAnimations'>;

    if (mode === 'desktop') {
        return {
            mode,
            isMobile,
            isTablet,
            isCompact,
            isPortrait,
            hasFinePointer,
            hasCoarsePointer,
            reducedMotion,
            ...sharedResponsiveValues,
            renderer: {
                pixelRatioCap: DESKTOP_PIXEL_RATIO_CAP,
                bloomPixelRatioCap: DESKTOP_BLOOM_PIXEL_RATIO_CAP,
                bloomStrengthScale: 1,
                textBloomScale: 1.45,
            },
            coloredLight: {
                horizontalScale: 200,
                horizonY: -120,
                speed: 100,
                intensity: 0.22,
                width: 400,
                height: 30,
                waveAmplitudeScale: 1,
                colorWindowSize: 5,
            },
            particles: lowPowerProfile
                ? {
                      main: 15000,
                      ambient: 1000,
                      floatingText: 1800,
                      ellipsis: 4200,
                      tunnelRadiusScale: 1,
                      tunnelBokehSizeScale: 1,
                  }
                : {
                      main: 20000,
                      ambient: 1500,
                      floatingText: 2200,
                      ellipsis: 5200,
                      tunnelRadiusScale: 1,
                      tunnelBokehSizeScale: 1,
                  },
            camera: {
                fov: 50,
                introMinZ: -10,
                introMaxZ: 120,
                projectsMinZ: 6,
                projectsMaxZ: 120,
                ...DESKTOP_CONTACT_CAMERA_CONFIG,
            },
            constellation: {
                scale: desktopConstellationScale,
                position: [0, -1.5, -5],
                clusterSpread: desktopConstellationSpread,
                touchHitScale: 1,
                boundaryHitScale: 1,
                labelScale: 1,
                fogScale: CONSTELLATION_FOG_SCALE_BOOST,
                fogSpreadScale: 1.2,
                selectedFocusX: -4.25,
                motionScale: reducedMotion ? 0 : 1,
            },
        };
    }

    if (mode === 'tablet') {
        return {
            mode,
            isMobile,
            isTablet,
            isCompact,
            isPortrait,
            hasFinePointer,
            hasCoarsePointer,
            reducedMotion,
            ...sharedResponsiveValues,
            renderer: {
                pixelRatioCap: DESKTOP_PIXEL_RATIO_CAP,
                bloomPixelRatioCap: DESKTOP_BLOOM_PIXEL_RATIO_CAP,
                bloomStrengthScale: 1,
                textBloomScale: 1.38,
            },
            coloredLight: {
                horizontalScale: isPortrait ? 155 : 185,
                horizonY: -110,
                speed: 85,
                intensity: 0.24,
                width: isPortrait ? 205 : 240,
                height: isPortrait ? 38 : 34,
                waveAmplitudeScale: 0.82,
                colorWindowSize: 5,
            },
            particles: {
                main: lowPowerProfile ? 15000 : 20000,
                ambient: lowPowerProfile ? 1000 : 1500,
                floatingText: lowPowerProfile ? 1800 : 2200,
                ellipsis: lowPowerProfile ? 4200 : 5200,
                tunnelRadiusScale: 1,
                tunnelBokehSizeScale: 1,
            },
            camera: {
                fov: 65,
                introMinZ: -10,
                introMaxZ: 150,
                projectsMinZ: 6,
                projectsMaxZ: 150,
                ...DESKTOP_CONTACT_CAMERA_CONFIG,
            },
            constellation: {
                scale: tabletConstellationScale,
                position: [0, -0.7, -5],
                clusterSpread: 5.7,
                touchHitScale: hasCoarsePointer ? 1.3 : 1,
                boundaryHitScale: hasCoarsePointer ? 1.18 : 1,
                labelScale: isPortrait ? 1.25 : 1.12,
                fogScale: (isPortrait ? 1.2 : 1.08) * CONSTELLATION_FOG_SCALE_BOOST,
                fogSpreadScale: 1.2,
                selectedFocusX: isPortrait ? -1.8 : -2.8,
                motionScale: reducedMotion ? 0 : 0.75,
            },
        };
    }

    return {
        mode,
        isMobile,
        isTablet,
        isCompact,
        isPortrait,
        hasFinePointer,
        hasCoarsePointer,
        reducedMotion,
        ...sharedResponsiveValues,
        renderer: {
            pixelRatioCap: DESKTOP_PIXEL_RATIO_CAP,
            bloomPixelRatioCap: DESKTOP_BLOOM_PIXEL_RATIO_CAP,
            bloomStrengthScale: MOBILE_BLOOM_STRENGTH_SCALE,
            textBloomScale: 0.75,
        },
        coloredLight: {
            horizontalScale: isPortrait ? 115 : 150,
            horizonY: -106,
            speed: 75,
            intensity: 0.15,
            width: 150,
            height: 90,
            waveAmplitudeScale: 0.72,
            colorWindowSize: 2,
        },
        particles: {
            main: 15000,
            ambient: 1000,
            floatingText: 1800,
            ellipsis: 4200,
            tunnelRadiusScale: 1.3,
            tunnelBokehSizeScale: mobileTunnelBokehSizeScale,
        },
        camera: {
            fov: 75,
            introMinZ: -6,
            introMaxZ: 150,
            projectsMinZ: 5.5,
            projectsMaxZ: 150,
            ...MOBILE_CONTACT_CAMERA_CONFIG,
        },
        constellation: {
            scale: mobileConstellationScale * 2.5,
            position: [0, -0.4, -5],
            clusterSpread: 4.9,
            touchHitScale: 1.55,
            boundaryHitScale: 1.35,
            labelScale: 1.55,
            fogScale: 1.35 * CONSTELLATION_FOG_SCALE_BOOST,
            fogSpreadScale: 1,
            selectedFocusX: 0,
            motionScale: 0,
        },
    };
};

let activeResponsiveConfig: ResponsiveConfig | undefined;

export const refreshResponsiveConfig = (
    width = window.innerWidth,
    height = window.innerHeight,
): ResponsiveConfig => {
    const nextResponsiveConfig = getResponsiveConfig(width, height);
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--intro-text-width', `${nextResponsiveConfig.layout.introTextWidth}px`);
    rootStyle.setProperty(
        '--experience-row-inline-padding',
        `${nextResponsiveConfig.layout.experienceRowInlinePadding}px`,
    );

    if (!activeResponsiveConfig) {
        activeResponsiveConfig = nextResponsiveConfig;
        return activeResponsiveConfig;
    }

    Object.assign(activeResponsiveConfig, nextResponsiveConfig);
    return activeResponsiveConfig;
};
