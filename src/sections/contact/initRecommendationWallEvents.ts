import gsap from 'gsap';

import type { ResponsiveConfig } from '../../app/responsiveConfig';

type WallScrollState = {
    target: number;
    tween: gsap.core.Tween | null;
};

export function initRecommendationWallEvents(config: ResponsiveConfig): () => void {
    const selector = '.recommendation-wall';
    const contactTabs = document.querySelector<HTMLElement>('.contact-tabs');
    const reduceMotion = config.reducedMotion;
    const scrollStates = new Map<HTMLElement, WallScrollState>();
    const disclosureTimelines = new Map<HTMLDetailsElement, gsap.core.Timeline>();

    let lastTouchY = 0;

    const getWallFromEvent = (event: Event): HTMLElement | null => {
        const target = event.target;

        if (!(target instanceof Element)) {
            return null;
        }

        return target.closest<HTMLElement>(selector);
    };

    const canScroll = (wall: HTMLElement): boolean => wall.scrollHeight > wall.clientHeight + 1;

    const isContactBlurred = (): boolean => {
        if (!contactTabs) {
            return false;
        }

        const blur = getComputedStyle(contactTabs).filter.match(/blur\(([\d.]+)px\)/);

        return blur !== null && Number.parseFloat(blur[1]) > 0.1;
    };

    const stopWallScroll = (wall: HTMLElement): void => {
        const state = scrollStates.get(wall);

        state?.tween?.kill();

        if (state) {
            state.target = wall.scrollTop;
            state.tween = null;
        }
    };

    const scrollWall = (wall: HTMLElement, deltaY: number, smooth = true): void => {
        const maxScrollTop = wall.scrollHeight - wall.clientHeight;
        let state = scrollStates.get(wall);

        if (!state) {
            state = {
                target: wall.scrollTop,
                tween: null,
            };
            scrollStates.set(wall, state);
        }

        if (!state.tween) {
            state.target = wall.scrollTop;
        }

        state.target = Math.max(0, Math.min(maxScrollTop, state.target + deltaY));

        state.tween?.kill();

        if (!smooth || reduceMotion) {
            wall.scrollTop = state.target;
            state.tween = null;
            return;
        }

        state.tween = gsap.to(wall, {
            scrollTop: state.target,
            duration: 0.42,
            ease: 'power3.out',
            overwrite: true,
            onComplete: () => {
                state.target = wall.scrollTop;
                state.tween = null;
            },
        });
    };

    const stopHard = (event: Event): void => {
        event.stopPropagation();

        if ('stopImmediatePropagation' in event) {
            event.stopImmediatePropagation();
        }
    };

    const handleWheel = (event: WheelEvent): void => {
        const wall = getWallFromEvent(event);

        if (!wall) {
            return;
        }

        if (isContactBlurred()) {
            stopWallScroll(wall);
            return;
        }

        if (!canScroll(wall)) {
            return;
        }

        const deltaScale =
            event.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? 16
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                  ? wall.clientHeight
                  : 1;
        const deltaY = event.deltaY * deltaScale;

        event.preventDefault();
        stopHard(event);

        scrollWall(wall, deltaY);
    };

    const handleTouchStart = (event: TouchEvent): void => {
        const wall = getWallFromEvent(event);

        if (!wall || !event.touches.length) {
            return;
        }

        lastTouchY = event.touches[0].clientY;

        if (isContactBlurred()) {
            stopWallScroll(wall);
            return;
        }

        if (config.isCompact) {
            stopWallScroll(wall);
        }

        stopHard(event);
    };

    const handleTouchMove = (event: TouchEvent): void => {
        const wall = getWallFromEvent(event);

        if (!wall || !event.touches.length) {
            return;
        }

        if (isContactBlurred()) {
            stopWallScroll(wall);
            return;
        }

        if (!canScroll(wall)) {
            return;
        }

        if (config.isCompact) {
            stopHard(event);
            return;
        }

        const currentTouchY = event.touches[0].clientY;
        const deltaY = lastTouchY - currentTouchY;

        lastTouchY = currentTouchY;

        event.preventDefault();
        stopHard(event);

        scrollWall(wall, deltaY, false);
    };

    const handleTap = (event: Event): void => {
        const wall = getWallFromEvent(event);

        if (!wall) {
            return;
        }

        event.stopPropagation();
    };

    const handleDetailsClick = (event: MouseEvent): void => {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        const summary = target.closest<HTMLElement>('.recommendation-card__details summary');
        const details = summary?.closest<HTMLDetailsElement>('.recommendation-card__details');

        if (!summary || !details || !getWallFromEvent(event)) {
            return;
        }

        event.preventDefault();
        stopHard(event);

        if (disclosureTimelines.get(details)?.isActive()) {
            return;
        }

        if (reduceMotion) {
            details.open = !details.open;
            return;
        }

        const paragraphs = Array.from(details.querySelectorAll<HTMLElement>(':scope > p'));
        const isOpening = !details.open;
        const summaryHeight = summary.offsetHeight;
        const timeline = gsap.timeline({
            onComplete: () => {
                gsap.set(details, { clearProps: 'height,overflow' });
                gsap.set(paragraphs, { clearProps: 'opacity,transform' });
                gsap.set(summary, { clearProps: 'opacity,transform' });
                disclosureTimelines.delete(details);
            },
        });

        disclosureTimelines.set(details, timeline);

        if (isOpening) {
            timeline
                .to(summary, {
                    opacity: 0,
                    y: 2,
                    duration: 0.1,
                    ease: 'power1.out',
                })
                .add(() => {
                    details.open = true;
                    gsap.set(details, {
                        height: summaryHeight,
                        overflow: 'hidden',
                    });
                    gsap.set(paragraphs, { opacity: 0, y: -6 });
                })
                .to(details, {
                    height: 'auto',
                    duration: 0.38,
                    ease: 'power3.out',
                })
                .to(
                    paragraphs,
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.24,
                        stagger: 0.025,
                        ease: 'power2.out',
                    },
                    '<0.04',
                )
                .to(
                    summary,
                    {
                        opacity: 1,
                        y: 0,
                        duration: 0.18,
                        ease: 'power2.out',
                    },
                    '<0.08',
                );

            return;
        }

        gsap.set(details, {
            height: details.offsetHeight,
            overflow: 'hidden',
        });

        timeline
            .to(summary, {
                opacity: 0,
                y: -2,
                duration: 0.1,
                ease: 'power1.out',
            })
            .to(
                paragraphs,
                {
                    opacity: 0,
                    y: -5,
                    duration: 0.18,
                    ease: 'power2.in',
                },
                '<',
            )
            .to(
                details,
                {
                    height: summaryHeight,
                    duration: 0.3,
                    ease: 'power3.inOut',
                },
                '<',
            )
            .add(() => {
                details.open = false;
            })
            .to(summary, {
                opacity: 1,
                y: 0,
                duration: 0.18,
                ease: 'power2.out',
            });
    };

    window.addEventListener('wheel', handleWheel, {
        passive: false,
        capture: true,
    });

    window.addEventListener('touchstart', handleTouchStart, {
        passive: false,
        capture: true,
    });

    window.addEventListener('touchmove', handleTouchMove, {
        passive: false,
        capture: true,
    });

    const tapEvents = [
        'pointerdown',
        'pointerup',
        'mousedown',
        'mouseup',
        'click',
        'dblclick',
        'touchend',
    ];

    window.addEventListener('click', handleDetailsClick, {
        passive: false,
        capture: true,
    });

    tapEvents.forEach((eventName) => {
        window.addEventListener(eventName, handleTap, {
            capture: true,
        });
    });

    return () => {
        scrollStates.forEach(({ tween }) => tween?.kill());
        scrollStates.clear();
        disclosureTimelines.forEach((timeline) => timeline.kill());
        disclosureTimelines.clear();

        window.removeEventListener('wheel', handleWheel, {
            capture: true,
        });

        window.removeEventListener('touchstart', handleTouchStart, {
            capture: true,
        });

        window.removeEventListener('touchmove', handleTouchMove, {
            capture: true,
        });

        window.removeEventListener('click', handleDetailsClick, {
            capture: true,
        });

        tapEvents.forEach((eventName) => {
            window.removeEventListener(eventName, handleTap, {
                capture: true,
            });
        });
    };
}
