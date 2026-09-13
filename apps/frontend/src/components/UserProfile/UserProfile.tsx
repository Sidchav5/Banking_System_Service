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

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-10 col-lg-8">
          <div className="card profile-card">
            <div className="profile-banner d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <div className="profile-avatar">{getInitials()}</div>
                <div>
                  <h3 className="mb-0 font-weight-bold">
                    {profile ? `${profile.firstName} ${profile.lastName}` : user?.email}
                  </h3>
                  <span className="badge bg-info text-dark mt-1">{user?.role}</span>
                </div>
              </div>

              <div>
                <span className={`kyc-badge ${profile?.kycStatus ?? 'PENDING'}`}>
                  <i className="bi bi-shield-check me-1"></i>
                  KYC: {profile?.kycStatus ?? 'PENDING'}
                </span>
              </div>
            </div>

            <div className="card-body p-4">
              <h5 className="card-title text-primary border-bottom pb-2 mb-3">
                <i className="bi bi-person-lines-fill me-2"></i> Profile & Security Details
              </h5>

              <div className="row g-3">
                <div className="col-md-6">
                  <div className="p-3 bg-light rounded">
                    <small className="text-muted d-block mb-1">USER ID (UUID)</small>
                    <span className="font-monospace text-dark text-break">{user?.id}</span>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-3 bg-light rounded">
                    <small className="text-muted d-block mb-1">EMAIL ADDRESS</small>
                    <span className="fw-bold text-dark">{user?.email}</span>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-3 bg-light rounded">
                    <small className="text-muted d-block mb-1">MOBILE PHONE</small>
                    <span className="text-dark">{profile?.phone || 'Not provided'}</span>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="p-3 bg-light rounded">
                    <small className="text-muted d-block mb-1">ACCOUNT STATUS</small>
                    <span className="badge bg-success">{user?.status || 'ACTIVE'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 border rounded bg-white">
                <h6 className="fw-bold text-dark mb-2">
                  <i className="bi bi-key me-2 text-warning"></i> Active JWT Telemetry
                </h6>
                <small className="text-muted d-block">
                  Your requests are signed with access tokens containing 15-minute rotation cycles & correlation tracking across API Gateway.
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
