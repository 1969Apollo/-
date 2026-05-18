const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'tickets.db');

const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

function initTable() {
  return new Promise((resolve, reject) => {
    const sql = `
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function ensureTable(req, res, next) {
  initTable()
    .then(() => next())
    .catch((err) => {
      console.error('Failed to create tickets table:', err.message);
      res.status(500).json({ success: false, error: 'Database initialization failed' });
    });
}

app.post('/api/tickets', ensureTable, (req, res) => {
  const { title, description } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ success: false, error: 'title is required' });
  }

  const sql = 'INSERT INTO tickets (title, description) VALUES (?, ?)';
  db.run(sql, [title.trim(), description ?? ''], function (err) {
    if (err) {
      if (err.message.includes('no such table')) {
        return initTable()
          .then(() => {
            db.run(sql, [title.trim(), description ?? ''], function (retryErr) {
              if (retryErr) {
                console.error(retryErr.message);
                return res.status(500).json({ success: false, error: 'Failed to create ticket' });
              }
              res.status(201).json({ success: true, id: this.lastID });
            });
          })
          .catch(() => res.status(500).json({ success: false, error: 'Database initialization failed' }));
      }
      console.error(err.message);
      return res.status(500).json({ success: false, error: 'Failed to create ticket' });
    }
    res.status(201).json({ success: true, id: this.lastID });
  });
});

app.get('/api/tickets', ensureTable, (req, res) => {
  const sql = 'SELECT * FROM tickets ORDER BY created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) {
      if (err.message.includes('no such table')) {
        return initTable()
          .then(() => {
            db.all(sql, [], (retryErr, retryRows) => {
              if (retryErr) {
                console.error(retryErr.message);
                return res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
              }
              res.json(retryRows);
            });
          })
          .catch(() => res.status(500).json({ success: false, error: 'Database initialization failed' }));
      }
      console.error(err.message);
      return res.status(500).json({ success: false, error: 'Failed to fetch tickets' });
    }
    res.json(rows);
  });
});

initTable()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other process or run:`);
        console.error(`  netstat -ano | findstr :${PORT}`);
        console.error(`  taskkill /PID <pid> /F`);
      } else {
        console.error(err.message);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error(err.message);
    process.exit(0);
  });
});
