import { rangeProgress, smoothstep } from '../utils/animation';

export const createScrollCue = (
    setCursorCueVisibility: (visibility: number) => void = () => {},
) => {
    let ready = false;
    let requestedVisibility = 0;

    const syncVisibility = (): void => {
        setCursorCueVisibility(ready ? requestedVisibility : 0);
    };
    const reveal = (): void => {
        requestedVisibility = 1;
        syncVisibility();
    };
    const setReady = (): void => {
        ready = true;
        syncVisibility();
    };
    const update = (progress: number, isResetting: boolean): void => {
        requestedVisibility = isResetting ? 0 : 1 - smoothstep(rangeProgress(progress, 0, 0.14));
        syncVisibility();
    };

    return { reveal, setReady, update };
};

export type ScrollCue = ReturnType<typeof createScrollCue>;
