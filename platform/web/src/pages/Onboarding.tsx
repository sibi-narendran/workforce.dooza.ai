import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../lib/store'
import { brainApi } from '../lib/api'
import type { BrandExtractResponse, BrainBrand } from '../lib/api'
import './Onboarding.css'

type Step = 'url-input' | 'scanning' | 'brand-review'

const CAROUSEL_CARDS = [
  { img: '/avatars/somi.png',   humanName: 'Somi',    role: 'Social Media Manager', line: 'I post on your socials every day. You sleep, I grow your audience.' },
  { img: '/avatars/hunter.png', humanName: 'Hunter',  role: 'Sales & Outreach',     line: 'Every lead gets a reply in seconds. I do outreach and convert them for you.' },
  { img: '/avatars/reema.png',  humanName: 'Reema',   role: 'Short-Form Video',     line: 'I generate short-form videos for your brand and post them before lunch.' },
  { img: '/avatars/ranky.png',  humanName: 'Ranky',   role: 'SEO Specialist',       line: 'I analyze your competitors and put you on page one.' },
  { img: '/avatars/linky.png',  humanName: 'Linky',   role: 'LinkedIn Specialist',  line: 'I grow your LinkedIn while you focus on closing deals.' },
  { img: '/avatars/utumy.png',  humanName: 'Utumy',   role: 'YouTube Specialist',   line: 'I plan, script, and schedule your YouTube — completely hands-free.' },
]

const CAROUSEL_INTERVAL_MS = 4500
const MIN_SCAN_DURATION_MS = 10000
const SCAN_TIMEOUT_MS = 30000

interface ExtractedBrand {
  businessName: string | null
  website: string | null
  tagline: string | null
  industry: string | null
  targetAudience: string | null
  description: string | null
  valueProposition: string | null
  primaryColor: string | null
  secondaryColor: string | null
  socialLinks: Record<string, string> | null
  logoUrl: string | null
}

function mapExtractedToBrand(extracted: BrandExtractResponse['extracted'], url: string): ExtractedBrand {
  return {
    businessName: extracted.business_name,
    website: extracted.website || url,
    tagline: extracted.tagline,
    industry: extracted.industry,
    targetAudience: extracted.target_audience,
    description: extracted.description,
    valueProposition: extracted.value_proposition,
    primaryColor: extracted.colors?.primary || null,
    secondaryColor: extracted.colors?.secondary || null,
    socialLinks: extracted.social_links,
    logoUrl: extracted.logo_url,
  }
}

export function Onboarding() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuthStore()
  const token = session?.accessToken || ''

  const [step, setStep] = useState<Step>('url-input')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [brand, setBrand] = useState<ExtractedBrand | null>(null)
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null)

  // Carousel state
  const [activeCard, setActiveCard] = useState(0)
  const [cardState, setCardState] = useState<'entering' | 'exiting'>('entering')

  // Preload all carousel avatars on mount so they're instant when scanning starts
  useEffect(() => {
    CAROUSEL_CARDS.forEach(card => {
      const preload = new Image()
      preload.src = card.img
    })
  }, [])

  // Carousel cycling
  useEffect(() => {
    if (step !== 'scanning') return

    const interval = setInterval(() => {
      setCardState('exiting')
      setTimeout(() => {
        setActiveCard(prev => (prev + 1) % CAROUSEL_CARDS.length)
        setCardState('entering')
      }, 400)
    }, CAROUSEL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [step])

  const handleSubmitUrl = useCallback(async () => {
    if (!url.trim() || !token) return

    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }

    try {
      new URL(normalizedUrl)
    } catch {
      setError('Please enter a valid URL')
      return
    }

    setError(null)
    setStep('scanning')
    setActiveCard(0)
    setCardState('entering')

    try {
      const [, result] = await Promise.all([
        new Promise(resolve => setTimeout(resolve, MIN_SCAN_DURATION_MS)),
        Promise.race([
          brainApi.extractBrand(token, normalizedUrl),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Scan timed out. Please try again.')), SCAN_TIMEOUT_MS)
          ),
        ]),
      ]) as [unknown, BrandExtractResponse]

      const mapped = mapExtractedToBrand(result.extracted, normalizedUrl)
      setBrand(mapped)

      // Save brand to DB immediately
      await brainApi.saveBrand(token, mapped as Partial<Omit<BrainBrand, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>)
      queryClient.setQueryData(['brand-check'], { brand: mapped })

      // Fetch signed logo URL if there's a logo
      if (mapped.logoUrl) {
        try {
          const logoRes = await brainApi.getLogoUrl(token)
          if (logoRes.url) setLogoSignedUrl(logoRes.url)
        } catch {
          // Logo URL fetch failed, non-critical
        }
      }

      setStep('brand-review')
    } catch {
      // Network failure or timeout — proceed with empty brand so user isn't stuck
      const fallback = mapExtractedToBrand({
        business_name: null, website: normalizedUrl, tagline: null,
        colors: null, social_links: null, description: null,
        value_proposition: null, target_audience: null, industry: null, logo_url: null,
      }, normalizedUrl)
      setBrand(fallback)
      setStep('brand-review')
    }
  }, [url, token, queryClient])

  const handleGetStarted = () => {
    navigate('/library', { replace: true })
  }

  const handleSkip = async () => {
    // Save a minimal brand so OnboardingGate lets the user through
    const minimal = { businessName: 'My Business', website: null }
    try {
      await brainApi.saveBrand(token, minimal as any)
    } catch {
      // Non-critical — still let them through
    }
    queryClient.setQueryData(['brand-check'], { brand: minimal })
    navigate('/library', { replace: true })
  }

  return (
    <div className="onboarding">
      {step === 'url-input' && <UrlInputStep
        url={url}
        setUrl={setUrl}
        error={error}
        onSubmit={handleSubmitUrl}
        onSkip={handleSkip}
      />}

      {step === 'scanning' && <ScanningStep
        activeCard={activeCard}
        cardState={cardState}
      />}

      {step === 'brand-review' && <BrandReviewStep
        brand={brand}
        logoUrl={logoSignedUrl}
        onGetStarted={handleGetStarted}
      />}
    </div>
  )
}

/* ─── Step Components ─── */

function UrlInputStep({
  url, setUrl, error, onSubmit, onSkip,
}: {
  url: string
  setUrl: (v: string) => void
  error: string | null
  onSubmit: () => void
  onSkip: () => void
}) {
  return (
    <div className="onboarding-section">
      <h1>Your AI team is almost ready</h1>
      <p className="subtitle">Drop your website and we'll build a workforce that knows your brand</p>

      {error && <div className="onboarding-error">{error}</div>}

      <div className="url-form">
        <input
          type="text"
          className="input"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://yourcompany.com"
          onKeyDown={e => e.key === 'Enter' && onSubmit()}
          autoFocus
        />
        <button
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={!url.trim()}
        >
          Build My Team
        </button>
      </div>
      <button
        onClick={onSkip}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          fontSize: 13,
          cursor: 'pointer',
          marginTop: 12,
          padding: '4px 8px',
        }}
      >
        I don't have a website yet — skip
      </button>
    </div>
  )
}

function ScanningStep({
  activeCard, cardState,
}: {
  activeCard: number
  cardState: 'entering' | 'exiting'
}) {
  const card = CAROUSEL_CARDS[activeCard]

  return (
    <div className="onboarding-section">
      <h2 className="scanning-title">Setting up your AI workforce...</h2>

      <div className="carousel-wrapper">
        <div
          key={activeCard}
          className={`carousel-card carousel-card--${cardState}`}
        >
          <img
            src={card.img}
            alt={card.humanName}
            className="agent-avatar"
          />
          <span className="agent-name">{card.humanName}</span>
          <span className="agent-role">{card.role}</span>
          <span className="agent-line">{card.line}</span>
        </div>
      </div>

      <div className="progress-track">
        <div className="progress-fill" />
      </div>
    </div>
  )
}

function BrandReviewStep({
  brand, logoUrl, onGetStarted,
}: {
  brand: ExtractedBrand | null
  logoUrl: string | null
  onGetStarted: () => void
}) {
  if (!brand) return null

  const hasData = !!(brand.businessName || brand.description || brand.industry)

  return (
    <div className="onboarding-section">
      {hasData ? (
        <>
          <h1>Here's what we found</h1>
          <p className="subtitle">We extracted your brand identity from your website</p>
        </>
      ) : (
        <>
          <h1>You're all set!</h1>
          <p className="subtitle">We couldn't read your site this time, but that's okay — your AI team is ready to go</p>
        </>
      )}

      {hasData && (
        <div className="brand-card">
          <div className="card">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="brand-logo" />
            ) : (
              <div className="brand-logo-placeholder">
                {brand.businessName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="brand-info">
              <h3>{brand.businessName || brand.website || 'Your Business'}</h3>
              {brand.industry && (
                <span className="badge badge-primary">{brand.industry}</span>
              )}
              {brand.description && (
                <p className="brand-description">{brand.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="onboarding-actions">
        <button className="btn btn-primary" onClick={onGetStarted}>
          Hire Your First AI Employee
        </button>
      </div>
    </div>
  )
}
