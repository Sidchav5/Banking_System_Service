import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '@bankflow/shared';
import './RegisterForm.css';

interface RegisterFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSuccess, onSwitchToLogin }) => {
  const { register, loading, error, clearError } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('CUSTOMER');

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

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-8 col-lg-6">
          <div className="card register-card">
            <div className="register-header">
              <i className="bi bi-person-badge text-info fs-1 mb-2"></i>
              <h4 className="mb-1 font-weight-bold">Register BankFlow Account</h4>
              <p className="text-muted small mb-0">Open your enterprise digital banking profile</p>
            </div>

            <div className="register-body">
              {error && (
                <div className="alert alert-danger alert-dismissible fade show mb-4" role="alert">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i>
                  {error}
                  <button type="button" className="btn-close" onClick={clearError}></button>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label text-muted small fw-bold mb-1">ACCOUNT ROLE</label>
                  <div className="btn-group w-100 role-selector" role="group">
                    {(['CUSTOMER', 'EMPLOYEE', 'ADMIN'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        className={`btn btn-outline-info btn-sm ${role === r ? 'active' : ''}`}
                        onClick={() => setRole(r)}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-md-6">
                    <div className="form-floating">
                      <input
                        type="text"
                        className="form-control"
                        id="firstName"
                        placeholder="First Name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                      />
                      <label htmlFor="firstName">First Name</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="form-floating">
                      <input
                        type="text"
                        className="form-control"
                        id="lastName"
                        placeholder="Last Name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                      />
                      <label htmlFor="lastName">Last Name</label>
                    </div>
                  </div>
                </div>

                <div className="form-floating mb-3">
                  <input
                    type="email"
                    className="form-control"
                    id="registerEmail"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <label htmlFor="registerEmail">Email address</label>
                </div>

                <div className="form-floating mb-3">
                  <input
                    type="tel"
                    className="form-control"
                    id="phone"
                    placeholder="Phone Number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                  <label htmlFor="phone">Mobile Phone (+91)</label>
                </div>

                <div className="form-floating mb-4">
                  <input
                    type="password"
                    className="form-control"
                    id="registerPassword"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <label htmlFor="registerPassword">Security Password</label>
                </div>

                <button
                  type="submit"
                  className="btn btn-info w-100 font-weight-bold py-3 text-dark d-flex align-items-center justify-content-center"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Registering Account...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check-circle-fill me-2"></i> Complete Account Registration
                    </>
                  )}
                </button>
              </form>

              <hr className="my-4" />

              <div className="text-center">
                <span className="text-muted small me-2">Already have a BankFlow account?</span>
                <button
                  className="btn btn-link text-info p-0 font-weight-bold text-decoration-none small"
                  onClick={onSwitchToLogin}
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
