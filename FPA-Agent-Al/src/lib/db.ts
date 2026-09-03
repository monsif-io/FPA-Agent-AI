import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/fpa.db');

// Ensure data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDatabase(db);
  }
  return db;
}

function initializeDatabase(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT DEFAULT '',
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',
      amount_due REAL DEFAULT 0,
      currency TEXT DEFAULT 'MAD',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','disputed','suspended')),
      escalation_level TEXT DEFAULT 'friendly' CHECK(escalation_level IN ('friendly','formal','urgent','final')),
      messages_sent INTEGER DEFAULT 0,
      last_message_at TEXT,
      due_date TEXT,
      notes TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      escalation_level TEXT DEFAULT 'friendly' CHECK(escalation_level IN ('friendly','formal','urgent','final')),
      language TEXT DEFAULT 'fr',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      frequency TEXT DEFAULT 'weekly' CHECK(frequency IN ('daily','weekly','biweekly','monthly','custom')),
      time_of_day TEXT DEFAULT '09:00',
      days_of_week TEXT DEFAULT '1,2,3,4,5',
      template_id INTEGER,
      is_active INTEGER DEFAULT 1,
      next_run TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS message_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      template_id INTEGER,
      channel TEXT DEFAULT 'email' CHECK(channel IN ('email','telegram','system')),
      subject TEXT DEFAULT '',
      body TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('sent','failed','pending','cancelled')),
      error_message TEXT DEFAULT '',
      tracking_id TEXT DEFAULT '',
      opened_at TEXT DEFAULT NULL,
      open_count INTEGER DEFAULT 0,
      sent_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT DEFAULT 'info' CHECK(type IN ('reply','alert','info','warning','success')),
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      client_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      source TEXT DEFAULT 'telegram' CHECK(source IN ('telegram','email','dashboard')),
      target_client_id INTEGER,
      data TEXT NOT NULL DEFAULT '{}',
      preview_text TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','expired')),
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT (datetime('now', '+1 hour')),
      FOREIGN KEY (target_client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automation_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      steps TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Alter clients table to support automation flows
  try {
    database.exec("ALTER TABLE clients ADD COLUMN automation_flow_id INTEGER REFERENCES automation_flows(id);");
  } catch (_) {}
  try {
    database.exec("ALTER TABLE clients ADD COLUMN current_flow_step_index INTEGER DEFAULT 0;");
  } catch (_) {}
  try {
    database.exec("ALTER TABLE clients ADD COLUMN flow_started_at TEXT DEFAULT NULL;");
  } catch (_) {}

  // =============================================
  // BILLING AGENT TABLES
  // =============================================
  database.exec(`
    CREATE TABLE IF NOT EXISTS billing_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      abbreviation TEXT DEFAULT '',
      contact_person TEXT DEFAULT '',
      contact_civility TEXT DEFAULT 'M.',
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT 'Casablanca',
      country TEXT DEFAULT 'Maroc',
      ice TEXT DEFAULT '',
      rc TEXT DEFAULT '',
      if_number TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      collections_client_id INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_date TEXT NOT NULL,
      due_date TEXT DEFAULT NULL,
      client_id INTEGER NOT NULL,
      reference_text TEXT DEFAULT '',
      salutation TEXT DEFAULT 'Cher client',
      subtotal_ht REAL DEFAULT 0,
      tva_rate REAL DEFAULT 20.0,
      tva_amount REAL DEFAULT 0,
      disbursements REAL DEFAULT 0,
      total_ttc REAL DEFAULT 0,
      amount_in_words TEXT DEFAULT '',
      payment_terms TEXT DEFAULT 'Virement bancaire',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','sent','viewed','paid','cancelled','overdue')),
      pdf_path TEXT DEFAULT '',
      pdf_generated_at TEXT DEFAULT NULL,
      sent_at TEXT DEFAULT NULL,
      sent_to_email TEXT DEFAULT '',
      sent_method TEXT DEFAULT '' CHECK(sent_method IN ('','email','telegram','download','dashboard')),
      source_type TEXT DEFAULT 'manual' CHECK(source_type IN ('manual','photo','pdf_upload','audio','text')),
      source_file_path TEXT DEFAULT '',
      ai_extracted_data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES billing_clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      detail TEXT DEFAULT '',
      quantity REAL DEFAULT 1,
      unit TEXT DEFAULT 'forfait',
      unit_price REAL DEFAULT 0,
      total_ht REAL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS billing_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT DEFAULT '',
      category TEXT DEFAULT 'company',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS billing_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      invoice_id INTEGER,
      client_id INTEGER,
      details TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_state (
      chat_id TEXT PRIMARY KEY,
      current_flow TEXT DEFAULT NULL,
      step INTEGER DEFAULT 0,
      data TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS billing_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      salutation_text TEXT DEFAULT '',
      closing_text TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed default billing settings
  seedBillingDefaults(database);

  // Seed default billing demo data if empty
  const billingClientCount = database.prepare('SELECT COUNT(*) as count FROM billing_clients').get() as { count: number };
  if (billingClientCount.count === 0) {
    seedBillingDemoData(database);
  }

  // Seed default templates if none exist
  const templateCount = database.prepare('SELECT COUNT(*) as count FROM templates').get() as { count: number };
  if (templateCount.count === 0) {
    seedDefaults(database);
  } else {
    // Make sure new settings keys are seeded even if database already exists
    const insertSetting = database.prepare(`
      INSERT OR IGNORE INTO settings (key, value, category) VALUES (?, ?, ?)
    `);
    const newSettings = [
      ['email_send_method', 'brevo', 'email'],
      ['brevo_api_key', '', 'email'],
      ['brevo_sender_email', 'contact@alfa-01.com', 'email'],
      ['brevo_sender_name', 'Alfa-01', 'email'],
    ];
    for (const [key, value, category] of newSettings) {
      insertSetting.run(key, value, category);
    }
  }

  // Seed default automation flows if none exist
  const flowCount = database.prepare('SELECT COUNT(*) as count FROM automation_flows').get() as { count: number };
  if (flowCount.count === 0) {
    seedDefaultFlows(database);
  }
}

function seedBillingDemoData(database: Database.Database) {
  // 1. Insert Default Billing Templates
  database.exec(`
    INSERT OR IGNORE INTO billing_templates (name, salutation_text, closing_text, is_default)
    VALUES ('Modèle Standard FPA', 'Cher client, Nous vous souhaitons bonne réception de la présente note d''honoraires ci-après qui se rapporte à la prestation suivante :', 'Arrêtée la présente note d''honoraires à la somme de', 1);
  `);

  // 2. Insert Demo Clients
  const insertClient = database.prepare(`
    INSERT INTO billing_clients (name, abbreviation, contact_person, contact_civility, email, phone, address, city, country, ice, rc, if_number, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const cmrId = insertClient.run(
    'CAISSE MAROCAINE DES RETRAITES',
    'CMR',
    'Lotfi BOUJENDAR',
    'M.',
    'cmr@yahoo.com',
    '+212 537 567 890',
    'Av. El Araar, Hay Riad, Rabat\nB.P. 2048 - Maroc',
    'Rabat',
    'Maroc',
    '001771456000030',
    '45678',
    '99887766',
    'Client institutionnel'
  ).lastInsertRowid;

  const wasalId = insertClient.run(
    'WASAL SARL AU',
    'WAS',
    'Salwa IDRISSI ABOULAHJOUL',
    'Mme',
    'wasal@yahoo.com',
    '+212 522 345 678',
    'Immeuble Bershka, Bd Massira Al Khadra, 2ème étage\nCasablanca - Maroc',
    'Casablanca',
    'Maroc',
    '003613160000005',
    '78912',
    '55443322',
    'Contrat de services récurrents'
  ).lastInsertRowid;

  const p3cId = insertClient.run(
    'PAR3 COM',
    'P3C',
    'Bouchra OUTAGHANI',
    'Mme',
    'par3com@yahoo.com',
    '+212 522 987 654',
    '19, rue Ben Al Hadj Safi Addine - Casa Plaisance,\nAnfa, Casablanca 20050',
    'Casablanca',
    'Maroc',
    '000203596000092',
    '34567',
    '11223344',
    'Client PME'
  ).lastInsertRowid;

  const alfaId = insertClient.run(
    'ALFA HOLDING GROUP S.A.',
    'ALFA',
    'Mehdi ALAMI',
    'M.',
    'comptabilite@alfaholding.ma',
    '+212 522 678 900',
    'Tour Casablanca Finance City, 14ème étage, Casa-Anfa\nCasablanca 20200',
    'Casablanca',
    'Maroc',
    '001892345000078',
    '51234',
    '44332211',
    'Grand compte holding multisectoriel'
  ).lastInsertRowid;

  const innoId = insertClient.run(
    'INNOVATECH SOLUTIONS SARL',
    'INNO',
    'Karim BENCHEKROUN',
    'M.',
    'finance@innovatech.ma',
    '+212 522 789 012',
    'Casablanca Nearshore Park, Shore 3, 1100 Bd Al Qods\nSidi Maarouf, Casablanca',
    'Casablanca',
    'Maroc',
    '002456789000041',
    '62890',
    '33221100',
    'Entreprise IT & Fintech'
  ).lastInsertRowid;

  // 3. Insert Demo Invoices
  const insertInvoice = database.prepare(`
    INSERT INTO invoices (
      invoice_number, invoice_date, due_date, client_id, reference_text, salutation,
      subtotal_ht, tva_rate, tva_amount, disbursements, total_ttc, amount_in_words,
      payment_terms, status, pdf_path, source_type, created_at,
      document_type, closing_text, contact_name, show_coupon, show_watermark,
      show_bank_details, show_debours, service_date_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertItem = database.prepare(`
    INSERT INTO invoice_items (invoice_id, description, detail, quantity, unit, unit_price, total_ht, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Invoice 1: CMR (Marché Public / Institutionnel - Note d'honoraires)
  const inv1Id = insertInvoice.run(
    'CMR-F0001-2026',
    '2026-03-03',
    '2026-04-03',
    cmrId,
    'Notre Marché n° 03/2025/CMR et Votre Ordre de service du 15 Juillet 2025',
    'A l\'Attention de Monsieur Lotfi BOUJENDAR',
    58000,
    20,
    11600,
    0,
    69600,
    'Soixante Neuf Mille Six Cents Dirhams',
    'Virement bancaire',
    'paid',
    '',
    'manual',
    '-30 day',
    'Note d\'honoraires',
    'Arrêtée la Présente Note d\'honoraires à la somme de',
    'Siham OUSAID',
    1, 1, 1, 1, ''
  ).lastInsertRowid;

  insertItem.run(
    inv1Id,
    'Mission d\'évaluation de la démarche de gestion des risques au sein de la Caisse Marocaine des Retraites',
    'Remise et Réception de l\'ensemble des livrables - 100% des honoraires convenus',
    1,
    'forfait',
    58000,
    58000,
    0
  );

  // Invoice 2: WASAL (Corporate Marketplace - Note d'honoraires avec date de fin)
  const inv2Id = insertInvoice.run(
    'WASAL-F0002-2026',
    '2026-04-10',
    '2026-05-10',
    wasalId,
    'Notre Contrat de services du 10 Février 2025',
    'A l\'Attention de Madame Salwa IDRISSI ABOULAHJOUL',
    87500,
    20,
    17500,
    0,
    105000,
    'Cent Cinq Mille Dirhams',
    'Virement bancaire',
    'sent',
    '',
    'manual',
    '-10 day',
    'Note d\'honoraires',
    'Arrêté la présente facture à la somme de',
    'Siham OUSAID',
    1, 1, 1, 1,
    'Date de finalisation des prestations:   Le 19 Juin 2025'
  ).lastInsertRowid;

  insertItem.run(
    inv2Id,
    'Mission d\'accompagnement pour la formalisation des schémas comptables, fiscaux, bancaires, et des processus opérationnels de gestion de la MarketPlace Wa-Sal',
    'Pour solde de la mission - 17,5 JH de prestation',
    1,
    'forfait',
    87500,
    87500,
    0
  );

  // Invoice 3: PAR3COM (PME - Supervision Mensuelle)
  const inv3Id = insertInvoice.run(
    'PAR3COM-F0003-2026',
    '2026-05-15',
    '2026-06-15',
    p3cId,
    'Notre Lettre de mission du 14 Février 2023',
    'A l\'Attention de Madame Bouchra OUTAGHANI',
    6500,
    20,
    1300,
    0,
    7800,
    'Sept Mille Huit Cents Dirhams',
    'Virement bancaire',
    'overdue',
    '',
    'manual',
    '-2 day',
    'Note d\'honoraires',
    'Arrêtée la Présente Note d\'honoraires à la somme de',
    'Siham OUSAID',
    1, 1, 1, 1, ''
  ).lastInsertRowid;

  insertItem.run(
    inv3Id,
    'Mission de supervision des activités de gestion financière de votre société au titre de l\'exercice 2023',
    'Abonnement mensuel - Juillet 2023',
    1,
    'forfait',
    6500,
    6500,
    0
  );

  // Invoice 4: ALFA HOLDING (Conseil Juridique & Fiscal avec Débours)
  const inv4Id = insertInvoice.run(
    'ALFA-F0004-2026',
    '2026-06-20',
    '2026-07-20',
    alfaId,
    'Convention d\'assistance juridique et fiscale n° AJ-2026/04',
    'A l\'Attention de Monsieur Mehdi ALAMI',
    35000,
    20,
    7000,
    4200,
    46200,
    'Quarante Six Mille Deux Cents Dirhams',
    'Virement bancaire',
    'sent',
    '',
    'manual',
    '-5 day',
    'Note d\'honoraires',
    'Arrêtée la Présente Note d\'honoraires à la somme de',
    'Siham OUSAID',
    1, 1, 1, 1, ''
  ).lastInsertRowid;

  insertItem.run(
    inv4Id,
    'Prestation d\'assistance à la restructuration juridique et fiscale des filiales du groupe',
    'Audit de conformité et formalisation des actes juridiques',
    1,
    'forfait',
    35000,
    35000,
    0
  );

  // Invoice 5: INNOVATECH (Facture Standard - Prestation Technique IT)
  const inv5Id = insertInvoice.run(
    'INNO-F0005-2026',
    '2026-07-01',
    '2026-08-01',
    innoId,
    'Bon de commande n° BC-2026/899',
    'A l\'Attention de Monsieur Karim BENCHEKROUN',
    45000,
    20,
    9000,
    0,
    54000,
    'Cinquante Quatre Mille Dirhams',
    'Virement bancaire',
    'draft',
    '',
    'manual',
    '-1 day',
    'Facture',
    'Arrêté la présente facture à la somme de',
    'Siham OUSAID',
    1, 1, 1, 0, ''
  ).lastInsertRowid;

  insertItem.run(
    inv5Id,
    'Audit de sécurité et conformité du système d\'information financier',
    'Cartographie des flux de trésorerie, tests d\'intrusion et plan de remédiation',
    1,
    'forfait',
    45000,
    45000,
    0
  );
  
  // Set next seq to 6
  database.prepare("UPDATE billing_settings SET value = '6' WHERE key = 'next_invoice_seq'").run();
}

function seedDefaults(database: Database.Database) {
  // Default templates
  const insertTemplate = database.prepare(`
    INSERT INTO templates (name, subject, body, escalation_level, is_default) 
    VALUES (?, ?, ?, ?, 1)
  `);

  insertTemplate.run(
    'Rappel Amical',
    'Rappel de paiement - Facture en attente',
    `Bonjour {{nom}},

Nous espérons que vous allez bien. Nous souhaitons vous rappeler qu'un montant de {{montant}} {{devise}} reste en attente de règlement concernant {{entreprise}}.

Nous vous serions reconnaissants de bien vouloir procéder au paiement dans les meilleurs délais.

Cordialement,
L'équipe {{company_name}}`,
    'friendly'
  );

  insertTemplate.run(
    'Relance Formelle',
    'Relance - Facture impayée {{montant}} {{devise}}',
    `Madame, Monsieur {{nom}},

Sauf erreur de notre part, nous n'avons pas encore reçu le règlement de la somme de {{montant}} {{devise}}, arrivée à échéance le {{date_echeance}}.

Nous vous prions de bien vouloir régulariser cette situation dans un délai de 7 jours.

Veuillez agréer nos salutations distinguées.
L'équipe {{company_name}}`,
    'formal'
  );

  insertTemplate.run(
    'Mise en Demeure',
    'URGENT - Mise en demeure de paiement',
    `Madame, Monsieur {{nom}},

Malgré nos précédentes relances, le montant de {{montant}} {{devise}} demeure impayé à ce jour.

Nous vous mettons formellement en demeure de régler cette somme sous 48 heures, faute de quoi nous serons contraints d'engager les procédures de recouvrement appropriées.

Direction Financière - {{company_name}}`,
    'urgent'
  );

  insertTemplate.run(
    'Dernière Relance',
    'DERNIÈRE RELANCE AVANT PROCÉDURE - {{montant}} {{devise}}',
    `Madame, Monsieur {{nom}},

Le présent courrier constitue notre dernière relance amiable concernant la créance de {{montant}} {{devise}}.

Sans règlement de votre part dans les 24 heures, notre dossier sera transmis au service contentieux pour recouvrement judiciaire.

Direction Générale - {{company_name}}`,
    'final'
  );

  // Default settings
  const insertSetting = database.prepare(`
    INSERT OR IGNORE INTO settings (key, value, category) VALUES (?, ?, ?)
  `);

  const defaultSettings = [
    ['email_send_method', 'brevo', 'email'],
    ['brevo_api_key', '', 'email'],
    ['brevo_sender_email', 'contact@alfa-01.com', 'email'],
    ['brevo_sender_name', 'Alfa-01', 'email'],
    ['smtp_host', 'panel.allinone-cloud.website', 'email'],
    ['smtp_port', '465', 'email'],
    ['smtp_user', 'sarah@alfa-01.com', 'email'],
    ['smtp_pass', 'Js1F9bP97vtR', 'email'],
    ['smtp_from', 'sarah@alfa-01.com', 'email'],
    ['smtp_secure', 'true', 'email'],
    ['imap_host', 'panel.allinone-cloud.website', 'email'],
    ['imap_port', '993', 'email'],
    ['imap_user', 'sarah@alfa-01.com', 'email'],
    ['imap_pass', 'Js1F9bP97vtR', 'email'],
    ['admin_email', 'sarah@alfa-01.com', 'email'],

    ['telegram_bot_token', '8785971609:AAFdEBG3jV9F0RVXqFm12u-ddq-OlTK76Rk', 'telegram'],
    ['telegram_admin_chat_id', '', 'telegram'],
    ['notification_daily_report', 'true', 'notifications'],
    ['notification_failed_message', 'true', 'notifications'],
    ['notification_client_reply', 'true', 'notifications'],
    ['notification_max_messages_threshold', '10', 'notifications'],
    ['notification_report_frequency', 'daily', 'notifications'],
    ['notification_report_time', '18:00', 'notifications'],
    ['openrouter_api_key', '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', 'ai'],
    ['openrouter_model', 'google/gemini-2.5-flash', 'ai'],
    ['company_name', 'FinancePro Advisory', 'general'],
    ['default_send_time', '09:00', 'general'],
    ['timezone', 'Africa/Casablanca', 'general'],
    ['default_currency', 'MAD', 'general'],
    ['default_frequency', 'weekly', 'general'],
  ];

  for (const [key, value, category] of defaultSettings) {
    insertSetting.run(key, value, category);
  }
}

function seedDefaultFlows(database: Database.Database) {
  const insertFlow = database.prepare(`
    INSERT INTO automation_flows (name, description, steps, is_default)
    VALUES (?, ?, ?, ?)
  `);

  // Scenario 1: Recouvrement Progressif (Défaut)
  insertFlow.run(
    'Recouvrement Progressif (Défaut)',
    'Une approche graduelle et amicale pour la plupart des clients.',
    JSON.stringify([
      { template_id: 1, delay_days: 7 },
      { template_id: 1, delay_days: 7 },
      { template_id: 2, delay_days: 7 },
      { template_id: 3, delay_days: 5 },
      { template_id: 4, delay_days: 3 }
    ]),
    1
  );

  // Scenario 2: Recouvrement Rapide
  insertFlow.run(
    'Recouvrement Rapide',
    'Cycle court pour les factures à relancer rapidement.',
    JSON.stringify([
      { template_id: 1, delay_days: 3 },
      { template_id: 2, delay_days: 3 },
      { template_id: 3, delay_days: 2 },
      { template_id: 4, delay_days: 2 }
    ]),
    0
  );

  // Scenario 3: Recouvrement Ferme
  insertFlow.run(
    'Recouvrement Ferme',
    'Relance stricte débutant directement par un ton formel.',
    JSON.stringify([
      { template_id: 2, delay_days: 5 },
      { template_id: 3, delay_days: 5 },
      { template_id: 4, delay_days: 3 }
    ]),
    0
  );

  // Scenario 4: Recouvrement Doux (Long)
  insertFlow.run(
    'Recouvrement Doux (Long)',
    'Cycle étalé sur plusieurs semaines pour les partenaires stratégiques.',
    JSON.stringify([
      { template_id: 1, delay_days: 14 },
      { template_id: 1, delay_days: 14 },
      { template_id: 2, delay_days: 14 },
      { template_id: 3, delay_days: 7 }
    ]),
    0
  );

  // Scenario 5: Recouvrement Express (Ultime)
  insertFlow.run(
    'Recouvrement Express (Ultime)',
    'Relance d\'urgence maximale pour les situations critiques.',
    JSON.stringify([
      { template_id: 2, delay_days: 2 },
      { template_id: 3, delay_days: 2 },
      { template_id: 4, delay_days: 1 }
    ]),
    0
  );
}

function seedBillingDefaults(database: Database.Database) {
  const insertSetting = database.prepare(`
    INSERT OR IGNORE INTO billing_settings (key, value, category) VALUES (?, ?, ?)
  `);

  const billingSettings = [
    // Company info
    ['company_name', 'Finance Pro Advisory S.A.R.L. AU', 'company'],
    ['company_address', 'Espace Paquet, Angle rue Mohammed Smiha et Pierre Parent, N° 423, 4ème étage - Casablanca', 'company'],
    ['company_phone', '+212 522 905 893', 'company'],
    ['company_website', 'www.financeproadvisory.com', 'company'],
    ['company_rc', '360.159', 'company'],
    ['company_tp', '32182569', 'company'],
    ['company_if', '20681166', 'company'],
    ['company_cnss', '5182332', 'company'],
    ['company_ice', '001769356000082', 'company'],
    ['company_manager', 'Siham OUSAID', 'company'],
    ['company_manager_title', 'Associée Gérante', 'company'],

    // Bank info
    ['bank_name', 'CFG BANK', 'bank'],
    ['bank_branch', 'Bd. Massira AL Khadra, Maarif - Casablanca - Maroc', 'bank'],
    ['bank_rib', '050 780 001 01 078302 420 01 39', 'bank'],

    // Invoice settings
    ['invoice_format', '{abbreviation}-{seq}-{year}', 'invoice'],
    ['invoice_tva_rate', '20', 'invoice'],
    ['invoice_currency', 'MAD', 'invoice'],
    ['next_invoice_seq', '1', 'invoice'],

    // Default invoice text
    ['invoice_salutation', 'Cher client, Nous vous souhaitons bonne réception de la présente note d\'honoraires ci-après qui se rapporte à la prestation suivante :', 'invoice'],
    ['invoice_closing', 'Arrêtée la présente note d\'honoraires à la somme de', 'invoice'],

    // v2.1 fields
    ['company_email', 'contact@financeproadvisory.com', 'company'],
    ['company_logo_path', '/logo.png', 'company'],
    ['tva_legal_note', 'TVA payée sur les encaissements déductible au moment du règlement.', 'invoice'],
    ['payment_legal_note', 'Règlement à réception de facture.', 'invoice'],
    ['invoice_default_type', "Note d'honoraires", 'invoice'],
    ['invoice_closing_facture', 'Arrêté la présente facture à la somme de', 'invoice'],
    ['coupon_title', 'A JOINDRE AU REGLEMENT', 'invoice'],
    ['bank_order_of', 'Finance Pro Advisory', 'bank'],
    ['pdf_show_watermark', 'true', 'display'],
    ['pdf_watermark_opacity', '0.045', 'display'],
    ['pdf_show_coupon', 'true', 'display'],
    ['pdf_show_bank', 'true', 'display'],
    ['pdf_show_debours', 'true', 'display'],
  ];

  for (const [key, value, category] of billingSettings) {
    insertSetting.run(key, value, category);
  }
}

export default getDb;
