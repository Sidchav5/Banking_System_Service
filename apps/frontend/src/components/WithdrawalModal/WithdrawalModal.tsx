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
const PRESETS = [500, 1000, 2000, 5000, 10000];

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

  const numericValue = parseFloat(rupees);
  const isValidAmount = !isNaN(numericValue) && numericValue > 0;
  const amountPaise = isValidAmount ? Math.round(numericValue * 100) : 0;
  const hasEnoughFunds = amountPaise <= account.availableBalance;
  const remainingBalance = account.availableBalance - amountPaise;

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(rupees);

    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Please enter a valid positive withdrawal amount');
      return;
    }

    const paise = Math.round(amountVal * 100);

    if (paise > account.availableBalance) {
      setError(
        `Insufficient funds. Requested ${formatCurrency(paise)}, but available balance is ${formatCurrency(account.availableBalance)}`
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
          amount: paise,
          description:
            description.trim() ||
            `Cash withdrawal from account ${account.accountNumber}`,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (res.data.success) {
        setSuccessMsg(
          `Successfully withdrew ${formatCurrency(paise)} from ${account.accountNumber}`
        );
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
    <div className="withdraw-modal-backdrop" onClick={onClose}>
      <div
        className="withdraw-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdrawModalTitle"
      >
        {/* Header */}
        <header className="withdraw-modal-header">
          <div className="withdraw-modal-header__left">
            <div className="withdraw-modal-header__icon">
              <i className="bi bi-arrow-up-right-circle-fill"></i>
            </div>
            <div>
              <h2 id="withdrawModalTitle" className="withdraw-modal-header__title">
                Withdraw Funds
              </h2>
              <div className="withdraw-modal-header__meta">
                <span className="withdraw-modal-header__acct">
                  {account.accountNumber}
                </span>
                <span
                  className={`withdraw-modal-header__status withdraw-modal-header__status--${account.status.toLowerCase()}`}
                >
                  {account.status}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="withdraw-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        {/* Body */}
        <div className="withdraw-modal-body">
          {/* Balance strip */}
          <section className="balance-strip">
            <div className="balance-strip__item">
              <span className="balance-strip__label">Available</span>
              <span className="balance-strip__value">
                {formatCurrency(account.availableBalance)}
              </span>
            </div>
            <div className="balance-strip__arrow">
              <i className="bi bi-arrow-right"></i>
            </div>
            <div className="balance-strip__item balance-strip__item--projected">
              <span className="balance-strip__label">After Withdrawal</span>
              <span className="balance-strip__value balance-strip__value--accent">
                {isValidAmount && hasEnoughFunds
                  ? formatCurrency(remainingBalance)
                  : formatCurrency(account.availableBalance)}
              </span>
            </div>
          </section>

          {error && (
            <div className="withdraw-alert withdraw-alert--danger" role="alert">
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="withdraw-alert withdraw-alert--success" role="alert">
              <i className="bi bi-check-circle-fill"></i>
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleWithdrawal} className="withdraw-form">
            {/* Amount */}
            <div className="field">
              <label htmlFor="withdrawAmount">Withdrawal amount</label>
              <div
                className={`input-affix ${
                  isValidAmount && !hasEnoughFunds ? 'has-error' : ''
                }`}
              >
                <span className="input-affix__prefix">₹</span>
                <input
                  id="withdrawAmount"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 2000"
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
                    ₹{preset.toLocaleString('en-IN')}
                  </button>
                ))}
              </div>

              {isValidAmount && !hasEnoughFunds && (
                <span className="field__hint field__hint--danger">
                  <i className="bi bi-x-circle"></i>
                  Amount exceeds your available balance of{' '}
                  {formatCurrency(account.availableBalance)}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="field">
              <label htmlFor="withdrawDesc">
                Description <span className="field__optional">Optional</span>
              </label>
              <div className="input-affix">
                <span className="input-affix__icon">
                  <i className="bi bi-chat-left-text"></i>
                </span>
                <input
                  id="withdrawDesc"
                  type="text"
                  placeholder="e.g. ATM cash withdrawal, personal expense"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  maxLength={80}
                />
              </div>
              <div className="field__hint-row">
                <span className="field__hint">Appears on your statement</span>
                <span className="field__counter">{description.length}/80</span>
              </div>
            </div>

            {/* Footer */}
            <div className="withdraw-modal-footer">
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
                className="btn btn--withdraw"
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
                    Complete Withdrawal
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