import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import './NotificationBell.css';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICON: Record<string, string> = {
  PAYMENT_COMPLETED: 'bi-check-circle-fill',
  PAYMENT_REVERSED: 'bi-arrow-counterclockwise',
  PAYMENT_FAILED: 'bi-x-circle-fill',
  DEPOSIT: 'bi-arrow-down-circle-fill',
  WITHDRAWAL: 'bi-arrow-up-circle-fill',
  ACCOUNT_FROZEN: 'bi-lock-fill',
  ACCOUNT_UNFROZEN: 'bi-unlock-fill',
  SYSTEM: 'bi-info-circle-fill',
};

const TYPE_COLOR: Record<string, string> = {
  PAYMENT_COMPLETED: '#10b981',
  PAYMENT_REVERSED: '#f59e0b',
  PAYMENT_FAILED: '#ef4444',
  DEPOSIT: '#6366f1',
  WITHDRAWAL: '#8b5cf6',
  ACCOUNT_FROZEN: '#ef4444',
  ACCOUNT_UNFROZEN: '#10b981',
  SYSTEM: '#64748b',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const NotificationBell: React.FC = () => {
  const { accessToken } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const headers = { Authorization: `Bearer ${accessToken}` };

  const fetchUnreadCount = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await axios.get('/api/v1/notifications/unread-count', { headers });
      if (res.data?.success) {
        setUnreadCount(res.data.data.unreadCount ?? 0);
      }
    } catch { /* silent */ }
  }, [accessToken]);

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/notifications?limit=15', { headers });
      if (res.data?.success) {
        setNotifications(
          res.data.data.map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            isRead: n.is_read,
            createdAt: n.created_at,
          }))
        );
        setUnreadCount(res.data.data.filter((n: any) => !n.is_read).length);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [accessToken]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markRead = async (id: string) => {
    try {
      await axios.post('/api/v1/notifications/mark-read', { notificationId: id }, { headers });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await axios.post('/api/v1/notifications/mark-read', { all: true }, { headers });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* silent */ }
  };

  if (!accessToken) return null;

  return (
    <div className="notif-bell-wrapper" ref={dropdownRef}>
      <button
        className={`notif-bell-btn ${open ? 'is-active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
      >
        <i className="bi bi-bell-fill" />
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="menu">
          {/* Header */}
          <header className="notif-dropdown__header">
            <div className="notif-dropdown__title">
              <i className="bi bi-bell-fill"></i>
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="notif-dropdown__pill">{unreadCount} new</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                className="notif-mark-all"
                onClick={markAllRead}
                type="button"
              >
                <i className="bi bi-check2-all"></i>
                <span>Mark all read</span>
              </button>
            )}
          </header>

          {/* List */}
          <div className="notif-list">
            {loading ? (
              <div className="notif-state">
                <span className="notif-spinner" />
                <p>Loading notifications…</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notif-state">
                <div className="notif-state__icon">
                  <i className="bi bi-bell-slash"></i>
                </div>
                <h4>No notifications yet</h4>
                <p>Complete a payment to see updates here.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const color = TYPE_COLOR[n.type] ?? '#64748b';
                const icon = TYPE_ICON[n.type] ?? 'bi-bell';

                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-item ${!n.isRead ? 'is-unread' : ''}`}
                    onClick={() => !n.isRead && markRead(n.id)}
                  >
                    <div
                      className="notif-icon"
                      style={{
                        background: `${color}1a`,
                        color,
                        borderColor: `${color}33`,
                      }}
                    >
                      <i className={`bi ${icon}`} />
                    </div>

                    <div className="notif-content">
                      <div className="notif-item-title">{n.title}</div>
                      <div className="notif-item-msg">{n.message}</div>
                      <div className="notif-item-time">
                        <i className="bi bi-clock"></i>
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>

                    {!n.isRead && <span className="notif-unread-dot" aria-label="Unread" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};