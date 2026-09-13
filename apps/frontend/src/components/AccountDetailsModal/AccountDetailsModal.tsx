import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Account, AccountStatus } from '@bankflow/shared';
import './AccountDetailsModal.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

interface AccountDetailsModalProps {
  account: Account;
  onClose: () => void;
  onUpdate: () => void;
}

export const AccountDetailsModal: React.FC<AccountDetailsModalProps> = ({ account, onClose, onUpdate }) => {
  const { accessToken } = useAuth();
  const [dailyLimitRupees, setDailyLimitRupees] = useState((account.dailyTransferLimit / 100).toString());
  const [singleLimitRupees, setSingleLimitRupees] = useState((account.singleTransactionLimit / 100).toString());
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formatCurrency = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
    });
  };

  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const dailyPaise = Math.floor(parseFloat(dailyLimitRupees) * 100);
      const singlePaise = Math.floor(parseFloat(singleLimitRupees) * 100);

      await axios.patch(
        `${API_BASE_URL}/accounts/${account.id}/limits`,
        { dailyTransferLimit: dailyPaise, singleTransactionLimit: singlePaise },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setStatusMessage('Limits updated successfully');
      setTimeout(() => onUpdate(), 1000);
    } catch {
      setStatusMessage('Failed to update limits');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (newStatus: AccountStatus) => {
    setLoading(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/accounts/${account.id}/status`,
        { status: newStatus, reason: 'User requested status change' },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      onUpdate();
    } catch {
      setStatusMessage('Failed to update account status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="details-modal-backdrop">
      <div className="card details-card">
        <div className="details-header d-flex justify-content-between align-items-center">
          <div>
            <h5 className="mb-0 font-weight-bold">Account Telemetry & Controls</h5>
            <small className="text-info font-monospace">{account.accountNumber}</small>
          </div>
          <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
        </div>

        <div className="card-body p-4">
          {statusMessage && (
            <div className="alert alert-info py-2 mb-3" role="alert">
              <i className="bi bi-info-circle me-1"></i> {statusMessage}
            </div>
          )}

          <div className="row g-3 mb-4">
            <div className="col-6">
              <div className="p-3 bg-light rounded">
                <small className="text-muted d-block mb-1">TOTAL BALANCE</small>
                <h4 className="fw-bold mb-0 text-dark">{formatCurrency(account.balance)}</h4>
              </div>
            </div>

            <div className="col-6">
              <div className="p-3 bg-light rounded">
                <small className="text-muted d-block mb-1">AVAILABLE BALANCE</small>
                <h4 className="fw-bold mb-0 text-info">{formatCurrency(account.availableBalance)}</h4>
              </div>
            </div>
          </div>

          <h6 className="fw-bold border-bottom pb-2 mb-3">
            <i className="bi bi-shield-check me-2 text-primary"></i> Transaction Safety Limits
          </h6>

          <form onSubmit={handleUpdateLimits} className="mb-4">
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label text-muted small fw-bold">DAILY TRANSFER LIMIT (₹)</label>

                <input
                  type="number"
                  className="form-control"
                  value={dailyLimitRupees}
                  onChange={(e) => setDailyLimitRupees(e.target.value)}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label text-muted small fw-bold">SINGLE TRANSACTION LIMIT (₹)</label>

                <input
                  type="number"
                  className="form-control"
                  value={singleLimitRupees}
                  onChange={(e) => setSingleLimitRupees(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" className="btn btn-outline-info btn-sm" disabled={loading}>
              Save Limit Changes
            </button>
          </form>

          <h6 className="fw-bold border-bottom pb-2 mb-3">
            <i className="bi bi-gear-fill me-2 text-warning"></i> Account Actions
          </h6>

          <div className="d-flex gap-2">
            {account.status === 'ACTIVE' ? (
              <button
                type="button"
                className="btn btn-warning btn-sm"
                onClick={() => handleToggleStatus('FROZEN')}
                disabled={loading}
              >
                <i className="bi bi-snow me-1"></i> Freeze Account
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={() => handleToggleStatus('ACTIVE')}
                disabled={loading}
              >
                <i className="bi bi-play-circle me-1"></i> Unfreeze Account
              </button>
            )}

            {account.status !== 'CLOSED' && (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                onClick={() => handleToggleStatus('CLOSED')}
                disabled={loading}
              >
                <i className="bi bi-x-circle me-1"></i> Close Account
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
