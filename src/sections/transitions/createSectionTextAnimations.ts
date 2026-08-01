import gsap from 'gsap';
import type { ScrollSmoother } from 'gsap/ScrollSmoother';

import { getScrollSmootherMaxScroll } from '../../app/navigation/getScrollSmootherMaxScroll';
import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { createResponsiveLineSplit } from '../../utils/splitText';
import { getContactTabsHiddenState } from '../contact/getContactTabsHiddenState';
import { sectionSelectors } from '../sectionIds';

const SOCIAL_LINKS_SELECTOR = '[data-social-links] .social-links__link';
const CONTACT_INTERACTIVE_ELEMENTS_SELECTOR =
    '.contact-action, [data-contact-tabs] input, [data-contact-tabs] textarea';
const CONTACT_FORM_INTERACTION_PROGRESS = 0.98;
const PAGE_BOTTOM_TOLERANCE = 2;
export const CONTACT_FORM_REVEAL_TRIGGER_ID = 'contact-form-reveal';

const SOCIAL_LINKS_DURATION = 1;
const SOCIAL_LINKS_EASE = 'sine';

export const createIntroTextAnimation = (config: ResponsiveConfig): void => {
    createResponsiveLineSplit('.reveal-text', (introTargets) => {
        const useCompactMotion = config.isCompact || config.hasCoarsePointer;
        const timeline = gsap.timeline({
            scrollTrigger: {
                ...config.sectionTextAnimations.intro,
                trigger: sectionSelectors.intro,
                scrub: true,
                fastScrollEnd: true,
            },
        });

        if (config.reducedMotion) {
            timeline
                .from(introTargets, {
                    opacity: 0,
                    ease: 'none',
                })
                .to({}, { duration: 0.2 })
                .to(introTargets, {
                    opacity: 0,
                    ease: 'none',
                });
            return timeline;
        }

        const travel = useCompactMotion ? 40 : 120;
        const blur = useCompactMotion ? 6 : 24;
        const stagger = useCompactMotion ? 0.12 : 0.5;

        return timeline
            .from(introTargets, {
                yPercent: travel,
                opacity: 0,
                filter: `blur(${blur}px)`,
                ease: 'none',
                stagger: { each: stagger, from: 'end' },
            })
            .to({}, { duration: useCompactMotion ? 0.35 : 0.8 })
            .to(introTargets, {
                opacity: 0,
                filter: `blur(${blur}px)`,
                yPercent: -travel,
                ease: 'none',
                stagger: { each: stagger, from: 'end' },
            });
    });
};

export const createContactTextAnimation = (
    contactTabs: HTMLElement | null,
    config: ResponsiveConfig,
    smoother: ScrollSmoother,
): void => {
    const useCompactMotion = config.isCompact || config.hasCoarsePointer;
    const socialLinks = gsap.utils.toArray<HTMLElement>(SOCIAL_LINKS_SELECTOR);
    const contactInteractiveElements = gsap.utils.toArray<HTMLElement>(
        CONTACT_INTERACTIVE_ELEMENTS_SELECTOR,
    );
    const interactiveElements = [...socialLinks, ...contactInteractiveElements];

    const syncContactTabsVisibility = (timelineProgress: number): void => {
        if (!contactTabs) {
            return;
        }

        if (timelineProgress > 0) {
            contactTabs.removeAttribute('aria-hidden');
        } else {
            contactTabs.setAttribute('aria-hidden', 'true');
        }
    };

    const setContactUiEnabled = (enabled: boolean): void => {
        const shouldAnimateSocialLinks = socialLinks.some((element) => element.inert === enabled);

        if (contactTabs) {
            contactTabs.inert = !enabled;
            contactTabs.classList.toggle(
                'is-contact-form-interactive',
                config.isCompact && enabled,
            );
            if (enabled) {
                contactTabs.removeAttribute('aria-hidden');
            }
        }

        interactiveElements.forEach((element) => {
            element.inert = !enabled;
        });

        if (!shouldAnimateSocialLinks) {
            return;
        }

        gsap.to(socialLinks, {
            autoAlpha: enabled ? 1 : 0,
            y: enabled ? (config.reducedMotion ? 0 : useCompactMotion ? '-0.5rem' : '-1.3rem') : 0,
            ...(enabled &&
                !config.reducedMotion && {
                    stagger: { each: useCompactMotion ? 0.2 : 0.5 },
                }),
            duration: config.reducedMotion
                ? 0.01
                : useCompactMotion
                  ? SOCIAL_LINKS_DURATION / 3
                  : SOCIAL_LINKS_DURATION,
            ease: SOCIAL_LINKS_EASE,
            overwrite: true,
        });
    };

    const isAtPageBottom = (): boolean =>
        getScrollSmootherMaxScroll(smoother) - smoother.scrollTop() <= PAGE_BOTTOM_TOLERANCE;

    let contactTimeline: gsap.core.Timeline;
    const contactScrollAnimation = config.sectionTextAnimations.contact;

    const syncContactUi = (): void => {
        const progress = contactTimeline.progress();
        const isMobilePageBottom = config.isMobile && isAtPageBottom();

        syncContactTabsVisibility(progress);
        setContactUiEnabled(progress >= CONTACT_FORM_INTERACTION_PROGRESS || isMobilePageBottom);
    };

    interactiveElements.forEach((element) => {
        element.inert = true;
    });
    setContactUiEnabled(false);
    gsap.set(socialLinks, { autoAlpha: 0, y: 0 });

    contactTimeline = gsap.timeline({
        onUpdate: syncContactUi,
        scrollTrigger: {
            id: CONTACT_FORM_REVEAL_TRIGGER_ID,
            trigger: sectionSelectors.contact,
            ...contactScrollAnimation,
            onUpdate: syncContactUi,
        },
    });

    if (contactTabs) {
        contactTimeline.fromTo(contactTabs, getContactTabsHiddenState(config), {
            opacity: 1,
            scale: 1,
            filter: 'blur(0px)',
        });
    }
};
