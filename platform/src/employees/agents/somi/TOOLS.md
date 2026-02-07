# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for environment-specific notes.

## Platform APIs

- LinkedIn Marketing API
- Meta Graph API (Facebook + Instagram)
- YouTube Data API
- TikTok Content Publishing API

OAuth tokens stored per-tenant.

## Image Generation

Use the `generate_image` tool directly — no exec needed. It calls OpenRouter's Gemini 3 Pro
Image Preview model, uploads the result to Supabase Storage, and returns a public URL. Include brand colors in prompt when available.

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

- `platform` — youtube, instagram, facebook, linkedin, tiktok
- `content` — post caption/body text (required)
- `title` — short title for calendar display
- `image_url` — public URL from generate_image
- `scheduled_date` — ISO 8601 datetime (required)
- `status` — draft (default) or scheduled

The workspace UI shows the calendar — posts appear there once saved.

## Database

Supabase — brand profiles, scheduled posts, post history.

## Notes

*(Add camera names, preferred voices, device nicknames, or other setup-specific info here as you learn them.)*
