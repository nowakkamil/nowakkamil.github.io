import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const projectsDirectory = path.join(repositoryRoot, 'src', 'assets', 'projects');
const outputDirectory = path.join(projectsDirectory, 'responsive');

const previewWidths = [480, 768, 1200];
const detailWidths = [1600];
const projectConfigs = [
    { id: 'abb-cynk-portal' },
    { id: 'bachelors-thesis', detailWidths: [] },
    {
        id: 'equiniti-design-system',
        sourceFilename: 'equiniti-design-system.webp',
        previewLossless: true,
    },
    { id: 'equiniti-website' },
    { id: 'help-and-support', detailWidths: [] },
    { id: 'groupware-knowledge-platform' },
    { id: 'interactive-3d-portfolio' },
    { id: 'intouch', detailWidths: [] },
    { id: 'it-services' },
    { id: 'kvl-security-device', sourceFilename: 'kvl-security-device.webp' },
    { id: 'masters-thesis' },
    { id: 'onboarding-solution' },
    { id: 'power-analyser', detailWidths: [] },
    { id: 'shareowner-online', detailWidths: [] },
    { id: 'taia-accelerator' },
];

await fs.mkdir(outputDirectory, { recursive: true });

const manifest = [];
const expectedOutputNames = new Set(['manifest.json']);

const createVariant = async ({
    sourcePath,
    id,
    width,
    format,
    sourceWidth,
    webpLossless = false,
}) => {
    if (width > sourceWidth) {
        throw new Error(`Refusing to upscale ${id}: requested ${width}px from ${sourceWidth}px`);
    }

    const filename = `${id}-${width}.${format}`;
    const outputPath = path.join(outputDirectory, filename);
    const pipeline = sharp(sourcePath);

    if (width < sourceWidth) {
        pipeline.resize({ width, withoutEnlargement: true, kernel: sharp.kernel.lanczos3 });
    }

    const { data, info } =
        format === 'png'
            ? await pipeline
                  .png({ compressionLevel: 9, adaptiveFiltering: true })
                  .toBuffer({ resolveWithObject: true })
            : await pipeline
                  .webp(
                      webpLossless
                          ? { lossless: true, effort: 6 }
                          : {
                                quality: 100,
                                alphaQuality: 100,
                                smartSubsample: true,
                                effort: 6,
                            },
                  )
                  .toBuffer({ resolveWithObject: true });

    let existingData;
    try {
        existingData = await fs.readFile(outputPath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    if (!existingData?.equals(data)) {
        await fs.writeFile(outputPath, data);
    }

    expectedOutputNames.add(filename);
    return {
        filename,
        width: info.width,
        height: info.height,
        bytes: info.size,
    };
};

for (const config of projectConfigs) {
    const sourceFilename = config.sourceFilename ?? `${config.id}.png`;
    const sourcePath = path.join(projectsDirectory, sourceFilename);
    const sourceStats = await fs.stat(sourcePath);
    const metadata = await sharp(sourcePath).metadata();

    if (!metadata.width || !metadata.height) {
        throw new Error(`Could not read dimensions for ${sourcePath}`);
    }

    const previewVariants = [];
    for (const width of previewWidths.filter((candidate) => candidate < metadata.width)) {
        const variant = await createVariant({
            sourcePath,
            id: config.id,
            width,
            format: 'webp',
            sourceWidth: metadata.width,
            webpLossless: config.previewLossless,
        });

        previewVariants.push(variant);
    }

    const detailVariants = [];
    for (const width of (config.detailWidths ?? detailWidths).filter(
        (candidate) => candidate < metadata.width,
    )) {
        detailVariants.push(
            await createVariant({
                sourcePath,
                id: `${config.id}-detail`,
                width,
                format: 'png',
                sourceWidth: metadata.width,
            }),
        );
    }

    let detailOriginal;
    if (metadata.format !== 'png') {
        detailOriginal = await createVariant({
            sourcePath,
            id: `${config.id}-detail`,
            width: metadata.width,
            format: 'png',
            sourceWidth: metadata.width,
        });
    }

    manifest.push({
        id: config.id,
        sourceFilename,
        width: metadata.width,
        height: metadata.height,
        originalBytes: sourceStats.size,
        previewEncoding: config.previewLossless ? 'webp-lossless' : 'webp-quality-100',
        previewVariants,
        detailEncoding: 'png-lossless',
        detailVariants,
        ...(detailOriginal ? { detailOriginal } : {}),
    });
}

await fs.writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
);

const staleGeneratedFiles = (await fs.readdir(outputDirectory)).filter(
    (filename) => /\.(?:png|webp)$/.test(filename) && !expectedOutputNames.has(filename),
);

if (staleGeneratedFiles.length > 0) {
    console.warn(
        `Unused generated files were left in place for manual review: ${staleGeneratedFiles.join(', ')}`,
    );
}

for (const entry of manifest) {
    const formatVariants = (variants) =>
        variants
            .map(
                ({ width, height, bytes }) => `${width}x${height} (${Math.round(bytes / 1024)} KB)`,
            )
            .join(', ');
    console.log(`${entry.id} preview: ${formatVariants(entry.previewVariants)}`);
    console.log(
        `${entry.id} details: ${formatVariants([
            ...entry.detailVariants,
            ...(entry.detailOriginal ? [entry.detailOriginal] : []),
        ])}`,
    );
}
