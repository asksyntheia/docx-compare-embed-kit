// Reference backend for embedding Syntheia DOCX Compare.
//
// Its only job is to exchange your per-user API key (syn_…) for a short-lived,
// workspace-scoped iframe embed token via POST /auth/embed/token. The API key
// stays on this server and never reaches the browser, only the embed token does.
// It also serves the demo embedding page (index.html).
//
// Node 18+ (global fetch), zero dependencies.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

function required(name) {
  const value = process.env[name];
  if (!value || value.includes('REPLACE_ME')) {
    console.error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return value;
}

const PORT = process.env.PORT || 4500;
const SYNTHEIA_API = process.env.SYNTHEIA_API || 'https://api.us.supercomparer.com';
const SYNTHEIA_APP = process.env.SYNTHEIA_APP || 'https://app.us.supercomparer.com';
// Your per-user API key, provided by Syntheia. Server-side only; never sent to the browser.
const SYN_API_KEY = required('SYN_API_KEY');
// The workspace the API key is scoped to, provided by Syntheia.
const WORKSPACE_ID = required('WORKSPACE_ID');

const server = http.createServer(async (req, res) => {
  // Server-to-server: mint an embed token from the API key.
  // The browser calls THIS endpoint, never Syntheia directly, so syn_… stays on the server.
  if (req.url === '/session') {
    try {
      const upstream = await fetch(`${SYNTHEIA_API}/auth/embed/token`, {
        method: 'POST',
        headers: { 'x-user-api-key': SYN_API_KEY },
      });
      const body = await upstream.text(); // passthrough of { token, expiresIn }
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  const html = fs
    .readFileSync(path.join(__dirname, 'index.html'), 'utf8')
    .replaceAll('__SYNTHEIA_APP__', SYNTHEIA_APP)
    .replaceAll('__WORKSPACE_ID__', WORKSPACE_ID);
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`DOCX Compare embed demo:  http://localhost:${PORT}`);
  console.log(`  Syntheia API:   ${SYNTHEIA_API}`);
  console.log(`  Syntheia app:   ${SYNTHEIA_APP}`);
  console.log(`  Workspace:      ${WORKSPACE_ID}`);
  console.log(`  API key:        ${SYN_API_KEY.slice(0, 8)}… (server-side only)`);
});
