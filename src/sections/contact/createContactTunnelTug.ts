import gsap from 'gsap';
import type { World } from '../../world/World';

const ACTIVE_PROGRESS = 0.97;
const COMMIT_PRESSURE = 1;
const REVERSE_MULTIPLIER = 1;
const DESKTOP_TUG = {
    inputDistance: 400,
    resistance: 3,
    responseDuration: 0.34,
    retractDuration: 0.85,
    releaseDelay: 0.26,
} as const;
const COMPACT_TUG = {
    inputDistance: 240,
    resistance: 1.2,
    responseDuration: 0.22,
    retractDuration: 0.65,
    releaseDelay: 0.32,
} as const;

type ContactTunnelTugOptions = {
    world: World;
    reduceMotion: boolean;
    isCompact: boolean;
    isResetting: () => boolean;
    onResetInput: (event: Event) => void;
    onCommit: () => void;
};

const createContactTunnelTug = ({
    world,
    reduceMotion,
    isCompact,
    isResetting,
    onResetInput,
    onCommit,
}: ContactTunnelTugOptions) => {
    const tugConfig = isCompact ? COMPACT_TUG : DESKTOP_TUG;
    let contactProgress = 0;
    let pressure = 0;
    const tug = { progress: 0 };
    let tugTween: gsap.core.Tween | undefined;
    let releaseCall: gsap.core.Tween | undefined;
    let isRetracting = false;
    let isInputActive = false;
    let touchY: number | undefined;

    const render = (): void => {
        world.setContactCameraTug(tug.progress);
    };

    const cancelAnimations = (): void => {
        tugTween?.kill();
        tugTween = undefined;
        releaseCall?.kill();
        releaseCall = undefined;
        isRetracting = false;
    };

    const retract = (): void => {
        releaseCall = undefined;
        pressure = 0;
        tugTween?.kill();
        isRetracting = true;
        tugTween = gsap.to(tug, {
            progress: 0,
            duration: reduceMotion ? 0.01 : tugConfig.retractDuration,
            ease: 'power2.out',
            onUpdate: render,
            onComplete: () => {
                tugTween = undefined;
                isRetracting = false;
            },
        });
    };

    const animate = (): void => {
        tugTween?.kill();
        isRetracting = false;
        tugTween = gsap.to(tug, {
            progress: pressure,
            duration: reduceMotion ? 0.01 : tugConfig.responseDuration,
            ease: 'power1.out',
            overwrite: true,
            onUpdate: render,
            onComplete: () => {
                tugTween = undefined;
            },
        });

        releaseCall?.kill();
        releaseCall = pressure > 0 ? gsap.delayedCall(tugConfig.releaseDelay, retract) : undefined;
    };

    const applyInput = (deltaPixels: number): boolean => {
        if (!isInputActive || isResetting() || deltaPixels === 0) {
            return false;
        }

        if (isRetracting) {
            pressure = tug.progress;
        }

        const hasPressure = pressure > 0;
        const isAtContactEnd = contactProgress >= ACTIVE_PROGRESS;

        if (deltaPixels > 0) {
            if (!isAtContactEnd) {
                return false;
            }

            const normalizedPressure = pressure / COMMIT_PRESSURE;
            const resistance = 1 / (1 + normalizedPressure * tugConfig.resistance);
            pressure += (deltaPixels / tugConfig.inputDistance) * resistance;
        } else {
            if (!hasPressure) {
                return false;
            }

            pressure += (deltaPixels / tugConfig.inputDistance) * REVERSE_MULTIPLIER;
        }

        pressure = gsap.utils.clamp(0, COMMIT_PRESSURE, pressure);

        if (pressure >= COMMIT_PRESSURE) {
            cancelAnimations();
            onCommit();
        } else {
            animate();
        }

        return true;
    };

    const normalizeWheelDelta = (event: WheelEvent): number => {
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
            return event.deltaY * 16;
        }

        if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
            return event.deltaY * window.innerHeight;
        }

        return event.deltaY;
    };

    const handleWheel = (event: WheelEvent): void => {
        if (isResetting()) {
            onResetInput(event);
            return;
        }

        if (applyInput(normalizeWheelDelta(event))) {
            event.preventDefault();
        }
    };

    const handleTouchStart = (event: TouchEvent): void => {
        touchY = event.touches[0]?.clientY;
    };

    const handleTouchMove = (event: TouchEvent): void => {
        if (isResetting()) {
            onResetInput(event);
            return;
        }

        const nextTouchY = event.touches[0]?.clientY;
        if (nextTouchY === undefined || touchY === undefined) {
            touchY = nextTouchY;
            return;
        }

        const deltaPixels = touchY - nextTouchY;
        touchY = nextTouchY;

        if (applyInput(deltaPixels)) {
            event.preventDefault();
        }
    };

    const clearTouch = (): void => {
        touchY = undefined;
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', clearTouch, { passive: true });
    window.addEventListener('touchcancel', clearTouch, { passive: true });

    return {
        setInputActive(active: boolean): void {
            isInputActive = active;
        },
        setProgress(progress: number): void {
            contactProgress = progress;
        },
        shouldHoldCamera(progress: number): boolean {
            return progress >= ACTIVE_PROGRESS && !isResetting();
        },
        reset(): void {
            contactProgress = 0;
            pressure = 0;
            cancelAnimations();
            tug.progress = 0;
            render();
        },
    };
};

export type ContactTunnelTug = ReturnType<typeof createContactTunnelTug>;

export default createContactTunnelTug;
