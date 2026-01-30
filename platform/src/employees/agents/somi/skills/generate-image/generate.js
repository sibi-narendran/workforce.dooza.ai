#!/usr/bin/env node
/**
 * Image Generation Script
 * Uses OpenRouter's Gemini 3 Pro Image Preview model
 *
 * Usage: node generate.js "your prompt here"
 * Returns: JSON with image path or error
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'google/gemini-3-pro-image-preview';

async function generateImage(prompt) {
  if (!OPENROUTER_API_KEY) {
    return { error: 'OPENROUTER_API_KEY not set' };
  }

  if (!prompt) {
    return { error: 'No prompt provided' };
  }

  const requestBody = JSON.stringify({
    model: MODEL,
    modalities: ['image', 'text'],
    messages: [
      { role: 'user', content: prompt }
    ]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://workforce.dooza.ai',
        'X-Title': 'Somi Image Generation'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);

          if (response.error) {
            resolve({ error: response.error.message || 'API error' });
            return;
          }

          const content = response.choices?.[0]?.message?.content;
          if (!content) {
            resolve({ error: 'No content in response' });
            return;
          }

          // Check if content contains base64 image
          // Format: data:image/png;base64,<base64data>
          const imageMatch = content.match(/data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/);

          if (imageMatch) {
            const imageType = imageMatch[1];
            const base64Data = imageMatch[2];

            // Save to temp file
            const filename = `generated-${Date.now()}.${imageType}`;
            const outputDir = process.env.CANVAS_DIR || '/tmp';
            const outputPath = path.join(outputDir, filename);

            fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));

            resolve({
              success: true,
              path: outputPath,
              filename: filename,
              prompt: prompt
            });
          } else {
            // No image in response, return the text content
            resolve({
              success: false,
              message: content,
              note: 'Model returned text instead of image'
            });
          }
        } catch (e) {
          resolve({ error: `Parse error: ${e.message}` });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ error: `Request error: ${e.message}` });
    });

    req.write(requestBody);
    req.end();
  });
}

// Main
const prompt = process.argv.slice(2).join(' ');
generateImage(prompt).then(result => {
  console.log(JSON.stringify(result, null, 2));
});
