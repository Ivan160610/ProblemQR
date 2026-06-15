const http = require('http');
const fs = require('fs');
const path = require('path');
let Database;
try { Database = require('better-sqlite3'); } catch (e) { Database = null; }

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || '';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'remote-data.json');
const DB_FILE = path.join(ROOT, 'data.db');

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ data: [] }, null, 2), 'utf8');
  }
}

// Ensure backups and logs directories
const BACKUPS_DIR = path.join(ROOT, 'backups');
const LOGS_DIR = path.join(ROOT, 'logs');
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR);
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR);

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFile(path.join(LOGS_DIR, 'server.log'), line, () => {});
}

ensureDataFile();

// Initialize SQLite DB if available
let db = null;
function initSqlite() {
  if (!Database) return false;
  db = new Database(DB_FILE);
  // create table
  db.exec(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell TEXT,
    code TEXT UNIQUE,
    name TEXT,
    type TEXT,
    reason TEXT,
    comment TEXT,
    tags TEXT,
    photo TEXT,
    status TEXT,
    date TEXT
  );`);
  return true;
}

function migrateJsonToSqlite() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf8') || '{"data": []}';
    const json = JSON.parse(raw);
    const data = Array.isArray(json.data) ? json.data : [];
    const countRow = db.prepare('SELECT COUNT(*) as c FROM items').get();
    if (countRow && countRow.c > 0) return; // already has data
    const insert = db.prepare('INSERT OR IGNORE INTO items (cell, code, name, type, reason, comment, tags, photo, status, date) VALUES (@cell,@code,@name,@type,@reason,@comment,@tags,@photo,@status,@date)');
    const insertMany = db.transaction((arr) => {
      for (const it of arr) {
        insert.run({
          cell: it.cell || null,
          code: it.code || null,
          name: it.name || null,
          type: it.type || null,
          reason: it.reason || null,
          comment: it.comment || null,
          tags: JSON.stringify(it.tags || []),
          photo: it.photo || null,
          status: it.status || null,
          date: it.date || null
        });
      }
    });
    insertMany(data);
    log(`Migrated ${data.length} records from JSON to SQLite`);
  } catch (e) {
    log('Migration failed: ' + e.message);
  }
}

const sqliteAvailable = initSqlite();
if (sqliteAvailable) migrateJsonToSqlite();

const sseClients = new Set();

function sendSSE(eventName, data = '') {
  for (const res of sseClients) {
    try {
      res.write(`event: ${eventName}\n`);
      res.write(`data: ${data}\n\n`);
    } catch (e) {
      // ignore
    }
  }
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, pathname);
  if (pathname === '/' || pathname === '/index.html') filePath = path.join(ROOT, 'index.html');
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const ct = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const { method, url, headers } = req;
  const parsed = new URL(url, `http://${headers.host}`);
  const pathname = parsed.pathname;

  // Basic security headers for all responses
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; connect-src 'self' http://localhost:3000 https://*; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;");

  // CORS for API endpoints
  if (pathname.startsWith('/api/') || pathname === '/events' || pathname === '/openapi.json') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
  }

  if (pathname === '/api/db' && method === 'GET') {
    // Auth check for API if API_KEY configured
    if (API_KEY) {
      const key = headers['x-api-key'] || parsed.searchParams.get('key') || '';
      if (!key || key !== API_KEY) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        log(`Unauthorized GET /api/db from ${headers['x-forwarded-for'] || headers.host}`);
        return;
      }
    }
    try {
      if (db) {
        const rows = db.prepare('SELECT * FROM items ORDER BY id ASC').all();
        const data = rows.map(r => ({
          cell: r.cell,
          code: r.code,
          name: r.name,
          type: r.type,
          reason: r.reason,
          comment: r.comment,
          tags: (() => { try { return JSON.parse(r.tags || '[]'); } catch(e){ return []; } })(),
          photo: r.photo,
          status: r.status,
          date: r.date
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data }));
      } else {
        ensureDataFile();
        const raw = fs.readFileSync(DATA_FILE, 'utf8') || '{"data": []}';
        const json = JSON.parse(raw);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(json));
      }
      log(`GET /api/db successful`);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Не удалось прочитать данные', details: e.message }));
      log(`GET /api/db error: ${e.message}`);
    }
    return;
  }

  if (pathname === '/api/db' && method === 'POST') {
    // Auth check for API if API_KEY configured
    if (API_KEY) {
      const key = headers['x-api-key'] || parsed.searchParams.get('key') || '';
      if (!key || key !== API_KEY) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        log(`Unauthorized POST /api/db from ${headers['x-forwarded-for'] || headers.host}`);
        return;
      }
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const data = Array.isArray(payload.data) ? payload.data : [];
        // Basic validation: each item must have code and name
        for (const item of data) {
          if (!item || !item.code || !item.name) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Validation failed: each record requires code and name' }));
            log('POST /api/db validation failed');
            return;
          }
        }
        if (db) {
          const del = db.prepare('DELETE FROM items');
          db.transaction(() => {
            del.run();
            const insert = db.prepare('INSERT INTO items (cell, code, name, type, reason, comment, tags, photo, status, date) VALUES (@cell,@code,@name,@type,@reason,@comment,@tags,@photo,@status,@date)');
            for (const it of data) {
              insert.run({
                cell: it.cell || null,
                code: it.code || null,
                name: it.name || null,
                type: it.type || null,
                reason: it.reason || null,
                comment: it.comment || null,
                tags: JSON.stringify(it.tags || []),
                photo: it.photo || null,
                status: it.status || null,
                date: it.date || null
              });
            }
          })();
        } else {
          ensureDataFile();
          fs.writeFileSync(DATA_FILE, JSON.stringify({ data }, null, 2), 'utf8');
        }
        // create backup copy
        try {
          const bname = `backup-${Date.now()}.json`;
          fs.writeFileSync(path.join(BACKUPS_DIR, bname), JSON.stringify({ data }, null, 2), 'utf8');
        } catch (be) { log('Backup failed: ' + be.message); }
        // notify SSE clients
        sendSSE('dbUpdated', JSON.stringify({ time: Date.now() }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        log('POST /api/db saved, clients notified');
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Не удалось сохранить данные', details: e.message }));
        log('POST /api/db error: ' + e.message);
      }
    });
    return;
  }

  if (pathname === '/events' && method === 'GET') {
    // SSE endpoint
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  if (pathname === '/healthz' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sqlite: !!db, version: '1.0.0' }));
    return;
  }

  if (pathname === '/openapi.json' && method === 'GET') {
    const openapi = {
      openapi: '3.0.0',
      info: {
        title: 'Pro-Max Sync API',
        version: '1.0.0',
        description: 'API для синхронизации данных между телефоном и ПК.'
      },
      servers: [{ url: 'http://localhost:3000' }],
      paths: {
        '/api/db': {
          get: {
            summary: 'Получить все записи',
            responses: {
              '200': { description: 'OK' }
            },
            security: [{ ApiKeyAuth: [] }]
          },
          post: {
            summary: 'Сохранить записи',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { data: { type: 'array' } }, required: ['data'] }
                }
              }
            },
            responses: {
              '200': { description: 'OK' },
              '400': { description: 'Validation error' },
              '401': { description: 'Unauthorized' }
            },
            security: [{ ApiKeyAuth: [] }]
          }
        }
      },
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-KEY'
          }
        }
      }
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(openapi, null, 2));
    return;
  }

  // serve static files
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});
