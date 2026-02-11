# TOOLS.md - Local Notes

## SEO Tools

### `google_suggest`
Get keyword ideas from Google Autocomplete. Free, no API key.
- Pass a seed keyword -> get real suggestions people search for
- Use `language` param for non-English markets
- Great for finding long-tail keywords and question-based queries

### `pagespeed_audit`
Run Google PageSpeed Insights on any URL. Free at low volume.
- Returns performance + SEO scores (0-100)
- Core Web Vitals: FCP, LCP, CLS, TBT, Speed Index
- Lists failed audits with specific recommendations
- Focus on `lighthouseResult.categories` for scores and `lighthouseResult.audits` for issues
- Use `strategy: "desktop"` or `strategy: "mobile"`

### `search_google`
Search Google and see top 10 results. Requires `GOOGLE_API_KEY` + `GOOGLE_CSE_ID`.
- Results include: title, URL, snippet
- Use for competitor analysis and SERP research
- 100 free queries/day

## Brand Context

Use `get_brand_profile` before giving SEO advice. Industry, audience, and website URL are critical context.

## Workspace Files

- `keywords.md` — tracked keyword lists with intent and priority
- `audits/` — site audit notes and findings
- `briefs/` — content briefs for SEO-optimized articles
