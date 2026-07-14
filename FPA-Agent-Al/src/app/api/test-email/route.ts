import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { sendMail } from '@/lib/mail';

export async function POST() {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const adminEmail = getSetting('admin_email') || 'sarah@alfa-01.com';
    const sendMethod = getSetting('email_send_method') || 'brevo';
    const targetEmail = adminEmail;

    let testDetails = "";
    if (sendMethod === 'brevo') {
      const senderEmail = getSetting('brevo_sender_email') || 'contact@alfa-01.com';
      testDetails = `Brevo API (Expéditeur: ${senderEmail})`;
    } else {
      const smtpHost = getSetting('smtp_host');
      const smtpPort = getSetting('smtp_port');
      testDetails = `SMTP (${smtpHost}:${smtpPort})`;
    }

    console.log(`[TEST-EMAIL] Sending test email to ${targetEmail} via ${testDetails}...`);

    const result = await sendMail({
      to: targetEmail,
      subject: '✅ Test de connexion - FPA Collections Agent',
      text: `Ce message confirme que la connexion fonctionne correctement.\n\nDate: ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}\n\n— FPA Collections Agent`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
          <div style="background: linear-gradient(135deg, #C5A03D, #A68832); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">✅ Connexion Email Réussie</h1>
          </div>
          <div style="background: #fff; padding: 30px; border: 1px solid #eee; border-radius: 0 0 12px 12px;">
            <p style="color: #3A3A3A; line-height: 1.6;">Ce message confirme que la configuration de <strong>FPA Collections Agent</strong> fonctionne correctement.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 14px;">Méthode d'envoi</td><td style="padding: 8px 0; font-weight: 600;">${sendMethod === 'brevo' ? 'Brevo API' : 'SMTP'}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 14px;">Détails</td><td style="padding: 8px 0; font-weight: 600;">${testDetails}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 14px;">Destinataire</td><td style="padding: 8px 0; font-weight: 600;">${targetEmail}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 14px;">Date</td><td style="padding: 8px 0; font-weight: 600;">${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}</td></tr>
            </table>
            <p style="color: #888; font-size: 13px; margin-top: 20px;">— FPA Collections Agent</p>
          </div>
        </div>
      `,
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: `Email de test envoyé à ${targetEmail}` });
    } else {
      return NextResponse.json({ success: false, error: result.error || 'Erreur lors de l\'envoi' }, { status: 500 });
    }
  } catch (error) {
    console.error('[TEST-EMAIL] Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

