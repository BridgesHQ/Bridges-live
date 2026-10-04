# Bridges Live — live.bridgesglobal.co
Live-commerce real estate platform. Front-end prototype + backend starter code + specs.
- Front-end: index.html + all pages (deploy to Cloudflare Pages)
- /backend: schema, API (streams/WebSocket, payments), MLS sync, escrow webhooks, Next.js components
- /docs: full architecture, matcha PoC spec, Command Center, compliance, Claude Code handoff
See /docs/START_IN_CLAUDE_CODE.md to build the backend.

## Run it locally
```bash
npm install && npm run dev   # → http://localhost:3000  (no keys needed to try it)
```
Live grid + player, WebSocket chat/viewer counts, "just bought" events, PayPal checkout (matcha)
and the same engine for property showings / reserve holds. See **docs/RUN_LOCALLY.md** for
Supabase + PayPal sandbox setup, and **docs/DEPLOY.md** to put it live on live.bridgesglobal.co.
