import gsap from 'gsap';
import type { ScrollSmoother } from 'gsap/ScrollSmoother';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { getNavigationTarget } from './navigation/getNavigationTarget';
import { getScrollSmootherMaxScroll } from './navigation/getScrollSmootherMaxScroll';
import { isPageEndNavigationTarget } from './navigation/navigationSections';
import type { ResponsiveConfig } from './responsiveConfig';
import { sectionSelectors } from '../sections/sectionIds';

export const initNavigation = (
    smoother: ScrollSmoother,
    config: ResponsiveConfig,
    onProjectsIntent?: () => void,
) => {
    const navigationLinks = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll]'));
    const projectsLink = navigationLinks.find(
        (link) => link.dataset.scroll === sectionSelectors.projects,
    );

    let navigationTween: gsap.core.Tween | undefined;
    let pendingTarget: string | undefined;
    let resizeTarget: string | undefined;
    let isReady = false;
    let shouldResumeSmoother = false;

    if (projectsLink && onProjectsIntent) {
        let prepared = false;
        const prepareProjects = (): void => {
            if (prepared) {
                return;
            }
            prepared = true;
            onProjectsIntent();
        };

        projectsLink.addEventListener('pointerenter', prepareProjects, {
            passive: true,
        });
        projectsLink.addEventListener('pointerdown', prepareProjects, {
            passive: true,
        });
        projectsLink.addEventListener('focus', prepareProjects);
    }

    if (config.hasCoarsePointer) {
        document.addEventListener(
            'pointerdown',
            (event) => {
                const target = event.target;
                document.body.classList.toggle(
                    'is-nav-hover-reset',
                    !(target instanceof Element && target.closest('.nav__link')),
                );
            },
            { passive: true },
        );
    }

    const releaseNavigationLock = (): void => {
        if (!shouldResumeSmoother) {
            return;
        }

        smoother.paused(false);
        shouldResumeSmoother = false;
    };

    const resolveTarget = (target: string | number): number =>
        typeof target === 'number'
            ? target
            : getNavigationTarget(smoother, target, config.isMobile);

    const getNavigationDuration = (target: string | number): number => {
        if (config.reducedMotion) {
            return 0;
        }

        if (typeof target === 'number') {
            return config.isCompact || config.hasCoarsePointer ? 0.6 : smoother.smooth() * 1.5;
        }

        const targetIndex = navigationLinks.findIndex((link) => link.dataset.scroll === target);

        const currentY = smoother.scrollTop();

        let currentIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;

        navigationLinks.forEach((link, index) => {
            const linkTarget = link.dataset.scroll;
            if (!linkTarget) {
                return;
            }

            const linkY = getNavigationTarget(smoother, linkTarget, config.isMobile);

            const distance = Math.abs(linkY - currentY);

            if (distance < closestDistance) {
                closestDistance = distance;
                currentIndex = index;
            }
        });

        const sectionDistance =
            targetIndex < 0 ? 2 : Math.max(1, Math.abs(targetIndex - currentIndex));

        if (config.isCompact || config.hasCoarsePointer) {
            return Math.min(0.8, 0.35 + sectionDistance * 0.15);
        }

        return smoother.smooth() * (0.35 + sectionDistance * 0.35);
    };

    const scrollTo = (target: string | number, smooth: boolean): void => {
        navigationTween?.kill();
        navigationTween = undefined;

        releaseNavigationLock();

        const isPageEndDestination =
            typeof target === 'string' && isPageEndNavigationTarget(target);

        const destination = gsap.utils.clamp(
            0,
            getScrollSmootherMaxScroll(smoother),
            resolveTarget(target),
        );

        if (!smooth) {
            smoother.scrollTop(destination);
            return;
        }

        shouldResumeSmoother = !smoother.paused();
        smoother.paused(true);

        navigationTween = gsap.to(smoother, {
            duration: getNavigationDuration(target),
            scrollTop: destination,
            overwrite: 'auto',
            ease: 'expo',

            onComplete: () => {
                navigationTween = undefined;

                if (isPageEndDestination) {
                    const latestDestination = getScrollSmootherMaxScroll(smoother);

                    if (latestDestination !== destination) {
                        smoother.scrollTop(latestDestination);
                    }
                }

                releaseNavigationLock();
            },

            onInterrupt: () => {
                navigationTween = undefined;
                releaseNavigationLock();
            },
        });
    };

    navigationLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();

            const target = link.dataset.scroll;
            if (!target) {
                return;
            }

            if (target === sectionSelectors.projects) {
                onProjectsIntent?.();
            }

            if (!isReady || (smoother.paused() && !navigationTween)) {
                pendingTarget = target;
                return;
            }

            pendingTarget = undefined;
            scrollTo(target, !config.reducedMotion);
        });
    });

    const cancelActiveScroll = (): void => {
        pendingTarget = undefined;
        navigationTween?.kill();
        navigationTween = undefined;
        releaseNavigationLock();
    };

    window.addEventListener(
        'resize',
        () => {
            resizeTarget ??= navigationLinks.find((link) => link.classList.contains('active'))
                ?.dataset.scroll;
            cancelActiveScroll();
            gsap.killTweensOf(smoother);
            smoother.scrollTop(smoother.scrollTop());
        },
        { passive: true },
    );

    ScrollTrigger.addEventListener('refresh', () => {
        if (!resizeTarget) {
            return;
        }

        const target = resizeTarget;
        resizeTarget = undefined;
        scrollTo(target, false);
    });

    return {
        cancelActiveScroll,

        setReady(): void {
            isReady = true;
            if (!pendingTarget || smoother.paused()) {
                return;
            }

            const target = pendingTarget;
            pendingTarget = undefined;
            scrollTo(target, !config.reducedMotion);
        },
    };
};
