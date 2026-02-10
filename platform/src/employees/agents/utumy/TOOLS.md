# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for environment-specific notes.

## YouTube API

- YouTube Data API v3 (future integration)

OAuth tokens stored per-tenant.

## Image Generation

Use the `generate_image` tool directly — no exec needed. It calls OpenRouter's Gemini 3 Pro
Image Preview model, uploads the result to Supabase Storage, and returns a public URL. Include brand colors in prompt when available.

**For thumbnails:** Always generate at 1280x720 aspect ratio. Use bold text overlays, high-contrast colors, and expressive imagery. Leave space for text if needed.

## Time Awareness

Use `get_current_time` before scheduling posts. It returns the current UTC datetime, date, time, day of week, and unix epoch. **Always call this first** when the user says "tomorrow", "next week", "next Tuesday", etc. — you need today's date to compute the correct target date.

## Scheduled Posts Query

Use `get_scheduled_posts` to view the content calendar. Returns a compact summary (title, platform, date, status, content preview). Useful for:
- Checking for scheduling conflicts before saving a post
- Answering "what do I have coming up?"
- Reviewing posts for a specific month or platform

Optional filters: `status`, `platform`, `upcoming_only` ("true"/"false"), `month` (YYYY-MM), `limit` (1-50).

## Content Calendar

Use the `save_post` tool to save posts to the content calendar. It writes directly to the
`posts` table via the Supabase REST API. **Posts cannot be scheduled in the past** — the database will reject them. Parameters:

- `platform` — youtube (always "youtube" for Utumy)
- `content` — video description text (required)
- `title` — video title for calendar display
- `image_url` — thumbnail URL from generate_image
- `scheduled_date` — ISO 8601 datetime (required)
- `status` — draft (default) or scheduled

The workspace UI shows the calendar — posts appear there once saved.

## Brand Assets

Use the brand tools to access the tenant's brand identity and uploaded assets.

### `get_brand_profile`
Returns the brand profile — business name, tagline, colors, industry, target audience, description, value proposition, and logo URL. **Call this first** when creating brand-aware content so you know the brand's identity and color scheme.

### `list_brand_assets`
Lists all brand assets (images, documents, files) uploaded to the Brain. Returns id, title, fileName, mimeType, and fileSize for each. Use the optional `type` parameter to filter (e.g. `"image"`).

### `fetch_brand_image`
Fetches a brand image by its asset ID (from `list_brand_assets`). Returns:
- The image itself so you can **see** it and understand what it looks like
- A `signedUrl` you can pass to `generate_image`'s `reference_image_url` parameter

**Workflow for brand-consistent thumbnail generation:**
1. `get_brand_profile` — get colors, tagline
2. `list_brand_assets` — find the logo or product image
3. `fetch_brand_image(asset_id)` — see the image + get its signedUrl
4. `generate_image(prompt, reference_image_url: signedUrl)` — generate with the brand asset as reference

## Database

Supabase — brand profiles, scheduled posts, post history.

## Notes

*(Add channel names, preferred styles, content pillars, or other setup-specific info here as you learn them.)*
