import gsap from 'gsap';

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

export const initSoundControls = (reducedMotion: boolean) => {
    const cursorLabel = document.querySelector<HTMLElement>('.cursor-sound-label');
    const cursorLabelContent = cursorLabel?.querySelector<HTMLElement>(
        '.cursor-sound-label__content',
    );
    const button = document.querySelector<HTMLButtonElement>('.sound-toggle');
    const audio = new Audio();
    const requiresExplicitSoundControl = window.matchMedia(
        '(hover: none), (pointer: coarse)',
    ).matches;

    audio.loop = true;
    audio.preload = 'none';
    audio.volume = 0.28;

    let hasStarted = false;
    let labelDismissed = false;
    let labelScrollControlled = false;
    let isCursorAudioCueVisible = !labelDismissed;
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

    const dismissCursorLabel = (immediate = false): void => {
        isCursorAudioCueVisible = false;
        labelDismissed = true;
        if (!cursorLabel) {
            return;
        }

        gsap.killTweensOf(cursorLabel);
        if (cursorLabelContent) {
            gsap.killTweensOf(cursorLabelContent);
        }
        if (immediate || reducedMotion) {
            cursorLabel.hidden = true;
            cursorLabel.style.opacity = '0';
            return;
        }

        gsap.to(cursorLabel, {
            opacity: 0,
            duration: 0.24,
            ease: 'power2.out',
            onComplete: () => {
                cursorLabel.hidden = true;
            },
        });
    };

    const updateCursorLabel = (progress: number): void => {
        if (!cursorLabel || cursorLabel.hidden || labelDismissed) {
            return;
        }

        if (progress > 0.001 && !labelScrollControlled) {
            labelScrollControlled = true;
            gsap.killTweensOf(cursorLabel);
        }

        const visibility = 1 - smoothstep(rangeProgress(progress, 0, 0.14));
        isCursorAudioCueVisible = visibility > 0.02;

        gsap.set(cursorLabel, {
            opacity: visibility * 0.68,
        });
        if (cursorLabelContent) {
            gsap.set(cursorLabelContent, {
                y: (1 - visibility) * 12,
            });
        }
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
        dismissCursorLabel(true);
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
            dismissCursorLabel(true);
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

        playSound();
    };

    function handleInitialSoundGesture(event: PointerEvent): void {
        if (!event.isPrimary || event.button !== 0) {
            return;
        }
        const target = event.target;
        if (target instanceof Node && button?.contains(target)) {
            return;
        }

        if (!cursorLabel || !isCursorAudioCueVisible) {
            return;
        }
        const cueStyle = getComputedStyle(cursorLabel);
        if (
            cursorLabel.hidden ||
            cueStyle.visibility !== 'visible' ||
            Number.parseFloat(cueStyle.opacity) <= 0.02
        ) {
            return;
        }

        playSound();
    }

    if (cursorLabel) {
        cursorLabel.hidden = labelDismissed;
        if (!labelDismissed) {
            gsap.set(cursorLabel, { opacity: 0 });
            if (cursorLabelContent) {
                gsap.set(cursorLabelContent, { y: 0 });
            }
            gsap.to(cursorLabel, {
                opacity: 0.68,
                duration: reducedMotion ? 0 : 0.32,
                ease: 'power2.out',
            });
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
    syncButtonState();

    return {
        cursorLabel: cursorLabel ?? undefined,
        updateCursorLabel,
    };
};
