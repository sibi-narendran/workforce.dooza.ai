---
name: fetch-brand-assets
description: Retrieve brand assets (logos, colors, fonts) for use in content creation.
metadata: {"somi":{"emoji":"🏷️","category":"creative"}}
---

# fetch-brand-assets

Get brand assets from workspace.

## When to Use
- Creating content that needs brand consistency
- User asks about brand colors, logos, fonts
- Before generating images

## Where to Look
```
workspace/
└── brand/
    ├── brand.json      # Colors, fonts, voice
    └── logos/          # Logo files
```

## Output
Return colors (hex), fonts, logo paths, and brand voice description.
