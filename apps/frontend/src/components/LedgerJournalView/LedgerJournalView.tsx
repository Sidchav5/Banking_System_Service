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
  const [refreshing, setRefreshing] = useState(false);

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

  const fetchLedger = async (isRefresh = false) => {
    if (!accessToken || !selectedAccountNumber) {
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
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
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Derived summary
  const totalCredits = ledgerItems
    .filter((i) => i.entryDirection === 'CREDIT')
    .reduce((sum, i) => sum + i.amount, 0);

  const totalDebits = ledgerItems
    .filter((i) => i.entryDirection === 'DEBIT')
    .reduce((sum, i) => sum + i.amount, 0);

  const netFlow = totalCredits - totalDebits;

  return (
    <div className="ledger-view-page">
      <div className="ledger-container">
        {/* Hero header */}
        <header className="ledger-hero">
          <div className="ledger-hero__left">
            <div className="ledger-hero__icon">
              <i className="bi bi-journal-text"></i>
            </div>
            <div>
              <span className="ledger-hero__eyebrow">Immutable Audit Trail</span>
              <h1 className="ledger-hero__title">Double-Entry Journal Ledger</h1>
              <p className="ledger-hero__subtitle">
                Real-time debit & credit postings compliant with banking GAAP standards
              </p>
            </div>
          </div>

          <div className="ledger-hero__actions">
            {accounts.length > 0 && (
              <div className="account-selector">
                <i className="bi bi-wallet2 account-selector__icon"></i>
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
                <i className="bi bi-chevron-down account-selector__chevron"></i>
              </div>
            )}

            <button
              type="button"
              className="btn btn--primary"
              onClick={() => fetchLedger(true)}
              disabled={refreshing}
              title="Refresh Ledger Logs"
            >
              <i className={`bi bi-arrow-clockwise ${refreshing ? 'spin' : ''}`}></i>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* Error */}
        {error && (
          <div className="ledger-alert" role="alert">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <span>{error}</span>
          </div>
        )}

        {/* Summary strip */}
        {!loading && ledgerItems.length > 0 && (
          <section className="ledger-summary">
            <div className="ledger-stat">
              <div className="ledger-stat__icon ledger-stat__icon--credit">
                <i className="bi bi-arrow-down-left"></i>
              </div>
              <div>
                <span className="ledger-stat__label">Total Credits</span>
                <span className="ledger-stat__value ledger-stat__value--credit">
                  {formatCurrency(totalCredits)}
                </span>
              </div>
            </div>

            <div className="ledger-stat">
              <div className="ledger-stat__icon ledger-stat__icon--debit">
                <i className="bi bi-arrow-up-right"></i>
              </div>
              <div>
                <span className="ledger-stat__label">Total Debits</span>
                <span className="ledger-stat__value ledger-stat__value--debit">
                  {formatCurrency(totalDebits)}
                </span>
              </div>
            </div>

            <div className="ledger-stat">
              <div className={`ledger-stat__icon ledger-stat__icon--${netFlow >= 0 ? 'credit' : 'debit'}`}>
                <i className="bi bi-activity"></i>
              </div>
              <div>
                <span className="ledger-stat__label">Net Flow</span>
                <span className={`ledger-stat__value ledger-stat__value--${netFlow >= 0 ? 'credit' : 'debit'}`}>
                  {netFlow >= 0 ? '+' : ''}{formatCurrency(netFlow)}
                </span>
              </div>
            </div>

            <div className="ledger-stat">
              <div className="ledger-stat__icon ledger-stat__icon--neutral">
                <i className="bi bi-list-ol"></i>
              </div>
              <div>
                <span className="ledger-stat__label">Entries</span>
                <span className="ledger-stat__value">{ledgerItems.length}</span>
              </div>
            </div>
          </section>
        )}

        {/* Loading / Empty / Table */}
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
            <h3>No journal entries yet</h3>
            <p>
              No double-entry postings for account{' '}
              <code>{selectedAccountNumber}</code>. Perform a deposit or transfer
              to see ledger activity here.
            </p>
          </div>
        ) : (
          <div className="ledger-table-card">
            <div className="table-responsive">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Reference</th>
                    <th>Entry Type</th>
                    <th>Description</th>
                    <th>Direction</th>
                    <th className="align-end">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerItems.map((item) => {
                    const isCredit = item.entryDirection === 'CREDIT';
                    return (
                      <tr key={item.ledgerEntryId}>
                        <td className="cell-time">{formatDate(item.createdAt)}</td>
                        <td>
                          <code className="ref-code">{item.referenceId}</code>
                        </td>
                        <td>
                          <span className={`type-badge type-badge--${item.entryType.toLowerCase()}`}>
                            {item.entryType}
                          </span>
                        </td>
                        <td className="cell-description">{item.description}</td>
                        <td>
                          <span className={`direction-badge direction-badge--${isCredit ? 'credit' : 'debit'}`}>
                            <i className={`bi ${isCredit ? 'bi-arrow-down-left' : 'bi-arrow-up-right'}`}></i>
                            {item.entryDirection}
                          </span>
                        </td>
                        <td className={`align-end cell-amount ${isCredit ? 'is-credit' : 'is-debit'}`}>
                          {isCredit ? '+' : '−'}{formatCurrency(item.amount)}
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