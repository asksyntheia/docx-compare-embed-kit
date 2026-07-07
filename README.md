# Syntheia DOCX Compare Embed Integration Kit

Embed the Syntheia **DOCX Compare** experience directly inside your application via an `<iframe>`,
authenticated with an **API key** instead of an interactive login. Your users upload two DOCX
files, run a comparison, and review/export the redline, all without ever seeing a Syntheia login
screen or subscription prompt, and without being logged out mid-session.

This kit contains:

- **This guide**: how the integration works and how to wire it up.
- **[`example/`](./example)**: a tiny, zero-dependency reference implementation (a backend that mints
  embed tokens plus a demo embedding page) you can run and read.

---

## How it works

The API key is a long-lived secret that must stay on **your** server. Your backend exchanges it
for a short-lived, workspace-scoped **embed token**, and only that token reaches the browser.

```
your page  → your backend  →(x-user-api-key: syn_…)→  POST /auth/embed/token  → { token, expiresIn }
your page  ← token
your page  → <iframe …/docx-compare?iframe=true>  +  postMessage({ type:'INIT_EMBED', accessToken: token })
iframe     → DOCX Compare runs (Bearer embed token, scoped to DOCX Compare only)   ✓
```

The embed token can **only** reach the DOCX Compare endpoints in **your one workspace**; it
cannot access the rest of the Syntheia platform or any other tenant.

---

## What Syntheia provides you

| Item | Value |
|---|---|
| **API key** (secret) | `syn_prd_…`, delivered separately over a secure channel. Never commit it or send it to the browser. |
| **Workspace ID** | a numeric id, provided by Syntheia |
| **API base URL** | `https://api.us.supercomparer.com` |
| **App base URL** | `https://app.us.supercomparer.com` |
| **Origin allowlist** | Send us the origin(s) you'll embed from (e.g. `https://app.example.com`) so we add them to the iframe's CSP (see step 3). |

---

## Integration

### 1. Backend: exchange your API key for an embed token

Add a small server-side endpoint that calls Syntheia and returns the token to your page. The key
stays server-side.

```
POST https://api.us.supercomparer.com/auth/embed/token
Header: x-user-api-key: syn_prd_…
→ 200 { "token": "<JWT>", "expiresIn": "7d" }
```

```js
// e.g. GET /session on your backend
const r = await fetch('https://api.us.supercomparer.com/auth/embed/token', {
  method: 'POST',
  headers: { 'x-user-api-key': process.env.SYN_API_KEY },
});
return await r.json(); // { token, expiresIn }
```

See [`example/server.js`](./example/server.js) for the complete version.

### 2. Frontend: embed the iframe and hand it the token

Point the iframe at DOCX Compare in embed mode (`?iframe=true` hides all Syntheia portal chrome),
then deliver the token with `postMessage`.

```js
const APP = 'https://app.us.supercomparer.com';
const WORKSPACE_ID = '<your workspace id>';
const { token } = await (await fetch('/session')).json();

frame.src = `${APP}/workspace/${WORKSPACE_ID}/docx-compare?iframe=true`;
// The app's message listener can mount slightly after the iframe loads, so resend until it sticks.
const send = () => frame.contentWindow.postMessage({ type: 'INIT_EMBED', accessToken: token }, APP);
const t = setInterval(send, 500); setTimeout(() => clearInterval(t), 20000); send();
```

The token is long-lived (7-day) and applied **in place**, so re-minting on page load (and on tab
focus, as a safety net) keeps the session alive indefinitely with no refresh protocol and no lost
work. See [`example/index.html`](./example/index.html).

### 3. Allowlist your embedding origin

For the browser to render the iframe, the origin of the page doing the embedding must be listed in
Syntheia's Content-Security-Policy `frame-ancestors`. **Send us every origin you'll embed from**
(scheme + host, e.g. `https://app.example.com`) and we'll allowlist it. Until an origin is added,
the browser blocks the frame.

---

## Run the example

```bash
cd example
cp .env.example .env          # Syntheia endpoints are pre-filled
#   → set SYN_API_KEY and WORKSPACE_ID to the values Syntheia gave you
set -a && . ./.env && set +a
node server.js                # Node 18+
# open http://localhost:4500
```

The demo page and token exchange run locally, but the embedded iframe only renders once your origin is allowlisted (step 3), since the browser blocks framing until then. To validate the flow before that, use the backend-only smoke test below (no allowlisting needed).

> **Backend-only smoke test** (no browser/CSP needed) that confirms the key works end to end:
> ```bash
> TOKEN=$(curl -s -XPOST https://api.us.supercomparer.com/auth/embed/token \
>   -H "x-user-api-key: $SYN_API_KEY" | grep -oP '"token":"\K[^"]+')
> curl -s -o redline.docx -w '%{http_code}\n' -XPOST https://api.us.supercomparer.com/reports/instant \
>   -H "Authorization: Bearer $TOKEN" \
>   -F "benchmarkDocument=@original.docx" -F "targetDocument=@revised.docx"
> ```

---

## Security notes

- **The API key never leaves your backend.** The browser only ever sees the short-lived embed token.
- **Least privilege.** The embed token is scoped to a single workspace and can only reach the
  DOCX Compare endpoints, not the rest of the platform, and not other tenants.
- **`postMessage` targets the Syntheia app origin explicitly** (`https://app.us.supercomparer.com`),
  never `'*'`. Keep it that way.
- **Revocation.** Ask Syntheia to revoke the key and no new sessions can be minted; any already-issued
  token simply expires on its own (7-day TTL).
