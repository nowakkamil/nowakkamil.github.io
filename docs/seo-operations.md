# SEO Operations Runbook

## Document purpose

This document defines the deployment controls, search-engine registration procedures, launch acceptance criteria, and ongoing monitoring activities for `https://nowakkamil.com`.

## Scope

The runbook applies to:

- the canonical portfolio at `https://nowakkamil.com/`;
- Google Search Console;
- Bing Webmaster Tools;
- repository-level SEO and responsive-image validation;
- production crawlability, indexing, structured data, and social metadata.

The privacy and error pages are intentionally excluded from search indexing.

## Deployment controls

Complete the following checks before each production deployment:

1. Run `npm run images:check`.
2. If project source images have changed, run `npm run images:generate`, review the generated manifest, and rerun `npm run images:check`.
3. Run `npm run check` to validate TypeScript, linting, formatting, dead code, and responsive images.
4. Run `npm test`.
5. Run `npm run build`.
6. Confirm that the build validates metadata, canonical URLs, structured data, internal links, the custom 404 page, sitemap, and social image.
7. Review `public/sitemap.xml`. The sitemap must contain only canonical, indexable URLs.

### Responsive-image controls

The image pipeline generates width-based variants according to the dimensions of each source asset. Runtime markup uses `srcset`, `sizes`, intrinsic dimensions, lazy loading, and compact fallbacks.

Files under `src/assets/projects/responsive/` are generated artifacts and must not be edited manually. Update the source image and run `npm run images:generate` instead.

## Search-engine registration

Perform this procedure after the SEO implementation is available in production.

### Google Search Console

1. Open [Google Search Console](https://search.google.com/search-console).
2. Create a [Domain property](https://support.google.com/webmasters/answer/34592) for `nowakkamil.com`.
3. Add the supplied DNS TXT verification record at the authoritative DNS provider.
4. Complete ownership verification in Search Console.
5. [Submit](https://support.google.com/webmasters/answer/7451001) `https://nowakkamil.com/sitemap.xml` in the **Sitemaps** report.
6. Run [URL Inspection](https://support.google.com/webmasters/answer/9012289) for `https://nowakkamil.com/` and request indexing.
7. Confirm that the **Page indexing**, **HTTPS**, and **Core Web Vitals** reports are available and collecting data.

### Bing Webmaster Tools

1. Open [Bing Webmaster Tools](https://www.bing.com/webmasters/).
2. [Import the verified Google Search Console property](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b), or verify `nowakkamil.com` directly through DNS.
3. [Submit](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed) `https://nowakkamil.com/sitemap.xml` in the **Sitemaps** report.
4. Run a full-domain [Site Scan](https://www.bing.com/webmasters/help/site-scan-623520c9).
5. Resolve errors before warnings and informational recommendations.
6. Run [URL Inspection](https://www.bing.com/webmasters/help/URL-Inspection-55a30305) for the homepage after the first crawl.

IndexNow may be enabled when its key can be stored as a deployment secret and published at the corresponding key URL. API keys and verification secrets must not be committed to the repository.

## Production acceptance criteria

Record the execution date, environment, and result for each control.

| Control                 | Expected result                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical origin        | HTTP and `www` requests redirect once to `https://nowakkamil.com/`.                                                                  |
| Unknown route           | The response has HTTP status 404 and displays the custom `noindex` page.                                                             |
| Privacy route           | `/privacy.html` redirects to `/privacy`; the final page declares the extensionless canonical and `noindex, follow`.                  |
| Crawler resources       | `robots.txt` and `sitemap.xml` return HTTP 200.                                                                                      |
| Social image            | `og.png` returns HTTP 200 and has dimensions of 1200×630 pixels.                                                                     |
| Progressive enhancement | The homepage retains meaningful professional content when JavaScript or WebGL is unavailable.                                        |
| Structured data         | Google Rich Results Test reports no blocking structured-data errors for the homepage.                                                |
| Performance baseline    | PageSpeed Insights results are recorded for mobile and desktop. Field data supersedes lab data when sufficient traffic is available. |
| Social metadata         | A social-preview debugger displays the expected homepage title, description, and image.                                              |

## Monitoring schedule

| Period                        | Frequency        | Required activity                                                                                             |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| First four weeks after launch | Weekly           | Review indexing, sitemap processing, crawl errors, structured-data status, and Core Web Vitals.               |
| Steady state                  | Monthly          | Review search performance, indexed URL count, crawl health, Core Web Vitals, and outstanding recommendations. |
| Material technical release    | After deployment | Run URL inspection, verify the sitemap, and repeat the affected production acceptance controls.               |

## Monitoring controls

| Control area       | Google Search Console                          | Bing Webmaster Tools                                            | Response criteria                                                                                                                          |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Indexing           | Page indexing and sitemap status               | Indexed pages and URL Inspection                                | Investigate any canonical URL reported as blocked, excluded, crawled but not indexed, or assigned an unexpected canonical.                 |
| Search performance | Queries, pages, countries, and devices         | Keywords, pages, clicks, impressions, CTR, and average position | Investigate material changes against the previous comparable period. Changes require sufficient data before corrective action is selected. |
| Technical health   | Core Web Vitals, HTTPS, and crawl/index errors | Site Scan and crawl issues                                      | Address errors immediately. Group repeated warnings by shared root cause.                                                                  |
| Structured data    | Enhancements and URL Inspection                | Markup and SEO reports                                          | Revalidate JSON-LD after changes to homepage metadata or schema.                                                                           |

## Monthly reporting

Record the following metrics using consistent 28-day comparison periods:

- clicks;
- impressions;
- click-through rate;
- average position;
- indexed URL count;
- Core Web Vitals status;
- leading search queries;
- leading landing pages;
- crawl or indexing errors;
- unresolved Bing Site Scan findings.

Use 90-day periods for trend analysis and strategic decisions where monthly data volume is insufficient.

## API reporting

Automated reporting may be introduced after the property has accumulated at least 60 days of representative search data.

The reporting integration should:

- use the Google Search Console Search Analytics API and Bing Webmaster APIs;
- use read-only access where supported;
- store credentials in the CI or deployment secret store;
- report by date, query, page, country, and device where available;
- produce 28-day and 90-day comparisons;
- exclude credentials and sensitive raw exports from source control.

OAuth tokens, refresh tokens, API keys, DNS verification values, and sensitive query exports must not be committed to the repository.
