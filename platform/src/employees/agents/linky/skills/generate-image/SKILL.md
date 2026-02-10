---
name: generate-image
description: Generate images from text descriptions using AI
metadata: {"linky":{"emoji":"🎨","category":"creative"}, "openclaw":{"command-dispatch":"tool","command-tool":"generate_image"}}
---

# generate-image

Generate AI images from text prompts using the `generate_image` tool.

## When to Use

User asks to create, generate, design, or make an image, picture, visual, graphic, or illustration.

## How It Works

This skill dispatches directly to the `generate_image` tool (provided by the `image-gen` plugin). No shell commands, no scripts — just call the tool with an enhanced prompt.

```
generate_image(prompt: "your enhanced prompt here", style: "optional style")
```

The tool calls the image generation model, uploads the result to Supabase Storage, and returns a public URL.

## Process

1. **Get the request** — what does the user want to see?
2. **Check brand context** — look in `MEMORY.md` for brand colors, style preferences, visual identity
3. **Enhance the prompt** — transform the request into a detailed, specific prompt (see below)
4. **Call `generate_image`** — pass the enhanced prompt to the tool
5. **Present the result** — show the image and offer iterations

## Output Format

When you get the URL back from `generate_image`, paste the **bare URL on its own line**. Do NOT wrap it in markdown image syntax. The frontend renders images automatically from the URL.

**Correct:**
```
Here's the image I created for your LinkedIn post!

https://cydhvvqvgrvntzitrrwy.supabase.co/storage/v1/object/public/media/.../generated-123.png

Want me to adjust anything?
```

**Wrong — do NOT do these:**
```
![Generated image](https://...url...)
```
```
{"image": "Generated image"}
```

## Prompt Enhancement Guide

The difference between a mediocre and great image is the prompt. Always enhance before generating.

### Formula

```
[Subject] + [Setting/Environment] + [Style/Medium] + [Lighting] + [Mood/Atmosphere] + [Details]
```

### Enhancement Dimensions

| Dimension | What to add | Examples |
|-----------|------------|---------|
| **Subject** | Specificity, pose, expression | "a confident woman" → "a confident woman in her 30s, smiling, arms crossed" |
| **Setting** | Location, background, context | "office" → "modern open-plan office with floor-to-ceiling windows" |
| **Style** | Art style, medium, aesthetic | "professional" → "clean corporate photography style, shallow depth of field" |
| **Lighting** | Direction, quality, color | add "soft natural light from the left, golden hour warmth" |
| **Mood** | Emotion, atmosphere, energy | add "optimistic, energetic, forward-looking" |
| **Color** | Palette, brand colors, contrast | add "blue and white color palette, high contrast" |
| **Composition** | Framing, angle, focus | add "centered composition, eye-level shot, rule of thirds" |

### LinkedIn-Specific Tips

- Professional, clean aesthetics work best
- Blue tones align with LinkedIn's brand feel
- People photos get higher engagement than abstract graphics
- Leave space for text overlays if creating carousel covers
- Headshots and team photos feel authentic

## Brand Integration

When generating images for a brand:

- **Colors:** Incorporate brand colors into the scene naturally (backgrounds, clothing, objects, lighting tints)
- **Style:** Match the brand's visual identity — minimal brands get clean compositions, bold brands get dynamic angles
- **Consistency:** Reference previous successful images from `MEMORY.md` to maintain visual coherence
- **Logo space:** For LinkedIn graphics, leave room for text overlays or logos (e.g., "with negative space in the upper third for text")

## Tips

- **Be specific over generic** — "golden retriever puppy playing in autumn leaves" beats "dog in park"
- **Name the style** — "watercolor illustration", "35mm film photography", "3D render", "flat vector art"
- **Describe what you want, not what you don't** — "clear blue sky" not "no clouds"
- **For text in images** — current models struggle with text; suggest adding text overlays separately
- **For LinkedIn posts** — pair with `generate-post` to create complete content packages
