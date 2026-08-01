import type { ScrollSmoother } from 'gsap/ScrollSmoother';

export const getScrollSmootherMaxScroll = (smoother: ScrollSmoother): number => {
    const content = smoother.content() as HTMLElement;

    return Math.max(0, content.clientHeight - window.innerHeight);
};
