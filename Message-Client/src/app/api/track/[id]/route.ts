import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { sendMail } from '@/lib/mail';

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// GET /api/track/[id] - Record email open and return tracking pixel
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: trackingId } = await params;
    if (!trackingId) {
      return new NextResponse(TRACKING_PIXEL, {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }

    const db = getDb();

    // Find the message by tracking_id
    const message = db.prepare(
      "SELECT ml.id, ml.client_id, ml.subject, ml.opened_at, ml.open_count, c.name as client_name, c.email as client_email FROM message_logs ml JOIN clients c ON ml.client_id = c.id WHERE ml.tracking_id = ?"
    ).get(trackingId) as {
      id: number; client_id: number; subject: string;
      opened_at: string | null; open_count: number;
      client_name: string; client_email: string;
    } | undefined;

    if (message) {
      const isFirstOpen = !message.opened_at;

      // Update open tracking
      db.prepare(
        "UPDATE message_logs SET opened_at = COALESCE(opened_at, datetime('now')), open_count = open_count + 1 WHERE tracking_id = ?"
      ).run(trackingId);

      // Only notify on FIRST open
      if (isFirstOpen) {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Create dashboard notification
        db.prepare(`
          INSERT INTO notifications (type, title, message, client_id, is_read, created_at)
          VALUES ('info', ?, ?, ?, 0, datetime('now'))
        `).run(
          `📬 Email ouvert par ${message.client_name}`,
          `Le client ${message.client_name} (${message.client_email}) a ouvert l'email "${message.subject}" à ${now}`,
          message.client_id
        );

        // Send Telegram notification
        const getSetting = (key: string): string => {
          const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
          return row?.value || '';
        };

        const botToken = getSetting('telegram_bot_token');
        const adminChatId = getSetting('telegram_admin_chat_id');

        if (botToken && adminChatId) {
          const telegramMsg = `📬 *Email ouvert!*\n\n👤 *Client:* ${message.client_name}\n📧 *Email:* ${message.client_email}\n📋 *Sujet:* ${message.subject}\n🕐 *Ouvert à:* ${now}\n\n_C'est le bon moment pour un suivi!_`;

          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: adminChatId,
              text: telegramMsg,
              parse_mode: 'Markdown',
            }),
          }).catch(err => console.error('[TRACK] Telegram notification error:', err));
        }

        // Also send email to admin
        const adminEmail = getSetting('admin_email');
        if (adminEmail) {
          try {
            await sendMail({
              to: adminEmail,
              subject: `📬 Email ouvert - ${message.client_name}`,
              html: `
                <div style="font-family: 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #10B981, #059669); padding: 16px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h2 style="color: #fff; margin: 0;">📬 Email Ouvert!</h2>
                  </div>
                  <div style="background: #fff; padding: 20px; border: 1px solid #eee; border-radius: 0 0 10px 10px;">
                    <p><strong>👤 Client:</strong> ${message.client_name}</p>
                    <p><strong>📧 Email:</strong> ${message.client_email}</p>
                    <p><strong>📋 Sujet:</strong> ${message.subject}</p>
                    <p><strong>🕐 Ouvert à:</strong> ${now}</p>
                    <p style="color: #10B981; font-weight: 600; margin-top: 15px;">💡 C'est le bon moment pour un suivi!</p>
                  </div>
                </div>
              `,
            });
          } catch (emailErr) {
            console.error('[TRACK] Admin email notification error:', emailErr);
          }
        }

        console.log(`[TRACK] First open: ${message.client_name} opened "${message.subject}"`);
      } else {
        console.log(`[TRACK] Repeat open #${message.open_count + 1}: ${message.client_name} - "${message.subject}"`);
      }
    }
  } catch (error) {
    console.error('[TRACK] Error:', error);
  }

  // Always return the pixel
  return new NextResponse(TRACKING_PIXEL, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
