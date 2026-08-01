import gsap from 'gsap';

import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { createResponsiveLineSplit } from '../../utils/splitText';

export const initExperienceAnimations = (config: ResponsiveConfig): void => {
    if (config.reducedMotion) {
        return;
    }

    gsap.utils.toArray<HTMLElement>('.experience__row').forEach((row) => {
        const headerElements = gsap.utils.toArray<HTMLElement>(
            '.experience__period, .experience__organization, .experience__role',
            row,
        );
        const descElements = gsap.utils.toArray<HTMLElement>('.experience__desc', row);
        const categoryTargets = gsap.utils.toArray<HTMLElement>('.experience__category', row);
        const splitElements = [...headerElements, ...descElements];

        if (!splitElements.length && !categoryTargets.length) {
            return;
        }

        createResponsiveLineSplit(
            splitElements,
            (lines) => {
                const useCompactMotion = config.isCompact || config.hasCoarsePointer;
                const blur = useCompactMotion ? 4 : 8;
                const stepDuration = useCompactMotion ? 0.18 : 0.2;
                const overlap = useCompactMotion ? 0.04 : 0.08;
                const stagger = useCompactMotion ? 0.03 : 0.08;
                const exitStagger = config.isMobile ? 0.08 : stagger;
                const headerTargets = lines.filter((line) =>
                    line.closest(
                        '.experience__period, .experience__organization, .experience__role',
                    ),
                );
                const descTargets = lines.filter((line) => line.closest('.experience__desc'));
                const rowTargets = [...categoryTargets, ...headerTargets, ...descTargets];
                const timeline = gsap.timeline({
                    scrollTrigger: {
                        trigger: row,
                        start: useCompactMotion ? 'top bottom-=32' : 'top bottom-=75',
                        end: useCompactMotion ? 'bottom center-=260' : 'bottom center-=175',
                        scrub: true,
                        fastScrollEnd: true,
                    },
                });

                if (categoryTargets.length) {
                    timeline.from(categoryTargets, {
                        opacity: 0,
                        filter: `blur(${blur}px)`,
                        ease: 'none',
                        duration: stepDuration,
                    });
                }

                return timeline
                    .from(
                        headerTargets,
                        {
                            opacity: 0,
                            filter: `blur(${blur}px)`,
                            ease: 'none',
                            duration: stepDuration,
                        },
                        categoryTargets.length ? `<+=${overlap}` : undefined,
                    )
                    .from(
                        descTargets,
                        {
                            opacity: 0,
                            filter: `blur(${blur}px)`,
                            ease: 'none',
                            stagger: { each: stagger, from: 'start' },
                            duration: stepDuration,
                        },
                        `<+=${overlap}`,
                    )
                    .to(rowTargets, {
                        opacity: 1,
                        filter: 'blur(0px)',
                        ease: 'none',
                        duration: useCompactMotion ? 0.52 : 0.6,
                    })
                    .to([...categoryTargets, ...headerTargets], {
                        opacity: 0,
                        filter: `blur(${blur}px)`,
                        ease: 'none',
                        duration: stepDuration,
                    })
                    .to(
                        descTargets,
                        {
                            opacity: 0,
                            filter: `blur(${blur}px)`,
                            ease: 'none',
                            stagger: { each: exitStagger, from: 'start' },
                            duration: stepDuration,
                        },
                        `<+=${overlap}`,
                    );
            },
            'experience__line',
        );
    });
};
