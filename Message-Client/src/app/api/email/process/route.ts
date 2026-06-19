import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import nodemailer from 'nodemailer';

// ============================================================
// ENHANCED SYSTEM PROMPT for Email Commands
// ============================================================
const EMAIL_SYSTEM_PROMPT = `Tu es l'assistant IA de FPA Collections Agent. Tu analyses les emails de l'administrateur et identifies les actions à effectuer.

## ACTIONS DISPONIBLES
Réponds UNIQUEMENT en JSON:

### Lecture (pas de confirmation nécessaire):
- "list" → Lister les clients
- "stats" → Statistiques
- "report" → Rapport complet
- "client_info" → Info client { clientName }
- "view_schedules" → Voir planifications
- "view_replies" → Voir réponses clients
- "view_opens" → Voir les emails ouverts par les clients
- "view_flows" → Voir les flux d'automatisation

### Gestion clients:
- "add_client" → { name, email, company, amount, currency, phone, dueDate }
- "edit_client" → { clientName, field, value }
- "delete_client" → { clientName }
- "confirm_payment" → { clientName }
- "partial_payment" → { clientName, amountPaid }

### Relances:
- "pause_client" → { clientName }
- "resume_client" → { clientName }
- "pause_all" → Suspendre tout
- "resume_all" → Reprendre tout
- "change_frequency" → { clientName, frequency }
- "set_flow" → { clientName, flowId }
- "escalate" → { clientName }

### Messages (nécessitent approbation via réponse email):
- "send_message" → { clientName, subject, body }
- "custom_message" → { clientName, subject, body }
- "reply_client" → { clientName, replyBody }

## FORMAT:
{
  "action": "nom_action",
  "params": { ... },
  "response": "Résumé pour l'admin",
  "needsApproval": true/false
}

Si c'est un envoi de message → needsApproval: true
Sinon → needsApproval: false`;

// ============================================================
// POST /api/email/process - process incoming email commands
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { from, subject, text } = body;

    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const adminEmail = getSetting('admin_email');

    // SECURITY: Only process emails from admin
    if (!from || !from.toLowerCase().includes(adminEmail.toLowerCase())) {
      return NextResponse.json({ ignored: true, reason: 'Not from admin email' });
    }

    // Get AI settings
    const apiKey = getSetting('openrouter_api_key');
    const model = getSetting('openrouter_model') || 'google/gemini-2.5-flash';

    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 });
    }

    // Build context
    const clients = db.prepare("SELECT name, email, amount_due, currency, status FROM clients WHERE is_active = 1 ORDER BY amount_due DESC LIMIT 20").all() as Record<string, string | number>[];
    const clientContext = clients.map(c => `• ${c.name} (${c.email}) - ${c.amount_due} ${c.currency} [${c.status}]`).join('\n');

    const flows = db.prepare("SELECT id, name FROM automation_flows").all() as { id: number; name: string }[];
    const flowContext = flows.map(f => `• [ID ${f.id}] ${f.name}`).join('\n');

    // Call AI
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `${EMAIL_SYSTEM_PROMPT}\n\n## CLIENTS ACTUELS:\n${clientContext}\n\n## FLUX D'AUTOMATISATION:\n${flowContext}` },
          { role: 'user', content: `Sujet: ${subject}\n\nContenu: ${text}` },
        ],
        temperature: 0.1,
      }),
    });

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: 'unknown' };
    } catch {
      parsed = { action: 'unknown', response: content };
    }

    let result = '';
    const companyName = getSetting('company_name') || 'FinancePro Advisory';

    // ============================================================
    // Execute non-approval actions
    // ============================================================
    switch (parsed.action) {
      case 'add_client': {
        if (parsed.params?.name && parsed.params?.email) {
          const r = db.prepare("INSERT INTO clients (name, email, company, amount_due, currency, phone, due_date) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            parsed.params.name, parsed.params.email, parsed.params.company || '', parseFloat(parsed.params.amount || '0'), parsed.params.currency || 'MAD', parsed.params.phone || '', parsed.params.dueDate || null
          );
          db.prepare("INSERT INTO schedules (client_id, frequency, time_of_day) VALUES (?, 'weekly', '09:00')").run(r.lastInsertRowid);
          result = `✅ Client ${parsed.params.name} ajouté avec planification hebdomadaire.`;
        } else { result = '❌ Nom et email requis.'; }
        break;
      }
      case 'edit_client': {
        if (parsed.params?.clientName) {
          const client = db.prepare("SELECT id FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number } | undefined;
          if (client) {
            const fieldMap: Record<string, string> = { name: 'name', email: 'email', phone: 'phone', company: 'company', amount: 'amount_due', dueDate: 'due_date', notes: 'notes' };
            const dbField = fieldMap[parsed.params.field] || parsed.params.field;
            const value = parsed.params.field === 'amount' ? parseFloat(parsed.params.value) : parsed.params.value;
            db.prepare(`UPDATE clients SET ${dbField} = ?, updated_at = datetime('now') WHERE id = ?`).run(value, client.id);
            result = `✅ ${parsed.params.clientName}: ${parsed.params.field} → ${parsed.params.value}`;
          } else { result = `❌ Client "${parsed.params.clientName}" non trouvé.`; }
        }
        break;
      }
      case 'delete_client': {
        if (parsed.params?.clientName) {
          db.prepare("DELETE FROM clients WHERE name LIKE ?").run(`%${parsed.params.clientName}%`);
          result = `🗑 Client ${parsed.params.clientName} supprimé.`;
        }
        break;
      }
      case 'confirm_payment': {
        if (parsed.params?.clientName) {
          const client = db.prepare("SELECT id FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number } | undefined;
          if (client) {
            db.prepare("UPDATE clients SET status = 'paid', amount_due = 0, updated_at = datetime('now') WHERE id = ?").run(client.id);
            db.prepare("UPDATE schedules SET is_active = 0 WHERE client_id = ?").run(client.id);
            result = `✅ Paiement confirmé pour ${parsed.params.clientName}. Relances arrêtées.`;
          } else { result = `❌ Client non trouvé.`; }
        }
        break;
      }
      case 'partial_payment': {
        if (parsed.params?.clientName) {
          const client = db.prepare("SELECT id, amount_due FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number; amount_due: number } | undefined;
          if (client) {
            const paid = parseFloat(parsed.params.amountPaid || '0');
            db.prepare("UPDATE clients SET amount_due = ?, status = 'partial', updated_at = datetime('now') WHERE id = ?").run(Math.max(0, client.amount_due - paid), client.id);
            result = `💳 Paiement partiel: ${paid} enregistré pour ${parsed.params.clientName}.`;
          }
        }
        break;
      }
      case 'pause_client': {
        if (parsed.params?.clientName) {
          const client = db.prepare("SELECT id FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number } | undefined;
          if (client) {
            db.prepare("UPDATE clients SET status = 'suspended' WHERE id = ?").run(client.id);
            db.prepare("UPDATE schedules SET is_active = 0 WHERE client_id = ?").run(client.id);
          }
          result = `⏸ Relances suspendues pour ${parsed.params.clientName}.`;
        }
        break;
      }
      case 'resume_client': {
        if (parsed.params?.clientName) {
          const client = db.prepare("SELECT id FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number } | undefined;
          if (client) {
            db.prepare("UPDATE clients SET status = 'pending' WHERE id = ?").run(client.id);
            db.prepare("UPDATE schedules SET is_active = 1 WHERE client_id = ?").run(client.id);
          }
          result = `▶️ Relances reprises pour ${parsed.params.clientName}.`;
        }
        break;
      }
      case 'pause_all': {
        db.prepare("UPDATE schedules SET is_active = 0").run();
        db.prepare("UPDATE clients SET status = 'suspended' WHERE status NOT IN ('paid')").run();
        result = '⏸ TOUTES les relances suspendues.';
        break;
      }
      case 'resume_all': {
        db.prepare("UPDATE schedules SET is_active = 1").run();
        db.prepare("UPDATE clients SET status = 'pending' WHERE status = 'suspended'").run();
        result = '▶️ TOUTES les relances réactivées.';
        break;
      }
      case 'change_frequency': {
        if (parsed.params?.clientName && parsed.params?.frequency) {
          const client = db.prepare("SELECT id FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number } | undefined;
          if (client) {
            db.prepare("UPDATE schedules SET frequency = ? WHERE client_id = ?").run(parsed.params.frequency, client.id);
          }
          result = `🔄 Fréquence → ${parsed.params.frequency} pour ${parsed.params.clientName}.`;
        }
        break;
      }
      case 'escalate': {
        if (parsed.params?.clientName) {
          const client = db.prepare("SELECT id, escalation_level FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number; escalation_level: string } | undefined;
          if (client) {
            const levels = ['friendly', 'formal', 'urgent', 'final'];
            const next = levels[Math.min(levels.indexOf(client.escalation_level) + 1, levels.length - 1)];
            db.prepare("UPDATE clients SET escalation_level = ? WHERE id = ?").run(next, client.id);
            result = `⬆️ Escalade: ${client.escalation_level} → ${next} pour ${parsed.params.clientName}.`;
          }
        }
        break;
      }

      // ============================================================
      // Actions needing approval - save as pending
      // ============================================================
      case 'send_message':
      case 'custom_message':
      case 'reply_client': {
        if (parsed.params?.clientName) {
          const client = db.prepare("SELECT id, name, email FROM clients WHERE name LIKE ?").get(`%${parsed.params.clientName}%`) as { id: number; name: string; email: string } | undefined;
          if (client) {
            const actionData = {
              clientId: String(client.id),
              clientName: client.name,
              email: client.email,
              subject: parsed.params.subject || parsed.params.customSubject || `Re: Rappel de paiement - ${client.name}`,
              body: parsed.params.body || parsed.params.replyBody || parsed.params.customBody || '',
            };

            db.prepare(`INSERT INTO pending_actions (action_type, source, target_client_id, data, preview_text, status) VALUES (?, 'email', ?, ?, ?, 'pending')`).run(
              parsed.action, client.id, JSON.stringify(actionData),
              `Message pour ${client.name}: ${actionData.subject}`
            );

            // Notify via Telegram
            const botToken = getSetting('telegram_bot_token');
            const adminChatId = getSetting('telegram_admin_chat_id');
            if (botToken && adminChatId) {
              const pendingId = (db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
              const telegramMsg = `📧 *Commande email reçue:*\n\n📋 Action: ${parsed.action}\n👤 Client: ${client.name}\n📧 Email: ${client.email}\n\n📝 *Sujet:* ${actionData.subject}\n\n✉️ *Contenu:*\n${actionData.body.substring(0, 300)}\n\n⏳ *En attente de votre confirmation:*`;

              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: adminChatId,
                  text: telegramMsg,
                  parse_mode: 'Markdown',
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: '✅ Confirmer', callback_data: `approve_${pendingId}` },
                        { text: '❌ Annuler', callback_data: `reject_${pendingId}` },
                      ],
                    ],
                  },
                }),
              });
            }

            result = `⏳ Message en attente d'approbation pour ${client.name}. Confirmez via Telegram ou répondez "CONFIRMER" par email.`;
          } else {
            result = `❌ Client "${parsed.params.clientName}" non trouvé.`;
          }
        }
        break;
      }

      // ============================================================
      // Reports / Info (generate and send by email)
      // ============================================================
      case 'list': {
        const allClients = db.prepare("SELECT name, company, email, amount_due, currency, status FROM clients WHERE is_active = 1 ORDER BY amount_due DESC").all() as Record<string, string | number>[];
        result = '📋 Clients actifs:\n' + allClients.map((c, i) => `${i + 1}. ${c.name} (${c.company || '-'}) - ${new Intl.NumberFormat('fr-FR').format(c.amount_due as number)} ${c.currency} [${c.status}]`).join('\n');
        break;
      }
      case 'stats': {
        const total = (db.prepare('SELECT COUNT(*) as c FROM clients WHERE is_active = 1').get() as { c: number }).c;
        const debt = (db.prepare("SELECT COALESCE(SUM(amount_due), 0) as t FROM clients WHERE status != 'paid' AND is_active = 1").get() as { t: number }).t;
        const sent = (db.prepare("SELECT COUNT(*) as c FROM message_logs WHERE sent_at >= datetime('now', '-30 days') AND status = 'sent'").get() as { c: number }).c;
        result = `📊 Stats: ${total} clients, ${new Intl.NumberFormat('fr-FR').format(debt)} MAD créances, ${sent} messages (30j)`;
        break;
      }
      case 'settings': {
        if (parsed.params?.key && parsed.params?.value) {
          db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?").run(parsed.params.value, parsed.params.key);
          result = `⚙️ Paramètre ${parsed.params.key} mis à jour.`;
        }
        break;
      }
      case 'view_opens': {
        const opens = db.prepare(`
          SELECT ml.subject, ml.opened_at, ml.open_count, c.name, c.email
          FROM message_logs ml JOIN clients c ON ml.client_id = c.id
          WHERE ml.opened_at IS NOT NULL ORDER BY ml.opened_at DESC LIMIT 10
        `).all() as Record<string, string | number>[];
        const totalSent = (db.prepare("SELECT COUNT(*) as c FROM message_logs WHERE status = 'sent' AND channel = 'email'").get() as { c: number }).c;
        const totalOpened = (db.prepare("SELECT COUNT(*) as c FROM message_logs WHERE opened_at IS NOT NULL").get() as { c: number }).c;
        const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
        result = `📬 Emails ouverts: ${totalOpened}/${totalSent} (${openRate}%)\n\n`;
        opens.forEach((o, i) => {
          result += `${i + 1}. ${o.name} - "${(o.subject as string || '').substring(0, 40)}" (${o.open_count}x) - ${(o.opened_at as string || '').substring(0, 16)}\n`;
        });
        break;
      }
      case 'view_flows': {
        const allFlows = db.prepare(`
          SELECT af.*, COUNT(c.id) as client_count 
          FROM automation_flows af 
          LEFT JOIN clients c ON af.id = c.automation_flow_id AND c.is_active = 1
          GROUP BY af.id
          ORDER BY af.is_default DESC, af.created_at DESC
        `).all() as Record<string, string | number>[];
        
        result = '⚙️ Flux d\'automatisation disponibles :\n\n' + allFlows.map((f, i) => {
          const steps = JSON.parse(f.steps as string || '[]');
          return `${i + 1}. ${f.name} [ID: ${f.id}] (${f.client_count} client(s))\n   Description : ${f.description || '-'}\n   Étapes : ${steps.length} étape(s)`;
        }).join('\n\n');
        break;
      }
      case 'set_flow': {
        if (parsed.params?.clientName && parsed.params?.flowId) {
          const client = db.prepare("SELECT id, name FROM clients WHERE name LIKE ? AND is_active = 1").get(`%${parsed.params.clientName}%`) as { id: number; name: string } | undefined;
          if (client) {
            const flowId = parseInt(parsed.params.flowId);
            const flow = db.prepare("SELECT id, name, steps FROM automation_flows WHERE id = ?").get(flowId) as { id: number; name: string; steps: string } | undefined;
            if (flow) {
              db.prepare(`
                UPDATE clients 
                SET automation_flow_id = ?, current_flow_step_index = 0, flow_started_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?
              `).run(flow.id, client.id);

              let delayStr = '+1 day';
              try {
                const steps = JSON.parse(flow.steps || '[]');
                if (steps.length > 0 && steps[0].delay_days !== undefined) {
                  delayStr = `+${steps[0].delay_days} days`;
                }
              } catch (_) {}

              db.prepare("UPDATE schedules SET next_run = datetime('now', ?), is_active = 1 WHERE client_id = ?")
                .run(delayStr, client.id);

              result = `✅ Flux d'automatisation "${flow.name}" assigné à ${client.name}. Première relance dans ${delayStr.replace('+', '').replace('days', 'jours')}.`;
            } else {
              result = `❌ Flux ID #${parsed.params.flowId} non trouvé.`;
            }
          } else {
            result = `❌ Client "${parsed.params.clientName}" non trouvé.`;
          }
        } else {
          result = '❌ Nom de client ou ID de flux manquant.';
        }
        break;
      }
      default:
        result = parsed.response || 'Action non reconnue.';
    }

    // ============================================================
    // Send confirmation email to admin
    // ============================================================
    if (result) {
      try {
        const transporter = nodemailer.createTransport({
          host: getSetting('smtp_host'),
          port: parseInt(getSetting('smtp_port') || '465'),
          secure: parseInt(getSetting('smtp_port') || '465') === 465,
          auth: { user: getSetting('smtp_user'), pass: getSetting('smtp_pass') },
          tls: { rejectUnauthorized: false },
        });

        await transporter.sendMail({
          from: `"FPA Collections Agent" <${getSetting('smtp_from')}>`,
          to: adminEmail,
          subject: `✅ FPA Agent: ${parsed.action} - Résultat`,
          html: `
            <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #C5A03D, #A68832); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: #fff; margin: 0; font-size: 18px;">🤖 FPA Collections Agent</h1>
                <p style="color: #fff; opacity: 0.9; margin: 5px 0 0; font-size: 14px;">Résultat de votre commande</p>
              </div>
              <div style="background: #fff; padding: 25px; border: 1px solid #eee; border-radius: 0 0 12px 12px;">
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                  <tr style="background: #f9f9f9;"><td style="padding: 10px; color: #888; width: 120px;">Action</td><td style="padding: 10px; font-weight: 600;">${parsed.action}</td></tr>
                  <tr><td style="padding: 10px; color: #888;">Commande originale</td><td style="padding: 10px;">${subject}</td></tr>
                </table>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; border-left: 4px solid #C5A03D;">
                  <p style="margin: 0; font-weight: 600; color: #3A3A3A;">📋 Résultat:</p>
                  <p style="margin: 10px 0 0; color: #555; line-height: 1.6; white-space: pre-line;">${result}</p>
                </div>
                <p style="color: #888; font-size: 12px; margin-top: 20px; text-align: center;">— FPA Collections Agent • ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}</p>
              </div>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('[EMAIL-PROCESS] Failed to send confirmation email:', emailErr);
      }
    }

    return NextResponse.json({ success: true, action: parsed.action, result });
  } catch (error) {
    console.error('Email processing error:', error);
    return NextResponse.json({ error: 'Failed to process email' }, { status: 500 });
  }
}
