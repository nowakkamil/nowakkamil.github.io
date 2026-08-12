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

const pendingImages = new Map<string, Promise<void>>();
const pendingAssetRequests = new Map<string, Promise<void>>();

export const preloadAssetRequest = (source: string): Promise<void> => {
    const existing = pendingAssetRequests.get(source);
    if (existing) {
        return existing;
    }

    const pending = fetch(source, { cache: 'force-cache' })
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
            }
            await response.blob();
        })
        .catch((error: unknown) => {
            pendingAssetRequests.delete(source);
            throw new AssetLoadError(`asset "${source}"`, error);
        });

    pendingAssetRequests.set(source, pending);
    return pending;
};

export const preloadImage = (source: string): Promise<void> => {
    const existing = pendingImages.get(source);
    if (existing) {
        return existing;
    }

    const pending = new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';

        const fail = (): void => {
            reject(new AssetLoadError(`image "${source}"`, new Error('Image request failed')));
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
        image.src = source;
    }).catch((error: unknown) => {
        pendingImages.delete(source);
        throw error;
    });

    pendingImages.set(source, pending);
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
