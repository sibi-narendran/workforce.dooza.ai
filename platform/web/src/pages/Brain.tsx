import { useState, useEffect } from 'react'
import { useAuthStore } from '../lib/store'
import { brainApi, BrandExtractResponse, BrainBrand, BrainItem } from '../lib/api'

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

// Map API brand to form
function mapBrandToForm(brand: BrainBrand): BrandForm {
  return {
    business_name: brand.businessName || '',
    website: brand.website || '',
    tagline: brand.tagline || '',
    industry: brand.industry || '',
    target_audience: brand.targetAudience || '',
    description: brand.description || '',
    value_proposition: brand.valueProposition || '',
    primary_color: brand.primaryColor || '',
    secondary_color: brand.secondaryColor || '',
    social_links: brand.socialLinks || {},
  }
}

// Map form to API brand (logoUrl is handled separately since it's not in the form)
function mapFormToBrand(form: BrandForm): Partial<BrainBrand> {
  return {
    businessName: form.business_name || null,
    website: form.website || null,
    tagline: form.tagline || null,
    industry: form.industry || null,
    targetAudience: form.target_audience || null,
    description: form.description || null,
    valueProposition: form.value_proposition || null,
    primaryColor: form.primary_color || null,
    secondaryColor: form.secondary_color || null,
    socialLinks: Object.keys(form.social_links).length > 0 ? form.social_links : null,
  }
}

export function Brain() {
  const { session } = useAuthStore()
  const [activeTab, setActiveTab] = useState<Tab>('brand')
  const [form, setForm] = useState<BrandForm>(initialForm)
  const [savedForm, setSavedForm] = useState<BrandForm>(initialForm)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Extract state
  const [extractUrl, setExtractUrl] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractSuccess, setExtractSuccess] = useState(false)

  // Files state
  const [files, setFiles] = useState<BrainItem[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [, setLogoPath] = useState<string | null>(null)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  // Load brand, files, and logo on mount
  useEffect(() => {
    if (session?.accessToken) {
      setIsLoading(true)
      Promise.all([
        brainApi.getBrand(session.accessToken),
        brainApi.getItems(session.accessToken),
        brainApi.getLogoUrl(session.accessToken),
      ]).then(([brandRes, itemsRes, logoRes]) => {
        if (brandRes.brand) {
          const mapped = mapBrandToForm(brandRes.brand)
          setForm(mapped)
          setSavedForm(mapped)
          setLogoPath(brandRes.brand.logoUrl)
        }
        setFiles(itemsRes.items || [])
        if (logoRes.url) {
          setLogoUrl(logoRes.url)
        }
      }).catch(console.error)
        .finally(() => setIsLoading(false))
    }
  }, [session?.accessToken])

  // Track changes
  useEffect(() => {
    setHasChanges(JSON.stringify(form) !== JSON.stringify(savedForm))
  }, [form, savedForm])

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

      const extractedForm: BrandForm = {
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
      }

      setForm(extractedForm)

      // Auto-save extracted data to DB (including logo path)
      const brandData = {
        ...mapFormToBrand(extractedForm),
        logoUrl: extracted.logo_url,
      }
      await brainApi.saveBrand(session.accessToken, brandData)
      setSavedForm(extractedForm)

      // Update logo state if a logo was extracted
      if (extracted.logo_url) {
        setLogoPath(extracted.logo_url)
        // Fetch signed URL for display
        const logoRes = await brainApi.getLogoUrl(session.accessToken)
        if (logoRes.url) {
          setLogoUrl(logoRes.url)
        }
      }

      setExtractSuccess(true)
      setTimeout(() => setExtractSuccess(false), 3000)
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract brand info')
    } finally {
      setIsExtracting(false)
    }
  }

  const handleSave = async () => {
    if (!session?.accessToken) return

    setIsSaving(true)
    try {
      await brainApi.saveBrand(session.accessToken, mapFormToBrand(form))
      setSavedForm(form)
      setHasChanges(false)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim() || !session?.accessToken) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('title', uploadName.trim())
      formData.append('type', uploadFile.type.startsWith('image') ? 'image' : 'file')

      const result = await brainApi.createItem(session.accessToken, formData)
      if (result.item) {
        setFiles(prev => [result.item!, ...prev])
      }

      setShowUploadModal(false)
      setUploadFile(null)
      setUploadName('')
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteFile = async (id: string) => {
    if (!session?.accessToken) return

    try {
      await brainApi.deleteItem(session.accessToken, id)
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const updateField = (field: keyof BrandForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !session?.accessToken) return

    setIsUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', 'Brand Logo')
      formData.append('type', 'image')

      // Upload to items (this will store in brain bucket)
      const result = await brainApi.createItem(session.accessToken, formData)
      if (result.item) {
        // Save the logo path to brand
        await brainApi.saveBrand(session.accessToken, {
          ...mapFormToBrand(form),
          logoUrl: result.item.filePath,
        })
        setLogoPath(result.item.filePath)

        // Fetch signed URL for display
        const logoRes = await brainApi.getLogoUrl(session.accessToken)
        if (logoRes.url) {
          setLogoUrl(logoRes.url)
        }
      }
    } catch (err) {
      console.error('Logo upload failed:', err)
    } finally {
      setIsUploadingLogo(false)
    }

    e.target.value = ''
  }

  const getFileIcon = (type: string, mimeType: string | null) => {
    if (type === 'image' || mimeType?.startsWith('image/')) return '🖼️'
    if (mimeType?.includes('pdf')) return '📕'
    if (mimeType?.includes('video')) return '🎬'
    if (mimeType?.includes('audio')) return '🎵'
    return '📄'
  }

  if (isLoading) {
    return (
      <div style={{ padding: 32, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="loading" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  return (
    <div className="page-content" style={{ padding: 32, height: '100%', overflowY: 'auto', paddingBottom: hasChanges ? 100 : 32 }}>
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
          Files
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
                Brand info extracted and saved!
              </div>
            )}
          </div>

          {/* Logo Section */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
              Logo
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Brand Logo"
                  style={{
                    width: 80,
                    height: 80,
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg)',
                    padding: 8,
                  }}
                />
              ) : (
                <div style={{
                  width: 80,
                  height: 80,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--muted)',
                  fontSize: 32,
                }}>
                  ?
                </div>
              )}
              <div>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                  {logoUrl ? 'Extracted from website' : 'No logo found'}
                </p>
                {!logoUrl && (
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 8, padding: '4px 12px', fontSize: 12 }}
                    onClick={() => document.getElementById('logo-input')?.click()}
                    disabled={isUploadingLogo}
                  >
                    {isUploadingLogo ? (
                      <div className="loading" style={{ width: 14, height: 14 }} />
                    ) : (
                      'Upload Logo'
                    )}
                  </button>
                )}
                {logoUrl && (
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 8, padding: '4px 12px', fontSize: 12 }}
                    onClick={() => document.getElementById('logo-input')?.click()}
                    disabled={isUploadingLogo}
                  >
                    {isUploadingLogo ? (
                      <div className="loading" style={{ width: 14, height: 14 }} />
                    ) : (
                      'Change Logo'
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Hidden logo input */}
          <input
            id="logo-input"
            type="file"
            accept="image/*"
            hidden
            onChange={handleLogoUpload}
          />

          {/* Brand Form */}
          <div className="card">
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
              Brand Details
            </h3>

            <div className="brain-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
          </div>
        </div>
      ) : (
        <div>
          {/* Files List */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-strong)' }}>
                Uploaded Files
              </h3>
              <button
                className="btn"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                + Add File
              </button>
            </div>

            {files.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.5 }}>📁</div>
                <p style={{ margin: 0, color: 'var(--muted)' }}>
                  No files uploaded yet. Add files for your AI employees to reference.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {files.map(file => (
                  <div
                    key={file.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      background: 'var(--bg)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{getFileIcon(file.type, file.mimeType)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{file.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {file.fileName}
                        {file.fileSize && ` • ${(file.fileSize / 1024).toFixed(1)} KB`}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDeleteFile(file.id)}
                      style={{ padding: '6px 12px', fontSize: 12, color: 'var(--danger)' }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        id="file-input"
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            setUploadFile(file)
            setUploadName(file.name.split('.').slice(0, -1).join('.') || file.name)
            setShowUploadModal(true)
          }
          e.target.value = ''
        }}
      />

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowUploadModal(false)}
        >
          <div
            className="card"
            style={{ width: 400, maxWidth: '90vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
              Name this file
            </h3>
            <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
              Give it a descriptive name so AI can find it easily
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                Display Name
              </label>
              <input
                className="input"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. Company Logo, Product Brochure"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleUpload()}
              />
            </div>

            <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Selected file:</div>
              <div style={{ fontWeight: 500, marginTop: 4 }}>{uploadFile?.name}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowUploadModal(false)}>
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleUpload}
                disabled={isUploading || !uploadName.trim()}
              >
                {isUploading ? (
                  <div className="loading" style={{ width: 18, height: 18 }} />
                ) : (
                  'Upload'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Save Button */}
      {hasChanges && (
        <div
          className="brain-save-bar"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-card)',
            padding: '12px 24px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            border: '1px solid var(--border)',
            zIndex: 100,
          }}
        >
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>You have unsaved changes</span>
          <button className="btn" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <div className="loading" style={{ width: 18, height: 18 }} />
            ) : (
              'Save'
            )}
          </button>
        </div>
      )}

      {/* Floating + button for brand tab */}
      {activeTab === 'brand' && (
        <button
          className="btn"
          onClick={() => document.getElementById('file-input')?.click()}
          style={{
            position: 'fixed',
            bottom: hasChanges ? 80 : 24,
            right: 24,
            borderRadius: '50%',
            width: 56,
            height: 56,
            fontSize: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            zIndex: 99,
          }}
          title="Upload file"
        >
          +
        </button>
      )}
    </div>
  )
}
