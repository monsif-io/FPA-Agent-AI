import { NextResponse } from 'next/server';
import getDb from '@/lib/db';

// POST /api/seed - Seed 10 test clients with catchmail.io emails
export async function POST() {
  try {
    const db = getDb();

    // ==========================================
    // 1. DELETE all existing clients, schedules, and message logs
    // ==========================================
    db.prepare('DELETE FROM message_logs').run();
    db.prepare('DELETE FROM schedules').run();
    db.prepare('DELETE FROM clients').run();

    // Reset auto-increment
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('clients', 'schedules', 'message_logs')").run();

    // ==========================================
    // 2. INSERT 10 test clients with catchmail.io emails
    // ==========================================
    const clients = [
      {
        name: 'Ahmed Bennani',
        company: 'Maroc Digital Solutions',
        email: 'ahmed.bennani@catchmail.io',
        phone: '+212 661 234 567',
        amount_due: 45000,
        currency: 'MAD',
        status: 'pending',
        escalation_level: 'friendly',
        due_date: '2026-07-15',
        notes: 'Client régulier - premier retard de paiement',
      },
      {
        name: 'Fatima Zahra El Amrani',
        company: 'Atlas Trading Co.',
        email: 'fatima.elamrani@catchmail.io',
        phone: '+212 622 345 678',
        amount_due: 120000,
        currency: 'MAD',
        status: 'pending',
        escalation_level: 'formal',
        due_date: '2026-06-30',
        notes: 'Gros client - suivi prioritaire',
      },
      {
        name: 'Karim Ouazzani',
        company: 'Casablanca Imports SARL',
        email: 'karim.ouazzani@catchmail.io',
        phone: '+212 633 456 789',
        amount_due: 28500,
        currency: 'MAD',
        status: 'partial',
        escalation_level: 'friendly',
        due_date: '2026-07-01',
        notes: 'A payé 50% - attend le reste',
      },
      {
        name: 'Nadia Bensouda',
        company: 'NS Consulting',
        email: 'nadia.bensouda@catchmail.io',
        phone: '+212 644 567 890',
        amount_due: 75000,
        currency: 'MAD',
        status: 'pending',
        escalation_level: 'urgent',
        due_date: '2026-06-15',
        notes: 'Plusieurs relances sans réponse',
      },
      {
        name: 'Omar Tazi',
        company: 'Tazi & Fils Construction',
        email: 'omar.tazi@catchmail.io',
        phone: '+212 655 678 901',
        amount_due: 210000,
        currency: 'MAD',
        status: 'disputed',
        escalation_level: 'final',
        due_date: '2026-05-20',
        notes: 'Conteste le montant - en attente de vérification',
      },
      {
        name: 'Samira Kettani',
        company: 'Kettani Textiles',
        email: 'samira.kettani@catchmail.io',
        phone: '+212 666 789 012',
        amount_due: 55000,
        currency: 'MAD',
        status: 'pending',
        escalation_level: 'friendly',
        due_date: '2026-07-20',
        notes: 'Nouveau client',
      },
      {
        name: 'Rachid Alaoui',
        company: 'Alaoui Motors',
        email: 'rachid.alaoui@catchmail.io',
        phone: '+212 677 890 123',
        amount_due: 18000,
        currency: 'EUR',
        status: 'pending',
        escalation_level: 'formal',
        due_date: '2026-07-10',
        notes: 'Client international - facture en EUR',
      },
      {
        name: 'Hajar Mohammedi',
        company: 'Mohammedi Events',
        email: 'hajar.mohammedi@catchmail.io',
        phone: '+212 688 901 234',
        amount_due: 32000,
        currency: 'MAD',
        status: 'pending',
        escalation_level: 'friendly',
        due_date: '2026-07-25',
        notes: 'Événementiel - paiement après livraison',
      },
      {
        name: 'Youssef Chraibi',
        company: 'Chraibi Tech',
        email: 'youssef.chraibi@catchmail.io',
        phone: '+212 699 012 345',
        amount_due: 95000,
        currency: 'MAD',
        status: 'pending',
        escalation_level: 'urgent',
        due_date: '2026-06-10',
        notes: 'Retard important - risque contentieux',
      },
      {
        name: 'Laila Fassi',
        company: 'Fassi Design Studio',
        email: 'laila.fassi@catchmail.io',
        phone: '+212 610 123 456',
        amount_due: 15000,
        currency: 'USD',
        status: 'pending',
        escalation_level: 'friendly',
        due_date: '2026-08-01',
        notes: 'Client freelance - contrat de design',
      },
    ];

    const insertClient = db.prepare(`
      INSERT INTO clients (name, company, email, phone, amount_due, currency, status, escalation_level, due_date, notes, is_active, messages_sent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
    `);

    const insertSchedule = db.prepare(`
      INSERT INTO schedules (client_id, frequency, time_of_day, is_active, next_run, created_at)
      VALUES (?, ?, '09:00', 1, datetime('now', '+1 day'), datetime('now'))
    `);

    const frequencies = ['daily', 'weekly', 'weekly', 'daily', 'daily', 'weekly', 'biweekly', 'weekly', 'daily', 'monthly'];

    const insertedClients: { id: number; name: string; email: string }[] = [];

    for (let i = 0; i < clients.length; i++) {
      const c = clients[i];
      const result = insertClient.run(
        c.name, c.company, c.email, c.phone, c.amount_due, c.currency,
        c.status, c.escalation_level, c.due_date, c.notes
      );
      const clientId = result.lastInsertRowid as number;
      insertSchedule.run(clientId, frequencies[i]);
      insertedClients.push({ id: clientId, name: c.name, email: c.email });
    }

    return NextResponse.json({
      success: true,
      message: `${clients.length} clients de test créés avec succès`,
      clients: insertedClients,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/seed - Remove all seed data
export async function DELETE() {
  try {
    const db = getDb();
    db.prepare('DELETE FROM message_logs').run();
    db.prepare('DELETE FROM schedules').run();
    db.prepare('DELETE FROM clients').run();
    return NextResponse.json({ success: true, message: 'Toutes les données supprimées' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
