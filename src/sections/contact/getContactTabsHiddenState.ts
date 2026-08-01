import type { ResponsiveConfig } from '../../app/responsiveConfig';

export const getContactTabsHiddenState = (config: ResponsiveConfig): gsap.TweenVars => {
    if (config.reducedMotion) {
        return {
            scale: 1,
            opacity: 0,
            filter: 'blur(0px)',
        };
    }

    if (config.isMobile) {
        return {
            scale: 0.92,
            opacity: 0,
        };
    }

    if (config.isCompact || config.hasCoarsePointer) {
        return {
            scale: 0.92,
            opacity: 0,
            filter: 'blur(8px)',
        };
    }

    return {
        scale: 0.4,
        opacity: 0,
        filter: 'blur(28px)',
    };
};
