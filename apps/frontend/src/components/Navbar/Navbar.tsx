import React from 'react';
import { useAuth } from '../../context/AuthContext';
import './Navbar.css';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bankflow-navbar py-2 sticky-top">
      <div className="container">
        <a
          className="navbar-brand bankflow-brand d-flex align-items-center cursor-pointer"
          href="#"
          onClick={(e) => { e.preventDefault(); setActiveTab('status'); }}
        >
          <i className="bi bi-bank2 text-info me-2 fs-3"></i>
          <span>BankFlow</span>
          <span className="brand-badge">ENTERPRISE</span>
        </a>

        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarContent"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarContent">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-lg-4">
            <li className="nav-item">
              <button
                className={`nav-link bankflow-nav-link btn btn-link ${activeTab === 'status' ? 'active' : ''}`}
                onClick={() => setActiveTab('status')}
              >
                <i className="bi bi-cpu me-1"></i> System Status
              </button>
            </li>

            {isAuthenticated && (
              <>
                <li className="nav-item">
                  <button
                    className={`nav-link bankflow-nav-link btn btn-link ${activeTab === 'accounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('accounts')}
                  >
                    <i className="bi bi-wallet2 me-1"></i> Accounts
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link bankflow-nav-link btn btn-link ${activeTab === 'profile' ? 'active' : ''}`}
                    onClick={() => setActiveTab('profile')}
                  >
                    <i className="bi bi-person-circle me-1"></i> My Profile
                  </button>
                </li>
              </>
            )}
          </ul>

          <div className="d-flex align-items-center gap-2">
            {isAuthenticated ? (
              <>
                <span className="user-badge d-none d-md-inline-block me-2">
                  <i className="bi bi-shield-check text-info me-1"></i>
                  {user?.email} ({user?.role})
                </span>
                <button className="btn btn-outline-danger btn-sm px-3" onClick={logout}>
                  <i className="bi bi-box-arrow-right me-1"></i> Logout
                </button>
              </>
            ) : (
              <>
                <button
                  className={`btn btn-sm ${activeTab === 'login' ? 'btn-info text-dark font-weight-bold' : 'btn-outline-light'} px-3`}
                  onClick={() => setActiveTab('login')}
                >
                  <i className="bi bi-box-arrow-in-right me-1"></i> Login
                </button>
                <button
                  className={`btn btn-sm ${activeTab === 'register' ? 'btn-info text-dark font-weight-bold' : 'btn-info'} px-3`}
                  onClick={() => setActiveTab('register')}
                >
                  <i className="bi bi-person-plus me-1"></i> Register
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
