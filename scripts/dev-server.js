#!/usr/bin/env node
// Zero-dependency dev server: static files + live reload. Node stdlib only
// (http/https/fs/crypto), no npm install, no build step.
//
// localhost is already a "secure context" in every browser even over plain
// http — that's what IndexedDB/ES modules need, not an actual TLS cert. So
// this defaults to http. Pass --https for a self-signed cert instead (the
// browser will still show an untrusted-certificate warning to click past,
// since it's not signed by a real CA).
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv.find((a) => /^\d+$/.test(a))) || 8000;
const USE_HTTPS = process.argv.includes('--https');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp',
};

const RELOAD_SCRIPT = `
<script>
  new EventSource('/__reload').onmessage = () => location.reload();
</script>`;

let clients = [];
function notifyReload() {
  for (const res of clients) res.write('data: reload\n\n');
  clients = [];
}

function serveFile(req, res) {
  let filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (filePath.endsWith('/')) filePath += 'index.html';
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    if (ext === '.html') {
      res.end(data.toString('utf8').replace('</body>', RELOAD_SCRIPT + '</body>'));
    } else {
      res.end(data);
    }
  });
}

function requestHandler(req, res) {
  if (req.url === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.push(res);
    req.on('close', () => { clients = clients.filter((c) => c !== res); });
    return;
  }
  serveFile(req, res);
}

function selfSignedCert() {
  const { execSync } = require('child_process');
  const certDir = path.join(__dirname, '.cert');
  const keyPath = path.join(certDir, 'key.pem'), certPath = path.join(certDir, 'cert.pem');
  if (!fs.existsSync(keyPath)) {
    fs.mkdirSync(certDir, { recursive: true });
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost"`, { stdio: 'ignore' });
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

const server = USE_HTTPS ? https.createServer(selfSignedCert(), requestHandler) : http.createServer(requestHandler);

let debounce;
fs.watch(ROOT, { recursive: true }, (_, filename) => {
  if (!filename || filename.includes('.cert') || filename.startsWith('.git')) return;
  clearTimeout(debounce);
  debounce = setTimeout(notifyReload, 100);
});

server.listen(PORT, () => {
  const scheme = USE_HTTPS ? 'https' : 'http';
  console.log(`Serving ${ROOT} at ${scheme}://localhost:${PORT}/ (auto-reload on save)`);
  if (USE_HTTPS) console.log('Self-signed cert — click through the browser warning once.');
});
