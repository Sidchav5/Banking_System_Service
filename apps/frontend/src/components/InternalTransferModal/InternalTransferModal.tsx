import React, { useState } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import { Account } from '@bankflow/shared';
import './InternalTransferModal.css';

interface InternalTransferModalProps {
  sourceAccount: Account;
  onClose: () => void;
  onSuccess: () => void;
}

const API_BASE_URL = 'http://localhost:3000/api/v1';
const PRESETS = [500, 1000, 2500, 5000, 10000];

export const InternalTransferModal: React.FC<InternalTransferModalProps> = ({
  sourceAccount,
  onClose,
  onSuccess,
}) => {
  const { accessToken } = useAuth();
  const [destAccountNumber, setDestAccountNumber] = useState<string>('');
  const [rupees, setRupees] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [idempotencyKey] = useState<string>(() => uuidv4());

  const formatCurrency = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });

  const cleanDest = destAccountNumber.replace(/\s/g, '').trim();
  const numericValue = parseFloat(rupees);
  const isValidAmount = !isNaN(numericValue) && numericValue > 0;
  const amountPaise = isValidAmount ? Math.round(numericValue * 100) : 0;
  const isSelfTransfer =
    cleanDest && cleanDest === sourceAccount.accountNumber;
  const hasEnoughFunds = amountPaise <= sourceAccount.availableBalance;
  const remainingBalance = sourceAccount.availableBalance - amountPaise;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cleanDest) {
      setError('Please enter a valid 12-digit destination account number');
      return;
    }

    if (cleanDest === sourceAccount.accountNumber) {
      setError('Source and destination account numbers cannot be identical');
      return;
    }

    if (isNaN(numericValue) || numericValue <= 0) {
      setError('Please enter a valid positive transfer amount');
      return;
    }

    if (amountPaise > sourceAccount.availableBalance) {
      setError(
        `Insufficient funds. Requested ${formatCurrency(amountPaise)}, but available balance is ${formatCurrency(sourceAccount.availableBalance)}`
      );
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/transactions/transfers/internal`,
        {
          sourceAccountNumber: sourceAccount.accountNumber,
          destinationAccountNumber: cleanDest,
          amount: amountPaise,
          description: description.trim() || `Transfer to account ${cleanDest}`,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Idempotency-Key': idempotencyKey,
          },
        }
      );

      if (res.data.success) {
        setSuccessMsg(
          `Successfully transferred ${formatCurrency(amountPaise)} to ${cleanDest} (Ref: ${res.data.data.transactionNumber})`
        );
        setTimeout(() => {
          onSuccess();
        }, 1400);
      }
    } catch (err: any) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Failed to execute transfer. Ensure transaction & ledger services are running.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="transfer-modal-backdrop" onClick={onClose}>
      <div
        className="transfer-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transferModalTitle"
      >
        {/* Header */}
        <header className="transfer-modal-header">
          <div className="transfer-modal-header__left">
            <div className="transfer-modal-header__icon">
              <i className="bi bi-send-fill"></i>
            </div>
            <div>
              <h2 id="transferModalTitle" className="transfer-modal-header__title">
                Send Money
              </h2>
              <p className="transfer-modal-header__subtitle">
                Internal transfer between BankFlow accounts
              </p>
            </div>
          </div>
          <button
            type="button"
            className="transfer-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        {/* Body */}
        <div className="transfer-modal-body">
          {/* Source → Destination flow strip */}
          <section className="transfer-flow">
            <div className="transfer-flow__node">
              <span className="transfer-flow__label">From</span>
              <span className="transfer-flow__acct transfer-flow__acct--mono">
                {sourceAccount.accountNumber}
              </span>
              <span className="transfer-flow__meta">
                <i className="bi bi-wallet2"></i>
                {formatCurrency(sourceAccount.availableBalance)} available
              </span>
            </div>

            <div className="transfer-flow__arrow">
              <i className="bi bi-arrow-right"></i>
            </div>

            <div className="transfer-flow__node transfer-flow__node--dest">
              <span className="transfer-flow__label">To</span>
              <span
                className={`transfer-flow__acct transfer-flow__acct--mono ${
                  cleanDest ? 'is-filled' : 'is-empty'
                }`}
              >
                {cleanDest || 'Enter account…'}
              </span>
              <span className="transfer-flow__meta">
                <i className="bi bi-bank2"></i>
                BankFlow account
              </span>
            </div>
          </section>

          {error && (
            <div className="transfer-alert transfer-alert--danger" role="alert">
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="transfer-alert transfer-alert--success" role="alert">
              <i className="bi bi-check-circle-fill"></i>
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleTransfer} className="transfer-form">
            {/* Destination */}
            <div className="field">
              <label htmlFor="destAccount">Destination account number</label>
              <div
                className={`input-affix ${
                  isSelfTransfer ? 'has-error' : ''
                }`}
              >
                <span className="input-affix__icon">
                  <i className="bi bi-person-badge"></i>
                </span>
                <input
                  id="destAccount"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 100084920192"
                  value={destAccountNumber}
                  onChange={(e) => setDestAccountNumber(e.target.value)}
                  disabled={loading}
                  autoFocus
                  required
                  className="input-affix__mono"
                  maxLength={14}
                />
              </div>
              {isSelfTransfer ? (
                <span className="field__hint field__hint--danger">
                  <i className="bi bi-x-circle"></i>
                  Destination can't be the same as source account
                </span>
              ) : (
                <span className="field__hint">
                  Must be a 12-digit BankFlow account number
                </span>
              )}
            </div>

            {/* Amount */}
            <div className="field">
              <label htmlFor="transferAmount">Transfer amount</label>
              <div
                className={`input-affix ${
                  isValidAmount && !hasEnoughFunds ? 'has-error' : ''
                }`}
              >
                <span className="input-affix__prefix">₹</span>
                <input
                  id="transferAmount"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 1500"
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value)}
                  disabled={loading}
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

              {/* Balance projection */}
              {isValidAmount && (
                <div
                  className={`transfer-projection ${
                    !hasEnoughFunds ? 'transfer-projection--danger' : ''
                  }`}
                >
                  <div className="transfer-projection__row">
                    <span>Available balance</span>
                    <span className="transfer-projection__value">
                      {formatCurrency(sourceAccount.availableBalance)}
                    </span>
                  </div>
                  <div className="transfer-projection__row">
                    <span>Transfer amount</span>
                    <span className="transfer-projection__value transfer-projection__value--subtract">
                      −{formatCurrency(amountPaise)}
                    </span>
                  </div>
                  <div className="transfer-projection__divider" />
                  <div className="transfer-projection__row transfer-projection__row--total">
                    <span>Remaining balance</span>
                    <span
                      className={`transfer-projection__value ${
                        !hasEnoughFunds ? 'is-negative' : 'is-total'
                      }`}
                    >
                      {hasEnoughFunds
                        ? formatCurrency(remainingBalance)
                        : 'Insufficient funds'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="field">
              <label htmlFor="transferDesc">
                Description <span className="field__optional">Optional</span>
              </label>
              <div className="input-affix">
                <span className="input-affix__icon">
                  <i className="bi bi-chat-left-text"></i>
                </span>
                <input
                  id="transferDesc"
                  type="text"
                  placeholder="e.g. Rent, Gift, Reimbursement"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  maxLength={80}
                />
              </div>
              <div className="field__hint-row">
                <span className="field__hint">Appears on both statements</span>
                <span className="field__counter">{description.length}/80</span>
              </div>
            </div>

            {/* Footer */}
            <div className="transfer-modal-footer">
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
                className="btn btn--transfer"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Sending…
                  </>
                ) : (
                  <>
                    <i className="bi bi-send-check-fill"></i>
                    Send Money
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