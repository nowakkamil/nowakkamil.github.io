const loadingLabels = {
    preparing: 'Preparing experience…',
    assets: 'Loading visual assets…',
    scene: 'Building the 3D scene…',
    finalizing: 'Finalizing the experience…',
    slow: 'Still loading — slower connections may take longer',
} as const;

export type LoadingPhase = keyof typeof loadingLabels;

export const createLoadingPhaseController = (loadingScreen: HTMLElement | null) => {
    const status = loadingScreen?.querySelector<HTMLElement>('.loading-screen__status');
    const announcement = loadingScreen?.querySelector<HTMLElement>('.loading-screen__announcement');
    let active = true;
    let currentPhase: LoadingPhase = 'preparing';

    const setLoadingPhase = (phase: LoadingPhase): void => {
        if (
            !active ||
            currentPhase === 'slow' ||
            !loadingScreen?.isConnected ||
            !status?.isConnected ||
            !announcement?.isConnected
        ) {
            return;
        }

        currentPhase = phase;
        const label = loadingLabels[phase];
        status.textContent = label;
        announcement.textContent = label;
    };

    const finish = (): void => {
        active = false;
    };

    return { setLoadingPhase, finish };
};
