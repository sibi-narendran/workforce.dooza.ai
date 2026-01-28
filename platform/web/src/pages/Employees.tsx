import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { employeesApi, ApiError, type Employee, type EmployeeTemplate, type Skill, type Model } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { EmployeeCard } from '../components/EmployeeCard'

export function Employees() {
  const { session, clearAuth } = useAuthStore()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [templates, setTemplates] = useState<EmployeeTemplate[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      // Load employees (public endpoint - no auth required)
      const empRes = await employeesApi.list(session?.accessToken || '')
      setEmployees(empRes.employees)

      // Load templates/skills/models only if authenticated
      if (session?.accessToken) {
        const [templatesRes, skillsRes, modelsRes] = await Promise.all([
          employeesApi.templates(session.accessToken),
          employeesApi.skills(session.accessToken),
          employeesApi.models(session.accessToken),
        ])
        setTemplates(templatesRes.templates)
        setSkills(skillsRes.skills)
        setModels(modelsRes.models)
      }
    } catch (error) {
      console.error('Failed to load employees:', error)
      if (error instanceof ApiError) {
        if (error.status === 401) {
          clearAuth()
          return
        }
        setLoadError(error.message)
      } else {
        setLoadError('Failed to load employees. Please check your connection and try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [session?.accessToken, clearAuth])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="loading" />
      </div>
    )
  }

  // Show error state with retry option
  if (loadError && employees.length === 0) {
    return (
      <div style={{ padding: 32, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center', padding: 40, maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', color: 'var(--text-strong)' }}>Failed to Load Employees</h2>
          <p style={{ margin: '0 0 20px', color: 'var(--muted)', fontSize: 14 }}>
            {loadError}
          </p>
          <button className="btn" onClick={loadData}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, height: '100%', overflowY: 'auto' }}>
      {/* Error Banner (when partial data loaded) */}
      {loadError && employees.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--danger-subtle, rgba(239, 68, 68, 0.1))',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger, #ef4444)',
            fontSize: 13,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{loadError}</span>
          <button
            onClick={loadData}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--danger, #ef4444)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 13,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-strong)' }}>
            AI Employees
          </h1>
          <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
            Manage your AI workforce
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/library" className="btn btn-secondary">
            Browse Library
          </Link>
          <button className="btn" onClick={() => setShowCreate(true)}>
            + Custom Employee
          </button>
        </div>
      </div>

      {/* Employee Grid */}
      {employees.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--text-strong)' }}>No employees yet</h3>
          <p style={{ margin: '0 0 20px', color: 'var(--muted)' }}>
            Install agents from the library or create a custom employee.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link to="/library" className="btn">
              Browse Library
            </Link>
            <button className="btn btn-secondary" onClick={() => setShowCreate(true)}>
              Create Custom
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}
        >
          {employees.map((emp) => (
            <EmployeeCard key={emp.id} employee={emp} />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateEmployeeModal
          templates={templates}
          skills={skills}
          models={models}
          token={session?.accessToken || ''}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}

function CreateEmployeeModal({
  templates,
  skills,
  models,
  token,
  onClose,
  onCreated,
}: {
  templates: EmployeeTemplate[]
  skills: Skill[]
  models: Model[]
  token: string
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<'template' | 'customize'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState<EmployeeTemplate | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5')
  const [identityPrompt, setIdentityPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSelectTemplate = (template: EmployeeTemplate) => {
    setSelectedTemplate(template)
    setName(template.name)
    setDescription(template.description)
    setSelectedSkills(template.skills)
    setSelectedModel(template.model)
    setStep('customize')
  }

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      await employeesApi.create(token, {
        name,
        type: selectedTemplate?.type || 'custom',
        description,
        skills: selectedSkills,
        model: selectedModel,
        identityPrompt: identityPrompt || undefined,
      })
      onCreated()
    } catch (err: any) {
      setError(err.message || 'Failed to create employee')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 600,
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-strong)' }}>
            {step === 'template' ? 'Choose a Template' : 'Customize Employee'}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: 20,
            }}
          >
            x
          </button>
        </div>

        {step === 'template' ? (
          <div>
            <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
              Start with a pre-built template or create a custom employee.
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              {templates.map((template) => (
                <button
                  key={template.type}
                  onClick={() => handleSelectTemplate(template)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 16,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color var(--duration-fast)',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--accent-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent)',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {template.name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text-strong)' }}>{template.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {template.description}
                    </div>
                  </div>
                </button>
              ))}

              <button
                onClick={() => {
                  setSelectedTemplate(null)
                  setName('')
                  setDescription('')
                  setSelectedSkills([])
                  setStep('customize')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: 16,
                  background: 'transparent',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                }}
              >
                + Create Custom Employee
              </button>
            </div>
          </div>
        ) : (
          <div>
            {selectedTemplate && (
              <button
                onClick={() => setStep('template')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  fontSize: 13,
                  marginBottom: 16,
                  padding: 0,
                }}
              >
                Back to templates
              </button>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Name *
                </label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Employee name"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Description
                </label>
                <textarea
                  className="input"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this employee do?"
                  rows={2}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Model
                </label>
                <select
                  className="input"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} - {model.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Skills
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => {
                        setSelectedSkills((prev) =>
                          prev.includes(skill.id)
                            ? prev.filter((s) => s !== skill.id)
                            : [...prev, skill.id]
                        )
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-full)',
                        border: '1px solid',
                        borderColor: selectedSkills.includes(skill.id)
                          ? 'var(--accent)'
                          : 'var(--border)',
                        background: selectedSkills.includes(skill.id)
                          ? 'var(--accent-subtle)'
                          : 'transparent',
                        color: selectedSkills.includes(skill.id)
                          ? 'var(--accent)'
                          : 'var(--text)',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
                  Custom Identity (optional)
                </label>
                <textarea
                  className="input"
                  value={identityPrompt}
                  onChange={(e) => setIdentityPrompt(e.target.value)}
                  placeholder="Custom instructions for this employee..."
                  rows={4}
                />
              </div>

              {error && (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--danger-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--danger)',
                    fontSize: 13,
                  }}
                >
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button className="btn" onClick={handleCreate} disabled={loading} style={{ flex: 1 }}>
                  {loading ? <div className="loading" style={{ width: 18, height: 18 }} /> : 'Create Employee'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
