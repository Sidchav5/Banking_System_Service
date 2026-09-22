import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../context/AuthContext';
import './InterBankTransfer.css';

const API_BASE_URL = 'http://localhost:3000/api/v1';

interface Bank {
  code: string;
  name: string;
  ifscPrefix: string;
  type: string;
}

interface Account {
  id: string;
  accountNumber: string;
  accountType: string;
  balance: number;
  availableBalance: number;
  currency: string;
  status: string;
}

interface PaymentEvent {
  fromStatus: string | null;
  toStatus: string;
  eventType: string;
  detail: string | null;
  occurredAt: string;
}

interface Payment {
  id: string;
  paymentNumber: string;
  sourceAccountNumber: string;
  destinationAccountNumber: string;
  destinationBankCode: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  paymentNetworkReference?: string;
  creditId?: string;
  failureReason?: string;
  reversalJournalId?: string;
  createdAt: string;
  events?: PaymentEvent[];
}

type FailureMode = 'none' | 'CREDIT_FAILED' | 'TIMEOUT' | 'BANK_UNAVAILABLE';

const PAYMENT_STATES = [
  { key: 'INITIATED', label: 'Initiated', icon: 'bi-send', color: '#6366f1' },
  { key: 'DEBITED', label: 'Debited', icon: 'bi-arrow-up-circle', color: '#f59e0b' },
  { key: 'SENT_TO_NETWORK', label: 'Sent to Network', icon: 'bi-wifi', color: '#3b82f6' },
  { key: 'CREDITED', label: 'Credited', icon: 'bi-bank', color: '#10b981' },
  { key: 'COMPLETED', label: 'Completed', icon: 'bi-check-circle-fill', color: '#10b981' },
];

const FAILURE_STATES: Record<string, { label: string; color: string; icon: string }> = {
  CREDIT_FAILED: { label: 'Credit Failed', color: '#ef4444', icon: 'bi-x-circle' },
  TIMEOUT: { label: 'Timed Out', color: '#f59e0b', icon: 'bi-clock-history' },
  BANK_UNAVAILABLE: { label: 'Bank Unavailable', color: '#ef4444', icon: 'bi-building-x' },
  REVERSAL_PENDING: { label: 'Reversal Pending', color: '#f97316', icon: 'bi-arrow-counterclockwise' },
  REVERSED: { label: 'Reversed', color: '#8b5cf6', icon: 'bi-arrow-counterclockwise' },
};

const FAILURE_MODE_OPTIONS: { value: FailureMode; label: string; desc: string }[] = [
  { value: 'none', label: 'Normal (Success)', desc: 'Payment completes successfully' },
  { value: 'CREDIT_FAILED', label: 'Credit Failed', desc: 'External bank rejects credit → Saga reverses debit' },
  { value: 'TIMEOUT', label: 'Network Timeout', desc: 'Payment network times out → Saga reverses debit' },
  { value: 'BANK_UNAVAILABLE', label: 'Bank Unavailable', desc: 'Destination bank is down → 503 → Saga reverses debit' },
];

function formatCurrency(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });
}

function getStateIndex(status: string): number {
  return PAYMENT_STATES.findIndex((s) => s.key === status);
}

function isFailureStatus(status: string): boolean {
  return ['CREDIT_FAILED', 'TIMEOUT', 'BANK_UNAVAILABLE', 'REVERSAL_PENDING', 'REVERSED', 'FAILED'].includes(status);
}

export const InterBankTransfer: React.FC = () => {
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const [sourceAccountNumber, setSourceAccountNumber] = useState('');
  const [destinationBank, setDestinationBank] = useState('');
  const [destinationAccount, setDestinationAccount] = useState('');
  const [rupees, setRupees] = useState('');
  const [description, setDescription] = useState('');
  const [failureMode, setFailureMode] = useState<FailureMode>('none');

  const [submitting, setSubmitting] = useState(false);
  const [activePayment, setActivePayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<'transfer' | 'history'>('transfer');

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const [savedBeneficiaries, setSavedBeneficiaries] = useState<any[]>([]);

  useEffect(() => {
    loadAccounts();
    loadBanks();
    loadHistory();
    loadBeneficiaries();
  }, []);

  async function loadBeneficiaries() {
    try {
      const res = await axios.get(`${API_BASE_URL}/beneficiaries`, { headers: authHeaders });
      if (res.data.success) {
        setSavedBeneficiaries(res.data.data);
      }
    } catch {
      // ignore
    }
  }

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/accounts`, { headers: authHeaders });
      if (res.data.success) {
        const active = res.data.data.filter((a: Account) => a.status === 'ACTIVE');
        setAccounts(active);
        if (active.length > 0) setSourceAccountNumber(active[0].accountNumber);
      }
    } catch {
      // ignore
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function loadBanks() {
    try {
      const res = await axios.get(`${API_BASE_URL}/banks`, { headers: authHeaders });
      if (res.data.success) {
        const external = res.data.data.filter((b: Bank) => b.type === 'EXTERNAL_SIM');
        setBanks(external);
        if (external.length > 0) setDestinationBank(external[0].code);
      }
    } catch {
      const fallback = [
        { code: 'HDFC_SIM', name: 'HDFC Bank (Simulator)', ifscPrefix: 'HDFC', type: 'EXTERNAL_SIM' },
        { code: 'ICICI_SIM', name: 'ICICI Bank (Simulator)', ifscPrefix: 'ICIC', type: 'EXTERNAL_SIM' },
        { code: 'AXIS_SIM', name: 'Axis Bank (Simulator)', ifscPrefix: 'UTIB', type: 'EXTERNAL_SIM' },
        { code: 'SBI_SIM', name: 'State Bank of India (Simulator)', ifscPrefix: 'SBIN', type: 'EXTERNAL_SIM' },
      ];
      setBanks(fallback);
      setDestinationBank(fallback[0].code);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/payments`, { headers: authHeaders });
      if (res.data.success) setPayments(res.data.data);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  function startPolling(paymentId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/payments/${paymentId}`, { headers: authHeaders });
        if (res.data.success) {
          const p: Payment = res.data.data;
          setActivePayment(p);
          if (['COMPLETED', 'REVERSED', 'FAILED'].includes(p.status)) {
            clearInterval(interval);
            setPollingInterval(null);
            loadHistory();
          }
        }
      } catch {
        // ignore polling errors
      }
    }, 1500);
    setPollingInterval(interval);
  }

  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  const sourceAccount = accounts.find((a) => a.accountNumber === sourceAccountNumber);
  const amountPaise = Math.round(parseFloat(rupees || '0') * 100);
  const isValidForm =
    sourceAccountNumber &&
    destinationBank &&
    destinationAccount.trim().length >= 6 &&
    amountPaise > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidForm) return;

    setSubmitting(true);
    setError(null);
    setActivePayment(null);

    const idempotencyKey = uuidv4();

    try {
      const headers: Record<string, string> = {
        ...authHeaders,
        'X-Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json',
      };

      if (failureMode !== 'none') {
        headers['X-Simulate-Failure'] = failureMode;
      }

      const res = await axios.post(
        `${API_BASE_URL}/payments`,
        {
          sourceAccountNumber,
          destinationAccountNumber: destinationAccount.trim(),
          destinationBankCode: destinationBank,
          amount: amountPaise,
          currency: 'INR',
          description: description.trim() || `Inter-bank transfer to ${destinationBank}`,
        },
        { headers }
      );

      if (res.data.success) {
        const payment: Payment = res.data.data;
        setActivePayment(payment);

        if (!['COMPLETED', 'REVERSED', 'FAILED'].includes(payment.status)) {
          startPolling(payment.id);
        } else {
          loadHistory();
        }

        setRupees('');
        setDestinationAccount('');
        setDescription('');
        setFailureMode('none');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.message ?? 'Payment failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const currentStateIdx = activePayment ? getStateIndex(activePayment.status) : -1;
  const isFailure = activePayment ? isFailureStatus(activePayment.status) : false;

  return (
    <div className="interbank-page">
      <div className="interbank-container">
        {/* ── Hero Header ── */}
        <header className="interbank-hero">
          <div className="interbank-hero__left">
            <div className="interbank-hero__icon">
              <i className="bi bi-globe2"></i>
            </div>
            <div>
              <span className="interbank-hero__eyebrow">Inter-Bank Payments</span>
              <h1 className="interbank-hero__title">Inter-Bank Transfer</h1>
              <p className="interbank-hero__subtitle">
                Send money to any bank in the BankFlow network via NPCI-inspired Saga payment flow
              </p>
            </div>
          </div>

          <div className="interbank-hero__badges">
            <span className="interbank-badge interbank-badge--saga">
              <i className="bi bi-lightning-charge-fill"></i> Saga Orchestrated
            </span>
            <span className="interbank-badge interbank-badge--secure">
              <i className="bi bi-shield-check"></i> Auto-Reversal on Failure
            </span>
          </div>
        </header>

        {/* ── Tabs ── */}
        <nav className="interbank-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'transfer'}
            className={`interbank-tab ${activeTab === 'transfer' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('transfer')}
          >
            <i className="bi bi-send-fill"></i>
            <span>New Transfer</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`interbank-tab ${activeTab === 'history' ? 'is-active' : ''}`}
            onClick={() => { setActiveTab('history'); loadHistory(); }}
          >
            <i className="bi bi-clock-history"></i>
            <span>Payment History</span>
            {payments.length > 0 && (
              <span className="interbank-tab__count">{payments.length}</span>
            )}
          </button>
        </nav>

        {/* ── Transfer Tab ── */}
        {activeTab === 'transfer' && (
          <div className="interbank-content">
            <div className="interbank-grid">
              {/* Left: Form */}
              <div className="interbank-panel">
                <div className="interbank-panel__title">
                  <i className="bi bi-arrow-right-circle-fill"></i>
                  <span>Transfer Details</span>
                </div>

                <form onSubmit={handleSubmit} className="interbank-form">
                  {/* Source Account */}
                  <div className="field">
                    <label htmlFor="source-account">From account</label>
                    {loadingAccounts ? (
                      <div className="skeleton skeleton--input" />
                    ) : (
                      <select
                        id="source-account"
                        value={sourceAccountNumber}
                        onChange={(e) => setSourceAccountNumber(e.target.value)}
                        className="input-affix__select"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.accountNumber}>
                            {acc.accountNumber} — {acc.accountType} — {formatCurrency(acc.availableBalance)}
                          </option>
                        ))}
                      </select>
                    )}
                    {sourceAccount && (
                      <div className="interbank-balance-chip">
                        <i className="bi bi-wallet2"></i>
                        Available: <strong>{formatCurrency(sourceAccount.availableBalance)}</strong>
                      </div>
                    )}
                  </div>

                  {/* Saved Beneficiaries Quick Select */}
                  {savedBeneficiaries.length > 0 && (
                    <div className="field">
                      <label htmlFor="saved-beneficiary-select">
                        <i className="bi bi-people-fill text-primary"></i> Saved Payee (Quick Select)
                      </label>
                      <select
                        id="saved-beneficiary-select"
                        defaultValue=""
                        onChange={(e) => {
                          const selected = savedBeneficiaries.find((b) => b.id === e.target.value);
                          if (selected) {
                            setDestinationBank(selected.bankCode);
                            setDestinationAccount(selected.accountNumber);
                          }
                        }}
                        className="input-affix__select"
                      >
                        <option value="" disabled>-- Select a saved payee --</option>
                        {savedBeneficiaries.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nickname} ({b.beneficiaryName}) — {b.bankCode} / {b.accountNumber} {b.status === 'COOLING' ? '⏳' : '✅'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Destination Bank */}
                  <div className="field">
                    <label htmlFor="dest-bank">Destination bank</label>
                    <select
                      id="dest-bank"
                      value={destinationBank}
                      onChange={(e) => setDestinationBank(e.target.value)}
                      className="input-affix__select"
                    >
                      {banks.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name} ({b.ifscPrefix})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Destination Account */}
                  <div className="field">
                    <label htmlFor="dest-account">Beneficiary account number</label>
                    <div className="input-affix">
                      <span className="input-affix__icon">
                        <i className="bi bi-person-badge"></i>
                      </span>
                      <input
                        id="dest-account"
                        type="text"
                        placeholder="e.g. EXT100000000001"
                        value={destinationAccount}
                        onChange={(e) => setDestinationAccount(e.target.value)}
                        className="input-affix__mono"
                      />
                    </div>
                    <span className="field__hint">
                      Try: EXT100000000001, EXT200000000001, EXT300000000001
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="field">
                    <label htmlFor="amount">Amount</label>
                    <div className="input-affix">
                      <span className="input-affix__prefix">₹</span>
                      <input
                        id="amount"
                        type="number"
                        placeholder="0.00"
                        min="1"
                        step="0.01"
                        value={rupees}
                        onChange={(e) => setRupees(e.target.value)}
                      />
                      <span className="input-affix__suffix">INR</span>
                    </div>
                    <div className="interbank-presets">
                      {[500, 1000, 2500, 5000, 10000].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className={`interbank-preset-btn ${rupees === preset.toString() ? 'is-active' : ''}`}
                          onClick={() => setRupees(preset.toString())}
                        >
                          ₹{preset.toLocaleString('en-IN')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="field">
                    <label htmlFor="description">
                      Description <span className="field__optional">Optional</span>
                    </label>
                    <div className="input-affix">
                      <span className="input-affix__icon">
                        <i className="bi bi-chat-left-text"></i>
                      </span>
                      <input
                        id="description"
                        type="text"
                        placeholder="e.g. Rent payment, Invoice #123"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={80}
                      />
                    </div>
                  </div>

                  {/* Failure Simulation */}
                  <div className="interbank-failure-box">
                    <div className="interbank-failure-box__head">
                      <i className="bi bi-bug-fill"></i>
                      <span>Failure Simulation</span>
                      <span className="interbank-dev-badge">DEV ONLY</span>
                    </div>
                    <div className="interbank-failure-options">
                      {FAILURE_MODE_OPTIONS.map((opt) => (
                        <label
                          key={opt.value}
                          className={`interbank-failure-option ${failureMode === opt.value ? 'is-selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="failureMode"
                            value={opt.value}
                            checked={failureMode === opt.value}
                            onChange={() => setFailureMode(opt.value)}
                          />
                          <span className="interbank-failure-option__radio" />
                          <span className="interbank-failure-option__body">
                            <span className="interbank-failure-option__label">{opt.label}</span>
                            <span className="interbank-failure-option__desc">{opt.desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="interbank-error" role="alert">
                      <i className="bi bi-exclamation-triangle-fill"></i>
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn--primary btn--block-md"
                    disabled={!isValidForm}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner"></span>
                        Processing Saga…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-send-fill"></i>
                        Initiate Inter-Bank Transfer
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Right: Live Tracker */}
              <div className="interbank-panel">
                <div className="interbank-panel__title">
                  <i className="bi bi-activity"></i>
                  <span>Live Payment Tracker</span>
                </div>

                {!activePayment ? (
                  <div className="interbank-tracker-empty">
                    <div className="interbank-tracker-empty__icon">
                      <i className="bi bi-radar"></i>
                    </div>
                    <p>Initiate a transfer to watch the Saga state machine in action</p>
                    <div className="interbank-tracker-preview">
                      {PAYMENT_STATES.map((s, idx) => (
                        <div key={s.key} className="interbank-step interbank-step--preview">
                          <div
                            className="interbank-step__node"
                            style={{ '--step-color': s.color } as React.CSSProperties}
                          >
                            <i className={`bi ${s.icon}`}></i>
                          </div>
                          <div className="interbank-step__label">{s.label}</div>
                          {idx < PAYMENT_STATES.length - 1 && (
                            <div className="interbank-step__connector"></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="interbank-tracker-active">
                    {/* Payment Info Card */}
                    <div className="interbank-payment-card">
                      <div className="interbank-payment-card__number">
                        {activePayment.paymentNumber}
                      </div>
                      <div className="interbank-payment-card__amount">
                        {formatCurrency(activePayment.amount)}
                      </div>
                      <div className="interbank-payment-card__route">
                        <span>{activePayment.sourceAccountNumber}</span>
                        <i className="bi bi-arrow-right"></i>
                        <strong>{activePayment.destinationBankCode}</strong>
                        <i className="bi bi-arrow-right"></i>
                        <span>{activePayment.destinationAccountNumber}</span>
                      </div>
                    </div>

                    {/* State Machine */}
                    <div className="interbank-state-machine">
                      {PAYMENT_STATES.map((s, idx) => {
                        const isCurrent = activePayment.status === s.key;
                        const isPast = currentStateIdx > idx && !isFailure;

                        return (
                          <div key={s.key} className="interbank-step">
                            <div
                              className={`interbank-step__node ${
                                isPast || (isCurrent && !isFailure)
                                  ? 'is-done'
                                  : isCurrent && isFailure
                                  ? 'is-current'
                                  : ''
                              }`}
                              style={{ '--step-color': s.color } as React.CSSProperties}
                            >
                              {isPast ? (
                                <i className="bi bi-check-lg"></i>
                              ) : (
                                <i className={`bi ${s.icon}`}></i>
                              )}
                            </div>
                            <div className={`interbank-step__label ${isCurrent ? 'is-current' : ''}`}>
                              {s.label}
                            </div>
                            {idx < PAYMENT_STATES.length - 1 && (
                              <div
                                className={`interbank-step__connector ${
                                  currentStateIdx > idx && !isFailure ? 'is-done' : ''
                                }`}
                              ></div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Failure State */}
                    {isFailure && FAILURE_STATES[activePayment.status] && (
                      <div className="interbank-failure-state">
                        <div
                          className="interbank-failure-state__header"
                          style={{ color: FAILURE_STATES[activePayment.status].color }}
                        >
                          <i className={`bi ${FAILURE_STATES[activePayment.status].icon}`}></i>
                          {FAILURE_STATES[activePayment.status].label}
                        </div>
                        {activePayment.failureReason && (
                          <div className="interbank-failure-state__reason">
                            {activePayment.failureReason}
                          </div>
                        )}
                        {activePayment.status === 'REVERSED' && (
                          <div className="interbank-reversal-badge">
                            <i className="bi bi-shield-check-fill"></i>
                            ₹{(activePayment.amount / 100).toFixed(2)} returned to your account
                          </div>
                        )}
                        {activePayment.status === 'REVERSAL_PENDING' && (
                          <div className="interbank-reversal-pending">
                            <span className="spinner spinner--dark spinner--xs"></span>
                            Saga compensation in progress…
                          </div>
                        )}
                      </div>
                    )}

                    {/* Success State */}
                    {activePayment.status === 'COMPLETED' && (
                      <div className="interbank-success-state">
                        <i className="bi bi-check-circle-fill"></i>
                        <span>Payment Completed Successfully</span>
                        {activePayment.paymentNetworkReference && (
                          <div className="interbank-ref">
                            Network Ref: {activePayment.paymentNetworkReference}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Event Log */}
                    {activePayment.events && activePayment.events.length > 0 && (
                      <div className="interbank-event-log">
                        <div className="interbank-event-log__title">Saga Event Log</div>
                        {activePayment.events.map((ev, i) => (
                          <div key={i} className="interbank-event">
                            <div className="interbank-event__type">{ev.eventType}</div>
                            <div className="interbank-event__status">
                              {ev.fromStatus && <span>{ev.fromStatus}</span>}
                              {ev.fromStatus && <i className="bi bi-arrow-right"></i>}
                              <span className="interbank-event__to">{ev.toStatus}</span>
                            </div>
                            {ev.detail && (
                              <div className="interbank-event__detail">{ev.detail}</div>
                            )}
                            <div className="interbank-event__time">
                              {new Date(ev.occurredAt).toLocaleTimeString('en-IN')}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="interbank-content">
            <div className="interbank-panel">
              <div className="interbank-panel__title">
                <i className="bi bi-clock-history"></i>
                <span>Inter-Bank Payment History</span>
              </div>

              {loadingHistory ? (
                <div className="interbank-skeleton-list">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton skeleton--row" />
                  ))}
                </div>
              ) : payments.length === 0 ? (
                <div className="interbank-empty-history">
                  <div className="interbank-empty-history__icon">
                    <i className="bi bi-inbox"></i>
                  </div>
                  <h3>No inter-bank payments yet</h3>
                  <p>Initiate your first transfer to see it appear here.</p>
                </div>
              ) : (
                <div className="interbank-history-list">
                  {payments.map((p) => {
                    const isCompleted = p.status === 'COMPLETED';
                    const isReversed = p.status === 'REVERSED';
                    const isFailed = isFailureStatus(p.status) && !isReversed;

                    return (
                      <div
                        key={p.id}
                        className={`interbank-history-item ${
                          isCompleted ? 'is-completed' : isReversed ? 'is-reversed' : isFailed ? 'is-failed' : 'is-pending'
                        }`}
                      >
                        <div className="interbank-history-item__icon">
                          <i
                            className={`bi ${
                              isCompleted
                                ? 'bi-check-circle-fill'
                                : isReversed
                                ? 'bi-arrow-counterclockwise'
                                : isFailed
                                ? 'bi-x-circle-fill'
                                : 'bi-hourglass-split'
                            }`}
                          ></i>
                        </div>
                        <div className="interbank-history-item__body">
                          <div className="interbank-history-item__ref">{p.paymentNumber}</div>
                          <div className="interbank-history-item__route">
                            {p.sourceAccountNumber}
                            <i className="bi bi-arrow-right"></i>
                            <strong>{p.destinationBankCode}</strong>
                            <span>/ {p.destinationAccountNumber}</span>
                          </div>
                          {p.failureReason && (
                            <div className="interbank-history-item__reason">{p.failureReason}</div>
                          )}
                        </div>
                        <div className="interbank-history-item__right">
                          <div className="interbank-history-item__amount">
                            {formatCurrency(p.amount)}
                          </div>
                          <span
                            className={`interbank-status-badge interbank-status-badge--${p.status
                              .toLowerCase()
                              .replace(/_/g, '-')}`}
                          >
                            {p.status}
                          </span>
                          <div className="interbank-history-item__date">
                            {new Date(p.createdAt).toLocaleDateString('en-IN')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};