import gsap from 'gsap';

import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { createResponsiveLineSplit } from '../../utils/splitText';
import { sectionSelectors } from '../sectionIds';

export const createIntroTextAnimation = (config: ResponsiveConfig): void => {
    createResponsiveLineSplit('.reveal-text', (introTargets) => {
        const useCompactMotion = config.isCompact || config.hasCoarsePointer;
        const timeline = gsap.timeline({
            scrollTrigger: {
                ...config.sectionTextAnimations.intro,
                trigger: sectionSelectors.intro,
                scrub: true,
                fastScrollEnd: true,
            },
        });

        if (config.reducedMotion) {
            timeline
                .from(introTargets, {
                    opacity: 0,
                    ease: 'none',
                })
                .to({}, { duration: 0.2 })
                .to(introTargets, {
                    opacity: 0,
                    ease: 'none',
                });
            return timeline;
        }

        const travel = useCompactMotion ? 40 : 120;
        const blur = useCompactMotion ? 6 : 24;
        const stagger = useCompactMotion ? 0.12 : 0.5;

        return timeline
            .from(introTargets, {
                yPercent: travel,
                opacity: 0,
                filter: `blur(${blur}px)`,
                ease: 'none',
                stagger: { each: stagger, from: 'end' },
            })
            .to({}, { duration: useCompactMotion ? 0.35 : 0.8 })
            .to(introTargets, {
                opacity: 0,
                filter: `blur(${blur}px)`,
                yPercent: -travel,
                ease: 'none',
                stagger: { each: stagger, from: 'end' },
            });
    });
};
