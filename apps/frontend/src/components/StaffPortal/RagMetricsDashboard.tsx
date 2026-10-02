import React from 'react';
import './RagMetricsDashboard.css';

export const RagMetricsDashboard: React.FC = () => {
  // Hardcoded or mock metrics to demonstrate the dashboard
  const metrics = {
    totalQueries: 1520,
    avgLatencyMs: 845,
    abstentionRate: 8.2, // %
    mrr: 0.82,
    recallAt1: 85.4, // %
    recallAt5: 96.2, // %
  };

  const recentQueries = [
    { id: 'q1', query: 'What is NEFT?', type: 'GENERAL_BANKING', latency: 450, abstained: false },
    { id: 'q2', query: 'Why is my transfer PENDING?', type: 'LIVE_TRANSACTION_DATA', latency: 980, abstained: false },
    { id: 'q3', query: 'Transfer $500 to Bob', type: 'FINANCIAL_ACTION', latency: 120, abstained: false },
    { id: 'q4', query: 'How do I cook pasta?', type: 'UNSUPPORTED', latency: 150, abstained: false },
    { id: 'q5', query: 'ASDFGHJKL', type: 'GENERAL_BANKING', latency: 400, abstained: true },
  ];

  return (
    <div className="rag-dashboard-container">
      <div className="rag-dashboard-header">
        <h3>
          <i className="bi bi-robot"></i> RAG Performance Dashboard
        </h3>
        <p>Monitor retrieval metrics, latency, and AI assistant behavior.</p>
      </div>

      {/* KPI Cards */}
      <div className="rag-kpi-grid">
        <div className="rag-kpi-card">
          <div className="kpi-icon"><i className="bi bi-search"></i></div>
          <div className="kpi-content">
            <span className="kpi-label">Total Queries</span>
            <span className="kpi-value">{metrics.totalQueries.toLocaleString()}</span>
          </div>
        </div>
        <div className="rag-kpi-card">
          <div className="kpi-icon"><i className="bi bi-stopwatch"></i></div>
          <div className="kpi-content">
            <span className="kpi-label">Avg Latency</span>
            <span className="kpi-value">{metrics.avgLatencyMs} ms</span>
          </div>
        </div>
        <div className="rag-kpi-card">
          <div className="kpi-icon"><i className="bi bi-shield-slash"></i></div>
          <div className="kpi-content">
            <span className="kpi-label">Abstention Rate</span>
            <span className="kpi-value">{metrics.abstentionRate}%</span>
          </div>
        </div>
        <div className="rag-kpi-card">
          <div className="kpi-icon"><i className="bi bi-bullseye"></i></div>
          <div className="kpi-content">
            <span className="kpi-label">Mean Reciprocal Rank</span>
            <span className="kpi-value">{metrics.mrr.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="rag-charts-row">
        {/* Recall Metrics */}
        <div className="rag-chart-panel">
          <h4>Retrieval Accuracy (Recall)</h4>
          <div className="recall-bars">
            <div className="recall-bar-item">
              <div className="recall-label">Recall@1 ({metrics.recallAt1}%)</div>
              <div className="recall-track">
                <div className="recall-fill" style={{ width: `${metrics.recallAt1}%` }}></div>
              </div>
            </div>
            <div className="recall-bar-item">
              <div className="recall-label">Recall@5 ({metrics.recallAt5}%)</div>
              <div className="recall-track">
                <div className="recall-fill" style={{ width: `${metrics.recallAt5}%` }}></div>
              </div>
            </div>
          </div>
          <p className="rag-chart-hint">Measured automatically on ingest via test suite.</p>
        </div>
        
        {/* Mock Chart Area */}
        <div className="rag-chart-panel">
          <h4>Queries by Intent</h4>
          <div className="intent-chart-placeholder">
            <div className="pie-chart-mock"></div>
            <div className="pie-legend">
              <div><span className="dot dot-banking"></span> General Banking</div>
              <div><span className="dot dot-live"></span> Live Data</div>
              <div><span className="dot dot-blocked"></span> Guardrails</div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Queries Table */}
      <div className="rag-recent-queries">
        <h4>Recent Queries Logs</h4>
        <table className="staff-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Query</th>
              <th>Intent Class</th>
              <th>Latency</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recentQueries.map((q) => (
              <tr key={q.id}>
                <td><code>{q.id}</code></td>
                <td>{q.query}</td>
                <td>
                  <span className={`query-type-badge ${q.type.toLowerCase()}`}>
                    {q.type.replace('_', ' ')}
                  </span>
                </td>
                <td>{q.latency} ms</td>
                <td>
                  {q.abstained ? (
                    <span className="status-badge abstained">Abstained</span>
                  ) : (
                    <span className="status-badge answered">Answered</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
