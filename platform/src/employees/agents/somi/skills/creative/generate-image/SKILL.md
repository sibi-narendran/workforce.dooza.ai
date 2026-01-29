---
name: generate-image
description: Generate an image using AI image generation for social media posts.
metadata: {"somi":{"emoji":"🎨","category":"creative"}}
---

# generate-image

Create images via AI generation.

## When to Use
User asks to create/generate/make an image or visual.

## Process
1. Enhance prompt with brand style if available
2. Determine dimensions by platform:
   - Instagram Feed: 1080x1080 or 1080x1350
   - Instagram Story: 1080x1920
   - LinkedIn: 1200x627
   - Twitter: 1600x900
   - Facebook: 1200x630
3. Call image generation API
4. Return image for preview

## Notes
- Requires integration with image generation service
- Apply brand colors/style when possible
