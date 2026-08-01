import gsap from 'gsap';

import type { ResponsiveConfig } from '../../app/responsiveConfig';
import type { World } from '../../world/World';
import { preloadImage } from '../../utils/assetLoaders';
import {
    addStaggeredContentIn,
    addStaggeredContentOut,
    clearStaggeredContent,
    prepareStaggeredContent,
} from '../../utils/staggeredContentAnimation';
import type { PortfolioProject } from './portfolioConstellation';
import formatSkillLabel from './formatSkillLabel';
import { constellations, getConstellationColorRgb } from './constellations';
import { preloadAdjacentProjectScreenshots } from './portfolioProjects';

const DETAILS_CONTENT_DURATION = 0.22;
const DETAILS_CONTENT_STAGGER = 0.02;
const DETAILS_CLOSE_DURATION = 0.12;
const DETAILS_CLOSE_STAGGER = 0.008;
const DETAILS_RAPID_DURATION = 0.16;
const DETAILS_RAPID_STAGGER = 0.012;
const MOBILE_SWIPE_CLOSE_DISTANCE = 72;
const MOBILE_SWIPE_DIRECTION_RATIO = 1.15;

const createProjectDetailsPanel = (
    world: World,
    config: ResponsiveConfig,
    initialProject?: PortfolioProject,
) => {
    const reduceMotion = config.reducedMotion;
    const panel = document.createElement('aside');
    const controls = document.createElement('div');
    const content = document.createElement('div');
    const previousButton = document.createElement('button');
    const nextButton = document.createElement('button');
    const closeButton = document.createElement('button');
    const screenshotFrame = document.createElement('figure');
    const screenshot = document.createElement('img');
    const eyebrow = document.createElement('p');
    const title = document.createElement('h2');
    const summary = document.createElement('p');
    const periodValue = document.createElement('dd');
    const roleValue = document.createElement('dd');
    const domainValue = document.createElement('dd');
    const ownerValue = document.createElement('dd');
    const tagList = document.createElement('ul');
    let screenshotRequestId = 0;
    let pendingScreenshotLoadRequestId = 0;
    let decodingScreenshotRequestId: number | undefined;
    let swipeStartX: number | undefined;
    let swipeStartY: number | undefined;
    let swipeDistance = 0;
    let canSwipeClose = false;
    let returnFocusTarget: HTMLElement | undefined;

    const resetSwipe = (): void => {
        swipeStartX = undefined;
        swipeStartY = undefined;
        swipeDistance = 0;
        canSwipeClose = false;
    };

    const commitPanelVisible = (): void => {
        if (panel.getAttribute('aria-hidden') === 'true') {
            return;
        }

        panel.classList.add('is-visible');
        controls.classList.add('is-visible');
    };

    const commitScreenshotLoaded = (): void => {
        if (
            pendingScreenshotLoadRequestId !== screenshotRequestId ||
            screenshot.getAttribute('src') !== screenshot.dataset.expectedSrc ||
            !screenshot.complete ||
            screenshot.naturalWidth <= 0
        ) {
            return;
        }

        screenshotFrame.classList.add('is-loaded');
    };

    const scheduleScreenshotLoaded = (requestId: number): void => {
        pendingScreenshotLoadRequestId = requestId;
        gsap.ticker.remove(commitScreenshotLoaded);
        gsap.ticker.add(commitScreenshotLoaded, true);
    };

    const revealScreenshotWhenDecoded = async (requestId: number): Promise<void> => {
        const expectedSrc = screenshot.dataset.expectedSrc;

        if (
            !expectedSrc ||
            requestId !== screenshotRequestId ||
            screenshot.getAttribute('src') !== expectedSrc ||
            decodingScreenshotRequestId === requestId
        ) {
            return;
        }

        decodingScreenshotRequestId = requestId;

        try {
            await screenshot.decode();
        } catch {
            if (!screenshot.complete || screenshot.naturalWidth <= 0) {
                return;
            }
        } finally {
            if (decodingScreenshotRequestId === requestId) {
                decodingScreenshotRequestId = undefined;
            }
        }

        if (
            requestId !== screenshotRequestId ||
            screenshot.getAttribute('src') !== expectedSrc ||
            screenshot.dataset.expectedSrc !== expectedSrc ||
            !screenshot.complete ||
            screenshot.naturalWidth <= 0
        ) {
            return;
        }

        scheduleScreenshotLoaded(requestId);
    };

    const prepareScreenshotSwap = async (
        requestId: number,
        project: PortfolioProject,
        src: string,
    ): Promise<void> => {
        try {
            await preloadImage(src);
        } catch {
            if (requestId !== screenshotRequestId || screenshot.dataset.expectedSrc !== src) {
                return;
            }

            screenshot.removeAttribute('src');
            delete screenshot.dataset.expectedSrc;
            screenshot.alt = '';
            screenshotFrame.classList.remove('is-loaded');
            screenshotFrame.hidden = true;
            return;
        }

        if (requestId !== screenshotRequestId || screenshot.dataset.expectedSrc !== src) {
            return;
        }

        preloadAdjacentProjectScreenshots(project);
        screenshot.setAttribute('src', src);

        if (screenshot.complete && screenshot.naturalWidth > 0) {
            void revealScreenshotWhenDecoded(requestId);
        }
    };

    panel.className = 'project-details';
    panel.id = 'project-details-dialog';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-labelledby', 'project-details-title');
    panel.setAttribute('aria-describedby', 'project-details-summary');
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('data-project-details-panel', '');

    content.className = 'project-details__content';
    controls.className = 'project-details__controls';
    controls.hidden = true;
    controls.setAttribute('aria-hidden', 'true');
    controls.setAttribute('data-project-details-panel', '');
    previousButton.className = 'project-details__control project-details__control--previous';
    previousButton.type = 'button';
    previousButton.setAttribute('aria-label', 'Show previous project');

    nextButton.className = 'project-details__control project-details__control--next';
    nextButton.type = 'button';
    nextButton.setAttribute('aria-label', 'Show next project');

    closeButton.className = 'project-details__close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close project details');
    controls.append(previousButton, nextButton, closeButton);

    screenshotFrame.className = 'project-details__screenshot';
    screenshotFrame.hidden = true;
    screenshot.className = 'project-details__screenshot-image';
    screenshot.decoding = 'async';
    screenshot.loading = 'eager';
    screenshotFrame.append(screenshot);

    eyebrow.className = 'project-details__eyebrow';
    title.className = 'project-details__title';
    title.id = 'project-details-title';
    summary.className = 'project-details__summary';
    summary.id = 'project-details-summary';
    tagList.className = 'project-details__tags';

    const meta = document.createElement('dl');
    const periodTerm = document.createElement('dt');
    const roleTerm = document.createElement('dt');
    const domainTerm = document.createElement('dt');
    const ownerTerm = document.createElement('dt');

    meta.className = 'project-details__meta';
    periodTerm.textContent = 'Period';
    roleTerm.textContent = 'Role';
    domainTerm.textContent = 'Domain';
    ownerTerm.textContent = 'Owner';
    meta.append(
        periodTerm,
        periodValue,
        roleTerm,
        roleValue,
        domainTerm,
        domainValue,
        ownerTerm,
        ownerValue,
    );
    content.append(screenshotFrame, eyebrow, title, summary, meta, tagList);
    panel.append(controls, content);
    document.body.append(panel);

    const animatedContent = [eyebrow, title, summary, meta, tagList];

    let currentProjectId: string | undefined;
    let detailsSwapTimeline: gsap.core.Timeline | undefined;

    const applyScreenshotSource = (
        requestId: number,
        project: PortfolioProject,
        nextScreenshot: string,
    ): void => {
        if (requestId !== screenshotRequestId) {
            return;
        }

        const currentScreenshot = screenshot.getAttribute('src');
        const isCurrentScreenshotLoaded =
            currentScreenshot === nextScreenshot &&
            screenshot.complete &&
            screenshot.naturalWidth > 0 &&
            screenshotFrame.classList.contains('is-loaded');

        screenshot.dataset.expectedSrc = nextScreenshot;

        if (isCurrentScreenshotLoaded) {
            screenshotFrame.hidden = false;
            screenshotFrame.classList.add('is-loaded');
            return;
        }

        screenshotFrame.classList.remove('is-loaded');
        screenshotFrame.hidden = false;
        void prepareScreenshotSwap(requestId, project, nextScreenshot);
    };

    const showScreenshot = (project: PortfolioProject): void => {
        screenshotRequestId += 1;
        const requestId = screenshotRequestId;
        const screenshotSrc = project.detailsScreenshot;

        if (!screenshotSrc) {
            screenshot.removeAttribute('src');
            delete screenshot.dataset.expectedSrc;
            screenshot.alt = '';
            screenshotFrame.classList.remove('is-loaded');
            screenshotFrame.hidden = true;
            return;
        }

        screenshot.alt = `${project.title} screenshot`;
        screenshotFrame.hidden = false;
        applyScreenshotSource(requestId, project, screenshotSrc);
    };

    const renderProject = (project: PortfolioProject): void => {
        const label =
            constellations.find((constellation) => constellation.id === project.constellation.id)
                ?.label ?? formatSkillLabel(project.constellation.id);

        panel.scrollTop = 0;
        panel.dataset.projectId = project.id;
        panel.style.setProperty(
            '--project-details-accent-rgb',
            getConstellationColorRgb(project.constellation.id),
        );
        eyebrow.textContent = `${label} constellation`;
        title.textContent = project.title;
        showScreenshot(project);
        summary.textContent = project.description;
        periodValue.textContent = project.period;
        roleValue.textContent = project.role;
        domainValue.textContent = project.domain;
        ownerValue.textContent = project.owner;

        tagList.replaceChildren(
            ...project.skills.map((skill) => {
                const tag = document.createElement('li');

                tag.textContent = formatSkillLabel(skill);
                return tag;
            }),
        );

        currentProjectId = project.id;
    };

    const clearContentAnimation = (): void => {
        gsap.killTweensOf(animatedContent);
        clearStaggeredContent(animatedContent);
    };

    const animateContentIn = (rapid = false): gsap.core.Timeline => {
        prepareStaggeredContent(animatedContent);
        const timeline = gsap.timeline({
            onComplete: () => {
                if (detailsSwapTimeline !== timeline) {
                    return;
                }

                clearStaggeredContent(animatedContent);
                detailsSwapTimeline = undefined;
            },
        });

        addStaggeredContentIn(timeline, animatedContent, {
            duration: rapid ? DETAILS_RAPID_DURATION : DETAILS_CONTENT_DURATION,
            stagger: rapid ? DETAILS_RAPID_STAGGER : DETAILS_CONTENT_STAGGER,
            ease: 'power3.out',
        });
        return timeline;
    };

    const focusDialog = (): void => {
        queueMicrotask(() => {
            if (!panel.hidden && panel.getAttribute('aria-hidden') !== 'true') {
                closeButton.focus({ preventScroll: true });
            }
        });
    };

    const restoreTriggerFocus = (): void => {
        const focusTarget = returnFocusTarget;

        returnFocusTarget = undefined;
        if (
            focusTarget?.isConnected &&
            world.isProjectPanelBoundaryActive() &&
            !focusTarget.closest('[inert]')
        ) {
            focusTarget.focus({ preventScroll: true });
        }
    };

    const show = (project: PortfolioProject): void => {
        if (!world.isProjectPanelBoundaryActive()) {
            hide();
            return;
        }

        const wasHidden = panel.hidden || panel.getAttribute('aria-hidden') === 'true';
        const isSameProject = currentProjectId === project.id;
        const wasTransitioning = detailsSwapTimeline?.isActive() ?? false;
        const renderedWhileHidden = wasHidden;

        if (renderedWhileHidden) {
            const activeElement = document.activeElement;

            returnFocusTarget =
                activeElement instanceof HTMLElement &&
                activeElement !== document.body &&
                !panel.contains(activeElement)
                    ? activeElement
                    : undefined;
            renderProject(project);
        }

        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
        controls.hidden = false;
        controls.setAttribute('aria-hidden', 'false');
        gsap.ticker.remove(commitPanelVisible);
        gsap.ticker.add(commitPanelVisible, true);
        if (wasHidden) {
            focusDialog();
        }

        detailsSwapTimeline?.kill();
        clearContentAnimation();

        if (reduceMotion) {
            if (!renderedWhileHidden) {
                renderProject(project);
            }
            return;
        }

        if (wasHidden || !currentProjectId) {
            if (!renderedWhileHidden) {
                renderProject(project);
            }
            detailsSwapTimeline = animateContentIn();
            return;
        }

        if (isSameProject) {
            renderProject(project);
            return;
        }

        if (wasTransitioning) {
            renderProject(project);
            detailsSwapTimeline = animateContentIn(true);
            return;
        }

        const switchTimeline = gsap.timeline({
            onComplete: () => {
                if (detailsSwapTimeline !== switchTimeline) {
                    return;
                }

                clearStaggeredContent(animatedContent);
                detailsSwapTimeline = undefined;
            },
        });

        addStaggeredContentOut(switchTimeline, animatedContent, {
            duration: DETAILS_CONTENT_DURATION,
            ease: 'power3.in',
            y: 10,
            stagger: {
                each: DETAILS_CONTENT_STAGGER,
                from: 'end',
            },
        });
        switchTimeline.call(() => {
            renderProject(project);
            prepareStaggeredContent(animatedContent);
        });
        addStaggeredContentIn(switchTimeline, animatedContent, {
            duration: DETAILS_CONTENT_DURATION,
            stagger: DETAILS_CONTENT_STAGGER,
            ease: 'power3.out',
        });
        detailsSwapTimeline = switchTimeline;
    };

    const finishHide = (): void => {
        resetSwipe();
        panel.classList.remove('is-visible');
        panel.hidden = true;
        controls.hidden = true;
        clearStaggeredContent(animatedContent);
    };

    const hide = (immediate = false): void => {
        if (panel.getAttribute('aria-hidden') === 'true' && !immediate) {
            return;
        }

        detailsSwapTimeline?.kill();
        gsap.killTweensOf(animatedContent);
        gsap.ticker.remove(commitPanelVisible);

        controls.classList.remove('is-visible');

        panel.setAttribute('aria-hidden', 'true');
        controls.setAttribute('aria-hidden', 'true');
        restoreTriggerFocus();

        if (immediate || reduceMotion || panel.hidden) {
            finishHide();
            return;
        }

        const closeTimeline = gsap.timeline({
            onComplete: () => {
                if (detailsSwapTimeline !== closeTimeline) {
                    return;
                }

                detailsSwapTimeline = undefined;
                finishHide();
            },
        });
        addStaggeredContentOut(closeTimeline, animatedContent, {
            duration: DETAILS_CLOSE_DURATION,
            ease: 'power3.in',
            y: 10,
            stagger: {
                each: DETAILS_CLOSE_STAGGER,
                from: 'end',
            },
        });
        detailsSwapTimeline = closeTimeline;
    };

    const showPreviousProject = (): void => {
        world.selectAdjacentPortfolioProject(-1);
    };
    const showNextProject = (): void => {
        world.selectAdjacentPortfolioProject(1);
    };
    const close = (): void => {
        world.clearSelectedPortfolioProject();
    };

    previousButton.addEventListener('click', showPreviousProject);
    nextButton.addEventListener('click', showNextProject);
    closeButton.addEventListener('click', close);

    const handleDesktopPanelWheel = (event: WheelEvent): void => {
        if (
            config.isCompact ||
            panel.hidden ||
            panel.getAttribute('aria-hidden') === 'true' ||
            !event.composedPath().includes(panel) ||
            panel.scrollHeight <= panel.clientHeight + 1 ||
            event.deltaY === 0
        ) {
            return;
        }

        const lineHeight = Number.parseFloat(window.getComputedStyle(panel).lineHeight) || 16;
        const deltaMultiplier =
            event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? panel.clientHeight : 1;
        const scrollDelta = event.deltaY * deltaMultiplier;
        const maxScrollTop = panel.scrollHeight - panel.clientHeight;
        const canScrollPanel =
            scrollDelta < 0 ? panel.scrollTop > 0 : panel.scrollTop < maxScrollTop;

        if (!canScrollPanel) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        panel.scrollTop += scrollDelta;
    };

    document.addEventListener('wheel', handleDesktopPanelWheel, {
        capture: true,
        passive: false,
    });

    const handleTouchStart = (event: TouchEvent): void => {
        if (!config.isMobile || panel.hidden || event.touches.length !== 1) {
            resetSwipe();
            return;
        }

        const touch = event.touches[0];

        swipeStartX = touch.clientX;
        swipeStartY = touch.clientY;
        swipeDistance = 0;
        canSwipeClose = panel.scrollTop <= 1;
    };

    const handleTouchMove = (event: TouchEvent): void => {
        if (
            !canSwipeClose ||
            swipeStartX === undefined ||
            swipeStartY === undefined ||
            event.touches.length !== 1
        ) {
            return;
        }

        const touch = event.touches[0];
        const deltaX = touch.clientX - swipeStartX;
        const deltaY = touch.clientY - swipeStartY;

        if (deltaY <= 0 || Math.abs(deltaY) < Math.abs(deltaX) * MOBILE_SWIPE_DIRECTION_RATIO) {
            if (Math.abs(deltaX) > 12 || deltaY < -12) {
                resetSwipe();
            }
            return;
        }

        swipeDistance = deltaY;
        event.preventDefault();
        event.stopPropagation();
    };

    const handleTouchEnd = (event: TouchEvent): void => {
        const shouldClose = canSwipeClose && swipeDistance >= MOBILE_SWIPE_CLOSE_DISTANCE;

        if (swipeDistance > 0) {
            event.preventDefault();
            event.stopPropagation();
        }

        resetSwipe();

        if (shouldClose) {
            close();
        }
    };

    panel.addEventListener('touchstart', handleTouchStart, { passive: true });
    panel.addEventListener('touchmove', handleTouchMove, { passive: false });
    panel.addEventListener('touchend', handleTouchEnd, { passive: false });
    panel.addEventListener('touchcancel', resetSwipe, { passive: true });

    screenshot.addEventListener('error', () => {
        if (screenshot.getAttribute('src') !== screenshot.dataset.expectedSrc) {
            return;
        }

        screenshotRequestId += 1;
        screenshot.removeAttribute('src');
        delete screenshot.dataset.expectedSrc;
        screenshot.alt = '';
        screenshotFrame.classList.remove('is-loaded');
        screenshotFrame.hidden = true;
    });
    screenshot.addEventListener('load', () => {
        if (screenshot.getAttribute('src') !== screenshot.dataset.expectedSrc) {
            return;
        }

        void revealScreenshotWhenDecoded(screenshotRequestId);
    });
    const handleKeyDown = (event: KeyboardEvent): void => {
        if (panel.hidden || panel.getAttribute('aria-hidden') === 'true') {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            showPreviousProject();
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            showNextProject();
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    const handleProjectSelection = (project: PortfolioProject | undefined): void => {
        if (project) {
            show(project);
            return;
        }

        hide();
    };

    world.addPortfolioProjectSelectionListener(handleProjectSelection);
    handleProjectSelection(initialProject);

    const destroy = (): void => {
        detailsSwapTimeline?.kill();
        screenshotRequestId += 1;
        gsap.ticker.remove(commitPanelVisible);
        gsap.ticker.remove(commitScreenshotLoaded);

        window.removeEventListener('keydown', handleKeyDown);
        world.removePortfolioProjectSelectionListener(handleProjectSelection);
        previousButton.removeEventListener('click', showPreviousProject);
        nextButton.removeEventListener('click', showNextProject);
        closeButton.removeEventListener('click', close);
        document.removeEventListener('wheel', handleDesktopPanelWheel, true);
        panel.removeEventListener('touchstart', handleTouchStart);
        panel.removeEventListener('touchmove', handleTouchMove);
        panel.removeEventListener('touchend', handleTouchEnd);
        panel.removeEventListener('touchcancel', resetSwipe);

        panel.remove();
    };

    return { hide, destroy };
};

export default createProjectDetailsPanel;
