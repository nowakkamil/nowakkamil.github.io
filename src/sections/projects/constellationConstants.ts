import * as THREE from 'three';

export const HIDDEN_CONSTELLATION_OPACITY_EPSILON = 0.003;
export const CONSTELLATION_CAMERA_FADE_NEAR = 2.8;
export const CONSTELLATION_CAMERA_FADE_FAR = 10.0;
export const SKILL_STARS_VISIBLE_OPACITY = 0.98;
export const SKILL_STARS_DIM_OPACITY = 0.42;
export const SKILL_STARS_SELECTED_OPACITY = 0.86;
export const SKILL_STARS_SELECTED_RESET_OPACITY = 0.4;
export const SKILL_STARS_UNFOCUSED_OPACITY = 0.24;
export const PROJECT_STAR_BASE_OPACITY = 0.075;
export const PROJECT_STAR_DIM_OPACITY = 0.035;
export const PROJECT_STAR_ACTIVE_OPACITY = 0.92;
export const PROJECT_STAR_SELECTED_OPACITY = 1.0;
export const PROJECT_STAR_SELECTED_CONTEXT_HOVER_OPACITY = 0.65;
export const PROJECT_STAR_BASE_SCALE = 0.82;
export const PROJECT_STAR_DIM_SCALE = 0.74;
export const PROJECT_STAR_ACTIVE_SCALE = 1.36;
export const PROJECT_STAR_SELECTED_CONTEXT_HOVER_SCALE = 1.3;
export const SKILL_LABEL_BASE_OPACITY = 0.24;
export const SKILL_LABEL_SELECTED_OPACITY = 0.58;
export const SKILL_LABEL_HOVER_OPACITY = 1.0;
export const SELECTED_PROJECT_FOCUS_OFFSET_MIN = -11.5;
export const SELECTED_PROJECT_FOCUS_OFFSET_MAX = 3.8;
export const RIGHTMOST_SELECTED_FOCUS_OFFSET_DESKTOP = 1.1;
export const RIGHTMOST_SELECTED_FOCUS_OFFSET_TABLET = 0.7;
export const TAP_MOVE_TOLERANCE = 10;
export const TAP_SCROLL_TOLERANCE = 4;
export const TAP_MAX_DURATION = 500;
export const MOBILE_STACK_CROSSFADE_PROJECT_SPAN = 1.25;
export const MOBILE_SEQUENCE_SMOOTHING = 7.5;
export const MOBILE_CROSSFADE_START = 0.36;
export const MOBILE_CROSSFADE_END = 0.64;
export const DOM_INTERACTION_SELECTOR = [
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'summary',
    '[contenteditable]',
    '[data-project-details-panel]',
    '[data-three-ignore]',
    '.project-preview',
    '.contact-tabs',
].join(',');

export const PORTFOLIO_CONSTELLATION_FOG_COLORS = [0x4285f4, 0x8a5cf5, 0x28a8ce] as const;

export const GEMINI_FOG_COLORS = PORTFOLIO_CONSTELLATION_FOG_COLORS.map(
    (color) => new THREE.Color(color),
);

export const seeded = (seed: number): number => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
};
