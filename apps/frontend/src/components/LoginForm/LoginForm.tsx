import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './LoginForm.css';

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToRegister?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onSwitchToRegister }) => {
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
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card login-card">
            <div className="login-header">
              <div className="icon-container">
                <i className="bi bi-shield-lock"></i>
              </div>
              <h4 className="mb-1 font-weight-bold">BankFlow Secure Portal</h4>
              <p className="text-muted small mb-0">Enter your credentials to access your account</p>
            </div>

            <div className="login-body">
              {error && (
                <div className="alert alert-danger alert-dismissible fade show mb-4" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  {error}
                  <button type="button" className="btn-close" onClick={clearError}></button>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-floating mb-3">
                  <input
                    type="email"
                    className="form-control"
                    id="loginEmail"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <label htmlFor="loginEmail">
                    <i className="bi bi-envelope me-1"></i> Email address
                  </label>
                </div>

                <div className="form-floating mb-3 position-relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-control"
                    id="loginPassword"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <label htmlFor="loginPassword">
                    <i className="bi bi-lock me-1"></i> Password
                  </label>
                  <button
                    type="button"
                    className="btn btn-link position-absolute end-0 top-50 translate-middle-y me-2 text-muted text-decoration-none"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <i className={`bi bi-${showPassword ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>

                <div className="d-flex justify-content-between align-items-center mb-4">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="rememberMe" />
                    <label className="form-check-label text-muted small" htmlFor="rememberMe">
                      Remember device
                    </label>
                  </div>
                  <a href="#" className="text-info small text-decoration-none" onClick={(e) => e.preventDefault()}>
                    Forgot Password?
                  </a>
                </div>

                <button
                  type="submit"
                  className="btn btn-bankflow w-100 d-flex align-items-center justify-content-center"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-box-arrow-in-right me-2"></i> Sign In to Account
                    </>
                  )}
                </button>
              </form>

              <hr className="my-4" />

              <div className="text-center">
                <span className="text-muted small me-2">Don't have an account yet?</span>
                <button
                  className="btn btn-link text-info p-0 font-weight-bold text-decoration-none small"
                  onClick={onSwitchToRegister}
                >
                  Create Customer Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
