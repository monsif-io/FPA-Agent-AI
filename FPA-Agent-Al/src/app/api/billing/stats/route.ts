import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

// GET /api/billing/stats
export async function GET() {
  try {
    const db = getDb();

    const totalInvoices = db.prepare('SELECT COUNT(*) as count FROM invoices').get() as { count: number };
    const totalTTC = db.prepare('SELECT COALESCE(SUM(total_ttc), 0) as total FROM invoices WHERE status != \'cancelled\'').get() as { total: number };
    const sentThisMonth = db.prepare(`
      SELECT COUNT(*) as count FROM invoices 
      WHERE status = 'sent' AND strftime('%Y-%m', sent_at) = strftime('%Y-%m', 'now')
    `).get() as { count: number };
    const totalClients = db.prepare('SELECT COUNT(*) as count FROM billing_clients WHERE is_active = 1').get() as { count: number };

    // Invoices per month (last 6 months)
    const invoicesPerMonth = db.prepare(`
      SELECT strftime('%Y-%m', invoice_date) as month, 
             COUNT(*) as count,
             COALESCE(SUM(total_ttc), 0) as total
      FROM invoices 
      WHERE status != 'cancelled'
      GROUP BY month 
      ORDER BY month DESC 
      LIMIT 6
    `).all();

    // Status distribution
    const statusDist = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM invoices
      GROUP BY status
    `).all();

    // Recent invoices
    const recentInvoices = db.prepare(`
      SELECT i.*, bc.name as client_name, bc.abbreviation
      FROM invoices i
      JOIN billing_clients bc ON i.client_id = bc.id
      ORDER BY i.created_at DESC
      LIMIT 5
    `).all();

    // Top clients by revenue
    const topClients = db.prepare(`
      SELECT bc.name, bc.abbreviation, 
             COUNT(i.id) as invoice_count,
             COALESCE(SUM(i.total_ttc), 0) as total_revenue
      FROM billing_clients bc
      LEFT JOIN invoices i ON bc.id = i.client_id AND i.status != 'cancelled'
      WHERE bc.is_active = 1
      GROUP BY bc.id
      ORDER BY total_revenue DESC
      LIMIT 5
    `).all();

    return NextResponse.json({
      stats: {
        totalInvoices: totalInvoices.count,
        totalTTC: totalTTC.total,
        sentThisMonth: sentThisMonth.count,
        totalClients: totalClients.count,
      },
      invoicesPerMonth: (invoicesPerMonth as { month: string; count: number; total: number }[]).reverse(),
      statusDist,
      recentInvoices,
      topClients,
    });
  } catch (error) {
    console.error('Billing stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch billing stats' }, { status: 500 });
  }
}
