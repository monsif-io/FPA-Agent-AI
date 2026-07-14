'use client';

import { useEffect, useState, useRef } from 'react';
import { useToast } from '../layout';

interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  escalation_level: string;
  language: string;
  is_default: number;
  created_at: string;
}

interface FlowStep {
  template_id: number;
  delay_days: number;
}

interface AutomationFlow {
  id: number;
  name: string;
  description: string;
  steps: FlowStep[];
  is_default: number;
  client_count: number;
  created_at: string;
}

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState<'templates' | 'flows'>('templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Template modal state
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', body: '', escalationLevel: 'friendly', language: 'fr', isDefault: false });
  
  // Flow modal state
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [editFlow, setEditFlow] = useState<AutomationFlow | null>(null);
  const [flowForm, setFlowForm] = useState({
    name: '',
    description: '',
    steps: [] as FlowStep[]
  });

  const [previewVars] = useState({ nom: 'Mohamed Alami', entreprise: 'Société ABC', montant: '45,000', devise: 'MAD', date_echeance: '15/07/2026', company_name: 'FinancePro Advisory' });
  const { showToast } = useToast();
  const fetchedRef = useRef(false);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchFlows = async () => {
    try {
      const res = await fetch('/api/automation-flows');
      const data = await res.json();
      setFlows(data.flows || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchTemplates(), fetchFlows()]);
    setLoading(false);
  };

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchData();
    }
  }, []);

  // Handle template submissions
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editTemplate ? `/api/templates/${editTemplate.id}` : '/api/templates';
    const method = editTemplate ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      showToast(editTemplate ? 'Template modifié' : 'Template créé');
      setShowModal(false); setEditTemplate(null);
      setForm({ name: '', subject: '', body: '', escalationLevel: 'friendly', language: 'fr', isDefault: false });
      fetchTemplates();
    } else { showToast('Erreur', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce template ?')) return;
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    showToast('Template supprimé');
    fetchTemplates();
  };

  const openEdit = (t: Template) => {
    setEditTemplate(t);
    setForm({ name: t.name, subject: t.subject, body: t.body, escalationLevel: t.escalation_level, language: t.language, isDefault: !!t.is_default });
    setShowModal(true);
  };

  // Handle flow submissions
  const handleFlowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (flowForm.steps.length === 0) {
      showToast('Le flux doit comporter au moins une étape', 'error');
      return;
    }

    const url = editFlow ? `/api/automation-flows/${editFlow.id}` : '/api/automation-flows';
    const method = editFlow ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flowForm)
    });

    if (res.ok) {
      showToast(editFlow ? 'Flux d\'automatisation modifié' : 'Flux d\'automatisation créé');
      setShowFlowModal(false);
      setEditFlow(null);
      setFlowForm({ name: '', description: '', steps: [] });
      fetchFlows();
    } else {
      const errData = await res.json();
      showToast(errData.error || 'Erreur lors de l\'enregistrement', 'error');
    }
  };

  const handleDeleteFlow = async (id: number) => {
    if (!confirm('Supprimer ce flux d\'automatisation ? Les clients inscrits seront ré-assignés au flux par défaut.')) return;
    const res = await fetch(`/api/automation-flows/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Flux d\'automatisation supprimé');
      fetchFlows();
    } else {
      showToast('Erreur lors de la suppression', 'error');
    }
  };

  const openEditFlow = (f: AutomationFlow) => {
    setEditFlow(f);
    setFlowForm({
      name: f.name,
      description: f.description,
      steps: [...f.steps]
    });
    setShowFlowModal(true);
  };

  const openNewFlow = () => {
    setEditFlow(null);
    setFlowForm({
      name: '',
      description: '',
      steps: templates.length > 0 ? [{ template_id: templates[0].id, delay_days: 7 }] : []
    });
    setShowFlowModal(true);
  };

  const addFlowStep = () => {
    if (templates.length === 0) {
      showToast('Veuillez créer des templates de messages avant d\'ajouter des étapes', 'warning');
      return;
    }
    setFlowForm({
      ...flowForm,
      steps: [...flowForm.steps, { template_id: templates[0].id, delay_days: 7 }]
    });
  };

  const removeFlowStep = (idx: number) => {
    const updated = flowForm.steps.filter((_, i) => i !== idx);
    setFlowForm({ ...flowForm, steps: updated });
  };

  const updateStepField = (idx: number, field: keyof FlowStep, value: number) => {
    const updated = flowForm.steps.map((step, i) => {
      if (i === idx) {
        return { ...step, [field]: value };
      }
      return step;
    });
    setFlowForm({ ...flowForm, steps: updated });
  };

  const moveStep = (idx: number, direction: 'up' | 'down') => {
    const updated = [...flowForm.steps];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= updated.length) return;
    
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    
    setFlowForm({ ...flowForm, steps: updated });
  };

  const replaceVars = (text: string) => {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => previewVars[key as keyof typeof previewVars] || `{{${key}}}`);
  };

  const escalationLabels: Record<string, string> = { friendly: 'Amical', formal: 'Formel', urgent: 'Urgent', final: 'Final' };
  const escalationIcons: Record<string, string> = { friendly: 'smiley', formal: 'file-text', urgent: 'warning', final: 'gavel' };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Configuration des Relances</h2>
          <p className="page-subtitle">Gérez vos templates de courriels et scénarios d&apos;automation</p>
        </div>
        <div className="page-actions">
          {activeTab === 'templates' ? (
            <button className="btn btn-primary" onClick={() => { setEditTemplate(null); setForm({ name: '', subject: '', body: '', escalationLevel: 'friendly', language: 'fr', isDefault: false }); setShowModal(true); }}>
              <i className="ph ph-plus"></i> Nouveau template
            </button>
          ) : (
            <button className="btn btn-primary" onClick={openNewFlow}>
              <i className="ph ph-plus"></i> Nouveau flux
            </button>
          )}
        </div>
      </div>

      {/* Premium Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.75rem',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '0.2rem'
      }}>
        <button 
          onClick={() => setActiveTab('templates')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: activeTab === 'templates' ? 'var(--gold)' : 'var(--slate-gray)',
            borderBottom: activeTab === 'templates' ? '2px solid var(--gold)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            borderRadius: '4px 4px 0 0'
          }}
        >
          <i className="ph ph-file-text" style={{ fontSize: '1.2rem' }}></i>
          Templates de Messages
        </button>
        <button 
          onClick={() => setActiveTab('flows')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            border: 'none',
            background: 'none',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: activeTab === 'flows' ? 'var(--gold)' : 'var(--slate-gray)',
            borderBottom: activeTab === 'flows' ? '2px solid var(--gold)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            borderRadius: '4px 4px 0 0'
          }}
        >
          <i className="ph ph-flow-arrow" style={{ fontSize: '1.2rem' }}></i>
          Automation Flows
          <span className="badge badge-sm badge-gold" style={{ marginLeft: '0.25rem', fontSize: '0.75rem', padding: '0.1rem 0.4rem' }}>Nouveau</span>
        </button>
      </div>

      {loading ? (
        <div className="loader"><div className="spinner"></div></div>
      ) : activeTab === 'templates' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.25rem' }}>
          {templates.map((t) => (
            <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div className={`stat-card-icon ${t.escalation_level === 'friendly' ? 'success' : t.escalation_level === 'formal' ? 'warning' : 'gold'}`} style={{ width: 36, height: 36, fontSize: '1rem' }}>
                    <i className={`ph ph-${escalationIcons[t.escalation_level] || 'file-text'}`}></i>
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{t.name}</h4>
                    <span className={`badge badge-${t.escalation_level}`} style={{ marginTop: '0.2rem' }}>
                      {escalationLabels[t.escalation_level]}
                    </span>
                  </div>
                </div>
                {t.is_default ? <span className="badge badge-gold">Défaut</span> : null}
              </div>
              <div className="card-body" style={{ flex: 1 }}>
                <p className="text-sm fw-600 mb-1" style={{ color: 'var(--anthracite)' }}>Sujet: {t.subject}</p>
                <p className="text-sm text-muted" style={{ lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.body.substring(0, 200)}...
                </p>
              </div>
              <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}>
                  <i className="ph ph-pencil-simple"></i> Modifier
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t.id)} style={{ color: 'var(--danger)' }}>
                  <i className="ph ph-trash"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Automation Flows Section */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap: '1.5rem' }}>
          {flows.map((flow) => (
            <div key={flow.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                <div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--anthracite)' }}>{flow.name}</h4>
                  <p className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>{flow.client_count} client(s) actif(s)</p>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {flow.is_default === 1 ? <span className="badge badge-gold">Par défaut</span> : <span className="badge badge-suspended">Personnalisé</span>}
                </div>
              </div>
              <div className="card-body" style={{ flex: 1, padding: '1.25rem' }}>
                <p className="text-sm text-muted mb-3" style={{ fontStyle: 'italic' }}>{flow.description || 'Aucune description disponible.'}</p>
                
                {/* Steps visual flow timeline */}
                <h5 className="text-xs fw-700 uppercase tracking-wide text-muted mb-2">Sequence d&apos;étapes de relance</h5>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  position: 'relative',
                  paddingLeft: '1.5rem',
                  borderLeft: '2px dashed var(--border-color)',
                  marginLeft: '0.6rem',
                  marginBlock: '0.75rem'
                }}>
                  {flow.steps.map((step, idx) => {
                    const template = templates.find(t => t.id === step.template_id);
                    return (
                      <div key={idx} style={{ position: 'relative' }}>
                        {/* Dot node */}
                        <div style={{
                          position: 'absolute',
                          left: '-2.15rem',
                          top: '0.25rem',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: idx === 0 ? 'var(--success)' : idx === flow.steps.length - 1 ? 'var(--danger)' : 'var(--gold)',
                          border: '2px solid var(--card-bg, white)'
                        }}></div>
                        
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--anthracite)' }}>
                            {idx + 1}. {template?.name || `Template Impayé #${step.template_id}`}
                          </span>
                          <span className="badge badge-gold" style={{ fontSize: '0.7rem', padding: '0.05rem 0.35rem' }}>
                            +{step.delay_days} jours
                          </span>
                        </div>
                        {template && <p className="text-xs text-muted" style={{ marginTop: '0.1rem' }}>Sujet: {template.subject}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="card-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                {flow.is_default !== 1 ? (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEditFlow(flow)}>
                      <i className="ph ph-pencil-simple"></i> Modifier
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteFlow(flow.id)} style={{ color: 'var(--danger)' }}>
                      <i className="ph ph-trash"></i>
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <i className="ph ph-lock-key"></i> Système verrouillé
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="ph ph-note-pencil" style={{ color: 'var(--gold)', marginRight: '0.5rem' }}></i>
                {editTemplate ? 'Modifier le template' : 'Nouveau template'}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><i className="ph ph-x"></i></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="template-editor">
                  <div>
                    <div className="form-group">
                      <label className="form-label">Nom du template</label>
                      <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: Rappel amical" />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Niveau d&apos;escalade</label>
                        <select className="form-select" value={form.escalationLevel} onChange={(e) => setForm({ ...form, escalationLevel: e.target.value })}>
                          <option value="friendly">Amical</option>
                          <option value="formal">Formel</option>
                          <option value="urgent">Urgent</option>
                          <option value="final">Final</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Langue</label>
                        <select className="form-select" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                          <option value="fr">Français</option>
                          <option value="en">English</option>
                          <option value="ar">العربية</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sujet de l&apos;email</label>
                      <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required placeholder="Sujet du message" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Corps du message</label>
                      <textarea className="form-textarea" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required rows={10} placeholder="Écrivez votre message ici..." />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                      <span className="text-xs text-muted" style={{ marginRight: '0.25rem' }}>Variables :</span>
                      {['nom', 'entreprise', 'montant', 'devise', 'date_echeance', 'company_name'].map((v) => (
                        <button key={v} type="button" className="template-var" onClick={() => setForm({ ...form, body: form.body + `{{${v}}}` })}>
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="template-preview">
                      <div className="template-preview-header">Prévisualisation</div>
                      <div className="template-preview-subject">{replaceVars(form.subject || 'Sujet...')}</div>
                      <div className="template-preview-body">{replaceVars(form.body || 'Contenu du message...')}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary"><i className="ph ph-check"></i> {editTemplate ? 'Enregistrer' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Automation Flow Modal */}
      {showFlowModal && (
        <div className="modal-overlay" onClick={() => setShowFlowModal(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="ph ph-flow-arrow" style={{ color: 'var(--gold)', marginRight: '0.5rem' }}></i>
                {editFlow ? 'Modifier le flux d\'automatisation' : 'Nouveau flux d\'automatisation'}
              </h3>
              <button className="modal-close" onClick={() => setShowFlowModal(false)}><i className="ph ph-x"></i></button>
            </div>
            <form onSubmit={handleFlowSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nom de la séquence *</label>
                  <input 
                    className="form-input" 
                    value={flowForm.name} 
                    onChange={(e) => setFlowForm({ ...flowForm, name: e.target.value })} 
                    required 
                    placeholder="Ex: Recouvrement Rapide Client Douteux" 
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea 
                    className="form-textarea" 
                    value={flowForm.description} 
                    onChange={(e) => setFlowForm({ ...flowForm, description: e.target.value })} 
                    rows={2} 
                    placeholder="Brève description de la stratégie de relance..." 
                  />
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h4 className="form-label" style={{ margin: 0, fontWeight: 700 }}>Étapes de la séquence ({flowForm.steps.length})</h4>
                    <button type="button" className="btn btn-outline btn-sm" onClick={addFlowStep}>
                      <i className="ph ph-plus"></i> Ajouter une étape
                    </button>
                  </div>

                  {flowForm.steps.length === 0 ? (
                    <div style={{ 
                      padding: '2rem', 
                      textAlign: 'center', 
                      backgroundColor: 'var(--bg-light)', 
                      borderRadius: '8px', 
                      border: '1px dashed var(--border-color)' 
                    }}>
                      <p className="text-sm text-muted">Aucune étape. Cliquez sur &quot;Ajouter une étape&quot; pour commencer.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {flowForm.steps.map((step, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.75rem', 
                            padding: '0.75rem 1rem', 
                            backgroundColor: 'rgba(255,255,255,0.05)', 
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          <div style={{ fontWeight: 700, minWidth: '2.5rem', color: 'var(--gold)' }}>
                            #{idx + 1}
                          </div>

                          <div style={{ flex: 2 }}>
                            <label className="text-xs text-muted block mb-1">Message Template</label>
                            <select 
                              className="form-select form-select-sm" 
                              value={step.template_id} 
                              onChange={(e) => updateStepField(idx, 'template_id', Number(e.target.value))}
                              style={{ width: '100%' }}
                            >
                              {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({escalationLabels[t.escalation_level]})</option>
                              ))}
                            </select>
                          </div>

                          <div style={{ flex: 1 }}>
                            <label className="text-xs text-muted block mb-1">Délai avant envoi</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <input 
                                className="form-input form-input-sm" 
                                type="number" 
                                min={1} 
                                max={90} 
                                value={step.delay_days} 
                                onChange={(e) => updateStepField(idx, 'delay_days', Number(e.target.value))} 
                                style={{ width: '80px', textAlign: 'center' }} 
                              />
                              <span style={{ fontSize: '0.85rem', color: 'var(--slate-gray)' }}>jours</span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.2rem' }}>
                            <button 
                              type="button" 
                              className="btn btn-ghost btn-sm btn-icon" 
                              onClick={() => moveStep(idx, 'up')} 
                              disabled={idx === 0}
                              title="Déplacer vers le haut"
                            >
                              <i className="ph ph-arrow-up"></i>
                            </button>
                            <button 
                              type="button" 
                              className="btn btn-ghost btn-sm btn-icon" 
                              onClick={() => moveStep(idx, 'down')} 
                              disabled={idx === flowForm.steps.length - 1}
                              title="Déplacer vers le bas"
                            >
                              <i className="ph ph-arrow-down"></i>
                            </button>
                            <button 
                              type="button" 
                              className="btn btn-ghost btn-sm btn-icon" 
                              onClick={() => removeFlowStep(idx)} 
                              style={{ color: 'var(--danger)' }}
                              title="Supprimer l'étape"
                            >
                              <i className="ph ph-trash"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowFlowModal(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">
                  <i className="ph ph-check"></i> Enregistrer la séquence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
