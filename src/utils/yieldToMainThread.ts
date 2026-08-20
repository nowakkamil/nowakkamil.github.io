interface SchedulerWithYield {
    yield(): Promise<void>;
}

const browserScheduler = (globalThis as typeof globalThis & { scheduler?: SchedulerWithYield })
    .scheduler;

export const yieldToMainThread = (): Promise<void> => {
    if (browserScheduler?.yield) {
        return browserScheduler.yield();
    }

    return new Promise((resolve) => window.setTimeout(resolve, 0));
};
