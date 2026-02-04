---
name: generate-image
description: Generate images from text descriptions using AI
metadata: {"somi":{"emoji":"🎨","category":"creative"}, "openclaw":{"command-dispatch":"tool","command-tool":"generate_image"}}
---

# generate-image

Generate AI images from text prompts using the `generate_image` tool.

## When to Use

User asks to create, generate, or make an image/picture/visual.

## How to Execute

Call the `generate_image` tool directly with a detailed prompt:

```
generate_image(prompt: "your enhanced prompt here", style: "optional style")
```

The tool calls OpenRouter's Gemini 3 Pro Image Preview model and saves the result to the `canvas/` directory. No exec or shell commands needed.

## Process

1. Get image description from user
2. Enhance the prompt for better results:
   - Be specific about subject, style, mood
   - Add details: lighting, colors, composition
   - Include brand colors when available
   - Keep it clear and descriptive
3. Call `generate_image` tool with the enhanced prompt
4. Show the result to user

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

2. Call: `generate_image(prompt: "Cozy artisan coffee shop interior, warm ambient lighting, exposed brick walls, wooden furniture, plants, morning light through large windows, inviting atmosphere")`

3. Show the generated image to user.
