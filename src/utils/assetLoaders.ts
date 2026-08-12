class AssetLoadError extends Error {
    public readonly assetName: string;

    constructor(assetName: string, cause: unknown) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(`Failed to load ${assetName}: ${reason}`, { cause });
        this.name = 'AssetLoadError';
        this.assetName = assetName;
    }
}

export const createCachedAssetLoader = <T>(
    assetName: string,
    load: () => Promise<T>,
): (() => Promise<T>) => {
    let pending: Promise<T> | undefined;

    return () => {
        pending ??= load().catch((error: unknown) => {
            pending = undefined;
            throw error instanceof AssetLoadError ? error : new AssetLoadError(assetName, error);
        });
        return pending;
    };
};

export interface ResponsiveImageSource {
    src: string;
    srcset?: string;
    width: number;
    height: number;
}

const pendingImages = new Map<string, Promise<void>>();

const getResponsiveImageRequestKey = (source: ResponsiveImageSource, sizes: string): string =>
    `${source.src}\n${source.srcset ?? ''}\n${sizes}\n${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`;

export const applyResponsiveImageSource = (
    image: HTMLImageElement,
    source: ResponsiveImageSource,
    sizes: string,
): void => {
    image.width = source.width;
    image.height = source.height;

    if (source.srcset) {
        image.sizes = sizes;
        image.srcset = source.srcset;
    } else {
        image.removeAttribute('sizes');
        image.removeAttribute('srcset');
    }

    image.dataset.expectedSrc = source.src;
    image.src = source.src;
};

export const clearResponsiveImageSource = (image: HTMLImageElement): void => {
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');
    image.removeAttribute('src');
    delete image.dataset.expectedSrc;
};

export const preloadImage = (source: ResponsiveImageSource, sizes: string): Promise<void> => {
    const requestKey = getResponsiveImageRequestKey(source, sizes);
    const existing = pendingImages.get(requestKey);
    if (existing) {
        return existing;
    }

    const pending = new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';

        const fail = (): void => {
            reject(new AssetLoadError(`image "${source.src}"`, new Error('Image request failed')));
        };
        const complete = (): void => {
            if (image.naturalWidth <= 0) {
                fail();
                return;
            }

            void image.decode().then(resolve);
        };

        image.addEventListener('load', complete, { once: true });
        image.addEventListener('error', fail, { once: true });
        if (source.srcset) {
            image.sizes = sizes;
            image.srcset = source.srcset;
        }
        image.src = source.src;
    }).catch((error: unknown) => {
        pendingImages.delete(requestKey);
        throw error;
    });

    pendingImages.set(requestKey, pending);
    return pending;
};

export const loadJsonAsset = async <T>(source: string, assetName: string): Promise<T> => {
    try {
        const response = await fetch(source);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
        }

        return (await response.json()) as T;
    } catch (error) {
        throw new AssetLoadError(assetName, error);
    }
};
