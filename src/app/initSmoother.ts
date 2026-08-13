import gsap from 'gsap';
import { ScrollSmoother } from 'gsap/ScrollSmoother';

import type { ResponsiveConfig } from './responsiveConfig';

gsap.registerPlugin(ScrollSmoother);

export function initSmoother(config: ResponsiveConfig) {
    const smoothScrollingEnabled = !config.reducedMotion;

    return ScrollSmoother.create({
        wrapper: '#smooth-wrapper',
        content: '#smooth-content',
        smooth: config.reducedMotion ? 0 : 3,
        effects: smoothScrollingEnabled,
        normalizeScroll: smoothScrollingEnabled
            ? config.isCompact
                ? {
                      allowNestedScroll: true,
                      debounce: true,
                      momentum: 1,
                  }
                : true
            : false,
        speed: smoothScrollingEnabled ? (config.isCompact ? 1 : 1.2) : 1,
        smoothTouch: smoothScrollingEnabled ? (config.isCompact ? 0.85 : 3) : 0,
        ignoreMobileResize: true,
    });
}
