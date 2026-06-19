'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useToast } from '../layout';

interface Client {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  amount_due: number;
  currency: string;
  status: string;
  escalation_level: string;
  messages_sent: number;
  last_message_at: string;
  is_active: number;
  created_at: string;
  due_date?: string;
  notes?: string;
  automation_flow_id?: number | null;
  current_flow_step_index?: number;
  flow_started_at?: string | null;
  automation_flow_name?: string | null;
}

interface MessageLog {
  id: number;
  client_id: number;
  template_id: number | null;
  channel: string;
  subject: string;
  body: string;
  status: string;
  error_message: string;
  tracking_id: string;
  opened_at: string | null;
  open_count: number;
  sent_at: string;
}

interface ClientDetailsData {
  client: Client;
  schedule?: {
    frequency: string;
    time_of_day: string;
    is_active: number;
    next_run: string | null;
  };
  messages: MessageLog[];
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [escalationFilter, setEscalationFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  
  // Client creation/edit form modal state
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [form, setForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    amountDue: '',
    currency: 'MAD',
    dueDate: '',
    notes: '',
    frequency: 'weekly',
    automationFlowId: ''
  });
  
  // Client details modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<ClientDetailsData | null>(null);

  const { showToast } = useToast();
  const fetchedRef = useRef(false);

  // Fetch active clients list
  const fetchClients = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), search, status: statusFilter, escalation: escalationFilter });
    const res = await fetch(`/api/clients?${params}`);
    const data = await res.json();
    setClients(data.clients || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, search, statusFilter, escalationFilter]);

  // Fetch automation flows for dropdown list
  const fetchFlows = async () => {
    try {
      const res = await fetch('/api/automation-flows');
      const data = await res.json();
      setFlows(data.flows || []);
    } catch (error) {
      console.error('Error fetching flows:', error);
    }
  };

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchClients();
      fetchFlows();
    }
  }, [fetchClients]);

  useEffect(() => {
    if (fetchedRef.current) {
      const timer = setTimeout(() => fetchClients(), 300);
      return () => clearTimeout(timer);
    }
  }, [search, statusFilter, escalationFilter, page, fetchClients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      amountDue: parseFloat(form.amountDue) || 0,
      automationFlowId: form.automationFlowId ? parseInt(form.automationFlowId) : null
    };
    const url = editClient ? `/api/clients/${editClient.id}` : '/api/clients';
    const method = editClient ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) {
      showToast(editClient ? 'Client modifié avec succès' : 'Client ajouté avec succès');
      setShowModal(false);
      setEditClient(null);
      setForm({ name: '', company: '', email: '', phone: '', amountDue: '', currency: 'MAD', dueDate: '', notes: '', frequency: 'weekly', automationFlowId: '' });
      fetchClients();
    } else {
      showToast('Erreur lors de l\'opération', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) return;
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Client supprimé');
      fetchClients();
    }
  };

  const handleMarkPaid = async (id: number) => {
    const res = await fetch(`/api/clients/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid' }) });
    if (res.ok) {
      showToast('Client marqué comme payé', 'success');
      fetchClients();
    }
  };

  const openEdit = (client: Client) => {
    setEditClient(client);
    setForm({
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      amountDue: String(client.amount_due),
      currency: client.currency,
      dueDate: client.due_date || '',
      notes: client.notes || '',
      frequency: 'weekly',
      automationFlowId: client.automation_flow_id ? String(client.automation_flow_id) : ''
    });
    setShowModal(true);
  };

  const openNew = () => {
    setEditClient(null);
    const defaultFlow = flows.find(f => f.is_default);
    setForm({
      name: '',
      company: '',
      email: '',
      phone: '',
      amountDue: '',
      currency: 'MAD',
      dueDate: '',
      notes: '',
      frequency: 'weekly',
      automationFlowId: defaultFlow ? String(defaultFlow.id) : ''
    });
    setShowModal(true);
  };

  const openDetails = async (client: Client) => {
    setDetailsLoading(true);
    setDetailsData(null);
    setShowDetailsModal(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`);
      if (res.ok) {
        const data = await res.json();
        setDetailsData(data);
      } else {
        showToast('Erreur lors du chargement des détails', 'error');
        setShowDetailsModal(false);
      }
    } catch (err) {
      console.error(err);
      showToast('Erreur de connexion', 'error');
      setShowDetailsModal(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const statusLabels: Record<string, string> = { pending: 'En attente', partial: 'Partiel', paid: 'Payé', disputed: 'Litige', suspended: 'Suspendu' };
  const escalationLabels: Record<string, string> = { friendly: 'Amical', formal: 'Formel', urgent: 'Urgent', final: 'Final' };
  const formatMoney = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Jamais';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Gestion des Clients</h2>
          <p className="page-subtitle">{total} client{total !== 1 ? 's' : ''} au total</p>
        </div>
        <div className="page-actions">
          <Link href="/dashboard/import" className="btn btn-outline">
            <i className="ph ph-upload-simple"></i> Importer
          </Link>
          <button className="btn btn-primary" onClick={openNew}>
            <i className="ph ph-plus"></i> Nouveau client
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="filters-bar">
          <div className="filter-search">
            <i className="ph ph-magnifying-glass filter-search-icon"></i>
            <input type="text" className="form-input" placeholder="Rechercher par nom, email, entreprise..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '2.25rem' }} />
          </div>
          <select className="form-select filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="partial">Partiel</option>
            <option value="paid">Payé</option>
            <option value="disputed">Litige</option>
            <option value="suspended">Suspendu</option>
          </select>
          <select className="form-select filter-select" value={escalationFilter} onChange={(e) => setEscalationFilter(e.target.value)}>
            <option value="">Tous les niveaux</option>
            <option value="friendly">Amical</option>
            <option value="formal">Formel</option>
            <option value="urgent">Urgent</option>
            <option value="final">Final</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="loader"><div className="spinner"></div></div>
        ) : clients.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Séquence active</th>
                  <th style={{ textAlign: 'right' }}>Montant dû</th>
                  <th>Statut</th>
                  <th>Étape actuelle</th>
                  <th style={{ textAlign: 'center' }}>Messages</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const flow = flows.find(f => f.id === client.automation_flow_id);
                  const totalSteps = flow?.steps?.length || 0;
                  const stepIndex = client.current_flow_step_index || 0;
                  
                  return (
                    <tr key={client.id}>
                      <td>
                        <div 
                          style={{ fontWeight: 600, color: 'var(--anthracite)', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => openDetails(client)}
                          title="Voir fiche détaillée"
                        >
                          {client.name}
                        </div>
                        {client.company && <div className="text-xs text-muted">{client.company}</div>}
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 550, color: 'var(--anthracite)' }}>
                          {flow?.name || 'Aucun'}
                        </div>
                        {flow && <div className="text-xs text-muted">Progression: {Math.round((stepIndex / totalSteps) * 100)}%</div>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatMoney(client.amount_due)} {client.currency}
                      </td>
                      <td>
                        <span className={`badge badge-${client.status}`}>
                          <span className="badge-dot"></span>
                          {statusLabels[client.status] || client.status}
                        </span>
                      </td>
                      <td>
                        {flow ? (
                          <span className="badge badge-gold">
                            Étape {stepIndex + 1}/{totalSteps}
                          </span>
                        ) : (
                          <span className={`badge badge-${client.escalation_level}`}>
                            {escalationLabels[client.escalation_level] || client.escalation_level}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>{client.messages_sent}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button className="btn btn-ghost btn-sm btn-icon" title="Détails client" onClick={() => openDetails(client)}>
                            <i className="ph ph-eye"></i>
                          </button>
                          <button className="btn btn-ghost btn-sm btn-icon" title="Modifier" onClick={() => openEdit(client)}>
                            <i className="ph ph-pencil-simple"></i>
                          </button>
                          {client.status !== 'paid' && (
                            <button className="btn btn-ghost btn-sm btn-icon" title="Marquer payé" onClick={() => handleMarkPaid(client.id)} style={{ color: 'var(--success)' }}>
                              <i className="ph ph-check"></i>
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm btn-icon" title="Supprimer" onClick={() => handleDelete(client.id)} style={{ color: 'var(--danger)' }}>
                            <i className="ph ph-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><i className="ph ph-users-three"></i></div>
            <p className="empty-state-title">Aucun client trouvé</p>
            <p className="empty-state-text">Ajoutez votre premier client ou importez depuis Excel</p>
            <button className="btn btn-primary" onClick={openNew}>
              <i className="ph ph-plus"></i> Ajouter un client
            </button>
          </div>
        )}

        {total > 50 && (
          <div className="pagination">
            <span className="pagination-info">Page {page} sur {Math.ceil(total / 50)}</span>
            <div className="pagination-buttons">
              <button className="pagination-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <i className="ph ph-caret-left"></i>
              </button>
              <button className="pagination-btn" disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(page + 1)}>
                <i className="ph ph-caret-right"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Forms Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <i className={`ph ph-${editClient ? 'pencil-simple' : 'plus-circle'}`} style={{ color: 'var(--gold)', marginRight: '0.5rem' }}></i>
                {editClient ? 'Modifier le client' : 'Nouveau client'}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <i className="ph ph-x"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Nom complet *</label>
                    <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: Mohamed Alami" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Entreprise</label>
                    <input className="form-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Ex: Société ABC" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Email *</label>
                    <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="email@exemple.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Téléphone</label>
                    <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+212 600 000 000" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Montant dû</label>
                    <input className="form-input" type="number" value={form.amountDue} onChange={(e) => setForm({ ...form, amountDue: e.target.value })} placeholder="0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Devise</label>
                    <select className="form-select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      <option value="MAD">MAD (Dirham)</option>
                      <option value="EUR">EUR (Euro)</option>
                      <option value="USD">USD (Dollar)</option>
                      <option value="GBP">GBP (Livre)</option>
                    </select>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date d&apos;échéance</label>
                    <input className="form-input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Automation Flow (Séquence)</label>
                    <select className="form-select" value={form.automationFlowId} onChange={(e) => setForm({ ...form, automationFlowId: e.target.value })}>
                      <option value="">Aucun (Relances statiques)</option>
                      {flows.map(f => (
                        <option key={f.id} value={f.id}>{f.name} {f.is_default ? '(Défaut)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes supplémentaires..." rows={3}></textarea>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  <i className="ph ph-check"></i> {editClient ? 'Enregistrer' : 'Ajouter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Client Details popup Modal */}
      {showDetailsModal && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal" style={{ maxWidth: 850, width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="ph ph-user-focus" style={{ color: 'var(--gold)' }}></i>
                Fiche Client & Historique de Relances
              </h3>
              <button className="modal-close" onClick={() => setShowDetailsModal(false)}><i className="ph ph-x"></i></button>
            </div>
            
            {detailsLoading || !detailsData ? (
              <div className="modal-body" style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <div className="spinner"></div>
              </div>
            ) : (
              <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto' }}>
                {/* Left Profile card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{
                    padding: '1.25rem',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    textAlign: 'center'
                  }}>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--gold)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.75rem',
                      fontWeight: 700,
                      margin: '0 auto 0.75rem auto'
                    }}>
                      {detailsData.client.name.charAt(0).toUpperCase()}
                    </div>
                    <h4 style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--anthracite)' }}>{detailsData.client.name}</h4>
                    <p className="text-sm text-muted">{detailsData.client.company || 'Sans Entreprise'}</p>
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                      <span className={`badge badge-${detailsData.client.status}`}>
                        {statusLabels[detailsData.client.status] || detailsData.client.status}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Détails de Créance</h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span className="text-muted">Montant dû:</span>
                      <span style={{ fontWeight: 700, color: 'var(--anthracite)' }}>{formatMoney(detailsData.client.amount_due)} {detailsData.client.currency}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span className="text-muted">Échéance:</span>
                      <span style={{ fontWeight: 600, color: 'var(--anthracite)' }}>{detailsData.client.due_date || 'Non spécifiée'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span className="text-muted">Messages envoyés:</span>
                      <span style={{ fontWeight: 600 }}>{detailsData.client.messages_sent}</span>
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contact & Notes</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
                      <span className="text-muted">Email:</span>
                      <span style={{ color: 'var(--anthracite)', wordBreak: 'break-all' }}>{detailsData.client.email}</span>
                    </div>
                    {detailsData.client.phone && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
                        <span className="text-muted">Téléphone:</span>
                        <span style={{ color: 'var(--anthracite)' }}>{detailsData.client.phone}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
                      <span className="text-muted">Notes:</span>
                      <span style={{ color: 'var(--slate-gray)', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                        {detailsData.client.notes || 'Aucune note.'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Timeline details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Active flow progress */}
                  <div style={{
                    padding: '1.25rem',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--anthracite)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <i className="ph ph-flow-arrow" style={{ color: 'var(--gold)' }}></i>
                      Séquence de Relance Active
                    </h4>

                    {detailsData.client.automation_flow_id ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--gold)' }}>{detailsData.client.automation_flow_name}</span>
                          <span className="text-muted">
                            Étape {Number(detailsData.client.current_flow_step_index || 0) + 1} sur {(detailsData.client as any).automation_flow_steps?.length || 5}
                          </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div style={{
                          width: '100%',
                          height: '8px',
                          backgroundColor: 'var(--border-color)',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          marginBottom: '0.75rem'
                        }}>
                          <div style={{
                            width: `${Math.round(((detailsData.client.current_flow_step_index || 0) / ((detailsData.client as any).automation_flow_steps?.length || 5)) * 100)}%`,
                            height: '100%',
                            backgroundColor: 'var(--gold)',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease'
                          }}></div>
                        </div>

                        <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <span className="text-muted">Enrôlé le: </span>
                            <span style={{ fontWeight: 550, color: 'var(--anthracite)' }}>
                              {detailsData.client.flow_started_at ? new Date(detailsData.client.flow_started_at).toLocaleDateString('fr-FR') : 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted">Prochain envoi: </span>
                            <span style={{ fontWeight: 600, color: 'var(--gold)' }}>
                              {detailsData.schedule?.is_active && detailsData.schedule.next_run ? formatDate(detailsData.schedule.next_run) : 'Suspendu / Terminé'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                        <i className="ph ph-info" style={{ color: 'var(--gold)' }}></i>
                        <span className="text-muted">Ce client suit une planification manuelle standard sans séquence automatique.</span>
                      </div>
                    )}
                  </div>

                  {/* Message History Timeline */}
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--anthracite)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <i className="ph ph-history" style={{ color: 'var(--gold)' }}></i>
                      Historique des messages ({detailsData.messages.length})
                    </h4>

                    {detailsData.messages.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                        <p className="text-xs text-muted">Aucun message envoyé à ce client pour le moment.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                        {detailsData.messages.map((msg) => (
                          <div 
                            key={msg.id} 
                            style={{
                              padding: '0.75rem 1rem',
                              backgroundColor: 'rgba(255,255,255,0.02)',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--slate-gray)', fontWeight: 550 }}>
                                {formatDate(msg.sent_at)}
                              </span>
                              <div style={{ display: 'flex', gap: '0.35rem' }}>
                                <span className={`badge badge-${msg.status}`} style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem' }}>
                                  {msg.status === 'sent' ? 'Envoyé' : msg.status === 'failed' ? 'Échoué' : msg.status}
                                </span>
                                <span className="badge badge-gold" style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
                                  <i className={`ph ph-${msg.channel === 'email' ? 'envelope' : 'telegram-logo'}`}></i>
                                  {msg.channel}
                                </span>
                              </div>
                            </div>
                            
                            <h5 style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--anthracite)', marginBottom: '0.15rem' }}>
                              {msg.subject}
                            </h5>
                            
                            {msg.channel === 'email' && msg.status === 'sent' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--slate-gray)' }}>
                                <i className="ph ph-envelope-open" style={{ color: msg.opened_at ? 'var(--success)' : 'var(--slate-gray)' }}></i>
                                {msg.opened_at ? (
                                  <span style={{ color: 'var(--success)', fontWeight: 550 }}>
                                    Ouvert {msg.open_count}x · Le {new Date(msg.opened_at).toLocaleDateString('fr-FR')} à {new Date(msg.opened_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                ) : (
                                  <span>Non ouvert</span>
                                )}
                              </div>
                            )}

                            {msg.error_message && (
                              <p className="text-xs" style={{ color: 'var(--danger)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                                Erreur: {msg.error_message}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <button type="button" className="btn btn-outline" onClick={() => setShowDetailsModal(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
