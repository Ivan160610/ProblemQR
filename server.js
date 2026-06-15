const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'remote-data.json');

const ensureDataFile = () => {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ data: [] }, null, 2), 'utf8');
  }
};

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

// Simple CORS middleware to allow remote clients (phone/other origin) to access the API
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/api/db', (req, res) => {
  try {
    ensureDataFile();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const json = JSON.parse(raw || '{"data":[] }');
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: 'Не удалось прочитать данные', details: err.message });
  }
});

app.post('/api/db', (req, res) => {
  try {
    const payload = req.body;
    const data = Array.isArray(payload?.data) ? payload.data : [];
    ensureDataFile();
    fs.writeFileSync(DATA_FILE, JSON.stringify({ data }, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сохранить данные', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});
