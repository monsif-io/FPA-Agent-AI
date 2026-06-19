import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import nodemailer from 'nodemailer';
import { generateTrackingId, wrapEmailWithTracking } from '@/lib/tracking';

// POST /api/scheduler/run - Manually trigger the scheduler to check and send pending messages
export async function POST() {
  try {
    const db = getDb();

    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    // Get active schedules that are due
    const schedules = db.prepare(`
      SELECT s.*, c.name, c.email, c.amount_due, c.currency, c.company, c.due_date, c.escalation_level, c.status as client_status, c.phone,
             c.automation_flow_id, c.current_flow_step_index
      FROM schedules s
      JOIN clients c ON s.client_id = c.id
      WHERE s.is_active = 1 AND c.is_active = 1 AND c.status NOT IN ('paid', 'suspended')
      AND (s.next_run IS NULL OR s.next_run <= datetime('now'))
    `).all() as Record<string, string | number>[];

    if (schedules.length === 0) {
      return NextResponse.json({ message: 'No messages to send', sent: 0 });
    }

    // Setup SMTP
    const transporter = nodemailer.createTransport({
      host: getSetting('smtp_host'),
      port: parseInt(getSetting('smtp_port') || '587'),
      secure: getSetting('smtp_port') === '465',
      auth: { user: getSetting('smtp_user'), pass: getSetting('smtp_pass') },
      tls: { rejectUnauthorized: false },
    });

    const companyName = getSetting('company_name') || 'FinancePro Advisory';
    const smtpFrom = getSetting('smtp_from');
    let sent = 0;
    let failed = 0;

    const nextRunMap: Record<string, string> = {
      daily: '+1 day',
      weekly: '+7 days',
      biweekly: '+14 days',
      monthly: '+30 days',
    };

    for (const schedule of schedules) {
      try {
        let template: Record<string, string> | undefined;
        let flowSteps: any[] = [];
        let isFlow = false;
        let nextStepDelay = 7; // default fallback delay

        // Check if client is enrolled in automation flow
        if (schedule.automation_flow_id) {
          const flow = db.prepare('SELECT * FROM automation_flows WHERE id = ?').get(schedule.automation_flow_id) as Record<string, string> | undefined;
          if (flow) {
            try {
              flowSteps = JSON.parse(flow.steps || '[]');
              const stepIndex = Number(schedule.current_flow_step_index || 0);
              if (stepIndex < flowSteps.length) {
                isFlow = true;
                const currentStep = flowSteps[stepIndex];
                template = db.prepare('SELECT * FROM templates WHERE id = ?').get(currentStep.template_id) as Record<string, string> | undefined;
                
                // Read next step's delay to set the next schedule run
                if (stepIndex + 1 < flowSteps.length) {
                  nextStepDelay = flowSteps[stepIndex + 1].delay_days || 7;
                } else {
                  nextStepDelay = 0; // last step completed
                }
              }
            } catch (_) {}
          }
        }

        // Fallback to escalation level template if not in flow or template not found
        if (!template) {
          template = db.prepare(`
            SELECT * FROM templates WHERE escalation_level = ? AND is_default = 1 LIMIT 1
          `).get(schedule.escalation_level) as Record<string, string> | undefined
            || db.prepare('SELECT * FROM templates WHERE escalation_level = ? LIMIT 1').get(schedule.escalation_level) as Record<string, string> | undefined
            || db.prepare('SELECT * FROM templates LIMIT 1').get() as Record<string, string> | undefined;
        }

        if (!template) continue;

        // Replace variables
        const replaceVars = (text: string) => {
          return text
            .replace(/\{\{nom\}\}/g, schedule.name as string)
            .replace(/\{\{name\}\}/g, schedule.name as string)
            .replace(/\{\{entreprise\}\}/g, (schedule.company as string) || '')
            .replace(/\{\{company\}\}/g, (schedule.company as string) || '')
            .replace(/\{\{montant\}\}/g, new Intl.NumberFormat('fr-FR').format(schedule.amount_due as number))
            .replace(/\{\{amount\}\}/g, new Intl.NumberFormat('fr-FR').format(schedule.amount_due as number))
            .replace(/\{\{devise\}\}/g, (schedule.currency as string) || 'MAD')
            .replace(/\{\{currency\}\}/g, (schedule.currency as string) || 'MAD')
            .replace(/\{\{date_echeance\}\}/g, (schedule.due_date as string) || 'N/A')
            .replace(/\{\{due_date\}\}/g, (schedule.due_date as string) || 'N/A')
            .replace(/\{\{company_name\}\}/g, companyName)
            .replace(/\{\{email\}\}/g, (schedule.email as string) || '')
            .replace(/\{\{phone\}\}/g, (schedule.phone as string) || '');
        };

        const subject = replaceVars(template.subject);
        const body = replaceVars(template.body);

        // Generate tracking ID
        const trackingId = generateTrackingId();
        const htmlBody = wrapEmailWithTracking(body.replace(/\n/g, '<br>'), trackingId);

        // Send email with tracking pixel
        await transporter.sendMail({
          from: `"${companyName}" <${smtpFrom}>`,
          to: schedule.email as string,
          subject,
          text: body,
          html: htmlBody,
        });

        // Log success
        db.prepare(`
          INSERT INTO message_logs (client_id, template_id, channel, subject, body, status, tracking_id, sent_at)
          VALUES (?, ?, 'email', ?, ?, 'sent', ?, datetime('now'))
        `).run(schedule.client_id, template.id, subject, body, trackingId);

        // Update client details
        db.prepare(`
          UPDATE clients SET messages_sent = messages_sent + 1, last_message_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(schedule.client_id);

        if (isFlow) {
          const nextStepIndex = Number(schedule.current_flow_step_index || 0) + 1;
          
          // Update client flow index
          db.prepare(`
            UPDATE clients SET current_flow_step_index = ? WHERE id = ?
          `).run(nextStepIndex, schedule.client_id);

          if (nextStepIndex >= flowSteps.length) {
            // Flow completed! Deactivate schedule and notify admin
            db.prepare(`
              UPDATE schedules SET is_active = 0, next_run = NULL WHERE id = ?
            `).run(schedule.id);

            db.prepare(`
              INSERT INTO notifications (type, title, message, client_id)
              VALUES ('warning', ?, ?, ?)
            `).run(
              `Séquence terminée pour ${schedule.name}`,
              `Le flux d'automatisation s'est terminé sans confirmation de paiement. Les relances sont désormais suspendues.`,
              schedule.client_id
            );

            // Telegram alert
            try {
              const token = getSetting('telegram_bot_token');
              const adminChat = getSetting('telegram_admin_chat_id');
              if (token && adminChat) {
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: adminChat,
                    text: `⚠️ *Séquence terminée pour ${schedule.name}*\n\nLe flux d'automatisation s'est terminé sans confirmation de paiement. Les relances automatiques pour ce client sont suspendues.`,
                    parse_mode: 'Markdown'
                  })
                });
              }
            } catch (tErr) {
              console.error('Failed to send telegram flow alert:', tErr);
            }
          } else {
            // Schedule next run based on flow step delay
            db.prepare(`UPDATE schedules SET next_run = datetime('now', ?) WHERE id = ?`)
              .run(`+${nextStepDelay} days`, schedule.id);
          }
        } else {
          // Fallback static schedule logic
          const freq = schedule.frequency as string;
          db.prepare(`UPDATE schedules SET next_run = datetime('now', ?) WHERE id = ?`)
            .run(nextRunMap[freq] || '+7 days', schedule.id);
        }

        sent++;
      } catch (error) {
        // Log failure
        db.prepare(`
          INSERT INTO message_logs (client_id, channel, subject, body, status, error_message, sent_at)
          VALUES (?, 'email', 'Échec d''envoi', '', 'failed', ?, datetime('now'))
        `).run(schedule.client_id, String(error));
        failed++;
      }
    }

    return NextResponse.json({ sent, failed, total: schedules.length });
  } catch (error) {
    console.error('Scheduler error:', error);
    return NextResponse.json({ error: 'Scheduler failed' }, { status: 500 });
  }
}

// GET /api/scheduler/run - Check scheduler status
export async function GET() {
  try {
    const db = getDb();
    const pending = (db.prepare(`
      SELECT COUNT(*) as c FROM schedules s
      JOIN clients c ON s.client_id = c.id
      WHERE s.is_active = 1 AND c.is_active = 1 AND c.status NOT IN ('paid', 'suspended')
      AND (s.next_run IS NULL OR s.next_run <= datetime('now'))
    `).get() as { c: number }).c;

    const totalActive = (db.prepare(`
      SELECT COUNT(*) as c FROM schedules WHERE is_active = 1
    `).get() as { c: number }).c;

    return NextResponse.json({ pendingMessages: pending, totalActiveSchedules: totalActive });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
