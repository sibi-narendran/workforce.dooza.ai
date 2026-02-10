---
name: schedule-post
description: Save YouTube video plans to the content calendar for scheduling
metadata: {"utumy":{"emoji":"📅","category":"calendar"}, "openclaw":{"command-dispatch":"tool","command-tool":"save_post"}}
---

# schedule-post

Save YouTube video plans to the content calendar using the `save_post` tool.

## When to Use

User asks to schedule, save, queue, calendar, or plan a video. Also use when the user approves a draft and wants it saved to the calendar.

## How It Works

This skill dispatches to the `save_post` tool (provided by the `api-tools` plugin). It writes directly to the posts database via the Supabase REST API.

## Process

1. **Check current time** — call `get_current_time` to know today's date (required for interpreting "tomorrow", "next Tuesday", etc.)
2. **Check existing schedule** — call `get_scheduled_posts` for the target date to avoid conflicts
3. **Confirm details** — title, description, scheduled date/time, thumbnail
4. **Validate date is future** — if the date is in the past, tell the user and suggest alternatives
5. **Call `save_post`** — pass all parameters
6. **Confirm success** — tell the user the video is saved

## Parameters

| Param | Required | Description |
|-------|----------|-------------|
| `platform` | Yes | Always `youtube` |
| `content` | Yes | Video description text |
| `title` | No | Video title for calendar display |
| `image_url` | No | Thumbnail URL from `generate_image` |
| `scheduled_date` | Yes | ISO 8601 datetime, e.g. `2026-02-14T10:00:00Z` |
| `status` | No | `draft` (default) or `scheduled` |

## Optimal Upload Times (Defaults)

If the user doesn't specify a time, suggest these as defaults:

| Day | Best Times (UTC) |
|-----|-----------------|
| Weekdays | 14:00–16:00 (catches US afternoon + evening viewers) |
| Weekends | 09:00–11:00 (morning viewers globally) |
| Shorts | Any time — algorithm distributes over 24-48 hours |

**Pro tip:** Consistency matters more than perfect timing. Pick a day and stick to it.

## Integration with generate-image

When the user generates a thumbnail and then wants to schedule:
1. The `generate_image` tool returns a public URL
2. Pass that URL as `image_url` to `save_post`
3. Both the thumbnail and video details are saved together

## Content Series Scheduling

For weekly content plans:
1. Confirm the upload frequency and content pillars
2. Generate titles and descriptions for each slot
3. Call `save_post` for each video with the appropriate date/time
4. Summarize what was scheduled

## Output Format

After saving, respond with a brief confirmation:

```
Saved to calendar — YouTube video "7 Productivity Hacks" scheduled for Tuesday Feb 14 at 2:00 PM UTC.
```

Do NOT echo back the full JSON response. Keep it conversational.

## Example Interaction

**User:** "Schedule that video for next Tuesday at 2pm"

1. Call: `save_post(platform: "youtube", content: "...", title: "7 Productivity Hacks", scheduled_date: "2026-02-10T14:00:00Z", status: "scheduled")`
2. Respond: "Done — YouTube video '7 Productivity Hacks' is scheduled for Tuesday Feb 10 at 2:00 PM UTC."
