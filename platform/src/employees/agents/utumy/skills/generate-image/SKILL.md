---
name: generate-image
description: Generate YouTube thumbnails and images using AI
metadata: {"utumy":{"emoji":"🎨","category":"creative"}, "openclaw":{"command-dispatch":"tool","command-tool":"generate_image"}}
---

# generate-image

Generate YouTube thumbnails and AI images from text prompts using the `generate_image` tool.

## When to Use

User asks to create, generate, design, or make a thumbnail, image, visual, or graphic for YouTube.

## How It Works

This skill dispatches directly to the `generate_image` tool (provided by the `image-gen` plugin). No shell commands, no scripts — just call the tool with an enhanced prompt.

```
generate_image(prompt: "your enhanced prompt here", style: "optional style")
```

The tool calls the image generation model, uploads the result to Supabase Storage, and returns a public URL.

## Process

1. **Get the request** — what does the user want to see?
2. **Check brand context** — look in `MEMORY.md` for brand colors, style preferences, visual identity
3. **Enhance the prompt** — transform the request into a detailed thumbnail prompt (see below)
4. **Call `generate_image`** — pass the enhanced prompt to the tool
5. **Present the result** — show the image and offer iterations

## Output Format

When you get the URL back from `generate_image`, paste the **bare URL on its own line**. Do NOT wrap it in markdown image syntax. The frontend renders images automatically from the URL.

**Correct:**
```
Here's the thumbnail I created for your video!

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

## YouTube Thumbnail Best Practices

Thumbnails are the #1 factor in click-through rate. Every thumbnail should:

- **Be 1280x720** (16:9 aspect ratio)
- **Use bold, readable text** — 3-5 words max, large font
- **High contrast** — bright colors pop against YouTube's white/dark backgrounds
- **Expressive faces** — close-up reactions drive clicks
- **Simple composition** — one clear focal point, not cluttered
- **Consistent branding** — same color scheme / style across videos

### Thumbnail Styles by Video Type

| Video Type | Thumbnail Approach |
|-----------|-------------------|
| **Tutorial** | Before/after split, bold text showing the outcome |
| **Review** | Product close-up + reaction face + rating |
| **Vlog** | Candid moment + location + emotion |
| **List/Tips** | Number overlay + key visual + bold color |
| **Story** | Dramatic moment + mystery/curiosity element |
| **Shorts** | Vertical crop, ultra-bold text, single focus |

## Prompt Enhancement for Thumbnails

### Formula

```
[Subject/Scene] + [Text overlay concept] + [Color scheme] + [Composition] + [YouTube thumbnail style]
```

### Example Transformations

| User says | Enhanced prompt |
|-----------|-----------------|
| "thumbnail for productivity video" | "YouTube thumbnail, split composition: left side cluttered messy desk, right side clean minimalist workspace, bold yellow text overlay area in center, high contrast, bright saturated colors, professional photography style, 16:9 aspect ratio" |
| "thumbnail for cooking tutorial" | "YouTube thumbnail, close-up of a beautiful plated dish with steam rising, warm golden lighting, vibrant food colors, clean composition with negative space on the left for bold text overlay, food photography style, 16:9 aspect ratio" |
| "thumbnail for tech review" | "YouTube thumbnail, sleek gadget product shot on dark gradient background, dramatic side lighting with blue and orange accents, clean minimal composition, space for large bold text on the right, commercial photography style, 16:9 aspect ratio" |

## Brand Integration

When generating thumbnails for a brand:

- **Colors:** Use brand colors for text overlays and accent elements
- **Style:** Match the channel's visual identity — maintain consistency across all thumbnails
- **Logo space:** Consider where the channel logo or watermark sits
- **Series branding:** If it's part of a series, keep layout consistent

### Example with Brand Context

If `MEMORY.md` says brand colors are navy (#1B365D) and gold (#C5A572):

> "YouTube thumbnail, professional scene with navy blue gradient background, golden accent lighting, clean composition with space for bold gold text overlay, consistent brand aesthetic, 16:9 aspect ratio"

## Tips

- **Be specific over generic** — "close-up excited face reacting to code output" beats "person at computer"
- **Think in contrasts** — light/dark, before/after, big/small
- **Name the style** — "commercial photography", "flat illustration", "3D render"
- **Leave text space** — always mention negative space or text overlay area in prompts
- **For series** — reference previous thumbnails from `MEMORY.md` for consistency

## Example Interaction

**User:** "Create a thumbnail for my video about React vs Vue"

1. Check brand context in `MEMORY.md`
2. Enhance: "YouTube thumbnail, split screen comparison layout, React logo blue side vs Vue logo green side, versus symbol in center, dramatic lighting, bold contrasting colors, tech aesthetic with code elements in background, clean composition with space for 'VS' text overlay, digital art style, 16:9 aspect ratio"
3. Call: `generate_image(prompt: "...", style: "digital art")`
4. Present the thumbnail and ask: "Want me to adjust anything — different layout, colors, or style?"
