---
name: schedule-post
description: Save LinkedIn posts to the content calendar for scheduling
metadata: {"linky":{"emoji":"📅","category":"calendar"}, "openclaw":{"command-dispatch":"tool","command-tool":"save_post"}}
---

# schedule-post

Save LinkedIn posts to the content calendar using the `save_post` tool.

## When to Use

User asks to schedule, save, queue, calendar, or plan a post. Also use when the user approves a draft and wants it saved to the calendar.

## How It Works

This skill dispatches to the `save_post` tool (provided by the `api-tools` plugin). It writes directly to the posts database via the Supabase REST API.

## Process

1. **Check current time** — call `get_current_time` to know today's date (required for interpreting "tomorrow", "next Tuesday", etc.)
2. **Check existing schedule** — call `get_scheduled_posts` for the target date to avoid conflicts
3. **Confirm details** — content, scheduled date/time
4. **Validate date is future** — if the date is in the past, tell the user and suggest alternatives
5. **Call `save_post`** — pass all parameters
6. **Confirm success** — tell the user the post is saved

## Parameters

| Param | Required | Description |
|-------|----------|-------------|
| `content` | Yes | The post caption/body text |
| `title` | No | Short label for the calendar (defaults to first ~40 chars of content) |
| `image_url` | No | Public URL from `generate_image` |
| `scheduled_date` | Yes | ISO 8601 datetime, e.g. `2026-02-14T10:00:00Z` |
| `status` | No | `draft` (default) or `scheduled` |

## Optimal Posting Times (Defaults)

If the user doesn't specify a time, suggest these as defaults:

| Day | Best Times (UTC) |
|-----|-----------------|
| Tuesday | 13:00–15:00 |
| Wednesday | 13:00–15:00 |
| Thursday | 13:00–15:00 |

Tuesday through Thursday are the highest-engagement days on LinkedIn.

## Integration with generate-image

When the user generates an image and then wants to schedule a post:
1. The `generate_image` tool returns a public URL
2. Pass that URL as `image_url` to `save_post`
3. Both the image and caption are saved together

## Weekly Content Planning

For weekly content plans:
1. Confirm posting frequency (2–3x/week is ideal for LinkedIn)
2. Generate content for each slot
3. Call `save_post` for each post with the appropriate date/time
4. Summarize what was scheduled

## Output Format

After saving, respond with a brief confirmation:

```
Saved to calendar — LinkedIn post scheduled for Tuesday Feb 14 at 10:00 AM UTC.
```

Do NOT echo back the full JSON response. Keep it conversational.
