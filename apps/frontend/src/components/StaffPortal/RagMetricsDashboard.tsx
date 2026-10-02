import React from 'react';
import './RagMetricsDashboard.css';

export const RagMetricsDashboard: React.FC = () => {
  const metrics = {
    totalQueries: 1520,
    avgLatencyMs: 845,
    abstentionRate: 8.2,
    mrr: 0.82,
    recallAt1: 85.4,
    recallAt5: 96.2,
  };

  const recentQueries = [
    { id: 'q1', query: 'What is NEFT?', type: 'GENERAL_BANKING', latency: 450, abstained: false },
    { id: 'q2', query: 'Why is my transfer PENDING?', type: 'LIVE_TRANSACTION_DATA', latency: 980, abstained: false },
    { id: 'q3', query: 'Transfer $500 to Bob', type: 'FINANCIAL_ACTION', latency: 120, abstained: false },
    { id: 'q4', query: 'How do I cook pasta?', type: 'UNSUPPORTED', latency: 150, abstained: false },
    { id: 'q5', query: 'ASDFGHJKL', type: 'GENERAL_BANKING', latency: 400, abstained: true },
  ];

  return (
    <div className="rag-page">
      <div className="rag-container">
        {/* Hero header */}
        <header className="rag-hero">
          <div className="rag-hero__left">
            <div className="rag-hero__icon">
              <i className="bi bi-robot"></i>
            </div>
            <div>
              <span className="rag-hero__eyebrow">AI Operations</span>
              <h1 className="rag-hero__title">RAG Performance Dashboard</h1>
              <p className="rag-hero__subtitle">
                Monitor retrieval quality, latency, and assistant behavior across the banking copilot
              </p>
            </div>
          </div>

          <div className="rag-hero__status">
            <span className="rag-live-dot"></span>
            <span>Live telemetry</span>
          </div>
        </header>

        {/* KPI grid */}
        <section className="rag-kpi-grid">
          <div className="rag-kpi-card">
            <div className="rag-kpi-card__icon rag-kpi-card__icon--indigo">
              <i className="bi bi-search"></i>
            </div>
            <div className="rag-kpi-card__body">
              <span className="rag-kpi-card__label">Total Queries</span>
              <span className="rag-kpi-card__value">
                {metrics.totalQueries.toLocaleString()}
              </span>
              <span className="rag-kpi-card__hint">last 24 hours</span>
            </div>
          </div>

          <div className="rag-kpi-card">
            <div className="rag-kpi-card__icon rag-kpi-card__icon--amber">
              <i className="bi bi-stopwatch"></i>
            </div>
            <div className="rag-kpi-card__body">
              <span className="rag-kpi-card__label">Avg Latency</span>
              <span className="rag-kpi-card__value">
                {metrics.avgLatencyMs}
                <span className="rag-kpi-card__unit">ms</span>
              </span>
              <span className="rag-kpi-card__hint">p50 across queries</span>
            </div>
          </div>

          <div className="rag-kpi-card">
            <div className="rag-kpi-card__icon rag-kpi-card__icon--danger">
              <i className="bi bi-shield-slash"></i>
            </div>
            <div className="rag-kpi-card__body">
              <span className="rag-kpi-card__label">Abstention Rate</span>
              <span className="rag-kpi-card__value">
                {metrics.abstentionRate}
                <span className="rag-kpi-card__unit">%</span>
              </span>
              <span className="rag-kpi-card__hint">guardrails triggered</span>
            </div>
          </div>

          <div className="rag-kpi-card">
            <div className="rag-kpi-card__icon rag-kpi-card__icon--success">
              <i className="bi bi-bullseye"></i>
            </div>
            <div className="rag-kpi-card__body">
              <span className="rag-kpi-card__label">Mean Reciprocal Rank</span>
              <span className="rag-kpi-card__value">{metrics.mrr.toFixed(2)}</span>
              <span className="rag-kpi-card__hint">higher is better</span>
            </div>
          </div>
        </section>

        {/* Charts row */}
        <section className="rag-charts-row">
          {/* Recall panel */}
          <div className="rag-panel">
            <div className="rag-panel__head">
              <i className="bi bi-bar-chart-line-fill"></i>
              <h3>Retrieval Accuracy</h3>
            </div>

            <div className="recall-bars">
              <div className="recall-bar-item">
                <div className="recall-bar-item__head">
                  <span className="recall-label">Recall@1</span>
                  <span className="recall-value">{metrics.recallAt1}%</span>
                </div>
                <div className="recall-track">
                  <div
                    className="recall-fill recall-fill--primary"
                    style={{ width: `${metrics.recallAt1}%` }}
                  ></div>
                </div>
              </div>

              <div className="recall-bar-item">
                <div className="recall-bar-item__head">
                  <span className="recall-label">Recall@5</span>
                  <span className="recall-value">{metrics.recallAt5}%</span>
                </div>
                <div className="recall-track">
                  <div
                    className="recall-fill recall-fill--success"
                    style={{ width: `${metrics.recallAt5}%` }}
                  ></div>
                </div>
              </div>
            </div>

            <p className="rag-panel__hint">
              <i className="bi bi-info-circle"></i>
              Measured automatically on ingest via test suite.
            </p>
          </div>

          {/* Intent distribution */}
          <div className="rag-panel">
            <div className="rag-panel__head">
              <i className="bi bi-pie-chart-fill"></i>
              <h3>Queries by Intent</h3>
            </div>

            <div className="intent-chart">
              <div className="intent-chart__pie"></div>
              <ul className="intent-chart__legend">
                <li>
                  <span className="intent-chart__dot intent-chart__dot--banking"></span>
                  <span className="intent-chart__name">General Banking</span>
                  <span className="intent-chart__pct">45%</span>
                </li>
                <li>
                  <span className="intent-chart__dot intent-chart__dot--live"></span>
                  <span className="intent-chart__name">Live Data</span>
                  <span className="intent-chart__pct">25%</span>
                </li>
                <li>
                  <span className="intent-chart__dot intent-chart__dot--blocked"></span>
                  <span className="intent-chart__name">Guardrails</span>
                  <span className="intent-chart__pct">30%</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Recent queries */}
        <section className="rag-panel rag-panel--table">
          <div className="rag-panel__head">
            <i className="bi bi-clock-history"></i>
            <h3>Recent Query Logs</h3>
            <span className="rag-panel__count">{recentQueries.length} entries</span>
          </div>

          <div className="table-responsive">
            <table className="rag-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Query</th>
                  <th>Intent Class</th>
                  <th className="align-end">Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentQueries.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <code className="id-chip">{q.id}</code>
                    </td>
                    <td className="cell-query">{q.query}</td>
                    <td>
                      <span className={`query-type-badge query-type-badge--${q.type.toLowerCase().replace(/_/g, '-')}`}>
                        {q.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="align-end cell-latency">
                      {q.latency}
                      <span className="cell-latency__unit">ms</span>
                    </td>
                    <td>
                      {q.abstained ? (
                        <span className="rag-status rag-status--abstained">
                          <i className="bi bi-shield-exclamation"></i>
                          Abstained
                        </span>
                      ) : (
                        <span className="rag-status rag-status--answered">
                          <i className="bi bi-check-circle-fill"></i>
                          Answered
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};