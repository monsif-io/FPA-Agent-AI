'use client';

import { useEffect, useState, useRef } from 'react';
import { useToast } from '../layout';

interface ScheduleItem {
  id: number; client_id: number; frequency: string; time_of_day: string; is_active: number;
  next_run: string; client_name: string; client_company: string; client_email: string;
  amount_due: number; currency: string; client_status: string; escalation_level: string;
  template_name: string;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<number | null>(null);
  const { showToast } = useToast();
  const fetchedRef = useRef(false);

  const fetchSchedules = async () => {
    const res = await fetch('/api/schedules');
    const data = await res.json();
    setSchedules(data.schedules || []);
    setLoading(false);
  };

  useEffect(() => { if (!fetchedRef.current) { fetchedRef.current = true; fetchSchedules(); } }, []);

  const updateSchedule = async (id: number, updates: Record<string, unknown>) => {
    await fetch('/api/schedules', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...updates }) });
    showToast('Planification mise à jour', 'success');
    fetchSchedules();
  };

  const handleSendNow = async (schedule: ScheduleItem) => {
    setSending(schedule.id);
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: schedule.client_id }),
      });
      if (res.ok) {
        showToast(`Message envoyé à ${schedule.client_name}`, 'success');
      } else {
        showToast('Erreur lors de l\'envoi', 'error');
      }
    } catch {
      showToast('Erreur de connexion', 'error');
    }
    setSending(null);
  };

  const freqLabels: Record<string, string> = { daily: 'Quotidien', weekly: 'Hebdomadaire', biweekly: 'Bi-mensuel', monthly: 'Mensuel', custom: 'Personnalisé' };
  const escalationLabels: Record<string, string> = { friendly: 'Amical', formal: 'Formel', urgent: 'Urgent', final: 'Final' };
  const formatMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
  const formatDate = (d: string) => d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Non planifié';

  const activeCount = schedules.filter(s => s.is_active).length;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Planification des Envois</h2>
          <p className="page-subtitle">
            {schedules.length} planification{schedules.length !== 1 ? 's' : ''} configurée{schedules.length !== 1 ? 's' : ''} · {activeCount} active{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="loader"><div className="spinner"></div></div>
        </div>
      ) : schedules.length > 0 ? (
        <div className="schedule-cards-grid">
          {schedules.map((s) => (
            <div key={s.id} className={`card schedule-card ${!s.is_active ? 'schedule-card--inactive' : ''}`}>
              {/* Card Header */}
              <div className="schedule-card__header">
                <div className="schedule-card__client">
                  <div className="schedule-card__avatar">
                    {s.client_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="schedule-card__info">
                    <h4 className="schedule-card__name">{s.client_name}</h4>
                    {s.client_company && <span className="schedule-card__company">{s.client_company}</span>}
                  </div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={!!s.is_active} onChange={() => updateSchedule(s.id, { isActive: !s.is_active })} />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              {/* Card Body */}
              <div className="schedule-card__body">
                <div className="schedule-card__detail">
                  <span className="schedule-card__label">
                    <i className="ph ph-currency-circle-dollar"></i> Montant
                  </span>
                  <span className="schedule-card__value schedule-card__value--amount">{formatMoney(s.amount_due)} {s.currency}</span>
                </div>

                <div className="schedule-card__detail">
                  <span className="schedule-card__label">
                    <i className="ph ph-clock"></i> Fréquence
                  </span>
                  <select
                    className="schedule-card__select"
                    value={s.frequency}
                    onChange={(e) => updateSchedule(s.id, { frequency: e.target.value })}
                  >
                    <option value="daily">Quotidien</option>
                    <option value="weekly">Hebdomadaire</option>
                    <option value="biweekly">Bi-mensuel</option>
                    <option value="monthly">Mensuel</option>
                  </select>
                </div>

                <div className="schedule-card__detail">
                  <span className="schedule-card__label">
                    <i className="ph ph-calendar-dots"></i> Prochain envoi
                  </span>
                  <span className="schedule-card__value">{formatDate(s.next_run)}</span>
                </div>

                <div className="schedule-card__detail">
                  <span className="schedule-card__label">
                    <i className="ph ph-warning-diamond"></i> Escalade
                  </span>
                  <span className={`badge badge-${s.escalation_level}`}>
                    {escalationLabels[s.escalation_level] || s.escalation_level}
                  </span>
                </div>

                {s.template_name && (
                  <div className="schedule-card__detail">
                    <span className="schedule-card__label">
                      <i className="ph ph-file-text"></i> Template
                    </span>
                    <span className="schedule-card__value">{s.template_name}</span>
                  </div>
                )}

                <div className="schedule-card__detail">
                  <span className="schedule-card__label">
                    <i className="ph ph-clock-afternoon"></i> Heure
                  </span>
                  <span className="schedule-card__value">{s.time_of_day || '09:00'}</span>
                </div>
              </div>

              {/* Card Footer */}
              <div className="schedule-card__footer">
                <span className={`schedule-card__status ${s.is_active ? 'schedule-card__status--active' : 'schedule-card__status--paused'}`}>
                  <span className="schedule-card__status-dot"></span>
                  {s.is_active ? 'Actif' : 'En pause'}
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSendNow(s)}
                  disabled={sending === s.id || !s.is_active}
                >
                  <i className="ph ph-paper-plane-tilt"></i>
                  {sending === s.id ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><i className="ph ph-calendar-dots"></i></div>
            <p className="empty-state-title">Aucune planification</p>
            <p className="empty-state-text">Les planifications sont créées automatiquement à l&apos;ajout d&apos;un client</p>
          </div>
        </div>
      )}
    </div>
  );
}
