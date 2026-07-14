'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Providers from '@/components/Providers';

// Toast Context
interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  client_id: number | null;
  client_name: string | null;
  client_email: string | null;
  is_read: number;
  created_at: string;
}

const ToastContext = createContext<{
  showToast: (message: string, type?: ToastItem['type']) => void;
}>({ showToast: () => {} });

export const useToast = () => useContext(ToastContext);

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: number) => void }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <i className={`ph ph-${t.type === 'success' ? 'check-circle' : t.type === 'error' ? 'x-circle' : t.type === 'warning' ? 'warning' : 'info'}`}></i>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => onRemove(t.id)}>
            <i className="ph ph-x"></i>
          </button>
        </div>
      ))}
    </div>
  );
}

function NotificationDropdown({ 
  notifications, 
  unreadCount, 
  isOpen, 
  onClose, 
  onMarkRead, 
  onMarkAllRead 
}: { 
  notifications: NotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  onClose: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr + 'Z');
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'À l\'instant';
    if (mins < 60) return `Il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const typeIcons: Record<string, string> = {
    reply: 'envelope-open',
    alert: 'warning-circle',
    info: 'info',
    warning: 'warning',
    success: 'check-circle',
  };

  return (
    <div className="notification-dropdown" ref={dropdownRef}>
      <div className="notification-dropdown-header">
        <h3>Notifications</h3>
        {unreadCount > 0 && (
          <button className="notification-mark-all" onClick={onMarkAllRead}>
            Tout marquer lu
          </button>
        )}
      </div>
      <div className="notification-dropdown-list">
        {notifications.length === 0 ? (
          <div className="notification-empty">
            <i className="ph ph-bell-slash"></i>
            <p>Aucune notification</p>
          </div>
        ) : (
          notifications.slice(0, 10).map((n) => (
            <div 
              key={n.id} 
              className={`notification-item ${n.is_read ? '' : 'unread'}`}
              onClick={() => { if (!n.is_read) onMarkRead(n.id); }}
            >
              <div className={`notification-icon ${n.type}`}>
                <i className={`ph ph-${typeIcons[n.type] || 'bell'}`}></i>
              </div>
              <div className="notification-content">
                <p className="notification-title">{n.title}</p>
                {n.client_name && (
                  <p className="notification-client">{n.client_name}</p>
                )}
                <p className="notification-time">{formatTime(n.created_at)}</p>
              </div>
              {!n.is_read && <div className="notification-dot"></div>}
            </div>
          ))
        )}
      </div>
      {notifications.length > 10 && (
        <div className="notification-dropdown-footer">
          <Link href="/dashboard/notifications" onClick={onClose}>
            Voir toutes les notifications
          </Link>
        </div>
      )}
    </div>
  );
}

const navItems = [
  { section: 'Principal', items: [
    { href: '/dashboard', icon: 'chart-pie-slice', label: 'Tableau de bord' },
    { href: '/dashboard/clients', icon: 'users-three', label: 'Clients' },
    { href: '/dashboard/messages', icon: 'envelope-simple', label: 'Messages' },
  ]},
  { section: 'Gestion', items: [
    { href: '/dashboard/templates', icon: 'note-pencil', label: 'Templates' },
    { href: '/dashboard/schedules', icon: 'calendar-dots', label: 'Planification' },
    { href: '/dashboard/import', icon: 'upload-simple', label: 'Importer' },
  ]},
  { section: 'Analyse', items: [
    { href: '/dashboard/reports', icon: 'chart-line-up', label: 'Rapports' },
  ]},
  { section: 'Système', items: [
    { href: '/dashboard/settings', icon: 'gear-six', label: 'Paramètres' },
  ]},
];

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tableau de bord',
  '/dashboard/clients': 'Gestion des Clients',
  '/dashboard/messages': 'Historique des Messages',
  '/dashboard/templates': 'Templates de Messages',
  '/dashboard/schedules': 'Planification des Envois',
  '/dashboard/import': 'Importer des Clients',
  '/dashboard/reports': 'Rapports & Analyses',
  '/dashboard/settings': 'Paramètres',
  '/dashboard/notifications': 'Notifications',
};

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll notifications every 15 seconds
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Auto-poll Telegram for real-time bot responses
  useEffect(() => {
    const pollTelegram = async () => {
      try {
        await fetch('/api/telegram/poll', { method: 'GET' });
      } catch { /* silent */ }
    };
    // Poll every 3 seconds for near-real-time responses
    const telegramInterval = setInterval(pollTelegram, 3000);
    // Initial poll
    pollTelegram();
    return () => clearInterval(telegramInterval);
  }, []);

  const markRead = async (id: number) => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const showToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000000);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (status === 'loading') {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
        <p className="page-loading-text">Chargement...</p>
      </div>
    );
  }

  if (!session) return null;

  const currentTitle = pageTitles[pathname] || 'FPA Collections Agent';

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="dashboard-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <Image src="/logo.png" alt="FPA" width={140} height={36} className="sidebar-logo" />
          </div>
          <nav className="sidebar-nav">
            {navItems.map((section) => (
              <div key={section.section} className="sidebar-section">
                <div className="sidebar-section-title">{section.section}</div>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}
                  >
                    <span className="sidebar-link-icon">
                      <i className={`ph ph-${item.icon}`}></i>
                    </span>
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-agent-status">
              <div className="sidebar-agent-dot"></div>
              Agent AI Actif
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="main-content">
          <header className="header">
            <div className="header-left">
              <nav className="header-breadcrumb">
                <span className="header-breadcrumb-root">FPA Agent</span>
                <i className="ph ph-caret-right header-breadcrumb-sep"></i>
                <span className="header-breadcrumb-current">{currentTitle}</span>
              </nav>
            </div>
            <div className="header-right">
              <Link href="/select-agent" className="header-btn" title="Changer d'Agent" style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ph ph-shuffle" style={{ fontSize: '1.2rem' }}></i>
              </Link>
              <div style={{ position: 'relative' }}>
                <button 
                  className="header-btn" 
                  title="Notifications"
                  onClick={() => setShowNotifications(!showNotifications)}
                  id="notifications-bell"
                >
                  <i className="ph ph-bell"></i>
                  {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  )}
                </button>
                <NotificationDropdown 
                  notifications={notifications}
                  unreadCount={unreadCount}
                  isOpen={showNotifications}
                  onClose={() => setShowNotifications(false)}
                  onMarkRead={markRead}
                  onMarkAllRead={markAllRead}
                />
              </div>
              <div className="header-profile" onClick={() => signOut({ callbackUrl: '/login' })}>
                <div className="header-avatar">
                  {session.user?.name?.charAt(0) || 'A'}
                </div>
                <span className="header-profile-name">{session.user?.name || 'Admin'}</span>
                <i className="ph ph-sign-out" style={{ color: 'var(--gray-400)', marginLeft: '0.25rem' }}></i>
              </div>
            </div>
          </header>
          <main className="page-content">
            {children}
          </main>
        </div>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <DashboardContent>{children}</DashboardContent>
    </Providers>
  );
}
