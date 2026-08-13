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
import { createSectionTransitions } from './sections/transitions/createSectionTransitions';
import { sectionSelectors } from './sections/sectionIds';
import { yieldToMainThread } from './utils/yieldToMainThread';

declare global {
    interface Window {
        __portfolioStartup?: {
            fail: () => void;
            succeed: () => void;
        };
    }
}

const experienceLayoutClass = 'startup-layout-staged-experience';
const contactLayoutClass = 'startup-layout-staged-contact';
const documentElement = document.documentElement;
documentElement.classList.add(experienceLayoutClass, contactLayoutClass);

const smoothWrapper = document.querySelector<HTMLElement>('#smooth-wrapper');
const contactTabs = document.querySelector<HTMLElement>('.contact-tabs');
const experienceSection = document.querySelector<HTMLElement>(sectionSelectors.experience);
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

const releaseStagedLayout = async (
    className: string,
    element: HTMLElement | null,
): Promise<void> => {
    documentElement.classList.remove(className);
    await yieldToMainThread();
    element?.getBoundingClientRect();
    await yieldToMainThread();
};

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

    const initialViewportSize = {
        width: Math.max(1, canvas.clientWidth),
        height: Math.max(1, canvas.clientHeight),
    };
    const responsiveConfig = refreshResponsiveConfig(window.innerWidth, initialViewportSize.height);

    const world = new World(canvas, responsiveConfig, {
        initialViewportSize,
        onSceneBuildStart: () => setLoadingPhase('scene'),
    });
    await world.ready;
    await yieldToMainThread();

    if (import.meta.env.DEV) {
        const { initDebugGui } = await import('./debug/initDebugGui');
        const debugGui = initDebugGui(world.getDebugTargets());
        import.meta.hot?.dispose(() => debugGui.destroy());
    }

    setLoadingPhase('finalizing');
    await introFontReady;
    documentElement.classList.add('intro-font-ready');
    await yieldToMainThread();

    await releaseStagedLayout(experienceLayoutClass, experienceSection);
    await releaseStagedLayout(contactLayoutClass, contactTabs);

    const soundControls = initSoundControls(responsiveConfig.reducedMotion);
    await yieldToMainThread();
    const { initSmoother } = await import('./app/initSmoother');
    const smoother = initSmoother(responsiveConfig);
    smoother.paused(true);
    await yieldToMainThread();

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
    if (responsiveConfig.hasFinePointer) {
        await initializeCursor();
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
        if (sectionTransitions.transitionContactToIntro(navigateToExperience)) {
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

    const { createIntroTextAnimation } =
        await import('./sections/transitions/createSectionTextAnimations');
    createIntroTextAnimation(responsiveConfig);
    await yieldToMainThread();
    sectionTransitions.initScrollTriggers();
    await yieldToMainThread();

    const loadContactFeatures = createFeatureLoader('contact interactions', async () => {
        const contactTextAnimationModule =
            import('./sections/transitions/createContactTextAnimation');
        const contactTabsModule = import('./sections/contact/contactTabs');
        const contactFormModule = import('./sections/contact/contactForm');
        const recommendationWallModule = import('./sections/contact/initRecommendationWallEvents');
        const [
            ,
            ,
            { createContactTextAnimation },
            { initContactTabs },
            { initContactForm },
            { initRecommendationWallEvents },
        ] = await Promise.all([
            world.ready,
            sectionTransitions.initContactInteractions(),
            contactTextAnimationModule,
            contactTabsModule,
            contactFormModule,
            recommendationWallModule,
        ]);
        initContactTabs();
        initContactForm();
        initRecommendationWallEvents(responsiveConfig);
        createContactTextAnimation(contactTabs, responsiveConfig, smoother);
    });

    const initializeRemainingSections = async (): Promise<void> => {
        const loadExperienceAnimations = createFeatureLoader('experience animations', async () => {
            const { initExperienceAnimations } =
                await import('./sections/experience/initExperienceAnimations');
            initExperienceAnimations(responsiveConfig);
        });

        const loadProjectInteractions = createFeatureLoader('project interactions', async () => {
            const projectModules = Promise.all([
                import('./sections/projects/createProjectPreviewCard'),
                import('./sections/projects/createProjectDetailsPanel'),
            ]);

            await world.preparePortfolioConstellation();
            await yieldToMainThread();
            const [{ default: createProjectPreviewCard }, { default: createProjectDetailsPanel }] =
                await projectModules;

            projectPreviewCard = createProjectPreviewCard(world, responsiveConfig);
            await yieldToMainThread();
            projectDetailsPanel = createProjectDetailsPanel(
                world,
                responsiveConfig,
                selectedProject,
            );
            await yieldToMainThread();
            world.setPortfolioProjectPreviewHandler((state) => {
                projectPreviewCard?.update(state);
                sectionTransitions.setProjectSelected(Boolean(state.selectedProject));
            });
        });
        loadProjectFeatures = loadProjectInteractions;

        await loadExperienceAnimations();
        await yieldToMainThread();
        await loadProjectInteractions();
        await yieldToMainThread();
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
    ScrollTrigger.refresh();
    await yieldToMainThread();
    world.prepareForReveal();
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
    documentElement.classList.remove(experienceLayoutClass, contactLayoutClass);
    console.error('Failed to initialize the portfolio experience', error);
    window.__portfolioStartup?.fail();
} finally {
    window.clearTimeout(slowConnectionTimeout);
    finishLoadingPhases();
}
