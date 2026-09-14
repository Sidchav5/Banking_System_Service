import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './UserProfile.css';

export const UserProfileView: React.FC = () => {
  const { user, profile } = useAuth();

  const getInitials = () => {
    if (profile?.firstName && profile?.lastName) {
      return `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase();
    }
    return user?.email ? user.email[0].toUpperCase() : 'U';
  };

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : user?.email ?? 'User';

  const kycStatus = profile?.kycStatus ?? 'PENDING';

  const infoFields = [
    {
      icon: 'bi-fingerprint',
      label: 'User ID',
      value: user?.id ?? '—',
      mono: true,
    },
    {
      icon: 'bi-envelope',
      label: 'Email address',
      value: user?.email ?? '—',
    },
    {
      icon: 'bi-phone',
      label: 'Mobile phone',
      value: profile?.phone || 'Not provided',
    },
    {
      icon: 'bi-shield-check',
      label: 'Account status',
      value: user?.status || 'ACTIVE',
      badge: true,
    },
  ];

  return (
    <div className="profile-page">
      <div className="profile-container">
        <article className="profile-card">
          {/* Hero banner */}
          <header className="profile-banner">
            <div className="profile-banner__left">
              <div className="profile-avatar">
                <span>{getInitials()}</span>
              </div>

              <div className="profile-banner__meta">
                <span className="profile-banner__eyebrow">Account Holder</span>
                <h1 className="profile-banner__name">{displayName}</h1>
                <div className="profile-banner__pills">
                  <span className="profile-role-pill">
                    <i className="bi bi-person-badge"></i>
                    {user?.role}
                  </span>
                  <span
                    className={`kyc-badge kyc-badge--${kycStatus.toLowerCase()}`}
                  >
                    <i
                      className={`bi ${
                        kycStatus === 'VERIFIED'
                          ? 'bi-patch-check-fill'
                          : kycStatus === 'REJECTED'
                          ? 'bi-x-octagon-fill'
                          : 'bi-hourglass-split'
                      }`}
                    ></i>
                    KYC {kycStatus}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Body */}
          <div className="profile-body">
            {/* Section: personal info */}
            <section className="profile-section">
              <div className="profile-section__head">
                <i className="bi bi-person-lines-fill"></i>
                <h2>Profile & Security</h2>
              </div>

              <div className="info-grid">
                {infoFields.map((field) => (
                  <div key={field.label} className="info-card">
                    <div className="info-card__icon">
                      <i className={`bi ${field.icon}`}></i>
                    </div>
                    <div className="info-card__body">
                      <span className="info-card__label">{field.label}</span>
                      {field.badge ? (
                        <span className="status-pill status-pill--active">
                          <span className="status-pill__dot" />
                          {field.value}
                        </span>
                      ) : (
                        <span
                          className={`info-card__value ${
                            field.mono ? 'info-card__value--mono' : ''
                          }`}
                        >
                          {field.value}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section: JWT telemetry */}
            <section className="security-panel">
              <div className="security-panel__icon">
                <i className="bi bi-key-fill"></i>
              </div>
              <div className="security-panel__body">
                <h3>
                  Active JWT Session
                  <span className="security-panel__tag">
                    <i className="bi bi-shield-lock-fill"></i>
                    Secured
                  </span>
                </h3>
                <p>
                  Your requests are signed with access tokens featuring
                  15-minute rotation cycles and correlation tracking across
                  the API Gateway.
                </p>
                <ul className="security-panel__list">
                  <li>
                    <i className="bi bi-check2-circle"></i>
                    Token rotation: every 15 minutes
                  </li>
                  <li>
                    <i className="bi bi-check2-circle"></i>
                    Correlation ID propagated per request
                  </li>
                  <li>
                    <i className="bi bi-check2-circle"></i>
                    Enterprise-grade encryption in transit
                  </li>
                </ul>
              </div>
            </section>
          </div>
        </article>
      </div>
    </div>
  );
};