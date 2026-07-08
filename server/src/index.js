import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api } from './api.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = express();

app.use(express.json({ limit: '2mb' }));
// sendBeacon posts text/plain — accept it as JSON too.
app.use(express.text({ type: 'text/plain', limit: '2mb' }), (req, _res, next) => {
  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      req.body = {};
    }
  }
  next();
});

// The browser extension's service worker posts from a chrome-extension://
// origin; the ingest API is open by design for this prototype.
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/api', api);
app.use('/tracker', express.static(path.join(root, 'tracker')));
app.use('/demo', express.static(path.join(root, 'demo-app')));

const dashboardDist = path.join(root, 'dashboard', 'dist');
if (fs.existsSync(dashboardDist)) {
  app.use(express.static(dashboardDist));
  app.get('*', (_req, res) => res.sendFile(path.join(dashboardDist, 'index.html')));
} else {
  app.get('/', (_req, res) =>
    res
      .status(200)
      .send('FlowLens server is running. Dashboard not built yet — run `npm run build` first. Demo app: <a href="/demo/">/demo/</a>')
  );
}

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`FlowLens running on http://localhost:${port}`);
  console.log(`  dashboard  → http://localhost:${port}/`);
  console.log(`  demo app   → http://localhost:${port}/demo/`);
  console.log(`  api        → http://localhost:${port}/api/stats`);
});
