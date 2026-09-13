import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { AccountType } from '@bankflow/shared';
import './OpenAccountModal.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

interface OpenAccountModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const OpenAccountModal: React.FC<OpenAccountModalProps> = ({ onClose, onSuccess }) => {
  const { accessToken } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>('SAVINGS');
  const [initialDepositRupees, setInitialDepositRupees] = useState<string>('5000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const depositPaise = Math.floor(parseFloat(initialDepositRupees || '0') * 100);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/accounts`,
        { accountType, initialDeposit: depositPaise },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (res.data.success) {
        onSuccess();
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Failed to open account. Please check network connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop-custom">
      <div className="card open-account-card">
        <div className="open-account-header d-flex justify-content-between align-items-center">
          <h5 className="mb-0 font-weight-bold">
            <i className="bi bi-bank me-2 text-info"></i> Open New Bank Account
          </h5>
          <button type="button" className="btn-close btn-close-white" onClick={onClose}></button>
        </div>

        <div className="card-body p-4">
          {error && (
            <div className="alert alert-danger py-2 mb-3" role="alert">
              <i className="bi bi-exclamation-circle me-1"></i> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label text-muted small fw-bold">SELECT ACCOUNT TYPE</label>
              <select
                className="form-select form-select-lg"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountType)}
              >
                <option value="SAVINGS">Savings Account (Standard 3.5% APY)</option>
                <option value="CURRENT">Current Account (Business Banking)</option>
                <option value="FIXED_DEPOSIT">Fixed Deposit (High-Yield 7.1% APY)</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="form-label text-muted small fw-bold">INITIAL DEPOSIT AMOUNT (₹ INR)</label>
              <div className="input-group input-group-lg">
                <span className="input-group-text">₹</span>
                <input
                  type="number"
                  className="form-control"
                  placeholder="5000"
                  value={initialDepositRupees}
                  onChange={(e) => setInitialDepositRupees(e.target.value)}
                  min="0"
                  step="100"
                  required
                />
              </div>
              <small className="text-muted mt-1 d-block">
                Money will be credited into your newly provisioned 12-digit account.
              </small>
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-info font-weight-bold text-dark" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                    Opening Account...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-lg me-1"></i> Confirm & Open Account
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
