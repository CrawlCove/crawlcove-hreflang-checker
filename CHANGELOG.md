# Changelog

## 1.0.0 — 2026-09-29

Initial release.

- `hreflang-checker <url>`: reads hreflang from the `<head>` and the HTTP
  `Link` header, validates every code (ISO 639-1 language, optional script and
  region, `x-default`), checks self-reference, `x-default` and duplicate codes,
  fetches each alternate (capped at 20, `--max-alternates`) for its return tag,
  and flags `noindex` and a canonical pointing elsewhere.
- `--sitemap` (auto for `.xml` URLs): reads `<xhtml:link>` annotations from a
  sitemap or sitemap index (first 5 children) and checks return tags by
  cross-reference, no per-page fetch.
- Findings: `fetch-error`, `no-hreflang`, `invalid-code`, `suspicious-code`,
  `relative-href`, `missing-self-reference`, `missing-x-default`,
  `duplicate-code`, `missing-return-tag`, `alternate-unreachable`,
  `alternate-redirects`, `noindex`, `canonical-conflict`, `page-redirects`,
  `alternates-truncated`, `entries-truncated`, `index-truncated`,
  `not-in-sitemap`, `child-unreachable`, `not-a-sitemap`, `no-entries`.
- `--fail-on error|warning|none`, `--json`, `--timeout`, `--user-agent`.
