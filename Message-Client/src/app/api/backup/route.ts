import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    // Secure the endpoint by checking the token against ADMIN_PASSWORD
    const adminPassword = process.env.ADMIN_PASSWORD || 'FPA@Collect2026!';
    if (token !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const databasePath = process.env.DATABASE_PATH || './data/fpa.db';
    const resolvedPath = path.resolve(process.cwd(), databasePath);

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({ error: 'Database file not found', path: resolvedPath }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(resolvedPath);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="fpa.db"',
      },
    });
  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
