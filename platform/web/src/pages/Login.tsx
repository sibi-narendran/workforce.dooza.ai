import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../lib/api'
import { useAuthStore } from '../lib/store'

export function Login() {
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        const result = await authApi.register({ email, password, name, companyName }) as any
        if (result.session) {
          setAuth(result.user, result.tenant, result.session)
          navigate('/')
        } else {
          setIsRegister(false)
          setError('Account created. Please log in.')
        }
      } else {
        const result = await authApi.login({ email, password }) as any
        setAuth(result.user, result.tenant, result.session)
        navigate('/')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <img src="/logo.png" alt="Workforce" />
          <span className="login-logo-text">Workforce</span>
        </div>

        <h1 className="login-title">
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="login-subtitle">
          {isRegister
            ? 'Start building your AI workforce'
            : 'Sign in to manage your AI employees'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <div className="form-group">
                <label className="form-label">Your Name</label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input
                  type="text"
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc"
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? '8+ characters' : 'Your password'}
              required
              minLength={isRegister ? 8 : undefined}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '12px 16px' }}
          >
            {loading ? (
              <div className="loading" style={{ width: 18, height: 18 }} />
            ) : isRegister ? (
              'Create Account'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="login-switch">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister)
              setError('')
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            {isRegister ? (
              <>Already have an account? <a>Sign in</a></>
            ) : (
              <>Don't have an account? <a>Create one</a></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
