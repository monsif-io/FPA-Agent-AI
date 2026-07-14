import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/stats
export async function GET() {
  try {
    const db = getDb();

    const totalClients = (db.prepare('SELECT COUNT(*) as c FROM clients').get() as { c: number }).c;
    const activeClients = (db.prepare('SELECT COUNT(*) as c FROM clients WHERE is_active = 1 AND status != \'paid\'').get() as { c: number }).c;

    const totalDebtResult = db.prepare('SELECT COALESCE(SUM(amount_due), 0) as total FROM clients WHERE status != \'paid\'').get() as { total: number };
    const totalDebt = totalDebtResult.total;

    const today = new Date().toISOString().split('T')[0];
    const messagesSentToday = (db.prepare('SELECT COUNT(*) as c FROM message_logs WHERE date(sent_at) = date(?) AND status = \'sent\'').get(today) as { c: number }).c;

    const messagesSentWeek = (db.prepare('SELECT COUNT(*) as c FROM message_logs WHERE sent_at >= datetime(\'now\', \'-7 days\') AND status = \'sent\'').get() as { c: number }).c;
    const messagesSentMonth = (db.prepare('SELECT COUNT(*) as c FROM message_logs WHERE sent_at >= datetime(\'now\', \'-30 days\') AND status = \'sent\'').get() as { c: number }).c;

    const paidThisMonth = (db.prepare('SELECT COUNT(*) as c FROM clients WHERE status = \'paid\' AND updated_at >= datetime(\'now\', \'-30 days\')').get() as { c: number }).c;

    // Escalation distribution
    const escalationDist = db.prepare(`
      SELECT escalation_level, COUNT(*) as count FROM clients 
      WHERE status != 'paid' AND is_active = 1
      GROUP BY escalation_level
    `).all();

    // Status distribution
    const statusDist = db.prepare(`
      SELECT status, COUNT(*) as count FROM clients GROUP BY status
    `).all();

    // Messages per day (last 30 days)
    const messagesPerDay = db.prepare(`
      SELECT date(sent_at) as date, COUNT(*) as count 
      FROM message_logs WHERE sent_at >= datetime('now', '-30 days') AND status = 'sent'
      GROUP BY date(sent_at) ORDER BY date ASC
    `).all();

    // Recent activity
    const recentActivity = db.prepare(`
      SELECT ml.*, c.name as client_name, c.company as client_company
      FROM message_logs ml 
      LEFT JOIN clients c ON ml.client_id = c.id
      ORDER BY ml.sent_at DESC LIMIT 10
    `).all();

    // Top debtors
    const topDebtors = db.prepare(`
      SELECT * FROM clients WHERE status != 'paid' 
      ORDER BY amount_due DESC LIMIT 10
    `).all();

    return NextResponse.json({
      stats: {
        totalClients,
        activeClients,
        totalDebt,
        messagesSentToday,
        messagesSentWeek,
        messagesSentMonth,
        paidThisMonth,
        responseRate: totalClients > 0 ? Math.round((paidThisMonth / totalClients) * 100) : 0,
      },
      escalationDist,
      statusDist,
      messagesPerDay,
      recentActivity,
      topDebtors,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
