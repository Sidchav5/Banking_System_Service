import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Account } from '@bankflow/shared';
import { OpenAccountModal } from '../OpenAccountModal/OpenAccountModal';
import { AccountDetailsModal } from '../AccountDetailsModal/AccountDetailsModal';
import { DepositModal } from '../DepositModal/DepositModal';
import { WithdrawalModal } from '../WithdrawalModal/WithdrawalModal';
import './AccountList.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

export const AccountList: React.FC = () => {
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [depositAccount, setDepositAccount] = useState<Account | null>(null);
  const [withdrawAccount, setWithdrawAccount] = useState<Account | null>(null);

  const fetchAccounts = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/accounts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.data.success) {
        setAccounts(res.data.data);
      }
    } catch {
      setError('Could not fetch accounts. Start account-service or API Gateway.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [accessToken]);

  const formatCurrency = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });

  // Format account number into groups of 4 for readability
  const formatAccountNumber = (num: string) =>
    num.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();

  const getAccountIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'SAVINGS':
        return 'bi-piggy-bank';
      case 'CURRENT':
        return 'bi-briefcase';
      case 'FIXED_DEPOSIT':
        return 'bi-safe';
      default:
        return 'bi-bank2';
    }
  };

  return (
    <div className="accounts-page">
      <div className="accounts-container">
        {/* Page header */}
        <header className="accounts-hero">
          <div className="accounts-hero__text">
            <span className="accounts-hero__eyebrow">Banking Overview</span>
            <h1 className="accounts-hero__title">Your Accounts</h1>
            <p className="accounts-hero__subtitle">
              Manage savings, current, and deposit accounts in one place
            </p>
          </div>
          <button
            className="btn btn--primary"
            onClick={() => setShowOpenModal(true)}
          >
            <i className="bi bi-plus-lg"></i> Open New Account
          </button>
        </header>

        {/* Error */}
        {error && (
          <div className="alert-banner" role="alert">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <div className="alert-banner__body">
              <strong>Unable to load accounts</strong>
              <span>{error}</span>
            </div>
            <button
              className="btn btn--ghost btn--sm"
              onClick={fetchAccounts}
              type="button"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="accounts-grid">
            {[1, 2, 3].map((i) => (
              <div key={i} className="account-skeleton">
                <div className="skeleton skeleton--header" />
                <div className="skeleton skeleton--line" />
                <div className="skeleton skeleton--balance" />
                <div className="skeleton skeleton--line-short" />
              </div>
            ))}
          </div>
        ) : accounts.length === 0 ? (
          /* Empty state */
          <div className="empty-state">
            <div className="empty-state__icon">
              <i className="bi bi-bank"></i>
            </div>
            <h3>No accounts yet</h3>
            <p>
              You don't have any bank accounts registered under your profile.
              Open one to get started.
            </p>
            <button
              className="btn btn--primary"
              onClick={() => setShowOpenModal(true)}
            >
              <i className="bi bi-plus-lg"></i> Open Your First Account
            </button>
          </div>
        ) : (
          /* Grid */
          <div className="accounts-grid">
            {accounts.map((acc) => {
              return (
                <article
                  key={acc.id}
                  className="account-card"
                  onClick={() => setSelectedAccount(acc)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedAccount(acc);
                    }
                  }}
                >
                  {/* Card top - dark "bank card" face */}
                  <div className="account-card__face">
                    <div className="account-card__face-top">
                      <div className="account-card__type">
                        <i className={`bi ${getAccountIcon(acc.accountType)}`}></i>
                        <span>{acc.accountType}</span>
                      </div>
                      <span
                        className={`status-badge status-badge--${acc.status.toLowerCase()}`}
                      >
                        <span className="status-badge__dot" />
                        {acc.status}
                      </span>
                    </div>

                    <div className="account-card__number">
                      {formatAccountNumber(acc.accountNumber)}
                    </div>

                    <div className="account-card__face-bottom">
                      <span className="account-card__chip">
                        <i className="bi bi-shield-lock-fill"></i>
                        BankFlow Secure
                      </span>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="account-card__body">
                    <div className="account-card__balance-block">
                      <span className="account-card__label">Total Balance</span>
                      <span className="account-card__balance">
                        {formatCurrency(acc.balance)}
                      </span>
                    </div>

                    <div className="account-card__available">
                      <span>Available</span>
                      <strong>{formatCurrency(acc.availableBalance)}</strong>
                    </div>
                  </div>

                  {/* Card quick actions */}
                  <div className="account-card__quick-actions">
                    <button
                      type="button"
                      className="btn-quick btn-quick--deposit"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDepositAccount(acc);
                      }}
                    >
                      <i className="bi bi-arrow-down-left"></i> Deposit
                    </button>
                    <button
                      type="button"
                      className="btn-quick btn-quick--withdraw"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWithdrawAccount(acc);
                      }}
                    >
                      <i className="bi bi-arrow-up-right"></i> Withdraw
                    </button>
                  </div>

                  {/* Card footer */}
                  <div className="account-card__footer">
                    <button
                      type="button"
                      className="account-card__action"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAccount(acc);
                      }}
                    >
                      <i className="bi bi-sliders"></i>
                      <span>Manage Limits</span>
                      <i className="bi bi-chevron-right account-card__chevron"></i>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {showOpenModal && (
        <OpenAccountModal
          onClose={() => setShowOpenModal(false)}
          onSuccess={() => {
            setShowOpenModal(false);
            fetchAccounts();
          }}
        />
      )}

      {depositAccount && (
        <DepositModal
          account={depositAccount}
          onClose={() => setDepositAccount(null)}
          onSuccess={() => {
            setDepositAccount(null);
            fetchAccounts();
          }}
        />
      )}

      {withdrawAccount && (
        <WithdrawalModal
          account={withdrawAccount}
          onClose={() => setWithdrawAccount(null)}
          onSuccess={() => {
            setWithdrawAccount(null);
            fetchAccounts();
          }}
        />
      )}

      {selectedAccount && (
        <AccountDetailsModal
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
          onUpdate={() => {
            setSelectedAccount(null);
            fetchAccounts();
          }}
        />
      )}
    </div>
  );
};