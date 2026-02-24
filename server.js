const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, queryAll, queryOne, runSql, generateComplaintId } = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = queryOne(
    'SELECT id, name, email, phone, role FROM users WHERE email = ? AND password = ?',
    [email, password]
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({ message: 'Login successful', user });
});

// Get user info
app.get('/api/auth/user/:id', (req, res) => {
  const user = queryOne(
    'SELECT id, name, email, phone, address, role, created_at FROM users WHERE id = ?',
    [Number(req.params.id)]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ==================== COMPLAINT ROUTES ====================

// Create complaint
app.post('/api/complaints', upload.single('image'), (req, res) => {
  try {
    const { title, category, description, location, priority, user_id } = req.body;

    if (!title || !category || !description || !location || !user_id) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const complaintId = generateComplaintId();
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const result = runSql(
      `INSERT INTO complaints (complaint_id, title, category, description, location, priority, image_path, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [complaintId, title, category, description, location, priority || 'Medium', imagePath, Number(user_id)]
    );

    // Add initial comment
    runSql(
      'INSERT INTO comments (complaint_id, user_id, message) VALUES (?, ?, ?)',
      [result.lastInsertRowid, Number(user_id), 'Complaint submitted successfully.']
    );

    res.status(201).json({
      message: 'Complaint submitted successfully',
      complaint_id: complaintId,
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit complaint' });
  }
});

// Get complaints for a citizen
app.get('/api/complaints/user/:userId', (req, res) => {
  const complaints = queryAll(
    `SELECT c.*, u.name as citizen_name
     FROM complaints c
     JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?
     ORDER BY c.created_at DESC`,
    [Number(req.params.userId)]
  );
  res.json(complaints);
});

// Get all complaints (admin)
app.get('/api/complaints', (req, res) => {
  const { status, category, search } = req.query;

  let query = `
    SELECT c.*, u.name as citizen_name
    FROM complaints c
    JOIN users u ON c.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'all') {
    query += ' AND c.status = ?';
    params.push(status);
  }
  if (category && category !== 'all') {
    query += ' AND c.category = ?';
    params.push(category);
  }
  if (search) {
    query += ' AND (c.title LIKE ? OR c.complaint_id LIKE ? OR c.location LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY c.created_at DESC';

  const complaints = queryAll(query, params);
  res.json(complaints);
});

// Get single complaint with comments
app.get('/api/complaints/:id', (req, res) => {
  const complaint = queryOne(
    `SELECT c.*, u.name as citizen_name, u.email as citizen_email, u.phone as citizen_phone
     FROM complaints c
     JOIN users u ON c.user_id = u.id
     WHERE c.id = ?`,
    [Number(req.params.id)]
  );

  if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

  const comments = queryAll(
    `SELECT cm.*, u.name as user_name, u.role as user_role
     FROM comments cm
     JOIN users u ON cm.user_id = u.id
     WHERE cm.complaint_id = ?
     ORDER BY cm.created_at ASC`,
    [Number(req.params.id)]
  );

  res.json({ ...complaint, comments });
});

// Update complaint status (admin)
app.patch('/api/complaints/:id/status', (req, res) => {
  const { status, comment, user_id } = req.body;

  if (!status || !user_id) {
    return res.status(400).json({ error: 'Status and user_id are required' });
  }

  const validStatuses = ['Submitted', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const now = new Date().toISOString();

  if (status === 'Resolved') {
    runSql(
      'UPDATE complaints SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?',
      [status, now, now, Number(req.params.id)]
    );
  } else {
    runSql(
      'UPDATE complaints SET status = ?, updated_at = ? WHERE id = ?',
      [status, now, Number(req.params.id)]
    );
  }

  // Add status change comment
  const msg = comment || `Status changed to "${status}"`;
  runSql(
    'INSERT INTO comments (complaint_id, user_id, message) VALUES (?, ?, ?)',
    [Number(req.params.id), Number(user_id), msg]
  );

  res.json({ message: 'Status updated successfully' });
});

// Add comment to complaint
app.post('/api/complaints/:id/comments', (req, res) => {
  const { user_id, message } = req.body;

  if (!user_id || !message) {
    return res.status(400).json({ error: 'User ID and message are required' });
  }

  runSql(
    'INSERT INTO comments (complaint_id, user_id, message) VALUES (?, ?, ?)',
    [Number(req.params.id), Number(user_id), message]
  );

  runSql(
    'UPDATE complaints SET updated_at = ? WHERE id = ?',
    [new Date().toISOString(), Number(req.params.id)]
  );

  res.status(201).json({ message: 'Comment added successfully' });
});

// Delete complaint (admin)
app.delete('/api/complaints/:id', (req, res) => {
  runSql('DELETE FROM comments WHERE complaint_id = ?', [Number(req.params.id)]);
  runSql('DELETE FROM complaints WHERE id = ?', [Number(req.params.id)]);
  res.json({ message: 'Complaint deleted successfully' });
});

// ==================== STATS ROUTE ====================

app.get('/api/stats', (req, res) => {
  const total       = queryOne('SELECT COUNT(*) as count FROM complaints').count;
  const submitted   = queryOne("SELECT COUNT(*) as count FROM complaints WHERE status = 'Submitted'").count;
  const inProgress  = queryOne("SELECT COUNT(*) as count FROM complaints WHERE status = 'In Progress'").count;
  const acknowledged= queryOne("SELECT COUNT(*) as count FROM complaints WHERE status = 'Acknowledged'").count;
  const resolved    = queryOne("SELECT COUNT(*) as count FROM complaints WHERE status = 'Resolved'").count;
  const rejected    = queryOne("SELECT COUNT(*) as count FROM complaints WHERE status = 'Rejected'").count;

  const byCategory = queryAll(
    'SELECT category, COUNT(*) as count FROM complaints GROUP BY category ORDER BY count DESC'
  );

  const recent = queryAll(
    `SELECT c.complaint_id, c.title, c.status, c.created_at, u.name as citizen_name
     FROM complaints c JOIN users u ON c.user_id = u.id
     ORDER BY c.created_at DESC LIMIT 5`
  );

  res.json({
    total, submitted, inProgress, acknowledged, resolved, rejected,
    byCategory, recent
  });
});

// ==================== SERVE FRONTEND ====================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== START SERVER ====================
// Initialize DB (async) then start listening
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  Civic Complaint Management System`);
    console.log(`  ==================================`);
    console.log(`  Server running at: http://localhost:${PORT}`);
    console.log(`\n  Demo Accounts:`);
    console.log(`  Citizen: citizen@demo.com / citizen123`);
    console.log(`  Admin:   admin@demo.com / admin123\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
