import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import mjml2html from 'mjml';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(projectRoot, 'emails', 'dist');

const variant = 'customer-message-dark';

const previewReplacements = [
    [/{{\s*name\s*}}/g, 'John'],
    [
        /{{\s*message\s*}}/g,
        `
        <p style="margin: 0 0 18px 0;">
            Thank you for sharing the outline of your new platform. The combination of a clear
            product story, thoughtful interaction design, and a dependable technical foundation
            is exactly the kind of challenge I enjoy working on.
        </p>
        <p style="margin: 0;">
            I have reviewed the initial scope and can already see a focused path from discovery
            through delivery. I would be glad to talk through the priorities, timing, and the
            level of support that would be most useful to your team.
        </p>
    `,
    ],
    [/{{\s*ctaText\s*}}/g, 'View selected work'],
    [/{{\s*ctaUrl\s*}}/g, 'https://nowakkamil.com'],
];

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

async function buildVariant(variant) {
    const sourcePath = path.join(projectRoot, 'emails', `${variant}.mjml`);
    const source = await readFile(sourcePath, 'utf8');
    let previewSource = source;
    for (const [pattern, value] of previewReplacements) {
        previewSource = previewSource.replace(pattern, value);
    }

    const [productionHtml, previewHtml] = await Promise.all([
        compile(source, sourcePath, `${variant}.html`),
        compile(previewSource, sourcePath, `${variant}.preview.html`),
    ]);

    await Promise.all([
        writeFile(path.join(outputDirectory, `${variant}.html`), productionHtml),
        writeFile(path.join(outputDirectory, `${variant}.preview.html`), previewHtml),
    ]);

    console.log(`Built emails/dist/${variant}.html`);
    console.log(`Built emails/dist/${variant}.preview.html`);
}

await mkdir(outputDirectory, { recursive: true });
await buildVariant(variant);
