import { SplitText } from 'gsap/SplitText';

type SplitTextTarget = string | Element | Element[];
type LineSplitAnimationFactory = (lines: HTMLElement[]) => gsap.core.Animation | void;

export const createResponsiveLineSplit = (
    target: SplitTextTarget,
    createAnimation: LineSplitAnimationFactory,
    linesClass?: string,
): SplitText =>
    new SplitText(target, {
        type: 'lines',
        aria: 'none',
        autoSplit: true,
        onSplit: (split) => createAnimation(split.lines as HTMLElement[]),
        ...(linesClass ? { linesClass } : {}),
    });
