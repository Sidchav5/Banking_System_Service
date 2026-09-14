import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const initials = (user?.email ?? '?')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase();

  const navItems = [
    {
      key: 'status',
      label: 'System Status',
      icon: 'bi-cpu',
      authRequired: false,
    },
    {
      key: 'accounts',
      label: 'Accounts',
      icon: 'bi-wallet2',
      authRequired: true,
    },
    {
      key: 'ledger',
      label: 'Ledger Transactions',
      icon: 'bi-journal-text',
      authRequired: true,
    },
    {
      key: 'profile',
      label: 'My Profile',
      icon: 'bi-person-circle',
      authRequired: true,
    },
  ];

  const handleNavClick = (key: string) => {
    setActiveTab(key);
    setIsSidebarOpen(false);
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bankflow-navbar sticky-top">
        <div className="bankflow-navbar__inner">
          <div className="bankflow-navbar__left">
            {/* Control Panel Trigger (only when logged in) */}
            {isAuthenticated && (
              <button
                type="button"
                className={`bankflow-sidebar-trigger ${isSidebarOpen ? 'is-active' : ''}`}
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                title="Open Left Control Panel"
              >
                <i className="bi bi-layout-sidebar-inset"></i>
                <span className="d-none d-sm-inline">Control Panel</span>
              </button>
            )}

            {/* Brand */}
            <a
              href="#"
              className="bankflow-brand"
              onClick={(e) => {
                e.preventDefault();
                handleNavClick('status');
              }}
            >
              <span className="bankflow-brand__icon">
                <i className="bi bi-bank2"></i>
              </span>
              <span className="bankflow-brand__name">BankFlow</span>
              <span className="bankflow-brand__pill">Enterprise</span>
            </a>
          </div>

          {/* Right side items */}
          <div className="bankflow-actions">
            {!isAuthenticated ? (
              /* LOGGED OUT: Horizontal panel on navbar header */
              <div className="bankflow-logged-out-nav">
                <button
                  type="button"
                  className={`bankflow-nav-link ${activeTab === 'status' ? 'is-active' : ''}`}
                  onClick={() => handleNavClick('status')}
                >
                  <i className="bi bi-cpu"></i>
                  <span>System Status</span>
                </button>
                <button
                  type="button"
                  className={`bankflow-btn bankflow-btn--ghost ${
                    activeTab === 'login' ? 'is-active' : ''
                  }`}
                  onClick={() => handleNavClick('login')}
                >
                  <i className="bi bi-box-arrow-in-right"></i>
                  <span>Login</span>
                </button>
                <button
                  type="button"
                  className={`bankflow-btn bankflow-btn--primary ${
                    activeTab === 'register' ? 'is-active' : ''
                  }`}
                  onClick={() => handleNavClick('register')}
                >
                  <i className="bi bi-person-plus"></i>
                  <span>Register</span>
                </button>
              </div>
            ) : (
              /* LOGGED IN: Quick user avatar chip + Control panel prompt */
              <div className="bankflow-logged-in-top">
                <div
                  className="user-chip user-chip--clickable"
                  onClick={() => setIsSidebarOpen(true)}
                  title="Click to open Control Panel"
                >
                  <span className="user-chip__avatar">{initials}</span>
                  <span className="user-chip__meta d-none d-md-flex">
                    <span className="user-chip__email">{user?.email}</span>
                    <span className="user-chip__role">
                      <i className="bi bi-shield-check"></i>
                      {user?.role}
                    </span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* LOGGED IN STATE: Left Vertical Control Panel (Sidebar) */}
      {isAuthenticated && (
        <>
          {/* Backdrop overlay */}
          <div
            className={`bankflow-sidebar-backdrop ${isSidebarOpen ? 'is-visible' : ''}`}
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* Vertical Control Panel Sidebar */}
          <aside className={`bankflow-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
            <div className="bankflow-sidebar__header">
              <div className="bankflow-sidebar__title">
                <i className="bi bi-sliders"></i>
                <span>Control Panel</span>
              </div>
              <button
                type="button"
                className="bankflow-sidebar__close"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Close Control Panel"
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            {/* User Details Card inside vertical panel */}
            <div className="bankflow-sidebar__user-card">
              <div className="sidebar-avatar">{initials}</div>
              <div className="sidebar-user-details">
                <div className="sidebar-user-email">{user?.email}</div>
                <div className="sidebar-user-badge">
                  <i className="bi bi-shield-lock-fill"></i> {user?.role} Access
                </div>
              </div>
            </div>

            {/* Vertical Menu Navigation */}
            <div className="bankflow-sidebar__section-title">APP OPTIONS</div>
            <ul className="bankflow-sidebar__nav">
              {navItems.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={`bankflow-sidebar-link ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleNavClick(item.key)}
                    >
                      <i className={`bi ${item.icon}`}></i>
                      <span>{item.label}</span>
                      {isActive && (
                        <i className="bi bi-chevron-right ms-auto sidebar-active-arrow"></i>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Sidebar Footer Logout */}
            <div className="bankflow-sidebar__footer">
              <button
                type="button"
                className="bankflow-sidebar-logout"
                onClick={() => {
                  setIsSidebarOpen(false);
                  logout();
                }}
              >
                <i className="bi bi-box-arrow-right"></i>
                <span>Logout Session</span>
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
};