import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..', '..');
const AI_BACKEND_DIR = path.join(WORKSPACE_ROOT, 'resQnet AI', 'backend');
const AI_PYTHON = path.join(AI_BACKEND_DIR, '.venv', 'Scripts', 'python.exe');

let aiProcess = null;

function checkAiHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8010/api/v1/health', { timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ running: res.statusCode === 200, data: JSON.parse(data) });
        } catch {
          resolve({ running: res.statusCode === 200, data: null });
        }
      });
    });
    req.on('error', (e) => resolve({ running: false, data: null, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ running: false, data: null, error: 'timeout' }); });
  });
}

function launchAiBackend() {
  if (!fs.existsSync(AI_PYTHON)) {
    throw new Error(`Python virtual environment not found at: ${AI_PYTHON}`);
  }

  aiProcess = spawn(
    AI_PYTHON,
    ['-m', 'uvicorn', 'app.main:app', '--app-dir', AI_BACKEND_DIR, '--host', '0.0.0.0', '--port', '8010'],
    {
      cwd: AI_BACKEND_DIR,
      detached: true,
      stdio: 'ignore'
    }
  );

  aiProcess.unref();
  return true;
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/ai-launcher/status') {
    const health = await checkAiHealth();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ running: health.running, health: health.data, err: health.error }));
    return;
  }

  if (url.pathname === '/api/ai-launcher/start' && req.method === 'POST') {
    const health = await checkAiHealth();
    if (health.running) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'already_running', running: true, message: 'ResQnet AI backend is already operational.' }));
      return;
    }

    try {
      launchAiBackend();

      // Poll up to 15 seconds for models to warm up
      let isReady = false;
      let finalHealth = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const check = await checkAiHealth();
        if (check.running) {
          isReady = true;
          finalHealth = check.data;
          break;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: isReady ? 'started' : 'starting',
        running: isReady,
        health: finalHealth,
        message: isReady ? 'ResQnet AI backend successfully started.' : 'ResQnet AI backend process spawned and warming models.'
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

const PORT = 8011;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ResQnet AI Launcher Service] running on http://127.0.0.1:${PORT}`);
});
