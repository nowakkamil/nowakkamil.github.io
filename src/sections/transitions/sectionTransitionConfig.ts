export const INTRO_TRANSITION = {
    backgroundStart: 0.5,
    backgroundEnd: 1,
    coloredLightStart: 0.38,
    coloredLightEnd: 0.86,
    morphStart: 0.5,
    morphEnd: 0.72,
    textPositionStart: 0.75,
    textPositionEnd: 1,
} as const;

export const EXPERIENCE_TRANSITION = {
    nameStart: 0,
    nameEnd: 0.46,
    educationStart: 0.58,
    educationEnd: 0.88,
} as const;

export const MOBILE_EXPERIENCE_TRANSITION = {
    ...EXPERIENCE_TRANSITION,
    nameEnd: 0.34,
    educationStart: 0.78,
    educationEnd: 0.99,
} as const;

export const MOBILE_PROJECTS_MORPH = {
    start: 0.1,
    end: 0.3,
} as const;

export const MOBILE_PROJECTS_TEXT_LOWER = {
    start: 0.1,
    end: 0.3,
} as const;

const projectsTextLowerEnd = 0.34;
const projectsCloudMorphEnd = 0.6;
const mainParticlesDimAmount = 0.76;
const constellationScrollStart = 0.78;
const constellationScrollEnd = 0.985;

export const PROJECTS_TRANSITION = {
    textLowerStart: 0,
    textLowerEnd: projectsTextLowerEnd,
    zoomStart: projectsTextLowerEnd,
    zoomEnd: 1,
    cloudMorphStart: projectsTextLowerEnd,
    cloudMorphEnd: projectsCloudMorphEnd,
    coloredLightHideStart: 0.08,
    coloredLightHideEnd: 0.58,
    mainParticlesDimStart: projectsCloudMorphEnd,
    mainParticlesDimEnd: 0.82,
    mainParticlesDimAmount,
    contactStartIntensity: 1 - mainParticlesDimAmount,
    contactSparkle: 1,
    constellationRevealStart: 0.63,
    constellationRevealEnd: 0.82,
    panelBoundaryStart: constellationScrollStart,
    panelBoundaryEnd: constellationScrollEnd,
    constellationFadeOutStart: constellationScrollEnd,
} as const;

const contactCameraZoomInEnd = 0.5;

export const CONTACT_TRANSITION = {
    cameraZoomInEnd: contactCameraZoomInEnd,
    mainParticlesRestoreStart: 0,
    mainParticlesRestoreEnd: contactCameraZoomInEnd,
    navigationConstellationFadeOutEnd: 0.12,
    loopBlackoutStart: 0.18,
    loopBlackoutEnd: 0.82,
    tunnelMorphEnd: 0.62,
    tunnelColorStart: 0.08,
    tunnelColorEnd: 0.72,
    tunnelSpinStart: 0.5,
    tunnelSpinEnd: 1,
} as const;
