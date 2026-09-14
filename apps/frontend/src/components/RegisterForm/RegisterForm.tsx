import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@bankflow/shared';
import './RegisterForm.css';

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

const ROLE_OPTIONS: { value: UserRole; label: string; icon: string; hint: string }[] = [
  {
    value: 'CUSTOMER',
    label: 'Customer',
    icon: 'bi-person',
    hint: 'Personal banking',
  },
  {
    value: 'EMPLOYEE',
    label: 'Employee',
    icon: 'bi-person-badge',
    hint: 'Bank staff access',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    icon: 'bi-shield-lock',
    hint: 'Full system control',
  },
];

export const RegisterForm: React.FC<RegisterFormProps> = ({
  onSuccess,
  onSwitchToLogin,
}) => {
  const { register, loading, error, clearError } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('CUSTOMER');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await register({
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
    });
    if (success && onSuccess) {
      onSuccess();
    }
  };

  const strength = (() => {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  })();

  const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][strength];

  return (
    <div className="register-page">
      <div className="register-shell">
        {/* ---------- Left: Brand / trust panel ---------- */}
        <aside className="register-hero">
          <div className="register-hero__brand">
            <div className="register-hero__logo">
              <i className="bi bi-bank2"></i>
            </div>
            <span className="register-hero__brand-name">BankFlow</span>
          </div>

          <div className="register-hero__content">
            <h2>Banking that starts<br />in seconds.</h2>
            <p>
              Open your digital banking profile and get instant access to
              accounts, transfers, and controls.
            </p>

            <ul className="register-hero__features">
              <li>
                <i className="bi bi-lightning-charge-fill"></i>
                <span>Instant account provisioning</span>
              </li>
              <li>
                <i className="bi bi-shield-check"></i>
                <span>KYC-ready verification</span>
              </li>
              <li>
                <i className="bi bi-phone"></i>
                <span>Mobile-first banking</span>
              </li>
            </ul>
          </div>

          <div className="register-hero__footer">
            <i className="bi bi-lock-fill"></i>
            <span>Your data is protected with enterprise-grade security</span>
          </div>
        </aside>

        {/* ---------- Right: Form ---------- */}
        <main className="register-main">
          <div className="register-main__inner">
            <header className="register-head">
              <h1 className="register-head__title">Create your account</h1>
              <p className="register-head__subtitle">
                Set up your BankFlow profile to get started
              </p>
            </header>

            {error && (
              <div className="register-alert" role="alert">
                <i className="bi bi-exclamation-triangle-fill"></i>
                <span>{error}</span>
                <button
                  type="button"
                  className="register-alert__close"
                  aria-label="Dismiss"
                  onClick={clearError}
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="register-form">
              {/* Role selector */}
              <div className="field">
                <label>Account role</label>
                <div className="role-selector" role="radiogroup">
                  {ROLE_OPTIONS.map((opt) => {
                    const isActive = role === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        className={`role-option ${isActive ? 'is-active' : ''}`}
                        onClick={() => setRole(opt.value)}
                      >
                        <i className={`bi ${opt.icon}`}></i>
                        <span className="role-option__label">{opt.label}</span>
                        <span className="role-option__hint">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Name row */}
              <div className="field-row">
                <div className="field">
                  <label htmlFor="firstName">First name</label>
                  <div className="input-affix">
                    <span className="input-affix__icon">
                      <i className="bi bi-person"></i>
                    </span>
                    <input
                      id="firstName"
                      type="text"
                      placeholder="Aarav"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="lastName">Last name</label>
                  <div className="input-affix">
                    <span className="input-affix__icon">
                      <i className="bi bi-person"></i>
                    </span>
                    <input
                      id="lastName"
                      type="text"
                      placeholder="Sharma"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div className="field">
                <label htmlFor="registerEmail">Email address</label>
                <div className="input-affix">
                  <span className="input-affix__icon">
                    <i className="bi bi-envelope"></i>
                  </span>
                  <input
                    id="registerEmail"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="field">
                <label htmlFor="phone">Mobile phone</label>
                <div className="input-affix">
                  <span className="input-affix__prefix">+91</span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="field">
                <label htmlFor="registerPassword">Password</label>
                <div className="input-affix">
                  <span className="input-affix__icon">
                    <i className="bi bi-lock"></i>
                  </span>
                  <input
                    id="registerPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="input-affix__toggle"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`bi bi-${showPassword ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>

                {password.length > 0 && (
                  <div className="password-strength" data-level={strength}>
                    <div className="password-strength__bar">
                      <span />
                    </div>
                    <span className="password-strength__label">{strengthLabel}</span>
                  </div>
                )}
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
                    Registering account…
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle"></i>
                    Create Account
                  </>
                )}
              </button>
            </form>

            <div className="register-divider">
              <span>Already registered?</span>
            </div>

            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={onSwitchToLogin}
            >
              <i className="bi bi-box-arrow-in-right"></i>
              Sign in instead
            </button>

            <div className="register-trust">
              <i className="bi bi-shield-lock-fill"></i>
              <span>
                By creating an account you agree to our{' '}
                <strong>Terms & Privacy Policy</strong>
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};