import gsap from 'gsap';

import type { ResponsiveConfig } from '../../app/responsiveConfig';
import type { World } from '../../world/World';
import {
    applyResponsiveImageSource,
    clearResponsiveImageSource,
    preloadImage,
    type ResponsiveImageSource,
} from '../../utils/assetLoaders';
import type { PortfolioProject, PortfolioProjectPreviewState } from './portfolioConstellation';
import formatSkillLabel from './formatSkillLabel';
import { constellations, getConstellationColorRgb } from './constellations';
import { PROJECT_PREVIEW_IMAGE_SIZES } from './projectImageAssets';
import { preloadAdjacentProjectScreenshots } from './portfolioProjects';

const CARD_HIDE_DURATION_MS = 340;

const createProjectPreviewCard = (world: World, config: ResponsiveConfig) => {
    const reduceMotion = config.reducedMotion;
    const card = document.createElement('aside');
    const content = document.createElement('div');
    const screenshotFrame = document.createElement('figure');
    const screenshot = document.createElement('img');
    const closeButton = document.createElement('button');
    const eyebrow = document.createElement('p');
    const title = document.createElement('h2');
    const description = document.createElement('p');
    const tagList = document.createElement('ul');
    let currentProjectId: string | undefined;
    let hideTimer: number | undefined;
    let screenshotRequestId = 0;

    const hideScreenshot = (): void => {
        screenshot.alt = '';
        screenshotFrame.hidden = true;
        clearResponsiveImageSource(screenshot);
    };

    const applyScreenshotSource = (
        source: ResponsiveImageSource,
        project: PortfolioProject,
        requestId: number,
    ): void => {
        void preloadImage(source, PROJECT_PREVIEW_IMAGE_SIZES)
            .then(() => {
                if (requestId !== screenshotRequestId || currentProjectId !== project.id) {
                    return;
                }

                screenshot.alt = `${project.title} preview`;
                applyResponsiveImageSource(screenshot, source, PROJECT_PREVIEW_IMAGE_SIZES);
                screenshotFrame.hidden = false;
                preloadAdjacentProjectScreenshots(project);
            })
            .catch((error) => {
                console.error(`Failed to load screenshot for project "${project.id}"`, error);
                if (requestId !== screenshotRequestId || currentProjectId !== project.id) {
                    return;
                }

                hideScreenshot();
            });
    };

    const commitShow = (): void => {
        card.classList.add('is-visible');
    };

    card.className = 'project-preview';
    card.hidden = true;
    card.tabIndex = 0;
    card.setAttribute('aria-hidden', 'true');
    card.setAttribute('aria-live', 'polite');
    card.setAttribute('aria-atomic', 'true');

    content.className = 'project-preview__content';
    screenshotFrame.className = 'project-preview__screenshot';
    screenshotFrame.hidden = true;
    screenshot.className = 'project-preview__screenshot-image';
    screenshot.decoding = 'async';
    screenshot.loading = 'eager';
    screenshotFrame.append(screenshot);

    closeButton.className = 'project-preview__close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close project preview');

    eyebrow.className = 'project-preview__eyebrow';
    title.className = 'project-preview__title';
    description.className = 'project-preview__description';
    tagList.className = 'project-preview__tags';
    content.append(closeButton, screenshotFrame, eyebrow, title, description, tagList);
    card.append(content);
    const keyboardNavigator = document.querySelector('.constellation-keyboard-nav');

    if (keyboardNavigator) {
        keyboardNavigator.after(card);
    } else {
        document.body.append(card);
    }

    card.addEventListener('click', (event) => {
        event.stopPropagation();
        if (currentProjectId) {
            world.selectPortfolioProjectById(currentProjectId);
        }
    });
    card.addEventListener('keydown', (event) => {
        if (event.target !== card || event.key !== 'Enter' || !currentProjectId) {
            return;
        }

        event.preventDefault();
        world.selectPortfolioProjectById(currentProjectId);
    });

    closeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        hide();
    });

    const renderProject = (project: PortfolioProject): void => {
        const screenshotSrc = project.screenshot;
        const requestId = ++screenshotRequestId;
        const label =
            constellations.find((constellation) => constellation.id === project.constellation.id)
                ?.label ?? formatSkillLabel(project.constellation.id);
        const tags = project.skills.map(formatSkillLabel);

        card.dataset.projectId = project.id;
        card.setAttribute(
            'aria-label',
            `${project.title} project preview. Press Enter to open details. Use arrow keys to scroll through projects.`,
        );
        card.style.setProperty(
            '--project-preview-accent-rgb',
            getConstellationColorRgb(project.constellation.id),
        );
        eyebrow.textContent = `${label} constellation`;
        title.textContent = project.title;
        description.textContent = project.description;
        if (!screenshotSrc || config.isMobile) {
            hideScreenshot();
        } else if (screenshot.getAttribute('src') !== screenshotSrc.src) {
            applyScreenshotSource(screenshotSrc, project, requestId);
        } else {
            screenshot.alt = `${project.title} preview`;
            screenshotFrame.hidden = false;
            preloadAdjacentProjectScreenshots(project);
        }
        tagList.replaceChildren(
            ...tags.slice(0, 3).map((tag) => {
                const item = document.createElement('li');
                item.textContent = tag;
                return item;
            }),
        );
        currentProjectId = project.id;
    };

    const show = (project: PortfolioProject): void => {
        window.clearTimeout(hideTimer);
        gsap.ticker.remove(commitShow);
        const wasHidden = card.hidden;
        const hasChangedProject = currentProjectId !== project.id;
        const needsScreenshotRefresh =
            config.isMobile === screenshot.hasAttribute('src') ||
            (!config.isMobile && screenshot.getAttribute('src') !== project.screenshot?.src);

        if (hasChangedProject || needsScreenshotRefresh) {
            renderProject(project);
            if (!reduceMotion && !wasHidden) {
                gsap.killTweensOf(content);
                gsap.fromTo(
                    content,
                    {
                        autoAlpha: 0.78,
                    },
                    {
                        autoAlpha: 1,
                        duration: 0.38,
                        ease: 'sine.out',
                    },
                );
            }
        }

        card.hidden = false;
        card.setAttribute('aria-hidden', 'false');
        gsap.ticker.add(commitShow, true);
    };

    const hide = (immediate = false): void => {
        gsap.killTweensOf(content);
        window.clearTimeout(hideTimer);
        gsap.ticker.remove(commitShow);

        card.classList.remove('is-visible');
        card.setAttribute('aria-hidden', 'true');

        if (immediate) {
            card.hidden = true;
            return;
        }

        hideTimer = window.setTimeout(() => {
            if (!card.classList.contains('is-visible')) {
                card.hidden = true;
            }
        }, CARD_HIDE_DURATION_MS);
    };

    const update = (state: PortfolioProjectPreviewState): void => {
        const project = state.hoveredProject ?? state.activeProject;

        if (!state.isProjectPanelBoundaryActive || state.selectedProject || !project) {
            hide();
            return;
        }

        show(project);
    };

    screenshot.addEventListener('error', () => {
        if (screenshot.getAttribute('src') !== screenshot.dataset.expectedSrc) {
            return;
        }

        screenshotRequestId += 1;
        hideScreenshot();
    });

    return { update, hide };
};

export default createProjectPreviewCard;
