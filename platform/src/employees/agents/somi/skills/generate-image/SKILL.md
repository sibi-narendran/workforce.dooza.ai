---
name: generate-image
description: Generate images from text descriptions using AI
metadata: {"somi":{"emoji":"🎨","category":"creative"}, "openclaw":{"command-dispatch":"tool","command-tool":"generate_image"}}
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
Here's the sunset image I created for you!

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

### Example Transformations

| User says | Enhanced prompt |
|-----------|-----------------|
| "sunset" | "A dramatic sunset over calm ocean waters, golden hour, warm orange and pink sky with purple clouds, light reflected on gentle waves, wide-angle landscape composition, photorealistic" |
| "cat" | "A fluffy orange tabby cat sitting on a sunlit windowsill, soft natural side lighting, cozy indoor setting with blurred bookshelves behind, detailed fur texture, warm color palette, portrait photography style" |
| "logo" | "Modern minimalist logo design on white background, clean geometric shapes forming abstract mark, professional business aesthetic, vector art style, balanced composition, sharp edges" |
| "team meeting" | "Diverse team of professionals collaborating around a modern conference table, bright airy office space, natural window light, candid documentary style, warm and productive atmosphere, shallow depth of field" |
| "product launch" | "Sleek product floating on a gradient background, dramatic studio lighting with rim light, modern and premium feel, clean minimalist composition, subtle shadows and reflections, commercial photography style" |
| "coffee shop" | "Cozy artisan coffee shop interior, warm ambient lighting from pendant lamps, exposed brick walls, wooden countertops, fresh pastries on display, plants on shelves, morning light streaming through large windows, inviting atmosphere, lifestyle photography" |

## Brand Integration

When generating images for a brand:

- **Colors:** Incorporate brand colors into the scene naturally (backgrounds, clothing, objects, lighting tints)
- **Style:** Match the brand's visual identity — minimal brands get clean compositions, bold brands get dynamic angles
- **Consistency:** Reference previous successful images from `MEMORY.md` to maintain visual coherence
- **Logo space:** For social media graphics, leave room for text overlays or logos (e.g., "with negative space in the upper third for text")

### Example with Brand Context

If `MEMORY.md` says brand colors are navy (#1B365D) and gold (#C5A572):

> "Professional headshot-style portrait, navy blue gradient background, warm golden accent lighting from the side, clean corporate aesthetic, modern and approachable"

## Tips

- **Be specific over generic** — "golden retriever puppy playing in autumn leaves" beats "dog in park"
- **Name the style** — "watercolor illustration", "35mm film photography", "3D render", "flat vector art"
- **Describe what you want, not what you don't** — "clear blue sky" not "no clouds"
- **For text in images** — current models struggle with text; suggest adding text overlays separately
- **For social media posts** — pair with `generate-post` to create complete content packages

## Example Interaction

**User:** "Create an image for our blog post about remote work"

1. Check brand context in `MEMORY.md`
2. Enhance: "Modern home office setup with a laptop, coffee mug, and notebook on a clean wooden desk, large window showing a city skyline in the background, soft natural morning light, plants adding greenery, warm and productive atmosphere, lifestyle photography style, bright and airy color palette"
3. Call: `generate_image(prompt: "Modern home office setup with a laptop, coffee mug, and notebook on a clean wooden desk, large window showing a city skyline in the background, soft natural morning light, plants adding greenery, warm and productive atmosphere, lifestyle photography style, bright and airy color palette")`
4. Present the image and ask: "Want me to adjust anything — different angle, lighting, or style?"
