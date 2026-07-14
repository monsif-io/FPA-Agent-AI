'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

interface Stats {
  totalInvoices: number;
  totalTTC: number;
  sentThisMonth: number;
  totalClients: number;
}

interface MonthlyData {
  month: string;
  count: number;
  total: number;
}

interface StatusDist {
  status: string;
  count: number;
}

interface InvoiceItem {
  id: number;
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  abbreviation: string;
  total_ttc: number;
  status: string;
}

interface TopClient {
  name: string;
  abbreviation: string;
  invoice_count: number;
  total_revenue: number;
}

export default function BillingDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [monthlyInvoices, setMonthlyInvoices] = useState<MonthlyData[]>([]);
  const [statusDist, setStatusDist] = useState<StatusDist[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<InvoiceItem[]>([]);
  const [topClients, setTopClients] = useState<TopClient[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch('/api/billing/stats')
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setMonthlyInvoices(data.invoicesPerMonth || []);
        setStatusDist(data.statusDist || []);
        setRecentInvoices(data.recentInvoices || []);
        setTopClients(data.topClients || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
        <p className="page-loading-text">Chargement du tableau de bord...</p>
      </div>
    );
  }

  const formatMoney = (n: number) => {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n);
  };

  const statusLabels: Record<string, string> = {
    draft: 'Brouillon',
    sent: 'Envoyée',
    viewed: 'Consultée',
    paid: 'Payée',
    cancelled: 'Annulée',
    overdue: 'En retard',
  };

  const statusColors: Record<string, string> = {
    draft: '#9CA3AF',
    sent: '#3498DB',
    viewed: '#F39C12',
    paid: '#2ECC71',
    cancelled: '#D1D5DB',
    overdue: '#E74C3C',
  };

  // Monthly revenue chart
  const revenueChartData = {
    labels: monthlyInvoices.map((d) => {
      const [year, month] = d.month.split('-');
      const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
      return `${months[parseInt(month, 10) - 1]} ${year}`;
    }),
    datasets: [{
      label: 'Volume Facturé (MAD)',
      data: monthlyInvoices.map((d) => d.total),
      backgroundColor: 'rgba(52, 152, 219, 0.8)',
      borderColor: '#3498DB',
      borderWidth: 1,
      borderRadius: 4,
    }],
  };

  // Status distribution chart
  const statusChartData = {
    labels: statusDist.map((d) => statusLabels[d.status] || d.status),
    datasets: [{
      data: statusDist.map((d) => d.count),
      backgroundColor: statusDist.map((d) => statusColors[d.status] || '#9CA3AF'),
      borderWidth: 1,
    }],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Page Header */}
      <div className="billing-page-header">
        <div>
          <h2>Aperçu Billing Agent</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>Gérez vos factures et suivez la facturation en temps réel.</p>
        </div>
        <Link href="/billing/dashboard/new-invoice" className="billing-btn billing-btn-primary">
          <i className="ph ph-file-plus"></i> Nouvelle Facture
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="billing-stats-grid">
        <div className="billing-stat-card">
          <div className="stat-icon blue">
            <i className="ph ph-receipt"></i>
          </div>
          <div className="stat-value">{stats?.totalInvoices || 0}</div>
          <div className="stat-label">Nombre de Factures</div>
        </div>

        <div className="billing-stat-card">
          <div className="stat-icon gold">
            <i className="ph ph-wallet"></i>
          </div>
          <div className="stat-value">{formatMoney(stats?.totalTTC || 0)} MAD</div>
          <div className="stat-label">Total TTC Facturé</div>
        </div>

        <div className="billing-stat-card">
          <div className="stat-icon green">
            <i className="ph ph-paper-plane-tilt"></i>
          </div>
          <div className="stat-value">{stats?.sentThisMonth || 0}</div>
          <div className="stat-label">Factures envoyées ce mois</div>
        </div>

        <div className="billing-stat-card">
          <div className="stat-icon orange">
            <i className="ph ph-users-three"></i>
          </div>
          <div className="stat-value">{stats?.totalClients || 0}</div>
          <div className="stat-label">Clients Actifs</div>
        </div>
      </div>

      {/* Charts section */}
      <div className="billing-two-col">
        <div className="billing-chart-card">
          <h3>Volume de Facturation Mensuel (TTC)</h3>
          <div style={{ height: '240px', position: 'relative' }}>
            {monthlyInvoices.length > 0 ? (
              <Bar 
                data={revenueChartData} 
                options={{ 
                  responsive: true, 
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } }
                }} 
              />
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                Aucune donnée facturée
              </div>
            )}
          </div>
        </div>

        <div className="billing-chart-card">
          <h3>Répartition par Statut</h3>
          <div style={{ height: '240px', position: 'relative', display: 'flex', justifyContent: 'center' }}>
            {statusDist.length > 0 ? (
              <div style={{ width: '200px' }}>
                <Doughnut 
                  data={statusChartData} 
                  options={{ 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } }
                  }} 
                />
              </div>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
                Aucune facture enregistrée
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent invoices & Top clients */}
      <div className="billing-two-col">
        <div className="billing-recent-card">
          <div className="billing-recent-header">
            <h3>Dernières Factures</h3>
            <Link href="/billing/dashboard/invoices" className="billing-recent-link">Voir tout</Link>
          </div>
          {recentInvoices.length === 0 ? (
            <div className="billing-empty-state" style={{ padding: '2rem 1rem' }}>
              <p>Aucune facture créée.</p>
            </div>
          ) : (
            <table className="billing-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Montant TTC</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link href={`/billing/dashboard/invoices?id=${inv.id}`} style={{ fontWeight: 600, color: 'var(--info)' }}>
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td>{inv.client_name} ({inv.abbreviation})</td>
                    <td>{inv.invoice_date}</td>
                    <td className="amount-cell">{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(inv.total_ttc)} MAD</td>
                    <td>
                      <span className={`invoice-status ${inv.status}`}>
                        {statusLabels[inv.status] || inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="billing-recent-card">
          <div className="billing-recent-header">
            <h3>Meilleurs Clients (Revenus)</h3>
            <Link href="/billing/dashboard/clients" className="billing-recent-link">Gérer</Link>
          </div>
          {topClients.length === 0 ? (
            <div className="billing-empty-state" style={{ padding: '2rem 1rem' }}>
              <p>Aucun client enregistré.</p>
            </div>
          ) : (
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Nombre de Factures</th>
                  <th>Volume Total</th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((client, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 500 }}>{client.name} ({client.abbreviation})</td>
                    <td>{client.invoice_count}</td>
                    <td className="amount-cell" style={{ color: 'var(--success)', fontWeight: 600 }}>
                      {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(client.total_revenue)} MAD
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
