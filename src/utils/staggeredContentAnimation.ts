import gsap from 'gsap';

type StaggeredContentOptions = {
    duration?: number;
    ease?: string;
    stagger?: gsap.StaggerVars | number;
    y?: number;
};

type TimelinePosition = number | string;

export const clearStaggeredContent = (targets: HTMLElement[]): void => {
    gsap.set(targets, {
        clearProps: 'opacity,visibility,transform',
    });
};

export const prepareStaggeredContent = (targets: HTMLElement[], y = 10): void => {
    gsap.set(targets, {
        autoAlpha: 0,
        y,
        force3D: true,
    });
};

export const addStaggeredContentOut = (
    timeline: gsap.core.Timeline,
    targets: HTMLElement[],
    options: StaggeredContentOptions = {},
    position?: TimelinePosition,
): gsap.core.Timeline =>
    timeline.to(
        targets,
        {
            autoAlpha: 0,
            y: options.y ?? -8,
            duration: options.duration ?? 0.18,
            stagger: options.stagger ?? {
                each: 0.028,
                from: 'end',
            },
            ease: options.ease ?? 'power2.in',
            force3D: true,
        },
        position,
    );

export const addStaggeredContentIn = (
    timeline: gsap.core.Timeline,
    targets: HTMLElement[],
    options: StaggeredContentOptions = {},
    position?: TimelinePosition,
): gsap.core.Timeline =>
    timeline.to(
        targets,
        {
            autoAlpha: 1,
            y: options.y ?? 0,
            duration: options.duration ?? 0.32,
            stagger: options.stagger ?? 0.045,
            ease: options.ease ?? 'power3.out',
            force3D: true,
        },
        position,
    );
