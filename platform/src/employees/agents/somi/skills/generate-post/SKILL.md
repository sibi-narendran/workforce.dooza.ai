---
name: generate-post
description: Create platform-optimized social media posts
metadata: {"somi":{"emoji":"📝","category":"content"}}
---

# generate-post

Create engaging, platform-optimized social media posts.

## When to Use

User asks to create, draft, write, or generate a post, caption, tweet, or social media content.

## Before Generating

1. **Check `MEMORY.md`** for brand voice, tone preferences, past learnings
2. **Check recent posts** in `memory/` to avoid repetition
3. **Ask if unclear:** which platform? what topic? any specific angle?

If the user doesn't specify a platform, **default to LinkedIn** and offer to adapt for others.

## Platform Rules

### LinkedIn
- **Character limit:** 3,000 (first 210 visible before "see more")
- **Tone:** Professional but human — thought leadership, insights, stories
- **Hook:** First line must stop the scroll — bold claim, question, or stat
- **Hashtags:** 3–5 max, at the end
- **Line breaks:** Use single-line sentences with blank lines between for readability
- **No emojis overload** — 1–2 per post max, used intentionally

### YouTube
- **Title:** Under 100 chars, front-load keywords, emotionally compelling
- **Description:** First 2 lines visible before "show more" — include hook + key links
- **Tone:** Educational or entertaining, personality-driven
- **Hashtags:** 3–5 in description, relevant to topic
- **Timestamps:** Include chapter markers for longer content
- **CTA:** Subscribe, like, comment — weave naturally into the script

### TikTok
- **Caption limit:** 2,200
- **Tone:** Casual, trend-aware, authentic, fast-paced
- **Hook:** First 1–2 seconds must grab — text overlay or bold statement
- **Hashtags:** 3–5 trending + niche tags
- **Sounds:** Reference trending audio when relevant
- **CTA:** Follow for more, comment your take, duet this

### Instagram
- **Character limit:** 2,200 (caption)
- **Tone:** Visual-first storytelling, relatable, casual
- **Hook:** First line grabs attention (rest hidden behind "more")
- **Hashtags:** 5–15 relevant tags, either in caption or first comment
- **CTA:** Ask a question or prompt saves/shares

### Facebook
- **Character limit:** 63,206 (but shorter is better — aim for under 500)
- **Tone:** Conversational, community-oriented
- **Hook:** Question or relatable statement
- **Hashtags:** 1–3 max, they're less effective here
- **Engagement:** Questions and polls perform well

## Post Structure

Every post follows this framework — adapt per platform:

```
1. HOOK      — Stop the scroll (question, bold take, surprising stat)
2. BODY      — Deliver value (story, insight, list, framework)
3. CTA       — Drive action (comment, share, click, save)
4. HASHTAGS  — Platform-appropriate tags
```

### LinkedIn Template
```
[Hook — bold first line]

[2–4 short paragraphs with line breaks]

[CTA — question or invitation to engage]

#hashtag1 #hashtag2 #hashtag3
```

### YouTube Template
```
Title: [Keyword-rich, compelling title ≤100 chars]

Description:
[Hook — what the viewer will learn/see]

[Key points / timestamps]

[Links, social handles, CTA]

#hashtag1 #hashtag2 #hashtag3
```

### TikTok Template
```
[Hook caption — punchy, trend-aware]

[Value or entertainment angle — 1–2 sentences]

[CTA — follow, comment, duet]

#trending #niche #hashtag
```

### Instagram Template
```
[Hook line — grabs before the fold]

[Story or value — 2–3 short paragraphs]

[CTA — save this, share with someone who needs it, drop a 🔥 if you agree]

.
.
.
#hashtag1 #hashtag2 #hashtag3 ... (up to 15)
```

## Output Format

Always present the draft like this:

```
📝 **[Platform] Post Draft**

---
[The post content here]
---

📊 Characters: [count]/[limit]
#️⃣ Hashtags: [count]

Want me to:
- ✏️ Edit anything?
- 🔄 Adapt for [other platforms]?
- 📅 Save to calendar?
- 📤 Publish it?
```

## Multi-Platform Adaptation

When adapting a post across platforms:
- Don't just copy-paste — **rewrite for each platform's native style**
- LinkedIn version can be longer and more detailed
- YouTube version should be educational/value-driven with timestamps
- Instagram version should be story-driven with a visual angle
- Facebook version should invite conversation
- TikTok version should be trend-aware and fast-paced

After the user approves a draft, offer to save it to the content calendar via `save_post`.

## Brand Voice

Before writing, check if the user has established brand preferences:
- **Tone:** formal, casual, witty, authoritative?
- **Vocabulary:** industry jargon OK or plain language?
- **Perspective:** first person (I/we) or third person?
- **Topics to avoid:** anything off-brand?

If brand context exists in `MEMORY.md`, follow it. If not, ask on the first post and remember the answers.

## Examples

**User:** "Write a LinkedIn post about AI in hiring"

**Draft:**
```
📝 **LinkedIn Post Draft**

---
Most companies say they want to hire the best talent.

Then they screen resumes with a keyword filter from 2010.

AI isn't replacing recruiters — it's replacing bad processes.

The companies getting hiring right are using AI to:
→ Surface non-obvious candidates
→ Reduce time-to-hire by 40%
→ Remove unconscious bias from screening

The ones getting it wrong? Automating the same broken system faster.

The tool doesn't matter. The thinking behind it does.

What's one hiring practice you think AI should fix first?

#AIHiring #TalentAcquisition #FutureOfWork
---

📊 Characters: 487/3,000
#️⃣ Hashtags: 3

Want me to:
- ✏️ Edit anything?
- 🔄 Adapt for YouTube, Instagram, or TikTok?
- 📅 Save to calendar?
- 📤 Publish it?
```
