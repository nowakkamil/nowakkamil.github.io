import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import { completeLoadingScreen } from './app/completeLoadingScreen';
import { createScrollCue } from './app/createScrollCue';
import { initNavigation } from './app/initNavigation';
import { createLoadingPhaseController } from './app/loadingPhase';
import { getScrollSmootherMaxScroll } from './app/navigation/getScrollSmootherMaxScroll';
import { registerGsap } from './app/registerGsap';
import { refreshResponsiveConfig } from './app/responsiveConfig';
import { initSoundControls } from './app/initSoundControls';
import type {
    PortfolioProject,
    PortfolioProjectPreviewState,
} from './sections/projects/portfolioConstellation';
import { createIntroTextAnimation } from './sections/transitions/createSectionTextAnimations';
import { createSectionTransitions } from './sections/transitions/createSectionTransitions';
import { initSmoother } from './app/initSmoother';
import { sectionSelectors } from './sections/sectionIds';

declare global {
    interface Window {
        __portfolioStartup?: {
            fail: () => void;
            succeed: () => void;
        };
    }
}

const smoothWrapper = document.querySelector<HTMLElement>('#smooth-wrapper');
const contactTabs = document.querySelector<HTMLElement>('.contact-tabs');
const introFontReady =
    document.fonts?.load('300 1.8rem Urbanist').catch(() => []) ?? Promise.resolve([]);

if (smoothWrapper && contactTabs) {
    smoothWrapper.after(contactTabs);
}

const loadingScreen = document.querySelector<HTMLElement>('#loading-screen');
const { setLoadingPhase, finish: finishLoadingPhases } =
    createLoadingPhaseController(loadingScreen);

setLoadingPhase('preparing');
const slowConnectionTimeout = window.setTimeout(() => {
    setLoadingPhase('slow');
}, 12_000);

try {
    setLoadingPhase('assets');
    const [{ World }] = await Promise.all([import('./world/World'), import('./app/initStyles')]);

    registerGsap();

    const createFeatureLoader = (
        featureName: string,
        initialize: () => Promise<void>,
    ): (() => Promise<void>) => {
        let initialization: Promise<void> | undefined;

        return (): Promise<void> => {
            if (!initialization) {
                initialization = initialize().catch((error) => {
                    console.error(`Failed to initialize ${featureName}`, error);
                });
            }

            return initialization;
        };
    };

    const canvas = document.querySelector<HTMLCanvasElement>('.webgl');
    if (!canvas) {
        throw new Error('Canvas .webgl not found');
    }

    const responsiveConfig = refreshResponsiveConfig(window.innerWidth, canvas.clientHeight);

    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
    });
    const world = new World(canvas, responsiveConfig, {
        onSceneBuildStart: () => setLoadingPhase('scene'),
    });
    await world.ready;

    if (import.meta.env.DEV) {
        const { initDebugGui } = await import('./debug/initDebugGui');
        const debugGui = initDebugGui(world.getDebugTargets());
        import.meta.hot?.dispose(() => debugGui.destroy());
    }

    setLoadingPhase('finalizing');
    await introFontReady;
    document.documentElement.classList.add('intro-font-ready');

    const soundControls = initSoundControls(responsiveConfig.reducedMotion);
    const smoother = initSmoother(responsiveConfig);
    smoother.paused(true);

    let cursor: { update: (delta: number, elapsed: number) => void } | undefined;
    let cursorInitialization: Promise<void> | undefined;
    const initializeCursor = (): Promise<void> => {
        if (cursorInitialization) {
            return cursorInitialization;
        }

        cursorInitialization = import('./world/systems/CursorSystem').then(({ CursorSystem }) => {
            cursor = new CursorSystem(
                soundControls.cursorLabel,
                document.querySelector<HTMLElement>('.project-cue') ?? undefined,
                {
                    getPosition: () => smoother.scrollTop(),
                    setPosition: (position) => smoother.scrollTop(position),
                    getMaxPosition: () => getScrollSmootherMaxScroll(smoother),
                },
            );
        });
        return cursorInitialization;
    };
    const initializeCursorFromPointer = (): void => {
        window.removeEventListener('pointermove', initializeCursorFromPointer);
        window.removeEventListener('pointerdown', initializeCursorFromPointer);
        initializeCursor();
    };
    if (responsiveConfig.hasFinePointer) {
        window.addEventListener('pointermove', initializeCursorFromPointer, {
            passive: true,
        });
        window.addEventListener('pointerdown', initializeCursorFromPointer, {
            passive: true,
        });
    }

    const smootherContentElement = smoother.content() as HTMLElement;
    const reduceMotion = responsiveConfig.reducedMotion;

    type ProjectPreviewCard = {
        update: (state: PortfolioProjectPreviewState) => void;
        hide: (immediate?: boolean) => void;
    };
    type ProjectDetailsPanel = {
        hide: (immediate?: boolean) => void;
    };

    let projectPreviewCard: ProjectPreviewCard | undefined;
    let projectDetailsPanel: ProjectDetailsPanel | undefined;
    let selectedProject: PortfolioProject | undefined;
    let loadProjectFeatures: (() => Promise<void>) | undefined;

    world.addPortfolioProjectSelectionListener((project) => {
        selectedProject = project;
    });

    const navigation = initNavigation(smoother, responsiveConfig, () => {
        void loadProjectFeatures?.();
    });

    const scrollCue = createScrollCue(reduceMotion);
    const sectionTransitions = createSectionTransitions({
        world,
        smoother,
        config: responsiveConfig,
        contactTabs,
        scrollCue,
        updateSoundCursorLabel: soundControls.updateCursorLabel,
        cancelNavigationScroll: navigation.cancelActiveScroll,
        projectPreviewCard: {
            hide: (immediate) => projectPreviewCard?.hide(immediate),
        },
        projectDetailsPanel: {
            hide: (immediate) => projectDetailsPanel?.hide(immediate),
        },
    });
    const skipLink = document.querySelector<HTMLAnchorElement>('.skip-link');
    const experienceSection = document.querySelector<HTMLElement>(sectionSelectors.experience);
    const experienceNavigationLink = document.querySelector<HTMLAnchorElement>(
        `[data-scroll="${sectionSelectors.experience}"]`,
    );
    const focusExperienceSection = (): void => {
        experienceSection?.focus({ preventScroll: true });
    };
    const navigateToExperience = (): void => {
        if (!experienceNavigationLink) {
            focusExperienceSection();
            return;
        }

        if (experienceNavigationLink.classList.contains('active')) {
            focusExperienceSection();
            return;
        }

        const focusAfterScroll = (): void => {
            if (!experienceNavigationLink.classList.contains('active')) {
                return;
            }

            ScrollTrigger.removeEventListener('scrollEnd', focusAfterScroll);
            focusExperienceSection();
        };

        ScrollTrigger.addEventListener('scrollEnd', focusAfterScroll);
        experienceNavigationLink.click();
    };
    const activateSkipLink = (): void => {
        if (
            sectionTransitions.transitionContactToIntro(() => {
                requestAnimationFrame(navigateToExperience);
            })
        ) {
            return;
        }

        navigateToExperience();
    };

    skipLink?.addEventListener('click', (event) => {
        event.preventDefault();
        activateSkipLink();
    });
    skipLink?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        activateSkipLink();
    });

    createIntroTextAnimation(responsiveConfig);
    const initRemainingScrollTriggers = sectionTransitions.initScrollTriggers();
    const initializeRemainingSections = async (): Promise<void> => {
        const loadExperienceAnimations = createFeatureLoader('experience animations', async () => {
            const { initExperienceAnimations } =
                await import('./sections/experience/initExperienceAnimations');
            initExperienceAnimations(responsiveConfig);
        });

        const loadProjectInteractions = createFeatureLoader('project interactions', async () => {
            initRemainingScrollTriggers?.();
            const projectModules = Promise.all([
                import('./sections/projects/createProjectPreviewCard'),
                import('./sections/projects/createProjectDetailsPanel'),
            ]);
            await world.preparePortfolioConstellation();
            const [{ default: createProjectPreviewCard }, { default: createProjectDetailsPanel }] =
                await projectModules;

            projectPreviewCard = createProjectPreviewCard(world, reduceMotion);
            projectDetailsPanel = createProjectDetailsPanel(
                world,
                responsiveConfig,
                selectedProject,
            );
            world.setPortfolioProjectPreviewHandler((state) => {
                projectPreviewCard?.update(state);
                sectionTransitions.setProjectSelected(Boolean(state.selectedProject));
            });
        });
        loadProjectFeatures = loadProjectInteractions;

        const loadContactFeatures = createFeatureLoader('contact interactions', async () => {
            initRemainingScrollTriggers?.();
            const [
                ,
                ,
                { createContactTextAnimation },
                { initContactTabs },
                { initContactForm },
                { initRecommendationWallEvents },
                { createSocialLinks },
            ] = await Promise.all([
                world.ready,
                sectionTransitions.initContactInteractions(),
                import('./sections/transitions/createContactTextAnimation'),
                import('./sections/contact/contactTabs'),
                import('./sections/contact/contactForm'),
                import('./sections/contact/initRecommendationWallEvents'),
                import('./sections/contact/createSocialLinks'),
            ]);
            createSocialLinks();
            initContactTabs();
            initContactForm();
            initRecommendationWallEvents(responsiveConfig);
            createContactTextAnimation(contactTabs, responsiveConfig, smoother);
        });

        await loadExperienceAnimations();
        await loadProjectInteractions();
        await loadContactFeatures();
    };

    const revealLoadedPage = (): void => {
        if (smootherContentElement) {
            smootherContentElement.style.opacity = '1';
        }

        const nav = document.getElementsByTagName('nav')[0];
        if (nav) {
            nav.removeAttribute('style');
        }
    };

    if (document.readyState === 'complete') {
        revealLoadedPage();
    } else {
        window.addEventListener('load', revealLoadedPage, { once: true });
    }

    const links = gsap.utils.toArray<HTMLElement>('[data-scroll]');
    const introLink = links.find((link) => link.dataset.scroll === sectionSelectors.intro);
    introLink?.classList.add('active');

    const useCompactMotion = responsiveConfig.isCompact || responsiveConfig.hasCoarsePointer;
    const animateNavigation = (): void => {
        gsap.fromTo(
            links,
            {
                y: reduceMotion || responsiveConfig.isMobile ? 0 : '-2vh',
            },
            {
                opacity: (_, link: HTMLElement) => (link.classList.contains('active') ? 0.9 : 0.5),
                y: 0,
                stagger: {
                    each: reduceMotion ? 0 : 0.5,
                },
                duration: reduceMotion ? 0.01 : useCompactMotion ? 0.65 : 1,
                ease: 'sine',
                delay: reduceMotion ? 0 : 1,
                onComplete: () =>
                    links.forEach((element) => {
                        element.removeAttribute('style');
                        return element.classList.add('animated');
                    }),
            },
        );
    };

    const updateWorld = (time: number, deltaTime: number): void => {
        const deltaSeconds = deltaTime / 1000;
        world.update(deltaSeconds, time);
        cursor?.update(deltaSeconds, time);
    };

    await initializeRemainingSections();
    finishLoadingPhases();
    await completeLoadingScreen(loadingScreen);
    window.__portfolioStartup?.succeed();

    gsap.ticker.add(updateWorld);
    animateNavigation();
    world.startIntroReveal(() => {
        sectionTransitions.releaseSmootherAtTop();
        navigation.setReady();
        scrollCue.setReady();
        scrollCue.reveal();
    });
} catch (error) {
    console.error('Failed to initialize the portfolio experience', error);
    window.__portfolioStartup?.fail();
} finally {
    window.clearTimeout(slowConnectionTimeout);
    finishLoadingPhases();
}
