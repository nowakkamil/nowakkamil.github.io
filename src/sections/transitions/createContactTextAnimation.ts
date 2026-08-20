import gsap from 'gsap';
import type { ScrollSmoother } from 'gsap/ScrollSmoother';

import { getScrollSmootherMaxScroll } from '../../app/navigation/getScrollSmootherMaxScroll';
import type { ResponsiveConfig } from '../../app/responsiveConfig';
import { getContactTabsHiddenState } from '../contact/getContactTabsHiddenState';
import { sectionSelectors } from '../sectionIds';
import { CONTACT_FORM_REVEAL_TRIGGER_ID } from './contactTransitionIds';

const SOCIAL_LINKS_SELECTOR = '[data-social-links] .social-links__link';
const CONTACT_INTERACTIVE_ELEMENTS_SELECTOR =
    '.contact-action, [data-contact-tabs] input, [data-contact-tabs] textarea';
const CONTACT_FORM_INTERACTION_PROGRESS = 0.98;
const PAGE_BOTTOM_TOLERANCE = 2;

const SOCIAL_LINKS_DURATION = 1;
const SOCIAL_LINKS_EASE = 'sine';

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
            opacity: enabled ? 1 : 0,
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
    gsap.set(socialLinks, { opacity: 0, y: 0 });

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
