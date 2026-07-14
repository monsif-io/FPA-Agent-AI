'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '../layout';

interface BillingClient {
  id: number;
  name: string;
  abbreviation: string;
  contact_person: string;
  contact_civility: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  ice: string;
  rc: string;
  if_number: string;
  notes: string;
  is_active: number;
}

export default function BillingClientsPage() {
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editClient, setEditClient] = useState<BillingClient | null>(null);
  
  const [form, setForm] = useState({
    name: '',
    abbreviation: '',
    contact_person: '',
    contact_civility: 'M.',
    email: '',
    phone: '',
    address: '',
    city: 'Casablanca',
    country: 'Maroc',
    ice: '',
    rc: '',
    if_number: '',
    notes: '',
  });

  const { showToast } = useToast();
  const fetchedRef = useRef(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/clients?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch {
      showToast('Erreur lors du chargement des clients', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, showToast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleOpenAdd = () => {
    setEditClient(null);
    setForm({
      name: '',
      abbreviation: '',
      contact_person: '',
      contact_civility: 'M.',
      email: '',
      phone: '',
      address: '',
      city: 'Casablanca',
      country: 'Maroc',
      ice: '',
      rc: '',
      if_number: '',
      notes: '',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (client: BillingClient) => {
    setEditClient(client);
    setForm({
      name: client.name,
      abbreviation: client.abbreviation,
      contact_person: client.contact_person,
      contact_civility: client.contact_civility,
      email: client.email,
      phone: client.phone,
      address: client.address,
      city: client.city,
      country: client.country,
      ice: client.ice,
      rc: client.rc,
      if_number: client.if_number,
      notes: client.notes,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      showToast('Le nom et l\'email sont requis', 'warning');
      return;
    }

    try {
      const url = editClient ? `/api/billing/clients/${editClient.id}` : '/api/billing/clients';
      const method = editClient ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        showToast(editClient ? 'Client mis à jour' : 'Client créé avec succès', 'success');
        setShowModal(false);
        fetchClients();
      } else {
        const err = await res.json();
        showToast(err.error || 'Une erreur est survenue', 'error');
      }
    } catch {
      showToast('Erreur lors de l\'enregistrement', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ? Toutes ses factures associées seront également supprimées.')) {
      return;
    }

    try {
      const res = await fetch(`/api/billing/clients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Client supprimé avec succès', 'success');
        fetchClients();
      } else {
        showToast('Erreur lors de la suppression', 'error');
      }
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="billing-page-header">
        <div>
          <h2>Gestion des Clients Facturation</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>Gérez les coordonnées et informations fiscales de vos clients.</p>
        </div>
        <button onClick={handleOpenAdd} className="billing-btn billing-btn-primary">
          <i className="ph ph-plus"></i> Nouveau Client
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '1rem', background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="Rechercher par nom, abréviation, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 1rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
          />
          <i className="ph ph-magnifying-glass" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }}></i>
        </div>
      </div>

      {/* Clients Table */}
      <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
            Chargement des clients...
          </div>
        ) : clients.length === 0 ? (
          <div className="billing-empty-state">
            <i className="ph ph-users-three"></i>
            <h3>Aucun client trouvé</h3>
            <p>Commencez par ajouter un nouveau client de facturation.</p>
            <button onClick={handleOpenAdd} className="billing-btn billing-btn-primary">Ajouter un client</button>
          </div>
        ) : (
          <table className="billing-table">
            <thead>
              <tr>
                <th>Nom du Client</th>
                <th>Abréviation</th>
                <th>Contact</th>
                <th>Email</th>
                <th>ICE / RC</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td><span style={{ background: 'var(--gold-100)', color: 'var(--gold-dark)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{c.abbreviation || '-'}</span></td>
                  <td>{c.contact_civility} {c.contact_person || '-'}</td>
                  <td>{c.email}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>
                    {c.ice && <div>ICE: {c.ice}</div>}
                    {c.rc && <div>RC: {c.rc}</div>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleOpenEdit(c)} className="invoice-action-btn" title="Modifier">
                        <i className="ph ph-pencil-simple"></i>
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="invoice-action-btn" title="Supprimer" style={{ color: 'var(--danger)' }}>
                        <i className="ph ph-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '650px', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--anthracite)' }}>
                {editClient ? 'Modifier le Client' : 'Nouveau Client'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--gray-400)' }}>
                <i className="ph ph-x"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Nom Complet de l'Entreprise *</label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: CAISSE MAROCAINE DES RETRAITES"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Abréviation / Code</label>
                  <input
                    type="text"
                    value={form.abbreviation}
                    onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
                    placeholder="Ex: CMR"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Email de Facturation *</label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Ex: contact@client.ma"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Civilité Contact</label>
                  <select
                    value={form.contact_civility}
                    onChange={(e) => setForm({ ...form, contact_civility: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  >
                    <option value="M.">Monsieur (M.)</option>
                    <option value="Mme">Madame (Mme)</option>
                    <option value="Mlle">Mademoiselle (Mlle)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Nom du Responsable</label>
                  <input
                    type="text"
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    placeholder="Ex: Lotfi BOUJENDAR"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Adresse Facturation</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Ex: Av. El Araar, Hay Riad"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Téléphone</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Ex: +212 600 000000"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Ville / Pays</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="Casablanca"
                      style={{ width: '50%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                    />
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => setForm({ ...form, country: e.target.value })}
                      placeholder="Maroc"
                      style={{ width: '50%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>ICE (Identifiant Commun de l'Entreprise)</label>
                  <input
                    type="text"
                    value={form.ice}
                    onChange={(e) => setForm({ ...form, ice: e.target.value })}
                    placeholder="15 chiffres"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--gray-600)', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>R.C. (Registre de Commerce) / I.F.</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={form.rc}
                      onChange={(e) => setForm({ ...form, rc: e.target.value })}
                      placeholder="RC"
                      style={{ width: '50%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                    />
                    <input
                      type="text"
                      value={form.if_number}
                      onChange={(e) => setForm({ ...form, if_number: e.target.value })}
                      placeholder="IF"
                      style={{ width: '50%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--gray-200)', paddingTop: '1.25rem' }}>
                <button type="button" onClick={() => setShowModal(false)} className="billing-btn billing-btn-secondary">
                  Annuler
                </button>
                <button type="submit" className="billing-btn billing-btn-primary">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
