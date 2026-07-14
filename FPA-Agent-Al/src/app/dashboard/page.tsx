'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

interface Stats {
  totalClients: number;
  activeClients: number;
  totalDebt: number;
  messagesSentToday: number;
  messagesSentWeek: number;
  messagesSentMonth: number;
  paidThisMonth: number;
  responseRate: number;
}

interface ActivityItem {
  id: number;
  client_name: string;
  client_company: string;
  channel: string;
  status: string;
  subject: string;
  sent_at: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [escalationDist, setEscalationDist] = useState<{ escalation_level: string; count: number }[]>([]);
  const [messagesPerDay, setMessagesPerDay] = useState<{ date: string; count: number }[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [topDebtors, setTopDebtors] = useState<Record<string, string | number>[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setEscalationDist(data.escalationDist || []);
        setMessagesPerDay(data.messagesPerDay || []);
        setRecentActivity(data.recentActivity || []);
        setTopDebtors(data.topDebtors || []);
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

  const formatDate = (d: string) => {
    if (!d) return '';
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'À l\'instant';
    if (mins < 60) return `Il y a ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const escalationLabels: Record<string, string> = {
    friendly: 'Amical', formal: 'Formel', urgent: 'Urgent', final: 'Final'
  };

  const escalationColors: Record<string, string> = {
    friendly: '#2ECC71', formal: '#F39C12', urgent: '#E77E3C', final: '#E74C3C'
  };

  // Charts data
  const messagesChartData = {
    labels: messagesPerDay.map((d) => {
      const date = new Date(d.date);
      return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }),
    datasets: [{
      label: 'Messages envoyés',
      data: messagesPerDay.map((d) => d.count),
      borderColor: '#C5A03D',
      backgroundColor: 'rgba(197, 160, 61, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#C5A03D',
    }],
  };

  const escalationChartData = {
    labels: escalationDist.map((d) => escalationLabels[d.escalation_level] || d.escalation_level),
    datasets: [{
      data: escalationDist.map((d) => d.count),
      backgroundColor: escalationDist.map((d) => escalationColors[d.escalation_level] || '#ccc'),
      borderWidth: 0,
      hoverOffset: 8,
    }],
  };

  return (
    <div>
      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon gold">
              <i className="ph ph-users-three"></i>
            </div>
          </div>
          <div className="stat-card-value">{stats?.activeClients || 0}</div>
          <div className="stat-card-label">Clients actifs</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon warning">
              <i className="ph ph-currency-circle-dollar"></i>
            </div>
          </div>
          <div className="stat-card-value">{formatMoney(stats?.totalDebt || 0)}</div>
          <div className="stat-card-label">Créances totales (MAD)</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon info">
              <i className="ph ph-paper-plane-tilt"></i>
            </div>
          </div>
          <div className="stat-card-value">{stats?.messagesSentMonth || 0}</div>
          <div className="stat-card-label">Messages ce mois</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-card-icon success">
              <i className="ph ph-check-circle"></i>
            </div>
          </div>
          <div className="stat-card-value">{stats?.paidThisMonth || 0}</div>
          <div className="stat-card-label">Payés ce mois</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div className="quick-actions">
          <Link href="/dashboard/clients" className="quick-action-btn">
            <i className="ph ph-plus-circle"></i> Ajouter un client
          </Link>
          <Link href="/dashboard/import" className="quick-action-btn">
            <i className="ph ph-upload-simple"></i> Importer Excel
          </Link>
          <Link href="/dashboard/templates" className="quick-action-btn">
            <i className="ph ph-note-pencil"></i> Gérer les templates
          </Link>
          <Link href="/dashboard/settings" className="quick-action-btn">
            <i className="ph ph-gear-six"></i> Paramètres
          </Link>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Messages envoyés (30 jours)</h3>
          </div>
          <div className="chart-wrapper">
            <Line
              data={messagesChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                  y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { stepSize: 1 } },
                },
              }}
            />
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Répartition par escalade</h3>
          </div>
          <div className="chart-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {escalationDist.length > 0 ? (
              <Doughnut
                data={escalationChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: '65%',
                  plugins: {
                    legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } },
                  },
                }}
              />
            ) : (
              <div className="empty-state">
                <p className="text-muted text-sm">Aucune donnée disponible</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="charts-grid">
        {/* Recent Activity */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Activité récente</h3>
            <Link href="/dashboard/messages" className="btn btn-ghost btn-sm">
              Voir tout <i className="ph ph-arrow-right"></i>
            </Link>
          </div>
          <div className="card-body" style={{ padding: '0.5rem 1.5rem' }}>
            {recentActivity.length > 0 ? (
              <ul className="activity-feed">
                {recentActivity.map((item) => (
                  <li key={item.id} className="activity-item">
                    <div className={`activity-icon ${item.status === 'sent' ? 'stat-card-icon success' : 'stat-card-icon'}`} style={{ width: 36, height: 36, fontSize: '0.9rem', background: item.status === 'sent' ? 'var(--success-bg)' : 'var(--danger-bg)', color: item.status === 'sent' ? 'var(--success)' : 'var(--danger)' }}>
                      <i className={`ph ph-${item.status === 'sent' ? 'check' : 'x'}`}></i>
                    </div>
                    <div className="activity-content">
                      <p className="activity-text">
                        Message {item.status === 'sent' ? 'envoyé à' : 'échoué pour'} <strong>{item.client_name}</strong>
                        {item.client_company && ` (${item.client_company})`}
                      </p>
                      <span className="activity-time">{formatDate(item.sent_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="ph ph-clock"></i></div>
                <p className="empty-state-title">Aucune activité</p>
                <p className="empty-state-text">Les messages envoyés apparaîtront ici</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Debtors */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Top 10 créances</h3>
            <Link href="/dashboard/clients" className="btn btn-ghost btn-sm">
              Voir tout <i className="ph ph-arrow-right"></i>
            </Link>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {topDebtors.length > 0 ? (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th style={{ textAlign: 'right' }}>Montant</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDebtors.map((client) => (
                      <tr key={String(client.id)}>
                        <td>
                          <div>
                            <div style={{ fontWeight: 550, color: 'var(--anthracite)' }}>{client.name}</div>
                            <div className="text-xs text-muted">{client.company}</div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(client.amount_due as number)} {client.currency}
                        </td>
                        <td>
                          <span className={`badge badge-${client.escalation_level}`}>
                            <span className="badge-dot"></span>
                            {escalationLabels[client.escalation_level as string] || client.escalation_level}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="ph ph-users-three"></i></div>
                <p className="empty-state-title">Aucun client</p>
                <p className="empty-state-text">Ajoutez des clients pour commencer</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
