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

export const AccountDetailsModal: React.FC<AccountDetailsModalProps> = ({
  account,
  onClose,
  onUpdate,
}) => {
  const { accessToken } = useAuth();
  const [dailyLimitRupees, setDailyLimitRupees] = useState(
    (account.dailyTransferLimit / 100).toString()
  );
  const [singleLimitRupees, setSingleLimitRupees] = useState(
    (account.singleTransactionLimit / 100).toString()
  );
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formatCurrency = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });

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

  const isActive = account.status === 'ACTIVE';
  const isClosed = account.status === 'CLOSED';

  return (
    <div className="details-modal-backdrop" onClick={onClose}>
      <div
        className="details-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="details-header">
          <div className="details-header__left">
            <div className="details-header__icon">
              <i className="bi bi-bank2"></i>
            </div>
            <div>
              <h2 id="account-details-title" className="details-header__title">
                Account Details
              </h2>
              <div className="details-header__meta">
                <span className="details-header__acct">{account.accountNumber}</span>
                <span
                  className={`status-badge status-badge--${account.status.toLowerCase()}`}
                >
                  <span className="status-badge__dot" />
                  {account.status}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="details-close"
            aria-label="Close"
            onClick={onClose}
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </header>

        {/* Body */}
        <div className="details-body">
          {statusMessage && (
            <div className="details-alert" role="alert">
              <i className="bi bi-info-circle-fill"></i>
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Balances */}
          <section className="balance-grid">
            <div className="balance-tile balance-tile--primary">
              <div className="balance-tile__head">
                <i className="bi bi-wallet2"></i>
                <span>Total Balance</span>
              </div>
              <div className="balance-tile__value">
                {formatCurrency(account.balance)}
              </div>
            </div>

            <div className="balance-tile balance-tile--accent">
              <div className="balance-tile__head">
                <i className="bi bi-lightning-charge-fill"></i>
                <span>Available</span>
              </div>
              <div className="balance-tile__value">
                {formatCurrency(account.availableBalance)}
              </div>
            </div>
          </section>

          {/* Transaction Limits */}
          <section className="details-section">
            <div className="section-heading">
              <i className="bi bi-shield-check"></i>
              <h3>Transaction Safety Limits</h3>
            </div>

            <form onSubmit={handleUpdateLimits} className="limits-form">
              <div className="limits-grid">
                <div className="field">
                  <label htmlFor="daily-limit">Daily Transfer Limit</label>
                  <div className="input-affix">
                    <span className="input-affix__prefix">₹</span>
                    <input
                      id="daily-limit"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={dailyLimitRupees}
                      onChange={(e) => setDailyLimitRupees(e.target.value)}
                      required
                    />
                  </div>
                  <small className="field__hint">Max you can send per day</small>
                </div>

                <div className="field">
                  <label htmlFor="single-limit">Single Transaction Limit</label>
                  <div className="input-affix">
                    <span className="input-affix__prefix">₹</span>
                    <input
                      id="single-limit"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={singleLimitRupees}
                      onChange={(e) => setSingleLimitRupees(e.target.value)}
                      required
                    />
                  </div>
                  <small className="field__hint">Max per individual transfer</small>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner" /> Saving…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle"></i> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Account Actions */}
          <section className="details-section">
            <div className="section-heading">
              <i className="bi bi-sliders2"></i>
              <h3>Account Controls</h3>
            </div>

            <div className="action-row">
              {isActive ? (
                <button
                  type="button"
                  className="btn btn--warn"
                  onClick={() => handleToggleStatus('FROZEN')}
                  disabled={loading}
                >
                  <i className="bi bi-snow2"></i> Freeze Account
                </button>
              ) : (
                !isClosed && (
                  <button
                    type="button"
                    className="btn btn--success"
                    onClick={() => handleToggleStatus('ACTIVE')}
                    disabled={loading}
                  >
                    <i className="bi bi-play-circle-fill"></i> Unfreeze Account
                  </button>
                )
              )}

              {!isClosed && (
                <button
                  type="button"
                  className="btn btn--danger-ghost"
                  onClick={() => handleToggleStatus('CLOSED')}
                  disabled={loading}
                >
                  <i className="bi bi-x-octagon"></i> Close Account
                </button>
              )}

              {isClosed && (
                <div className="closed-note">
                  <i className="bi bi-lock-fill"></i>
                  This account is permanently closed.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};