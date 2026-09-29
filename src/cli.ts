#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { checkPage, checkSitemap, DEFAULT_OPTIONS, type PageReport, type Report, type SitemapReport } from './hreflang.js'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

const program = new Command()
program
  .name('hreflang-checker')
  .description('Read a page’s hreflang tags (HTML + HTTP Link header) or a sitemap’s xhtml:link annotations, validate the codes, and confirm self-reference, x-default and return tags.')
  .version(version)
  .argument('<url>', 'page URL, or an XML sitemap / sitemap index URL')
  .option('--sitemap', 'treat the URL as a sitemap (auto-detected for URLs ending in .xml)', false)
  .option('--max-alternates <n>', 'alternates fetched for the return-tag check in page mode', String(DEFAULT_OPTIONS.maxAlternates))
  .option('--max-urls <n>', '<url> entries read in sitemap mode', String(DEFAULT_OPTIONS.maxSitemapUrls))
  .option('--timeout <ms>', 'per-request timeout', String(DEFAULT_OPTIONS.timeoutMs))
  .option('--user-agent <ua>', 'User-Agent header to send')
  .option('--json', 'JSON output', false)
  .option('--fail-on <level>', '"error" (default), "warning", or "none"', 'error')
  .action(async (url: string, opts) => {
    if (!['error', 'warning', 'none'].includes(opts.failOn)) {
      console.error('--fail-on must be error, warning or none')
      process.exitCode = 2
      return
    }
    const common = {
      timeoutMs: Number(opts.timeout) || DEFAULT_OPTIONS.timeoutMs,
      userAgent: opts.userAgent ?? `crawlcove-hreflang-checker/${version} (+https://crawlcove.com/tools/hreflang-checker)`,
      maxAlternates: Number(opts.maxAlternates) || DEFAULT_OPTIONS.maxAlternates,
      maxSitemapUrls: Number(opts.maxUrls) || DEFAULT_OPTIONS.maxSitemapUrls
    }
    const sitemapMode = Boolean(opts.sitemap) || /\.xml(\?.*)?$/i.test(url)
    const report: Report = sitemapMode ? await checkSitemap(url, common) : await checkPage(url, common)
    if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    else process.stdout.write(render(report))
    const errors = report.findings.filter((x) => x.severity === 'error').length
    const warnings = report.findings.length - errors
    console.error(`\n${errors} error(s), ${warnings} warning(s).`)
    if ((opts.failOn === 'error' && errors > 0) || (opts.failOn === 'warning' && report.findings.length > 0)) process.exitCode = 1
  })

function renderPage(r: PageReport): string[] {
  const lines = [r.url, `  HTTP ${r.status ?? 'none'}${r.fetchError ? ` (${r.fetchError})` : ''}${r.finalUrl !== r.url ? ` → ${r.finalUrl}` : ''}, ${r.tags.length} hreflang tag(s)`]
  for (const t of r.tags) lines.push(`  ${t.valid ? '✓' : '✗'} ${t.hreflang.padEnd(10)} ${t.href}  [${t.source}]${t.note ? `  ${t.note}` : ''}`)
  if (r.tags.length > 0) {
    lines.push(`  self-referencing: ${r.selfReferencing ? 'yes' : 'NO'}   x-default: ${r.hasXDefault ? 'yes' : 'no'}   return tags checked: ${r.checked}/${r.totalAlternates}`)
    for (const x of r.reciprocity) lines.push(`  ${x.status === 'ok' ? '✓ links back ' : x.status === 'missing' ? '✗ NO RETURN  ' : `! ${x.status.padEnd(11)}`} ${x.hreflang.padEnd(10)} ${x.href}${x.note ? `  (${x.note})` : ''}`)
  }
  return lines
}

function renderSitemap(r: SitemapReport): string[] {
  const lines = [r.sitemapUrl, `  HTTP ${r.status ?? 'none'}${r.fetchError ? ` (${r.fetchError})` : ''}, ${r.checked}/${r.totalInSitemap} entries checked, ${r.entries.length} with hreflang`]
  for (const e of r.entries) {
    const bad = e.tags.filter((t) => !t.valid).length
    const missing = e.reciprocity.filter((x) => x.status === 'missing').length
    const flags = [e.selfReferencing ? '' : 'no self-ref', e.hasXDefault ? '' : 'no x-default', bad ? `${bad} invalid` : '', missing ? `${missing} no return` : '', e.duplicates.length ? 'duplicate code' : ''].filter(Boolean)
    lines.push(`  ${flags.length === 0 ? '✓' : '✗'} ${e.loc}  ${e.tags.length} tag(s)${flags.length ? `  — ${flags.join(', ')}` : ''}`)
  }
  return lines
}

export function render(r: Report): string {
  const lines = r.mode === 'page' ? renderPage(r) : renderSitemap(r)
  if (r.findings.length > 0) lines.push('')
  for (const x of r.findings) lines.push(`  ${x.severity === 'error' ? '✗' : '!'} ${x.code}: ${x.message}`)
  return lines.join('\n') + '\n'
}

program.parseAsync(process.argv)
