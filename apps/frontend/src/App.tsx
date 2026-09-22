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
import { StaffPortal } from './components/StaffPortal/StaffPortal';
import { InterBankTransfer } from './components/InterBankTransfer/InterBankTransfer';
import { BeneficiaryManager } from './components/BeneficiaryManager/BeneficiaryManager';
import { Footer } from './components/Footer/Footer';
import './App.css';

const MainContent: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('status');

  const handleAuthSuccess = () => {
    if (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN' || user?.role === 'AUDITOR') {
      setActiveTab('staff');
    } else {
      setActiveTab('accounts');
    }
  };

  return (
    <div className="bg-light min-vh-100 d-flex flex-column">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-grow-1">
        {activeTab === 'status' && <SystemStatus />}

        {activeTab === 'login' && (
          <LoginForm
            onSuccess={handleAuthSuccess}
            onSwitchToRegister={() => setActiveTab('register')}
          />
        )}

        {activeTab === 'register' && (
          <RegisterForm
            onSuccess={handleAuthSuccess}
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

        {activeTab === 'interbank' && (
          isAuthenticated ? (
            <InterBankTransfer />
          ) : (
            <div className="container py-5 text-center">
              <div className="alert alert-warning d-inline-block px-4 py-3 shadow-sm" role="alert">
                <i className="bi bi-globe2 me-2"></i>
                Please sign in to use Inter-Bank Transfers.
              </div>
              <div className="mt-3">
                <button className="btn btn-info font-weight-bold" onClick={() => setActiveTab('login')}>
                  Sign In Now
                </button>
              </div>
            </div>
          )
        )}

        {activeTab === 'beneficiaries' && (
          isAuthenticated ? (
            <BeneficiaryManager onQuickTransfer={() => setActiveTab('interbank')} />
          ) : (
            <div className="container py-5 text-center">
              <div className="alert alert-warning d-inline-block px-4 py-3 shadow-sm" role="alert">
                <i className="bi bi-people-fill me-2"></i>
                Please sign in to manage your saved beneficiaries.
              </div>
              <div className="mt-3">
                <button className="btn btn-info font-weight-bold" onClick={() => setActiveTab('login')}>
                  Sign In Now
                </button>
              </div>
            </div>
          )
        )}

        {activeTab === 'staff' && (
          isAuthenticated ? (
            <StaffPortal />
          ) : (
            <div className="container py-5 text-center">
              <div className="alert alert-warning d-inline-block px-4 py-3 shadow-sm" role="alert">
                <i className="bi bi-shield-lock-fill me-2"></i>
                Please sign in as Bank Staff or Admin to access the Staff Operations Portal.
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

      <Footer setActiveTab={setActiveTab} />
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
