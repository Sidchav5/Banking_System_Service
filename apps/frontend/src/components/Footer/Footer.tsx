import React from 'react';
import './Footer.css';

interface FooterProps {
  setActiveTab?: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setActiveTab }) => {
  return (
    <footer className="bankflow-footer">
      {/* Top Banner Accent */}
      <div className="footer-top-accent" />

      <div className="footer-container">
        {/* Main Grid */}
        <div className="footer-grid">
          {/* Brand Column */}
          <div className="footer-brand-col">
            <div className="footer-brand" onClick={() => setActiveTab && setActiveTab('status')}>
              <div className="footer-brand__icon">
                <i className="bi bi-bank2"></i>
              </div>
              <span className="footer-brand__name">
                Bank<span className="footer-brand__accent">Flow</span>
              </span>
            </div>

            <p className="footer-description">
              Enterprise distributed core banking, double-entry ledger engine, and real-time payment processing platform built with high-concurrency microservice architecture.
            </p>

            {/* Security Badges */}
            <div className="footer-badges">
              <span className="badge-item" title="TLS 256-Bit Encrypted Data Streams">
                <i className="bi bi-shield-lock-fill"></i> 256-Bit TLS
              </span>
              <span className="badge-item" title="GAAP Double-Entry Accounting Standard">
                <i className="bi bi-journal-check"></i> GAAP Compliant
              </span>
              <span className="badge-item" title="Idempotency Key Protected Transfers">
                <i className="bi bi-cpu-fill"></i> Idempotent Engine
              </span>
            </div>
          </div>

          {/* Links Column 1: Banking Services */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Banking Services</h4>
            <ul className="footer-links">
              <li>
                <button type="button" onClick={() => setActiveTab && setActiveTab('accounts')}>
                  <i className="bi bi-chevron-right"></i> Personal & Savings Accounts
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setActiveTab && setActiveTab('transactions')}>
                  <i className="bi bi-chevron-right"></i> Inter-Account Transfers
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setActiveTab && setActiveTab('ledger')}>
                  <i className="bi bi-chevron-right"></i> Double-Entry Journal Audit
                </button>
              </li>
              <li>
                <button type="button" onClick={() => setActiveTab && setActiveTab('status')}>
                  <i className="bi bi-chevron-right"></i> Real-Time Deposit & Withdrawal
                </button>
              </li>
            </ul>
          </div>

          {/* Links Column 2: Microservices */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Microservices</h4>
            <ul className="footer-links footer-links--mono">
              <li>
                <span className="svc-tag svc-tag--gateway">API Gateway</span>
                <span className="svc-port">:3000</span>
              </li>
              <li>
                <span className="svc-tag svc-tag--auth">Auth Service</span>
                <span className="svc-port">:3001</span>
              </li>
              <li>
                <span className="svc-tag svc-tag--user">User Service</span>
                <span className="svc-port">:3002</span>
              </li>
              <li>
                <span className="svc-tag svc-tag--account">Account Service</span>
                <span className="svc-port">:3003</span>
              </li>
              <li>
                <span className="svc-tag svc-tag--ledger">Ledger Service</span>
                <span className="svc-port">:3004</span>
              </li>
              <li>
                <span className="svc-tag svc-tag--trans">Transaction Service</span>
                <span className="svc-port">:3005</span>
              </li>
            </ul>
          </div>

          {/* Links Column 3: Platform Governance */}
          <div className="footer-links-col">
            <h4 className="footer-heading">Platform Security</h4>
            <ul className="footer-links">
              <li>
                <span className="gov-item">
                  <i className="bi bi-check2-circle"></i> Atomic Overdraft Guard
                </span>
              </li>
              <li>
                <span className="gov-item">
                  <i className="bi bi-check2-circle"></i> PostgreSQL Row Locks
                </span>
              </li>
              <li>
                <span className="gov-item">
                  <i className="bi bi-check2-circle"></i> Role-Based Access (RBAC)
                </span>
              </li>
              <li>
                <span className="gov-item">
                  <i className="bi bi-check2-circle"></i> Neon Cloud PostgreSQL
                </span>
              </li>
              <li>
                <span className="gov-item">
                  <i className="bi bi-check2-circle"></i> Redis Rate-Limiter
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="footer-divider" />

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div className="footer-bottom__left">
            <span className="copyright-text">
              © 2026 <strong>BankFlow Financial Technologies</strong>. All rights reserved.
            </span>
          </div>

          <div className="footer-bottom__status">
            <button
              type="button"
              className="status-pill"
              onClick={() => setActiveTab && setActiveTab('status')}
              title="Click to view live microservices health status"
            >
              <span className="status-dot status-dot--active" />
              <span className="status-text">7 / 7 Services Operational</span>
            </button>
          </div>

          <div className="footer-bottom__right">
            <span className="legal-link">Privacy</span>
            <span className="legal-dot">•</span>
            <span className="legal-link">Terms</span>
            <span className="legal-dot">•</span>
            <span className="legal-link">Security</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
