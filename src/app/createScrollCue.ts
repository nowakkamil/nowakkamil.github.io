import gsap from 'gsap';

import { rangeProgress, smoothstep } from '../utils/animation';

const REVEAL_DELAY = 1.2;
const REVEAL_OFFSET_Y = 16;

export const createScrollCue = (reduceMotion: boolean) => {
    const scrollCue = document.querySelector<HTMLElement>('.scroll-cue');
    const scrollCueOutline = document.querySelector<SVGRectElement>('.scroll-cue__outline');
    const scrollCueDot = document.querySelector<SVGRectElement>('.scroll-cue__dot');
    const primaryScrollSatellite = document.querySelector<SVGCircleElement>(
        '.scroll-cue__satellite--primary',
    );
    const secondaryScrollSatellite = document.querySelector<SVGCircleElement>(
        '.scroll-cue__satellite--secondary',
    );
    let introProgress = 0;
    let ready = false;
    let entranceTween: gsap.core.Tween | undefined;

    const orbit = { progress: 0 };
    let outlineLength = 0;
    let initialized = false;
    let dotTimeline: gsap.core.Timeline | undefined;
    let orbitTimeline: gsap.core.Tween | undefined;

    const updateSatellites = (): void => {
        if (!scrollCueOutline || outlineLength <= 0) {
            return;
        }

        const primaryPosition = scrollCueOutline.getPointAtLength(orbit.progress * outlineLength);
        const secondaryPosition = scrollCueOutline.getPointAtLength(
            ((orbit.progress + 0.5) % 1) * outlineLength,
        );

        if (primaryScrollSatellite) {
            gsap.set(primaryScrollSatellite, {
                attr: { cx: primaryPosition.x, cy: primaryPosition.y },
            });
        }
        if (secondaryScrollSatellite) {
            gsap.set(secondaryScrollSatellite, {
                attr: { cx: secondaryPosition.x, cy: secondaryPosition.y },
            });
        }
    };

    const measure = (): void => {
        outlineLength = scrollCueOutline?.getTotalLength() ?? 0;
        updateSatellites();
    };

    const initialize = (): void => {
        if (initialized) {
            return;
        }
        initialized = true;

        measure();
        window.addEventListener('resize', measure, { passive: true });
        if (reduceMotion) {
            return;
        }

        if (scrollCueDot) {
            dotTimeline = gsap
                .timeline({ paused: true, repeat: -1, repeatDelay: 0.18 })
                .set(scrollCueDot, { y: 0, opacity: 0 })
                .to(scrollCueDot, {
                    opacity: 1,
                    duration: 0.25,
                    ease: 'power1.out',
                })
                .to(
                    scrollCueDot,
                    {
                        y: 20,
                        duration: 1.5,
                        ease: 'power1.inOut',
                    },
                    '<',
                )
                .to(
                    scrollCueDot,
                    {
                        opacity: 0,
                        duration: 0.25,
                        ease: 'power1.in',
                    },
                    '-=0.5',
                );
        }

        orbitTimeline = gsap.to(orbit, {
            progress: 1,
            paused: true,
            repeat: -1,
            duration: 5.8,
            ease: 'none',
            onUpdate: updateSatellites,
        });
    };

    const reveal = (): void => {
        if (!scrollCue || !ready) {
            return;
        }
        initialize();

        entranceTween?.kill();
        gsap.set(scrollCue, { visibility: 'visible' });
        entranceTween = gsap.fromTo(
            scrollCue,
            {
                opacity: 0,
                y: reduceMotion ? 0 : REVEAL_OFFSET_Y,
            },
            {
                opacity: 1,
                y: 0,
                delay: reduceMotion ? 0 : REVEAL_DELAY,
                duration: reduceMotion ? 0.01 : 2,
                ease: 'power2.out',
                onStart: () => {
                    if (!reduceMotion) {
                        dotTimeline?.restart();
                        orbitTimeline?.restart();
                    }
                },
                onComplete: () => {
                    entranceTween = undefined;
                },
            },
        );
    };

    const update = (progress: number, isResetting: boolean): void => {
        introProgress = progress;
        if (!scrollCue || !ready) {
            return;
        }

        const visibility = isResetting ? 0 : 1 - smoothstep(rangeProgress(introProgress, 0, 0.14));

        if (isResetting) {
            entranceTween?.kill();
            entranceTween = undefined;
            gsap.set(scrollCue, {
                opacity: 0,
                y: 12,
                visibility: 'hidden',
            });
        } else {
            if (entranceTween && introProgress <= 0.001) {
                return;
            }

            entranceTween?.kill();
            entranceTween = undefined;
            gsap.set(scrollCue, { visibility: 'visible' });
            gsap.set(scrollCue, {
                opacity: visibility,
                y: (1 - visibility) * 12,
            });
        }

        if (!reduceMotion) {
            dotTimeline?.paused(visibility < 0.02);
            orbitTimeline?.paused(visibility < 0.02);
        }
    };

    const setReady = (): void => {
        ready = true;
    };

    return { reveal, setReady, update };
};

export type ScrollCue = ReturnType<typeof createScrollCue>;
