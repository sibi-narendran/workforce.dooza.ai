import { db } from './client.js'
import { integrationProviders } from './schema.js'

const PROVIDERS = [
  { slug: 'gmail', name: 'Gmail', description: 'Read and send emails from your Gmail account', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', composioToolkit: 'GMAIL', category: 'communication' },
  { slug: 'google-calendar', name: 'Google Calendar', description: 'Manage your calendar events and schedules', icon: 'https://calendar.google.com/googlecalendar/images/favicons_2020q4/calendar_31.ico', composioToolkit: 'GOOGLECALENDAR', category: 'productivity' },
  { slug: 'google-drive', name: 'Google Drive', description: 'Access and manage files in your Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png', composioToolkit: 'GOOGLEDRIVE', category: 'storage' },
  { slug: 'slack', name: 'Slack', description: 'Send messages and interact with Slack workspaces', icon: 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png', composioToolkit: 'SLACK', category: 'communication' },
  { slug: 'github', name: 'GitHub', description: 'Manage repositories, issues, and pull requests', icon: 'https://github.githubassets.com/favicons/favicon.svg', composioToolkit: 'GITHUB', category: 'dev' },
  { slug: 'notion', name: 'Notion', description: 'Access and update your Notion workspace', icon: 'https://www.notion.so/images/favicon.ico', composioToolkit: 'NOTION', category: 'productivity' },
  { slug: 'linear', name: 'Linear', description: 'Manage issues and projects in Linear', icon: 'https://linear.app/favicon.ico', composioToolkit: 'LINEAR', category: 'dev' },
  { slug: 'discord', name: 'Discord', description: 'Send messages and interact with Discord servers', icon: 'https://discord.com/assets/favicon.ico', composioToolkit: 'DISCORD', category: 'communication' },
  { slug: 'twitter', name: 'Twitter/X', description: 'Post tweets and interact with Twitter', icon: 'https://www.google.com/s2/favicons?domain=x.com&sz=64', composioToolkit: 'TWITTER', category: 'social' },
  { slug: 'linkedin', name: 'LinkedIn', description: 'Create posts and manage your LinkedIn presence', icon: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=64', composioToolkit: 'LINKEDIN', category: 'social' },
  { slug: 'facebook', name: 'Facebook', description: 'Publish posts to your Facebook pages', icon: 'https://www.google.com/s2/favicons?domain=facebook.com&sz=64', composioToolkit: 'FACEBOOK', category: 'social' },
  { slug: 'instagram', name: 'Instagram', description: 'Publish photos and stories to Instagram', icon: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=64', composioToolkit: 'INSTAGRAM', category: 'social' },
  { slug: 'youtube', name: 'YouTube', description: 'Upload videos and manage your YouTube channel', icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64', composioToolkit: 'YOUTUBE', category: 'social' },
  { slug: 'tiktok', name: 'TikTok', description: 'Publish videos to TikTok', icon: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=64', composioToolkit: 'TIKTOK', category: 'social' },
  { slug: 'trello', name: 'Trello', description: 'Manage boards, lists, and cards in Trello', icon: 'https://trello.com/favicon.ico', composioToolkit: 'TRELLO', category: 'productivity' },
  { slug: 'asana', name: 'Asana', description: 'Manage tasks and projects in Asana', icon: 'https://asana.com/favicon.ico', composioToolkit: 'ASANA', category: 'productivity' },
]

async function seed() {
  for (const p of PROVIDERS) {
    await db.insert(integrationProviders).values({
      slug: p.slug,
      name: p.name,
      description: p.description,
      icon: p.icon,
      composioAppKey: p.composioToolkit,
      composioToolkit: p.composioToolkit,
      category: p.category,
      isActive: true,
    }).onConflictDoUpdate({
      target: integrationProviders.slug,
      set: { name: p.name, description: p.description, icon: p.icon, composioToolkit: p.composioToolkit, category: p.category }
    })
    console.log('✓', p.name)
  }
  console.log('\nDone!')
  process.exit(0)
}

seed()
