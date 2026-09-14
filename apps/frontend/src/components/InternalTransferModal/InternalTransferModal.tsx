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

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDest = destAccountNumber.replace(/\s/g, '').trim();
    const amountVal = parseFloat(rupees);

    if (!cleanDest) {
      setError('Please enter a valid 12-digit destination account number');
      return;
    }

    if (cleanDest === sourceAccount.accountNumber) {
      setError('Source and destination account numbers cannot be identical');
      return;
    }

    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Please enter a valid positive transfer amount');
      return;
    }

    const amountPaise = Math.round(amountVal * 100);

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
        'Failed to execute transfer. Ensure transaction & ledger services are running.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop-custom" onClick={onClose}>
      <div
        className="transfer-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="transferModalTitle"
      >
        <div className="transfer-modal__header">
          <div className="transfer-modal__title-group">
            <span className="transfer-modal__icon">
              <i className="bi bi-send-fill"></i>
            </span>
            <div>
              <h2 id="transferModalTitle" className="transfer-modal__title">
                Send Money (Internal Transfer)
              </h2>
              <p className="transfer-modal__subtitle">
                From Account: <code>{sourceAccount.accountNumber}</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="transfer-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <form onSubmit={handleTransfer} className="transfer-modal__body">
          {/* Source Account Info */}
          <div className="transfer-modal__balance-card">
            <div className="balance-info">
              <span className="balance-info__label">Available Balance</span>
              <span className="balance-info__value">
                {formatCurrency(sourceAccount.availableBalance)}
              </span>
            </div>
            <div className="balance-info">
              <span className="balance-info__label">Account Type</span>
              <span className="balance-info__badge">{sourceAccount.accountType}</span>
            </div>
          </div>

          {error && (
            <div className="transfer-alert transfer-alert--danger">
              <i className="bi bi-exclamation-octagon-fill"></i>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="transfer-alert transfer-alert--success">
              <i className="bi bi-check-circle-fill"></i>
              <span>{successMsg}</span>
            </div>
          )}

          <div className="form-group mb-3">
            <label htmlFor="destAccount" className="form-label">
              Destination Account Number (12 digits)
            </label>
            <input
              id="destAccount"
              type="text"
              className="form-input form-input--no-prefix"
              placeholder="e.g. 100084920192"
              value={destAccountNumber}
              onChange={(e) => setDestAccountNumber(e.target.value)}
              disabled={loading}
              autoFocus
              required
            />
          </div>

          <div className="form-group mb-3">
            <label htmlFor="transferAmount" className="form-label">
              Transfer Amount (₹ INR)
            </label>
            <div className="input-group-custom">
              <span className="input-prefix">₹</span>
              <input
                id="transferAmount"
                type="number"
                step="0.01"
                min="1"
                className="form-input"
                placeholder="e.g. 1500"
                value={rupees}
                onChange={(e) => setRupees(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Preset quick buttons */}
          <div className="preset-chips">
            {[500, 1000, 2500, 5000, 10000].map((preset) => (
              <button
                key={preset}
                type="button"
                className="preset-chip preset-chip--transfer"
                onClick={() => setRupees(preset.toString())}
              >
                ₹{preset.toLocaleString('en-IN')}
              </button>
            ))}
          </div>

          <div className="form-group mb-4">
            <label htmlFor="transferDesc" className="form-label">
              Description / Reason (Optional)
            </label>
            <input
              id="transferDesc"
              type="text"
              className="form-input form-input--no-prefix"
              placeholder="e.g. Rent, Gift, Reimbursement"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="transfer-modal__footer">
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
              className="btn-custom btn-custom--transfer"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Orchestrating Transfer...
                </>
              ) : (
                <>
                  <i className="bi bi-send-check-fill"></i> Execute Transfer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
