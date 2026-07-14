'use client';

import { useEffect, useState, useRef } from 'react';
import { useToast } from '../layout';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('email');
  const [testingEmail, setTestingEmail] = useState(false);
  const { showToast } = useToast();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch('/api/settings').then((r) => r.json()).then((data) => { setSettings(data.settings || {}); setLoading(false); });
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings }) });
    if (res.ok) showToast('Paramètres enregistrés avec succès');
    else showToast('Erreur lors de la sauvegarde', 'error');
    setSaving(false);
  };

  const testEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch('/api/test-email', { method: 'POST' });
      const data = await res.json();
      if (data.success) showToast('Email de test envoyé avec succès !', 'success');
      else showToast(`Échec: ${data.error}`, 'error');
    } catch { showToast('Erreur de test', 'error'); }
    setTestingEmail(false);
  };

  const tabs = [
    { id: 'email', label: 'Email', icon: 'envelope-simple' },
    { id: 'telegram', label: 'Telegram', icon: 'telegram-logo' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'ai', label: 'Intelligence Artificielle', icon: 'robot' },
    { id: 'general', label: 'Général', icon: 'gear-six' },
    { id: 'security', label: 'Sécurité', icon: 'shield-check' },
  ];

  if (loading) return <div className="page-loading"><div className="spinner"></div><p className="page-loading-text">Chargement des paramètres...</p></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Paramètres</h2>
          <p className="page-subtitle">Configurez votre système de recouvrement</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Sauvegarde...</> : <><i className="ph ph-floppy-disk"></i> Enregistrer</>}
          </button>
        </div>
      </div>

      <div className="settings-layout">
        {/* Settings Nav */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-body" style={{ padding: '0.5rem' }}>
            <ul className="settings-nav">
              {tabs.map((tab) => (
                <li key={tab.id} className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                  <i className={`ph ph-${tab.icon}`}></i> {tab.label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Settings Content */}
        <div className="card">
          <div className="card-body">
            {/* EMAIL SETTINGS */}
            {activeTab === 'email' && (
              <div>
                <div className="settings-section">
                  <h3 className="settings-section-title">Méthode d&apos;envoi des e-mails</h3>
                  <p className="settings-section-desc">Choisissez comment les relances par e-mail seront expédiées</p>
                  <div className="settings-field">
                    <div>
                      <div className="settings-field-label">Méthode d&apos;envoi</div>
                      <div className="settings-field-desc">Brevo API est recommandé pour la production sur Render</div>
                    </div>
                    <select className="form-select" value={settings.email_send_method || 'brevo'} onChange={(e) => updateSetting('email_send_method', e.target.value)}>
                      <option value="brevo">Brevo API (HTTP - Recommandé)</option>
                      <option value="smtp">Serveur SMTP Classique</option>
                    </select>
                  </div>
                </div>

                {/* BREVO CONFIG */}
                {(settings.email_send_method || 'brevo') === 'brevo' && (
                  <div className="settings-section">
                    <h3 className="settings-section-title">Configuration Brevo API</h3>
                    <p className="settings-section-desc">Paramètres d&apos;envoi via la plate-forme Brevo (ex Sendinblue)</p>
                    <div className="settings-field">
                      <div>
                        <div className="settings-field-label">Clé API Brevo (v3)</div>
                        <div className="settings-field-desc">Clé API pour s&apos;authentifier auprès de Brevo</div>
                      </div>
                      <input className="form-input" type="password" value={settings.brevo_api_key || ''} onChange={(e) => updateSetting('brevo_api_key', e.target.value)} placeholder="xkeysib-..." />
                    </div>
                    <div className="settings-field">
                      <div>
                        <div className="settings-field-label">Email expéditeur</div>
                        <div className="settings-field-desc">L&apos;adresse email vérifiée sur votre compte Brevo</div>
                      </div>
                      <input className="form-input" value={settings.brevo_sender_email || ''} onChange={(e) => updateSetting('brevo_sender_email', e.target.value)} placeholder="contact@alfa-01.com" />
                    </div>
                    <div className="settings-field">
                      <div>
                        <div className="settings-field-label">Nom de l&apos;expéditeur</div>
                        <div className="settings-field-desc">Le nom affiché aux clients</div>
                      </div>
                      <input className="form-input" value={settings.brevo_sender_name || ''} onChange={(e) => updateSetting('brevo_sender_name', e.target.value)} placeholder="Alfa-01" />
                    </div>
                  </div>
                )}

                {/* SMTP CONFIG */}
                {settings.email_send_method === 'smtp' && (
                  <div className="settings-section">
                    <h3 className="settings-section-title">Configuration SMTP (Envoi)</h3>
                    <p className="settings-section-desc">Paramètres pour l&apos;envoi des emails via un serveur SMTP</p>
                    <div className="settings-field">
                      <div><div className="settings-field-label">Serveur SMTP</div><div className="settings-field-desc">Hostname du serveur SMTP</div></div>
                      <input className="form-input" value={settings.smtp_host || ''} onChange={(e) => updateSetting('smtp_host', e.target.value)} placeholder="mail.exemple.com" />
                    </div>
                    <div className="settings-field">
                      <div><div className="settings-field-label">Port SMTP</div></div>
                      <input className="form-input" value={settings.smtp_port || ''} onChange={(e) => updateSetting('smtp_port', e.target.value)} placeholder="587" />
                    </div>
                    <div className="settings-field">
                      <div><div className="settings-field-label">Utilisateur SMTP</div></div>
                      <input className="form-input" value={settings.smtp_user || ''} onChange={(e) => updateSetting('smtp_user', e.target.value)} />
                    </div>
                    <div className="settings-field">
                      <div><div className="settings-field-label">Mot de passe SMTP</div></div>
                      <input className="form-input" type="password" value={settings.smtp_pass || ''} onChange={(e) => updateSetting('smtp_pass', e.target.value)} />
                    </div>
                    <div className="settings-field">
                      <div><div className="settings-field-label">Email expéditeur</div></div>
                      <input className="form-input" value={settings.smtp_from || ''} onChange={(e) => updateSetting('smtp_from', e.target.value)} />
                    </div>
                  </div>
                )}

                <div className="settings-section">
                  <h3 className="settings-section-title">Configuration IMAP (Réception)</h3>
                  <p className="settings-section-desc">Pour recevoir et traiter les commandes par email</p>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Serveur IMAP</div></div>
                    <input className="form-input" value={settings.imap_host || ''} onChange={(e) => updateSetting('imap_host', e.target.value)} placeholder="mail.exemple.com" />
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Port IMAP</div></div>
                    <input className="form-input" value={settings.imap_port || ''} onChange={(e) => updateSetting('imap_port', e.target.value)} placeholder="993" />
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Utilisateur IMAP</div></div>
                    <input className="form-input" value={settings.imap_user || ''} onChange={(e) => updateSetting('imap_user', e.target.value)} />
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Mot de passe IMAP</div></div>
                    <input className="form-input" type="password" value={settings.imap_pass || ''} onChange={(e) => updateSetting('imap_pass', e.target.value)} />
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="settings-section-title">Email Administrateur</h3>
                  <p className="settings-section-desc">Seul cet email peut envoyer des commandes au système</p>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Email admin</div><div className="settings-field-desc">Les commandes d&apos;autres adresses seront ignorées</div></div>
                    <input className="form-input" value={settings.admin_email || ''} onChange={(e) => updateSetting('admin_email', e.target.value)} placeholder="admin@exemple.com" />
                  </div>
                </div>

                <button className="btn btn-outline" onClick={testEmail} disabled={testingEmail}>
                  {testingEmail ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }}></span> Test en cours...</> : <><i className="ph ph-paper-plane-tilt"></i> Tester la connexion email</>}
                </button>
              </div>
            )}

            {/* TELEGRAM SETTINGS */}
            {activeTab === 'telegram' && (
              <TelegramSettings settings={settings} updateSetting={updateSetting} showToast={showToast} />
            )}

            {/* NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <div>
                <div className="settings-section">
                  <h3 className="settings-section-title">Notifications</h3>
                  <p className="settings-section-desc">Gérez les notifications envoyées à l&apos;administrateur</p>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Rapport quotidien</div><div className="settings-field-desc">Recevoir un résumé quotidien</div></div>
                    <label className="toggle">
                      <input type="checkbox" checked={settings.notification_daily_report === 'true'} onChange={(e) => updateSetting('notification_daily_report', e.target.checked ? 'true' : 'false')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Alerte message échoué</div><div className="settings-field-desc">Notification quand un email ne peut pas être envoyé</div></div>
                    <label className="toggle">
                      <input type="checkbox" checked={settings.notification_failed_message === 'true'} onChange={(e) => updateSetting('notification_failed_message', e.target.checked ? 'true' : 'false')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Réponse client</div><div className="settings-field-desc">Notification quand un client répond</div></div>
                    <label className="toggle">
                      <input type="checkbox" checked={settings.notification_client_reply === 'true'} onChange={(e) => updateSetting('notification_client_reply', e.target.checked ? 'true' : 'false')} />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Seuil d&apos;alertes</div><div className="settings-field-desc">Nombre de messages sans paiement avant alerte</div></div>
                    <input className="form-input" type="number" value={settings.notification_max_messages_threshold || '10'} onChange={(e) => updateSetting('notification_max_messages_threshold', e.target.value)} style={{ maxWidth: 100 }} />
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Fréquence des rapports</div></div>
                    <select className="form-select" value={settings.notification_report_frequency || 'daily'} onChange={(e) => updateSetting('notification_report_frequency', e.target.value)}>
                      <option value="daily">Quotidien</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="monthly">Mensuel</option>
                    </select>
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Heure du rapport</div></div>
                    <input className="form-input" type="time" value={settings.notification_report_time || '18:00'} onChange={(e) => updateSetting('notification_report_time', e.target.value)} style={{ maxWidth: 150 }} />
                  </div>
                </div>
              </div>
            )}

            {/* AI SETTINGS */}
            {activeTab === 'ai' && (
              <div>
                <div className="settings-section">
                  <h3 className="settings-section-title">Intelligence Artificielle</h3>
                  <p className="settings-section-desc">Configuration de l&apos;IA pour le traitement des commandes</p>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Clé API OpenRouter</div></div>
                    <input className="form-input" type="password" value={settings.openrouter_api_key || ''} onChange={(e) => updateSetting('openrouter_api_key', e.target.value)} placeholder="sk-or-..." />
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Modèle AI</div><div className="settings-field-desc">Modèle utilisé pour comprendre les commandes</div></div>
                    <select className="form-select" value={settings.openrouter_model || 'google/gemini-2.5-flash'} onChange={(e) => updateSetting('openrouter_model', e.target.value)}>
                      <option value="google/gemini-2.5-flash">Google Gemini 2.5 Flash (Recommandé)</option>
                      <option value="google/gemini-2.5-pro">Google Gemini 2.5 Pro</option>
                      <option value="anthropic/claude-sonnet-4">Claude Sonnet 4</option>
                      <option value="openai/gpt-4o">GPT-4o</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* GENERAL SETTINGS */}
            {activeTab === 'general' && (
              <div>
                <div className="settings-section">
                  <h3 className="settings-section-title">Paramètres Généraux</h3>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Nom de l&apos;entreprise</div></div>
                    <input className="form-input" value={settings.company_name || ''} onChange={(e) => updateSetting('company_name', e.target.value)} />
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Heure d&apos;envoi par défaut</div></div>
                    <input className="form-input" type="time" value={settings.default_send_time || '09:00'} onChange={(e) => updateSetting('default_send_time', e.target.value)} style={{ maxWidth: 150 }} />
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Fuseau horaire</div></div>
                    <select className="form-select" value={settings.timezone || 'Africa/Casablanca'} onChange={(e) => updateSetting('timezone', e.target.value)}>
                      <option value="Africa/Casablanca">Africa/Casablanca (GMT+1)</option>
                      <option value="Europe/Paris">Europe/Paris (GMT+2)</option>
                      <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                    </select>
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Devise par défaut</div></div>
                    <select className="form-select" value={settings.default_currency || 'MAD'} onChange={(e) => updateSetting('default_currency', e.target.value)}>
                      <option value="MAD">MAD (Dirham Marocain)</option>
                      <option value="EUR">EUR (Euro)</option>
                      <option value="USD">USD (Dollar)</option>
                    </select>
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Fréquence par défaut</div></div>
                    <select className="form-select" value={settings.default_frequency || 'weekly'} onChange={(e) => updateSetting('default_frequency', e.target.value)}>
                      <option value="daily">Quotidien</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="biweekly">Bi-mensuel</option>
                      <option value="monthly">Mensuel</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SECURITY */}
            {activeTab === 'security' && (
              <div>
                <div className="settings-section">
                  <h3 className="settings-section-title">Sécurité</h3>
                  <p className="settings-section-desc">Gérez les accès et la sécurité du système</p>
                  <div style={{ padding: '1.5rem', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                    <p className="text-sm fw-600" style={{ color: 'var(--warning)' }}><i className="ph ph-warning" style={{ marginRight: '0.35rem' }}></i>Important</p>
                    <p className="text-xs text-muted mt-1">Pour changer le mot de passe admin, modifiez les variables d&apos;environnement ADMIN_USERNAME et ADMIN_PASSWORD sur votre serveur.</p>
                  </div>
                  <div className="settings-field">
                    <div><div className="settings-field-label">Email admin autorisé</div><div className="settings-field-desc">Seul cet email peut envoyer des commandes par email au système. Tout autre email est ignoré.</div></div>
                    <input className="form-input" value={settings.admin_email || ''} onChange={(e) => updateSetting('admin_email', e.target.value)} placeholder="admin@exemple.com" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Telegram Settings Component with linking flow
function TelegramSettings({ settings, updateSetting, showToast }: { settings: Record<string, string>; updateSetting: (k: string, v: string) => void; showToast: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void }) {
  const [linkStatus, setLinkStatus] = useState<{ linked: boolean; chatId: string; adminName: string; adminUsername: string } | null>(null);
  const [linkCode, setLinkCode] = useState('');
  const [botLink, setBotLink] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [generating, setGenerating] = useState(false);
  const [checking, setChecking] = useState(true);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkLinkStatus();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  const checkLinkStatus = async () => {
    try {
      const res = await fetch('/api/telegram/link');
      const data = await res.json();
      setLinkStatus(data);
      if (data.linked && data.chatId) {
        updateSetting('telegram_admin_chat_id', data.chatId);
      }
    } catch { /* ignore */ }
    setChecking(false);
  };

  const generateCode = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/telegram/link', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLinkCode(data.linkCode);
        setBotLink(data.botLink);
        setBotUsername(data.botUsername);
        showToast('Code de liaison généré !', 'success');
        // Start polling to check if user linked
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(async () => {
          const r = await fetch('/api/telegram/link');
          const d = await r.json();
          if (d.linked) {
            setLinkStatus(d);
            setLinkCode('');
            if (pollingRef.current) clearInterval(pollingRef.current);
            showToast(`Telegram lié avec succès ! Bienvenue ${d.adminName}`, 'success');
            updateSetting('telegram_admin_chat_id', d.chatId);
          }
        }, 3000);
        // Stop polling after 5 minutes
        setTimeout(() => { if (pollingRef.current) clearInterval(pollingRef.current); }, 300000);
      } else {
        showToast(data.error || 'Erreur', 'error');
      }
    } catch { showToast('Erreur de connexion', 'error'); }
    setGenerating(false);
  };

  const unlinkTelegram = async () => {
    try {
      await fetch('/api/telegram/link', { method: 'DELETE' });
      setLinkStatus({ linked: false, chatId: '', adminName: '', adminUsername: '' });
      updateSetting('telegram_admin_chat_id', '');
      showToast('Telegram délié avec succès');
    } catch { showToast('Erreur', 'error'); }
  };

  if (checking) return <div className="page-loading"><div className="spinner"></div></div>;

  return (
    <div>
      {/* Bot Token Config */}
      <div className="settings-section">
        <h3 className="settings-section-title">Configuration du Bot</h3>
        <p className="settings-section-desc">Token de votre bot Telegram (obtenu via @BotFather)</p>
        <div className="settings-field">
          <div><div className="settings-field-label">Token du Bot</div><div className="settings-field-desc">Obtenu via @BotFather sur Telegram</div></div>
          <input className="form-input" value={settings.telegram_bot_token || ''} onChange={(e) => updateSetting('telegram_bot_token', e.target.value)} placeholder="123456:ABC-DEF..." type="password" />
        </div>
      </div>

      {/* Link Status */}
      <div className="settings-section" style={{ marginTop: '1.5rem' }}>
        <h3 className="settings-section-title">Compte Administrateur</h3>
        <p className="settings-section-desc">Liez votre compte Telegram pour recevoir les notifications et contrôler le système</p>

        {linkStatus?.linked ? (
          <div style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(34,197,94,0.06), rgba(34,197,94,0.02))', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(34,197,94,0.2)', marginTop: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ph ph-check-circle" style={{ fontSize: '1.5rem', color: '#22c55e' }}></i>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--gray-900)', margin: '0 0 2px' }}>Compte lié avec succès</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--gray-500)', margin: 0 }}>
                  {linkStatus.adminName && <><i className="ph ph-user" style={{ marginRight: '4px' }}></i>{linkStatus.adminName}</>}
                  {linkStatus.adminUsername && <> • @{linkStatus.adminUsername}</>}
                </p>
              </div>
              <button className="btn btn-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }} onClick={unlinkTelegram}>
                <i className="ph ph-link-break" style={{ marginRight: '4px' }}></i>
                Délier
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: '1rem' }}>
            {!linkCode ? (
              <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--gray-200)' }}>
                <i className="ph ph-telegram-logo" style={{ fontSize: '2.5rem', color: 'var(--gold)', marginBottom: '0.5rem', display: 'block' }}></i>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--gray-800)', margin: '0 0 8px' }}>Aucun compte Telegram lié</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--gray-500)', margin: '0 0 1.2rem', maxWidth: '360px', marginInline: 'auto' }}>
                  Liez votre compte pour recevoir les alertes en temps réel et contrôler le système via Telegram
                </p>
                <button className="btn btn-primary" onClick={generateCode} disabled={generating} style={{ padding: '10px 24px' }}>
                  {generating ? <><i className="ph ph-spinner ph-spin" style={{ marginRight: '6px' }}></i>Génération...</> : <><i className="ph ph-link" style={{ marginRight: '6px' }}></i>Générer un code de liaison</>}
                </button>
              </div>
            ) : (
              <div style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(197,160,61,0.06), rgba(197,160,61,0.02))', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(197,160,61,0.2)' }}>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--gray-900)', margin: '0 0 1rem', textAlign: 'center' }}>
                  <i className="ph ph-link" style={{ marginRight: '6px', color: 'var(--gold)' }}></i>
                  Suivez ces étapes pour lier votre compte
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gold)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>1</span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: '0 0 4px' }}>Ouvrez le bot sur Telegram</p>
                      {botLink && <a href={botLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)', fontWeight: 600, fontSize: '0.82rem' }}>👉 Ouvrir @{botUsername}</a>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gold)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>2</span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: '0 0 4px' }}>Envoyez ce code au bot</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code style={{ background: 'var(--gray-900)', color: 'var(--gold)', padding: '10px 24px', borderRadius: 'var(--radius-md)', fontSize: '1.5rem', fontWeight: 800, letterSpacing: '6px' }}>{linkCode}</code>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--gold)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>3</span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>Attendez la confirmation...</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--gray-500)', margin: '4px 0 0' }}>
                        <i className="ph ph-spinner ph-spin" style={{ marginRight: '4px' }}></i>
                        En attente de votre code...
                      </p>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <button className="btn btn-sm" style={{ background: 'var(--gray-100)', color: 'var(--gray-600)', border: 'none', padding: '6px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.78rem' }} onClick={generateCode}>
                    <i className="ph ph-arrows-clockwise" style={{ marginRight: '4px' }}></i>
                    Régénérer le code
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
