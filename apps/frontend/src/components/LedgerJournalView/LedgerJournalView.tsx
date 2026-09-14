import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Account } from '@bankflow/shared';
import './LedgerJournalView.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

interface LedgerItem {
  ledgerEntryId: string;
  journalEntryId: string;
  accountNumber: string;
  entryDirection: 'DEBIT' | 'CREDIT';
  amount: number;
  createdAt: string;
  referenceId: string;
  description: string;
  entryType: string;
}

export const LedgerJournalView: React.FC = () => {
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountNumber, setSelectedAccountNumber] = useState<string>('');
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch accounts list to allow account switching
  useEffect(() => {
    const fetchAccounts = async () => {
      if (!accessToken) return;
      try {
        const res = await axios.get(`${API_BASE_URL}/accounts`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.data.success && res.data.data.length > 0) {
          setAccounts(res.data.data);
          setSelectedAccountNumber(res.data.data[0].accountNumber);
        }
      } catch (err) {
        console.error('Failed to load accounts for ledger view', err);
      }
    };
    fetchAccounts();
  }, [accessToken]);

  // Fetch ledger entries when selected account changes
  const fetchLedger = async () => {
    if (!accessToken || !selectedAccountNumber) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(
        `${API_BASE_URL}/ledger/journals/account/${selectedAccountNumber}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (res.data.success) {
        setLedgerItems(res.data.data);
      }
    } catch {
      setError('Could not load ledger entries. Ensure ledger-service is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [accessToken, selectedAccountNumber]);

  const formatCurrency = (paise: number) =>
    (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="ledger-view-page">
      <div className="ledger-container">
        {/* Header */}
        <header className="ledger-header">
          <div className="ledger-header__text">
            <span className="ledger-header__eyebrow">Immutable Audit Trail</span>
            <h1 className="ledger-header__title">Double-Entry Journal Ledger</h1>
            <p className="ledger-header__subtitle">
              Real-time debit & credit ledger postings compliant with banking GAAP standards
            </p>
          </div>

          <div className="ledger-header__actions">
            {accounts.length > 0 && (
              <div className="account-selector">
                <label htmlFor="accountSelect" className="account-selector__label">
                  Account:
                </label>
                <select
                  id="accountSelect"
                  className="account-selector__select"
                  value={selectedAccountNumber}
                  onChange={(e) => setSelectedAccountNumber(e.target.value)}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.accountNumber}>
                      {acc.accountType} — {acc.accountNumber} ({formatCurrency(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              className="btn btn--refresh"
              onClick={fetchLedger}
              title="Refresh Ledger Logs"
            >
              <i className="bi bi-arrow-clockwise"></i> Refresh
            </button>
          </div>
        </header>

        {/* Error Alert */}
        {error && (
          <div className="ledger-alert ledger-alert--danger" role="alert">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <span>{error}</span>
          </div>
        )}

        {/* Loading / Table / Empty */}
        {loading ? (
          <div className="ledger-skeleton-table">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ledger-skeleton-row" />
            ))}
          </div>
        ) : ledgerItems.length === 0 ? (
          <div className="ledger-empty">
            <div className="ledger-empty__icon">
              <i className="bi bi-journal-text"></i>
            </div>
            <h3>No Ledger Journal Entries Found</h3>
            <p>
              No double-entry journal postings found for account{' '}
              <code>{selectedAccountNumber}</code>. Perform a deposit or withdrawal to test.
            </p>
          </div>
        ) : (
          <div className="ledger-table-card">
            <div className="table-responsive">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Reference ID</th>
                    <th>Entry Type</th>
                    <th>Description</th>
                    <th>Direction</th>
                    <th className="text-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerItems.map((item) => {
                    const isCredit = item.entryDirection === 'CREDIT';
                    return (
                      <tr key={item.ledgerEntryId}>
                        <td className="text-nowrap">{formatDate(item.createdAt)}</td>
                        <td>
                          <code className="ref-code">{item.referenceId}</code>
                        </td>
                        <td>
                          <span className={`type-badge type-badge--${item.entryType.toLowerCase()}`}>
                            {item.entryType}
                          </span>
                        </td>
                        <td className="description-col">{item.description}</td>
                        <td>
                          <span
                            className={`direction-badge direction-badge--${
                              isCredit ? 'credit' : 'debit'
                            }`}
                          >
                            <i
                              className={`bi ${
                                isCredit ? 'bi-arrow-down-left' : 'bi-arrow-up-right'
                              }`}
                            ></i>
                            {item.entryDirection}
                          </span>
                        </td>
                        <td className={`text-end amount-col ${isCredit ? 'text-credit' : 'text-debit'}`}>
                          {isCredit ? '+' : '-'}{formatCurrency(item.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
