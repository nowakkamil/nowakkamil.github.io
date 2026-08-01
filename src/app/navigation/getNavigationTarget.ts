import gsap from 'gsap';
import type { ScrollSmoother } from 'gsap/ScrollSmoother';

import { parseSectionId, sectionLandings } from './navigationSections';
import { getScrollSmootherMaxScroll } from './getScrollSmootherMaxScroll';
import { sectionSelectors } from '../../sections/sectionIds';

export const getNavigationTarget = (
    smoother: ScrollSmoother,
    target: string,
    useMobilePosition = false,
): number => {
    const sectionId = parseSectionId(target);

    if (!sectionId) {
        throw new Error(`Unknown navigation target: ${target}`);
    }

    const landing = sectionLandings[sectionId];
    const maxScroll = getScrollSmootherMaxScroll(smoother);

    if (landing.type === 'page-end') {
        return maxScroll;
    }

    const position = useMobilePosition
        ? (landing.positions.mobile ?? landing.positions.default)
        : landing.positions.default;
    const targetY = smoother.offset(sectionSelectors[sectionId], position);

    return gsap.utils.clamp(0, maxScroll, targetY);
};
