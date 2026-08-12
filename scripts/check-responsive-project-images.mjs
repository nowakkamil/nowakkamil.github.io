import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const projectsDirectory = path.join(repositoryRoot, 'src', 'assets', 'projects');
const responsiveDirectory = path.join(projectsDirectory, 'responsive');
const manifestPath = path.join(responsiveDirectory, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const failures = [];
const expectedGeneratedFiles = new Set(['manifest.json']);
const ids = new Set();

const fail = (message) => failures.push(message);

const validateVariants = async ({ entry, variants, format, filenamePrefix }) => {
    const widths = new Set();
    let previousWidth = 0;

    for (const variant of variants) {
        expectedGeneratedFiles.add(variant.filename);
        if (widths.has(variant.width)) {
            fail(`${entry.id}: duplicate ${format} ${variant.width}px candidate`);
        }
        widths.add(variant.width);
        if (variant.width <= previousWidth) {
            fail(`${entry.id}: ${format} variants must be ordered by ascending width`);
        }
        previousWidth = variant.width;
        if (variant.width > entry.width) {
            fail(`${entry.id}: ${variant.width}px variant would upscale the source`);
        }
        if (variant.filename !== `${filenamePrefix}-${variant.width}.${format}`) {
            fail(`${entry.id}: unexpected filename ${variant.filename}`);
        }

        const variantPath = path.join(responsiveDirectory, variant.filename);
        try {
            const [stats, metadata] = await Promise.all([
                fs.stat(variantPath),
                sharp(variantPath).metadata(),
            ]);
            if (stats.size !== variant.bytes) {
                fail(
                    `${variant.filename}: byte size is ${stats.size}, manifest expects ${variant.bytes}`,
                );
            }
            if (metadata.format !== format) {
                fail(`${variant.filename}: expected ${format}, received ${metadata.format}`);
            }
            if (metadata.width !== variant.width || metadata.height !== variant.height) {
                fail(
                    `${variant.filename}: dimensions are ${metadata.width}x${metadata.height}, manifest expects ${variant.width}x${variant.height}`,
                );
            }
        } catch (error) {
            fail(`Missing or unreadable generated variant ${variant.filename}: ${error.message}`);
        }
    }
};

for (const entry of manifest) {
    if (ids.has(entry.id)) {
        fail(`Duplicate manifest id: ${entry.id}`);
        continue;
    }
    ids.add(entry.id);

    const sourcePath = path.join(projectsDirectory, `${entry.id}.png`);
    let sourceStats;
    let sourceMetadata;
    try {
        [sourceStats, sourceMetadata] = await Promise.all([
            fs.stat(sourcePath),
            sharp(sourcePath).metadata(),
        ]);
    } catch (error) {
        fail(`Missing or unreadable source image for ${entry.id}: ${error.message}`);
        continue;
    }

    if (sourceStats.size !== entry.originalBytes) {
        fail(
            `${entry.id}: source byte size changed (${sourceStats.size}, manifest ${entry.originalBytes}); run npm run images:generate`,
        );
    }
    if (sourceMetadata.width !== entry.width || sourceMetadata.height !== entry.height) {
        fail(
            `${entry.id}: source dimensions changed (${sourceMetadata.width}x${sourceMetadata.height}, manifest ${entry.width}x${entry.height})`,
        );
    }

    await validateVariants({
        entry,
        variants: entry.previewVariants,
        format: 'webp',
        filenamePrefix: entry.id,
    });
    await validateVariants({
        entry,
        variants: entry.detailVariants,
        format: 'png',
        filenamePrefix: `${entry.id}-detail`,
    });
    for (const variant of entry.detailVariants) {
        if (variant.width < 1600) {
            fail(`${entry.id}: detail variant ${variant.filename} is below the 1600px minimum`);
        }
    }

    if (entry.detailOriginal) {
        await validateVariants({
            entry,
            variants: [entry.detailOriginal],
            format: 'png',
            filenamePrefix: `${entry.id}-detail`,
        });
        if (entry.detailOriginal.width !== entry.width) {
            fail(`${entry.id}: lossless detail original must retain the source width`);
        }
    }
}

for (const fallback of [
    'previews/groupware-knowledge-platform.webp',
    'previews/kvl-security-device.webp',
]) {
    try {
        await sharp(path.join(projectsDirectory, fallback)).metadata();
    } catch (error) {
        fail(`Missing compact fallback ${fallback}: ${error.message}`);
    }
}

const actualGeneratedFiles = (await fs.readdir(responsiveDirectory)).filter(
    (filename) => filename === 'manifest.json' || /\.(?:png|webp)$/.test(filename),
);
for (const filename of actualGeneratedFiles) {
    if (!expectedGeneratedFiles.has(filename)) {
        fail(`Stale generated image: ${filename}`);
    }
}
for (const filename of expectedGeneratedFiles) {
    if (!actualGeneratedFiles.includes(filename)) {
        fail(`Manifest references missing generated file: ${filename}`);
    }
}

if (failures.length > 0) {
    console.error(`Responsive image validation failed:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
} else {
    console.log(
        `Responsive image validation passed: ${manifest.length} projects, ${expectedGeneratedFiles.size - 1} variants.`,
    );
}
