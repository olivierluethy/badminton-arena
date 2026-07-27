// Single-process server: serves the built client over HTTP and hosts the
// authoritative game WebSocket on the same port (/ws).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { decodeMsg, type ClientMsg } from '@badminton/shared';
import { Manager } from './manager.js';

const PORT = Number(process.env.PORT ?? 8080);
const HERE = fileURLToPath(new URL('.', import.meta.url));
// server/dist/ → ../../client/dist
const CLIENT_DIR = join(HERE, '..', '..', 'client', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const manager = new Manager();

const httpServer = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = join(CLIENT_DIR, normalize(urlPath));

    // Prevent path traversal outside the client dir.
    if (!filePath.startsWith(CLIENT_DIR)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (urlPath === '/' || !existsSync(filePath)) {
      filePath = join(CLIENT_DIR, 'index.html');
    }
    if (!existsSync(filePath)) {
      res.writeHead(404).end('Client build not found. Run `npm run build` first.');
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500).end('Internal error');
  }
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  const conn = manager.addConnection(ws);
  ws.on('message', (data) => {
    let msg: ClientMsg;
    try {
      msg = decodeMsg<ClientMsg>(data.toString());
    } catch {
      return;
    }
    manager.handleMessage(conn, msg);
  });
  ws.on('close', () => manager.handleClose(conn));
  ws.on('error', () => manager.handleClose(conn));
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Badminton Arena server on http://localhost:${PORT}  (ws: /ws)`);
});
