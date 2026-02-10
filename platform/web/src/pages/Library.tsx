import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary, useInstallAgent, useEmployees, getErrorMessage } from '../lib/queries'
import { useAuthStore } from '../lib/store'
import { ErrorDisplay } from '../components/ErrorDisplay'
import type { LibraryAgent, Employee } from '../lib/api'
import { AgentAvatar, agentTagline } from '../components/AgentAvatar'

/** Punchy one-liners for the library cards */
const PITCH: Record<string, string> = {
  somi: 'Posts on your socials daily. You sleep, your audience grows.',
  linky: 'Grows your LinkedIn while you focus on closing deals.',
  utumy: 'Plans, scripts, and schedules your YouTube — hands-free.',
  ranky: 'Puts you on page one. Watches your competitors so you don\'t have to.',
  writer: 'Blog posts, emails, landing pages — all in your brand voice.',
  researcher: 'Digs up answers and insights so you don\'t have to Google.',
  'data-analyst': 'Turns your messy data into clear, actionable insights.',
  'customer-support': 'Replies to every customer instantly, 24/7.',
  'code-reviewer': 'Reviews every PR like a senior engineer who never sleeps.',
  'project-manager': 'Keeps your team on track without the meetings.',
}

function agentPitch(slug: string, fallbackDesc: string | null): string {
  return PITCH[slug] || fallbackDesc || 'Your next AI employee — ready to work.'
}

/** Human-readable capabilities shown as bullet points */
const CAPABILITIES: Record<string, string[]> = {
  somi: ['Daily social media posts', 'Multi-platform scheduling', 'Brand-voice content'],
  linky: ['LinkedIn post creation', 'Professional tone writing', 'Engagement optimization'],
  utumy: ['Video scripting & planning', 'Title & description writing', 'Thumbnail & tag strategy'],
  ranky: ['Keyword research', 'On-page SEO audits', 'Competitor analysis'],
  writer: ['Blog posts & articles', 'Email campaigns', 'Landing page copy'],
  researcher: ['Deep web research', 'Summary & insights', 'Source verification'],
  'data-analyst': ['Data visualization', 'Trend analysis', 'Report generation'],
  'customer-support': ['Instant replies', 'FAQ handling', 'Ticket routing'],
  'code-reviewer': ['PR review & feedback', 'Bug detection', 'Best practice checks'],
  'project-manager': ['Task tracking', 'Deadline management', 'Team coordination'],
}

/** Lightweight canvas confetti burst */
function fireConfetti(originX: number, originY: number) {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')!

  const colors = ['#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#3b82f6', '#22c55e']
  const particles: { x: number; y: number; vx: number; vy: number; r: number; color: string; life: number }[] = []

  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 6
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      r: 3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    })
  }

  let frame: number
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let alive = false
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.15
      p.life -= 0.015
      if (p.life <= 0) continue
      alive = true
      ctx.globalAlpha = p.life
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    if (alive) {
      frame = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(frame)
      canvas.remove()
    }
  }
  frame = requestAnimationFrame(animate)
}

export function Library() {
  const { session } = useAuthStore()
  const { data: agents, isLoading, error, refetch } = useLibrary()
  const { data: employees } = useEmployees()
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')
  const [success, setSuccess] = useState('')

  const installAgent = useInstallAgent()

  const handleInstall = async (agent: LibraryAgent, e: React.MouseEvent) => {
    if (!session?.accessToken) {
      setLocalError('Please log in to hire agents')
      return
    }

    setInstallingId(agent.id)
    setLocalError('')
    setSuccess('')

    try {
      await installAgent.mutateAsync({ agentId: agent.id })
      setSuccess(`${agent.name} hired! Go to Employees to chat.`)
      // Fire confetti from the button position
      fireConfetti(e.clientX, e.clientY)
    } catch (err) {
      setLocalError(getErrorMessage(err))
    } finally {
      setInstallingId(null)
    }
  }

  // Build a map from library agent ID to employee (for "Chat" links)
  const employeeByAgentId = new Map<string, Employee>()
  for (const emp of employees ?? []) {
    if (emp.agentId) employeeByAgentId.set(emp.agentId, emp)
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  if (error) {
    return <ErrorDisplay message={getErrorMessage(error)} onRetry={() => refetch()} />
  }

  const categories = [...new Set((agents ?? []).map(a => a.category || 'other'))]

  return (
    <div
      style={{
        padding: 32,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: 'var(--text-strong)' }}>
          Who do you want to hire?
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 15 }}>
          Every employee works 24/7, knows your brand, and never calls in sick.
        </p>
      </div>

      {/* Messages */}
      {localError && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--danger-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {localError}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--success-subtle, rgba(16, 185, 129, 0.1))',
            borderRadius: 'var(--radius-md)',
            color: 'var(--success, #10b981)',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {success}
        </div>
      )}

      {/* Agents by category */}
      {categories.map((category) => (
        <div key={category} style={{ marginBottom: 32 }}>
          <h2
            style={{
              margin: '0 0 16px',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--text-strong)',
              textTransform: 'capitalize',
            }}
          >
            {category}
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {(agents ?? [])
              .filter((a) => (a.category || 'other') === category)
              .map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onInstall={(e) => handleInstall(agent, e)}
                  installing={installingId === agent.id}
                  isLoggedIn={!!session?.accessToken}
                  isInstalled={agent.isInstalled || false}
                  employee={employeeByAgentId.get(agent.id)}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AgentCard({
  agent,
  onInstall,
  installing,
  isLoggedIn,
  isInstalled,
  employee,
}: {
  agent: LibraryAgent
  onInstall: (e: React.MouseEvent) => void
  installing: boolean
  isLoggedIn: boolean
  isInstalled: boolean
  employee?: Employee
}) {
  const tagline = agentTagline(agent.slug)
  const pitch = agentPitch(agent.slug, agent.description)
  const caps = CAPABILITIES[agent.slug] || []

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'center',
        textAlign: 'center',
        padding: '24px 20px 20px',
      }}
    >
      {/* Avatar centered */}
      <div style={{ position: 'relative' }}>
        <AgentAvatar slug={agent.slug} name={agent.name} size={80} />
        {isInstalled && (
          <div
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#22c55e',
              border: '2px solid white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              color: 'white',
            }}
          >
            ✓
          </div>
        )}
      </div>

      {/* Name + designation */}
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 700,
            color: 'var(--text-strong)',
          }}
        >
          {agent.name}
        </h3>
        <div
          style={{
            fontSize: 13,
            color: 'var(--primary-600)',
            fontWeight: 500,
            marginTop: 3,
          }}
        >
          {tagline}
        </div>
      </div>

      {/* Pitch line */}
      <p
        style={{
          margin: 0,
          fontSize: 13,
          color: 'var(--muted)',
          lineHeight: 1.5,
        }}
      >
        {pitch}
      </p>

      {/* Capabilities as bullets */}
      {caps.length > 0 && (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: 'none',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {caps.map((cap) => (
            <li
              key={cap}
              style={{
                fontSize: 12,
                color: 'var(--text)',
                padding: '4px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: 'var(--primary-500)', fontSize: 14, lineHeight: 1 }}>•</span>
              {cap}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginTop: 'auto',
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
          width: '100%',
        }}
      >
        {isInstalled ? (
          <>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 8,
                fontSize: 13,
                fontWeight: 600,
                color: '#22c55e',
              }}
            >
              Hired
            </div>
            {employee && (
              <Link
                to={`/employees/${employee.id}/chat`}
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: 13 }}
              >
                Chat
              </Link>
            )}
          </>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onInstall}
            disabled={installing || !isLoggedIn}
            style={{ flex: 1, padding: 10, fontSize: 14 }}
          >
            {installing ? (
              <div className="loading" style={{ width: 16, height: 16 }} />
            ) : isLoggedIn ? (
              'Hire'
            ) : (
              'Login to Hire'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
