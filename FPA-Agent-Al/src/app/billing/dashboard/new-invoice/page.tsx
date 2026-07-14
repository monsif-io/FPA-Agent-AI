'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../layout';
import { numberToWordsFr } from '@/lib/number-to-words-fr';

interface BillingClient {
  id: number;
  name: string;
  abbreviation: string;
  contact_person: string;
  email: string;
  address: string;
  ice: string;
}

interface FormItem {
  description: string;
  detail: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_ht: number;
}

export default function NewInvoicePage() {
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clientId, setClientId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [salutation, setSalutation] = useState('Cher client');
  const [items, setItems] = useState<FormItem[]>([
    { description: '', detail: '', quantity: 1, unit: 'forfait', unit_price: 0, total_ht: 0 }
  ]);
  const [tvaRate, setTvaRate] = useState(20);
  const [disbursements, setDisbursements] = useState(0);
  const [amountInWords, setAmountInWords] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Virement bancaire');
  
  // Settings for defaults
  const [settings, setSettings] = useState<Record<string, string>>({});

  const { showToast } = useToast();
  const router = useRouter();

  // Fetch clients & settings
  useEffect(() => {
    Promise.all([
      fetch('/api/billing/clients?active=true').then(r => r.json()),
      fetch('/api/billing/settings').then(r => r.json())
    ]).then(([clientsData, settingsData]) => {
      setClients(clientsData.clients || []);
      const sets = settingsData.settings || {};
      setSettings(sets);
      if (sets.invoice_tva_rate) setTvaRate(Number(sets.invoice_tva_rate));
      if (sets.invoice_salutation) setSalutation(sets.invoice_salutation);
      setLoading(false);
    }).catch(() => {
      showToast('Erreur d\'initialisation des données', 'error');
      setLoading(false);
    });
  }, [showToast]);

  // Recalculate totals
  const subtotalHT = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const tvaAmount = Math.round(subtotalHT * (tvaRate / 100) * 100) / 100;
  const totalTTC = subtotalHT + tvaAmount + Number(disbursements);

  // Update amount in words when total TTC changes
  useEffect(() => {
    if (totalTTC > 0) {
      const text = numberToWordsFr(totalTTC) + ' Dirhams';
      setAmountInWords(text);
    } else {
      setAmountInWords('');
    }
  }, [totalTTC]);

  const handleItemChange = (index: number, field: keyof FormItem, value: any) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        updated.total_ht = Number(updated.quantity) * Number(updated.unit_price);
      }
      return updated;
    }));
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, { description: '', detail: '', quantity: 1, unit: 'forfait', unit_price: 0, total_ht: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      showToast('Veuillez sélectionner un client', 'warning');
      return;
    }
    
    // Check items
    const invalidItem = items.some(item => !item.description || item.unit_price <= 0);
    if (invalidItem) {
      showToast('Veuillez renseigner la description et un prix unitaire valide pour tous les éléments', 'warning');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/billing/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Number(clientId),
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          reference_text: referenceText,
          salutation,
          subtotal_ht: subtotalHT,
          tva_rate: tvaRate,
          tva_amount: tvaAmount,
          disbursements: Number(disbursements),
          total_ttc: totalTTC,
          amount_in_words: amountInWords,
          payment_terms: paymentTerms,
          items
        })
      });

      if (res.ok) {
        showToast('Facture créée avec succès !', 'success');
        router.push('/billing/dashboard/invoices');
      } else {
        const err = await res.json();
        showToast(err.error || 'Erreur lors de la création de la facture', 'error');
      }
    } catch {
      showToast('Erreur technique lors de la soumission', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
        <p className="page-loading-text">Initialisation du formulaire...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="billing-page-header">
        <div>
          <h2>Créer une Nouvelle Facture</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>Générez manuellement une note d'honoraires au format FPA.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* SECTION 1: Client & Date Metadata */}
        <div className="invoice-form-section">
          <h3>Informations Générales</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Client Facturation *</label>
              <select
                required
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none', background: '#fff' }}
              >
                <option value="">-- Sélectionner un client --</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.abbreviation})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Date d'Émission *</label>
              <input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Date d'Échéance (Optionnel)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Référence / Marché contractuel</label>
              <input
                type="text"
                value={referenceText}
                onChange={(e) => setReferenceText(e.target.value)}
                placeholder="Ex: Notre Marché n° 03/2025/CMR"
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Texte d'Introduction (Salutation)</label>
            <input
              type="text"
              value={salutation}
              onChange={(e) => setSalutation(e.target.value)}
              placeholder="Ex: Cher client, Nous vous souhaitons bonne réception..."
              style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
            />
          </div>
        </div>

        {/* SECTION 2: Invoice Items Table */}
        <div className="invoice-form-section">
          <h3>Prestations & Honoraires</h3>
          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table className="invoice-items-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Description de la Prestation</th>
                  <th style={{ width: '30%' }}>Détails additionnels (Milestone, dates)</th>
                  <th style={{ width: '10%' }}>Qté</th>
                  <th style={{ width: '10%' }}>Unité</th>
                  <th style={{ width: '10%' }}>Prix unitaire HT</th>
                  <th style={{ width: '10%', textAlign: 'right' }}>Total HT</th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Mission d'évaluation de la démarche de gestion..."
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <textarea
                        rows={1}
                        placeholder="Ex: Remise et réception des livrables - 100%"
                        value={item.detail}
                        onChange={(e) => handleItemChange(index, 'detail', e.target.value)}
                        style={{ resize: 'vertical' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={item.unit_price || ''}
                        onChange={(e) => handleItemChange(index, 'unit_price', Number(e.target.value))}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.9rem', paddingRight: '1rem' }}>
                      {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(item.total_ht)} MAD
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        disabled={items.length === 1}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', opacity: items.length === 1 ? 0.3 : 1 }}
                      >
                        <i className="ph ph-trash" style={{ fontSize: '1.1rem' }}></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={handleAddItem} className="billing-btn billing-btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
            <i className="ph ph-plus"></i> Ajouter une ligne
          </button>
        </div>

        {/* SECTION 3: Summary Totals & Final Settings */}
        <div className="invoice-form-section" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem' }}>
          
          {/* Left Block: Summary Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>TVA applicable (%)</label>
              <input
                type="number"
                value={tvaRate}
                onChange={(e) => setTvaRate(Number(e.target.value))}
                style={{ width: '120px', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Frais déboursés (Débours / MAD)</label>
              <input
                type="number"
                value={disbursements || ''}
                onChange={(e) => setDisbursements(Number(e.target.value))}
                placeholder="0"
                style={{ width: '150px', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Méthode de Règlement</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Montant en toutes lettres (Automatique)</label>
              <textarea
                rows={2}
                value={amountInWords}
                onChange={(e) => setAmountInWords(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Right Block: Calculation Totals */}
          <div className="invoice-totals" style={{ padding: '1rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', height: 'fit-content' }}>
            <div className="invoice-total-row" style={{ width: '100%' }}>
              <span style={{ color: 'var(--gray-500)' }}>Total Brut (HT)</span>
              <span style={{ fontWeight: 600 }}>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(subtotalHT)} MAD</span>
            </div>
            <div className="invoice-total-row" style={{ width: '100%' }}>
              <span style={{ color: 'var(--gray-500)' }}>Montant TVA ({tvaRate}%)</span>
              <span style={{ fontWeight: 600 }}>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(tvaAmount)} MAD</span>
            </div>
            {disbursements > 0 && (
              <div className="invoice-total-row" style={{ width: '100%' }}>
                <span style={{ color: 'var(--gray-500)' }}>Débours</span>
                <span style={{ fontWeight: 600 }}>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(disbursements)} MAD</span>
              </div>
            )}
            <div className="invoice-total-row grand-total" style={{ width: '100%' }}>
              <span>Total TTC</span>
              <span>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(totalTTC)} MAD</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button
            type="button"
            onClick={() => router.push('/billing/dashboard/invoices')}
            className="billing-btn billing-btn-secondary"
            disabled={submitting}
          >
            Annuler
          </button>
          <button
            type="submit"
            className="billing-btn billing-btn-primary"
            disabled={submitting}
            style={{ minWidth: '180px', justifyContent: 'center' }}
          >
            {submitting ? 'Création de la facture...' : 'Créer la note d\'honoraires'}
          </button>
        </div>

      </form>
    </div>
  );
}
