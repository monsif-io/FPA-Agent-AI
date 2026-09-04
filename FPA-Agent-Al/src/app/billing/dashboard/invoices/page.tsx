'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '../layout';
import Link from 'next/link';

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  client_id: number;
  client_name: string;
  client_abbreviation: string;
  client_email?: string;
  reference_text: string;
  subtotal_ht: number;
  tva_rate: number;
  tva_amount: number;
  disbursements: number;
  total_ttc: number;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'cancelled' | 'overdue';
  pdf_path: string;
  sent_method: string;
  collections_client_id?: number | null;
  document_type?: string;
  salutation?: string;
  client_ice?: string;
  service_date_text?: string;
  items?: {
    description: string;
    detail: string;
    total_ht: number;
  }[];
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<Invoice | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [transferring, setTransferring] = useState<number | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewTab, setPreviewTab] = useState<'pdf' | 'summary'>('pdf');
  const [pdfLoading, setPdfLoading] = useState(true);

  const { showToast } = useToast();
  const fetchedRef = useRef(false);

  const handleOpenPreview = (invoice: Invoice, tab: 'pdf' | 'summary' = 'pdf') => {
    setPreviewInvoice(invoice);
    setPreviewTab(tab);
    setPdfLoading(true);
    if (!invoiceDetails || invoiceDetails.id !== invoice.id) {
      fetchInvoiceDetails(invoice.id);
    }
  };

  const handleClosePreview = () => {
    setPreviewInvoice(null);
  };

  const handlePrintIframe = () => {
    const frame = document.getElementById('preview-pdf-iframe') as HTMLIFrameElement;
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch {
        if (previewInvoice) {
          window.open(`/api/billing/invoices/${previewInvoice.id}/pdf`, '_blank');
        }
      }
    } else if (previewInvoice) {
      window.open(`/api/billing/invoices/${previewInvoice.id}/pdf`, '_blank');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewInvoice(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/invoices`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch {
      showToast('Erreur lors du chargement des factures', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const fetchInvoiceDetails = async (id: number) => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/billing/invoices/${id}`);
      if (res.ok) {
        const data = await res.json();
        setInvoiceDetails(data.invoice);
      }
    } catch {
      showToast('Erreur lors du chargement des détails', 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleSelectInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    fetchInvoiceDetails(invoice.id);
  };

  const handleDownloadPdf = async (id: number) => {
    try {
      // 1. Generate PDF on server
      const res = await fetch(`/api/billing/invoices/${id}/pdf`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        // 2. Open PDF in a new tab or trigger download
        window.open(`/api/billing/invoices/${id}/pdf`, '_blank');
        showToast('PDF généré avec succès', 'success');
        fetchInvoices(); // Update status/pdf_path if changed
      } else {
        showToast('Erreur lors de la génération du PDF', 'error');
      }
    } catch {
      showToast('Erreur technique lors de la génération', 'error');
    }
  };

  const handleSendEmail = async (id: number) => {
    if (!confirm('Voulez-vous envoyer cette facture par e-mail au client ?')) return;
    setSendingEmail(id);
    try {
      const res = await fetch(`/api/billing/invoices/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('Facture envoyée avec succès par e-mail', 'success');
        fetchInvoices();
        if (selectedInvoice && selectedInvoice.id === id) {
          fetchInvoiceDetails(id);
        }
      } else {
        showToast(data.error || 'Erreur lors de l\'envoi de l\'e-mail', 'error');
      }
    } catch {
      showToast('Erreur technique lors de l\'envoi', 'error');
    } finally {
      setSendingEmail(null);
    }
  };

  const handleTransferToCollections = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir transférer ce client au système de Recouvrement (Collections) ?')) return;
    setTransferring(id);
    try {
      const res = await fetch(`/api/billing/clients/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Client transféré au recouvrement avec succès !', 'success');
        fetchInvoices();
        if (selectedInvoice && selectedInvoice.id === id) {
          fetchInvoiceDetails(id);
        }
      } else {
        showToast(data.error || 'Erreur lors du transfert', 'error');
      }
    } catch {
      showToast('Erreur technique lors du transfert', 'error');
    } finally {
      setTransferring(null);
    }
  };

  const handleMarkPaid = async (id: number) => {
    try {
      const res = await fetch(`/api/billing/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid' }),
      });
      if (res.ok) {
        showToast('Facture marquée comme payée !', 'success');
        fetchInvoices();
        if (selectedInvoice && selectedInvoice.id === id) {
          fetchInvoiceDetails(id);
        }
      }
    } catch {
      showToast('Erreur lors du changement de statut', 'error');
    }
  };

  const handleMarkCancelled = async (id: number) => {
    if (!confirm('Voulez-vous vraiment annuler cette facture ?')) return;
    try {
      const res = await fetch(`/api/billing/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) {
        showToast('Facture annulée', 'warning');
        fetchInvoices();
        if (selectedInvoice && selectedInvoice.id === id) {
          fetchInvoiceDetails(id);
        }
      }
    } catch {
      showToast('Erreur lors de l\'annulation', 'error');
    }
  };

  const filteredInvoices = invoices.filter((inv) => {
    const matchesStatus = !statusFilter || inv.status === statusFilter;
    const matchesSearch =
      !search ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
      inv.client_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.client_abbreviation.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const statusLabels: Record<string, string> = {
    draft: 'Brouillon',
    sent: 'Envoyée',
    viewed: 'Consultée',
    paid: 'Payée',
    cancelled: 'Annulée',
    overdue: 'En retard',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="billing-page-header">
        <div>
          <h2>Gestion des Factures</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>Suivez et gérez l'envoi, le téléchargement et le recouvrement de vos factures.</p>
        </div>
        <Link href="/billing/dashboard/new-invoice" className="billing-btn billing-btn-primary">
          <i className="ph ph-file-plus"></i> Nouvelle Facture
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '1rem', background: '#fff', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
          <input
            type="text"
            placeholder="Rechercher par numéro de facture, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '0.6rem 2.5rem 0.6rem 1rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
          />
          <i className="ph ph-magnifying-glass" style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }}></i>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '0.6rem 1rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none', background: '#fff' }}
        >
          <option value="">Tous les statuts</option>
          <option value="draft">Brouillon</option>
          <option value="sent">Envoyée</option>
          <option value="paid">Payée</option>
          <option value="cancelled">Annulée</option>
          <option value="overdue">En retard</option>
        </select>
      </div>

      {/* Two Column Layout: Table + Detail Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedInvoice ? '1.2fr 0.8fr' : '1fr', gap: '1.5rem', transition: 'all 0.3s' }}>
        
        {/* Invoices Table */}
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
              Chargement des factures...
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="billing-empty-state">
              <i className="ph ph-receipt"></i>
              <h3>Aucune facture trouvée</h3>
              <p>Commencez à générer vos factures professionnelles dès maintenant.</p>
              <Link href="/billing/dashboard/new-invoice" className="billing-btn billing-btn-primary">Créer une facture</Link>
            </div>
          ) : (
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Numéro</th>
                  <th>Client</th>
                  <th>Date Émission</th>
                  <th>Montant TTC</th>
                  <th>Statut</th>
                  <th style={{ textAlign: 'right', minWidth: '170px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => handleSelectInvoice(inv)}
                    onDoubleClick={() => handleOpenPreview(inv)}
                    style={{ cursor: 'pointer', background: selectedInvoice?.id === inv.id ? 'var(--gold-50)' : 'transparent' }}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--info)' }}>{inv.invoice_number}</td>
                    <td>{inv.client_name} ({inv.client_abbreviation})</td>
                    <td>{inv.invoice_date}</td>
                    <td className="amount-cell">{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(inv.total_ttc)} MAD</td>
                    <td>
                      <span className={`invoice-status ${inv.status}`}>
                        {statusLabels[inv.status] || inv.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPreview(inv);
                          }}
                          className="invoice-action-chip preview"
                          title="Visualiser la facture (Aperçu direct)"
                        >
                          <i className="ph ph-eye"></i> Aperçu
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadPdf(inv.id);
                          }}
                          className="invoice-action-chip"
                          title="Télécharger le PDF"
                        >
                          <i className="ph ph-download-simple"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Invoice Detail Summary Drawer */}
        {selectedInvoice && (
          <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', padding: '1.5rem', height: 'fit-content', position: 'sticky', top: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--gray-100)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem' }}>Facture {selectedInvoice.invoice_number}</h3>
              <button onClick={() => setSelectedInvoice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)' }}>
                <i className="ph ph-x" style={{ fontSize: '1.2rem' }}></i>
              </button>
            </div>

            {detailsLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-500)' }}>
                <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                Chargement des détails...
              </div>
            ) : invoiceDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Client detail card */}
                <div style={{ background: 'var(--gray-50)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Client</span>
                    <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'var(--gold-light)', color: 'var(--gold-dark)', fontWeight: 600 }}>
                      {invoiceDetails.document_type || "Note d'honoraires"}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--anthracite)' }}>{invoiceDetails.client_name}</div>
                  {invoiceDetails.salutation && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--gray-600)', marginTop: '0.15rem', fontStyle: 'italic' }}>{invoiceDetails.salutation}</div>
                  )}
                  {invoiceDetails.client_ice && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>ICE: {invoiceDetails.client_ice}</div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>Email: {invoiceDetails.client_email}</div>
                  {invoiceDetails.reference_text && (
                    <div style={{ fontSize: '0.82rem', color: 'var(--info)', marginTop: '0.35rem', fontWeight: 500 }}>
                      Réf: {invoiceDetails.reference_text}
                    </div>
                  )}
                  {invoiceDetails.service_date_text && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginTop: '0.2rem' }}>
                      {invoiceDetails.service_date_text}
                    </div>
                  )}
                </div>

                {/* Amount details card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderBottom: '1px solid var(--gray-100)', paddingBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray-500)' }}>Montant HT</span>
                    <span>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(invoiceDetails.subtotal_ht)} MAD</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--gray-500)' }}>TVA ({invoiceDetails.tva_rate}%)</span>
                    <span>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(invoiceDetails.tva_amount)} MAD</span>
                  </div>
                  {invoiceDetails.disbursements > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--gray-500)' }}>Débours</span>
                      <span>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(invoiceDetails.disbursements)} MAD</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.05rem', color: 'var(--gold-dark)', borderTop: '1px solid var(--gray-100)', paddingTop: '0.5rem' }}>
                    <span>Montant TTC</span>
                    <span>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(invoiceDetails.total_ttc)} MAD</span>
                  </div>
                </div>

                {/* Prestations list inside invoice */}
                {invoiceDetails.items && invoiceDetails.items.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Prestations</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {invoiceDetails.items.map((item, index) => (
                        <div key={index} style={{ fontSize: '0.85rem', padding: '0.4rem 0.5rem', background: 'var(--cream)', borderRadius: '4px' }}>
                          <div style={{ fontWeight: 600 }}>{item.description}</div>
                          {item.detail && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.1rem' }}>{item.detail}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Operations actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  
                  {/* Preview Invoice button */}
                  <button
                    onClick={() => handleOpenPreview(invoiceDetails)}
                    className="billing-btn billing-btn-gold"
                    style={{ width: '100%', justifyContent: 'center', boxShadow: '0 4px 14px rgba(197, 160, 61, 0.35)', fontWeight: 700 }}
                  >
                    <i className="ph ph-eye" style={{ fontSize: '1.15rem' }}></i> Visualiser la Facture (Aperçu)
                  </button>

                  {/* Download PDF button */}
                  <button
                    onClick={() => handleDownloadPdf(invoiceDetails.id)}
                    className="billing-btn billing-btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <i className="ph ph-file-pdf" style={{ color: 'var(--danger)' }}></i> Télécharger le PDF
                  </button>

                  {/* Send Email button */}
                  <button
                    onClick={() => handleSendEmail(invoiceDetails.id)}
                    className="billing-btn billing-btn-primary"
                    disabled={sendingEmail === invoiceDetails.id}
                    style={{ width: '100%', justifyContent: 'center', background: 'var(--success)' }}
                  >
                    {sendingEmail === invoiceDetails.id ? (
                      'Envoi en cours...'
                    ) : (
                      <><i className="ph ph-paper-plane-tilt"></i> Envoyer par E-mail</>
                    )}
                  </button>

                  {/* Bridge to Collections Agent button */}
                  {!invoiceDetails.collections_client_id ? (
                    <button
                      onClick={() => handleTransferToCollections(invoiceDetails.id)}
                      className="billing-btn billing-btn-gold"
                      disabled={transferring === invoiceDetails.id}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {transferring === invoiceDetails.id ? (
                        'Transfert...'
                      ) : (
                        <><i className="ph ph-shuffle"></i> Transférer au recouvrement</>
                      )}
                    </button>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--success)', padding: '0.5rem', background: 'var(--success-bg)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center', fontWeight: 500 }}>
                      <i className="ph ph-check-circle"></i> Transféré au recouvrement
                    </div>
                  )}

                  {/* Mark paid button */}
                  {invoiceDetails.status !== 'paid' && (
                    <button
                      onClick={() => handleMarkPaid(invoiceDetails.id)}
                      className="billing-btn billing-btn-secondary"
                      style={{ width: '100%', justifyContent: 'center', borderColor: 'var(--success)', color: 'var(--success)' }}
                    >
                      <i className="ph ph-currency-dollar"></i> Marquer comme Payée
                    </button>
                  )}

                  {/* Cancel button */}
                  {invoiceDetails.status !== 'cancelled' && (
                    <button
                      onClick={() => handleMarkCancelled(invoiceDetails.id)}
                      className="billing-btn"
                      style={{ width: '100%', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--danger)', fontSize: '0.8rem' }}
                    >
                      Annuler la facture
                    </button>
                  )}
                </div>

              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* PROFESSIONAL INVOICE PREVIEW MODAL & VIEWER                               */}
      {/* ========================================================================= */}
      {previewInvoice && (() => {
        const activeInvoice = (invoiceDetails && invoiceDetails.id === previewInvoice.id) ? invoiceDetails : previewInvoice;
        return (
          <div
            className="invoice-modal-backdrop"
            onClick={handleClosePreview}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="invoice-modal-container"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="invoice-modal-header">
                <div className="invoice-modal-header-left">
                  <div className="invoice-modal-header-icon">
                    <i className="ph ph-file-text"></i>
                  </div>
                  <div className="invoice-modal-header-title">
                    <h3>
                      <span>{activeInvoice.document_type || "Note d'honoraires"}</span>
                      <span style={{ color: 'var(--gold-dark)', fontSize: '1.05rem' }}>{activeInvoice.invoice_number}</span>
                      <span className={`invoice-status ${activeInvoice.status}`} style={{ fontSize: '0.72rem', verticalAlign: 'middle' }}>
                        {statusLabels[activeInvoice.status] || activeInvoice.status}
                      </span>
                    </h3>
                    <p>
                      {activeInvoice.client_name} • Émise le {activeInvoice.invoice_date}
                      {activeInvoice.due_date ? ` • Échéance: ${activeInvoice.due_date}` : ''}
                    </p>
                  </div>
                </div>

                {/* View Switcher Tabs */}
                <div className="invoice-modal-tabs">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('pdf')}
                    className={`invoice-modal-tab-btn ${previewTab === 'pdf' ? 'active' : ''}`}
                  >
                    <i className="ph ph-file-pdf"></i> Document PDF Officiel
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('summary')}
                    className={`invoice-modal-tab-btn ${previewTab === 'summary' ? 'active' : ''}`}
                  >
                    <i className="ph ph-squares-four"></i> Synthèse & Données
                  </button>
                </div>

                {/* Header Action Tools */}
                <div className="invoice-modal-actions">
                  <button
                    type="button"
                    onClick={handlePrintIframe}
                    className="invoice-modal-action-btn"
                    title="Imprimer directement"
                  >
                    <i className="ph ph-printer"></i> Imprimer
                  </button>

                  <a
                    href={`/api/billing/invoices/${activeInvoice.id}/pdf`}
                    download={`${activeInvoice.invoice_number}.pdf`}
                    className="invoice-modal-action-btn primary"
                    title="Télécharger le fichier PDF original"
                  >
                    <i className="ph ph-download-simple"></i> Télécharger
                  </a>

                  <a
                    href={`/api/billing/invoices/${activeInvoice.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="invoice-modal-action-btn"
                    title="Ouvrir en plein écran dans un nouvel onglet"
                  >
                    <i className="ph ph-arrow-square-out"></i> Plein écran
                  </a>

                  <button
                    type="button"
                    onClick={handleClosePreview}
                    className="invoice-modal-close-btn"
                    title="Fermer la vue (Échap)"
                  >
                    <i className="ph ph-x"></i>
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="invoice-modal-body">
                {previewTab === 'pdf' ? (
                  <div className="invoice-pdf-frame-wrapper">
                    {pdfLoading && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#ffffff',
                        zIndex: 2,
                        gap: '1rem',
                      }}>
                        <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
                        <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem', fontWeight: 500 }}>
                          Génération et rendu du document certifié FPA...
                        </p>
                      </div>
                    )}
                    <iframe
                      id="preview-pdf-iframe"
                      src={`/api/billing/invoices/${activeInvoice.id}/pdf#toolbar=1&navpanes=0&view=FitH`}
                      className="invoice-pdf-frame"
                      onLoad={() => setPdfLoading(false)}
                      title={`Aperçu PDF de la facture ${activeInvoice.invoice_number}`}
                    />
                  </div>
                ) : (
                  /* Structured Financial & Prestations Breakdown */
                  <div className="invoice-modal-summary-view">
                    <div style={{ maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      
                      {/* Top Identity & Client Card */}
                      <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--gray-100)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                          <div>
                            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gold-dark)', fontWeight: 700 }}>
                              Émetteur
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--anthracite)' }}>
                              FPA Cabinet d'Avocats & Recouvrement
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)', marginTop: '0.2rem' }}>
                              Boulevard d'Anfa, Casablanca • contact@fpa.ma
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--gray-400)', fontWeight: 700 }}>
                              Destinataire (Client)
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--anthracite)' }}>
                              {activeInvoice.client_name}
                            </div>
                            {activeInvoice.salutation && (
                              <div style={{ fontSize: '0.82rem', color: 'var(--gray-600)', fontStyle: 'italic' }}>
                                {activeInvoice.salutation}
                              </div>
                            )}
                            {activeInvoice.client_ice && (
                              <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
                                ICE: {activeInvoice.client_ice}
                              </div>
                            )}
                            {activeInvoice.client_email && (
                              <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
                                {activeInvoice.client_email}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: 'var(--gray-50)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase', display: 'block' }}>Type</span>
                            <strong style={{ fontSize: '0.85rem' }}>{activeInvoice.document_type || "Note d'honoraires"}</strong>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase', display: 'block' }}>Réf. Dossier</span>
                            <strong style={{ fontSize: '0.85rem', color: 'var(--info)' }}>{activeInvoice.reference_text || '—'}</strong>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase', display: 'block' }}>Date d'émission</span>
                            <strong style={{ fontSize: '0.85rem' }}>{activeInvoice.invoice_date}</strong>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--gray-400)', textTransform: 'uppercase', display: 'block' }}>Date d'échéance</span>
                            <strong style={{ fontSize: '0.85rem' }}>{activeInvoice.due_date || 'À réception'}</strong>
                          </div>
                        </div>

                        {activeInvoice.service_date_text && (
                          <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--gray-600)', background: 'var(--cream)', padding: '0.5rem 0.75rem', borderRadius: '4px' }}>
                            <i className="ph ph-calendar-blank" style={{ marginRight: '0.35rem' }}></i>
                            {activeInvoice.service_date_text}
                          </div>
                        )}
                      </div>

                      {/* Prestations Table */}
                      <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--gray-200)', fontWeight: 700, fontSize: '0.95rem' }}>
                          Détail des prestations & honoraires
                        </div>
                        <table className="billing-table" style={{ margin: 0 }}>
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>Précision / Réf.</th>
                              <th style={{ textAlign: 'right' }}>Montant HT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeInvoice.items && activeInvoice.items.length > 0 ? (
                              activeInvoice.items.map((item, idx) => (
                                <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{item.description}</td>
                                <td style={{ color: 'var(--gray-500)', fontSize: '0.82rem' }}>{item.detail || '—'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                  {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(item.total_ht)} MAD
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray-400)', padding: '1.5rem' }}>
                                Honoraires professionnels forfaitaires
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                      {/* Totals Calculation */}
                      <div style={{ padding: '1.25rem 1.5rem', background: 'var(--gray-50)', borderTop: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '280px', fontSize: '0.88rem' }}>
                          <span style={{ color: 'var(--gray-600)' }}>Total Honoraires HT:</span>
                          <strong>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(activeInvoice.subtotal_ht)} MAD</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '280px', fontSize: '0.88rem' }}>
                          <span style={{ color: 'var(--gray-600)' }}>TVA ({activeInvoice.tva_rate}%):</span>
                          <strong>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(activeInvoice.tva_amount)} MAD</strong>
                        </div>
                        {activeInvoice.disbursements > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', width: '280px', fontSize: '0.88rem' }}>
                            <span style={{ color: 'var(--gray-600)' }}>Débours:</span>
                            <strong>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(activeInvoice.disbursements)} MAD</strong>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '280px', fontSize: '1.15rem', fontWeight: 800, color: 'var(--gold-dark)', borderTop: '2px solid var(--gray-300)', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                          <span>Total TTC:</span>
                          <span>{new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(activeInvoice.total_ttc)} MAD</span>
                        </div>
                      </div>
                    </div>

                    {/* Bank & Regulation Info */}
                    <div style={{ background: '#fff', borderRadius: 'var(--radius-md)', border: '1px solid var(--gray-200)', padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Règlement par virement bancaire</span>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--anthracite)', marginTop: '0.2rem' }}>Banque Populaire Casablanca</div>
                        <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--gray-600)' }}>RIB: 123 456 7890123456789012 34</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase' }}>Identifiants fiscaux</span>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', marginTop: '0.2rem' }}>IF: 12345678 • RC: 98765 Casablanca</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)' }}>ICE: 001234567890012</div>
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Footer */}
            <div style={{
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--gray-200)',
              background: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                  Total à régler:
                </span>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--gold-dark)', fontFamily: 'var(--font-heading)' }}>
                  {new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 }).format(activeInvoice.total_ttc)} MAD
                </span>
                <span className={`invoice-status ${activeInvoice.status}`} style={{ fontSize: '0.75rem' }}>
                  {statusLabels[activeInvoice.status] || activeInvoice.status}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => handleSendEmail(activeInvoice.id)}
                  className="billing-btn billing-btn-primary"
                  disabled={sendingEmail === activeInvoice.id}
                  style={{ background: 'var(--success)', padding: '0.5rem 1rem', fontSize: '0.82rem' }}
                >
                  <i className="ph ph-paper-plane-tilt"></i> {sendingEmail === activeInvoice.id ? 'Envoi...' : 'Envoyer par e-mail'}
                </button>
                <a
                  href={`/api/billing/invoices/${activeInvoice.id}/pdf`}
                  download={`${activeInvoice.invoice_number}.pdf`}
                  className="billing-btn billing-btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
                >
                  <i className="ph ph-download-simple"></i> Télécharger PDF
                </a>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="billing-btn billing-btn-secondary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
                >
                  Fermer
                </button>
              </div>
            </div>

          </div>
        </div>
      );
    })()}
    </div>
  );
}
