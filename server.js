import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  // ── Middleware ──────────────────────────────────────────────
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // ── Health Check ────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  // ── Project Files: Write to disk ────────────────────────────
  const PROJECTS_DIR = path.join(__dirname, '.nexus-projects');
  if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });

  app.post('/api/projects/:id/files', (req, res) => {
    const { id } = req.params;
    const { files } = req.body; // [{ path: 'src/App.jsx', content: '...' }]
    if (!files || !Array.isArray(files)) return res.status(400).json({ error: 'files array required' });

    const projectDir = path.join(PROJECTS_DIR, id);
    try {
      files.forEach(file => {
        const filePath = path.join(projectDir, file.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content, 'utf8');
      });
      res.json({ ok: true, dir: projectDir });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/projects/:id/dir', (req, res) => {
    const { id } = req.params;
    const projectDir = path.join(PROJECTS_DIR, id);
    res.json({ dir: projectDir, exists: fs.existsSync(projectDir) });
  });

  app.delete('/api/projects/:id', (req, res) => {
    const { id } = req.params;
    const projectDir = path.join(PROJECTS_DIR, id);
    try {
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true });
      }
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // ── HTTP Server ─────────────────────────────────────────────
  const appServer = createHttpServer(app);
  appServer.timeout = 0; // Disable timeout for long-running AI generations

  // ── WebSocket Terminal Server ───────────────────────────────
  const wss = new WebSocketServer({ server: appServer });

  wss.on('connection', (ws) => {
    console.log(`\x1b[32m[TERMINAL]\x1b[0m Client connected`);

    let activeProcs = new Set();
    let cwd = __dirname;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'init') {
          cwd = msg.cwd || __dirname;
          if (!fs.existsSync(cwd)) {
            fs.mkdirSync(cwd, { recursive: true });
          }
          ws.send(JSON.stringify({ type: 'ready', cwd }));

        } else if (msg.type === 'input') {
          // Run command directly
          const cmdStr = msg.data.trim();
          if (!cmdStr) return;

          // If it's a cd command, just change the local cwd state
          if (cmdStr.startsWith('cd ')) {
            const target = cmdStr.substring(3).trim();
            const newCwd = path.resolve(cwd, target);
            if (fs.existsSync(newCwd)) {
              cwd = newCwd;
              ws.send(JSON.stringify({ type: 'output', data: `\x1b[32mChanged directory to ${cwd}\x1b[0m\n` }));
            } else {
              ws.send(JSON.stringify({ type: 'output', data: `\x1b[31mcd: ${target}: No such file or directory\x1b[0m\n` }));
            }
            ws.send(JSON.stringify({ type: 'cmd_done', code: 0 }));
            return;
          }

          const proc = spawn(cmdStr, [], {
            cwd,
            shell: true,
            env: process.env
          });

          activeProcs.add(proc);

          proc.stdout.on('data', d => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'output', data: d.toString() })));
          proc.stderr.on('data', d => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'output', data: d.toString() })));
          
          proc.on('exit', code => {
            activeProcs.delete(proc);
            if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'cmd_done', code }));
          });
        }
      } catch (e) {
        console.error('[Terminal WS] Parse error:', e.message);
      }
    });

    ws.on('close', () => {
      console.log(`\x1b[33m[TERMINAL]\x1b[0m Client disconnected`);
      activeProcs.forEach(p => p.kill());
      activeProcs.clear();
    });
  });

  appServer.listen(PORT, "0.0.0.0", () => {
    console.log(`\x1b[36m[NEXUS]\x1b[0m Server running at http://localhost:${PORT}`);
  });
}

startServer();
