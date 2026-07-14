'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Providers from '@/components/Providers';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
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

const navItems = [
  { section: 'Principal', items: [
    { href: '/billing/dashboard', icon: 'chart-pie-slice', label: 'Tableau de bord' },
    { href: '/billing/dashboard/invoices', icon: 'receipt', label: 'Factures' },
    { href: '/billing/dashboard/new-invoice', icon: 'file-plus', label: 'Nouvelle Facture' },
  ]},
  { section: 'Données', items: [
    { href: '/billing/dashboard/clients', icon: 'users-three', label: 'Clients' },
  ]},
  { section: 'Système', items: [
    { href: '/billing/dashboard/settings', icon: 'gear-six', label: 'Paramètres' },
  ]},
];

const pageTitles: Record<string, string> = {
  '/billing/dashboard': 'Tableau de bord',
  '/billing/dashboard/invoices': 'Gestion des Factures',
  '/billing/dashboard/new-invoice': 'Créer une Facture',
  '/billing/dashboard/clients': 'Gestion des Clients Facturation',
  '/billing/dashboard/settings': 'Paramètres de Facturation',
};

function BillingDashboardContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

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

  const currentTitle = pageTitles[pathname] || 'FPA Billing Agent';

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="dashboard-layout">
        {/* Sidebar */}
        <aside className="sidebar billing-sidebar">
          <div className="sidebar-header">
            <Image src="/logo.png" alt="FPA" width={140} height={36} className="sidebar-logo" priority />
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
              Billing Agent Actif
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="main-content">
          <header className="header">
            <div className="header-left">
              <nav className="header-breadcrumb">
                <span className="header-breadcrumb-root">FPA Billing</span>
                <i className="ph ph-caret-right header-breadcrumb-sep"></i>
                <span className="header-breadcrumb-current">{currentTitle}</span>
              </nav>
            </div>
            <div className="header-right">
              <Link href="/select-agent" className="header-btn" title="Changer d'Agent" style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ph ph-shuffle" style={{ fontSize: '1.2rem' }}></i>
              </Link>
              <div className="header-profile" onClick={() => signOut({ callbackUrl: '/login' })}>
                <div className="header-avatar" style={{ background: 'var(--info)' }}>
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

export default function BillingDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <BillingDashboardContent>{children}</BillingDashboardContent>
    </Providers>
  );
}
