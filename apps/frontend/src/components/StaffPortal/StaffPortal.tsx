import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, Account, Transaction } from '@bankflow/shared';
import './StaffPortal.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

import { RagMetricsDashboard } from './RagMetricsDashboard';

type StaffTab = 'kyc' | 'accounts' | 'reversals' | 'limits' | 'settlement' | 'reconciliation' | 'rag';

export const StaffPortal: React.FC = () => {
  const { accessToken, user } = useAuth();
  const [activeTab, setActiveTab] = useState<StaffTab>('kyc');

  // KYC State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [kycFilter, setKycFilter] = useState<string>('ALL');
  const [loadingKyc, setLoadingKyc] = useState<boolean>(false);
  const [updatingKycId, setUpdatingKycId] = useState<string | null>(null);

  // Account Controls State
  const [searchAccountNum, setSearchAccountNum] = useState<string>('');
  const [targetAccount, setTargetAccount] = useState<Account | null>(null);
  const [searchAccError, setSearchAccError] = useState<string | null>(null);
  const [statusReason, setStatusReason] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  // Reversal Desk State
  const [searchTxnCode, setSearchTxnCode] = useState<string>('');
  const [targetTxn, setTargetTxn] = useState<Transaction | null>(null);
  const [searchTxnError, setSearchTxnError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<boolean>(false);

  // Limit Management State (Admin Only)
  const [limitAccId, setLimitAccId] = useState<string>('');
  const [newDailyLimitINR, setNewDailyLimitINR] = useState<string>('100000');
  const [newSingleLimitINR, setNewSingleLimitINR] = useState<string>('50000');
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [limitErr, setLimitErr] = useState<string | null>(null);
  const [updatingLimits, setUpdatingLimits] = useState<boolean>(false);

  const isAdmin = user?.role === 'ADMIN';
  const isEmployee = user?.role === 'EMPLOYEE' || isAdmin;

  // Settlement State
  const [positions, setPositions] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [settlementMsg, setSettlementMsg] = useState<string | null>(null);

  // Reconciliation State
  const [reconRuns, setReconRuns] = useState<any[]>([]);
  const [mismatches, setMismatches] = useState<any[]>([]);
  const [loadingRecon, setLoadingRecon] = useState(false);
  const [runningRecon, setRunningRecon] = useState(false);
  const [reconMsg, setReconMsg] = useState<string | null>(null);

  // ── Fetch Users for KYC Desk ───────────────────────────────────────────────
  const fetchUsers = async () => {
    if (!accessToken) return;
    setLoadingKyc(true);
    try {
      const url =
        kycFilter !== 'ALL'
          ? `${API_BASE_URL}/users?kycStatus=${kycFilter}`
          : `${API_BASE_URL}/users`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.data.success) {
        setUsers(res.data.data);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingKyc(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'kyc') {
      fetchUsers();
    } else if (activeTab === 'settlement') {
      fetchSettlement();
    } else if (activeTab === 'reconciliation') {
      fetchReconciliation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, kycFilter, accessToken]);

  // ── Update KYC Status ──────────────────────────────────────────────────────
  const handleUpdateKyc = async (userId: string, newStatus: 'VERIFIED' | 'REJECTED') => {
    setUpdatingKycId(userId);
    try {
      await axios.patch(
        `${API_BASE_URL}/users/${userId}/kyc`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update KYC status');
    } finally {
      setUpdatingKycId(null);
    }
  };

  // ── Search Account ────────────────────────────────────────────────────────
  const handleSearchAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchAccountNum.trim()) return;
    setSearchAccError(null);
    setTargetAccount(null);
    try {
      const res = await axios.get(
        `${API_BASE_URL}/accounts/by-number/${searchAccountNum.trim()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.data.success) {
        setTargetAccount(res.data.data);
      }
    } catch (err: any) {
      setSearchAccError(err.response?.data?.error?.message || 'Account not found');
    }
  };

  // ── Update Account Status (Freeze/Unfreeze) ───────────────────────────────
  const handleUpdateAccountStatus = async (newStatus: 'ACTIVE' | 'FROZEN' | 'BLOCKED' | 'CLOSED') => {
    if (!targetAccount) return;
    setUpdatingStatus(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/accounts/${targetAccount.id}/status`,
        { status: newStatus, reason: statusReason.trim() || 'Staff administrative action' },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setTargetAccount((prev) => (prev ? { ...prev, status: newStatus } : null));
      setStatusReason('');
      alert(`Account status successfully updated to ${newStatus}`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update account status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // ── Search Transaction for Reversal ───────────────────────────────────────
  const handleSearchTxn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTxnCode.trim()) return;
    setSearchTxnError(null);
    setTargetTxn(null);
    try {
      const res = await axios.get(
        `${API_BASE_URL}/transactions/${searchTxnCode.trim()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (res.data.success) {
        setTargetTxn(res.data.data);
      }
    } catch (err: any) {
      setSearchTxnError(err.response?.data?.error?.message || 'Transaction not found');
    }
  };

  // ── Execute Transaction Reversal ──────────────────────────────────────────
  const handleExecuteReversal = async () => {
    if (!targetTxn) return;
    if (!window.confirm(`Are you sure you want to reverse transaction ${targetTxn.transactionNumber}?`)) return;
    setReversing(true);
    try {
      await axios.post(
        `${API_BASE_URL}/transactions/${targetTxn.id}/reverse`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setTargetTxn((prev) => (prev ? { ...prev, status: 'REVERSED' } : null));
      alert(`Successfully reversed transaction ${targetTxn.transactionNumber}`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to reverse transaction');
    } finally {
      setReversing(false);
    }
  };

  // ── Update Transfer Limits (Admin Only) ───────────────────────────────────
  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!limitAccId.trim()) return;
    setLimitMsg(null);
    setLimitErr(null);
    setUpdatingLimits(true);
    try {
      const dailyPaise = Math.floor(parseFloat(newDailyLimitINR) * 100);
      const singlePaise = Math.floor(parseFloat(newSingleLimitINR) * 100);

      await axios.patch(
        `${API_BASE_URL}/accounts/${limitAccId.trim()}/limits`,
        { dailyTransferLimit: dailyPaise, singleTransactionLimit: singlePaise },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setLimitMsg(`Successfully updated limits for account ID ${limitAccId.trim()}`);
    } catch (err: any) {
      setLimitErr(err.response?.data?.error?.message || 'Failed to update transaction limits');
    } finally {
      setUpdatingLimits(false);
    }
  };

  // ── Settlement helpers ──────────────────────────────────────────────────────
  const fetchSettlement = async () => {
    if (!accessToken) return;
    setLoadingSettlement(true);
    try {
      const [posRes, batchRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/settlement/positions`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        axios.get(`${API_BASE_URL}/settlement/batches`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (posRes.data?.success) setPositions(posRes.data.data);
      if (batchRes.data?.success) setBatches(batchRes.data.data);
    } catch { /* silent */ }
    setLoadingSettlement(false);
  };

  const runSettlementBatch = async () => {
    if (!accessToken) return;
    setRunningBatch(true);
    setSettlementMsg(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/settlement/batches/run`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.data?.success) {
        setSettlementMsg(res.data.message ?? 'Settlement batch completed successfully');
        fetchSettlement();
      }
    } catch (err: any) {
      setSettlementMsg(err.response?.data?.error?.message ?? 'Settlement batch failed');
    }
    setRunningBatch(false);
  };

  // ── Reconciliation helpers ──────────────────────────────────────────────────
  const fetchReconciliation = async () => {
    if (!accessToken) return;
    setLoadingRecon(true);
    try {
      const [runsRes, mismatchRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/reconciliation/runs`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        axios.get(`${API_BASE_URL}/reconciliation/mismatches`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      ]);
      if (runsRes.data?.success) setReconRuns(runsRes.data.data);
      if (mismatchRes.data?.success) setMismatches(mismatchRes.data.data);
    } catch { /* silent */ }
    setLoadingRecon(false);
  };

  const runReconciliation = async () => {
    if (!accessToken) return;
    setRunningRecon(true);
    setReconMsg(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/reconciliation/runs`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.data?.success) {
        setReconMsg('Reconciliation run started. Refresh in a few seconds to see results.');
        setTimeout(fetchReconciliation, 3000);
      }
    } catch (err: any) {
      setReconMsg(err.response?.data?.error?.message ?? 'Reconciliation failed to start');
    }
    setRunningRecon(false);
  };

  const resolveMismatch = async (itemId: string, resolution: string) => {
    if (!accessToken) return;
    try {
      await axios.post(
        `${API_BASE_URL}/reconciliation/mismatches/${itemId}/resolve`,
        { resolution, note: 'Resolved by staff via portal' },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setMismatches((prev) => prev.filter((m) => m.id !== itemId));
    } catch (err: any) {
      alert(err.response?.data?.error?.message ?? 'Failed to resolve mismatch');
    }
  };

  const formatCurrency = (paise: number | string) =>
    (Number(paise) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

  return (
    <div className="staff-portal-page">
      <div className="staff-container">
        {/* Hero */}
        <header className="staff-hero">
          <div className="staff-hero__left">
            <div className="staff-hero__icon">
              <i className="bi bi-shield-lock-fill"></i>
            </div>
            <div>
              <span className="staff-hero__eyebrow">Staff & Admin Operations</span>
              <h1 className="staff-hero__title">Bank Control Portal</h1>
              <p className="staff-hero__subtitle">
                Role-based compliance, KYC verification, account holds, and transaction reversals
              </p>
            </div>
          </div>

          <div className="staff-hero__user-badge">
            <span className="staff-user-email">
              <i className="bi bi-person-circle"></i>
              {user?.email}
            </span>
            <span className={`staff-role-badge staff-role-badge--${user?.role?.toLowerCase()}`}>
              <i className="bi bi-shield-fill-check"></i>
              {user?.role}
            </span>
          </div>
        </header>

        {/* Tabs */}
        <nav className="staff-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'kyc'}
            className={`staff-tab ${activeTab === 'kyc' ? 'staff-tab--active' : ''}`}
            onClick={() => setActiveTab('kyc')}
          >
            <i className="bi bi-person-check-fill"></i>
            <span>KYC Queue</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'accounts'}
            className={`staff-tab ${activeTab === 'accounts' ? 'staff-tab--active' : ''}`}
            onClick={() => setActiveTab('accounts')}
          >
            <i className="bi bi-sliders"></i>
            <span>Account Holds</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'reversals'}
            className={`staff-tab ${activeTab === 'reversals' ? 'staff-tab--active' : ''}`}
            onClick={() => setActiveTab('reversals')}
          >
            <i className="bi bi-arrow-counterclockwise"></i>
            <span>Reversal Desk</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'limits'}
              className={`staff-tab ${activeTab === 'limits' ? 'staff-tab--active' : ''}`}
              onClick={() => setActiveTab('limits')}
            >
              <i className="bi bi-speedometer2" />
              <span>Limits</span>
            </button>
          )}
          {isEmployee && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'settlement'}
              className={`staff-tab ${activeTab === 'settlement' ? 'staff-tab--active' : ''}`}
              onClick={() => setActiveTab('settlement')}
            >
              <i className="bi bi-bank" />
              <span>Settlement</span>
            </button>
          )}
          {isEmployee && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'reconciliation'}
              className={`staff-tab ${activeTab === 'reconciliation' ? 'staff-tab--active' : ''}`}
              onClick={() => setActiveTab('reconciliation')}
            >
              <i className="bi bi-clipboard-check" />
              <span>Reconciliation</span>
            </button>
          )}
          {isEmployee && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'rag'}
              className={`staff-tab ${activeTab === 'rag' ? 'staff-tab--active' : ''}`}
              onClick={() => setActiveTab('rag')}
            >
              <i className="bi bi-robot" />
              <span>RAG Metrics</span>
            </button>
          )}
        </nav>

        {/* Tab 7: RAG Metrics Dashboard */}
        {activeTab === 'rag' && (
          <section className="staff-section">
            <RagMetricsDashboard />
          </section>
        )}

        {/* Tab 1: KYC */}
        {activeTab === 'kyc' && (
          <section className="staff-section">
            <div className="section-toolbar">
              <div className="section-title-group">
                <h3 className="section-title">Customer KYC Review Queue</h3>
                <span className="section-count">{users.length} records</span>
              </div>
              <div className="filter-group">
                <label htmlFor="kycFilterSelect">Filter</label>
                <select
                  id="kycFilterSelect"
                  value={kycFilter}
                  onChange={(e) => setKycFilter(e.target.value)}
                  className="staff-select"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Review</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="REJECTED">Rejected</option>
                </select>
                <button type="button" className="btn btn--ghost btn--sm" onClick={fetchUsers}>
                  <i className="bi bi-arrow-clockwise"></i> Refresh
                </button>
              </div>
            </div>

            {loadingKyc ? (
              <div className="staff-loading">
                <span className="spinner spinner--dark" />
                Loading KYC queue…
              </div>
            ) : users.length === 0 ? (
              <div className="staff-empty">
                <i className="bi bi-inbox"></i>
                <p>No users found matching filter "{kycFilter}"</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="staff-table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Customer</th>
                      <th>Contact</th>
                      <th>KYC Status</th>
                      <th className="align-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isUpdating = updatingKycId === u.id;
                      const kyc = (u.kycStatus || 'PENDING').toLowerCase();
                      return (
                        <tr key={u.id}>
                          <td>
                            <code className="id-chip">{u.id.substring(0, 8)}…</code>
                          </td>
                          <td>
                            <span className="customer-name">
                              {u.firstName} {u.lastName}
                            </span>
                          </td>
                          <td>
                            <div className="contact-cell">
                              <span>{u.email}</span>
                              <small>{u.phone || 'No phone'}</small>
                            </div>
                          </td>
                          <td>
                            <span className={`kyc-badge kyc-badge--${kyc}`}>
                              <i
                                className={`bi ${
                                  kyc === 'verified'
                                    ? 'bi-patch-check-fill'
                                    : kyc === 'rejected'
                                    ? 'bi-x-octagon-fill'
                                    : 'bi-hourglass-split'
                                }`}
                              ></i>
                              {u.kycStatus || 'PENDING'}
                            </span>
                          </td>
                          <td className="align-end">
                            {isEmployee ? (
                              <div className="action-button-group">
                                {u.kycStatus !== 'VERIFIED' && (
                                  <button
                                    type="button"
                                    className="btn btn--success btn--xs"
                                    disabled={isUpdating}
                                    onClick={() => handleUpdateKyc(u.id, 'VERIFIED')}
                                  >
                                    {isUpdating ? (
                                      <span className="spinner spinner--dark spinner--xs" />
                                    ) : (
                                      <>
                                        <i className="bi bi-check-lg"></i> Approve
                                      </>
                                    )}
                                  </button>
                                )}
                                {u.kycStatus !== 'REJECTED' && (
                                  <button
                                    type="button"
                                    className="btn btn--danger btn--xs"
                                    disabled={isUpdating}
                                    onClick={() => handleUpdateKyc(u.id, 'REJECTED')}
                                  >
                                    {isUpdating ? (
                                      <span className="spinner spinner--dark spinner--xs" />
                                    ) : (
                                      <>
                                        <i className="bi bi-x-lg"></i> Reject
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
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
            )}
          </section>
        )}

        {/* Tab 2: Accounts */}
        {activeTab === 'accounts' && (
          <section className="staff-section">
            <div className="section-title-group">
              <h3 className="section-title">Account Status & Administrative Holds</h3>
              <span className="section-count">
                <i className="bi bi-search"></i> Search by account number
              </span>
            </div>

            <form onSubmit={handleSearchAccount} className="staff-search-form">
              <div className="input-affix">
                <span className="input-affix__icon">
                  <i className="bi bi-hash"></i>
                </span>
                <input
                  type="text"
                  placeholder="Enter 12-digit account number (e.g. 100082109384)"
                  value={searchAccountNum}
                  onChange={(e) => setSearchAccountNum(e.target.value)}
                  className="input-affix__mono"
                />
              </div>
              <button type="submit" className="btn btn--primary">
                <i className="bi bi-search"></i> Search
              </button>
            </form>

            {searchAccError && (
              <div className="staff-alert staff-alert--danger">
                <i className="bi bi-exclamation-triangle-fill"></i>
                <span>{searchAccError}</span>
              </div>
            )}

            {targetAccount && (
              <div className="account-panel">
                <div className="account-panel__header">
                  <div>
                    <span className="account-panel__type">
                      <i className="bi bi-wallet2"></i>
                      {targetAccount.accountType}
                    </span>
                    <h4 className="account-panel__num">
                      {targetAccount.accountNumber}
                    </h4>
                  </div>
                  <span
                    className={`status-pill-badge status-pill-badge--${targetAccount.status.toLowerCase()}`}
                  >
                    <span className="status-pill-badge__dot" />
                    {targetAccount.status}
                  </span>
                </div>

                <div className="account-panel__grid">
                  <div className="meta-item">
                    <span className="meta-label">Current Balance</span>
                    <span className="meta-val">{formatCurrency(targetAccount.balance)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Available Balance</span>
                    <span className="meta-val meta-val--accent">
                      {formatCurrency(targetAccount.availableBalance)}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">User ID</span>
                    <span className="meta-val meta-val--mono">{targetAccount.userId}</span>
                  </div>
                </div>

                <div className="status-control-box">
                  <div className="status-control-box__head">
                    <i className="bi bi-shield-exclamation"></i>
                    <span>Administrative Action</span>
                  </div>

                  <label htmlFor="statusReasonInput" className="field-label">
                    Audit reason <span className="field-optional">Optional but recommended</span>
                  </label>
                  <div className="input-affix">
                    <span className="input-affix__icon">
                      <i className="bi bi-journal-text"></i>
                    </span>
                    <input
                      id="statusReasonInput"
                      type="text"
                      placeholder="e.g. Suspected fraudulent activity / Compliance hold"
                      value={statusReason}
                      onChange={(e) => setStatusReason(e.target.value)}
                      maxLength={120}
                    />
                  </div>

                  <div className="status-actions">
                    <button
                      type="button"
                      className="btn btn--success"
                      disabled={targetAccount.status === 'ACTIVE' || updatingStatus}
                      onClick={() => handleUpdateAccountStatus('ACTIVE')}
                    >
                      <i className="bi bi-check-circle-fill"></i> Set Active
                    </button>
                    <button
                      type="button"
                      className="btn btn--warn"
                      disabled={targetAccount.status === 'FROZEN' || updatingStatus}
                      onClick={() => handleUpdateAccountStatus('FROZEN')}
                    >
                      <i className="bi bi-snow"></i> Freeze
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={targetAccount.status === 'BLOCKED' || updatingStatus}
                      onClick={() => handleUpdateAccountStatus('BLOCKED')}
                    >
                      <i className="bi bi-slash-circle-fill"></i> Block
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Tab 3: Reversals */}
        {activeTab === 'reversals' && (
          <section className="staff-section">
            <div className="section-title-group">
              <h3 className="section-title">Staff Reversal & Chargeback Desk</h3>
              <span className="section-count">
                <i className="bi bi-search"></i> Search by transaction number
              </span>
            </div>

            <form onSubmit={handleSearchTxn} className="staff-search-form">
              <div className="input-affix">
                <span className="input-affix__icon">
                  <i className="bi bi-receipt"></i>
                </span>
                <input
                  type="text"
                  placeholder="Enter transaction number (e.g. TXN17893828…)"
                  value={searchTxnCode}
                  onChange={(e) => setSearchTxnCode(e.target.value)}
                  className="input-affix__mono"
                />
              </div>
              <button type="submit" className="btn btn--primary">
                <i className="bi bi-search"></i> Find
              </button>
            </form>

            {searchTxnError && (
              <div className="staff-alert staff-alert--danger">
                <i className="bi bi-exclamation-triangle-fill"></i>
                <span>{searchTxnError}</span>
              </div>
            )}

            {targetTxn && (
              <div className="txn-panel">
                <div className="txn-panel__header">
                  <div>
                    <span className="meta-label">Transaction Code</span>
                    <h4 className="txn-panel__num">{targetTxn.transactionNumber}</h4>
                  </div>
                  <span className={`txn-badge txn-badge--${targetTxn.status.toLowerCase()}`}>
                    <span className="txn-badge__dot" />
                    {targetTxn.status}
                  </span>
                </div>

                <div className="txn-panel__grid">
                  <div className="meta-item">
                    <span className="meta-label">Source Account</span>
                    <span className="meta-val meta-val--mono">
                      {targetTxn.sourceAccountNumber}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Destination Account</span>
                    <span className="meta-val meta-val--mono">
                      {targetTxn.destinationAccountNumber}
                    </span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Amount</span>
                    <span className="meta-val">{formatCurrency(targetTxn.amount)}</span>
                  </div>
                </div>

                <div className="txn-panel__description">
                  <span className="meta-label">Description</span>
                  <p>{targetTxn.description}</p>
                </div>

                {targetTxn.status === 'COMPLETED' ? (
                  <button
                    type="button"
                    className="btn btn--danger btn--block-md"
                    disabled={reversing}
                    onClick={handleExecuteReversal}
                  >
                    {reversing ? (
                      <>
                        <span className="spinner" />
                        Reversing…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-arrow-counterclockwise"></i>
                        Execute Transaction Reversal
                      </>
                    )}
                  </button>
                ) : (
                  <div className="staff-alert staff-alert--info">
                    <i className="bi bi-info-circle-fill"></i>
                    <span>
                      Transaction is <strong>{targetTxn.status}</strong> and cannot be reversed.
                    </span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Tab 4: Limits */}
        {activeTab === 'limits' && isAdmin && (
          <section className="staff-section">
            <div className="section-title-group">
              <h3 className="section-title">Global Transaction Limits Control</h3>
              <span className="section-count">
                <i className="bi bi-shield-lock-fill"></i> Admin only
              </span>
            </div>

            <form onSubmit={handleUpdateLimits} className="limits-form">
              <div className="field">
                <label htmlFor="limitAccIdInput">Account ID (UUID)</label>
                <div className="input-affix">
                  <span className="input-affix__icon">
                    <i className="bi bi-fingerprint"></i>
                  </span>
                  <input
                    id="limitAccIdInput"
                    type="text"
                    placeholder="e.g. d67c6b91-5d8d-4b01-8232-2d30f7afbb82"
                    value={limitAccId}
                    onChange={(e) => setLimitAccId(e.target.value)}
                    className="input-affix__mono"
                    required
                  />
                </div>
              </div>

              <div className="grid-2col">
                <div className="field">
                  <label htmlFor="dailyLimitInput">Daily Transfer Limit</label>
                  <div className="input-affix">
                    <span className="input-affix__prefix">₹</span>
                    <input
                      id="dailyLimitInput"
                      type="number"
                      value={newDailyLimitINR}
                      onChange={(e) => setNewDailyLimitINR(e.target.value)}
                      required
                    />
                    <span className="input-affix__suffix">INR</span>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="singleLimitInput">Single Transaction Limit</label>
                  <div className="input-affix">
                    <span className="input-affix__prefix">₹</span>
                    <input
                      id="singleLimitInput"
                      type="number"
                      value={newSingleLimitINR}
                      onChange={(e) => setNewSingleLimitINR(e.target.value)}
                      required
                    />
                    <span className="input-affix__suffix">INR</span>
                  </div>
                </div>
              </div>

              {limitMsg && (
                <div className="staff-alert staff-alert--success">
                  <i className="bi bi-check-circle-fill"></i>
                  <span>{limitMsg}</span>
                </div>
              )}
              {limitErr && (
                <div className="staff-alert staff-alert--danger">
                  <i className="bi bi-exclamation-triangle-fill"></i>
                  <span>{limitErr}</span>
                </div>
              )}

              <div className="limits-form__actions">
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={updatingLimits}
                >
                  {updatingLimits ? (
                    <>
                      <span className="spinner" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-save"></i>
                      Save New Limits
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        {/* Tab: Settlement */}
        {activeTab === 'settlement' && (
          <section className="staff-section">
            <div className="section-toolbar">
              <div className="section-title-group">
                <h3 className="section-title">Inter-Bank Settlement</h3>
                <span className="section-count">{positions.length} bank pairs</span>
              </div>
              <div className="filter-group">
                <button type="button" className="btn btn--ghost btn--sm" onClick={fetchSettlement} disabled={loadingSettlement}>
                  <i className="bi bi-arrow-clockwise" /> Refresh
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={runSettlementBatch}
                  disabled={runningBatch}
                  id="run-settlement-batch-btn"
                >
                  {runningBatch ? <><span className="spinner" /> Running…</> : <><i className="bi bi-play-circle" /> Run Settlement Batch</>}
                </button>
              </div>
            </div>
            {settlementMsg && (
              <div className="staff-alert staff-alert--success">
                <i className="bi bi-check-circle-fill" /> {settlementMsg}
              </div>
            )}
            <div className="settlement-grid">
              <div>
                <h4 className="subsection-title">Net Positions</h4>
                {loadingSettlement ? (
                  <div className="staff-loading"><span className="spinner spinner--dark" /> Loading positions…</div>
                ) : positions.length === 0 ? (
                  <div className="staff-empty">
                    <i className="bi bi-bar-chart" />
                    <p>No settlement positions yet</p>
                    <small>Complete inter-bank transfers to generate net positions</small>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="staff-table">
                      <thead>
                        <tr>
                          <th>From Bank</th>
                          <th>To Bank</th>
                          <th>Net Amount</th>
                          <th>Direction</th>
                          <th>Last Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((p) => (
                          <tr key={p.id}>
                            <td><span className="bank-code-chip">{p.fromBank}</span></td>
                            <td><span className="bank-code-chip">{p.toBank}</span></td>
                            <td className={p.netAmountRupees > 0 ? 'text-danger fw-bold' : 'text-success fw-bold'}>
                              ₹{Math.abs(p.netAmountRupees).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span className={`status-badge status-badge--${p.netAmountRupees >= 0 ? 'warning' : 'success'}`}>
                                {p.netAmountRupees >= 0 ? 'OWES' : 'OWED'}
                              </span>
                            </td>
                            <td className="text-muted" style={{ fontSize: '0.78rem' }}>
                              {new Date(p.lastUpdatedAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h4 className="subsection-title">Recent Settlement Batches</h4>
                {batches.length === 0 ? (
                  <div className="staff-empty">
                    <i className="bi bi-collection" />
                    <p>No settlement batches run yet</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="staff-table">
                      <thead>
                        <tr>
                          <th>Batch ID</th>
                          <th>Status</th>
                          <th>Entries</th>
                          <th>Total</th>
                          <th>Settled At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.map((b) => (
                          <tr key={b.id}>
                            <td style={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>{b.id.substring(0, 12)}…</td>
                            <td><span className={`status-badge status-badge--${b.status === 'SETTLED' ? 'success' : b.status === 'FAILED' ? 'danger' : 'warning'}`}>{b.status}</span></td>
                            <td>{b.totalEntries}</td>
                            <td>₹{(b.totalAmountRupees ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td style={{ fontSize: '0.78rem' }}>{b.settledAt ? new Date(b.settledAt).toLocaleString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Tab: Reconciliation */}
        {activeTab === 'reconciliation' && (
          <section className="staff-section">
            <div className="section-toolbar">
              <div className="section-title-group">
                <h3 className="section-title">Payment Reconciliation</h3>
                <span className="section-count">{mismatches.length} open mismatches</span>
              </div>
              <div className="filter-group">
                <button type="button" className="btn btn--ghost btn--sm" onClick={fetchReconciliation} disabled={loadingRecon}>
                  <i className="bi bi-arrow-clockwise" /> Refresh
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={runReconciliation}
                  disabled={runningRecon}
                  id="run-reconciliation-btn"
                >
                  {runningRecon ? <><span className="spinner" /> Running…</> : <><i className="bi bi-play-circle" /> Run Reconciliation</>}
                </button>
              </div>
            </div>
            {reconMsg && (
              <div className="staff-alert staff-alert--info">
                <i className="bi bi-info-circle-fill" /> {reconMsg}
              </div>
            )}

            <div className="settlement-grid">
              <div>
                <h4 className="subsection-title">Recent Runs</h4>
                {loadingRecon ? (
                  <div className="staff-loading"><span className="spinner spinner--dark" /> Loading runs…</div>
                ) : reconRuns.length === 0 ? (
                  <div className="staff-empty">
                    <i className="bi bi-clipboard" />
                    <p>No reconciliation runs yet</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="staff-table">
                      <thead>
                        <tr><th>Run ID</th><th>Status</th><th>Checked</th><th>Mismatches</th><th>Started</th></tr>
                      </thead>
                      <tbody>
                        {reconRuns.map((r) => (
                          <tr key={r.id}>
                            <td style={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>{r.id.substring(0, 12)}…</td>
                            <td><span className={`status-badge status-badge--${r.status === 'COMPLETED' ? 'success' : r.status === 'FAILED' ? 'danger' : 'warning'}`}>{r.status}</span></td>
                            <td>{r.payments_checked}</td>
                            <td>{r.mismatches_found > 0 ? <span className="text-danger fw-bold">{r.mismatches_found}</span> : r.mismatches_found}</td>
                            <td style={{ fontSize: '0.78rem' }}>{new Date(r.started_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <h4 className="subsection-title">Open Mismatches</h4>
                {mismatches.length === 0 ? (
                  <div className="staff-empty">
                    <i className="bi bi-patch-check-fill" style={{ color: '#10b981' }} />
                    <p>No open mismatches</p>
                    <small>All payments are reconciled ✓</small>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="staff-table">
                      <thead>
                        <tr><th>Payment ID</th><th>Type</th><th>Payment Status</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {mismatches.map((m) => (
                          <tr key={m.id}>
                            <td style={{ fontSize: '0.72rem', fontFamily: 'monospace' }}>{String(m.payment_id).substring(0, 12)}…</td>
                            <td><span className="status-badge status-badge--warning">{m.mismatch_type}</span></td>
                            <td>{m.payment_status}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn--ghost btn--sm"
                                onClick={() => resolveMismatch(m.id, 'RESOLVED')}
                              >
                                <i className="bi bi-check-lg" /> Resolve
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};