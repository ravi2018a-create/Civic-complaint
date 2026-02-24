const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'civic.db');

let db = null;

async function initializeDatabase() {
  const SQL = await initSqlJs();

  // Load existing DB file or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing SQLite database.');
  } else {
    db = new SQL.Database();
    console.log('Created new SQLite database.');
  }

  // ---- CREATE TABLES ----
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      role TEXT NOT NULL DEFAULT 'citizen',
      created_at DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Submitted',
      priority TEXT DEFAULT 'Medium',
      image_path TEXT,
      user_id INTEGER NOT NULL,
      assigned_to INTEGER,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      updated_at DATETIME DEFAULT (datetime('now','localtime')),
      resolved_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- SEED DEFAULT USERS ----
  const userCount = db.exec("SELECT COUNT(*) FROM users");
  if (userCount[0].values[0][0] === 0) {
    db.run(`INSERT INTO users (name, email, password, phone, role) VALUES
      ('Rahul Sharma',  'citizen@demo.com',  'citizen123', '9876543210', 'citizen'),
      ('Priya Verma',   'citizen2@demo.com', 'citizen123', '9876543211', 'citizen'),
      ('Admin User',    'admin@demo.com',    'admin123',   '9000000001', 'admin')
    `);
    console.log('Default users seeded.');
  }

  // ---- SEED SAMPLE COMPLAINTS ----
  const compCount = db.exec("SELECT COUNT(*) FROM complaints");
  if (compCount[0].values[0][0] === 0) {
    db.run(`INSERT INTO complaints (complaint_id, title, category, description, location, status, priority, user_id) VALUES
      ('CMP-2026-000001', 'Pothole on Main Road',   'Roads & Footpaths', 'There is a large pothole near the bus stop on Main Road causing accidents.', '45 Main Road, Sector 12',  'Submitted',   'High',   1),
      ('CMP-2026-000002', 'Streetlight Not Working', 'Electricity',       'The streetlight near the park entrance has been off for a week.',            'Park Avenue, Block B',     'In Progress', 'Medium', 1),
      ('CMP-2026-000003', 'Garbage Not Collected',   'Waste Management',  'Garbage has not been collected from our area for 3 days.',                   '12 Green Colony, Ward 5',  'Submitted',   'High',   2)
    `);

    db.run(`INSERT INTO comments (complaint_id, user_id, message) VALUES
      (1, 1, 'Complaint submitted successfully.'),
      (2, 1, 'Complaint submitted successfully.'),
      (2, 3, 'Status changed to "In Progress". Our team has been dispatched.'),
      (3, 2, 'Complaint submitted successfully.')
    `);
    console.log('Sample complaints seeded.');
  }

  saveDatabase();
  return db;
}

// ---- Persist database to disk ----
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// ---- Query helpers ----

// SELECT multiple rows → array of objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// SELECT single row → object or null
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// INSERT / UPDATE / DELETE
function runSql(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return {
    lastInsertRowid: queryOne("SELECT last_insert_rowid() as id").id,
    changes: db.getRowsModified()
  };
}

// Generate unique complaint ID  e.g. CMP-2026-000004
function generateComplaintId() {
  const year = new Date().getFullYear();
  const last = queryOne(
    "SELECT complaint_id FROM complaints WHERE complaint_id LIKE ? ORDER BY id DESC LIMIT 1",
    [`CMP-${year}-%`]
  );

  let nextNum = 1;
  if (last) {
    const parts = last.complaint_id.split('-');
    nextNum = parseInt(parts[2]) + 1;
  }
  return `CMP-${year}-${String(nextNum).padStart(6, '0')}`;
}

module.exports = { initializeDatabase, queryAll, queryOne, runSql, generateComplaintId, saveDatabase };
