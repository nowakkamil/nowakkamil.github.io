const finishAnimation = async (animation: Animation): Promise<void> => {
    try {
        await animation.finished;
    } catch {
        // The loading screen may be removed by startup error recovery.
    }
};

export const completeLoadingScreen = async (loadingScreen: HTMLElement | null): Promise<void> => {
    if (!loadingScreen) {
        return;
    }

    const motion = loadingScreen.querySelector<HTMLElement>('.loading-screen__motion');
    const fog = loadingScreen.querySelector<HTMLElement>('.loading-screen__fog');
    const pulse = loadingScreen.querySelector<HTMLElement>('.loading-screen__pulse');
    const status = loadingScreen.querySelector<HTMLElement>('.loading-screen__status');

    if (!motion || !fog || !pulse) {
        loadingScreen.remove();
        return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        loadingScreen.remove();
        return;
    }

    motion.getAnimations().forEach((animation) => {
        animation.commitStyles();
        animation.cancel();
    });

    const animations = [
        motion.animate(
            [
                { transform: motion.style.transform },
                { transform: 'translateZ(0) scale3d(0, 0, 1)' },
            ],
            {
                duration: 240,
                easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
                fill: 'forwards',
            },
        ),
        fog.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: 180,
            easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
            fill: 'forwards',
        }),
        pulse.animate(
            [
                { opacity: 0.36, transform: 'translate(-50%, -50%) scale(0.12)' },
                { opacity: 0, transform: 'translate(-50%, -50%) scale(1.65)' },
            ],
            {
                delay: 55,
                duration: 185,
                easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
                fill: 'forwards',
            },
        ),
        loadingScreen.animate([{ opacity: 1 }, { opacity: 0 }], {
            delay: 60,
            duration: 180,
            easing: 'cubic-bezier(0.39, 0.575, 0.565, 1)',
            fill: 'forwards',
        }),
    ];

    if (status) {
        animations.push(
            status.animate([{ opacity: 1 }, { opacity: 0 }], {
                delay: 5,
                duration: 180,
                easing: 'cubic-bezier(0.39, 0.575, 0.565, 1)',
                fill: 'forwards',
            }),
        );
    }

    await Promise.all(animations.map(finishAnimation));
    loadingScreen.remove();
};
