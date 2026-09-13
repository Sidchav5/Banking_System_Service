import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { AuthUser, UserProfile, RegisterRequest, LoginRequest } from '@bankflow/shared';

const API_BASE_URL = 'http://localhost:3000/api/v1';

interface AuthContextType {
  user: AuthUser | null;
  profile: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<boolean>;
  register: (data: RegisterRequest) => Promise<boolean>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('bankflow_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('bankflow_profile');
    return saved ? JSON.parse(saved) : null;
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem('bankflow_token');
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken && !profile) {
      fetchProfile();
    }
  }, [accessToken]);

  const clearError = () => setError(null);

  const fetchProfile = async () => {
    if (!accessToken) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/users/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.data.success) {
        setProfile(res.data.data);
        localStorage.setItem('bankflow_profile', JSON.stringify(res.data.data));
      }
    } catch {
      // Profile fetch fallback for mock testing
    }
  };

  const login = async (credentials: LoginRequest): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/login`, credentials);
      if (res.data.success) {
        const { user: authUser, accessToken: token } = res.data.data;
        setUser(authUser);
        setAccessToken(token);
        localStorage.setItem('bankflow_user', JSON.stringify(authUser));
        localStorage.setItem('bankflow_token', token);
        await fetchProfile();
        setLoading(false);
        return true;
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Login failed. Please check backend connection.');
      }
    } finally {
      setLoading(false);
    }
    return false;
  };

  const register = async (data: RegisterRequest): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/auth/register`, data);
      if (res.data.success) {
        const { user: authUser, accessToken: token } = res.data.data;
        setUser(authUser);
        setAccessToken(token);
        localStorage.setItem('bankflow_user', JSON.stringify(authUser));
        localStorage.setItem('bankflow_token', token);
        await fetchProfile();
        setLoading(false);
        return true;
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
    return false;
  };

  const logout = () => {
    if (accessToken) {
      axios.post(`${API_BASE_URL}/auth/logout`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).catch(() => {});
    }
    setUser(null);
    setProfile(null);
    setAccessToken(null);
    localStorage.removeItem('bankflow_user');
    localStorage.removeItem('bankflow_profile');
    localStorage.removeItem('bankflow_token');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        accessToken,
        isAuthenticated: !!accessToken,
        loading,
        error,
        login,
        register,
        logout,
        fetchProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
