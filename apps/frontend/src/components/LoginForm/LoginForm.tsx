import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './LoginForm.css';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onSwitchToRegister,
}) => {
  const { login, loading, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login({ email, password });
    if (success && onSuccess) {
      onSuccess();
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        {/* ---------- Left: Brand / Trust panel ---------- */}
        <aside className="login-hero">
          <div className="login-hero__brand">
            <div className="login-hero__logo">
              <i className="bi bi-bank2"></i>
            </div>
            <span className="login-hero__brand-name">BankFlow</span>
          </div>

          <div className="login-hero__content">
            <h2>Secure banking,<br />reimagined for you.</h2>
            <p>
              Manage your accounts, transactions, and limits with
              bank-grade security and a modern experience.
            </p>

            <ul className="login-hero__features">
              <li>
                <i className="bi bi-shield-check"></i>
                <span>256-bit encryption</span>
              </li>
              <li>
                <i className="bi bi-fingerprint"></i>
                <span>Biometric-ready access</span>
              </li>
              <li>
                <i className="bi bi-activity"></i>
                <span>Real-time fraud monitoring</span>
              </li>
            </ul>
          </div>

          <div className="login-hero__footer">
            <i className="bi bi-lock-fill"></i>
            <span>Your data is protected with enterprise-grade security</span>
          </div>
        </aside>

        {/* ---------- Right: Form ---------- */}
        <main className="login-main">
          <div className="login-main__inner">
            <header className="login-head">
              <h1 className="login-head__title">Welcome back</h1>
              <p className="login-head__subtitle">
                Sign in to continue to your BankFlow account
              </p>
            </header>

            {error && (
              <div className="login-alert" role="alert">
                <i className="bi bi-exclamation-triangle-fill"></i>
                <span>{error}</span>
                <button
                  type="button"
                  className="login-alert__close"
                  aria-label="Dismiss"
                  onClick={clearError}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              {/* Email */}
              <div className="field">
                <label htmlFor="loginEmail">Email address</label>
                <div className="input-affix">
                  <span className="input-affix__icon">
                    <i className="bi bi-envelope"></i>
                  </span>
                  <input
                    id="loginEmail"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="field">
                <label htmlFor="loginPassword">Password</label>
                <div className="input-affix">
                  <span className="input-affix__icon">
                    <i className="bi bi-lock"></i>
                  </span>
                  <input
                    id="loginPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="input-affix__toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i
                      className={`bi bi-${showPassword ? 'eye-slash' : 'eye'}`}
                    ></i>
                  </button>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className="login-form__row">
                <label className="checkbox">
                  <input type="checkbox" id="rememberMe" />
                  <span className="checkbox__box">
                    <i className="bi bi-check"></i>
                  </span>
                  <span className="checkbox__label">Remember this device</span>
                </label>

                <a
                  href="#"
                  className="login-form__link"
                  onClick={(e) => e.preventDefault()}
                >
                  Forgot password?
                </a>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Authenticating…
                  </>
                ) : (
                  <>
                    <i className="bi bi-box-arrow-in-right"></i>
                    Sign In
                  </>
                )}
              </button>
            </form>

            <div className="login-divider">
              <span>New to BankFlow?</span>
            </div>

            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={onSwitchToRegister}
            >
              <i className="bi bi-person-plus"></i>
              Create Customer Account
            </button>

            <div className="login-trust">
              <i className="bi bi-shield-lock-fill"></i>
              <span>
                Protected by BankFlow Secure • <strong>PCI-DSS compliant</strong>
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};