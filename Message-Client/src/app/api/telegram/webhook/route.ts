import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import nodemailer from 'nodemailer';
import { generateTrackingId, wrapEmailWithTracking } from '@/lib/tracking';

// ============================================================
// ENHANCED SYSTEM PROMPT - 20+ Actions with Context Awareness
// ============================================================
function buildSystemPrompt(context: {
  clientsList: string;
  recentReplies: string;
  schedulesInfo: string;
  pendingActions: string;
  flowsList: string;
}) {
  return `Tu es l'assistant IA de FPA Collections Agent, un système intelligent de recouvrement de créances pour FinancePro Advisory.
Tu comprends les commandes en français (et en arabe translittéré) et les exécutes. Tu réponds toujours en français de manière professionnelle.

## CONTEXTE ACTUEL
### Clients actifs:
${context.clientsList || 'Aucun client.'}

### Réponses récentes des clients:
${context.recentReplies || 'Aucune réponse récente.'}

### Planifications actives:
${context.schedulesInfo || 'Aucune planification.'}

### Actions en attente:
${context.pendingActions || 'Aucune action en attente.'}

### Flux d'automatisation (scénarios) disponibles:
${context.flowsList || 'Aucun flux.'}

## ACTIONS DISPONIBLES
Réponds UNIQUEMENT avec un JSON valide:

### Lecture / Consultation (pas besoin d'approbation):
- "list" → Liste des clients actifs
- "stats" → Statistiques globales  
- "report" → Rapport complet détaillé
- "client_info" → Détails d'un client { clientName }
- "view_schedules" → Voir les planifications actives
- "view_templates" → Voir les templates disponibles
- "view_replies" → Voir les réponses clients récentes
- "view_opens" → Voir les emails ouverts par les clients
- "view_flows" → Voir les flux d'automatisation (scénarios) disponibles
- "search" → Rechercher un client { query }

### Gestion clients (exécution directe):
- "add_client" → Ajouter client { name, email, company, amount, currency, phone, dueDate }
- "edit_client" → Modifier client { clientName, field, value } (field: name/email/phone/company/amount/dueDate/notes)
- "delete_client" → Supprimer un client { clientName }
- "confirm_payment" → Confirmer paiement → arrête les relances { clientName }
- "partial_payment" → Paiement partiel { clientName, amountPaid }

### Gestion des relances (exécution directe):
- "pause_client" → Suspendre relances d'un client { clientName }
- "resume_client" → Reprendre relances d'un client { clientName }
- "pause_all" → Suspendre TOUTES les relances
- "resume_all" → Reprendre TOUTES les relances
- "change_frequency" → Changer fréquence { clientName, frequency: daily/weekly/biweekly/monthly }
- "set_flow" → Assigner un flux d'automatisation à un client { clientName, flowId }
- "escalate" → Escalader le niveau { clientName }
- "edit_schedule" → Modifier planification { clientName, time, days }

### ⚠️ Actions nécessitant APPROBATION (envoi de messages):
- "send_message" → Envoyer un template à un client { clientName, templateName/templateId, customSubject, customBody }
- "custom_message" → Créer et envoyer un message personnalisé { clientName, subject, body }
- "reply_client" → Répondre à un client qui a répondu { clientName, replyBody }
- "broadcast" → Envoyer un message à tous les clients actifs { subject, body }

## FORMAT DE RÉPONSE
\`\`\`json
{
  "action": "nom_action",
  "params": { ... },
  "response": "Message de confirmation pour l'admin",
  "needsApproval": true/false
}
\`\`\`

## RÈGLES IMPORTANTES:
1. Pour les actions d'envoi (send_message, custom_message, reply_client, broadcast): TOUJOURS mettre needsApproval: true
2. Pour les actions de gestion et consultation: needsApproval: false
3. Si la demande mentionne un client, cherche-le dans la liste et utilise son nom exact
4. Si le client n'existe pas, suggère les noms similaires
5. Pour custom_message: génère un sujet et corps professionnel basé sur la demande de l'admin
6. Pour reply_client: rédige une réponse professionnelle tenant compte du contexte de la réponse du client
7. Utilise les variables {{nom}}, {{montant}}, {{devise}}, {{entreprise}} dans les messages

Si tu ne comprends pas la demande, retourne action: "unknown" avec une réponse utile.`;
}

// ============================================================
// AI CALL
// ============================================================
async function callAI(message: string, settings: Record<string, string>, context: {
  clientsList: string;
  recentReplies: string;
  schedulesInfo: string;
  pendingActions: string;
  flowsList: string;
}) {
  const apiKey = settings.openrouter_api_key;
  const model = settings.openrouter_model || 'google/gemini-2.5-flash';

  if (!apiKey) return { action: 'unknown', params: {}, response: '❌ Clé API OpenRouter non configurée.', needsApproval: false };

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        { role: 'user', content: message },
      ],
      temperature: 0.1,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* fallback */ }

  return { action: 'unknown', params: {}, response: content || 'Erreur de traitement.', needsApproval: false };
}

// ============================================================
// BUILD CONTEXT from DB
// ============================================================
function buildContext(db: ReturnType<typeof getDb>) {
  // Clients list
  const clients = db.prepare(`
    SELECT id, name, company, email, phone, amount_due, currency, status, escalation_level, messages_sent, due_date, notes
    FROM clients WHERE is_active = 1 ORDER BY amount_due DESC LIMIT 30
  `).all() as Record<string, string | number>[];

  const clientsList = clients.map(c =>
    `• [${c.id}] ${c.name} (${c.company || 'N/A'}) | ${c.email} | ${new Intl.NumberFormat('fr-FR').format(c.amount_due as number)} ${c.currency} | Status: ${c.status} | Escalade: ${c.escalation_level} | Messages: ${c.messages_sent}`
  ).join('\n') || 'Aucun client.';

  // Recent replies
  const replies = db.prepare(`
    SELECT n.title, n.message, n.created_at, c.name as client_name
    FROM notifications n
    LEFT JOIN clients c ON n.client_id = c.id
    WHERE n.type = 'reply'
    ORDER BY n.created_at DESC LIMIT 5
  `).all() as Record<string, string>[];

  const recentReplies = replies.map(r =>
    `• ${r.client_name}: ${r.title} (${r.created_at})\n  ${(r.message || '').substring(0, 100)}`
  ).join('\n') || 'Aucune.';

  // Schedules
  const schedules = db.prepare(`
    SELECT s.id, s.frequency, s.time_of_day, s.is_active, s.next_run, c.name as client_name, t.name as template_name
    FROM schedules s
    JOIN clients c ON s.client_id = c.id
    LEFT JOIN templates t ON s.template_id = t.id
    ORDER BY s.is_active DESC LIMIT 20
  `).all() as Record<string, string | number>[];

  const schedulesInfo = schedules.map(s =>
    `• ${s.client_name} → ${s.template_name || 'Auto'} | ${s.frequency} à ${s.time_of_day} | ${s.is_active ? '🟢 Actif' : '🔴 Inactif'}`
  ).join('\n') || 'Aucune.';

  // Pending actions
  const pending = db.prepare(`
    SELECT pa.id, pa.action_type, pa.preview_text, pa.created_at, c.name as client_name
    FROM pending_actions pa
    LEFT JOIN clients c ON pa.target_client_id = c.id
    WHERE pa.status = 'pending'
    ORDER BY pa.created_at DESC LIMIT 5
  `).all() as Record<string, string | number>[];

  const pendingActions = pending.map(p =>
    `• [#${p.id}] ${p.action_type} → ${p.client_name || 'N/A'}: ${(p.preview_text as string || '').substring(0, 80)}`
  ).join('\n') || 'Aucune.';

  // Automation flows list
  const flows = db.prepare('SELECT id, name FROM automation_flows').all() as { id: number; name: string }[];
  const flowsList = flows.map(f => `• [ID ${f.id}] ${f.name}`).join('\n') || 'Aucun.';

  return { clientsList, recentReplies, schedulesInfo, pendingActions, flowsList };
}

// ============================================================
// EXECUTE ACTIONS (Non-approval actions)
// ============================================================
async function executeAction(action: string, params: Record<string, string>, db: ReturnType<typeof getDb>): Promise<string | null> {
  switch (action) {
    case 'list': {
      const clients = db.prepare("SELECT name, company, amount_due, currency, status, escalation_level, email FROM clients WHERE status != 'paid' AND is_active = 1 ORDER BY amount_due DESC LIMIT 20").all() as Record<string, string | number>[];
      if (clients.length === 0) return '📋 Aucun client actif trouvé.';
      let text = '📋 *Liste des clients actifs:*\n\n';
      clients.forEach((c, i) => {
        const statusEmoji: Record<string, string> = { pending: '🟡', partial: '🔵', disputed: '🔴', suspended: '⚪' };
        text += `${i + 1}. ${statusEmoji[c.status as string] || '🟡'} *${c.name}*\n   🏢 ${c.company || 'N/A'}\n   💰 ${new Intl.NumberFormat('fr-FR').format(c.amount_due as number)} ${c.currency}\n   📧 ${c.email}\n   📊 Niveau: ${c.escalation_level}\n\n`;
      });
      return text;
    }

    case 'stats': {
      const total = (db.prepare('SELECT COUNT(*) as c FROM clients WHERE is_active = 1').get() as { c: number }).c;
      const active = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE status != 'paid' AND is_active = 1").get() as { c: number }).c;
      const paid = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'paid'").get() as { c: number }).c;
      const suspended = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'suspended'").get() as { c: number }).c;
      const debt = (db.prepare("SELECT COALESCE(SUM(amount_due), 0) as t FROM clients WHERE status != 'paid' AND is_active = 1").get() as { t: number }).t;
      const sent = (db.prepare("SELECT COUNT(*) as c FROM message_logs WHERE sent_at >= datetime('now', '-30 days') AND status = 'sent'").get() as { c: number }).c;
      const replies = (db.prepare("SELECT COUNT(*) as c FROM notifications WHERE type = 'reply'").get() as { c: number }).c;
      const pending = (db.prepare("SELECT COUNT(*) as c FROM pending_actions WHERE status = 'pending'").get() as { c: number }).c;

      return `📊 *Statistiques FPA Collections:*\n\n👥 Total clients: ${total}\n🔄 Clients actifs: ${active}\n✅ Payés: ${paid}\n⏸ Suspendus: ${suspended}\n\n💰 Créances totales: ${new Intl.NumberFormat('fr-FR').format(debt)} MAD\n📧 Messages (30j): ${sent}\n📩 Réponses reçues: ${replies}\n⏳ Actions en attente: ${pending}`;
    }

    case 'report': {
      const clients = db.prepare("SELECT name, company, amount_due, currency, status, escalation_level, messages_sent, last_message_at FROM clients WHERE is_active = 1 ORDER BY amount_due DESC").all() as Record<string, string | number>[];
      const totalDebt = (db.prepare("SELECT COALESCE(SUM(amount_due), 0) as t FROM clients WHERE status != 'paid' AND is_active = 1").get() as { t: number }).t;
      let text = `📋 *Rapport Complet FPA*\n📅 ${new Date().toLocaleDateString('fr-FR')}\n\n💰 *Total créances: ${new Intl.NumberFormat('fr-FR').format(totalDebt)} MAD*\n\n`;
      const levelLabels: Record<string, string> = { friendly: '🟢 Amical', formal: '🟡 Formel', urgent: '🟠 Urgent', final: '🔴 Final' };
      clients.forEach((c, i) => {
        text += `${i + 1}. *${c.name}* (${c.company || '-'})\n   💰 ${new Intl.NumberFormat('fr-FR').format(c.amount_due as number)} ${c.currency}\n   📊 ${levelLabels[c.escalation_level as string] || c.escalation_level} | ✉️ ${c.messages_sent} msgs\n\n`;
      });
      return text;
    }

    case 'client_info': {
      const client = db.prepare("SELECT * FROM clients WHERE name LIKE ? AND is_active = 1").get(`%${params.clientName}%`) as Record<string, string | number> | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      const schedule = db.prepare("SELECT frequency, time_of_day, is_active, next_run FROM schedules WHERE client_id = ?").get(client.id) as Record<string, string | number> | undefined;
      const msgCount = (db.prepare("SELECT COUNT(*) as c FROM message_logs WHERE client_id = ? AND status = 'sent'").get(client.id) as { c: number }).c;
      const replyCount = (db.prepare("SELECT COUNT(*) as c FROM notifications WHERE client_id = ? AND type = 'reply'").get(client.id) as { c: number }).c;
      const levelLabels: Record<string, string> = { friendly: '🟢 Amical', formal: '🟡 Formel', urgent: '🟠 Urgent', final: '🔴 Final' };
      const statusLabels: Record<string, string> = { pending: '🟡 En attente', partial: '🔵 Partiel', paid: '✅ Payé', disputed: '🔴 Contesté', suspended: '⚪ Suspendu' };

      return `👤 *Fiche Client: ${client.name}*\n\n🏢 Entreprise: ${client.company || 'N/A'}\n📧 Email: ${client.email}\n📞 Téléphone: ${client.phone || 'N/A'}\n\n💰 Montant dû: *${new Intl.NumberFormat('fr-FR').format(client.amount_due as number)} ${client.currency}*\n📅 Échéance: ${client.due_date || 'N/A'}\n📊 Statut: ${statusLabels[client.status as string] || client.status}\n⬆️ Escalade: ${levelLabels[client.escalation_level as string] || client.escalation_level}\n\n✉️ Messages envoyés: ${msgCount}\n📩 Réponses reçues: ${replyCount}\n📝 Notes: ${client.notes || 'Aucune'}\n\n📅 Planification: ${schedule ? `${schedule.frequency} à ${schedule.time_of_day} (${schedule.is_active ? '🟢 Actif' : '🔴 Inactif'})` : 'Aucune'}`;
    }

    case 'search': {
      const results = db.prepare("SELECT name, company, email, amount_due, currency, status FROM clients WHERE (name LIKE ? OR company LIKE ? OR email LIKE ?) AND is_active = 1 LIMIT 10").all(`%${params.query}%`, `%${params.query}%`, `%${params.query}%`) as Record<string, string | number>[];
      if (results.length === 0) return `🔍 Aucun résultat pour "${params.query}".`;
      let text = `🔍 *Résultats pour "${params.query}":*\n\n`;
      results.forEach((c, i) => { text += `${i + 1}. *${c.name}* (${c.company || '-'}) - ${new Intl.NumberFormat('fr-FR').format(c.amount_due as number)} ${c.currency}\n   📧 ${c.email} | ${c.status}\n\n`; });
      return text;
    }

    case 'add_client': {
      if (!params.name || !params.email) return '❌ Nom et email requis pour ajouter un client.';
      const result = db.prepare("INSERT INTO clients (name, email, company, amount_due, currency, phone, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
        params.name, params.email, params.company || '', parseFloat(params.amount || '0'), params.currency || 'MAD', params.phone || '', params.dueDate || null
      );
      // Auto-create schedule
      db.prepare("INSERT INTO schedules (client_id, frequency, time_of_day) VALUES (?, 'weekly', '09:00')").run(result.lastInsertRowid);
      return `✅ Client *${params.name}* ajouté avec succès!\n\n📧 ${params.email}\n💰 ${params.amount || '0'} ${params.currency || 'MAD'}\n📅 Relance hebdomadaire programmée.`;
    }

    case 'edit_client': {
      const client = db.prepare("SELECT id, name FROM clients WHERE name LIKE ? AND is_active = 1").get(`%${params.clientName}%`) as { id: number; name: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      const fieldMap: Record<string, string> = { name: 'name', email: 'email', phone: 'phone', company: 'company', amount: 'amount_due', dueDate: 'due_date', notes: 'notes', due_date: 'due_date' };
      const dbField = fieldMap[params.field] || params.field;
      if (!dbField) return '❌ Champ non reconnu.';
      const value = params.field === 'amount' ? parseFloat(params.value) : params.value;
      db.prepare(`UPDATE clients SET ${dbField} = ?, updated_at = datetime('now') WHERE id = ?`).run(value, client.id);
      return `✅ Client *${client.name}* mis à jour:\n📝 ${params.field} → ${params.value}`;
    }

    case 'delete_client': {
      const client = db.prepare("SELECT id, name FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; name: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      db.prepare("DELETE FROM clients WHERE id = ?").run(client.id);
      return `🗑 Client *${client.name}* supprimé définitivement.`;
    }

    case 'confirm_payment': {
      const client = db.prepare("SELECT id, name, amount_due, currency FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; name: string; amount_due: number; currency: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      db.prepare("UPDATE clients SET status = 'paid', amount_due = 0, updated_at = datetime('now') WHERE id = ?").run(client.id);
      db.prepare("UPDATE schedules SET is_active = 0 WHERE client_id = ?").run(client.id);
      return `✅ *Paiement confirmé pour ${client.name}!*\n\n💰 ${new Intl.NumberFormat('fr-FR').format(client.amount_due)} ${client.currency} → Payé\n📧 Relances automatiques arrêtées.`;
    }

    case 'partial_payment': {
      const client = db.prepare("SELECT id, name, amount_due, currency FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; name: string; amount_due: number; currency: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      const amountPaid = parseFloat(params.amountPaid || '0');
      const remaining = client.amount_due - amountPaid;
      db.prepare("UPDATE clients SET amount_due = ?, status = 'partial', updated_at = datetime('now') WHERE id = ?").run(Math.max(0, remaining), client.id);
      return `💳 *Paiement partiel enregistré pour ${client.name}:*\n\n💰 Payé: ${new Intl.NumberFormat('fr-FR').format(amountPaid)} ${client.currency}\n💰 Reste: ${new Intl.NumberFormat('fr-FR').format(Math.max(0, remaining))} ${client.currency}`;
    }

    case 'pause_client': {
      const client = db.prepare("SELECT id, name FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; name: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      db.prepare("UPDATE clients SET status = 'suspended', updated_at = datetime('now') WHERE id = ?").run(client.id);
      db.prepare("UPDATE schedules SET is_active = 0 WHERE client_id = ?").run(client.id);
      return `⏸ Relances *suspendues* pour *${client.name}*.`;
    }

    case 'resume_client': {
      const client = db.prepare("SELECT id, name FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; name: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      db.prepare("UPDATE clients SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(client.id);
      db.prepare("UPDATE schedules SET is_active = 1 WHERE client_id = ?").run(client.id);
      return `▶️ Relances *reprises* pour *${client.name}*.`;
    }

    case 'pause_all': {
      db.prepare("UPDATE schedules SET is_active = 0").run();
      db.prepare("UPDATE clients SET status = 'suspended' WHERE status NOT IN ('paid')").run();
      return '⏸ *TOUTES les relances ont été suspendues.*\n\nUtilisez "reprendre toutes les relances" pour les réactiver.';
    }

    case 'resume_all': {
      db.prepare("UPDATE schedules SET is_active = 1").run();
      db.prepare("UPDATE clients SET status = 'pending' WHERE status = 'suspended'").run();
      return '▶️ *TOUTES les relances ont été réactivées.*';
    }

    case 'change_frequency': {
      const client = db.prepare("SELECT id, name FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; name: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      const freq = params.frequency || 'weekly';
      db.prepare("UPDATE schedules SET frequency = ? WHERE client_id = ?").run(freq, client.id);
      const freqLabels: Record<string, string> = { daily: '📅 Quotidien', weekly: '📆 Hebdomadaire', biweekly: '📆 Bi-mensuel', monthly: '🗓 Mensuel' };
      return `🔄 Fréquence pour *${client.name}* → ${freqLabels[freq] || freq}`;
    }

    case 'escalate': {
      const client = db.prepare("SELECT id, escalation_level, name FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; escalation_level: string; name: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      const levels = ['friendly', 'formal', 'urgent', 'final'];
      const levelLabels: Record<string, string> = { friendly: '🟢 Amical', formal: '🟡 Formel', urgent: '🟠 Urgent', final: '🔴 Final' };
      const currentIndex = levels.indexOf(client.escalation_level);
      const nextLevel = levels[Math.min(currentIndex + 1, levels.length - 1)];
      db.prepare("UPDATE clients SET escalation_level = ?, updated_at = datetime('now') WHERE id = ?").run(nextLevel, client.id);
      return `⬆️ *Escalade pour ${client.name}:*\n\n${levelLabels[client.escalation_level]} → ${levelLabels[nextLevel]}`;
    }

    case 'edit_schedule': {
      const client = db.prepare("SELECT id, name FROM clients WHERE name LIKE ?").get(`%${params.clientName}%`) as { id: number; name: string } | undefined;
      if (!client) return `❌ Client "${params.clientName}" non trouvé.`;
      if (params.time) db.prepare("UPDATE schedules SET time_of_day = ? WHERE client_id = ?").run(params.time, client.id);
      if (params.days) db.prepare("UPDATE schedules SET days_of_week = ? WHERE client_id = ?").run(params.days, client.id);
      return `✅ Planification mise à jour pour *${client.name}*.${params.time ? `\n⏰ Heure: ${params.time}` : ''}${params.days ? `\n📅 Jours: ${params.days}` : ''}`;
    }

    case 'view_schedules': {
      const schedules = db.prepare(`
        SELECT s.frequency, s.time_of_day, s.is_active, c.name, c.amount_due, c.currency
        FROM schedules s JOIN clients c ON s.client_id = c.id
        ORDER BY s.is_active DESC, c.name LIMIT 20
      `).all() as Record<string, string | number>[];
      if (schedules.length === 0) return '📅 Aucune planification trouvée.';
      let text = '📅 *Planifications de relance:*\n\n';
      schedules.forEach((s, i) => {
        const freqLabels: Record<string, string> = { daily: 'Quotidien', weekly: 'Hebdo', biweekly: 'Bi-mensuel', monthly: 'Mensuel' };
        text += `${i + 1}. ${s.is_active ? '🟢' : '🔴'} *${s.name}*\n   📆 ${freqLabels[s.frequency as string] || s.frequency} à ${s.time_of_day}\n   💰 ${new Intl.NumberFormat('fr-FR').format(s.amount_due as number)} ${s.currency}\n\n`;
      });
      return text;
    }

    case 'view_templates': {
      const templates = db.prepare("SELECT id, name, subject, escalation_level FROM templates ORDER BY id").all() as Record<string, string | number>[];
      if (templates.length === 0) return '📝 Aucun template trouvé.';
      const levelLabels: Record<string, string> = { friendly: '🟢', formal: '🟡', urgent: '🟠', final: '🔴' };
      let text = '📝 *Templates disponibles:*\n\n';
      templates.forEach(t => {
        text += `${levelLabels[t.escalation_level as string] || '📝'} *${t.name}* [#${t.id}]\n   📋 ${t.subject}\n\n`;
      });
      return text;
    }

    case 'view_replies': {
      const replies = db.prepare(`
        SELECT n.title, n.message, n.created_at, n.is_read, c.name as client_name, c.amount_due, c.currency
        FROM notifications n LEFT JOIN clients c ON n.client_id = c.id
        WHERE n.type = 'reply' ORDER BY n.created_at DESC LIMIT 10
      `).all() as Record<string, string | number>[];
      if (replies.length === 0) return '📩 Aucune réponse client reçue.';
      let text = '📩 *Réponses clients récentes:*\n\n';
      replies.forEach((r, i) => {
        const msg = (r.message as string || '').split('\n').slice(0, 2).join('\n');
        text += `${i + 1}. ${r.is_read ? '📖' : '📩'} *${r.client_name}* (${new Intl.NumberFormat('fr-FR').format(r.amount_due as number)} ${r.currency})\n   ${msg.substring(0, 100)}\n   ⏰ ${r.created_at}\n\n`;
      });
      return text;
    }

    case 'view_opens': {
      const opens = db.prepare(`
        SELECT ml.subject, ml.opened_at, ml.open_count, ml.sent_at, ml.tracking_id,
               c.name as client_name, c.email as client_email, c.amount_due, c.currency
        FROM message_logs ml JOIN clients c ON ml.client_id = c.id
        WHERE ml.opened_at IS NOT NULL
        ORDER BY ml.opened_at DESC LIMIT 15
      `).all() as Record<string, string | number>[];

      const totalSent = (db.prepare("SELECT COUNT(*) as c FROM message_logs WHERE status = 'sent' AND channel = 'email'").get() as { c: number }).c;
      const totalOpened = (db.prepare("SELECT COUNT(*) as c FROM message_logs WHERE opened_at IS NOT NULL").get() as { c: number }).c;
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;

      if (opens.length === 0) {
        return `📬 *Aucun email ouvert pour le moment.*\n\n📧 Total envoyés: ${totalSent}\n📭 Taux d'ouverture: 0%`;
      }

      let text = `📬 *Emails ouverts par les clients:*\n\n`;
      text += `📊 *Statistiques:* ${totalOpened}/${totalSent} ouverts (${openRate}%)\n\n`;

      opens.forEach((o, i) => {
        const openTime = (o.opened_at as string || '').substring(0, 16);
        text += `${i + 1}. 👤 *${o.client_name}*\n`;
        text += `   📋 ${(o.subject as string || '').substring(0, 50)}\n`;
        text += `   🕐 Ouvert: ${openTime}${(o.open_count as number) > 1 ? ` (${o.open_count}x)` : ''}\n`;
        text += `   💰 ${new Intl.NumberFormat('fr-FR').format(o.amount_due as number)} ${o.currency}\n\n`;
      });

      // Show clients who didn't open
      const notOpened = db.prepare(`
        SELECT DISTINCT c.name FROM message_logs ml JOIN clients c ON ml.client_id = c.id
        WHERE ml.status = 'sent' AND ml.channel = 'email' AND ml.opened_at IS NULL
        AND c.status NOT IN ('paid') AND c.is_active = 1
        LIMIT 5
      `).all() as { name: string }[];

      if (notOpened.length > 0) {
        text += `📭 *Non ouverts:* ${notOpened.map(n => n.name).join(', ')}`;
      }

      return text;
    }

    case 'view_flows': {
      const flows = db.prepare(`
        SELECT af.*, COUNT(c.id) as client_count 
        FROM automation_flows af 
        LEFT JOIN clients c ON af.id = c.automation_flow_id AND c.is_active = 1
        GROUP BY af.id
        ORDER BY af.is_default DESC, af.created_at DESC
      `).all() as Record<string, string | number>[];

      if (flows.length === 0) return '📝 Aucun flux d\'automatisation trouvé.';

      let text = '⚙️ *Flux d\'automatisation (Scénarios):*\n\n';
      flows.forEach(f => {
        const steps = JSON.parse(f.steps as string || '[]');
        const defaultBadge = f.is_default ? ' 🌟 [Par défaut]' : '';
        text += `*${f.id}. ${f.name}* (${f.client_count} client(s))${defaultBadge}\n`;
        text += `   _${f.description || 'Pas de description.'}_\n`;
        
        const stepsText = steps.map((s: any, idx: number) => {
          const template = db.prepare('SELECT name FROM templates WHERE id = ?').get(s.template_id) as { name: string } | undefined;
          return `   • Étape ${idx + 1}: ${template?.name || 'Template #' + s.template_id} (Délai: ${s.delay_days}j)`;
        }).join('\n');
        
        text += `${stepsText}\n\n`;
      });
      return text;
    }

    case 'set_flow': {
      const clientName = params.clientName;
      const flowId = parseInt(params.flowId);

      if (!clientName || isNaN(flowId)) return '❌ Nom du client et ID du flux requis.';

      const client = db.prepare("SELECT id, name FROM clients WHERE (name LIKE ? OR id = ?) AND is_active = 1").get(`%${clientName}%`, clientName) as { id: number; name: string } | undefined;
      if (!client) return `❌ Client "${clientName}" non trouvé.`;

      const flow = db.prepare("SELECT id, name, steps FROM automation_flows WHERE id = ?").get(flowId) as { id: number; name: string; steps: string } | undefined;
      if (!flow) return `❌ Flux d'automatisation #${flowId} non trouvé.`;

      // Reset client steps and update flow ID
      db.prepare(`
        UPDATE clients 
        SET automation_flow_id = ?, current_flow_step_index = 0, flow_started_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(flow.id, client.id);

      // Reschedule next run according to the first step of the new flow
      let delayStr = '+1 day';
      try {
        const steps = JSON.parse(flow.steps || '[]');
        if (steps.length > 0 && steps[0].delay_days !== undefined) {
          delayStr = `+${steps[0].delay_days} days`;
        }
      } catch (_) {}

      db.prepare("UPDATE schedules SET next_run = datetime('now', ?), is_active = 1 WHERE client_id = ?")
        .run(delayStr, client.id);

      return `✅ Flux d'automatisation mis à jour pour *${client.name}*!\n🔄 Flux assigné: *${flow.name}*\n📅 Prochaine relance planifiée dans ${delayStr.replace('+', '').replace('days', 'jours')}.`;
    }

    default:
      return null;
  }
}

// ============================================================
// HANDLE APPROVAL ACTIONS (send_message, custom_message, reply_client, broadcast)
// ============================================================
async function handleApprovalAction(
  action: string,
  params: Record<string, string>,
  db: ReturnType<typeof getDb>,
  botToken: string,
  chatId: string
) {
  let previewText = '';
  let clientId: number | null = null;
  let actionData: Record<string, string> = {};

  if (action === 'send_message' || action === 'custom_message') {
    const client = db.prepare("SELECT id, name, email, company, amount_due, currency FROM clients WHERE name LIKE ? AND is_active = 1").get(`%${params.clientName}%`) as { id: number; name: string; email: string; company: string; amount_due: number; currency: string } | undefined;
    if (!client) {
      await sendTelegram(botToken, chatId, `❌ Client "${params.clientName}" non trouvé.`);
      return;
    }
    clientId = client.id;

    let subject = params.customSubject || params.subject || '';
    let body = params.customBody || params.body || '';

    // If template specified, load it
    if (params.templateId || params.templateName) {
      const template = params.templateId
        ? db.prepare("SELECT * FROM templates WHERE id = ?").get(params.templateId) as Record<string, string> | undefined
        : db.prepare("SELECT * FROM templates WHERE name LIKE ?").get(`%${params.templateName}%`) as Record<string, string> | undefined;
      if (template) {
        subject = subject || template.subject;
        body = body || template.body;
      }
    }

    // Replace variables
    const companyName = (db.prepare("SELECT value FROM settings WHERE key = 'company_name'").get() as { value: string })?.value || 'FinancePro Advisory';
    subject = replaceVars(subject, client, companyName);
    body = replaceVars(body, client, companyName);

    actionData = { clientId: String(client.id), email: client.email, subject, body, clientName: client.name };
    previewText = `📧 *Aperçu du message:*\n\n👤 *Destinataire:* ${client.name}\n📧 *Email:* ${client.email}\n📋 *Sujet:* ${subject}\n\n✉️ *Contenu:*\n${body.substring(0, 500)}${body.length > 500 ? '...' : ''}`;

  } else if (action === 'reply_client') {
    const client = db.prepare("SELECT id, name, email, company, amount_due, currency FROM clients WHERE name LIKE ? AND is_active = 1").get(`%${params.clientName}%`) as { id: number; name: string; email: string; company: string; amount_due: number; currency: string } | undefined;
    if (!client) {
      await sendTelegram(botToken, chatId, `❌ Client "${params.clientName}" non trouvé.`);
      return;
    }
    clientId = client.id;
    const replyBody = params.replyBody || params.body || '';
    const companyName = (db.prepare("SELECT value FROM settings WHERE key = 'company_name'").get() as { value: string })?.value || 'FinancePro Advisory';

    actionData = { clientId: String(client.id), email: client.email, subject: `Re: Rappel de paiement - ${client.company || client.name}`, body: replyBody, clientName: client.name };
    previewText = `↩️ *Réponse au client:*\n\n👤 *Destinataire:* ${client.name}\n📧 *Email:* ${client.email}\n\n✉️ *Votre réponse:*\n${replaceVars(replyBody, client, companyName).substring(0, 500)}`;

  } else if (action === 'broadcast') {
    const activeClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE status != 'paid' AND is_active = 1").get() as { c: number };
    actionData = { subject: params.subject || '', body: params.body || '', type: 'broadcast' };
    previewText = `📢 *Message groupé:*\n\n👥 *Destinataires:* ${activeClients.c} clients actifs\n📋 *Sujet:* ${params.subject || '(auto)'}\n\n✉️ *Contenu:*\n${(params.body || '').substring(0, 500)}`;
  }

  // Save pending action
  const result = db.prepare(`
    INSERT INTO pending_actions (action_type, source, target_client_id, data, preview_text, status)
    VALUES (?, 'telegram', ?, ?, ?, 'pending')
  `).run(action, clientId, JSON.stringify(actionData), previewText);

  const actionId = result.lastInsertRowid;

  // Send preview with inline keyboard
  await sendTelegramWithButtons(botToken, chatId,
    `${previewText}\n\n⏳ *En attente de votre confirmation:*`,
    [
      [
        { text: '✅ Confirmer l\'envoi', callback_data: `approve_${actionId}` },
        { text: '❌ Annuler', callback_data: `reject_${actionId}` },
      ],
      [
        { text: '✏️ Modifier le message', callback_data: `edit_${actionId}` },
      ],
    ]
  );
}

// ============================================================
// HANDLE CALLBACK QUERIES (button clicks)
// ============================================================
async function handleCallbackQuery(
  callbackQuery: { id: string; data: string; message?: { chat: { id: number }; message_id: number } },
  db: ReturnType<typeof getDb>,
  botToken: string
) {
  const data = callbackQuery.data;
  const chatId = String(callbackQuery.message?.chat?.id || '');
  const messageId = callbackQuery.message?.message_id;

  // Answer the callback
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQuery.id }),
  });

  // Parse action
  const match = data.match(/^(approve|reject|edit)_(\d+)$/);
  if (!match) return;

  const [, actionType, actionIdStr] = match;
  const actionId = parseInt(actionIdStr);

  const pendingAction = db.prepare("SELECT * FROM pending_actions WHERE id = ? AND status = 'pending'").get(actionId) as Record<string, string | number> | undefined;
  if (!pendingAction) {
    await editTelegramMessage(botToken, chatId, messageId!, '❌ Cette action a expiré ou a déjà été traitée.');
    return;
  }

  if (actionType === 'approve') {
    // Execute the action
    const actionData = JSON.parse(pendingAction.data as string);
    let resultText = '';

    if (['send_message', 'custom_message', 'reply_client'].includes(pendingAction.action_type as string)) {
      // Send email
      try {
        const getSetting = (key: string): string => {
          const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
          return row?.value || '';
        };
        const transporter = nodemailer.createTransport({
          host: getSetting('smtp_host'),
          port: parseInt(getSetting('smtp_port') || '465'),
          secure: parseInt(getSetting('smtp_port') || '465') === 465,
          auth: { user: getSetting('smtp_user'), pass: getSetting('smtp_pass') },
          tls: { rejectUnauthorized: false },
        });

        const companyName = getSetting('company_name') || 'FinancePro Advisory';
        const trackingId = generateTrackingId();
        const htmlBody = wrapEmailWithTracking(actionData.body.replace(/\n/g, '<br>'), trackingId);

        await transporter.sendMail({
          from: `"${companyName}" <${getSetting('smtp_from')}>`,
          to: actionData.email,
          subject: actionData.subject,
          text: actionData.body,
          html: htmlBody,
        });

        // Log the message with tracking ID
        db.prepare(`INSERT INTO message_logs (client_id, channel, subject, body, status, tracking_id, sent_at) VALUES (?, 'email', ?, ?, 'sent', ?, datetime('now'))`).run(
          actionData.clientId, actionData.subject, actionData.body, trackingId
        );
        db.prepare("UPDATE clients SET messages_sent = messages_sent + 1, last_message_at = datetime('now') WHERE id = ?").run(actionData.clientId);

        resultText = `✅ *Message envoyé avec succès!*\n\n👤 Destinataire: ${actionData.clientName}\n📧 Email: ${actionData.email}\n📋 Sujet: ${actionData.subject}`;
      } catch (err) {
        resultText = `❌ *Échec de l'envoi:*\n${String(err).substring(0, 200)}`;
        db.prepare("UPDATE pending_actions SET status = 'rejected' WHERE id = ?").run(actionId);
        await editTelegramMessage(botToken, chatId, messageId!, resultText);
        return;
      }
    } else if (pendingAction.action_type === 'broadcast') {
      const clients = db.prepare("SELECT id, name, email, company, amount_due, currency FROM clients WHERE status != 'paid' AND is_active = 1").all() as Record<string, string | number>[];
      let sent = 0;
      const getSetting = (key: string): string => {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
        return row?.value || '';
      };
      const companyName = getSetting('company_name') || 'FinancePro Advisory';
      const transporter = nodemailer.createTransport({
        host: getSetting('smtp_host'),
        port: parseInt(getSetting('smtp_port') || '465'),
        secure: parseInt(getSetting('smtp_port') || '465') === 465,
        auth: { user: getSetting('smtp_user'), pass: getSetting('smtp_pass') },
        tls: { rejectUnauthorized: false },
      });

      for (const client of clients) {
        try {
          const subject = replaceVars(actionData.subject, client, companyName);
          const body = replaceVars(actionData.body, client, companyName);
          const bTrackId = generateTrackingId();
          const bHtml = wrapEmailWithTracking(body.replace(/\n/g, '<br>'), bTrackId);
          await transporter.sendMail({
            from: `"${companyName}" <${getSetting('smtp_from')}>`,
            to: client.email as string,
            subject,
            text: body,
            html: bHtml,
          });
          db.prepare(`INSERT INTO message_logs (client_id, channel, subject, body, status, tracking_id, sent_at) VALUES (?, 'email', ?, ?, 'sent', ?, datetime('now'))`).run(client.id, subject, body, bTrackId);
          db.prepare("UPDATE clients SET messages_sent = messages_sent + 1, last_message_at = datetime('now') WHERE id = ?").run(client.id);
          sent++;
          await new Promise(r => setTimeout(r, 1000)); // Rate limit
        } catch { /* continue */ }
      }
      resultText = `📢 *Broadcast terminé!*\n\n✅ ${sent}/${clients.length} messages envoyés.`;
    }

    db.prepare("UPDATE pending_actions SET status = 'approved' WHERE id = ?").run(actionId);
    await editTelegramMessage(botToken, chatId, messageId!, resultText);

  } else if (actionType === 'reject') {
    db.prepare("UPDATE pending_actions SET status = 'rejected' WHERE id = ?").run(actionId);
    await editTelegramMessage(botToken, chatId, messageId!, '❌ *Action annulée.*\n\nLe message n\'a pas été envoyé.');

  } else if (actionType === 'edit') {
    await editTelegramMessage(botToken, chatId, messageId!,
      `✏️ *Mode édition:*\n\nEnvoyez votre nouveau message dans le format:\n\n\`/edit ${actionId} Sujet: Nouveau sujet\nCorps: Nouveau contenu du message\`\n\nOu tapez /cancel pour annuler.`
    );
  }
}

// ============================================================
// VARIABLE REPLACEMENT
// ============================================================
function replaceVars(text: string, client: Record<string, string | number>, companyName: string): string {
  return text
    .replace(/\{\{nom\}\}/g, client.name as string)
    .replace(/\{\{name\}\}/g, client.name as string)
    .replace(/\{\{entreprise\}\}/g, (client.company as string) || '')
    .replace(/\{\{company\}\}/g, (client.company as string) || '')
    .replace(/\{\{montant\}\}/g, new Intl.NumberFormat('fr-FR').format(client.amount_due as number))
    .replace(/\{\{amount\}\}/g, String(client.amount_due || 0))
    .replace(/\{\{devise\}\}/g, (client.currency as string) || 'MAD')
    .replace(/\{\{currency\}\}/g, (client.currency as string) || 'MAD')
    .replace(/\{\{date_echeance\}\}/g, (client.due_date as string) || 'N/A')
    .replace(/\{\{email\}\}/g, (client.email as string) || '')
    .replace(/\{\{phone\}\}/g, (client.phone as string) || '')
    .replace(/\{\{company_name\}\}/g, companyName);
}

// ============================================================
// TELEGRAM HELPERS
// ============================================================
async function sendTelegram(token: string, chatId: string, text: string) {
  // Telegram has a 4096 char limit, split if needed
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.substring(0, 4000));
    remaining = remaining.substring(4000);
  }
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
  }
}

async function sendTelegramWithButtons(token: string, chatId: string, text: string, buttons: { text: string; callback_data: string }[][]) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    }),
  });
}

async function editTelegramMessage(token: string, chatId: string, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
    }),
  });
}

// ============================================================
// MAIN WEBHOOK HANDLER
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();

    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const botToken = getSetting('telegram_bot_token');
    const adminChatId = getSetting('telegram_admin_chat_id');

    // ==========================================
    // Handle callback queries (button clicks)
    // ==========================================
    if (body.callback_query) {
      if (adminChatId && String(body.callback_query.message?.chat?.id) !== adminChatId) {
        return NextResponse.json({ ok: true });
      }
      await handleCallbackQuery(body.callback_query, db, botToken);
      return NextResponse.json({ ok: true });
    }

    const message = body.message;
    if (!message || !message.text) return NextResponse.json({ ok: true });

    const chatId = String(message.chat.id);
    const text = message.text;

    // ==========================================
    // Link code handling
    // ==========================================
    const linkCode = getSetting('telegram_link_code');
    if (linkCode && text.trim() === linkCode) {
      db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'telegram_admin_chat_id'").run(chatId);
      db.prepare("UPDATE settings SET value = '', updated_at = datetime('now') WHERE key = 'telegram_link_code'").run();
      const firstName = message.chat.first_name || 'Admin';
      await sendTelegram(botToken, chatId,
        `🎉 *Félicitations ${firstName}!*\n\n✅ Votre compte Telegram a été lié avec succès à *FPA Collections Agent*.\n\nVous êtes maintenant l'administrateur.\nTapez /help pour voir toutes les commandes.`
      );
      return NextResponse.json({ ok: true });
    }

    // Security: Only respond to admin
    if (adminChatId && chatId !== adminChatId) {
      if (/^\d{6}$/.test(text.trim())) {
        await sendTelegram(botToken, chatId, '❌ Code invalide ou expiré.');
      }
      return NextResponse.json({ ok: true });
    }

    if (!adminChatId && text === '/start') {
      await sendTelegram(botToken, chatId,
        '🏦 *FPA Collections Agent*\n\nBienvenue! Pour lier votre compte:\n1️⃣ Tableau de bord → Paramètres → Telegram\n2️⃣ Générez un code de liaison\n3️⃣ Envoyez-le ici'
      );
      return NextResponse.json({ ok: true });
    }

    // ==========================================
    // Quick commands
    // ==========================================
    if (text === '/start') {
      await sendTelegram(botToken, chatId,
        '🏦 *FPA Collections Agent*\n\n' +
        'Bienvenue! Je suis votre assistant IA de recouvrement.\n\n' +
        '🧠 *Je comprends le français naturel!* Exemples:\n' +
        '• "Montre-moi la liste des clients"\n' +
        '• "Ajoute un client Mohamed, email@test.com, 50000 MAD"\n' +
        '• "Envoie un rappel à Ahmed"\n' +
        '• "Marque Société ABC comme payé"\n' +
        '• "Réponds à Omar: merci pour votre paiement"\n\n' +
        'Tapez /help pour toutes les commandes.'
      );
      return NextResponse.json({ ok: true });
    }

    if (text === '/help') {
      await sendTelegram(botToken, chatId,
        `📚 *Commandes disponibles:*\n\n` +
        `*📊 Consultation:*\n` +
        `/clients — Liste des clients\n` +
        `/stats — Statistiques globales\n` +
        `/report — Rapport complet\n` +
        `/schedules — Planifications actives\n` +
        `/templates — Templates disponibles\n` +
        `/replies — Réponses clients récentes\n` +
        `/opens — Emails ouverts par les clients\n` +
        `/flows — Séquences d'automation\n\n` +
        `*✍️ Gestion (en français):*\n` +
        `• "Info sur [client]"\n` +
        `• "Ajoute [nom], [email], [montant]"\n` +
        `• "Modifie [champ] de [client] à [valeur]"\n` +
        `• "Supprime [client]"\n\n` +
        `*💰 Paiements:*\n` +
        `• "Marque [client] comme payé"\n` +
        `• "[Client] a payé [montant] partiellement"\n\n` +
        `*📧 Messages (avec approbation):*\n` +
        `• "Envoie un rappel à [client]"\n` +
        `• "Envoie un message à [client]: [contenu]"\n` +
        `• "Réponds à [client]: [réponse]"\n\n` +
        `*⏸ Contrôle:*\n` +
        `• "Suspends les relances pour [client]"\n` +
        `• "Reprends les relances pour [client]"\n` +
        `• "Change la fréquence de [client] à [quotidien/hebdo/mensuel]"\n` +
        `• "Arrête toutes les relances"\n` +
        `• "Escalade [client]"\n` +
        `• "/setflow [nom_du_client] [id_du_flux]"\n\n` +
        `*✏️ Édition de messages en attente:*\n` +
        `/edit [id] Sujet: ...\nCorps: ...`
      );
      return NextResponse.json({ ok: true });
    }

    // Slash command shortcuts
    const slashCommands: Record<string, string> = {
      '/clients': 'list', '/stats': 'stats', '/report': 'report',
      '/schedules': 'view_schedules', '/templates': 'view_templates', '/replies': 'view_replies',
      '/opens': 'view_opens', '/flows': 'view_flows',
    };

    if (slashCommands[text]) {
      const result = await executeAction(slashCommands[text], {}, db);
      if (result) await sendTelegram(botToken, chatId, result);
      return NextResponse.json({ ok: true });
    }

    // Handle /setflow command
    if (text.startsWith('/setflow ')) {
      const match = text.match(/^\/setflow\s+(.+?)\s+(\d+)$/i);
      if (match) {
        const [, clientName, flowIdStr] = match;
        const result = await executeAction('set_flow', { clientName, flowId: flowIdStr }, db);
        await sendTelegram(botToken, chatId, result || '❌ Erreur.');
      } else {
        await sendTelegram(botToken, chatId, '⚠️ Format: `/setflow [nom_du_client] [id_du_flux]`');
      }
      return NextResponse.json({ ok: true });
    }

    // ==========================================
    // Handle /edit command for pending actions
    // ==========================================
    if (text.startsWith('/edit ')) {
      const editMatch = text.match(/^\/edit\s+(\d+)\s+Sujet:\s*(.+?)\nCorps:\s*([\s\S]+)$/i);
      if (editMatch) {
        const [, actionIdStr, newSubject, newBody] = editMatch;
        const actionId = parseInt(actionIdStr);
        const pending = db.prepare("SELECT * FROM pending_actions WHERE id = ? AND status = 'pending'").get(actionId) as Record<string, string | number> | undefined;
        if (!pending) {
          await sendTelegram(botToken, chatId, '❌ Action non trouvée ou expirée.');
          return NextResponse.json({ ok: true });
        }
        const actionData = JSON.parse(pending.data as string);
        actionData.subject = newSubject.trim();
        actionData.body = newBody.trim();
        const newPreview = `📧 *Message modifié:*\n\n👤 *Destinataire:* ${actionData.clientName}\n📋 *Sujet:* ${newSubject.trim()}\n\n✉️ *Contenu:*\n${newBody.trim().substring(0, 500)}`;
        db.prepare("UPDATE pending_actions SET data = ?, preview_text = ? WHERE id = ?").run(JSON.stringify(actionData), newPreview, actionId);

        await sendTelegramWithButtons(botToken, chatId,
          `${newPreview}\n\n✏️ *Message mis à jour!*\n⏳ *En attente de confirmation:*`,
          [
            [
              { text: '✅ Confirmer l\'envoi', callback_data: `approve_${actionId}` },
              { text: '❌ Annuler', callback_data: `reject_${actionId}` },
            ],
          ]
        );
        return NextResponse.json({ ok: true });
      } else {
        await sendTelegram(botToken, chatId, '⚠️ Format invalide.\n\nUtilisez:\n`/edit [id] Sujet: Nouveau sujet\nCorps: Nouveau contenu`');
        return NextResponse.json({ ok: true });
      }
    }

    if (text === '/cancel') {
      const pending = db.prepare("SELECT id FROM pending_actions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1").get() as { id: number } | undefined;
      if (pending) {
        db.prepare("UPDATE pending_actions SET status = 'rejected' WHERE id = ?").run(pending.id);
        await sendTelegram(botToken, chatId, '❌ Dernière action en attente annulée.');
      } else {
        await sendTelegram(botToken, chatId, '📋 Aucune action en attente à annuler.');
      }
      return NextResponse.json({ ok: true });
    }

    // ==========================================
    // Fast keyword matching (no AI needed)
    // ==========================================
    const textLower = text.toLowerCase().trim();

    // Direct keyword matching for common commands
    const keywordMatch = matchKeywords(textLower);
    if (keywordMatch) {
      if (keywordMatch.needsApproval) {
        await handleApprovalAction(keywordMatch.action, keywordMatch.params || {}, db, botToken, chatId);
      } else {
        const result = await executeAction(keywordMatch.action, keywordMatch.params || {}, db);
        if (result) {
          await sendTelegram(botToken, chatId, result);
        } else if (keywordMatch.response) {
          await sendTelegram(botToken, chatId, keywordMatch.response);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ==========================================
    // AI-powered natural language processing
    // ==========================================
    try {
      const settings: Record<string, string> = {};
      const allSettings = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
      allSettings.forEach((s) => { settings[s.key] = s.value; });

      // Build context
      const context = buildContext(db);
      const aiResult = await callAI(text, settings, context);

      if (aiResult.action && aiResult.action !== 'unknown') {
        if (aiResult.needsApproval) {
          await handleApprovalAction(aiResult.action, aiResult.params || {}, db, botToken, chatId);
        } else {
          const actionResult = await executeAction(aiResult.action, aiResult.params || {}, db);
          const finalResponse = actionResult || aiResult.response || '✅ Action exécutée.';
          await sendTelegram(botToken, chatId, finalResponse);
        }
      } else {
        await sendTelegram(botToken, chatId, aiResult.response || '🤔 Je n\'ai pas compris votre demande.\n\nTapez /help pour voir les commandes disponibles.');
      }
    } catch (aiError) {
      console.error('AI processing error:', aiError);
      await sendTelegram(botToken, chatId, '⚠️ Erreur de traitement IA. Réessayez ou utilisez les commandes directes (/clients, /stats, /help).');
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    // Try to send error message to admin
    try {
      const db = getDb();
      const token = (db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token'").get() as { value: string })?.value;
      const chatId = (db.prepare("SELECT value FROM settings WHERE key = 'telegram_admin_chat_id'").get() as { value: string })?.value;
      if (token && chatId) {
        await sendTelegram(token, chatId, `⚠️ Erreur système: ${String(error).substring(0, 200)}\n\nRéessayez ou utilisez /help.`);
      }
    } catch { /* silent */ }
    return NextResponse.json({ ok: true });
  }
}

// ============================================================
// KEYWORD MATCHING - Fast pattern matching without AI
// ============================================================
function matchKeywords(text: string): { action: string; params: Record<string, string>; needsApproval?: boolean; response?: string } | null {
  // List / show clients
  if (/^(list|liste|clients|show.*client|afficher.*client|montrer.*client|voir.*client|عملاء|قائمة)/.test(text)) {
    return { action: 'list', params: {} };
  }

  // Stats
  if (/^(stats|statistiques|stat|إحصائيات)/.test(text)) {
    return { action: 'stats', params: {} };
  }

  // Report
  if (/^(report|rapport|تقرير)/.test(text)) {
    return { action: 'report', params: {} };
  }

  // View schedules
  if (/^(schedules|planification|planning|voir.*planif|جداول|مبرمجة)/.test(text)) {
    return { action: 'view_schedules', params: {} };
  }

  // View templates
  if (/^(templates|modèles|template|قوالب)/.test(text)) {
    return { action: 'view_templates', params: {} };
  }

  // View replies
  if (/^(replies|réponses|réponse|voir.*réponse|ردود)/.test(text)) {
    return { action: 'view_replies', params: {} };
  }

  // View email opens
  if (/^(opens|ouvertures?|emails?\s*ouvert|qui\s*a\s*ouvert|تتبع|فتح)/.test(text)) {
    return { action: 'view_opens', params: {} };
  }

  // View automation flows
  if (/^(flows|flux|séquences?|automation|scenario|scénarios?|سيناريو|مسار)/.test(text)) {
    return { action: 'view_flows', params: {} };
  }

  // Set flow: "change le flux de [client] à [id]"
  const setFlowMatch = text.match(/(?:change|modifier|mets?|configure|définir|set)\s+(?:le\s+)?(?:flux|séquence|automation|scénario)\s+(?:de\s+)?(.+?)\s+(?:à|en|vers|sur|to)\s+(\d+)/i);
  if (setFlowMatch) {
    return { action: 'set_flow', params: { clientName: setFlowMatch[1].trim(), flowId: setFlowMatch[2].trim() } };
  }

  // Client info: "info sur X", "détails X", "fiche X"
  const infoMatch = text.match(/^(?:info|détails?|fiche|information)(?:\s+(?:sur|de|du|client))?\s+(.+)/i);
  if (infoMatch) {
    return { action: 'client_info', params: { clientName: infoMatch[1].trim() } };
  }

  // Confirm payment: "payé", "marque X comme payé"
  const paidMatch = text.match(/(?:marque|confirme|client)\s+(.+?)\s+(?:comme\s+)?(?:payé|paid|a payé|تأكيد.*دفع)/i);
  if (paidMatch) {
    return { action: 'confirm_payment', params: { clientName: paidMatch[1].trim() } };
  }

  // Pause client
  const pauseMatch = text.match(/(?:suspends?|pause|arrête|stop|أوقف)\s+(?:les\s+)?(?:relances?\s+)?(?:pour|de|du)?\s*(.+)/i);
  if (pauseMatch && !text.includes('tout') && !text.includes('all')) {
    return { action: 'pause_client', params: { clientName: pauseMatch[1].trim() } };
  }

  // Pause all
  if (/(?:suspends?|pause|arrête|stop)\s+(?:tout|toutes|all|الكل)/i.test(text)) {
    return { action: 'pause_all', params: {} };
  }

  // Resume client
  const resumeMatch = text.match(/(?:reprends?|resume|réactive|استئناف)\s+(?:les\s+)?(?:relances?\s+)?(?:pour|de|du)?\s*(.+)/i);
  if (resumeMatch && !text.includes('tout') && !text.includes('all')) {
    return { action: 'resume_client', params: { clientName: resumeMatch[1].trim() } };
  }

  // Resume all
  if (/(?:reprends?|resume|réactive)\s+(?:tout|toutes|all|الكل)/i.test(text)) {
    return { action: 'resume_all', params: {} };
  }

  // Delete client
  const deleteMatch = text.match(/(?:supprime|delete|efface|حذف)\s+(?:le\s+client\s+)?(.+)/i);
  if (deleteMatch) {
    return { action: 'delete_client', params: { clientName: deleteMatch[1].trim() } };
  }

  // Escalate
  const escMatch = text.match(/(?:escalade|escalader|monte|augmente|رفع)\s+(?:le\s+niveau\s+)?(?:pour|de|du)?\s*(.+)/i);
  if (escMatch) {
    return { action: 'escalate', params: { clientName: escMatch[1].trim() } };
  }

  // Change frequency
  const freqMatch = text.match(/(?:change|modifier|fréquence)\s+(?:la\s+fréquence\s+)?(?:de|du|pour)?\s*(.+?)\s+(?:à|en|vers)\s+(quotidien|daily|hebdomadaire|weekly|mensuel|monthly|bi-?mensuel|biweekly)/i);
  if (freqMatch) {
    const freqMap: Record<string, string> = { quotidien: 'daily', daily: 'daily', hebdomadaire: 'weekly', weekly: 'weekly', mensuel: 'monthly', monthly: 'monthly', 'bi-mensuel': 'biweekly', bimensuel: 'biweekly', biweekly: 'biweekly' };
    return { action: 'change_frequency', params: { clientName: freqMatch[1].trim(), frequency: freqMap[freqMatch[2].toLowerCase()] || 'weekly' } };
  }

  // Search
  const searchMatch = text.match(/^(?:cherche|recherche|search|find|trouver)\s+(.+)/i);
  if (searchMatch) {
    return { action: 'search', params: { query: searchMatch[1].trim() } };
  }

  return null; // No match - let AI handle it
}

