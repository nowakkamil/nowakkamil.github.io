import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mjml2html from 'mjml';
import sharp from 'sharp';

import {
    customerConfirmationPreview,
    escapeHtml,
    getFirstName,
    renderCustomerConfirmationBodyHtml,
} from '../functions/customerConfirmation.ts';
import {
    internalNotificationPreview,
    renderInternalNotificationMessageHtml,
} from '../functions/internalNotification.ts';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(projectRoot, 'emails', 'dist');
const generatedModuleDirectory = path.join(projectRoot, 'functions', 'generated');
const emailAssetSourceDirectory = path.join(projectRoot, 'src', 'assets', 'email');
const publicEmailAssetDirectory = path.join(projectRoot, 'public', 'email');
const themedSignatureAssets = [
    { key: 'email', filename: 'email.png' },
    { key: 'globe', filename: 'globe.png' },
    { key: 'linkedIn', filename: 'linkedin.png' },
    { key: 'monogram', filename: 'kn-monogram.png' },
    { key: 'location', filename: 'location.png' },
];
const staticSignatureAssets = [{ key: 'wave', filename: 'signature-wave.png' }];
const publicEmailAssetBaseUrl = 'https://nowakkamil.com/email';
const assetVersionManifestPath = path.join(projectRoot, 'emails', 'asset-versions.json');

const customerVariant = 'customer-message-dark';
const internalVariant = 'internal-contact-notification';

const previewReplacements = [
    [/{{\s*firstName\s*}}/g, escapeHtml(getFirstName(customerConfirmationPreview.name))],
    [/{{\s*message\s*}}/g, renderCustomerConfirmationBodyHtml(customerConfirmationPreview.message)],
];

const internalPreviewReplacements = [
    [/{{\s*customerName\s*}}/g, escapeHtml(internalNotificationPreview.name)],
    [/{{\s*customerEmail\s*}}/g, escapeHtml(internalNotificationPreview.email)],
    [
        /{{\s*message\s*}}/g,
        renderInternalNotificationMessageHtml(internalNotificationPreview.message),
    ],
];

const signatureAssetTokens = {
    monogram: '{{assetMonogram}}',
    globe: '{{assetGlobe}}',
    email: '{{assetEmail}}',
    linkedIn: '{{assetLinkedIn}}',
    location: '{{assetLocation}}',
    wave: '{{assetWave}}',
};

async function loadSignatureAssetBuffers() {
    const entries = await Promise.all([
        ...themedSignatureAssets.map(async ({ key, filename }) => {
            const buffer = await sharp(path.join(emailAssetSourceDirectory, filename))
                .tint({ r: 83, g: 164, b: 255 })
                .png()
                .toBuffer();
            return [key, { filename, buffer }];
        }),
        ...staticSignatureAssets.map(async ({ key, filename }) => {
            const buffer = await readFile(path.join(emailAssetSourceDirectory, filename));
            return [key, { filename, buffer }];
        }),
    ]);
    return Object.fromEntries(entries);
}

const resolveSignatureUrlAssets = (html, assetUrls) => {
    let resolvedHtml = html;
    for (const [key, token] of Object.entries(signatureAssetTokens)) {
        resolvedHtml = resolvedHtml.replaceAll(token, assetUrls[key]);
    }
    return resolvedHtml;
};

async function compile(mjml, sourcePath, outputName) {
    const { html, errors } = await mjml2html(mjml, {
        filePath: sourcePath,
        minify: false,
        validationLevel: 'strict',
    });

    if (errors.length > 0) {
        const details = errors
            .map(({ line, message, tagName }) => `${outputName}:${line} <${tagName}> ${message}`)
            .join('\n');
        throw new Error(`MJML compilation failed:\n${details}`);
    }

    return html;
}

async function buildVariant(variant, assetUrls) {
    const sourcePath = path.join(projectRoot, 'emails', `${variant}.mjml`);
    const signaturePath = path.join(projectRoot, 'emails', 'signature', 'signature.automated.html');
    const [sourceTemplate, signature] = await Promise.all([
        readFile(sourcePath, 'utf8'),
        readFile(signaturePath, 'utf8'),
    ]);
    const signatureStyleMatch = signature.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (!signatureStyleMatch) {
        throw new Error('Signature source must contain an embedded <style> block.');
    }

    const signatureStyles = signatureStyleMatch[1].trim();
    const signatureMarkup = signature.replace(signatureStyleMatch[0], '').trim();
    const source = sourceTemplate
        .replace('/* SIGNATURE_STYLES */', signatureStyles)
        .replace('<!-- SIGNATURE_HTML -->', signatureMarkup);

    if (source === sourceTemplate || source.includes('SIGNATURE_')) {
        throw new Error('Email source is missing its signature build placeholders.');
    }

    let previewSource = source;
    for (const [pattern, value] of previewReplacements) {
        previewSource = previewSource.replace(pattern, value);
    }
    previewSource = resolveSignatureUrlAssets(previewSource, assetUrls);

    const [productionHtml, previewHtml] = await Promise.all([
        compile(source, sourcePath, `${variant}.html`),
        compile(previewSource, sourcePath, `${variant}.preview.html`),
    ]);

    await Promise.all([
        writeFile(path.join(outputDirectory, `${variant}.html`), productionHtml),
        writeFile(path.join(outputDirectory, `${variant}.preview.html`), previewHtml),
        writeFile(
            path.join(generatedModuleDirectory, `${variant}.ts`),
            `// Generated by npm run email:build. Do not edit.\nexport const customerMessageDarkHtml = ${JSON.stringify(productionHtml)};\n`,
        ),
    ]);

    console.log(`Built emails/dist/${variant}.html`);
    console.log(`Built emails/dist/${variant}.preview.html`);
    console.log(`Built functions/generated/${variant}.ts`);
}

async function buildInternalVariant() {
    const sourcePath = path.join(projectRoot, 'emails', `${internalVariant}.mjml`);
    const source = await readFile(sourcePath, 'utf8');
    let previewSource = source;

    for (const [pattern, value] of internalPreviewReplacements) {
        previewSource = previewSource.replace(pattern, value);
    }

    const [productionHtml, previewHtml] = await Promise.all([
        compile(source, sourcePath, `${internalVariant}.html`),
        compile(previewSource, sourcePath, `${internalVariant}.preview.html`),
    ]);

    await Promise.all([
        writeFile(path.join(outputDirectory, `${internalVariant}.html`), productionHtml),
        writeFile(path.join(outputDirectory, `${internalVariant}.preview.html`), previewHtml),
        writeFile(
            path.join(generatedModuleDirectory, `${internalVariant}.ts`),
            `// Generated by npm run email:build. Do not edit.\nexport const internalContactNotificationHtml = ${JSON.stringify(productionHtml)};\n`,
        ),
    ]);

    console.log(`Built emails/dist/${internalVariant}.html`);
    console.log(`Built emails/dist/${internalVariant}.preview.html`);
    console.log(`Built functions/generated/${internalVariant}.ts`);
}

async function buildSignaturePreview(assetUrls) {
    const signatureDirectory = path.join(projectRoot, 'emails', 'signature');
    const signaturePath = path.join(signatureDirectory, 'signature.html');
    const signature = resolveSignatureUrlAssets(await readFile(signaturePath, 'utf8'), assetUrls);
    const indentedSignature = signature
        .trimEnd()
        .split('\n')
        .map((line) => (line.length > 0 ? `        ${line}` : ''))
        .join('\n');
    const preview = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Kamil Nowak — Email signature preview</title>
    </head>
    <body style="margin: 0; padding: 16px; background-color: #010611">
${indentedSignature}
    </body>
</html>
`;

    await writeFile(path.join(signatureDirectory, 'signature.preview.html'), preview);
    console.log('Built emails/signature/signature.preview.html');
}

const computeAssetSetHash = (assetBuffers) => {
    const hash = createHash('sha256');
    for (const [key, { buffer }] of Object.entries(assetBuffers).sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        hash.update(key);
        hash.update(buffer);
    }
    return hash.digest('hex');
};

async function readAssetVersionManifest() {
    let raw;
    try {
        raw = await readFile(assetVersionManifestPath, 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.versions)) {
        throw new Error('emails/asset-versions.json must contain a "versions" array.');
    }
    return parsed.versions;
}

// The directory name is allocated once, the first time a given set of asset
// bytes is published, and recorded in the manifest. Later builds look the name
// up by hash rather than deriving it from the clock: a rebuild that changes no
// asset therefore reuses the same directory instead of minting a new one for
// identical bytes, and changed assets can never land back on a directory an
// already-sent email points at.
async function resolveAssetVersion(assetBuffers) {
    const hash = computeAssetSetHash(assetBuffers);
    const versions = await readAssetVersionManifest();
    const published = versions.find((entry) => entry.hash === hash);
    if (published) {
        return published;
    }

    const version = versions.reduce((highest, entry) => Math.max(highest, entry.version), 0) + 1;
    const date = new Date().toISOString().slice(0, 10);
    const allocated = { version, date, directory: `v${version}-${date}`, hash };
    await writeFile(
        assetVersionManifestPath,
        `${JSON.stringify({ versions: [...versions, allocated] }, null, 4)}\n`,
    );
    console.log(`Allocated email asset version ${allocated.directory}`);
    return allocated;
}

// A version directory that has been referenced by a sent email must keep
// serving those exact bytes forever, so publishing only ever adds a new
// directory — earlier ones are left in place.
async function publishSignatureAssets(assetBuffers) {
    const { directory } = await resolveAssetVersion(assetBuffers);
    const versionDirectory = path.join(publicEmailAssetDirectory, directory);
    await mkdir(versionDirectory, { recursive: true });

    const assetUrls = Object.fromEntries(
        await Promise.all(
            Object.entries(assetBuffers).map(async ([key, { filename, buffer }]) => {
                await writeFile(path.join(versionDirectory, filename), buffer);
                return [key, `${publicEmailAssetBaseUrl}/${directory}/${filename}`];
            }),
        ),
    );
    await writeFile(
        path.join(generatedModuleDirectory, 'email-asset-urls.ts'),
        `// Generated by npm run email:build. Do not edit.\nexport const EMAIL_ASSET_URLS = ${JSON.stringify(assetUrls, null, 4)} as const;\n`,
    );
    console.log(`Published public/email/${directory} asset directory`);
    console.log('Built functions/generated/email-asset-urls.ts');
    return assetUrls;
}

await Promise.all([
    mkdir(outputDirectory, { recursive: true }),
    mkdir(generatedModuleDirectory, { recursive: true }),
]);
const signatureAssetBuffers = await loadSignatureAssetBuffers();
const signatureAssetUrls = await publishSignatureAssets(signatureAssetBuffers);
await Promise.all([
    buildVariant(customerVariant, signatureAssetUrls),
    buildInternalVariant(),
    buildSignaturePreview(signatureAssetUrls),
]);
