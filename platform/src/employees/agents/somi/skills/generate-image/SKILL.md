---
name: generate-image
description: Generate images from text descriptions using AI
metadata: {"somi":{"emoji":"🎨","category":"creative"}}
---

# generate-image

Generate AI images from text prompts using Gemini 3 Pro.

## When to Use

User asks to create, generate, or make an image/picture/visual.

## How to Execute

Use the `exec` tool to run the generation script from your workspace:

```bash
node skills/generate-image/generate.js "your enhanced prompt here"
```

The script returns JSON:
- Success: `{ "success": true, "path": "/tmp/generated-123.png", "filename": "generated-123.png" }`
- Error: `{ "error": "error message" }`

## Process

1. Get image description from user
2. Enhance the prompt for better results:
   - Be specific about subject, style, mood
   - Add details: lighting, colors, composition
   - Keep it clear and descriptive
3. Run the generate script via exec
4. Show the result to user (path to generated image)

## Prompt Enhancement Tips

Transform vague requests into detailed prompts:

| User says | Enhanced prompt |
|-----------|-----------------|
| "sunset" | "A dramatic sunset over calm ocean waters, golden hour, warm orange and pink sky reflected on water, photorealistic" |
| "cat" | "A fluffy orange tabby cat sitting on a windowsill, soft natural lighting, cozy indoor setting, detailed fur texture" |
| "logo" | "Modern minimalist logo design, clean geometric shapes, professional business style, vector art aesthetic" |

## Example Interaction

User: "Create an image of a coffee shop"

1. Enhance: "Cozy artisan coffee shop interior, warm ambient lighting, exposed brick walls, wooden furniture, plants, morning light through large windows, inviting atmosphere"

2. Execute:
```bash
node skills/generate-image/generate.js "Cozy artisan coffee shop interior, warm ambient lighting, exposed brick walls, wooden furniture, plants, morning light through large windows, inviting atmosphere"
```

3. Return result to user with the image path.
