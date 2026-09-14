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

interface AccountTypeOption {
  value: AccountType;
  label: string;
  tagline: string;
  icon: string;
  apy: string;
  minimum: number;
}

const ACCOUNT_OPTIONS: AccountTypeOption[] = [
  {
    value: 'SAVINGS',
    label: 'Savings',
    tagline: 'Everyday banking with interest',
    icon: 'bi-piggy-bank',
    apy: '3.5% APY',
    minimum: 5000,
  },
  {
    value: 'CURRENT',
    label: 'Current',
    tagline: 'Built for business banking',
    icon: 'bi-briefcase',
    apy: 'No interest',
    minimum: 10000,
  },
  {
    value: 'FIXED_DEPOSIT',
    label: 'Fixed Deposit',
    tagline: 'High-yield locked savings',
    icon: 'bi-safe',
    apy: '7.1% APY',
    minimum: 25000,
  },
];

export const OpenAccountModal: React.FC<OpenAccountModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const { accessToken } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>('SAVINGS');
  const [initialDepositRupees, setInitialDepositRupees] =
    useState<string>('5000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOption =
    ACCOUNT_OPTIONS.find((o) => o.value === accountType) ?? ACCOUNT_OPTIONS[0];

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    });

  const quickAmounts = [5000, 10000, 25000];

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
    <div className="open-modal-backdrop" onClick={onClose}>
      <div
        className="open-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-account-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="open-modal-header">
          <div className="open-modal-header__left">
            <div className="open-modal-header__icon">
              <i className="bi bi-bank2"></i>
            </div>
            <div>
              <h2 id="open-account-title" className="open-modal-header__title">
                Open a New Account
              </h2>
              <p className="open-modal-header__subtitle">
                Choose a type and fund it to get started
              </p>
            </div>
          </div>
          <button
            type="button"
            className="open-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        {/* Body */}
        <div className="open-modal-body">
          {error && (
            <div className="open-modal-alert" role="alert">
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="open-modal-form">
            {/* Account type selector */}
            <div className="open-section">
              <div className="open-section__head">
                <h3>Choose account type</h3>
                <span className="open-section__step">Step 1 of 2</span>
              </div>

              <div className="type-grid">
                {ACCOUNT_OPTIONS.map((opt) => {
                  const isSelected = accountType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`type-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => setAccountType(opt.value)}
                      aria-pressed={isSelected}
                    >
                      <span className="type-card__check">
                        <i className="bi bi-check-lg"></i>
                      </span>

                      <span className="type-card__icon">
                        <i className={`bi ${opt.icon}`}></i>
                      </span>

                      <span className="type-card__label">{opt.label}</span>
                      <span className="type-card__tagline">{opt.tagline}</span>

                      <span className="type-card__apy">{opt.apy}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount */}
            <div className="open-section">
              <div className="open-section__head">
                <h3>Initial deposit</h3>
                <span className="open-section__step">Step 2 of 2</span>
              </div>

              <div className="field">
                <div className="input-affix">
                  <span className="input-affix__prefix">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="5000"
                    value={initialDepositRupees}
                    onChange={(e) => setInitialDepositRupees(e.target.value)}
                    min="0"
                    step="100"
                    required
                  />
                  <span className="input-affix__suffix">INR</span>
                </div>

                <div className="quick-amounts">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className={`quick-chip ${
                        parseFloat(initialDepositRupees) === amt
                          ? 'is-active'
                          : ''
                      }`}
                      onClick={() => setInitialDepositRupees(amt.toString())}
                    >
                      {formatCurrency(amt)}
                    </button>
                  ))}
                </div>

                <small className="field__hint">
                  Minimum for {selectedOption.label}:{' '}
                  <strong>{formatCurrency(selectedOption.minimum)}</strong>
                </small>
              </div>
            </div>

            {/* Summary */}
            <div className="open-summary">
              <div className="open-summary__icon">
                <i className="bi bi-info-circle-fill"></i>
              </div>
              <div className="open-summary__body">
                <strong>What happens next</strong>
                <p>
                  A 12-digit {selectedOption.label.toLowerCase()} account will be
                  provisioned instantly and credited with your initial deposit.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="open-modal-footer">
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
                className="btn btn--primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Opening account…
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle"></i>
                    Confirm & Open
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