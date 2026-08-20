import { rangeProgress, smoothstep } from '../utils/animation';
import { createCachedAssetLoader } from '../utils/assetLoaders';

type SoundState = 'disabled' | 'muted' | 'playing' | 'unavailable';

const backgroundAudioModules = import.meta.glob<string>('../assets/audio/background.mp3', {
    import: 'default',
    query: '?url',
});

const loadBackgroundAudioUrl = createCachedAssetLoader('background audio', async () => {
    const loadSource = backgroundAudioModules['../assets/audio/background.mp3'];
    if (!loadSource) {
        throw new Error('Audio file not found');
    }

    return loadSource();
});

export const initSoundControls = (
    setCursorCueVisibility: (visibility: number) => void = () => {},
) => {
    const button = document.querySelector<HTMLButtonElement>('.sound-toggle');
    const audio = new Audio();
    const requiresExplicitSoundControl = window.matchMedia(
        '(hover: none), (pointer: coarse)',
    ).matches;

    audio.loop = true;
    audio.preload = 'none';
    audio.volume = 0.28;

    let hasStarted = false;
    let cueDismissed = false;
    let isCursorAudioCueVisible = true;
    let isUnavailable = false;

    const setButtonState = (state: SoundState): void => {
        if (!button) {
            return;
        }

        button.dataset.soundState = state;
        button.disabled = state === 'unavailable';
        button.setAttribute('aria-pressed', state === 'playing' ? 'true' : 'false');
        button.setAttribute(
            'aria-label',
            state === 'unavailable'
                ? 'Sound unavailable'
                : state === 'disabled'
                  ? 'Enable sound'
                  : state === 'playing'
                    ? 'Mute sound'
                    : 'Resume sound',
        );
    };

    const dismissCursorCue = (): void => {
        isCursorAudioCueVisible = false;
        cueDismissed = true;
        setCursorCueVisibility(0);
    };

    const updateCursorLabel = (progress: number): void => {
        if (cueDismissed) {
            return;
        }

        const visibility = 1 - smoothstep(rangeProgress(progress, 0, 0.14));
        isCursorAudioCueVisible = visibility > 0.02;
        setCursorCueVisibility(visibility);
    };

    const syncButtonState = (): void => {
        if (isUnavailable) {
            setButtonState('unavailable');
            return;
        }
        if (!hasStarted) {
            setButtonState('disabled');
            return;
        }

        setButtonState(audio.muted || audio.paused ? 'muted' : 'playing');
    };

    const markSoundUnavailable = (error: unknown): void => {
        if (isUnavailable) {
            return;
        }

        isUnavailable = true;
        console.error('Background audio is unavailable', error);
        syncButtonState();
        dismissCursorCue();
        document.removeEventListener('pointerdown', handleInitialSoundGesture);
    };

    const playSound = async (): Promise<void> => {
        if (isUnavailable) {
            return;
        }

        audio.muted = false;
        try {
            if (!audio.src) {
                audio.src = await loadBackgroundAudioUrl();
            }
            await audio.play();
            hasStarted = true;
            syncButtonState();
            dismissCursorCue();
            document.removeEventListener('pointerdown', handleInitialSoundGesture);
        } catch (error) {
            if (!audio.src || audio.error) {
                markSoundUnavailable(error);
                return;
            }

            console.warn('The browser did not allow background audio to start', error);
            syncButtonState();
        }
    };

    const toggleSound = (): void => {
        if (hasStarted && !audio.paused && !audio.muted) {
            audio.muted = true;
            syncButtonState();
            return;
        }

        void playSound();
    };

    function handleInitialSoundGesture(event: PointerEvent): void {
        if (!event.isPrimary || event.button !== 0) {
            return;
        }
        const target = event.target;
        if (target instanceof Node && button?.contains(target)) {
            return;
        }
        if (isCursorAudioCueVisible) {
            void playSound();
        }
    }

    button?.addEventListener('click', toggleSound);
    audio.addEventListener('play', syncButtonState);
    audio.addEventListener('pause', syncButtonState);
    audio.addEventListener('volumechange', syncButtonState);
    audio.addEventListener('error', () => {
        markSoundUnavailable(audio.error ?? new Error('Audio request failed'));
    });
    if (!requiresExplicitSoundControl) {
        document.addEventListener('pointerdown', handleInitialSoundGesture, { passive: true });
    }
    setCursorCueVisibility(1);
    syncButtonState();

    return { updateCursorLabel };
};
