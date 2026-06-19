'use client';

import { useEffect, useState, useRef } from 'react';
import { useToast } from '../layout';

interface MessageLog {
  id: number; client_id: number; client_name: string; client_company: string; client_email: string;
  channel: string; subject: string; body: string; status: string; error_message: string; sent_at: string;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMessage, setViewMessage] = useState<MessageLog | null>(null);
  const fetchedRef = useRef(false);
  useToast();

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchMessages();
  }, []);

  const fetchMessages = async (p = 1, s = '') => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), status: s });
    const res = await fetch(`/api/messages?${params}`);
    const data = await res.json();
    setMessages(data.messages || []);
    setTotal(data.total || 0);
    setPage(p);
    setLoading(false);
  };

  const statusLabels: Record<string, string> = { sent: 'Envoyé', failed: 'Échoué', pending: 'En attente', cancelled: 'Annulé' };
  const formatDate = (d: string) => d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Historique des Messages</h2>
          <p className="page-subtitle">{total} message{total !== 1 ? 's' : ''} au total</p>
        </div>
      </div>

      <div className="card">
        <div className="filters-bar">
          <select className="form-select filter-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); fetchMessages(1, e.target.value); }}>
            <option value="">Tous les statuts</option>
            <option value="sent">Envoyé</option>
            <option value="failed">Échoué</option>
            <option value="pending">En attente</option>
          </select>
        </div>

        {loading ? (
          <div className="loader"><div className="spinner"></div></div>
        ) : messages.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Sujet</th>
                  <th>Canal</th>
                  <th>Statut</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id}>
                    <td>
                      <div style={{ fontWeight: 550 }}>{msg.client_name || 'N/A'}</div>
                      <div className="text-xs text-muted">{msg.client_email}</div>
                    </td>
                    <td className="text-sm truncate" style={{ maxWidth: 250 }}>{msg.subject}</td>
                    <td>
                      <span className="badge badge-gold">
                        <i className={`ph ph-${msg.channel === 'email' ? 'envelope-simple' : msg.channel === 'telegram' ? 'telegram-logo' : 'robot'}`}></i>
                        {msg.channel}
                      </span>
                    </td>
                    <td><span className={`badge badge-${msg.status}`}><span className="badge-dot"></span>{statusLabels[msg.status] || msg.status}</span></td>
                    <td className="text-sm text-muted">{formatDate(msg.sent_at)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewMessage(msg)}>
                        <i className="ph ph-eye"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><i className="ph ph-envelope-simple"></i></div>
            <p className="empty-state-title">Aucun message</p>
            <p className="empty-state-text">Les messages envoyés apparaîtront ici</p>
          </div>
        )}

        {total > 50 && (
          <div className="pagination">
            <span className="pagination-info">Page {page} sur {Math.ceil(total / 50)}</span>
            <div className="pagination-buttons">
              <button className="pagination-btn" disabled={page <= 1} onClick={() => fetchMessages(page - 1, statusFilter)}><i className="ph ph-caret-left"></i></button>
              <button className="pagination-btn" disabled={page >= Math.ceil(total / 50)} onClick={() => fetchMessages(page + 1, statusFilter)}><i className="ph ph-caret-right"></i></button>
            </div>
          </div>
        )}
      </div>

      {/* Message Detail Modal */}
      {viewMessage && (
        <div className="modal-overlay" onClick={() => setViewMessage(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title"><i className="ph ph-envelope-open" style={{ color: 'var(--gold)', marginRight: '0.5rem' }}></i>Détail du message</h3>
              <button className="modal-close" onClick={() => setViewMessage(null)}><i className="ph ph-x"></i></button>
            </div>
            <div className="modal-body">
              <div className="client-info-row"><span className="client-info-label">Destinataire</span><span className="client-info-value">{viewMessage.client_name} ({viewMessage.client_email})</span></div>
              <div className="client-info-row"><span className="client-info-label">Sujet</span><span className="client-info-value">{viewMessage.subject}</span></div>
              <div className="client-info-row"><span className="client-info-label">Statut</span><span className={`badge badge-${viewMessage.status}`}><span className="badge-dot"></span>{statusLabels[viewMessage.status]}</span></div>
              <div className="client-info-row"><span className="client-info-label">Date</span><span className="client-info-value">{formatDate(viewMessage.sent_at)}</span></div>
              {viewMessage.error_message && (
                <div className="client-info-row"><span className="client-info-label">Erreur</span><span className="client-info-value" style={{ color: 'var(--danger)' }}>{viewMessage.error_message}</span></div>
              )}
              <div style={{ marginTop: '1.25rem' }}>
                <label className="form-label">Contenu du message</label>
                <div className="template-preview">
                  <div className="template-preview-body">{viewMessage.body}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
