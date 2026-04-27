import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'production' });
});

// ── NVIDIA NIM Proxy ────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { apiKey, payload } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      let errJson = {};
      try { errJson = JSON.parse(errText); } catch { errJson = { message: errText }; }
      return res.status(response.status).json({ error: errJson.message || errJson.detail || `API Error ${response.status}` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(value);
        }
      } catch (e) {
        res.end();
      }
    };
    pump();

    req.on('close', () => { reader.cancel(); });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Proxy fetch failed' });
    }
  }
});

// Dummy endpoints for file system (won't work on Vercel disk but avoids 404)
app.post('/api/projects/:id/files', (req, res) => {
  res.json({ ok: true, note: 'Files saved to browser storage only on production.' });
});

app.get('/api/projects/:id/dir', (req, res) => {
  res.json({ dir: '', exists: false });
});

export default app;
