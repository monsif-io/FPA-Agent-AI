import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// POST /api/clients/import - import clients from JSON array (parsed from Excel/CSV on frontend)
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { clients } = body;

    if (!Array.isArray(clients) || clients.length === 0) {
      return NextResponse.json({ error: 'Aucun client à importer' }, { status: 400 });
    }

    const settings = db.prepare('SELECT value FROM settings WHERE key = ?');
    const defaultFreq = (settings.get('default_frequency') as { value: string })?.value || 'weekly';
    const defaultTime = (settings.get('default_send_time') as { value: string })?.value || '09:00';

    const insertClient = db.prepare(`
      INSERT INTO clients (name, company, email, phone, amount_due, currency, status, escalation_level, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 'friendly', ?, ?)
    `);

    const insertSchedule = db.prepare(`
      INSERT INTO schedules (client_id, frequency, time_of_day, is_active, next_run)
      VALUES (?, ?, ?, 1, datetime('now', '+1 day'))
    `);

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const insertMany = db.transaction(() => {
      for (const client of clients) {
        try {
          const name = client.name || client.nom || client.Name || '';
          const email = client.email || client.Email || client.mail || '';
          const company = client.company || client.entreprise || client.Company || client.société || '';
          const phone = client.phone || client.telephone || client.Phone || client.tel || '';
          const amount = parseFloat(client.amount_due || client.montant || client.amount || client.Amount || '0') || 0;
          const currency = client.currency || client.devise || 'MAD';
          const dueDate = client.due_date || client.date_echeance || client.dueDate || null;
          const notes = client.notes || client.Notes || '';

          if (!name || !email) {
            errors.push(`Ligne ignorée: nom ou email manquant (${name || 'sans nom'})`);
            failed++;
            continue;
          }

          const result = insertClient.run(name, company, email, phone, amount, currency, dueDate, notes);
          insertSchedule.run(result.lastInsertRowid, defaultFreq, defaultTime);
          success++;
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : 'Unknown error';
          errors.push(`Erreur pour ${client.name || 'inconnu'}: ${errMsg}`);
          failed++;
        }
      }
    });

    insertMany();

    return NextResponse.json({
      total: clients.length,
      success,
      failed,
      errors,
    });
  } catch (error) {
    console.error('Error importing clients:', error);
    return NextResponse.json({ error: 'Failed to import clients' }, { status: 500 });
  }
}
