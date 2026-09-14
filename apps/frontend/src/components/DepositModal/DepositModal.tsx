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

const PRESETS = [500, 1000, 5000, 10000, 50000];

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

  const numericValue = parseFloat(rupees);
  const isValidAmount = !isNaN(numericValue) && numericValue > 0;
  const projectedBalance =
    account.balance + (isValidAmount ? Math.round(numericValue * 100) : 0);

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
          description:
            description.trim() ||
            `Cash deposit into account ${account.accountNumber}`,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (res.data.success) {
        setSuccessMsg(
          `Successfully deposited ${formatCurrency(amountPaise)} into ${account.accountNumber}`
        );
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
    <div className="deposit-modal-backdrop" onClick={onClose}>
      <div
        className="deposit-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="depositModalTitle"
      >
        {/* Header */}
        <header className="deposit-modal-header">
          <div className="deposit-modal-header__left">
            <div className="deposit-modal-header__icon">
              <i className="bi bi-arrow-down-left-circle-fill"></i>
            </div>
            <div>
              <h2 id="depositModalTitle" className="deposit-modal-header__title">
                Deposit Funds
              </h2>
              <div className="deposit-modal-header__meta">
                <span className="deposit-modal-header__acct">
                  {account.accountNumber}
                </span>
                <span className="deposit-modal-header__type">
                  {account.accountType}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="deposit-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        {/* Body */}
        <div className="deposit-modal-body">
          {/* Balance strip */}
          <section className="balance-strip">
            <div className="balance-strip__item">
              <span className="balance-strip__label">Current Balance</span>
              <span className="balance-strip__value">
                {formatCurrency(account.balance)}
              </span>
            </div>
            <div className="balance-strip__arrow">
              <i className="bi bi-arrow-right"></i>
            </div>
            <div className="balance-strip__item balance-strip__item--projected">
              <span className="balance-strip__label">After Deposit</span>
              <span className="balance-strip__value balance-strip__value--accent">
                {formatCurrency(projectedBalance)}
              </span>
            </div>
          </section>

          {error && (
            <div className="deposit-alert deposit-alert--danger" role="alert">
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="deposit-alert deposit-alert--success" role="alert">
              <i className="bi bi-check-circle-fill"></i>
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleDeposit} className="deposit-form">
            {/* Amount */}
            <div className="field">
              <label htmlFor="depositAmount">Deposit amount</label>
              <div className="input-affix">
                <span className="input-affix__prefix">₹</span>
                <input
                  id="depositAmount"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 5000"
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value)}
                  disabled={loading}
                  autoFocus
                  required
                />
                <span className="input-affix__suffix">INR</span>
              </div>

              <div className="preset-chips">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`preset-chip ${
                      rupees === preset.toString() ? 'is-active' : ''
                    }`}
                    onClick={() => setRupees(preset.toString())}
                    disabled={loading}
                  >
                    +₹{preset.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="field">
              <label htmlFor="depositDesc">
                Description <span className="field__optional">Optional</span>
              </label>
              <div className="input-affix">
                <span className="input-affix__icon">
                  <i className="bi bi-chat-left-text"></i>
                </span>
                <input
                  id="depositDesc"
                  type="text"
                  placeholder="e.g. Salary deposit, Cash deposit"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  maxLength={80}
                />
              </div>
              <div className="field__hint-row">
                <span className="field__hint">
                  Appears on your statement
                </span>
                <span className="field__counter">{description.length}/80</span>
              </div>
            </div>

            {/* Footer */}
            <div className="deposit-modal-footer">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--deposit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Posting journal…
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle"></i>
                    Complete Deposit
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