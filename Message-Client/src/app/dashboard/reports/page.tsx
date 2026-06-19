'use client';

import { useEffect, useState, useRef } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend, Filler);

export default function ReportsPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [statusDist, setStatusDist] = useState<{ status: string; count: number }[]>([]);
  const [escalationDist, setEscalationDist] = useState<{ escalation_level: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch('/api/stats').then((r) => r.json()).then((data) => {
      setStats(data.stats || {});
      setStatusDist(data.statusDist || []);
      setEscalationDist(data.escalationDist || []);
      setLoading(false);
    });
  }, []);

  const formatMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
  const statusLabels: Record<string, string> = { pending: 'En attente', partial: 'Partiel', paid: 'Payé', disputed: 'Litige', suspended: 'Suspendu' };
  const statusColors: Record<string, string> = { pending: '#F39C12', partial: '#3498DB', paid: '#2ECC71', disputed: '#E74C3C', suspended: '#9CA3AF' };
  const escalationLabels: Record<string, string> = { friendly: 'Amical', formal: 'Formel', urgent: 'Urgent', final: 'Final' };

  if (loading) return <div className="page-loading"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Rapports & Analyses</h2>
          <p className="page-subtitle">Vue d&apos;ensemble du recouvrement</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-card-header"><div className="stat-card-icon gold"><i className="ph ph-users-three"></i></div></div><div className="stat-card-value">{stats.totalClients || 0}</div><div className="stat-card-label">Total clients</div></div>
        <div className="stat-card"><div className="stat-card-header"><div className="stat-card-icon warning"><i className="ph ph-currency-circle-dollar"></i></div></div><div className="stat-card-value">{formatMoney(stats.totalDebt || 0)}</div><div className="stat-card-label">Créances (MAD)</div></div>
        <div className="stat-card"><div className="stat-card-header"><div className="stat-card-icon info"><i className="ph ph-paper-plane-tilt"></i></div></div><div className="stat-card-value">{stats.messagesSentMonth || 0}</div><div className="stat-card-label">Messages (30j)</div></div>
        <div className="stat-card"><div className="stat-card-header"><div className="stat-card-icon success"><i className="ph ph-percent"></i></div></div><div className="stat-card-value">{stats.responseRate || 0}%</div><div className="stat-card-label">Taux de recouvrement</div></div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><h3 className="card-title">Répartition par statut</h3></div>
          <div className="chart-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {statusDist.length > 0 ? (
              <Doughnut data={{
                labels: statusDist.map((d) => statusLabels[d.status] || d.status),
                datasets: [{ data: statusDist.map((d) => d.count), backgroundColor: statusDist.map((d) => statusColors[d.status] || '#ccc'), borderWidth: 0 }],
              }} options={{ responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom' } } }} />
            ) : <p className="text-muted">Aucune donnée</p>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3 className="card-title">Escalade des relances</h3></div>
          <div className="chart-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {escalationDist.length > 0 ? (
              <Bar data={{
                labels: escalationDist.map((d) => escalationLabels[d.escalation_level] || d.escalation_level),
                datasets: [{ label: 'Clients', data: escalationDist.map((d) => d.count), backgroundColor: ['#2ECC71', '#F39C12', '#E77E3C', '#E74C3C'], borderRadius: 8 }],
              }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }} />
            ) : <p className="text-muted">Aucune donnée</p>}
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">Résumé détaillé</h3></div>
        <div className="card-body">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr><th>Métrique</th><th style={{ textAlign: 'right' }}>Valeur</th></tr>
              </thead>
              <tbody>
                <tr><td>Total clients</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{stats.totalClients || 0}</td></tr>
                <tr><td>Clients actifs</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{stats.activeClients || 0}</td></tr>
                <tr><td>Messages envoyés aujourd&apos;hui</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{stats.messagesSentToday || 0}</td></tr>
                <tr><td>Messages envoyés cette semaine</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{stats.messagesSentWeek || 0}</td></tr>
                <tr><td>Messages envoyés ce mois</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{stats.messagesSentMonth || 0}</td></tr>
                <tr><td>Clients ayant payé ce mois</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{stats.paidThisMonth || 0}</td></tr>
                <tr><td>Créances totales</td><td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--warning)' }}>{formatMoney(stats.totalDebt || 0)} MAD</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
