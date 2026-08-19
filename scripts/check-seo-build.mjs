import fs from 'node:fs/promises';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const distDirectory = path.join(repositoryRoot, 'dist');
const siteOrigin = 'https://nowakkamil.com';
const failures = [];

const fail = (message) => failures.push(message);
const decodeEntities = (value) =>
    value
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');

const parseAttributes = (tag) =>
    Object.fromEntries(
        [...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((match) => [
            match[1].toLowerCase(),
            decodeEntities(match[2] ?? match[3] ?? ''),
        ]),
    );

const getMeta = (html, key, value) => {
    for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
        const attributes = parseAttributes(match[0]);
        if (attributes[key] === value) {
            return attributes.content;
        }
    }
};

const getCanonical = (html) => {
    for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
        const attributes = parseAttributes(match[0]);
        if (attributes.rel?.split(/\s+/).includes('canonical')) {
            return attributes.href;
        }
    }
};

const routeToFile = (route) => {
    if (route === '/') {
        return path.join(distDirectory, 'index.html');
    }
    return path.join(distDirectory, `${route.slice(1)}.html`);
};

const sitemapSource = await fs.readFile(path.join(distDirectory, 'sitemap.xml'), 'utf8');
const sitemapRoutes = [
    ...sitemapSource.matchAll(/<loc>(https:\/\/nowakkamil\.com[^<]*)<\/loc>/g),
].map((match) => new URL(match[1]).pathname);
const expectedRoutes = new Set(sitemapRoutes);
const checkedHtml = new Map();

if (sitemapRoutes.length === 0) {
    fail('Sitemap contains no canonical routes');
}
if (expectedRoutes.size !== sitemapRoutes.length) {
    fail('Sitemap contains duplicate routes');
}
if (expectedRoutes.has('/privacy')) {
    fail('Privacy page must not be included in the sitemap');
}

for (const route of sitemapRoutes) {
    const filePath = routeToFile(route);
    let html;
    try {
        html = await fs.readFile(filePath, 'utf8');
    } catch {
        fail(`${route}: sitemap target is missing from dist`);
        continue;
    }
    checkedHtml.set(route, html);

    const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
    const description = getMeta(html, 'name', 'description');
    const robots = getMeta(html, 'name', 'robots') ?? '';
    const canonical = getCanonical(html);
    const h1Count = [...html.matchAll(/<h1\b/gi)].length;
    const expectedCanonical = `${siteOrigin}${route}`;

    if (!title) {
        fail(`${route}: missing title`);
    }
    if (!description) {
        fail(`${route}: missing meta description`);
    }
    if (/\bnoindex\b/i.test(robots)) {
        fail(`${route}: indexable sitemap URL has noindex`);
    }
    if (canonical !== expectedCanonical) {
        fail(`${route}: canonical is ${canonical ?? 'missing'}, expected ${expectedCanonical}`);
    }
    if (h1Count !== 1) {
        fail(`${route}: expected one H1, found ${h1Count}`);
    }
    if (getMeta(html, 'property', 'og:image') !== `${siteOrigin}/og.png`) {
        fail(`${route}: missing canonical Open Graph image`);
    }
    if (getMeta(html, 'name', 'twitter:image') !== `${siteOrigin}/og.png`) {
        fail(`${route}: missing canonical Twitter image`);
    }

    for (const match of html.matchAll(
        /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    )) {
        try {
            JSON.parse(match[1]);
        } catch (error) {
            fail(`${route}: invalid JSON-LD (${error.message})`);
        }
    }
}

const privacyHtml = await fs.readFile(path.join(distDirectory, 'privacy.html'), 'utf8');
if (!/\bnoindex\b/i.test(getMeta(privacyHtml, 'name', 'robots') ?? '')) {
    fail('/privacy: expected noindex');
}
if (getCanonical(privacyHtml) !== `${siteOrigin}/privacy`) {
    fail('/privacy: canonical must use the extensionless route');
}

const notFoundHtml = await fs.readFile(path.join(distDirectory, '404.html'), 'utf8');
if (!/\bnoindex\b/i.test(getMeta(notFoundHtml, 'name', 'robots') ?? '')) {
    fail('/404.html: expected noindex');
}
if (getCanonical(notFoundHtml)) {
    fail('/404.html: not-found page must not declare a canonical');
}

const knownRoutes = new Set([...sitemapRoutes, '/privacy']);
for (const [route, html] of checkedHtml) {
    for (const match of html.matchAll(/<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>/gi)) {
        const href = match[1] ?? match[2] ?? '';

        if (!href.startsWith('/') || href.startsWith('//')) {
            continue;
        }

        const targetPath = new URL(href, siteOrigin).pathname;

        const publicFilePath = join(
            process.cwd(),
            'public',
            decodeURIComponent(targetPath).replace(/^\/+/, ''),
        );

        const isKnownRoute = knownRoutes.has(targetPath);
        const isPublicFile = existsSync(publicFilePath);

        if (!isKnownRoute && !isPublicFile) {
            fail(`${route}: internal link points to unknown target ${targetPath}`);
        }
    }
}

const robotsSource = await fs.readFile(path.join(distDirectory, 'robots.txt'), 'utf8');
if (!robotsSource.includes(`Sitemap: ${siteOrigin}/sitemap.xml`)) {
    fail('robots.txt does not reference the canonical sitemap');
}

try {
    const ogStats = await fs.stat(path.join(distDirectory, 'og.png'));
    if (ogStats.size === 0) {
        fail('og.png is empty');
    }
} catch {
    fail('og.png is missing from the production build');
}

if (failures.length > 0) {
    console.error(`SEO build validation failed:\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
} else {
    console.log(`SEO build validation passed for ${sitemapRoutes.length} indexable routes.`);
}
