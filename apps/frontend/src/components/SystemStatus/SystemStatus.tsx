import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './SystemStatus.css';

interface ServiceHealth {
  name: string;
  port: number;
  status: 'ok' | 'degraded' | 'down';
  uptime?: number;
}

const SERVICES = [
  { name: 'API Gateway', port: 3000, endpoint: 'http://localhost:3000/health' },
  { name: 'Auth Service', port: 3001, endpoint: 'http://localhost:3000/api/v1/auth/health' },
  { name: 'User Service', port: 3002, endpoint: 'http://localhost:3000/api/v1/users/health' },
  { name: 'Account Service', port: 3003, endpoint: 'http://localhost:3000/api/v1/accounts/health' },
  { name: 'Ledger Service', port: 3004, endpoint: 'http://localhost:3000/api/v1/ledger/health' },
  { name: 'Transaction Service', port: 3005, endpoint: 'http://localhost:3000/api/v1/transactions/health' },
  { name: 'Payment Service', port: 3006, endpoint: 'http://localhost:3000/api/v1/payments/health' },
  { name: 'Beneficiary Service', port: 3007, endpoint: 'http://localhost:3000/api/v1/beneficiaries/health' },
  { name: 'Bank Service', port: 3008, endpoint: 'http://localhost:3000/api/v1/banks/health' },
  { name: 'Settlement Service', port: 3009, endpoint: 'http://localhost:3000/api/v1/settlement/health' },
  { name: 'Reconciliation Service', port: 3010, endpoint: 'http://localhost:3000/api/v1/reconciliation/health' },
  { name: 'Notification Service', port: 3011, endpoint: 'http://localhost:3000/api/v1/notifications/health' },
];

export const SystemStatus: React.FC = () => {
  const [healthData, setHealthData] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    const results = await Promise.all(
      SERVICES.map(async (svc) => {
        try {
          const res = await axios.get(svc.endpoint, { timeout: 2000 });
          return {
            name: svc.name,
            port: svc.port,
            status: res.data.status === 'ok' ? ('ok' as const) : ('degraded' as const),
            uptime: res.data.uptime,
          };
        } catch {
          return {
            name: svc.name,
            port: svc.port,
            status: 'down' as const,
          };
        }
      })
    );
    setHealthData(results);
    setLastChecked(new Date());
    setLoading(false);
  };

  useEffect(() => {
    checkHealth();
  }, []);

  // Derived summary (UI only)
  const summary = SERVICES.reduce(
    (acc, svc) => {
      const current = healthData.find((h) => h.port === svc.port);
      const status = current?.status ?? (loading ? null : 'down');
      if (status === 'ok') acc.ok++;
      else if (status === 'degraded') acc.degraded++;
      else if (status === 'down') acc.down++;
      return acc;
    },
    { ok: 0, degraded: 0, down: 0 }
  );

  const overallStatus =
    !loading && summary.down === 0 && summary.degraded === 0
      ? 'operational'
      : !loading && summary.down > 0
      ? 'critical'
      : !loading && summary.degraded > 0
      ? 'partial'
      : 'checking';

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

  return (
    <div className="status-page">
      <div className="status-container">
        {/* Hero header */}
        <header className="status-hero">
          <div className="status-hero__left">
            <div className="status-hero__icon">
              <i className="bi bi-diagram-3"></i>
            </div>
            <div>
              <span className="status-hero__eyebrow">Operations Dashboard</span>
              <h1 className="status-hero__title">System Architecture</h1>
              <p className="status-hero__subtitle">
                Real-time health probes across {SERVICES.length} microservices and simulator clusters
              </p>
            </div>
          </div>

          <div className="status-hero__right">
            <div className={`status-overall status-overall--${overallStatus}`}>
              <span className="status-overall__dot" />
              <span className="status-overall__label">
                {overallStatus === 'operational' && 'All systems operational'}
                {overallStatus === 'partial' && 'Partial degradation'}
                {overallStatus === 'critical' && 'Service outage detected'}
                {overallStatus === 'checking' && 'Running health checks…'}
              </span>
            </div>
            <button
              className="btn btn--primary"
              onClick={checkHealth}
              disabled={loading}
            >
              <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}></i>
              {loading ? 'Probing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* Summary stats */}
        <section className="status-summary">
          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--neutral">
              <i className="bi bi-hdd-stack"></i>
            </div>
            <div className="stat-card__body">
              <span className="stat-card__label">Total Services</span>
              <span className="stat-card__value">{SERVICES.length}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--ok">
              <i className="bi bi-check-circle-fill"></i>
            </div>
            <div className="stat-card__body">
              <span className="stat-card__label">Operational</span>
              <span className="stat-card__value stat-card__value--ok">
                {summary.ok}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--warn">
              <i className="bi bi-exclamation-circle-fill"></i>
            </div>
            <div className="stat-card__body">
              <span className="stat-card__label">Degraded</span>
              <span className="stat-card__value stat-card__value--warn">
                {summary.degraded}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card__icon stat-card__icon--danger">
              <i className="bi bi-x-circle-fill"></i>
            </div>
            <div className="stat-card__body">
              <span className="stat-card__label">Down</span>
              <span className="stat-card__value stat-card__value--danger">
                {summary.down}
              </span>
            </div>
          </div>
        </section>

        {/* Meta row: legend + last checked */}
        <div className="status-meta">
          <div className="status-legend">
            <span className="status-legend__item">
              <span className="status-dot ok" /> Operational
            </span>
            <span className="status-legend__item">
              <span className="status-dot degraded" /> Degraded
            </span>
            <span className="status-legend__item">
              <span className="status-dot down" /> Down
            </span>
          </div>
          {lastChecked && (
            <span className="status-meta__time">
              <i className="bi bi-clock-history"></i>
              Last checked {formatTime(lastChecked)}
            </span>
          )}
        </div>

        {/* Service grid */}
        <section className="services-grid">
          {SERVICES.map((svc) => {
            const current = healthData.find((h) => h.port === svc.port);
            const status = current?.status ?? (loading ? 'checking' : 'down');
            const statusLabel =
              status === 'ok'
                ? 'Operational'
                : status === 'degraded'
                ? 'Degraded'
                : status === 'checking'
                ? 'Checking…'
                : 'Offline';

            return (
              <article
                key={svc.port}
                className={`service-card service-card--${status}`}
              >
                <div className="service-card__bar" />

                <div className="service-card__content">
                  <header className="service-card__header">
                    <div className="service-card__title-group">
                      <span className={`status-dot ${status}`} />
                      <h3 className="service-card__name">{svc.name}</h3>
                    </div>
                    <span className="service-card__port">:{svc.port}</span>
                  </header>

                  <div className="service-card__details">
                    <div className="service-card__row">
                      <span className="service-card__label">Status</span>
                      <span
                        className={`service-card__badge service-card__badge--${status}`}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    <div className="service-card__row">
                      <span className="service-card__label">Uptime</span>
                      <span className="service-card__uptime">
                        {current?.uptime !== undefined ? `${current.uptime}s` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};