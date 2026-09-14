import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Transaction } from '@bankflow/shared';
import './TransactionListView.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

export const TransactionListView: React.FC = () => {
  const { accessToken } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedTxn, setCopiedTxn] = useState<string | null>(null);
  const [reversingId, setReversingId] = useState<string | null>(null);

  const fetchTransactions = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/transactions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.data.success) {
        setTransactions(res.data.data);
      }
    } catch {
      setError(
        'Could not fetch transaction history. Ensure transaction-service is running.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [accessToken]);

  const handleCopy = (txnNum: string) => {
    navigator.clipboard.writeText(txnNum);
    setCopiedTxn(txnNum);
    setTimeout(() => setCopiedTxn(null), 1500);
  };

  const handleReverse = async (txnId: string) => {
    if (!window.confirm('Are you sure you want to reverse this transaction?')) return;
    setReversingId(txnId);
    try {
      await axios.post(
        `${API_BASE_URL}/transactions/${txnId}/reverse`,
        {},
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      fetchTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to reverse transaction');
    } finally {
      setReversingId(null);
    }
  };

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
    });
  };

  // Derived summary
  const summary = transactions.reduce(
    (acc, t) => {
      if (t.status === 'COMPLETED') acc.completed++;
      else if (t.status === 'PENDING') acc.pending++;
      else if (t.status === 'REVERSED') acc.reversed++;
      acc.volume += t.amount;
      return acc;
    },
    { completed: 0, pending: 0, reversed: 0, volume: 0 }
  );

  return (
    <div className="txn-page">
      <div className="txn-container">
        {/* Hero header */}
        <header className="txn-hero">
          <div className="txn-hero__left">
            <div className="txn-hero__icon">
              <i className="bi bi-arrow-left-right"></i>
            </div>
            <div>
              <span className="txn-hero__eyebrow">Payment Processing</span>
              <h1 className="txn-hero__title">Transfers & Transactions</h1>
              <p className="txn-hero__subtitle">
                Orchestrated inter-account transfers with idempotency and double-entry integration
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={fetchTransactions}
            disabled={loading}
            title="Refresh Transactions"
          >
            <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}></i>
            Refresh
          </button>
        </header>

        {/* Error */}
        {error && (
          <div className="txn-alert" role="alert">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <span>{error}</span>
          </div>
        )}

        {/* Summary stats */}
        {!loading && transactions.length > 0 && (
          <section className="txn-summary">
            <div className="txn-stat">
              <div className="txn-stat__icon txn-stat__icon--ok">
                <i className="bi bi-check-circle-fill"></i>
              </div>
              <div>
                <span className="txn-stat__label">Completed</span>
                <span className="txn-stat__value">{summary.completed}</span>
              </div>
            </div>

            <div className="txn-stat">
              <div className="txn-stat__icon txn-stat__icon--warn">
                <i className="bi bi-hourglass-split"></i>
              </div>
              <div>
                <span className="txn-stat__label">Pending</span>
                <span className="txn-stat__value">{summary.pending}</span>
              </div>
            </div>

            <div className="txn-stat">
              <div className="txn-stat__icon txn-stat__icon--danger">
                <i className="bi bi-arrow-counterclockwise"></i>
              </div>
              <div>
                <span className="txn-stat__label">Reversed</span>
                <span className="txn-stat__value">{summary.reversed}</span>
              </div>
            </div>

            <div className="txn-stat">
              <div className="txn-stat__icon txn-stat__icon--neutral">
                <i className="bi bi-cash-stack"></i>
              </div>
              <div>
                <span className="txn-stat__label">Total Volume</span>
                <span className="txn-stat__value txn-stat__value--mono">
                  {formatCurrency(summary.volume)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Loading / Empty / Table */}
        {loading ? (
          <div className="txn-skeleton-list">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="txn-skeleton-card" />
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="txn-empty">
            <div className="txn-empty__icon">
              <i className="bi bi-arrow-left-right"></i>
            </div>
            <h3>No transactions yet</h3>
            <p>
              You haven't initiated or received any inter-account transfers yet.
            </p>
          </div>
        ) : (
          <div className="txn-list-card">
            <div className="table-responsive">
              <table className="txn-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Transaction</th>
                    <th>Route</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th className="align-end">Amount</th>
                    <th className="align-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => {
                    const isCompleted = txn.status === 'COMPLETED';
                    const isReversing = reversingId === txn.id;
                    const wasCopied = copiedTxn === txn.transactionNumber;

                    return (
                      <tr key={txn.id}>
                        <td className="cell-time">{formatDate(txn.createdAt)}</td>

                        <td>
                          <button
                            type="button"
                            className={`txn-number ${wasCopied ? 'is-copied' : ''}`}
                            onClick={() => handleCopy(txn.transactionNumber)}
                            title="Click to copy"
                          >
                            <code>{txn.transactionNumber}</code>
                            <i
                              className={`bi ${
                                wasCopied ? 'bi-check-lg' : 'bi-copy'
                              }`}
                            ></i>
                          </button>
                        </td>

                        <td>
                          <div className="route-cell">
                            <span className="route-cell__acct">
                              {txn.sourceAccountNumber}
                            </span>
                            <i className="bi bi-arrow-right route-cell__arrow"></i>
                            <span className="route-cell__acct">
                              {txn.destinationAccountNumber}
                            </span>
                          </div>
                        </td>

                        <td className="cell-description">{txn.description}</td>

                        <td>
                          <span
                            className={`txn-badge txn-badge--${txn.status.toLowerCase()}`}
                          >
                            <span className="txn-badge__dot" />
                            {txn.status}
                          </span>
                        </td>

                        <td className="align-end cell-amount">
                          {formatCurrency(txn.amount)}
                        </td>

                        <td className="align-center">
                          {isCompleted ? (
                            <button
                              type="button"
                              className="btn-reverse"
                              onClick={() => handleReverse(txn.id)}
                              disabled={isReversing}
                              title="Reverse Transaction"
                            >
                              {isReversing ? (
                                <span className="spinner spinner--dark" />
                              ) : (
                                <>
                                  <i className="bi bi-arrow-counterclockwise"></i>
                                  Reverse
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="cell-dash">—</span>
                          )}
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