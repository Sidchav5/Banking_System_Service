import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar/Navbar';
import { LoginForm } from './components/LoginForm/LoginForm';
import { RegisterForm } from './components/RegisterForm/RegisterForm';
import { UserProfileView } from './components/UserProfile/UserProfile';
import { AccountList } from './components/AccountList/AccountList';
import { LedgerJournalView } from './components/LedgerJournalView/LedgerJournalView';
import { TransactionListView } from './components/TransactionListView/TransactionListView';
import { SystemStatus } from './components/SystemStatus/SystemStatus';
import './App.css';

const MainContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('status');

  return (
    <div className="bg-light min-vh-100 d-flex flex-column">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-grow-1">
        {activeTab === 'status' && <SystemStatus />}

        {activeTab === 'login' && (
          <LoginForm
            onSuccess={() => setActiveTab('profile')}
            onSwitchToRegister={() => setActiveTab('register')}
          />
        )}

        {activeTab === 'register' && (
          <RegisterForm
            onSuccess={() => setActiveTab('profile')}
            onSwitchToLogin={() => setActiveTab('login')}
          />
        )}

        {activeTab === 'accounts' && (
          isAuthenticated ? (
            <AccountList />
          ) : (
            <div className="container py-5 text-center">
              <div className="alert alert-warning d-inline-block px-4 py-3 shadow-sm" role="alert">
                <i className="bi bi-wallet2 me-2"></i>
                Please sign in to access your bank accounts.
              </div>
              <div className="mt-3">
                <button className="btn btn-info font-weight-bold" onClick={() => setActiveTab('login')}>
                  Sign In Now
                </button>
              </div>
            </div>
          )
        )}

        {activeTab === 'ledger' && (
          isAuthenticated ? (
            <LedgerJournalView />
          ) : (
            <div className="container py-5 text-center">
              <div className="alert alert-warning d-inline-block px-4 py-3 shadow-sm" role="alert">
                <i className="bi bi-journal-text me-2"></i>
                Please sign in to view double-entry ledger transactions.
              </div>
              <div className="mt-3">
                <button className="btn btn-info font-weight-bold" onClick={() => setActiveTab('login')}>
                  Sign In Now
                </button>
              </div>
            </div>
          )
        )}

        {activeTab === 'transactions' && (
          isAuthenticated ? (
            <TransactionListView />
          ) : (
            <div className="container py-5 text-center">
              <div className="alert alert-warning d-inline-block px-4 py-3 shadow-sm" role="alert">
                <i className="bi bi-arrow-left-right me-2"></i>
                Please sign in to view transfers and payment transactions.
              </div>
              <div className="mt-3">
                <button className="btn btn-info font-weight-bold" onClick={() => setActiveTab('login')}>
                  Sign In Now
                </button>
              </div>
            </div>
          )
        )}

        {activeTab === 'profile' && (
          isAuthenticated ? (
            <UserProfileView />
          ) : (
            <div className="container py-5 text-center">
              <div className="alert alert-warning d-inline-block px-4 py-3 shadow-sm" role="alert">
                <i className="bi bi-shield-lock-fill me-2"></i>
                Please sign in to view your user profile.
              </div>
              <div className="mt-3">
                <button className="btn btn-info font-weight-bold" onClick={() => setActiveTab('login')}>
                  Sign In Now
                </button>
              </div>
            </div>
          )
        )}
      </main>

      <footer className="bg-dark text-white py-3 text-center border-top border-secondary mt-auto">
        <div className="container">
          <small className="text-muted">
            BankFlow Enterprise Simulation Platform &copy; 2026 · Microservices · JWT Auth · Neon PostgreSQL
          </small>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}

export default App;
