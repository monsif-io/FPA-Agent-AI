'use client';

import { useEffect, useState, useRef } from 'react';
import { useToast } from '../layout';

export default function BillingSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoVersion, setLogoVersion] = useState(Date.now());
  const [activeTab, setActiveTab] = useState('company');
  const { showToast } = useToast();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch('/api/billing/settings')
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [showToast]);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Le fichier doit être une image', 'error');
      return;
    }

    setLogoUploading(true);
    const formData = new FormData();
    formData.append('logo', file);

    try {
      const res = await fetch('/api/billing/settings/logo', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        showToast('Logo mis à jour avec succès', 'success');
        updateSetting('company_logo_path', data.logoPath);
        setLogoVersion(Date.now()); // Force refresh the image preview
      } else {
        const data = await res.json();
        showToast(data.error || 'Erreur lors du téléversement', 'error');
      }
    } catch {
      showToast('Erreur technique lors du téléversement', 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/billing/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        showToast('Paramètres de facturation enregistrés avec succès', 'success');
      } else {
        showToast('Erreur lors de la sauvegarde', 'error');
      }
    } catch {
      showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'company', label: 'Entreprise & Siège', icon: 'buildings' },
    { id: 'bank', label: 'Coordonnées Bancaires', icon: 'bank' },
    { id: 'invoice', label: 'Format & Textes PDF', icon: 'file-text' },
  ];

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
        <p className="page-loading-text">Chargement des paramètres...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <div className="billing-page-header">
        <div>
          <h2>Paramètres de Facturation</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem' }}>Configurez les informations de votre entreprise et le style de vos factures.</p>
        </div>
        <button className="billing-btn billing-btn-primary" onClick={saveSettings} disabled={saving}>
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '1.5rem' }}>
        {/* Left Side Tabs */}
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', padding: '0.5rem', height: 'fit-content' }}>
          <ul className="settings-nav" style={{ listStyle: 'none', padding: 0 }}>
            {tabs.map((tab) => (
              <li
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.8rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                  color: activeTab === tab.id ? 'var(--info)' : 'var(--gray-600)',
                  background: activeTab === tab.id ? 'var(--info-bg)' : 'transparent',
                }}
              >
                <i className={`ph ph-${tab.icon}`} style={{ fontSize: '1.1rem' }}></i>
                {tab.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Right Side Content Form */}
        <div style={{ background: '#fff', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', padding: '2rem' }}>
          {/* TAB 1: Company Settings */}
          {activeTab === 'company' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', borderBottom: '1px solid var(--gray-100)', paddingBottom: '0.5rem' }}>Informations de l'Émetteur</h3>
              
              {/* Logo Upload Section */}
              <div style={{ display: 'flex', gap: '1.5rem', background: 'var(--gray-50)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--gray-200)', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px', background: '#fff', border: '2px dashed var(--gray-300)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {settings.company_logo_path ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img 
                      src={`${settings.company_logo_path}?v=${logoVersion}`} 
                      alt="Logo de l'entreprise" 
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                    />
                  ) : (
                    <i className="ph ph-image" style={{ fontSize: '2.5rem', color: 'var(--gray-400)' }}></i>
                  )}
                  {logoUploading && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div className="spinner" style={{ width: '24px', height: '24px' }}></div>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--anthracite)' }}>Logo officiel de l'entreprise</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', margin: 0 }}>
                    Ce logo apparaîtra en haut à gauche de toutes vos factures PDF.<br />
                    Format recommandé: PNG transparent ou JPEG. Ratio horizontal (ex: 300x80 px).
                  </p>
                  
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.25rem' }}>
                    <label className="billing-btn billing-btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                      <i className="ph ph-upload-simple"></i> Choisir une image
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleLogoUpload} 
                        style={{ display: 'none' }} 
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="billing-settings-group">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Raison Sociale</label>
                  <input
                    type="text"
                    value={settings.company_name || ''}
                    onChange={(e) => updateSetting('company_name', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Adresse du Siège Social</label>
                  <input
                    type="text"
                    value={settings.company_address || ''}
                    onChange={(e) => updateSetting('company_address', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Téléphone de Contact</label>
                  <input
                    type="text"
                    value={settings.company_phone || ''}
                    onChange={(e) => updateSetting('company_phone', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Email Administratif (From)</label>
                  <input
                    type="text"
                    value={settings.company_email || ''}
                    onChange={(e) => updateSetting('company_email', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Site Web de l'Entreprise</label>
                  <input
                    type="text"
                    value={settings.company_website || ''}
                    onChange={(e) => updateSetting('company_website', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>R.C. (Registre Commerce)</label>
                  <input
                    type="text"
                    value={settings.company_rc || ''}
                    onChange={(e) => updateSetting('company_rc', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Patente (T.P.)</label>
                  <input
                    type="text"
                    value={settings.company_tp || ''}
                    onChange={(e) => updateSetting('company_tp', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Identifiant Fiscal (I.F.)</label>
                  <input
                    type="text"
                    value={settings.company_if || ''}
                    onChange={(e) => updateSetting('company_if', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Numéro CNSS</label>
                  <input
                    type="text"
                    value={settings.company_cnss || ''}
                    onChange={(e) => updateSetting('company_cnss', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Numéro ICE</label>
                  <input
                    type="text"
                    value={settings.company_ice || ''}
                    onChange={(e) => updateSetting('company_ice', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Nom du Gérant / Signataire</label>
                  <input
                    type="text"
                    value={settings.company_manager || ''}
                    onChange={(e) => updateSetting('company_manager', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Titre du Signataire</label>
                  <input
                    type="text"
                    value={settings.company_manager_title || ''}
                    onChange={(e) => updateSetting('company_manager_title', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Bank settings */}
          {activeTab === 'bank' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', borderBottom: '1px solid var(--gray-100)', paddingBottom: '0.5rem' }}>Coordonnées Bancaires de Règlement</h3>
              
              <div className="billing-settings-group" style={{ gridTemplateColumns: '1fr' }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Nom de l'établissement Bancaire</label>
                  <input
                    type="text"
                    value={settings.bank_name || ''}
                    onChange={(e) => updateSetting('bank_name', e.target.value)}
                    placeholder="Ex: CFG BANK"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Agence Bancaire / Ville</label>
                  <input
                    type="text"
                    value={settings.bank_branch || ''}
                    onChange={(e) => updateSetting('bank_branch', e.target.value)}
                    placeholder="Ex: Bd. Massira AL Khadra, Maarif - Casablanca"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Code R.I.B. (24 chiffres)</label>
                  <input
                    type="text"
                    value={settings.bank_rib || ''}
                    onChange={(e) => updateSetting('bank_rib', e.target.value)}
                    placeholder="000 000 000000000000000000"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none', letterSpacing: '0.05em' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Invoice template & formatting settings */}
          {activeTab === 'invoice' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', borderBottom: '1px solid var(--gray-100)', paddingBottom: '0.5rem' }}>Paramètres du Modèle de Facture</h3>
              
              <div className="billing-settings-group">
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Format Numéro Facture</label>
                  <input
                    type="text"
                    value={settings.invoice_format || ''}
                    onChange={(e) => updateSetting('invoice_format', e.target.value)}
                    placeholder="Ex: {abbreviation}-{seq}-{year}"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.2rem', display: 'block' }}>Raccourcis: {"{abbreviation}"}, {"{seq}"}, {"{year}"}</span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Prochain ID Séquentiel (Seq)</label>
                  <input
                    type="number"
                    value={settings.next_invoice_seq || ''}
                    onChange={(e) => updateSetting('next_invoice_seq', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Taux TVA par Défaut (%)</label>
                  <input
                    type="number"
                    value={settings.invoice_tva_rate || ''}
                    onChange={(e) => updateSetting('invoice_tva_rate', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Devise</label>
                  <input
                    type="text"
                    value={settings.invoice_currency || ''}
                    onChange={(e) => updateSetting('invoice_currency', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Texte de Salutation (Introduction)</label>
                  <textarea
                    rows={3}
                    value={settings.invoice_salutation || ''}
                    onChange={(e) => updateSetting('invoice_salutation', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none', resize: 'vertical', fontFamily: 'var(--font-body)' }}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Texte d'Écriture de Somme (Clôture)</label>
                  <textarea
                    rows={2}
                    value={settings.invoice_closing || ''}
                    onChange={(e) => updateSetting('invoice_closing', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none', resize: 'none', fontFamily: 'var(--font-body)' }}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Note Légale TVA (Bas de page)</label>
                  <input
                    type="text"
                    value={settings.tva_legal_note || ''}
                    onChange={(e) => updateSetting('tva_legal_note', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>Note Légale Conditions de Règlement</label>
                  <input
                    type="text"
                    value={settings.payment_legal_note || ''}
                    onChange={(e) => updateSetting('payment_legal_note', e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', outline: 'none' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
