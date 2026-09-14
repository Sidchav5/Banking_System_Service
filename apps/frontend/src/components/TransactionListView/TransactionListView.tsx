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
      setError('Could not fetch transaction history. Ensure transaction-service is running.');
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

  return (
    <div className="txn-page">
      <div className="txn-container">
        {/* Header */}
        <header className="txn-header">
          <div className="txn-header__text">
            <span className="txn-header__eyebrow">Payment Processing</span>
            <h1 className="txn-header__title">Transfers & Transactions</h1>
            <p className="txn-header__subtitle">
              Orchestrated inter-account transfers with idempotency and double-entry integration
            </p>
          </div>
          <button
            type="button"
            className="btn btn--refresh"
            onClick={fetchTransactions}
            title="Refresh Transactions"
          >
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </header>

        {/* Error Alert */}
        {error && (
          <div className="txn-alert txn-alert--danger" role="alert">
            <i className="bi bi-exclamation-triangle-fill"></i>
            <span>{error}</span>
          </div>
        )}

        {/* Loading / Table / Empty */}
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
            <h3>No Transactions Found</h3>
            <p>You haven't initiated or received any inter-account transfers yet.</p>
          </div>
        ) : (
          <div className="txn-list-card">
            <div className="table-responsive">
              <table className="txn-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Transaction #</th>
                    <th>Source Account</th>
                    <th>Destination Account</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th className="text-end">Amount</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => {
                    const isCompleted = txn.status === 'COMPLETED';
                    return (
                      <tr key={txn.id}>
                        <td className="text-nowrap">{formatDate(txn.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="txn-number-btn"
                            onClick={() => handleCopy(txn.transactionNumber)}
                            title="Click to copy Transaction Number"
                          >
                            <code>{txn.transactionNumber}</code>
                            <i
                              className={`bi ${
                                copiedTxn === txn.transactionNumber
                                  ? 'bi-check-lg text-success'
                                  : 'bi-copy'
                              }`}
                            ></i>
                          </button>
                        </td>
                        <td>
                          <code className="acc-tag">{txn.sourceAccountNumber}</code>
                        </td>
                        <td>
                          <code className="acc-tag">{txn.destinationAccountNumber}</code>
                        </td>
                        <td className="desc-col">{txn.description}</td>
                        <td>
                          <span
                            className={`txn-badge txn-badge--${txn.status.toLowerCase()}`}
                          >
                            <span className="txn-badge__dot" />
                            {txn.status}
                          </span>
                        </td>
                        <td className="text-end amount-cell">
                          {formatCurrency(txn.amount)}
                        </td>
                        <td className="text-center">
                          {isCompleted ? (
                            <button
                              type="button"
                              className="btn-action-reverse"
                              onClick={() => handleReverse(txn.id)}
                              disabled={reversingId === txn.id}
                              title="Reverse Transaction"
                            >
                              {reversingId === txn.id ? (
                                <span className="spinner-border spinner-border-sm" role="status" />
                              ) : (
                                <>
                                  <i className="bi bi-arrow-counterclockwise"></i> Reverse
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-muted small">—</span>
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
