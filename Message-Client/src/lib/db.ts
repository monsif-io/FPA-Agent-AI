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

  // Seed default templates if none exist
  const templateCount = database.prepare('SELECT COUNT(*) as count FROM templates').get() as { count: number };
  if (templateCount.count === 0) {
    seedDefaults(database);
  }

  // Seed default automation flows if none exist
  const flowCount = database.prepare('SELECT COUNT(*) as count FROM automation_flows').get() as { count: number };
  if (flowCount.count === 0) {
    seedDefaultFlows(database);
  }
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

export default getDb;
