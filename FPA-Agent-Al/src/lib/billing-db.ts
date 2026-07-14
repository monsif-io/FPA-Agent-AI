import getDb from './db';

export interface BillingClient {
  id?: number;
  name: string;
  abbreviation?: string;
  contact_person?: string;
  contact_civility?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  ice?: string;
  rc?: string;
  if_number?: string;
  notes?: string;
  is_active?: number;
  collections_client_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  description: string;
  detail?: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_ht: number;
  sort_order?: number;
}

export interface Invoice {
  id?: number;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  client_id: number;
  reference_text?: string;
  salutation?: string;
  subtotal_ht: number;
  tva_rate: number;
  tva_amount: number;
  disbursements: number;
  total_ttc: number;
  amount_in_words?: string;
  payment_terms?: string;
  status: 'draft' | 'sent' | 'viewed' | 'paid' | 'cancelled' | 'overdue';
  pdf_path?: string;
  pdf_generated_at?: string | null;
  sent_at?: string | null;
  sent_to_email?: string;
  sent_method?: string;
  source_type?: 'manual' | 'photo' | 'pdf_upload' | 'audio' | 'text';
  source_file_path?: string;
  ai_extracted_data?: string;
  created_at?: string;
  updated_at?: string;
  client_name?: string; // joined
  client_abbreviation?: string; // joined
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  client_city?: string;
  client_country?: string;
  client_ice?: string;
  client_rc?: string;
  client_if_number?: string;
  items?: InvoiceItem[];
}

export function getBillingSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value, category FROM billing_settings').all() as { key: string; value: string; category: string }[];
  
  const settings: Record<string, string> = {};
  rows.forEach(r => {
    settings[r.key] = r.value;
  });
  return settings;
}

export function updateBillingSetting(key: string, value: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO billing_settings (key, value, category, updated_at)
    VALUES (?, ?, 'company', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

export function getBillingClients(search = '') {
  const db = getDb();
  if (search) {
    const term = `%${search}%`;
    return db.prepare(`
      SELECT * FROM billing_clients 
      WHERE is_active = 1 AND (name LIKE ? OR abbreviation LIKE ? OR email LIKE ?)
      ORDER BY name ASC
    `).all(term, term, term) as BillingClient[];
  }
  return db.prepare('SELECT * FROM billing_clients WHERE is_active = 1 ORDER BY name ASC').all() as BillingClient[];
}

export function getBillingClientById(id: number) {
  const db = getDb();
  return db.prepare('SELECT * FROM billing_clients WHERE id = ?').get(id) as BillingClient | undefined;
}

export function createBillingClient(client: BillingClient) {
  const db = getDb();
  const res = db.prepare(`
    INSERT INTO billing_clients (
      name, abbreviation, contact_person, contact_civility, email, phone, 
      address, city, country, ice, rc, if_number, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client.name,
    client.abbreviation || '',
    client.contact_person || '',
    client.contact_civility || 'M.',
    client.email,
    client.phone || '',
    client.address || '',
    client.city || 'Casablanca',
    client.country || 'Maroc',
    client.ice || '',
    client.rc || '',
    client.if_number || '',
    client.notes || ''
  );
  
  logBillingActivity('client_created', undefined, Number(res.lastInsertRowid), `Client "${client.name}" créé`);
  return res.lastInsertRowid;
}

export function updateBillingClient(id: number, client: Partial<BillingClient>) {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  
  Object.entries(client).forEach(([key, val]) => {
    if (key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  });
  
  if (fields.length === 0) return;
  
  fields.push("updated_at = datetime('now')");
  values.push(id);
  
  db.prepare(`UPDATE billing_clients SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  logBillingActivity('client_updated', undefined, id, `Client ID ${id} mis à jour`);
}

export function getInvoices(status?: string) {
  const db = getDb();
  let query = `
    SELECT i.*, bc.name as client_name, bc.abbreviation as client_abbreviation,
           bc.collections_client_id as collections_client_id
    FROM invoices i
    JOIN billing_clients bc ON i.client_id = bc.id
  `;
  const params: any[] = [];
  
  if (status) {
    query += ' WHERE i.status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY i.invoice_date DESC, i.id DESC';
  return db.prepare(query).all(...params) as Invoice[];
}

export function getInvoiceById(id: number) {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*, bc.name as client_name, bc.abbreviation as client_abbreviation,
           bc.email as client_email, bc.phone as client_phone, bc.address as client_address,
           bc.city as client_city, bc.country as client_country, bc.ice as client_ice,
           bc.rc as client_rc, bc.if_number as client_if_number,
           bc.collections_client_id as collections_client_id
    FROM invoices i
    JOIN billing_clients bc ON i.client_id = bc.id
    WHERE i.id = ?
  `).get(id) as Invoice | undefined;
  
  if (invoice) {
    invoice.items = db.prepare(`
      SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC
    `).all(id) as InvoiceItem[];
  }
  
  return invoice;
}

export function getNextInvoiceNumber(clientAbbreviation: string) {
  const db = getDb();
  const settings = getBillingSettings();
  const format = settings.invoice_format || '{abbreviation}-{seq}-{year}';
  const year = new Date().getFullYear().toString();
  
  // Find current seq
  const seq = Number(settings.next_invoice_seq || '1');
  const seqStr = seq.toString().padStart(4, '0'); // CMR-F0003-2026
  
  const num = format
    .replace('{abbreviation}', clientAbbreviation || 'FPA')
    .replace('{seq}', `F${seqStr}`)
    .replace('{year}', year);
    
  return { number: num, seq };
}

export function incrementInvoiceSeq() {
  const db = getDb();
  const settings = getBillingSettings();
  const nextSeq = Number(settings.next_invoice_seq || '1') + 1;
  updateBillingSetting('next_invoice_seq', nextSeq.toString());
}

export function createInvoice(invoice: Omit<Invoice, 'id'>, items: Omit<InvoiceItem, 'id' | 'invoice_id'>[]) {
  const db = getDb();
  
  const transaction = db.transaction(() => {
    // 1. Insert Invoice
    const res = db.prepare(`
      INSERT INTO invoices (
        invoice_number, invoice_date, due_date, client_id, reference_text, salutation,
        subtotal_ht, tva_rate, tva_amount, disbursements, total_ttc, amount_in_words,
        payment_terms, status, pdf_path, source_type, source_file_path, ai_extracted_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoice.invoice_number,
      invoice.invoice_date,
      invoice.due_date || null,
      invoice.client_id,
      invoice.reference_text || '',
      invoice.salutation || 'Cher client',
      invoice.subtotal_ht,
      invoice.tva_rate,
      invoice.tva_amount,
      invoice.disbursements,
      invoice.total_ttc,
      invoice.amount_in_words || '',
      invoice.payment_terms || 'Virement bancaire',
      invoice.status || 'draft',
      invoice.pdf_path || '',
      invoice.source_type || 'manual',
      invoice.source_file_path || '',
      invoice.ai_extracted_data || '{}'
    );
    
    const invoiceId = Number(res.lastInsertRowid);
    
    // 2. Insert Items
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, description, detail, quantity, unit, unit_price, total_ht, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    items.forEach((item, idx) => {
      insertItem.run(
        invoiceId,
        item.description,
        item.detail || '',
        item.quantity,
        item.unit || 'forfait',
        item.unit_price,
        item.total_ht,
        item.sort_order ?? idx
      );
    });
    
    incrementInvoiceSeq();
    
    logBillingActivity('invoice_created', invoiceId, invoice.client_id, `Facture ${invoice.invoice_number} créée`);
    return invoiceId;
  });
  
  return transaction();
}

export function updateInvoiceStatus(id: number, status: string, method?: string) {
  const db = getDb();
  if (method) {
    db.prepare(`
      UPDATE invoices 
      SET status = ?, sent_at = datetime('now'), sent_method = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run(status, method, id);
  } else {
    db.prepare(`
      UPDATE invoices 
      SET status = ?, updated_at = datetime('now') 
      WHERE id = ?
    `).run(status, id);
  }
  
  logBillingActivity('invoice_status_changed', id, undefined, `Statut changé à "${status}"` + (method ? ` via ${method}` : ''));
}

export function logBillingActivity(action: string, invoiceId?: number, clientId?: number, details?: string) {
  const db = getDb();
  db.prepare(`
    INSERT INTO billing_activity_log (action, invoice_id, client_id, details)
    VALUES (?, ?, ?, ?)
  `).run(action, invoiceId || null, clientId || null, details || '');
}
