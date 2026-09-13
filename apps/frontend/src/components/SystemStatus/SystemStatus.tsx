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
  { name: 'Auth Service', port: 3001, endpoint: 'http://localhost:3001/health' },
  { name: 'User Service', port: 3002, endpoint: 'http://localhost:3002/health' },
  { name: 'Account Service', port: 3003, endpoint: 'http://localhost:3003/health' },
  { name: 'Ledger Service', port: 3004, endpoint: 'http://localhost:3004/health' },
  { name: 'Transaction Service', port: 3005, endpoint: 'http://localhost:3005/health' },
  { name: 'Payment Service', port: 3006, endpoint: 'http://localhost:3006/health' },
  { name: 'Beneficiary Service', port: 3007, endpoint: 'http://localhost:3007/health' },
  { name: 'Bank Service', port: 3008, endpoint: 'http://localhost:3008/health' },
  { name: 'Settlement Service', port: 3009, endpoint: 'http://localhost:3009/health' },
  { name: 'Reconciliation Service', port: 3010, endpoint: 'http://localhost:3010/health' },
  { name: 'Notification Service', port: 3011, endpoint: 'http://localhost:3011/health' },
  { name: 'Payment Network Sim', port: 4000, endpoint: 'http://localhost:4000/health' },
  { name: 'External Bank Sim', port: 4001, endpoint: 'http://localhost:4001/health' },
];

export const SystemStatus: React.FC = () => {
  const [healthData, setHealthData] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);

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
    setLoading(false);
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <div className="container py-4">
      <div className="status-header text-center">
        <h2 className="fw-bold mb-2">
          <i className="bi bi-diagram-3 text-info me-2"></i> BankFlow System Architecture Status
        </h2>
        <p className="text-muted mb-0">Real-time health probes across 14 microservices and simulator clusters</p>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-muted small">Showing operational health status for microservice ports 3000-4001</span>
        <button className="btn btn-outline-info btn-sm" onClick={checkHealth} disabled={loading}>
          <i className={`bi bi-arrow-clockwise me-1 ${loading ? 'spin' : ''}`}></i> Refresh Probes
        </button>
      </div>

      <div className="row g-3">
        {SERVICES.map((svc) => {
          const current = healthData.find((h) => h.port === svc.port);
          const status = current?.status || 'down';

          return (
            <div key={svc.port} className="col-md-6 col-lg-4">
              <div className="card service-card p-3 h-100">
                <div className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <span className={`status-dot ${status}`}></span>
                    <h6 className="mb-0 fw-bold">{svc.name}</h6>
                  </div>
                  <span className="badge bg-dark font-monospace">:{svc.port}</span>
                </div>
                <div className="mt-2 d-flex justify-content-between align-items-center small text-muted">
                  <span>Status: <strong className="text-uppercase">{status}</strong></span>
                  {current?.uptime !== undefined && <span>Uptime: {current.uptime}s</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
