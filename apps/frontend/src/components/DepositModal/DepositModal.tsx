import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Account } from '@bankflow/shared';
import './DepositModal.css';

interface DepositModalProps {
  account: Account;
  onClose: () => void;
  onSuccess: () => void;
}

const API_BASE_URL = 'http://localhost:3000/api/v1';

export const DepositModal: React.FC<DepositModalProps> = ({
  account,
  onClose,
  onSuccess,
}) => {
  const { accessToken } = useAuth();
  const [rupees, setRupees] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const formatCurrency = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(rupees);

    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Please enter a valid positive deposit amount');
      return;
    }

    const amountPaise = Math.round(amountVal * 100);

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/ledger/journals/deposit`,
        {
          accountNumber: account.accountNumber,
          amount: amountPaise,
          description: description.trim() || `Cash deposit into account ${account.accountNumber}`,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (res.data.success) {
        setSuccessMsg(`Successfully deposited ${formatCurrency(amountPaise)} into ${account.accountNumber}`);
        setTimeout(() => {
          onSuccess();
        }, 1200);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        'Failed to process deposit. Ensure ledger service is running.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop-custom" onClick={onClose}>
      <div
        className="deposit-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="depositModalTitle"
      >
        <div className="deposit-modal__header">
          <div className="deposit-modal__title-group">
            <span className="deposit-modal__icon">
              <i className="bi bi-arrow-down-left-circle-fill"></i>
            </span>
            <div>
              <h2 id="depositModalTitle" className="deposit-modal__title">
                Deposit Funds
              </h2>
              <p className="deposit-modal__subtitle">
                Account: <code>{account.accountNumber}</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="deposit-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleDeposit} className="deposit-modal__body">
          {/* Balance info card */}
          <div className="deposit-modal__balance-card">
            <div className="balance-info">
              <span className="balance-info__label">Current Balance</span>
              <span className="balance-info__value">
                {formatCurrency(account.balance)}
              </span>
            </div>
            <div className="balance-info">
              <span className="balance-info__label">Account Type</span>
              <span className="balance-info__badge">{account.accountType}</span>
            </div>
          </div>

          {error && (
            <div className="deposit-alert deposit-alert--danger">
              <i className="bi bi-exclamation-octagon-fill"></i>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="deposit-alert deposit-alert--success">
              <i className="bi bi-check-circle-fill"></i>
              <span>{successMsg}</span>
            </div>
          )}

          <div className="form-group mb-3">
            <label htmlFor="depositAmount" className="form-label">
              Deposit Amount (₹ INR)
            </label>
            <div className="input-group-custom">
              <span className="input-prefix">₹</span>
              <input
                id="depositAmount"
                type="number"
                step="0.01"
                min="1"
                className="form-input"
                placeholder="e.g. 5000"
                value={rupees}
                onChange={(e) => setRupees(e.target.value)}
                disabled={loading}
                autoFocus
                required
              />
            </div>
          </div>

          {/* Preset quick buttons */}
          <div className="preset-chips">
            {[500, 1000, 5000, 10000, 50000].map((preset) => (
              <button
                key={preset}
                type="button"
                className="preset-chip"
                onClick={() => setRupees(preset.toString())}
              >
                +₹{preset.toLocaleString('en-IN')}
              </button>
            ))}
          </div>

          <div className="form-group mb-4">
            <label htmlFor="depositDesc" className="form-label">
              Description / Memo (Optional)
            </label>
            <input
              id="depositDesc"
              type="text"
              className="form-input"
              placeholder="e.g. Salary Deposit, Cash Deposit"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="deposit-modal__footer">
            <button
              type="button"
              className="btn-custom btn-custom--ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-custom btn-custom--deposit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Posting Journal...
                </>
              ) : (
                <>
                  <i className="bi bi-check2-circle"></i> Complete Deposit
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
