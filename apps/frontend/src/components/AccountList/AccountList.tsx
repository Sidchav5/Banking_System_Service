import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { Account } from '@bankflow/shared';
import { OpenAccountModal } from '../OpenAccountModal/OpenAccountModal';
import { AccountDetailsModal } from '../AccountDetailsModal/AccountDetailsModal';
import './AccountList.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

export const AccountList: React.FC = () => {
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

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

  const formatCurrency = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    });
  };

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="fw-bold mb-1">
            <i className="bi bi-wallet2 text-info me-2"></i> Bank Accounts
          </h2>
          <p className="text-muted small mb-0">Manage your active savings, current, and deposit accounts</p>
        </div>
        <button className="btn btn-info font-weight-bold text-dark" onClick={() => setShowOpenModal(true)}>
          <i className="bi bi-plus-lg me-1"></i> Open New Account
        </button>
      </div>

      {error && (
        <div className="alert alert-warning shadow-sm mb-4" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-info" role="status"></div>
          <p className="text-muted mt-2">Loading account records...</p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="card text-center py-5 shadow-sm border-0">
          <div className="card-body">
            <i className="bi bi-bank display-1 text-muted mb-3 d-block"></i>
            <h4 className="fw-bold">No Active Accounts Found</h4>
            <p className="text-muted">You do not have any open bank accounts registered under your profile.</p>
            <button className="btn btn-info font-weight-bold text-dark mt-2" onClick={() => setShowOpenModal(true)}>
              Open Your First Account
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="col-md-6 col-lg-4">
              <div className="card account-card h-100">
                <div className="card-header-bg d-flex justify-content-between align-items-center">
                  <span className="account-type-badge">{acc.accountType}</span>
                  <span className={`badge ${acc.status === 'ACTIVE' ? 'bg-success' : 'bg-warning text-dark'}`}>
                    {acc.status}
                  </span>
                </div>

                <div className="card-body p-4 d-flex flex-column justify-content-between">
                  <div>
                    <small className="text-muted d-block mb-1">ACCOUNT NUMBER</small>
                    <div className="account-number mb-3">{acc.accountNumber}</div>

                    <small className="text-muted d-block mb-1">TOTAL BALANCE</small>
                    <div className="balance-amount mb-2">{formatCurrency(acc.balance)}</div>

                    <div className="d-flex justify-content-between text-muted small">
                      <span>Available Balance:</span>
                      <strong className="text-dark">{formatCurrency(acc.availableBalance)}</strong>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-top d-flex justify-content-between">
                    <button
                      className="btn btn-outline-info btn-sm w-100"
                      onClick={() => setSelectedAccount(acc)}
                    >
                      <i className="bi bi-sliders me-1"></i> Account Details & Limits
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showOpenModal && (
        <OpenAccountModal
          onClose={() => setShowOpenModal(false)}
          onSuccess={() => {
            setShowOpenModal(false);
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
