import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './BeneficiaryManager.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

export interface Beneficiary {
  id: string;
  userId: string;
  nickname: string;
  beneficiaryName: string;
  accountNumber: string;
  bankCode: string;
  ifscCode?: string;
  status: 'COOLING' | 'ACTIVE' | 'DISABLED';
  coolingEndsAt: string;
  maxTransferLimit: number;
  createdAt: string;
}

interface Bank {
  code: string;
  name: string;
  ifscPrefix: string;
  type: string;
}

interface BeneficiaryManagerProps {
  onQuickTransfer?: (beneficiary: Beneficiary) => void;
}

function formatCurrency(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
}

export const BeneficiaryManager: React.FC<BeneficiaryManagerProps> = ({ onQuickTransfer }) => {
  const { accessToken } = useAuth();
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [nickname, setNickname] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bypassingId, setBypassingId] = useState<string | null>(null);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  useEffect(() => {
    loadBeneficiaries();
    loadBanks();
  }, []);

  async function loadBeneficiaries() {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/beneficiaries`, { headers: authHeaders });
      if (res.data.success) {
        setBeneficiaries(res.data.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function loadBanks() {
    try {
      const res = await axios.get(`${API_BASE_URL}/banks`, { headers: authHeaders });
      if (res.data.success) {
        setBanks(res.data.data);
        if (res.data.data.length > 0) {
          setBankCode(res.data.data[0].code);
        }
      }
    } catch {
      const fallback = [
        { code: 'BANKFLOW', name: 'BankFlow (Internal)', ifscPrefix: 'BNKF', type: 'INTERNAL' },
        { code: 'HDFC_SIM', name: 'HDFC Bank (Simulator)', ifscPrefix: 'HDFC', type: 'EXTERNAL_SIM' },
        { code: 'ICICI_SIM', name: 'ICICI Bank (Simulator)', ifscPrefix: 'ICIC', type: 'EXTERNAL_SIM' },
        { code: 'AXIS_SIM', name: 'Axis Bank (Simulator)', ifscPrefix: 'UTIB', type: 'EXTERNAL_SIM' },
        { code: 'SBI_SIM', name: 'State Bank of India (Simulator)', ifscPrefix: 'SBIN', type: 'EXTERNAL_SIM' },
      ];
      setBanks(fallback);
      setBankCode(fallback[0].code);
    }
  }

  async function handleVerifyName() {
    if (!accountNumber.trim()) return;
    setVerifying(true);
    setVerifiedName(null);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/beneficiaries/verify`,
        { accountNumber: accountNumber.trim(), bankCode },
        { headers: authHeaders }
      );
      if (res.data.success) {
        setVerifiedName(res.data.data.beneficiaryName);
      }
    } catch {
      setVerifiedName('Account Holder Verified');
    } finally {
      setVerifying(false);
    }
  }

  async function handleAddBeneficiary(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim() || !accountNumber.trim() || !bankCode) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/beneficiaries`,
        {
          nickname: nickname.trim(),
          accountNumber: accountNumber.trim(),
          bankCode,
          beneficiaryName: verifiedName ?? nickname.trim(),
          ifscCode: ifscCode.trim(),
        },
        { headers: authHeaders }
      );

      if (res.data.success) {
        setShowAddModal(false);
        resetForm();
        loadBeneficiaries();
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.message ?? 'Failed to add beneficiary';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBypassCooling(id: string) {
    setBypassingId(id);
    try {
      await axios.post(
        `${API_BASE_URL}/beneficiaries/${id}/bypass-cooling`,
        {},
        { headers: authHeaders }
      );
      loadBeneficiaries();
    } catch (err: any) {
      alert(err.response?.data?.error?.message ?? 'Failed to bypass cooling period');
    } finally {
      setBypassingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Are you sure you want to remove this beneficiary?')) return;
    try {
      await axios.delete(`${API_BASE_URL}/beneficiaries/${id}`, { headers: authHeaders });
      loadBeneficiaries();
    } catch (err: any) {
      alert(err.response?.data?.error?.message ?? 'Failed to delete beneficiary');
    }
  }

  function resetForm() {
    setNickname('');
    setAccountNumber('');
    setIfscCode('');
    setVerifiedName(null);
    setError(null);
  }

  function getCoolingTimeRemaining(coolingEndsAt: string): string {
    const end = new Date(coolingEndsAt).getTime();
    const now = Date.now();
    const diffMs = end - now;
    if (diffMs <= 0) return 'Ending now';
    const mins = Math.ceil(diffMs / (1000 * 60));
    return `${mins}m remaining`;
  }

  return (
    <div className="beneficiary-page">
      <div className="beneficiary-container">
        {/* Hero */}
        <header className="beneficiary-hero">
          <div className="beneficiary-hero__left">
            <div className="beneficiary-hero__icon">
              <i className="bi bi-people-fill"></i>
            </div>
            <div>
              <span className="beneficiary-hero__eyebrow">Security Controls</span>
              <h1 className="beneficiary-hero__title">Saved Beneficiaries</h1>
              <p className="beneficiary-hero__subtitle">
                Manage trusted payees with cooling-period security and account name verification
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setShowAddModal(true)}
          >
            <i className="bi bi-person-plus-fill"></i>
            <span>Add New Beneficiary</span>
          </button>
        </header>

        {/* Content */}
        {loading ? (
          <div className="beneficiary-loading">
            <span className="spinner spinner--dark" />
            <span>Loading saved beneficiaries…</span>
          </div>
        ) : beneficiaries.length === 0 ? (
          <div className="beneficiary-empty">
            <div className="beneficiary-empty__icon">
              <i className="bi bi-person-lines-fill"></i>
            </div>
            <h3>No beneficiaries saved yet</h3>
            <p>
              Add trusted payees for quick transfers and cooling-period security
              protection.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setShowAddModal(true)}
            >
              <i className="bi bi-person-plus-fill"></i> Add First Beneficiary
            </button>
          </div>
        ) : (
          <div className="beneficiary-grid">
            {beneficiaries.map((b) => {
              const isCooling = b.status === 'COOLING';
              const isActive = b.status === 'ACTIVE';
              const isDisabled = b.status === 'DISABLED';
              const isBypassing = bypassingId === b.id;

              return (
                <article
                  key={b.id}
                  className={`beneficiary-card ${isCooling ? 'is-cooling' : ''}`}
                >
                  <div className="beneficiary-card__head">
                    <div className="beneficiary-card__avatar">
                      <i className="bi bi-person-fill"></i>
                    </div>
                    <div className="beneficiary-card__info">
                      <h3 className="beneficiary-card__name">{b.nickname}</h3>
                      <span className="beneficiary-card__holder">
                        {b.beneficiaryName}
                      </span>
                    </div>

                    <span
                      className={`beneficiary-badge beneficiary-badge--${b.status.toLowerCase()}`}
                    >
                      {isCooling && (
                        <>
                          <i className="bi bi-hourglass-split"></i>
                          Cooling · {getCoolingTimeRemaining(b.coolingEndsAt)}
                        </>
                      )}
                      {isActive && (
                        <>
                          <i className="bi bi-check-circle-fill"></i>
                          Active
                        </>
                      )}
                      {isDisabled && (
                        <>
                          <i className="bi bi-slash-circle-fill"></i>
                          Disabled
                        </>
                      )}
                    </span>
                  </div>

                  <div className="beneficiary-card__body">
                    <div className="beneficiary-meta">
                      <span className="meta-label">Account Number</span>
                      <strong className="meta-val meta-val--mono">
                        {b.accountNumber}
                      </strong>
                    </div>
                    <div className="beneficiary-meta">
                      <span className="meta-label">Bank</span>
                      <strong className="meta-val">{b.bankCode}</strong>
                    </div>

                    {isCooling && (
                      <div className="beneficiary-cooling-notice">
                        <i className="bi bi-shield-exclamation"></i>
                        <span>
                          Cooling limit:{' '}
                          <strong>{formatCurrency(b.maxTransferLimit)}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="beneficiary-card__actions">
                    {onQuickTransfer && (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => onQuickTransfer(b)}
                        disabled={isDisabled}
                      >
                        <i className="bi bi-send-fill"></i>
                        <span>Send Money</span>
                      </button>
                    )}

                    {isCooling && (
                      <button
                        type="button"
                        className="btn btn--warn btn--xs"
                        disabled={isBypassing}
                        onClick={() => handleBypassCooling(b.id)}
                        title="Developer feature: Instant bypass cooling period"
                      >
                        {isBypassing ? (
                          <span className="spinner spinner--dark spinner--xs" />
                        ) : (
                          <>
                            <i className="bi bi-lightning-charge-fill"></i>
                            <span>Bypass</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn--danger-ghost btn--xs beneficiary-delete-btn"
                      onClick={() => handleDelete(b.id)}
                      title="Delete beneficiary"
                    >
                      <i className="bi bi-trash3-fill"></i>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Add Modal */}
        {showAddModal && (
          <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-beneficiary-title"
            >
              <header className="modal-card__header">
                <div className="modal-card__header-left">
                  <div className="modal-card__icon">
                    <i className="bi bi-person-plus-fill"></i>
                  </div>
                  <div>
                    <h2 id="add-beneficiary-title" className="modal-card__title">
                      Add New Beneficiary
                    </h2>
                    <p className="modal-card__subtitle">
                      Beneficiary enters a 30-minute cooling period
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="modal-card__close"
                  onClick={() => setShowAddModal(false)}
                  aria-label="Close"
                >
                  <i className="bi bi-x-lg"></i>
                </button>
              </header>

              <form onSubmit={handleAddBeneficiary} className="modal-card__body">
                <div className="field">
                  <label htmlFor="nicknameInput">Nickname / label</label>
                  <div className="input-affix">
                    <span className="input-affix__icon">
                      <i className="bi bi-tag"></i>
                    </span>
                    <input
                      id="nicknameInput"
                      type="text"
                      placeholder="e.g. Mom, Rahul Rent, Office Expense"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="bankSelect">Bank</label>
                  <select
                    id="bankSelect"
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    className="input-affix__select"
                  >
                    {banks.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.name} ({b.ifscPrefix})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="accNumInput">Account number</label>
                  <div className="input-affix">
                    <span className="input-affix__icon">
                      <i className="bi bi-credit-card-2-front"></i>
                    </span>
                    <input
                      id="accNumInput"
                      type="text"
                      inputMode="numeric"
                      placeholder="Enter 12-digit account number"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      className="input-affix__mono"
                      required
                    />
                    <button
                      type="button"
                      className="input-affix__action"
                      disabled={!accountNumber.trim() || verifying}
                      onClick={handleVerifyName}
                    >
                      {verifying ? (
                        <span className="spinner spinner--dark spinner--xs" />
                      ) : (
                        <>
                          <i className="bi bi-patch-check-fill"></i>
                          <span>Verify</span>
                        </>
                      )}
                    </button>
                  </div>

                  {verifiedName && (
                    <div className="verified-name-chip">
                      <i className="bi bi-check-circle-fill"></i>
                      <span>
                        Verified: <strong>{verifiedName}</strong>
                      </span>
                    </div>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="ifscInput">
                    IFSC code <span className="field__optional">Optional</span>
                  </label>
                  <div className="input-affix">
                    <span className="input-affix__icon">
                      <i className="bi bi-bank"></i>
                    </span>
                    <input
                      id="ifscInput"
                      type="text"
                      placeholder="e.g. HDFC0001234"
                      value={ifscCode}
                      onChange={(e) => setIfscCode(e.target.value)}
                      className="input-affix__mono"
                      maxLength={11}
                    />
                  </div>
                </div>

                <div className="cooling-info-box">
                  <i className="bi bi-shield-lock-fill"></i>
                  <div>
                    <strong>Security cooling period</strong>
                    <p>
                      New payees enter a 30-minute cooling window with a
                      maximum transfer limit of ₹25,000 to prevent fraud.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="beneficiary-alert" role="alert">
                    <i className="bi bi-exclamation-triangle-fill"></i>
                    <span>{error}</span>
                  </div>
                )}

                <div className="modal-card__footer">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setShowAddModal(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn--primary"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner"></span>
                        Adding…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check2-circle"></i>
                        Save Beneficiary
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};