import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import nodemailer from 'nodemailer';

export async function POST() {
  try {
    const db = getDb();
    const getSetting = (key: string): string => {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
      return row?.value || '';
    };

    const smtpHost = getSetting('smtp_host');
    const smtpPort = parseInt(getSetting('smtp_port') || '587');
    const smtpUser = getSetting('smtp_user');
    const smtpPass = getSetting('smtp_pass');
    const smtpFrom = getSetting('smtp_from');
    const adminEmail = getSetting('admin_email');

    // Validate settings
    if (!smtpHost) {
      return NextResponse.json({ success: false, error: 'Serveur SMTP non configuré. Veuillez remplir le champ "Serveur SMTP" dans les paramètres.' }, { status: 400 });
    }
    if (!smtpUser || !smtpPass) {
      return NextResponse.json({ success: false, error: 'Identifiants SMTP manquants. Veuillez remplir "Utilisateur SMTP" et "Mot de passe SMTP".' }, { status: 400 });
    }
    if (!smtpFrom) {
      return NextResponse.json({ success: false, error: 'Email expéditeur non configuré.' }, { status: 400 });
    }

    console.log(`[TEST-EMAIL] Connecting to ${smtpHost}:${smtpPort} as ${smtpUser}`);

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });

    // Step 1: Verify SMTP connection
    console.log('[TEST-EMAIL] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[TEST-EMAIL] SMTP connection verified!');

    // Step 2: Send test email
    const targetEmail = adminEmail || smtpFrom;
    console.log(`[TEST-EMAIL] Sending test email to ${targetEmail}...`);

    await transporter.sendMail({
      from: `"FPA Collections Agent" <${smtpFrom}>`,
      to: targetEmail,
      subject: '✅ Test de connexion SMTP - FPA Collections Agent',
      text: `Ce message confirme que la connexion SMTP fonctionne correctement.\n\nServeur: ${smtpHost}:${smtpPort}\nExpéditeur: ${smtpFrom}\nDate: ${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}\n\n— FPA Collections Agent`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
          <div style="background: linear-gradient(135deg, #C5A03D, #A68832); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">✅ Connexion SMTP Réussie</h1>
          </div>
          <div style="background: #fff; padding: 30px; border: 1px solid #eee; border-radius: 0 0 12px 12px;">
            <p style="color: #3A3A3A; line-height: 1.6;">Ce message confirme que la configuration SMTP de <strong>FPA Collections Agent</strong> fonctionne correctement.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 14px;">Serveur</td><td style="padding: 8px 0; font-weight: 600;">${smtpHost}:${smtpPort}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 14px;">Expéditeur</td><td style="padding: 8px 0; font-weight: 600;">${smtpFrom}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 14px;">Date</td><td style="padding: 8px 0; font-weight: 600;">${new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })}</td></tr>
            </table>
            <p style="color: #888; font-size: 13px; margin-top: 20px;">— FPA Collections Agent</p>
          </div>
        </div>
      `,
    });

    console.log('[TEST-EMAIL] Test email sent successfully!');
    return NextResponse.json({ success: true, message: `Email de test envoyé à ${targetEmail}` });
  } catch (error) {
    const errorMessage = String(error);
    console.error('[TEST-EMAIL] Error:', errorMessage);

    // Provide user-friendly error messages
    let friendlyError = errorMessage;
    if (errorMessage.includes('ECONNREFUSED')) {
      friendlyError = 'Connexion refusée - vérifiez le serveur SMTP et le port.';
    } else if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      friendlyError = 'Délai d\'attente dépassé - le serveur SMTP ne répond pas.';
    } else if (errorMessage.includes('ENOTFOUND')) {
      friendlyError = 'Serveur SMTP introuvable - vérifiez le nom d\'hôte.';
    } else if (errorMessage.includes('auth') || errorMessage.includes('AUTH') || errorMessage.includes('535')) {
      friendlyError = 'Échec d\'authentification - vérifiez l\'utilisateur et le mot de passe SMTP.';
    } else if (errorMessage.includes('certificate') || errorMessage.includes('SSL')) {
      friendlyError = 'Erreur SSL/TLS - problème de certificat du serveur.';
    }

    return NextResponse.json({ success: false, error: friendlyError }, { status: 500 });
  }
}
