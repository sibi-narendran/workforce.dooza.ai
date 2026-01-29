---
name: schedule-post
description: Schedule a post for future publishing.
metadata: {"somi":{"emoji":"📅","category":"publishing"}}
---

# schedule-post

Schedule content for later.

## When to Use
User wants to schedule content, or asks when to post.

## Process
1. Validate content meets platform requirements
2. Parse scheduled time (accepts "tomorrow 9am", ISO datetime, etc.)
3. Check for conflicts
4. Create scheduled post entry
5. Confirm with user

## Storage
```
workspace/
└── scheduled/
    └── {post_id}.json
```

## Notes
- Always confirm time and timezone with user
- Suggest optimal times if user doesn't specify
- Never auto-publish — scheduling still requires confirmation
