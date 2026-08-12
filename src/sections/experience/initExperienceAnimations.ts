import gsap from 'gsap';

import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { createResponsiveLineSplit } from '../../utils/splitText';

export const initExperienceAnimations = (config: ResponsiveConfig): void => {
    if (config.reducedMotion) {
        return;
    }

    const rows = gsap.utils.toArray<HTMLElement>('.experience__row').map((row) => ({
        row,
        splitElements: gsap.utils.toArray<HTMLElement>(
            '.experience__period, .experience__organization, .experience__role, .experience__desc',
            row,
        ),
        categoryTargets: gsap.utils.toArray<HTMLElement>('.experience__category', row),
    }));
    const splitElements = rows.flatMap((row) => row.splitElements);

    if (splitElements.length === 0) {
        return;
    }

    const useCompactMotion = config.isCompact || config.hasCoarsePointer;
    const blur = useCompactMotion ? 4 : 8;
    const stepDuration = useCompactMotion ? 0.18 : 0.2;
    const overlap = useCompactMotion ? 0.04 : 0.08;
    const stagger = useCompactMotion ? 0.03 : 0.08;
    const exitStagger = config.isMobile ? 0.08 : stagger;
    let animationContext: gsap.Context | undefined;

    createResponsiveLineSplit(
        splitElements,
        (lines) => {
            animationContext?.revert();
            animationContext = gsap.context(() => {
                rows.forEach(({ row, categoryTargets }) => {
                    const rowLines = lines.filter((line) => row.contains(line));
                    const headerTargets = rowLines.filter((line) =>
                        line.closest(
                            '.experience__period, .experience__organization, .experience__role',
                        ),
                    );
                    const descTargets = rowLines.filter((line) =>
                        line.closest('.experience__desc'),
                    );
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

                    timeline
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
                });
            });
        },
        'experience__line',
    );
};
