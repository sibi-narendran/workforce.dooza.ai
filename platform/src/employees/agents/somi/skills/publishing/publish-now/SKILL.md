---
name: publish-now
description: Publish content immediately to a platform.
metadata: {"somi":{"emoji":"🚀","category":"publishing"}}
---

# publish-now

Publish content right now.

## When to Use
User says "publish", "post this", "send it", or wants immediate posting.

## Process
1. Validate content meets platform requirements
2. Check platform connection is active
3. Show preview for final confirmation
4. On approval, call platform API
5. Return published post URL

## Guardrails
- **Never publish without explicit confirmation**
- Show preview first, always
- If account not connected → prompt to connect
- If rate limited → suggest scheduling instead
