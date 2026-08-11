import gsap from 'gsap';

export const completeLoadingScreen = (loadingScreen: HTMLElement | null): Promise<void> => {
    if (!loadingScreen) {
        return Promise.resolve();
    }

    const motion = loadingScreen.querySelector<HTMLElement>('.loading-screen__motion');
    const fog = loadingScreen.querySelector<HTMLElement>('.loading-screen__fog');
    const pulse = loadingScreen.querySelector<HTMLElement>('.loading-screen__pulse');
    const status = loadingScreen.querySelector<HTMLElement>('.loading-screen__status');

    if (!motion || !fog || !pulse) {
        loadingScreen.remove();
        return Promise.resolve();
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 0.01 : 1;

    motion.getAnimations().forEach((animation) => {
        animation.commitStyles();
        animation.cancel();
    });

    return new Promise((resolve) => {
        gsap.timeline({
            onComplete: () => {
                loadingScreen.remove();
                resolve();
            },
        })
            .to(motion, {
                force3D: true,
                scale: 0,
                duration: 0.62 * duration,
                ease: 'power2.inOut',
            })
            .to(
                fog,
                {
                    opacity: 0,
                    duration: 0.42 * duration,
                    ease: 'power2.out',
                },
                0,
            )
            .to(
                status,
                {
                    opacity: 0,
                    duration: 0.36 * duration,
                    ease: 'sine.out',
                },
                0.08 * duration,
            )
            .set(pulse, { opacity: 0.36, scale: 0.12 })
            .to(pulse, {
                force3D: true,
                opacity: 0,
                scale: 1.65,
                duration: 0.42 * duration,
                ease: 'power2.out',
            })
            .to(
                loadingScreen,
                {
                    opacity: 0,
                    duration: 0.2 * duration,
                    ease: 'sine.out',
                },
                '<',
            );
    });
};
