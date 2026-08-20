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

const waitForInitialLoaderPaint = (): Promise<void> =>
    new Promise((resolve) => {
        requestAnimationFrame(() => window.setTimeout(resolve, 0));
    });

const smoothWrapper = document.querySelector<HTMLElement>('#smooth-wrapper');
const contactTabs = document.querySelector<HTMLElement>('.contact-tabs');
const experienceSection = document.querySelector<HTMLElement>(sectionSelectors.experience);
const introFontReady =
    document.fonts?.load('300 1.8rem Urbanist').catch(() => []) ?? Promise.resolve([]);
const allFontsReady = document.fonts?.ready.catch(() => undefined) ?? Promise.resolve(undefined);

const loadingScreen = document.querySelector<HTMLElement>('#loading-screen');
const { setLoadingPhase, finish: finishLoadingPhases } =
    createLoadingPhaseController(loadingScreen);

setLoadingPhase('preparing');
const slowConnectionTimeout = window.setTimeout(() => {
    setLoadingPhase('slow');
}, 12_000);

await waitForInitialLoaderPaint();

if (smoothWrapper && contactTabs) {
    smoothWrapper.after(contactTabs);
}

const releaseStagedLayouts = async (
    layouts: readonly { className: string; element: HTMLElement | null }[],
): Promise<void> => {
    layouts.forEach(({ className }) => documentElement.classList.remove(className));
    await yieldToMainThread();
    layouts.forEach(({ element }) => element?.getBoundingClientRect());
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
    await Promise.all([introFontReady, allFontsReady]);
    documentElement.classList.add('intro-font-ready');
    await yieldToMainThread();

    await releaseStagedLayouts([
        { className: experienceLayoutClass, element: experienceSection },
        { className: contactLayoutClass, element: contactTabs },
    ]);

    let soundCursorCueVisibility = 1;
    let scrollCursorCueVisibility = 0;
    let cursor:
        | {
              setProjectCueVisible: (visible: boolean) => void;
              setScrollCueVisibility: (visibility: number) => void;
              setSoundCueVisibility: (visibility: number) => void;
              update: (delta: number, elapsed: number) => void;
          }
        | undefined;
    const soundControls = initSoundControls((visibility) => {
        soundCursorCueVisibility = visibility;
        cursor?.setSoundCueVisibility(visibility);
    });
    await yieldToMainThread();
    const { initSmoother } = await import('./app/initSmoother');
    const smoother = initSmoother(responsiveConfig);
    smoother.paused(true);
    await yieldToMainThread();

    let cursorInitialization: Promise<void> | undefined;
    const initializeCursor = (): Promise<void> => {
        if (cursorInitialization) {
            return cursorInitialization;
        }

        cursorInitialization = import('./world/systems/CursorSystem').then(({ CursorSystem }) => {
            cursor = new CursorSystem({
                getPosition: () => smoother.scrollTop(),
                setPosition: (position) => smoother.scrollTop(position),
                getMaxPosition: () => getScrollSmootherMaxScroll(smoother),
            });
            cursor.setSoundCueVisibility(soundCursorCueVisibility);
            cursor.setScrollCueVisibility(scrollCursorCueVisibility);
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

    const scrollCue = createScrollCue((visibility) => {
        scrollCursorCueVisibility = visibility;
        cursor?.setScrollCueVisibility(visibility);
    });
    const sectionTransitions = createSectionTransitions({
        world,
        smoother,
        config: responsiveConfig,
        contactTabs,
        scrollCue,
        setProjectCursorCueVisible: (visible) => cursor?.setProjectCueVisible(visible),
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

    const [{ createIntroTextAnimation }, { initExperienceAnimations }] = await Promise.all([
        import('./sections/transitions/createSectionTextAnimations'),
        import('./sections/experience/initExperienceAnimations'),
    ]);
    createIntroTextAnimation(responsiveConfig);
    initExperienceAnimations(responsiveConfig);
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
        await initContactForm();
        initRecommendationWallEvents(responsiveConfig);
        createContactTextAnimation(contactTabs, responsiveConfig, smoother);
    });

    const initializeRemainingSections = async (): Promise<void> => {
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
    const navigationAnimation = gsap.fromTo(
        links,
        {
            opacity: 0,
            y: reduceMotion || responsiveConfig.isMobile ? 0 : '-2vh',
            willChange: 'transform, opacity',
        },
        {
            opacity: (_, link: HTMLElement) => (link.classList.contains('active') ? 0.9 : 0.55),
            y: 0,
            stagger: {
                each: reduceMotion ? 0 : 0.5,
            },
            duration: reduceMotion ? 0.01 : useCompactMotion ? 0.65 : 1,
            ease: 'sine',
            delay: reduceMotion ? 0 : 1,
            paused: true,
            onComplete: () => {
                links.forEach((element) => element.classList.add('animated'));
                gsap.set(links, { clearProps: 'opacity,transform,willChange' });
            },
        },
    );

    const updateWorld = (time: number, deltaTime: number): void => {
        const deltaSeconds = deltaTime / 1000;
        world.update(deltaSeconds, time);
        cursor?.update(deltaSeconds, time);
    };

    await initializeRemainingSections();
    sectionTransitions.initScrollTriggers();
    ScrollTrigger.refresh();
    await yieldToMainThread();
    world.prepareForReveal();
    finishLoadingPhases();
    await completeLoadingScreen(loadingScreen);
    const loaderDismissedAt = gsap.ticker.time;
    window.__portfolioStartup?.succeed();

    gsap.ticker.add(updateWorld);
    navigationAnimation.play();
    world.startIntroReveal(() => {
        sectionTransitions.releaseSmootherAtTop();
        navigation.setReady();
        scrollCue.setReady();
        scrollCue.reveal();
    }, loaderDismissedAt);
} catch (error) {
    documentElement.classList.remove(experienceLayoutClass, contactLayoutClass);
    console.error('Failed to initialize the portfolio experience', error);
    window.__portfolioStartup?.fail();
} finally {
    window.clearTimeout(slowConnectionTimeout);
    finishLoadingPhases();
}
