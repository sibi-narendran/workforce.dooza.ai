# TOOLS.md - Local Notes

## SEO Tools (DataForSEO)

All tools use DataForSEO REST API. Default location: US (2840). Common location codes: 2826=UK, 2356=IN, 2036=AU, 2124=CA.

### Keyword Research

#### `keyword_suggestions`
Google Autocomplete suggestions for a seed keyword.
- Returns ranked suggestions people actually type into Google
- Great for finding long-tail keywords and question-based queries
- Pass `location_code` and `language_code` for local markets

#### `keyword_info`
Search volume, keyword difficulty, CPC, competition, and search intent for a keyword.
- Essential for prioritizing which keywords to target
- Returns monthly search volume, difficulty score (0-100), CPC, competition level
- Includes search intent classification (informational, commercial, navigational, transactional)

### SERP & Rankings

#### `serp_analysis`
Live Google SERP results for a keyword.
- Returns organic results with rank position, title, URL, description, domain
- Use `depth` param to control how many results (default 10, max 100)
- Supports `device: "mobile"` for mobile SERP analysis

#### `ranked_keywords`
All keywords a domain currently ranks for in Google.
- Shows position, search volume, estimated traffic per keyword
- Use to audit your own or competitor rankings
- Set `limit` to control result count (default 50)

### Site Audit & Backlinks

#### `onpage_audit`
Comprehensive on-page SEO audit for any URL.
- Returns onpage_score (0-100), 100+ SEO checks
- Covers meta tags, content analysis, page timing, mobile-friendliness
- JavaScript rendering enabled — sees what Google sees
- 60s timeout — audits can take a moment

#### `backlinks`
Backlink profile for a domain.
- Returns referring domains, anchor text, dofollow/nofollow, domain rank
- `mode: "one_per_domain"` (default) — one link per referring domain
- `mode: "as_is"` — all individual backlinks
- `mode: "one_per_anchor"` — unique anchor texts

### Competitive Analysis

#### `competitors_domain`
Find competing domains for a target domain.
- Returns competitor domains ranked by keyword overlap
- Shows avg position, estimated traffic, intersecting keywords
- Great starting point for competitive landscape analysis

#### `domain_intersection`
Content gap analysis between two domains.
- Shows keywords where competitor ranks but you don't
- Essential for content strategy — reveals missing topics
- Pass your domain as `target1`, competitor as `target2`

## Brand Context

Use `get_brand_profile` before giving SEO advice. Industry, audience, and website URL are critical context.

## Workspace Files

- `keywords.md` — tracked keyword lists with intent and priority
- `audits/` — site audit notes and findings
- `briefs/` — content briefs for SEO-optimized articles
