'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '../layout';
import { numberToWordsFr } from '@/lib/number-to-words-fr';

interface BillingClient {
  id: number;
  name: string;
  abbreviation: string;
  contact_person: string;
  contact_civility?: string;
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
  
  // Invoice Base
  const [clientId, setClientId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [referenceText, setReferenceText] = useState('');
  const [salutation, setSalutation] = useState('');
  
  // Customization & Options
  const [documentType, setDocumentType] = useState<string>("Note d'honoraires");
  const [contactName, setContactName] = useState('Siham OUSAID');
  const [serviceDateText, setServiceDateText] = useState('');
  const [closingText, setClosingText] = useState("Arrêtée la Présente Note d'honoraires à la somme de");
  const [showCoupon, setShowCoupon] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [showBankDetails, setShowBankDetails] = useState(true);
  const [showDebours, setShowDebours] = useState(true);

  // Items & Pricing
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
      if (sets.invoice_default_type) {
        setDocumentType(sets.invoice_default_type);
        if (sets.invoice_default_type === 'Facture') {
          setClosingText(sets.invoice_closing_facture || 'Arrêté la présente facture à la somme de');
        } else {
          setClosingText(sets.invoice_closing || "Arrêtée la Présente Note d'honoraires à la somme de");
        }
      }
      if (sets.company_manager) setContactName(sets.company_manager);
      if (sets.pdf_show_watermark !== undefined) setShowWatermark(sets.pdf_show_watermark !== 'false');
      if (sets.pdf_show_coupon !== undefined) setShowCoupon(sets.pdf_show_coupon !== 'false');
      if (sets.pdf_show_bank !== undefined) setShowBankDetails(sets.pdf_show_bank !== 'false');
      if (sets.pdf_show_debours !== undefined) setShowDebours(sets.pdf_show_debours !== 'false');
      setLoading(false);
    }).catch(() => {
      showToast('Erreur d\'initialisation des données', 'error');
      setLoading(false);
    });
  }, [showToast]);

  // Handle Document Type change
  const handleDocTypeChange = (type: string) => {
    setDocumentType(type);
    if (type === 'Facture') {
      setClosingText(settings.invoice_closing_facture || 'Arrêté la présente facture à la somme de');
    } else {
      setClosingText(settings.invoice_closing || "Arrêtée la Présente Note d'honoraires à la somme de");
    }
  };

  // When client changes, auto-set default salutation
  const handleClientChange = (id: string) => {
    setClientId(id);
    const cl = clients.find(c => String(c.id) === id);
    if (cl && cl.contact_person) {
      const civ = cl.contact_civility === 'Mme' ? 'Madame' : cl.contact_civility === 'M.' ? 'Monsieur' : '';
      setSalutation(`A l'Attention de ${civ} ${cl.contact_person}`.trim());
    } else {
      setSalutation('');
    }
  };

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
          salutation: salutation || 'Cher client',
          subtotal_ht: subtotalHT,
          tva_rate: tvaRate,
          tva_amount: tvaAmount,
          disbursements: Number(disbursements),
          total_ttc: totalTTC,
          amount_in_words: amountInWords,
          payment_terms: paymentTerms,
          // Customization Options
          document_type: documentType,
          closing_text: closingText,
          contact_name: contactName,
          service_date_text: serviceDateText,
          show_coupon: showCoupon ? 1 : 0,
          show_watermark: showWatermark ? 1 : 0,
          show_bank_details: showBankDetails ? 1 : 0,
          show_debours: showDebours ? 1 : 0,
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
          <h2>Créer une Nouvelle Facture / Note d'honoraires</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>
            Personnalisez le type de document, les références contractuelles et les options visuelles du PDF.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* SECTION 1: Document Type & PDF Customization Options */}
        <div className="invoice-form-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--gray-100)', paddingBottom: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Type de Document & Options Visuelles</h3>
            
            {/* Segmented control for Document Type */}
            <div style={{ display: 'flex', background: 'var(--gray-100)', padding: '0.25rem', borderRadius: 'var(--radius-md)', gap: '0.25rem' }}>
              <button
                type="button"
                onClick={() => handleDocTypeChange("Note d'honoraires")}
                style={{
                  padding: '0.35rem 0.85rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: documentType === "Note d'honoraires" ? '#fff' : 'transparent',
                  color: documentType === "Note d'honoraires" ? 'var(--info)' : 'var(--gray-600)',
                  boxShadow: documentType === "Note d'honoraires" ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                Note d'honoraires
              </button>
              <button
                type="button"
                onClick={() => handleDocTypeChange('Facture')}
                style={{
                  padding: '0.35rem 0.85rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: documentType === 'Facture' ? '#fff' : 'transparent',
                  color: documentType === 'Facture' ? 'var(--info)' : 'var(--gray-600)',
                  boxShadow: documentType === 'Facture' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                Facture Standard
              </button>
            </div>
          </div>

          {/* Toggle Switches for PDF Elements */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', background: 'var(--gray-50)', padding: '0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showCoupon} 
                onChange={(e) => setShowCoupon(e.target.checked)} 
                style={{ width: '16px', height: '16px', accentColor: 'var(--info)' }}
              />
              <span>Coupon règlement détachable</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showWatermark} 
                onChange={(e) => setShowWatermark(e.target.checked)} 
                style={{ width: '16px', height: '16px', accentColor: 'var(--info)' }}
              />
              <span>Filigrane FPA (Watermark)</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showBankDetails} 
                onChange={(e) => setShowBankDetails(e.target.checked)} 
                style={{ width: '16px', height: '16px', accentColor: 'var(--info)' }}
              />
              <span>Coordonnées bancaires</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={showDebours} 
                onChange={(e) => setShowDebours(e.target.checked)} 
                style={{ width: '16px', height: '16px', accentColor: 'var(--info)' }}
              />
              <span>Ligne Débours</span>
            </label>

          </div>
        </div>

        {/* SECTION 2: Client & Contractual Metadata */}
        <div className="invoice-form-section">
          <h3>Informations Générales & Références</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Client Facturation *</label>
              <select
                required
                value={clientId}
                onChange={(e) => handleClientChange(e.target.value)}
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
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Votre Contact FPA (Émetteur)</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ex: Siham OUSAID"
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>

          </div>

          {/* Reference with quick presets */}
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>Référence / Marché Contractuel (Réf. :)</label>
              
              {/* Presets */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', alignSelf: 'center' }}>Modèles rapides:</span>
                <button 
                  type="button" 
                  onClick={() => setReferenceText('Notre Marché n° 03/2025/CMR et Votre Ordre de service du 15 Juillet 2025')}
                  style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', borderRadius: '4px', fontSize: '0.72rem', padding: '0.15rem 0.4rem', cursor: 'pointer' }}
                >
                  Marché Public & O.S.
                </button>
                <button 
                  type="button" 
                  onClick={() => setReferenceText('Notre Contrat de services du 10 Février 2025')}
                  style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', borderRadius: '4px', fontSize: '0.72rem', padding: '0.15rem 0.4rem', cursor: 'pointer' }}
                >
                  Contrat de services
                </button>
                <button 
                  type="button" 
                  onClick={() => setReferenceText('Notre Lettre de mission du 14 Février 2023')}
                  style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', borderRadius: '4px', fontSize: '0.72rem', padding: '0.15rem 0.4rem', cursor: 'pointer' }}
                >
                  Lettre de mission
                </button>
                <button 
                  type="button" 
                  onClick={() => setReferenceText('Bon de commande n° BC-2026/899')}
                  style={{ background: 'var(--gray-100)', border: '1px solid var(--gray-200)', borderRadius: '4px', fontSize: '0.72rem', padding: '0.15rem 0.4rem', cursor: 'pointer' }}
                >
                  Bon de commande
                </button>
              </div>
            </div>

            <input
              type="text"
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder="Ex: Notre Marché n° 03/2025/CMR ou Notre Contrat de services du 10 Février 2025"
              style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Ligne d'Attention Destinataire</label>
              <input
                type="text"
                value={salutation}
                onChange={(e) => setSalutation(e.target.value)}
                placeholder="Ex: A l'Attention de Monsieur Lotfi BOUJENDAR"
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Date Spécifique de Finalisation (Optionnel)</label>
              <input
                type="text"
                value={serviceDateText}
                onChange={(e) => setServiceDateText(e.target.value)}
                placeholder="Ex: Date de finalisation des prestations:   Le 19 Juin 2025"
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
              />
            </div>
          </div>

        </div>

        {/* SECTION 3: Invoice Items Table */}
        <div className="invoice-form-section">
          <h3>Prestations & Honoraires</h3>
          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table className="invoice-items-table">
              <thead>
                <tr>
                  <th style={{ width: '42%' }}>Description de la Prestation</th>
                  <th style={{ width: '28%' }}>Détails additionnels (Milestone, dates)</th>
                  <th style={{ width: '8%' }}>Qté</th>
                  <th style={{ width: '10%' }}>Unité</th>
                  <th style={{ width: '12%' }}>Prix unitaire HT</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Total HT</th>
                  <th style={{ width: '40px' }}></th>
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
                        placeholder="Ex: Remise et réception de l'ensemble des livrables - 100%"
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

        {/* SECTION 4: Summary Totals & Final Settings */}
        <div className="invoice-form-section" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2rem' }}>
          
          {/* Left Block: Summary Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>TVA applicable (%)</label>
                <input
                  type="number"
                  value={tvaRate}
                  onChange={(e) => setTvaRate(Number(e.target.value))}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Frais déboursés (Débours / MAD)</label>
                <input
                  type="number"
                  value={disbursements || ''}
                  onChange={(e) => setDisbursements(Number(e.target.value))}
                  placeholder="0"
                  style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Phrase d'Arrêté Personnalisée</label>
              <input
                type="text"
                value={closingText}
                onChange={(e) => setClosingText(e.target.value)}
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

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Méthode de Règlement</label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
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
            {(disbursements > 0 || showDebours) && (
              <div className="invoice-total-row" style={{ width: '100%' }}>
                <span style={{ color: 'var(--gray-500)' }}>Débours</span>
                <span style={{ fontWeight: 600 }}>{disbursements > 0 ? new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(disbursements) : '-'} MAD</span>
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
            style={{ minWidth: '200px', justifyContent: 'center' }}
          >
            {submitting ? 'Création en cours...' : `Créer ${documentType}`}
          </button>
        </div>

      </form>
    </div>
  );
}
