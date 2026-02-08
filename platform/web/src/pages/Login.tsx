import { useEffect } from 'react'
import { ACCOUNTS_URL } from '../lib/constants'

export function Login() {
  useEffect(() => {
    window.location.href = `${ACCOUNTS_URL}/signin?product=workforce`
  }, [])

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.png" alt="Workforce" />
          <span className="login-logo-text">Workforce</span>
        </div>
        <p className="login-subtitle">Redirecting to sign in...</p>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <div className="loading" />
        </div>
      </div>
    </div>
  )
}
