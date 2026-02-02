import { useState } from 'react'
import { useAuthStore } from '../lib/store'
import { brainApi, BrandExtractResponse } from '../lib/api'

type Tab = 'brand' | 'memory'

interface BrandForm {
  business_name: string
  website: string
  tagline: string
  industry: string
  target_audience: string
  description: string
  value_proposition: string
  primary_color: string
  secondary_color: string
  social_links: Record<string, string>
}

const initialForm: BrandForm = {
  business_name: '',
  website: '',
  tagline: '',
  industry: '',
  target_audience: '',
  description: '',
  value_proposition: '',
  primary_color: '',
  secondary_color: '',
  social_links: {},
}

export function Brain() {
  const { session } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('brand')
  const [form, setForm] = useState<BrandForm>(initialForm)
  const [extractUrl, setExtractUrl] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractSuccess, setExtractSuccess] = useState(false)

  const handleExtract = async () => {
    if (!extractUrl.trim() || !session?.accessToken) return

    // Validate URL
    let url = extractUrl.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url
    }

    try {
      new URL(url)
    } catch {
      setExtractError('Please enter a valid URL')
      return
    }

    setIsExtracting(true)
    setExtractError(null)
    setExtractSuccess(false)

    try {
      const result: BrandExtractResponse = await brainApi.extractBrand(session.accessToken, url)

      if (!result.success) {
        setExtractError(result.error || 'Failed to extract brand info')
        return
      }

      const { extracted } = result

      setForm({
        business_name: extracted.business_name || '',
        website: extracted.website || url,
        tagline: extracted.tagline || '',
        industry: extracted.industry || '',
        target_audience: extracted.target_audience || '',
        description: extracted.description || '',
        value_proposition: extracted.value_proposition || '',
        primary_color: extracted.colors?.primary || '',
        secondary_color: extracted.colors?.secondary || '',
        social_links: extracted.social_links || {},
      })

      setExtractSuccess(true)
      setTimeout(() => setExtractSuccess(false), 3000)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract brand info')
    } finally {
      setIsExtracting(false)
    }
  }

  const updateField = (field: keyof BrandForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div style={{ padding: 32, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>
          Brain
        </h1>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
          Configure your AI employees' knowledge and memory
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 16 }}>
        <button
          className={`btn ${activeTab === 'brand' ? '' : 'btn-ghost'}`}
          onClick={() => setActiveTab('brand')}
          style={{ padding: '8px 16px' }}
        >
          Brand Identity
        </button>
        <button
          className={`btn ${activeTab === 'memory' ? '' : 'btn-ghost'}`}
          onClick={() => setActiveTab('memory')}
          style={{ padding: '8px 16px' }}
        >
          Memory
        </button>
      </div>

      {activeTab === 'brand' ? (
        <div>
          {/* Extract from URL */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
              Auto-Extract Brand Info
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
              Enter your website URL to automatically extract brand information
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <input
                type="text"
                className="input"
                value={extractUrl}
                onChange={(e) => setExtractUrl(e.target.value)}
                placeholder="https://yourcompany.com"
                style={{ flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
              />
              <button
                className="btn"
                onClick={handleExtract}
                disabled={isExtracting || !extractUrl.trim()}
                style={{ minWidth: 140 }}
              >
                {isExtracting ? (
                  <div className="loading" style={{ width: 18, height: 18 }} />
                ) : (
                  'Extract'
                )}
              </button>
            </div>

            {extractError && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  background: 'var(--danger-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--danger)',
                  fontSize: 13,
                }}
              >
                {extractError}
              </div>
            )}

            {extractSuccess && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  background: 'var(--ok-subtle, rgba(34, 197, 94, 0.1))',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--ok, #22c55e)',
                  fontSize: 13,
                }}
              >
                Brand info extracted successfully!
              </div>
            )}
          </div>

          {/* Brand Form */}
          <div className="card">
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
              Brand Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Business Name */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Business Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.business_name}
                  onChange={(e) => updateField('business_name', e.target.value)}
                  placeholder="Acme Inc."
                />
              </div>

              {/* Website */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Website
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.website}
                  onChange={(e) => updateField('website', e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              {/* Tagline */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Tagline
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.tagline}
                  onChange={(e) => updateField('tagline', e.target.value)}
                  placeholder="Your catchy tagline"
                />
              </div>

              {/* Industry */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Industry
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.industry}
                  onChange={(e) => updateField('industry', e.target.value)}
                  placeholder="SaaS, E-commerce, Healthcare..."
                />
              </div>

              {/* Target Audience */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Target Audience
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.target_audience}
                  onChange={(e) => updateField('target_audience', e.target.value)}
                  placeholder="Who are your ideal customers?"
                />
              </div>

              {/* Description */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Description
                </label>
                <textarea
                  className="input"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="What does your company do?"
                  rows={3}
                />
              </div>

              {/* Value Proposition */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Value Proposition
                </label>
                <textarea
                  className="input"
                  value={form.value_proposition}
                  onChange={(e) => updateField('value_proposition', e.target.value)}
                  placeholder="What makes you unique?"
                  rows={2}
                />
              </div>

              {/* Colors */}
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Primary Color
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.primary_color || '#000000'}
                    onChange={(e) => updateField('primary_color', e.target.value)}
                    style={{ width: 40, height: 36, padding: 2, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    className="input"
                    value={form.primary_color}
                    onChange={(e) => updateField('primary_color', e.target.value)}
                    placeholder="#ff5c5c"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Secondary Color
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.secondary_color || '#000000'}
                    onChange={(e) => updateField('secondary_color', e.target.value)}
                    style={{ width: 40, height: 36, padding: 2, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    className="input"
                    value={form.secondary_color}
                    onChange={(e) => updateField('secondary_color', e.target.value)}
                    placeholder="#1a1a2e"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              {/* Social Links */}
              {Object.keys(form.social_links).length > 0 && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                    Social Links
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {Object.entries(form.social_links).map(([platform, url]) => (
                      <a
                        key={platform}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '6px 12px',
                          background: 'var(--bg)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 12,
                          color: 'var(--text)',
                          textDecoration: 'none',
                          textTransform: 'capitalize',
                          border: '1px solid var(--border)',
                        }}
                      >
                        {platform}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--muted)' }}>
              Note: Brand information is currently stored locally and will be used to enhance your AI employees' responses. Database persistence coming soon.
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--muted)' }}>
              <path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08A2.5 2.5 0 0 0 12 20V4.5z" />
              <path d="M12 4.5a2.5 2.5 0 0 1 4.96-.46 2.5 2.5 0 0 1 1.98 3 2.5 2.5 0 0 1 1.32 4.24 3 3 0 0 1-.34 5.58 2.5 2.5 0 0 1-2.96 3.08A2.5 2.5 0 0 1 12 20V4.5z" />
            </svg>
          </div>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-strong)' }}>Memory Coming Soon</h3>
          <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 400, marginInline: 'auto' }}>
            Configure long-term memory and context for your AI employees. This feature is under development.
          </p>
        </div>
      )}
    </div>
  )
}
