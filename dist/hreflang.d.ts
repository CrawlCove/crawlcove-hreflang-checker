/**
 * hreflang checker — the core, pure where it can be.
 *
 * Reads hreflang from the three places Google documents: <link rel="alternate"
 * hreflang> tags in the <head>, the HTTP `Link` response header, and
 * <xhtml:link> annotations inside a sitemap's <url> entries. Validates each
 * code, then checks the things that make a correct-looking set get ignored:
 * no self-referencing tag, no return tag on the alternate, a noindex on the
 * page, or a canonical pointing somewhere else.
 *
 * Same semantics as the hosted tool at crawlcove.com/tools/hreflang-checker
 * and the `hreflang` check in the Crawl Cove desktop crawler, so a finding
 * here means the same thing there.
 */
export type Severity = 'error' | 'warning';
export interface Finding {
    code: string;
    severity: Severity;
    message: string;
    /** The page or sitemap entry the finding is about (absent for whole-run findings). */
    url?: string;
}
export interface HreflangTag {
    hreflang: string;
    href: string;
    source: 'html' | 'header' | 'sitemap';
    valid: boolean;
    note?: string;
    /** False when the href was written relative — Google requires absolute URLs. */
    absolute: boolean;
}
export type ReciprocityStatus = 'ok' | 'missing' | 'unreachable' | 'redirected' | 'not-in-sitemap';
export interface Reciprocity {
    href: string;
    hreflang: string;
    status: ReciprocityStatus;
    note?: string;
}
export interface ClusterAnalysis {
    tags: HreflangTag[];
    selfReferencing: boolean;
    hasXDefault: boolean;
    /** Codes declared for more than one distinct URL. */
    duplicates: string[];
}
export interface PageReport {
    mode: 'page';
    url: string;
    finalUrl: string;
    status: number | null;
    fetchError?: string;
    tags: HreflangTag[];
    selfReferencing: boolean;
    hasXDefault: boolean;
    duplicates: string[];
    reciprocity: Reciprocity[];
    totalAlternates: number;
    checked: number;
    truncated: boolean;
    canonical: string | null;
    noindex: boolean;
    findings: Finding[];
}
export interface SitemapEntryReport extends ClusterAnalysis {
    loc: string;
    reciprocity: Reciprocity[];
}
export interface SitemapReport {
    mode: 'sitemap';
    sitemapUrl: string;
    status: number | null;
    fetchError?: string;
    totalInSitemap: number;
    checked: number;
    truncated: boolean;
    entries: SitemapEntryReport[];
    findings: Finding[];
}
export type Report = PageReport | SitemapReport;
export interface Options {
    timeoutMs: number;
    userAgent: string;
    /** Alternates fetched for the return-tag check in page mode. */
    maxAlternates: number;
    /** <url> entries read in sitemap mode. */
    maxSitemapUrls: number;
    maxChildSitemaps: number;
    concurrency: number;
    fetch: typeof fetch;
}
export declare const DEFAULT_OPTIONS: Options;
/** The complete ISO 639-1 alpha-2 language code set. */
export declare const ISO_639_1: ReadonlySet<string>;
/**
 * Validate one hreflang value: `x-default`, or language[-script][-region]
 * where a 2-letter language must be a real ISO 639-1 code (3-letter subtags
 * pass on shape alone, so rare-but-real tags are never false-flagged). The
 * note names the specific mistake when it is one people actually make.
 */
export declare function validateCode(code: string): {
    valid: boolean;
    note?: string;
};
/** Fragment stripped, scheme+host lower-cased, default port dropped; unparseable input returned as-is. */
export declare function normalizeUrl(value: string): string;
/** `<link rel="alternate" hreflang="…" href="…">` tags from the document head. */
export declare function extractHreflangTags(baseUrl: string, html: string): HreflangTag[];
/** `Link: <url>; rel="alternate"; hreflang="en", <url2>; …` from the response header. */
export declare function extractHreflangFromLinkHeader(header: string | null | undefined, baseUrl: string): HreflangTag[];
/** The page's `<link rel="canonical">`, resolved; null when absent or unparseable. */
export declare function extractCanonical(baseUrl: string, html: string): string | null;
/** True when either the X-Robots-Tag header or a robots/googlebot meta says noindex. */
export declare function isNoindex(xRobotsTag: string | null | undefined, html: string): boolean;
/** Self-reference, x-default and conflicting-code analysis of one page's tag set. Pure. */
export declare function analyseCluster(pageUrl: string, tags: HreflangTag[]): ClusterAnalysis;
/** The findings a cluster analysis implies, the same for page and sitemap mode. Pure. */
export declare function clusterFindings(url: string, a: ClusterAnalysis, reciprocity: Reciprocity[]): Finding[];
/** Page mode: one URL's own tags, then each alternate fetched for its return tag. */
export declare function checkPage(input: string, options?: Partial<Options>): Promise<PageReport>;
interface SitemapEntryRaw {
    loc: string;
    tags: HreflangTag[];
}
/** The `<url>` entries of one parsed sitemap body with their xhtml:link tags. Pure. */
export declare function parseSitemapEntries(body: string): {
    kind: 'urlset' | 'sitemapindex' | 'unknown';
    entries: SitemapEntryRaw[];
    children: string[];
};
/** Cross-reference every entry's declared tags against each other. Pure. */
export declare function analyseSitemapEntries(entries: SitemapEntryRaw[]): {
    entries: SitemapEntryReport[];
    findings: Finding[];
};
/** Sitemap mode: every <url> entry's xhtml:link annotations, reciprocity by cross-reference (no per-page fetch). */
export declare function checkSitemap(input: string, options?: Partial<Options>): Promise<SitemapReport>;
export {};
