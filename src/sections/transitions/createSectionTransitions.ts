import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { ScrollSmoother } from 'gsap/ScrollSmoother';

import type { ScrollCue } from '../../app/createScrollCue';
import { getScrollSmootherMaxScroll } from '../../app/navigation/getScrollSmootherMaxScroll';
import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { ease, rangeProgress, smoothstep } from '../../utils/animation';
import type { World } from '../../world/World';
import type { ContactTunnelTug } from '../contact/createContactTunnelTug';
import { getContactTabsHiddenState } from '../contact/getContactTabsHiddenState';
import {
    CONTACT_TRANSITION,
    EXPERIENCE_TRANSITION,
    INTRO_TRANSITION,
    MOBILE_EXPERIENCE_TRANSITION,
    MOBILE_PROJECTS_MORPH,
    MOBILE_PROJECTS_TEXT_LOWER,
    PROJECTS_TRANSITION,
} from './sectionTransitionConfig';
import { CONTACT_FORM_REVEAL_TRIGGER_ID } from './contactTransitionIds';
import { getSectionSelector, sectionIds, sectionSelectors, type SectionId } from '../sectionIds';

type ProjectPanel = {
    hide: (immediate?: boolean) => void;
};

type SmootherWithRender = ScrollSmoother & {
    render: (y?: number, force?: boolean) => void;
};

type SectionTransitionsOptions = {
    world: World;
    smoother: ScrollSmoother;
    config: ResponsiveConfig;
    contactTabs: HTMLElement | null;
    scrollCue: ScrollCue;
    updateSoundCursorLabel: (progress: number) => void;
    cancelNavigationScroll: () => void;
    projectPreviewCard: ProjectPanel;
    projectDetailsPanel: ProjectPanel;
};

export const createSectionTransitions = ({
    world,
    smoother,
    config,
    contactTabs,
    scrollCue,
    updateSoundCursorLabel,
    cancelNavigationScroll,
    projectPreviewCard,
    projectDetailsPanel,
}: SectionTransitionsOptions) => {
    const reduceMotion = config.reducedMotion;
    const useCompactMotion = config.isCompact || config.hasCoarsePointer;
    const experienceTransition = config.isMobile
        ? MOBILE_EXPERIENCE_TRANSITION
        : EXPERIENCE_TRANSITION;
    const projectCue = document.querySelector<HTMLElement>('.project-cue');
    let isProjectCueVisible = false;
    let hasProjectBeenSelected = false;
    let projectCueProgress = 0;
    let isProjectsSectionActive = false;
    let isContactLoopResetting = false;
    let isContactLoopTransitionComplete = false;
    const contactLoopZoom = { progress: 0 };
    let contactLoopZoomTween: gsap.core.Tween | undefined;
    let contactLoopDomFadeTween: gsap.core.Tween | undefined;
    const contactLoopCompletionCallbacks = new Set<() => void>();
    let sectionSnapTween: gsap.core.Tween | undefined;
    let sectionSnapSettlingCheck: gsap.core.Tween | undefined;
    let useFastNavigationConstellationFadeOut = false;

    const setProjectPanelBoundaryActive = (active: boolean, immediate = false): void => {
        world.setProjectPanelBoundaryActive(active);

        if (!active) {
            world.clearSelectedPortfolioProject();
            projectPreviewCard.hide(immediate);
            projectDetailsPanel.hide(immediate);
        }
    };

    const updateProjectCue = (progress: number, isActive: boolean): void => {
        projectCueProgress = progress;
        isProjectsSectionActive = isActive;
        const shouldShow =
            isActive &&
            !hasProjectBeenSelected &&
            progress >= PROJECTS_TRANSITION.constellationRevealStart &&
            progress <= PROJECTS_TRANSITION.panelBoundaryEnd;

        if (!projectCue || shouldShow === isProjectCueVisible) {
            return;
        }

        isProjectCueVisible = shouldShow;
        projectCue.classList.toggle('is-visible', shouldShow);
    };

    const setProjectSelected = (selected: boolean): void => {
        if (!selected || hasProjectBeenSelected) {
            return;
        }
        hasProjectBeenSelected = true;
        updateProjectCue(projectCueProgress, isProjectsSectionActive);
    };

    const syncSmootherToTop = (): void => {
        smoother.scrollTop(0);
        (smoother as SmootherWithRender).render(0, true);
        ScrollTrigger.update();
    };

    const releaseSmootherAtTop = (): void => {
        syncSmootherToTop();
        world.setScrollVelocity(0);
        smoother.paused(false);
    };

    const syncNavigationToIntro = (): void => {
        document.querySelectorAll<HTMLElement>('[data-scroll]').forEach((link) => {
            const isIntroLink = link.dataset.scroll === sectionSelectors.intro;
            link.classList.toggle('active', isIntroLink);
            if (isIntroLink) {
                link.setAttribute('aria-current', 'location');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    };

    const finishContactLoopReset = (): void => {
        if (!isContactLoopTransitionComplete) {
            return;
        }

        isContactLoopResetting = false;
        world.setScrollLocked(false);
        releaseSmootherAtTop();
        syncNavigationToIntro();
        scrollCue.reveal();
    };

    const stopContactLoopMomentum = (event: Event): void => {
        if (!isContactLoopResetting) {
            return;
        }
        event.preventDefault();
    };

    const handleTextPosition = (progress: number): void => {
        world.updateTextTransform(progress, config);
    };

    const updateIntroBackground = (progress: number): void => {
        world.setBackgroundParticlesVisibility(
            smoothstep(
                rangeProgress(
                    progress,
                    INTRO_TRANSITION.backgroundStart,
                    INTRO_TRANSITION.backgroundEnd,
                ),
            ),
        );
    };

    const updateIntroColoredLight = (progress: number): void => {
        world.setColoredLightVisibility(
            smoothstep(
                rangeProgress(
                    progress,
                    INTRO_TRANSITION.coloredLightStart,
                    INTRO_TRANSITION.coloredLightEnd,
                ),
            ),
        );
    };

    const updateIntroEllipsis = (progress: number): void => {
        world.setEllipsisVisibility(
            smoothstep(
                rangeProgress(
                    progress,
                    INTRO_TRANSITION.backgroundStart,
                    INTRO_TRANSITION.backgroundEnd,
                ),
            ),
        );
    };

    const updateIntroMorph = (progress: number): void => {
        world.morphToShape(
            'cloud',
            'name',
            rangeProgress(progress, INTRO_TRANSITION.morphStart, INTRO_TRANSITION.morphEnd),
        );
    };

    const updateIntroText = (progress: number): void => {
        handleTextPosition(
            rangeProgress(
                progress,
                INTRO_TRANSITION.textPositionStart,
                INTRO_TRANSITION.textPositionEnd,
            ),
        );
    };

    const handleIntro = (progress: number, velocity: number): void => {
        world.setShootingStarsAppearance('experience', 0);
        scrollCue.update(progress, isContactLoopResetting);
        updateSoundCursorLabel(progress);
        world.setScrollProgress(progress);
        world.syncIntroCamera();
        world.setScrollVelocity(reduceMotion ? 0 : velocity);

        updateIntroBackground(progress);
        updateIntroColoredLight(progress);
        updateIntroEllipsis(progress);
        updateIntroMorph(progress);
        updateIntroText(progress);
        world.setMainParticlesOpacity(1);
        world.setMainParticlesDensity(1);
        world.setMainParticlesSparkle(1);
        world.setTunnelSpinStrength(0);
        world.setTunnelColorStrength(0);
    };

    const applyIntroVisualState = (): void => {
        contactTunnelTug.reset();
        world.setContactCameraActive(false);
        world.setScrollProgress(0);
        world.setScrollVelocity(0);
        world.syncIntroCamera();

        scrollCue.update(0, isContactLoopResetting);
        updateIntroBackground(0);
        updateIntroColoredLight(0);
        updateIntroEllipsis(0);
        updateIntroMorph(0);
        updateIntroText(0);

        world.setPortfolioConstellationReveal(0, true);
        world.setMainParticlesOpacity(1);
        world.setMainParticlesDensity(1);
        world.setMainParticlesSparkle(1);
        world.setTunnelSpinStrength(0);
        world.setTunnelColorStrength(0);

        world.setBackgroundParticlesVisibility(0);
        world.setColoredLightVisibility(0);
        world.setEllipsisVisibility(0);
        world.setShootingStarsAppearance('experience', 0);
    };

    const resetLoopToIntro = (): void => {
        if (isContactLoopResetting) {
            return;
        }

        isContactLoopResetting = true;
        isContactLoopTransitionComplete = false;
        sectionSnapSettlingCheck?.kill();
        sectionSnapSettlingCheck = undefined;
        sectionSnapTween?.kill();
        sectionSnapTween = undefined;
        if (contactTabs) {
            contactTabs.inert = true;
        }
        world.setScrollVelocity(0);
        cancelNavigationScroll();
        smoother.paused(true);
        world.setScrollLocked(true, false);
        world.setPortfolioConstellationReveal(0, true);
        world.setFade(0, true);
        world.beginContactLoopZoomOut();
        const contactLoopZoomDuration = reduceMotion ? 0.01 : useCompactMotion ? 0.8 : 1.15;
        const contactTabsFadeDelay = reduceMotion ? 0 : useCompactMotion ? 0.1 : 0.25;
        const contactTabsFadeDuration = Math.max(
            0.01,
            contactLoopZoomDuration * CONTACT_TRANSITION.loopBlackoutEnd - contactTabsFadeDelay,
        );
        contactLoopDomFadeTween?.kill();
        contactLoopDomFadeTween = gsap.to(contactTabs, {
            ...getContactTabsHiddenState(config),
            duration: contactTabsFadeDuration,
            delay: contactTabsFadeDelay,
            ease: 'power2.out',
            onComplete: () => {
                contactTabs?.setAttribute('aria-hidden', 'true');
                contactLoopDomFadeTween = undefined;
            },
        });
        contactLoopZoomTween?.kill();
        contactLoopZoomTween = gsap.fromTo(
            contactLoopZoom,
            {
                progress: 0,
            },
            {
                progress: 1,
                duration: contactLoopZoomDuration,
                ease: 'power3.in',
                onUpdate: () => {
                    const blackoutProgress = smoothstep(
                        rangeProgress(
                            contactLoopZoom.progress,
                            CONTACT_TRANSITION.loopBlackoutStart,
                            CONTACT_TRANSITION.loopBlackoutEnd,
                        ),
                    );

                    world.setFade(blackoutProgress, true);
                    if (!reduceMotion) {
                        world.updateContactLoopZoomOut(contactLoopZoom.progress);
                    }
                },
                onComplete: () => {
                    world.setFade(1, true);
                    if (contactTabs) {
                        gsap.set(contactTabs, getContactTabsHiddenState(config));
                    }
                    contactLoopDomFadeTween?.kill();
                    contactLoopDomFadeTween = undefined;
                    contactLoopZoomTween?.kill();
                    contactLoopZoomTween = undefined;
                    contactLoopZoom.progress = 0;

                    applyIntroVisualState();
                    world.startIntroReveal(() => {
                        isContactLoopTransitionComplete = true;
                        finishContactLoopReset();
                        const callbacks = Array.from(contactLoopCompletionCallbacks);
                        contactLoopCompletionCallbacks.clear();
                        callbacks.forEach((callback) => callback());
                    });
                    syncSmootherToTop();
                },
            },
        );
    };

    let contactTunnelTug: ContactTunnelTug = {
        setInputActive: () => {},
        setProgress: () => {},
        shouldHoldCamera: () => false,
        reset: () => {},
    };
    let contactInteractionsPromise: Promise<void> | undefined;
    const initContactInteractions = (): Promise<void> => {
        contactInteractionsPromise ??= import('../contact/createContactTunnelTug')
            .then(({ default: createContactTunnelTug }) => {
                contactTunnelTug = createContactTunnelTug({
                    world,
                    reduceMotion,
                    isCompact: config.isCompact,
                    isResetting: () => isContactLoopResetting,
                    onResetInput: stopContactLoopMomentum,
                    onCommit: resetLoopToIntro,
                });
            })
            .catch((error) => {
                contactInteractionsPromise = undefined;
                throw error;
            });
        return contactInteractionsPromise;
    };

    const syncContactCameraOwnership = (
        isActive: boolean,
        progress: number,
        refresh = false,
    ): void => {
        const ownsContactInput = isActive || contactTunnelTug.shouldHoldCamera(progress);

        contactTunnelTug.setInputActive(ownsContactInput);
        if (refresh && ownsContactInput) {
            world.syncContactCamera(progress);
        } else {
            world.setContactCameraActive(ownsContactInput);
        }

        if (isActive) {
            setProjectPanelBoundaryActive(false, true);
        }
    };

    const handleExperience = (progress: number, _eased: number): void => {
        const shootingStarsVisibility =
            smoothstep(rangeProgress(progress, 0.14, 0.26)) *
            (1 - smoothstep(rangeProgress(progress, 0.74, 0.86)));
        world.setShootingStarsAppearance('experience', shootingStarsVisibility);

        if (progress < experienceTransition.educationStart) {
            world.morphToShape(
                'name',
                'experience',
                rangeProgress(
                    progress,
                    experienceTransition.nameStart,
                    experienceTransition.nameEnd,
                ),
            );
        } else {
            world.morphToShape(
                'experience',
                'education',
                rangeProgress(
                    progress,
                    experienceTransition.educationStart,
                    experienceTransition.educationEnd,
                ),
            );
        }
    };

    const handleProjects = (progress: number, _eased: number, _velocity = 0): void => {
        const shootingStarsVisibility =
            smoothstep(rangeProgress(progress, 0.72, 0.84)) *
            (1 - smoothstep(rangeProgress(progress, 0.92, 0.975)));
        world.setShootingStarsAppearance('projects', shootingStarsVisibility);

        setProjectPanelBoundaryActive(
            progress >= PROJECTS_TRANSITION.panelBoundaryStart &&
                progress <= PROJECTS_TRANSITION.panelBoundaryEnd,
        );

        const textLowerProgress = rangeProgress(
            progress,
            config.isMobile ? MOBILE_PROJECTS_TEXT_LOWER.start : PROJECTS_TRANSITION.textLowerStart,
            config.isMobile ? MOBILE_PROJECTS_TEXT_LOWER.end : PROJECTS_TRANSITION.textLowerEnd,
        );
        const zoomProgress = rangeProgress(
            progress,
            PROJECTS_TRANSITION.zoomStart,
            PROJECTS_TRANSITION.zoomEnd,
        );

        world.updateProjectsCamera(zoomProgress);
        const projectsLightVisibility =
            1 -
            smoothstep(
                rangeProgress(
                    progress,
                    PROJECTS_TRANSITION.coloredLightHideStart,
                    PROJECTS_TRANSITION.coloredLightHideEnd,
                ),
            );
        const mainParticlesDim = smoothstep(
            rangeProgress(
                progress,
                PROJECTS_TRANSITION.mainParticlesDimStart,
                PROJECTS_TRANSITION.mainParticlesDimEnd,
            ),
        );
        const mainParticlesIntensity =
            1 - PROJECTS_TRANSITION.mainParticlesDimAmount * mainParticlesDim;
        const mainParticlesSparkle =
            1 - (1 - PROJECTS_TRANSITION.contactSparkle) * mainParticlesDim;

        world.setBackgroundParticlesVisibility(projectsLightVisibility);
        world.setColoredLightVisibility(projectsLightVisibility);
        world.setEllipsisVisibility(projectsLightVisibility);
        world.setMainParticlesOpacity(mainParticlesIntensity);
        world.setMainParticlesDensity(mainParticlesIntensity);
        world.setMainParticlesSparkle(mainParticlesSparkle);
        world.setTunnelSpinStrength(0);
        world.setTunnelColorStrength(0);
        const constellationReveal =
            smoothstep(
                rangeProgress(
                    progress,
                    PROJECTS_TRANSITION.constellationRevealStart,
                    PROJECTS_TRANSITION.constellationRevealEnd,
                ),
            ) *
            (1 -
                smoothstep(
                    rangeProgress(progress, PROJECTS_TRANSITION.constellationFadeOutStart, 1),
                ));
        world.setPortfolioConstellationReveal(constellationReveal);
        const constellationScrollProgress = rangeProgress(
            progress,
            PROJECTS_TRANSITION.panelBoundaryStart,
            PROJECTS_TRANSITION.panelBoundaryEnd,
        );

        world.setPortfolioConstellationScrollProgress(constellationScrollProgress);
        world.setActivePortfolioProjectByScroll(constellationScrollProgress);

        if (progress < PROJECTS_TRANSITION.cloudMorphStart) {
            world.morphToShape(
                'education',
                'projects',
                rangeProgress(
                    progress,
                    config.isMobile ? MOBILE_PROJECTS_MORPH.start : 0,
                    config.isMobile ? MOBILE_PROJECTS_MORPH.end : 0.2,
                ),
            );
        } else {
            world.morphToShape(
                'projects',
                'cloud',
                rangeProgress(
                    progress,
                    PROJECTS_TRANSITION.cloudMorphStart,
                    PROJECTS_TRANSITION.cloudMorphEnd,
                ),
            );
        }

        handleTextPosition(1 - textLowerProgress);
    };

    const handleContact = (progress: number, _eased: number): void => {
        contactTunnelTug.setProgress(progress);
        if (isContactLoopResetting) {
            return;
        }

        world.setShootingStarsAppearance('projects', 0);
        world.updateContactCamera(progress);
        world.setBackgroundParticlesVisibility(0);
        world.setColoredLightVisibility(0);
        world.setEllipsisVisibility(0);
        world.setMainParticlesSparkle(PROJECTS_TRANSITION.contactSparkle);

        world.setTunnelColorStrength(
            smoothstep(
                rangeProgress(
                    progress,
                    CONTACT_TRANSITION.tunnelColorStart,
                    CONTACT_TRANSITION.tunnelColorEnd,
                ),
            ),
        );
        world.setTunnelSpinStrength(
            smoothstep(
                rangeProgress(
                    progress,
                    CONTACT_TRANSITION.tunnelSpinStart,
                    CONTACT_TRANSITION.tunnelSpinEnd,
                ),
            ),
        );
        world.morphToShape(
            'cloud',
            'tunnel',
            smoothstep(rangeProgress(progress, 0, CONTACT_TRANSITION.tunnelMorphEnd)),
        );

        const mainParticlesPresence = smoothstep(
            rangeProgress(
                progress,
                CONTACT_TRANSITION.mainParticlesRestoreStart,
                CONTACT_TRANSITION.mainParticlesRestoreEnd,
            ),
        );
        const constellationFadeOutEnd = useFastNavigationConstellationFadeOut
            ? CONTACT_TRANSITION.navigationConstellationFadeOutEnd
            : CONTACT_TRANSITION.mainParticlesRestoreEnd;
        const constellationFadeOutComplete = progress >= constellationFadeOutEnd;

        if (progress >= CONTACT_TRANSITION.mainParticlesRestoreEnd) {
            useFastNavigationConstellationFadeOut = false;
        }

        const mainParticlesIntensity = gsap.utils.interpolate(
            PROJECTS_TRANSITION.contactStartIntensity,
            1,
            mainParticlesPresence,
        );

        world.setPortfolioConstellationReveal(0, constellationFadeOutComplete);
        world.setMainParticlesOpacity(mainParticlesIntensity);
        world.setMainParticlesDensity(mainParticlesIntensity);
    };

    const getSectionLink = (section: SectionId): Element | null =>
        document.querySelector(`[data-scroll="${sectionSelectors[section]}"]`);
    const introLink = getSectionLink('intro');

    const syncSectionLinkActiveState = (
        section: SectionId,
        target: Element | null,
        isActive: boolean,
    ): void => {
        const isAtSectionBoundary =
            section === 'intro'
                ? smoother.scrollTop() <= 0
                : section === 'contact' &&
                  smoother.scrollTop() >= getScrollSmootherMaxScroll(smoother) - 1;
        const isCurrent = isActive || isAtSectionBoundary;

        target?.classList.toggle('active', isCurrent);
        if (isCurrent) {
            document
                .querySelectorAll('[data-scroll][aria-current]')
                .forEach((link) => link.removeAttribute('aria-current'));
            target?.setAttribute('aria-current', 'location');
        } else {
            target?.removeAttribute('aria-current');
        }
    };

    const updateSection = (
        section: SectionId,
        target: Element | null,
        progress: number,
        isActive: boolean,
        velocity = 0,
    ): void => {
        if (isContactLoopResetting && section !== 'intro') {
            return;
        }

        if (isActive && section !== 'intro') {
            introLink?.classList.remove('active');
        }

        const eased = ease(progress);

        switch (section) {
            case 'intro':
                handleIntro(progress, reduceMotion || !isActive ? 0 : velocity);
                syncSectionLinkActiveState(section, target, isActive);
                break;
            case 'experience':
                if (isActive) {
                    handleTextPosition(1);
                }
                handleExperience(progress, eased);
                break;
            case 'projects':
                handleProjects(progress, eased);
                updateProjectCue(progress, isActive);
                break;
            case 'contact':
                handleContact(progress, eased);
                syncSectionLinkActiveState(section, target, isActive);
                break;
        }
    };

    const initScrollTriggers = (): (() => void) | undefined => {
        const projectsFullyInteractiveProgress = Math.max(
            PROJECTS_TRANSITION.constellationRevealEnd,
            PROJECTS_TRANSITION.panelBoundaryStart,
        );
        const getSectionSnapTarget = (): number | undefined => {
            const projectsTrigger = ScrollTrigger.getById('projects');
            const contactTrigger = ScrollTrigger.getById('contact');
            const contactFormRevealTrigger = ScrollTrigger.getById(CONTACT_FORM_REVEAL_TRIGGER_ID);

            if (!projectsTrigger) {
                return undefined;
            }

            const projectsProgress = projectsTrigger?.progress ?? 0;
            const projectsDirection = projectsTrigger?.direction ?? 0;
            const constellationTarget = gsap.utils.interpolate(
                projectsTrigger.start,
                projectsTrigger.end,
                projectsFullyInteractiveProgress,
            );

            if (config.isMobile && contactTrigger?.isActive === true) {
                return contactTrigger.progress >= CONTACT_TRANSITION.cameraZoomInEnd
                    ? getScrollSmootherMaxScroll(smoother)
                    : constellationTarget;
            }

            const shouldSnapForward =
                projectsTrigger?.isActive === true &&
                projectsDirection > 0 &&
                projectsProgress >= PROJECTS_TRANSITION.constellationRevealStart &&
                projectsProgress < projectsFullyInteractiveProgress;
            const shouldSnapBackThroughProjects =
                projectsTrigger?.isActive === true &&
                projectsDirection < 0 &&
                projectsProgress > projectsFullyInteractiveProgress;
            const shouldSnapFromContact =
                contactTrigger?.isActive === true &&
                contactTrigger.direction < 0 &&
                contactTrigger.progress < CONTACT_TRANSITION.mainParticlesRestoreEnd;
            const contactFormBlur = contactTabs
                ? getComputedStyle(contactTabs).filter.match(/blur\(([\d.]+)px\)/)
                : null;
            const isContactFormBlurred =
                contactFormBlur !== null && Number.parseFloat(contactFormBlur[1]) > 0.1;
            const shouldSnapToContactEnd =
                contactTrigger?.isActive === true &&
                contactTrigger.direction > 0 &&
                (isContactFormBlurred || contactFormRevealTrigger?.isActive === true);

            if (shouldSnapToContactEnd) {
                return getScrollSmootherMaxScroll(smoother);
            }

            if (!shouldSnapForward && !shouldSnapBackThroughProjects && !shouldSnapFromContact) {
                return undefined;
            }

            return constellationTarget;
        };
        const snapSectionTransition = (scrollTop: number): void => {
            if (
                reduceMotion ||
                isContactLoopResetting ||
                smoother.paused() ||
                sectionSnapTween?.isActive()
            ) {
                return;
            }

            sectionSnapTween = gsap.to(smoother, {
                scrollTop,
                duration: useCompactMotion ? 0.8 : 1.2,
                ease: 'power2.inOut',
                overwrite: 'auto',
                onComplete: () => {
                    sectionSnapTween = undefined;
                },
                onInterrupt: () => {
                    sectionSnapTween = undefined;
                },
            });
        };
        const scheduleSectionSnap = (): void => {
            sectionSnapSettlingCheck?.kill();
            sectionSnapSettlingCheck = undefined;

            if (reduceMotion) {
                return;
            }

            sectionSnapSettlingCheck = gsap.delayedCall(useCompactMotion ? 1 : 1.4, () => {
                sectionSnapSettlingCheck = undefined;
                if (isContactLoopResetting || smoother.paused()) {
                    return;
                }

                const scrollTop = getSectionSnapTarget();
                if (scrollTop === undefined) {
                    return;
                }
                snapSectionTransition(scrollTop);
            });
        };

        const navigationTargets = new Map<SectionId, Element | null>();
        for (const section of sectionIds) {
            const target = getSectionLink(section);
            navigationTargets.set(section, target ?? null);
            target?.addEventListener('click', () => {
                useFastNavigationConstellationFadeOut =
                    section === 'contact' && ScrollTrigger.getById('projects')?.isActive === true;
            });
        }

        const initializedSections = new Set<SectionId>();
        const approachingObservers = new Map<SectionId, IntersectionObserver>();
        const createSectionTrigger = (section: SectionId): void => {
            approachingObservers.get(section)?.disconnect();
            approachingObservers.delete(section);

            if (initializedSections.has(section)) {
                return;
            }
            initializedSections.add(section);

            const target = navigationTargets.get(section) ?? null;

            const trigger = ScrollTrigger.create({
                id: section,
                trigger: getSectionSelector(section),
                start: section === 'intro' ? 'top top' : 'top bottom',
                end: 'bottom bottom',
                fastScrollEnd: true,
                scrub: 1,
                onUpdate: ({ progress, isActive, getVelocity }) => {
                    updateSection(section, target, progress, isActive, getVelocity());
                },
                onRefresh: ({ progress, isActive }) => {
                    syncSectionLinkActiveState(section, target, isActive);

                    const holdsContactCamera =
                        section === 'contact' && contactTunnelTug.shouldHoldCamera(progress);

                    if (
                        isActive ||
                        holdsContactCamera ||
                        (section === 'intro' && progress === 0 && smoother.scrollTop() <= 0)
                    ) {
                        updateSection(section, target, progress, isActive);

                        if (section === 'contact') {
                            syncContactCameraOwnership(isActive, progress, true);
                        } else if (section === 'projects') {
                            world.syncProjectsCamera();
                        }
                    }
                },
                onToggle: ({ isActive, progress }) => {
                    syncSectionLinkActiveState(section, target, isActive);

                    if (section === 'projects') {
                        world.setProjectsCameraActive(isActive);
                        updateProjectCue(progress, isActive);
                        if (!isActive) {
                            setProjectPanelBoundaryActive(false, true);
                        }
                    } else if (section === 'contact') {
                        syncContactCameraOwnership(isActive, progress);
                    }
                },
            });

            syncSectionLinkActiveState(section, target, trigger.isActive);
        };

        const initializeWhenApproaching = (section: SectionId): void => {
            const element = document.querySelector<HTMLElement>(getSectionSelector(section));
            if (!element || !('IntersectionObserver' in window)) {
                createSectionTrigger(section);
                return;
            }

            const observer = new IntersectionObserver(
                (entries) => {
                    if (!entries.some((entry) => entry.isIntersecting)) {
                        return;
                    }

                    observer.disconnect();
                    createSectionTrigger(section);
                },
                { rootMargin: '100% 0px' },
            );
            observer.observe(element);
            approachingObservers.set(section, observer);
        };

        const initializeRemaining = config.isMobile
            ? () => {
                  createSectionTrigger('projects');
                  createSectionTrigger('contact');
              }
            : undefined;

        if (config.isMobile) {
            createSectionTrigger('intro');
            createSectionTrigger('experience');
            initializeWhenApproaching('projects');
            initializeWhenApproaching('contact');
        } else {
            sectionIds.forEach(createSectionTrigger);
        }

        window.addEventListener('wheel', scheduleSectionSnap, { passive: true });
        window.addEventListener('touchmove', scheduleSectionSnap, { passive: true });
        window.addEventListener('keydown', scheduleSectionSnap, { passive: true });
        ScrollTrigger.addEventListener('scrollEnd', scheduleSectionSnap);

        return initializeRemaining;
    };

    return {
        initContactInteractions,
        initScrollTriggers,
        releaseSmootherAtTop,
        setProjectSelected,
        transitionContactToIntro(onComplete?: () => void): boolean {
            const contactTrigger = ScrollTrigger.getById('contact');
            const isAtContact =
                isContactLoopResetting ||
                contactTrigger?.isActive === true ||
                smoother.scrollTop() >= getScrollSmootherMaxScroll(smoother) - 1;

            if (!isAtContact) {
                return false;
            }

            if (onComplete) {
                contactLoopCompletionCallbacks.add(onComplete);
            }
            resetLoopToIntro();
            return true;
        },
    };
};
