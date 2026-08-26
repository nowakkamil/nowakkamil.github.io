import gsap from 'gsap';

import {
    addStaggeredContentIn,
    clearStaggeredContent,
    prepareStaggeredContent,
} from '../../utils/staggeredContentAnimation';

export function initContactTabs(): void {
    const root = document.querySelector<HTMLElement>('[data-contact-tabs]');

    if (!root) {
        return;
    }

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-tab]'));

    const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-panel]'));
    const switchEl = root.querySelector<HTMLElement>('.contact-tabs__switch');
    const indicator = root.querySelector<HTMLElement>('.contact-tabs__glow');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let activeTarget =
        tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.tab ?? 'contact';
    let transition: gsap.core.Timeline | null = null;

    const getPanel = (target: string): HTMLElement | null =>
        panels.find((panel) => panel.dataset.panel === target) ?? null;

    const getPanelItems = (panel: HTMLElement): HTMLElement[] => {
        const selector =
            panel.dataset.panel === 'recommendations'
                ? '.contact-tabs__intro, .recommendation-card, .recommendation-wall__linkedin'
                : '.contact-tabs__intro, form > .form-group, form > .contact-action, .social-links__link';

        return Array.from(panel.querySelectorAll<HTMLElement>(selector));
    };
    const allPanelItems = panels.flatMap(getPanelItems);

    const clearAnimationState = (): void => {
        clearStaggeredContent(allPanelItems);
    };

    const cancelTransition = (): boolean => {
        if (!transition) {
            return false;
        }

        transition.kill();
        gsap.killTweensOf(allPanelItems);
        transition = null;

        return true;
    };

    const UNDERLINE_SQUASH = '0.68';
    const UNDERLINE_SQUASH_DURATION = 180;
    let squashTimeout = 0;

    const syncIndicator = (squash = false): void => {
        if (!switchEl || !indicator) {
            return;
        }

        const activeTab = tabs.find((tab) => tab.dataset.tab === activeTarget);

        if (!activeTab || activeTab.offsetWidth === 0) {
            return;
        }

        switchEl.style.setProperty('--tab-underline-x', `${activeTab.offsetLeft}px`);
        switchEl.style.setProperty(
            '--tab-underline-y',
            `${activeTab.offsetTop + activeTab.offsetHeight}px`,
        );
        switchEl.style.setProperty('--tab-underline-width', `${activeTab.offsetWidth}px`);

        window.clearTimeout(squashTimeout);

        if (!squash || reduceMotion) {
            switchEl.style.setProperty('--tab-underline-squash', '1');
            return;
        }

        switchEl.style.setProperty('--tab-underline-squash', UNDERLINE_SQUASH);
        squashTimeout = window.setTimeout(() => {
            switchEl.style.setProperty('--tab-underline-squash', '1');
        }, UNDERLINE_SQUASH_DURATION);
    };

    const setActiveTab = (target: string): void => {
        tabs.forEach((tab) => {
            const isActive = tab.dataset.tab === target;

            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
            tab.tabIndex = isActive ? 0 : -1;
        });

        panels.forEach((panel) => {
            const isActive = panel.dataset.panel === target;

            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });

        const didMove = activeTarget !== target;

        activeTarget = target;
        syncIndicator(didMove);
    };

    const activateTab = (target: string): void => {
        const didCancelTransition = cancelTransition();

        if (target === activeTarget && !didCancelTransition) {
            return;
        }

        if (target === activeTarget) {
            const activePanel = getPanel(activeTarget);

            if (!activePanel || reduceMotion) {
                clearAnimationState();
                return;
            }

            const activeItems = getPanelItems(activePanel);
            const recoveryTimeline = gsap.timeline({
                onComplete: () => {
                    if (transition !== recoveryTimeline) {
                        return;
                    }

                    clearAnimationState();
                    transition = null;
                },
            });

            transition = recoveryTimeline;
            addStaggeredContentIn(recoveryTimeline, activeItems, {
                duration: 0.2,
                stagger: 0.025,
                ease: 'power2.out',
            });

            return;
        }

        const incomingPanel = getPanel(target);

        if (!incomingPanel || reduceMotion) {
            clearAnimationState();
            setActiveTab(target);
            return;
        }

        const incomingItems = getPanelItems(incomingPanel);

        clearAnimationState();
        setActiveTab(target);
        prepareStaggeredContent(incomingItems);

        const switchTimeline = gsap.timeline({
            onComplete: () => {
                if (transition !== switchTimeline) {
                    return;
                }

                clearAnimationState();
                transition = null;
            },
        });

        transition = switchTimeline;
        addStaggeredContentIn(switchTimeline, incomingItems);
    };

    setActiveTab(activeTarget);

    if (switchEl && indicator) {
        switchEl.classList.add('is-measured');

        document.fonts?.ready.then(() => syncIndicator());

        new ResizeObserver(() => syncIndicator()).observe(switchEl);
    }

    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;

            if (!target) {
                return;
            }

            activateTab(target);
        });

        tab.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
                return;
            }

            event.preventDefault();

            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const nextIndex = (index + direction + tabs.length) % tabs.length;
            const nextTab = tabs[nextIndex];

            nextTab.focus();

            const target = nextTab.dataset.tab;

            if (target) {
                activateTab(target);
            }
        });
    });
}
