import groupwareDetailsUrl from '../../assets/projects/groupware-knowledge-platform.png?url';
import groupwarePreviewUrl from '../../assets/projects/previews/groupware-knowledge-platform.webp?url';
import kvlPreviewUrl from '../../assets/projects/previews/kvl-security-device.webp?url';
import responsiveManifest from '../../assets/projects/responsive/manifest.json';
import type { ResponsiveImageSource } from '../../utils/assetLoaders';

export const PROJECT_PREVIEW_IMAGE_SIZES = '(max-width: 767px) 0px, clamp(220px, 22vw, 320px)';
export const PROJECT_DETAILS_IMAGE_SIZES =
    '(max-width: 767px) calc(100vw - 4.5rem), min(calc(42vw - 2rem), 44rem)';

interface ProjectImageSet {
    preview: ResponsiveImageSource;
    details: ResponsiveImageSource;
}

const responsiveUrls = import.meta.glob<string>('../../assets/projects/responsive/*.{png,webp}', {
    eager: true,
    import: 'default',
    query: '?url',
});
const originalUrls = import.meta.glob<string>('../../assets/projects/*.png', {
    eager: true,
    import: 'default',
    query: '?url',
});

const mapAssetUrlsByFilename = (assets: Record<string, string>): Map<string, string> =>
    new Map(
        Object.entries(assets).map(([assetPath, source]) => [
            assetPath.split('/').at(-1) ?? assetPath,
            source,
        ]),
    );

const responsiveUrlsByFilename = mapAssetUrlsByFilename(responsiveUrls);
const originalUrlsByFilename = mapAssetUrlsByFilename(originalUrls);
const existingPreviewUrls = new Map([['kvl-security-device', kvlPreviewUrl]]);

const getGeneratedCandidates = (
    projectId: string,
    variants: Array<{ filename: string; width: number }>,
): Array<{ source: string; width: number }> =>
    variants.map((variant) => {
        const source = responsiveUrlsByFilename.get(variant.filename);
        if (!source) {
            throw new Error(`Missing responsive image for ${projectId}: ${variant.filename}`);
        }

        return { source, width: variant.width };
    });

const createResponsiveImage = (
    candidates: Array<{ source: string; width: number }>,
    width: number,
    height: number,
): ResponsiveImageSource => {
    const fallback = candidates.find((candidate) => candidate.width === 768) ?? candidates.at(-1);
    if (!fallback) {
        throw new Error('Responsive image has no candidates');
    }

    return {
        src: fallback.source,
        srcset: candidates
            .map(({ source, width: candidateWidth }) => `${source} ${candidateWidth}w`)
            .join(', '),
        width,
        height,
    };
};

const responsiveProjectImages = Object.fromEntries(
    responsiveManifest.map((entry) => {
        const previewCandidates = getGeneratedCandidates(entry.id, entry.previewVariants);
        const existingPreview = existingPreviewUrls.get(entry.id);
        const preview =
            previewCandidates.length > 0
                ? createResponsiveImage(previewCandidates, entry.width, entry.height)
                : existingPreview
                  ? { src: existingPreview, width: entry.width, height: entry.height }
                  : undefined;

        const detailCandidates = getGeneratedCandidates(entry.id, entry.detailVariants);
        if (entry.detailOriginal) {
            detailCandidates.push(...getGeneratedCandidates(entry.id, [entry.detailOriginal]));
        } else {
            const original = originalUrlsByFilename.get(`${entry.id}.png`);
            if (!original) {
                throw new Error(`Missing original project image: ${entry.id}.png`);
            }
            detailCandidates.push({ source: original, width: entry.width });
        }

        if (!preview) {
            throw new Error(`Missing project preview image: ${entry.id}`);
        }

        return [
            entry.id,
            {
                preview,
                details: createResponsiveImage(detailCandidates, entry.width, entry.height),
            } satisfies ProjectImageSet,
        ];
    }),
) as Record<string, ProjectImageSet>;

export const projectImagesById: Record<string, ProjectImageSet> = {
    ...responsiveProjectImages,
    'groupware-knowledge-platform': {
        preview: {
            src: groupwarePreviewUrl,
            width: 1600,
            height: 900,
        },
        details: {
            src: groupwareDetailsUrl,
            width: 1920,
            height: 1080,
        },
    },
};
