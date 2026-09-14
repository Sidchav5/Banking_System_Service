import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Account } from '@bankflow/shared';
import './WithdrawalModal.css';

interface WithdrawalModalProps {
  account: Account;
  onClose: () => void;
  onSuccess: () => void;
}

const API_BASE_URL = 'http://localhost:3000/api/v1';

export const WithdrawalModal: React.FC<WithdrawalModalProps> = ({
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

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(rupees);

    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Please enter a valid positive withdrawal amount');
      return;
    }

    const amountPaise = Math.round(amountVal * 100);

    if (amountPaise > account.availableBalance) {
      setError(
        `Insufficient funds. Requested ${formatCurrency(amountPaise)}, but available balance is ${formatCurrency(account.availableBalance)}`
      );
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/ledger/journals/withdraw`,
        {
          accountNumber: account.accountNumber,
          amount: amountPaise,
          description: description.trim() || `Cash withdrawal from account ${account.accountNumber}`,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (res.data.success) {
        setSuccessMsg(`Successfully withdrew ${formatCurrency(amountPaise)} from ${account.accountNumber}`);
        setTimeout(() => {
          onSuccess();
        }, 1200);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        'Failed to process withdrawal. Ensure ledger service is running.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop-custom" onClick={onClose}>
      <div
        className="withdraw-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="withdrawModalTitle"
      >
        <div className="withdraw-modal__header">
          <div className="withdraw-modal__title-group">
            <span className="withdraw-modal__icon">
              <i className="bi bi-arrow-up-right-circle-fill"></i>
            </span>
            <div>
              <h2 id="withdrawModalTitle" className="withdraw-modal__title">
                Withdraw Funds
              </h2>
              <p className="withdraw-modal__subtitle">
                Account: <code>{account.accountNumber}</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="withdraw-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleWithdrawal} className="withdraw-modal__body">
          {/* Balance info card */}
          <div className="withdraw-modal__balance-card">
            <div className="balance-info">
              <span className="balance-info__label">Available Balance</span>
              <span className="balance-info__value balance-info__value--avail">
                {formatCurrency(account.availableBalance)}
              </span>
            </div>
            <div className="balance-info">
              <span className="balance-info__label">Account Status</span>
              <span className="balance-info__badge">{account.status}</span>
            </div>
          </div>

          {error && (
            <div className="withdraw-alert withdraw-alert--danger">
              <i className="bi bi-exclamation-octagon-fill"></i>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="withdraw-alert withdraw-alert--success">
              <i className="bi bi-check-circle-fill"></i>
              <span>{successMsg}</span>
            </div>
          )}

          <div className="form-group mb-3">
            <label htmlFor="withdrawAmount" className="form-label">
              Withdrawal Amount (₹ INR)
            </label>
            <div className="input-group-custom">
              <span className="input-prefix">₹</span>
              <input
                id="withdrawAmount"
                type="number"
                step="0.01"
                min="1"
                className="form-input"
                placeholder="e.g. 2000"
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
            {[500, 1000, 2000, 5000, 10000].map((preset) => (
              <button
                key={preset}
                type="button"
                className="preset-chip preset-chip--withdraw"
                onClick={() => setRupees(preset.toString())}
              >
                ₹{preset.toLocaleString('en-IN')}
              </button>
            ))}
          </div>

          <div className="form-group mb-4">
            <label htmlFor="withdrawDesc" className="form-label">
              Description / Memo (Optional)
            </label>
            <input
              id="withdrawDesc"
              type="text"
              className="form-input"
              placeholder="e.g. ATM Cash Withdrawal, Personal Expense"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="withdraw-modal__footer">
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
              className="btn-custom btn-custom--withdraw"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Posting Journal...
                </>
              ) : (
                <>
                  <i className="bi bi-check2-circle"></i> Complete Withdrawal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
