# Partner API

## Overview

HTTP API for external partners to manage users, wallets, trading, and AI conversations on Milo. All endpoints are versioned under `/api/v1` and require an API key (except signup).

Trading execution note: executable swap previews and transactions now come from DFlow `/order`, and signed v0 swap transactions are submitted through Helius Sender (v1 stays on standard RPC until the Sender compatibility gate is enabled). The partner-facing request and response shapes remain unchanged.

Need an API key? [Contact us on Discord](https://discord.com/invite/join-milo)

## Authentication

All endpoints (except signup) require one of:

- `X-API-Key: sk_live_…` — a partner API key (full access to the key owner's data).
- `Authorization: Bearer mat_…` — an MCP OAuth 2.1 access token obtained through the OAuth flow described in `docs/mcp.md`. The token is bound to one user and a set of scopes; each route requires a scope (`profile`, `portfolio:read`, `chat`, `strategies:write`, `trade`, `transfer`; research and signal-feed reads need any valid token). Strategy create/update need `strategies:write`; strategy **sync** and delete need `trade` (sync re-applies the strategy onto the live account's settings). Conversation routes need `chat`, and the agent behind a conversation only gets the order/swap/position tools if the token also carries `trade`, the send-tokens tool with `transfer`, and strategy create/edit tools with `strategies:write`. A token without the needed scope gets `403` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="…"`; an invalid or expired token gets `401` with `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…"`. Refresh with `POST /oauth/token` (`grant_type=refresh_token`).

```bash
curl -H "X-API-Key: sk_live_..." https://partners.andmilo.com/api/v1/users/{userId}/positions
curl -H "Authorization: Bearer mat_..." https://partners.andmilo.com/api/v1/users/{userId}/positions
```

User-scoped endpoints use `{userId}` in the path. Wallet-scoped endpoints use `{walletId}`. With an OAuth token, `{userId}` must be the token's user.

### OAuth 2.1 endpoints (MCP authorization server)

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata (PKCE S256, `client_id_metadata_document_supported`, `iss` on responses) |
| `GET /.well-known/oauth-protected-resource[/mcp]` | RFC 9728 metadata for the `/mcp` resource |
| `POST /oauth/register` | RFC 7591 dynamic client registration (JSON) |
| `GET /oauth/authorize` | authorization request (`response_type=code`, `code_challenge_method=S256`, optional `scope`, `state`, `resource`) → consent page |
| `GET /oauth/consent?rid=…` | consent page (Solana wallet sign-in or reviewer login) |
| `POST /oauth/token` | `authorization_code` / `refresh_token` grants, form-urlencoded |
| `POST /oauth/revoke` | RFC 7009 revocation (revoking a refresh token revokes the whole connection) |

## MCP Endpoint

The same server also exposes an MCP Streamable HTTP endpoint at:

- `POST /mcp` (initialize + JSON-RPC requests)
- `GET /mcp` (SSE stream for a session)
- `DELETE /mcp` (terminate a session)

Notes:

- Use `Mcp-Session-Id` for sessioned requests after initialization.
- `Accept` should include `application/json` and `text/event-stream` for POST.
- `POST /mcp` initialize accepts optional `X-API-Key` **or** `Authorization: Bearer mat_…` (OAuth 2.1; the bearer must then be sent on every request).
- If omitted, the session starts unauthenticated: signup/public tools work, `tools/list` works, and the first protected `tools/call` (anything beyond the signup/public tools) returns `401` with a `WWW-Authenticate` challenge pointing at `/.well-known/oauth-protected-resource/mcp` so OAuth-capable clients (Claude, ChatGPT, Inspector) connect; the session is then upgraded in place. API-key sessions keep working exactly as before.
- OAuth sessions only see tools covered by the granted scopes (`profile`, `portfolio:read`, `chat`, `strategies:write`; `trade`/`transfer` are never granted to directory clients — `sync_strategy` is a `trade` tool) and `userId` arguments default to the signed-in user.
- After an anonymous session runs `signup`, the session is bound to the returned API key in place: the next `get_me` (or any protected tool) on that same session works without re-initializing. Clients that open a new MCP session per tool call (most hosted connectors) must send the returned key as `X-API-Key` on every request.
- MCP tools that forward paginated endpoints enforce `page <= 100` and `pageSize <= 100`.
- Abuse protections and request throttling are enforced. Initialize may return `429` during high load; authenticated callers (API key / OAuth grant) get a much larger initialize allowance than anonymous per-IP sessions, so per-call-session clients should authenticate on initialize. Each API key / OAuth user keeps at most 10 live MCP sessions: initializing an 11th closes that principal's least recently used session (requests on it then get an invalid-session error; re-initialize).
- MCP sessions are bounded and idle sessions can be evicted; if a session expires, re-initialize.
- If a session expires, sessioned calls return invalid-session errors and the client should re-initialize.
- Tools carry a `title` and MCP annotations: read-only tools are `readOnlyHint: true`; money-moving/irreversible tools, state-replacing tools (`sync_strategy`, `update_strategy`, `pause_order`) and the conversation writes (`create_conversation`, `send_message` — the agent can update autotrade settings or close positions when asked, after the user approves the agent's `approvalRequest` via `send_message` `approval`) are `destructiveHint: true` with a leading `⚠️` warning in the description. Only signup, `create_strategy` and `claim_quest` are additive writes. Full list in `docs/mcp.md`.
- The server's `instructions` describe Milo as both a stock research product (analyst ratings, insider/congress/8-K events, fundamentals, earnings) and an autonomous trading-agent product (crypto on Solana + brokered US equities).
- Synchronous research tools (`get_stock_research_digest`, `get_insider_transactions`, `get_recent_insider_buys`, `get_congress_trades`, `get_8k_events`) mirror the `/api/v1/research/*` routes: market-level reads (any credential (API key or OAuth bearer, no scope needed), no userId), `readOnlyHint: true`, ticker validated (1-6 chars), `days`/`limit` clamped to 365/100, a short text summary, the same JSON serialized as a second text block (for clients that ignore `structuredContent`), and `structuredContent`. The FMP-derived tools (`get_analyst_consensus`, `get_stock_fundamentals`, `get_earnings_timeline`, `get_stock_news`, `get_peer_comparison`) are registered only when the server runs with `MCP_LICENSED_RESEARCH_TOOLS=true` (default off).

Client setup examples (OpenAI Codex + Claude Desktop): see `docs/mcp.md`.

## Quick Start

1. **Sign up** — Request a SIWX message, sign it with your wallet, register
2. **Save credentials** — Store `apiKey`, `user.id`, and wallet IDs
3. **Deposit SOL** — Send SOL to your Milo wallet address
4. **Activate auto-trading** — `PATCH /api/v1/users/{userId}/auto-trade-settings` with `{ "isActive": true }`
5. **Fetch open quests** — `GET /api/v1/users/{userId}/quests` to see available quests. Claim bones for completed quests.

---

## Endpoints

### Me

#### Get Current User

`GET /api/v1/me`

Resolve the authenticated API key to the user profile, wallets, and trading accounts. Use this to discover your `userId`, `walletId`, and `tradingAccountId` values.

```bash
curl https://partners.andmilo.com/api/v1/me \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "user": {
    "id": "uuid",
    "signupWalletId": "uuid",
    "provider": "siwx",
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "wallets": [
    { "id": "uuid", "address": "7HgJ...", "chain": "solana", "type": "signup" },
    { "id": "uuid", "address": "HCm9...", "chain": "solana", "type": "milo" }
  ],
  "tradingAccounts": [
    {
      "id": "uuid",
      "type": "milo_wallet",
      "walletId": "uuid",
      "walletAddress": "HCm9...",
      "chain": "solana",
      "name": "Custody Wallet",
      "isDefault": true,
      "status": "active",
      "brokerage": null
    },
    {
      "id": "uuid",
      "type": "stock_brokerage",
      "walletId": null,
      "walletAddress": null,
      "chain": null,
      "name": "Brokerage",
      "isDefault": false,
      "status": "active",
      "brokerage": {
        "id": "uuid",
        "broker": "alpaca",
        "displayName": "Brokerage",
        "institutionName": "Generic Broker",
        "accountMask": "1234",
        "accountType": "cash",
        "currency": "USD",
        "isPaper": true,
        "isTradeEnabled": false,
        "supportsFractionalShares": false,
        "supportsMarketOrders": false,
        "supportsLimitOrders": false,
        "syncStatus": "not_configured",
        "lastSyncedAt": null,
        "disconnectedAt": null
      }
    }
  ]
}
```

---

### Signup

Signup is public (no API key needed) and has two steps.

#### Step 1: Get SIWX Message

`POST /api/v1/users/siwx/message`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/siwx/message \
  -H "Content-Type: application/json" \
  -d '{
    "accountAddress": "7HgJ...your-wallet-address",
    "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
  }'
```

| Field            | Type   | Required | Description                         |
| ---------------- | ------ | -------- | ----------------------------------- |
| `accountAddress` | string | yes      | Solana wallet address (32-64 chars) |
| `chainId`        | string | yes      | CAIP-2 chain ID                     |
| `inviteCode`     | string | no       | Optional invite code                |

**Response:**

```json
{
  "data": {
    "data": {
      "accountAddress": "7HgJ...",
      "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "domain": "andmilo.com",
      "uri": "https://andmilo.com",
      "version": "v1",
      "nonce": "abc123",
      "issuedAt": "2025-01-01T00:00:00.000Z",
      "expirationTime": "2025-01-08T00:00:00.000Z",
      "statement": "By signing, you agree to andmilo Terms of Use..."
    },
    "message": "andmilo.com wants you to sign in with your Solana account:\n7HgJ...\n\n..."
  }
}
```

Sign the `message` string (UTF-8 bytes) with your ed25519 private key. Base58-encode the signature.

#### Step 2: Register

`POST /api/v1/users`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "signupWallet": "7HgJ...your-wallet-address",
    "siwx": {
      "data": { "...data object from step 1..." },
      "message": "...message string from step 1...",
      "signature": "...base58 signature..."
    }
  }'
```

Pass `data` and `message` exactly as returned by step 1.

**Response:**

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "signupWalletId": "uuid",
      "provider": "siwx",
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    "wallets": [
      { "id": "uuid", "address": "7HgJ...", "chain": "solana", "type": "signup" },
      { "id": "uuid", "address": "HCm9...", "chain": "solana", "type": "milo" }
    ],
    "tradingAccounts": [
      {
        "id": "uuid",
        "type": "milo_wallet",
        "walletId": "uuid",
        "walletAddress": "HCm9...",
        "chain": "solana",
        "name": "Custody Wallet",
        "isDefault": true,
        "status": "active",
        "brokerage": null
      }
    ],
    "apiKey": "sk_live_..."
  }
}
```

You get two wallets:

- **signup** — Your external signing wallet
- **milo** — Your trading wallet. Deposit SOL here.

You also get a default `milo_wallet` trading account linked to the Milo wallet. Autotrade settings are scoped to trading accounts; legacy user-level settings endpoints target the default trading account.

Returns `409 Conflict` if the wallet already belongs to an existing user.

---

### Trading Accounts

#### List Trading Accounts

`GET /api/v1/trading-accounts`

```bash
curl https://partners.andmilo.com/api/v1/trading-accounts \
  -H "X-API-Key: $API_KEY"
```

Returns the authenticated user's trading accounts. `milo_wallet` accounts are linked to Milo wallets. `stock_brokerage` accounts are read-only in this phase: `walletId`, `walletAddress`, and `chain` are `null`, and only sanitized broker, display, paper/live mode, capability, and sync fields are exposed under `brokerage`. Stock brokerage provisioning is internal-service only; there is no public create endpoint.

---

### Auto-Trade Settings

The legacy user-level settings endpoints below are compatibility adapters over the user's default trading account.

#### Get Settings

`GET /api/v1/users/{userId}/auto-trade-settings`

```bash
curl https://partners.andmilo.com/api/v1/users/{userId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY"
```

Returns the current configuration including `strategySync` status if a strategy is linked.

#### Update Settings

`PATCH /api/v1/users/{userId}/auto-trade-settings`

```bash
curl -X PATCH https://partners.andmilo.com/api/v1/users/{userId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": true,
    "riskTolerance": "balanced",
    "strategy": "SWING TRADER",
    "instructions": "Focus on SOL ecosystem tokens",
    "customTickers": ["SOL", "JUP", "BONK"],
    "allocation": { "majors": 40, "native": 30, "memes": 20, "stables": 10 }
  }'
```

| Field           | Type           | Description                                                                                                     |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| `isActive`      | boolean        | Enable/disable auto-trading                                                                                     |
| `riskTolerance` | string         | `conservative`, `balanced`, `degen`; derives `riskPolicy` defaults                                              |
| `riskPolicy`    | object         | User-level risk policy: `maxTicketUsd`, `maxDrawdownPct`, `maxConcurrentLosingPositions`, `lossCooldownMinutes` |
| `strategy`      | string         | `VALUE INVESTOR`, `SWING TRADER`, `SCALPER`, `CUSTOM`                                                           |
| `strategyId`    | uuid \| null   | Link a saved strategy                                                                                           |
| `modelVersion`  | string \| null | Preferred model for autotrade decisions                                                                         |
| `instructions`  | string         | Free-text trading instructions                                                                                  |
| `customTickers` | string[]       | Tokens to focus on                                                                                              |
| `assetClassSettings` | object | Per-asset-class configuration, keyed by asset class |
| `allocation`    | object         | Asset class percentages                                                                                         |

When `strategyId` is a non-null saved strategy id, the API applies that strategy server-side. The saved `instructions`, `allocation`, `customTickers`, `assetClassSettings`, and `strategy` values are snapshotted into settings; duplicate values for those fields in the same request are ignored. `riskTolerance`, `riskPolicy`, and top-level budget limits are user-level overlays: updating only those overlay fields does not unlink or rewrite a saved strategy. Updating `riskTolerance` derives the matching default `riskPolicy`. Updating strategy fields such as `instructions`, `allocation`, `customTickers`, `assetClassSettings`, or `strategy` without a `strategyId` unlinks any active saved strategy.

**Asset classes:** `trenches`, `memes`, `promising-memes`, `staking`, `native`, `majors`, `alt-coins`, `stables`, `xStocks`, `stocks`, `rwa-stocks`, `rwa-etfs`, `rwa-metals`, `rwa-currencies`, `rwa-pre-ipo`, `custom`

`stocks` is reserved for real brokered equities and only executes through active, ready `stock_brokerage` trading accounts. Wallet-backed trading accounts skip `stocks` opportunities.

For saved strategy create/update requests, `allocation` may be sparse. Missing asset classes are stored as `0`; if the supplied total is below `100`, the remaining percentage is assigned to `stables`; if the supplied total exceeds `100`, the API returns `400 Bad Request`.

`isActive` can only be set to `true` if the target Milo wallet holds at least 1 SOL.

#### Get Account Settings

`GET /api/v1/trading-accounts/{tradingAccountId}/auto-trade-settings`

```bash
curl https://partners.andmilo.com/api/v1/trading-accounts/{tradingAccountId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY"
```

#### Update Account Settings

`PATCH /api/v1/trading-accounts/{tradingAccountId}/auto-trade-settings`

```bash
curl -X PATCH https://partners.andmilo.com/api/v1/trading-accounts/{tradingAccountId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "isActive": true }'
```

Account settings affect only the selected trading account. Use these endpoints for explicit account routing.

Model entitlement notes:

- Only canonical model ids are accepted on the partner surface.
- Canonical OpenAI model ids are `gpt-5.6-terra` (the default), `o3`, `gpt-5.2-high`, `gpt-5.2-xh`, and `gpt-5.4`.
- These ids are provider-neutral at the API boundary. Never send an Azure deployment name; deployment routing is server-managed.
- Canonical Anthropic model ids are `claude-opus-4.5` and `claude-opus-4.6`.
- Canonical Gemini model ids are `gemini-3-pro` and `gemini-3.1-pro-preview`.
- Canonical Grok model ids are `grok-4.1-fast-reasoning` and `grok-4`.
- If a model is unavailable for your account, the API returns `400 Bad Request` with `error.details.requiredPlan`, `error.details.upgradeUrl`, and an error message containing the same plan-specific Stripe link.

---

### Strategies

Reusable autotrade configuration presets. Create a strategy, link it to your settings, and sync when it changes.

#### Create Strategy

`POST /api/v1/users/{userId}/auto-trade-settings/strategies`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/auto-trade-settings/strategies \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SOL Ecosystem DCA",
    "description": "Dollar cost average into SOL ecosystem tokens",
    "strategy": "SWING TRADER",
    "instructions": "Focus on SOL, JUP, and BONK",
    "allocation": { "majors": 45, "native": 25, "staking": 10, "promising-memes": 15, "xStocks": 5 },
    "customTickers": ["SOL", "JUP", "BONK"],
    "isPublic": false
  }'
```

| Field           | Type     | Required | Description                                           |
| --------------- | -------- | -------- | ----------------------------------------------------- |
| `name`          | string   | yes      | Strategy name (1-200 chars)                           |
| `strategy`      | string   | yes      | `VALUE INVESTOR`, `SWING TRADER`, `SCALPER`, `CUSTOM` |
| `description`   | string   | no       | Description (max 2000 chars)                          |
| `instructions`  | string   | no       | Free-text instructions (max 4000 chars)               |
| `allocation`    | object   | no       | Asset class percentages                               |
| `customTickers` | string[] | no       | Token tickers to focus on                             |
| `assetClassSettings` | object \| null | no | Per-asset-class configuration, keyed by asset class |
| `isPublic`      | boolean  | no       | Make publicly discoverable                            |
| `sourceFamily`  | string \| null | no | Registered signal feed the agent opts into (family routing): `congress-ptr`, `sec-form4`, `sec-8k`, `analyst-ratings`, or `alpha-pro` (`GET /api/v1/signal-feeds` is the live registry). Omit or `null` for generic scan/TA agents. |

Strategy allocation rules: the map may be sparse. Missing asset classes are saved as `0`; if the total is below `100`, the remainder is assigned to `stables`; totals above `100` are rejected with `400 Bad Request`.

`sourceFamily` binds the strategy to one signal feed so family catalysts (congressional PTR, insider Form 4, smart-money social) reach only the agents that opted in. Only the canonical feed keys are accepted; an unregistered value returns `400 Bad Request`. See [Signal Feeds](#signal-feeds) for each feed's current rollout stage. The same field is accepted on strategy `PATCH`.

#### List Strategies

`GET /api/v1/users/{userId}/auto-trade-settings/strategies`

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/auto-trade-settings/strategies?scope=public&q=DeFi" \
  -H "X-API-Key: $API_KEY"
```

| Param      | Type   | Description                            |
| ---------- | ------ | -------------------------------------- |
| `scope`    | string | `all`, `owned`, `public`               |
| `q`        | string | Search by name/description             |
| `page`     | number | Page number (default: 1)               |
| `pageSize` | number | Items per page (default: 25, max: 100) |

#### Get Strategy

`GET /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}`

#### Update Strategy

`PATCH /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}`

All fields from create are optional.

#### Delete Strategy

`DELETE /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}`

#### Sync Strategy

`POST /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}/sync`

Re-applies the latest strategy snapshot to your auto-trade settings. Use this when `strategySync.synced` is `false` in the GET settings response. Because it changes what the live account trades, OAuth tokens need the `trade` scope here (`strategies:write` covers create/update only).

**Strategy workflow:**

1. Create a strategy
2. Link it: `PATCH /auto-trade-settings` with `{ "strategyId": "..." }`; the API snapshots saved strategy fields server-side.
3. Milo trades using the snapshot
4. If the strategy is updated, GET settings shows `strategySync.synced: false`
5. Call sync to re-apply the latest version

---

### Signal Feeds

The signal-feed registry is the rollout ladder for family-based alpha (congressional PTR,
insider Form 4, smart-money social). Each feed has a rollout stage; agents opt in via a
strategy's `sourceFamily`.

#### List Signal Feeds

`GET /api/v1/signal-feeds`

```bash
curl https://partners.andmilo.com/api/v1/signal-feeds \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "data": [
    { "feed": "alpha-pro", "family": "social", "rolloutStage": "shadow", "thresholds": {} },
    {
      "feed": "sec-form4", "family": "disclosure", "rolloutStage": "shadow",
      "thresholds": { "maxAgeHours": 72, "minValueUsd": 100000, "clusterMinInsiders": 2, "clusterWindowDays": 7, "cooldownDays": 7, "directorMaterialityMultiplier": 2 }
    },
    {
      "feed": "congress-ptr", "family": "disclosure", "rolloutStage": "live",
      "thresholds": { "maxAgeDays": 14, "minAmountUsd": 15000, "clusterMinMembers": 2, "clusterWindowDays": 30, "cooldownDays": 14 }
    }
  ]
}
```

`rolloutStage` is one of `shadow` (full pipeline, decisions recorded, **no orders**),
`live_small` (capped size), or `live` (full mandate). A feed in `shadow` produces diary
decisions and forward-return scoring but never places an order. Promotion is a reviewed
platform change, not a per-account toggle. `thresholds` are the deterministic gate params
applied before an LLM ever sees the candidate.

Only partner-visible signal feeds appear in `/signal-feeds`, `/decisions` and diary logs: decisions and diary entries from internal feeds are excluded from both the items and the totals.

---

### Research

Synchronous, read-only **stock research** reads. They are market-level: no `userId` or
`walletId`, just a credential (API key or OAuth bearer; no scope needed). All routes live under `/api/v1/research/`, accept a `ticker`
query parameter (1-6 chars, letters/digits, `.`/`-` allowed, case-insensitive — normalized
to upper case; invalid tickers return `400 bad_request`), cap `limit` at 100 and `days` at 365
(out-of-range values return `400`), and are rate-limited at 60 requests/min per API key.

Every response carries `meta.source` (what the data is and how fresh) and, where relevant,
`meta.coverage`. These are public disclosures, not recommendations.

**Unmetered (public SEC / congressional data Milo ingests and stores):**

| Route                                    | Query                                   | Returns                                                                                   |
| ---------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /api/v1/research/insider-transactions` | `ticker` (required), `days=90`, `limit=50` | SEC Form 4 insider open-market **purchases** for the ticker (newest filing first)         |
| `GET /api/v1/research/insider-buys`      | `days=30`, `minValueUsd`, `limit=50`    | Notable insider purchases across Milo's tracked universe                                  |
| `GET /api/v1/research/congress-trades`   | `ticker` (optional), `days=90`, `limit=50` | Congressional PTR disclosures for the ticker, or market-wide when omitted                |
| `GET /api/v1/research/8k-events`         | `ticker` (required), `days=90`, `limit=50` | SEC 8-K filings with `items` (codes) and `itemSummaries` (titles)                        |
| `GET /api/v1/research/digest`            | `ticker` (required)                     | One-call 90-day digest composing the three above (counts, notable rows, filing links)      |

Coverage caveats (stated in every response):

- Form 4 ingestion is **purchases only** (transaction code `P`) and covers only Milo's tracked
  US-equity universe (in production the S&P 500 plus its tokenized names; `meta.coverage.tickers` is authoritative) — `meta.coverage.tickers` lists it and `meta.coverage.tracked` says whether
  the requested ticker is in it. An empty result for an untracked ticker means "not tracked", not
  "no insider activity". Coverage is issuer-aware: share classes of one SEC registrant (GOOG/GOOGL,
  BRK.A/BRK.B) share a CIK and resolve to one issuer label
  (`meta.coverage.canonicalTicker` — the issuer's public label, computed from public coverage
  membership else the SEC directory, e.g. `GOOGL` for a `GOOG` query. It is not a claim about
  which ticker the returned rows carry: historical rows keep whatever they were ingested under.
  `meta.coverage.aliases` lists the issuer's tickers) and a query for any alias returns the same rows with
  `tracked: true` when the canonical ticker is covered. The digest reports the same under
  `insider.canonicalTicker`.
- Congressional PTRs are market-wide, polled every 1-4h, disclose amount **ranges** (never exact
  amounts) and lag the trade by up to 30-45 days. 8-K filings are market-wide, polled ~every 30 min.

```bash
curl "https://partners.andmilo.com/api/v1/research/digest?ticker=NVDA" \
  -H "X-API-Key: $API_KEY"
```

**Response (digest):**

```json
{
  "data": {
    "ticker": "NVDA",
    "windowDays": 90,
    "generatedAt": "2026-09-10T12:00:00.000Z",
    "insider": {
      "tracked": true,
      "canonicalTicker": "NVDA",
      "count": 1,
      "totalValueUsd": 120500,
      "notable": [
        {
          "accessionNumber": "0001045810-26-000123",
          "ticker": "NVDA",
          "cik": "0001045810",
          "filerName": "Jane Director",
          "filerRole": { "isDirector": true, "isOfficer": false, "isTenPercentOwner": false, "isOther": false, "officerTitle": null },
          "code": "P",
          "transactionDate": "2026-08-01T00:00:00.000Z",
          "shares": 1000,
          "price": 120.5,
          "valueUsd": 120500,
          "postShares": 5000,
          "filedAt": "2026-08-02T21:00:00.000Z",
          "filingUrl": "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/"
        }
      ]
    },
    "congress": {
      "count": 2,
      "purchases": 1,
      "sales": 1,
      "notable": [
        {
          "eventKey": "…",
          "chamber": "senate",
          "memberName": "Jane Senator",
          "district": "RI",
          "party": null,
          "symbol": "NVDA",
          "assetDescription": "NVIDIA Corporation",
          "type": "Purchase",
          "amountBucket": "$100,001 - $250,000",
          "amountMinUsd": 100001,
          "transactionDate": "2026-05-08T00:00:00.000Z",
          "disclosureDate": "2026-06-02T00:00:00.000Z",
          "link": "https://efdsearch.senate.gov/…"
        }
      ]
    },
    "sec8k": {
      "count": 1,
      "latest": [
        {
          "eventKey": "…",
          "symbol": "NVDA",
          "cik": "1045810",
          "filingDate": "2026-08-27T00:00:00.000Z",
          "acceptedDate": "2026-08-27T20:05:00.000Z",
          "items": ["2.02", "9.01"],
          "itemSummaries": ["2.02 Results of Operations and Financial Condition", "9.01 Financial Statements and Exhibits"],
          "link": "https://www.sec.gov/Archives/edgar/data/…/",
          "finalLink": "https://www.sec.gov/Archives/edgar/data/…/nvda-8k.htm"
        }
      ]
    },
    "sources": { "secForm4": "…", "congressPtr": "…", "sec8k": "…" },
    "coverage": { "insiderTickers": ["AAPL", "AMZN", "AVGO", "GOOGL", "META", "MSFT", "NVDA", "TSLA"], "note": "…" }
  }
}
```

The list routes return `{ "data": [...rows], "meta": { ticker, days, limit, count, source, coverage? } }`
with the same row shapes.

Digest statistics are whole-window aggregates: `insider.count` / `insider.totalValueUsd`,
`congress.count` / `purchases` / `sales` and `sec8k.count` are computed over every disclosure in the
90-day window (not a capped page), and `insider.notable` / `congress.notable` are the top 5 by
disclosed value across the whole window — an older large purchase is never dropped in favour of a
newer small one. `sec8k.latest` is the 5 most recent filings.

**Licensed (FMP-derived) — mounted only when the server runs with `MCP_LICENSED_RESEARCH_TOOLS=true`
(default off; redistributing this data through third-party assistants needs a licensing decision).
When off these routes return `404 not_found`; when on but `FMP_API_KEY` is absent they return
`503 service_unavailable` with a clear message; when the upstream provider fails (timeout, HTTP
error, network, or an FMP plan/limit notice — plaintext or a JSON `{"Error Message": …}` envelope) they return `503 provider_unavailable` — transient, retry after a short delay; a
ticker the provider answered for but has no data on returns `404 not_found`. With the routes
enabled, a `404` therefore means "no data", never an outage; with them disabled every request
returns `404`, so a `404` on every ticker means the feature is off.**

| Route                                    | Query                        | Returns                                                                        |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/v1/research/analyst-consensus` | `ticker`                     | Rating mix, consensus label, price targets (low/high/median/consensus), recent grade actions |
| `GET /api/v1/research/fundamentals`      | `ticker`                     | Revenue / net income / free cash flow for the last 12 reported quarters        |
| `GET /api/v1/research/earnings-timeline` | `ticker`                     | Next scheduled report + up to 8 reported quarters (actual vs estimate, surprise %) |
| `GET /api/v1/research/news`              | `ticker`, `limit=8` (max 12) | Recent news with publisher, link, snippet and sentiment in [-1, 1]              |
| `GET /api/v1/research/peers`             | `ticker`                     | The company first, then up to 5 peers by market cap with TTM multiples/margins |

Any data-layer failure on a research route returns `503 service_unavailable` with a generic
message (never internal details). Both `503` codes are retryable; `404` is not.

---

### Arena

Deploy a public strategy to the arena leaderboard. Milo creates a custody wallet, funds it with the requested SOL amount, and trades autonomously using the strategy. The strategy must be public and owned by the user. Deployment requires at least 1 SOL plus network fees. Withdrawing transfers all holdings back to the user's Milo wallet.

#### Deploy to Arena

`POST /api/v1/users/{userId}/arena/deploy`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/arena/deploy \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "strategyId": "<strategy-uuid>", "fundingAmountSol": 2.5 }'
```

| Field              | Type   | Required | Description                                                         |
| ------------------ | ------ | -------- | ------------------------------------------------------------------- |
| `strategyId`       | uuid   | yes      | ID of a public strategy owned by the user                           |
| `fundingAmountSol` | number | no       | SOL amount to transfer into the arena wallet. Defaults to 1, min 1. |

**Response:**

```json
{
  "data": {
    "arenaUserId": "uuid",
    "custodyWalletId": "uuid",
    "custodyWalletAddress": "<solana-address>",
    "fundingTxSignature": "<transaction-signature>",
    "strategyId": "uuid"
  }
}
```

#### Withdraw from Arena

`POST /api/v1/users/{userId}/arena/withdraw`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/arena/withdraw \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "strategyId": "<strategy-uuid>" }'
```

| Field        | Type | Required | Description                             |
| ------------ | ---- | -------- | --------------------------------------- |
| `strategyId` | uuid | yes      | ID of the deployed strategy to withdraw |

**Response:**

```json
{
  "data": {
    "arenaUserId": "uuid",
    "custodyWalletId": "uuid",
    "custodyWalletAddress": "<solana-address>",
    "recipientWalletAddress": "<solana-address>",
    "transferTxs": [
      { "tokenAddress": "<mint-address>", "amount": 1.5, "signature": "<tx-signature>" }
    ]
  }
}
```

#### Get Arena Leaderboard

`GET /api/v1/users/{userId}/arena/leaderboard`

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/arena/leaderboard?timeframe=30d&sortKey=pnl&sortDirection=desc" \
  -H "X-API-Key: $API_KEY"
```

| Param           | Type   | Values                                        | Default |
| --------------- | ------ | --------------------------------------------- | ------- |
| `timeframe`     | string | `1d`, `30d`, `90d`                            | —       |
| `page`          | number | Page number                                   | 1       |
| `pageSize`      | number | Items per page (max: 100)                     | 25      |
| `sortKey`       | string | `pnl`, `winRate`, `returnPct`, `accountValue` | —       |
| `sortDirection` | string | `asc`, `desc`                                 | —       |

`pnl` is aggregate arena-wallet cashflow PnL: `current holdings USD - (depositedUsd - withdrawnUsd)`.
`returnPct` is `pnl / (depositedUsd - withdrawnUsd) * 100`, or `0` when net deposits are not positive.
`accountValue` is the current holdings value in USD.
`winRate` is token-PnL based: `(number of tokens with positive token PnL / total tracked tokens) * 100`, excluding USDC.

`agentPerformance` is the strategy template's closed-trade track record scoped to this leaderboard row's strategyId — a fork or a same-named sibling strategy carries its OWN stats; the display name is not the aggregation key — refreshed every ~30 minutes, with one stats block per rolling window (`7d`/`30d`/`90d`). `null` until the template has closed trades; individual windows are `null` when no trades closed in that window. Units are decimal fractions: `meanPnlPct` 0.05 = +5% mean realized PnL per trade, and the nested `winRate` is the closed-trade win fraction 0..1 (distinct from the top-level token-PnL `winRate` percent).

**Response:**

```json
{
  "data": [
    {
      "strategy": "uuid",
      "strategyName": "SOL Ecosystem DCA",
      "ownerUserId": "uuid",
      "ownerUsername": "trader1",
      "pnl": 120.50,
      "winRate": 65.0,
      "returnPct": 12.5,
      "accountValue": 1120.50,
      "arenaWalletAddress": "<solana-address>",
      "agentPerformance": {
        "7d": {
          "tradesCount": 12,
          "meanPnlPct": 0.0821,
          "stddevPnlPct": 0.11,
          "winRate": 0.75,
          "avgWinToLoss": 1.4,
          "expectancyPct": 0.05,
          "maxDrawdownPct": 0.18,
          "sharpe": 2.1,
          "calmar": 3.3,
          "computedAt": "2026-07-08T12:00:00.000Z"
        },
        "30d": { ... },
        "90d": null
      },
      "currentHoldings": [ ... ]
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 100, "pages": 4 }
}
```

---

### Quests & Bones

Quests are event-driven tasks that reward bones (points) upon completion. Each quest has requirements (count, sum, or streak-based). **Agents should check quests regularly** — fetch open quests and use `unclaimed=true` to find completed quests to claim.

#### List Quests

`GET /api/v1/users/{userId}/quests`

By default returns only unlocked (available) quests.

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/quests" \
  -H "X-API-Key: $API_KEY"
```

| Param       | Type    | Description                               | Default |
| ----------- | ------- | ----------------------------------------- | ------- |
| `unlocked`  | boolean | Filter for unlocked quests (available); `false` disables the default filter | `true`  |
| `unclaimed` | boolean | Filter for completed but unclaimed quests | —       |
| `claimed`   | boolean | Filter for claimed quests                 | —       |
| `mode`      | string  | `completed_last`                          | —       |
| `page`      | number  | Page number                               | 1       |
| `pageSize`  | number  | Items per page (max: 100)                 | 25      |

Boolean params accept `true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off` (case-insensitive; a bare flag reads as `false`). Any other value fails validation with `400`. `unlocked=false` disables the default unlocked-only filter.

**Response:**

```json
{
  "data": [
    {
      "questId": "uuid",
      "title": "First Trade",
      "award": 100,
      "totalRequirements": 1,
      "completedRequirements": 1,
      "claimed": false,
      "completed": true,
      "unlocked": true,
      "requirements": [
        {
          "requirementId": "uuid",
          "aggregationKind": "count",
          "targetValue": 1,
          "currentValue": 1,
          "completed": true
        }
      ]
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 10, "pages": 1 }
}
```

#### Claim Quest

`POST /api/v1/users/{userId}/quests/{questId}/claim`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/quests/{questId}/claim \
  -H "X-API-Key: $API_KEY"
```

Returns `{ "data": null }` on success, 404 if not found or already claimed.

#### Get Bones Balance

`GET /api/v1/users/{userId}/quests/bones`

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/quests/bones" \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "data": {
    "userId": "uuid",
    "username": "alice",
    "balance": 500,
    "unclaimed": 100
  }
}
```

---

### Orders

#### Create Order

`POST /api/v1/wallets/{walletId}/orders`

```bash
curl -X POST https://partners.andmilo.com/api/v1/wallets/{walletId}/orders \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "So11111111111111111111111111111111111111112",
    "type": "buy",
    "status": "active",
    "expiresAt": "<ISO-8601 timestamp within 120 minutes of request time>",
    "payload": {
      "type": "buy",
      "amount": { "type": "absolute_usd", "amount": 50 },
      "trigger": { "type": "absolute", "trigger": "price", "operator": "gte", "value": 0 },
      "execution": {}
    },
    "takeProfits": [
      { "percentage": 50, "profitPercentage": 20 },
      { "percentage": 50, "profitPercentage": 50 }
    ],
    "stopLosses": [
      { "percentage": 100, "lossPercentage": 15 }
    ]
  }'
```

**Amount types:**
| Type | Fields | Description |
|------|--------|-------------|
| `absolute` | `amount` | Raw token amount |
| `absolute_usd` | `amount` | USD equivalent |
| `relative` | `percentage` | Percentage of position (sell only) |

**Trigger types:**
| Type | Operator | Description |
|------|----------|-------------|
| `absolute` | `gte`, `lte` | Trigger at absolute price |
| `relative` | `rise`, `drop` | Trigger on % change from entry |

Market order: `{ "type": "absolute", "trigger": "price", "operator": "gte", "value": 0 }`
Market orders require `expiresAt`, and it must be within 120 minutes of the request time.
Active market orders are checked before creation to confirm the current DFlow `/order` route guarantees output close enough to the USD value of the input and output tokens, regardless of mint. If the route cannot be verified, or it appears to pass through thin liquidity, the API returns `400 bad_request` and does not create the order. Try a smaller amount, wait and retry, or choose a more liquid token or pair.

**Take-profit / Stop-loss (optional):**

`takeProfits` array items:

- `percentage` (1-100) — Percent of position to sell
- `profitPercentage` (> 0) — Profit % to trigger

`stopLosses` array items:

- `percentage` (1-100) — Percent of position to sell
- `lossPercentage` (1-100) — Loss % to trigger

Dependant creation flow:

- Main order is created first.
- TP and SL dependants are created sequentially as draft sell children (`parentId` = main order ID).
- Dependant failures are returned per dependant item while the main order still returns `201 Created`.

Guardrails (always enforce mode):

- `takeProfits.length <= 5`
- `stopLosses.length <= 5`
- `takeProfits.length + stopLosses.length <= 8`

Guardrail violations return `400 bad_request` with a clear validation message.

**Response:**

```json
{
  "data": {
    "data": {
      "id": "uuid",
      "type": "buy",
      "status": "active",
      "dependants": [
        {
          "type": "take_profit",
          "order": { "id": "...", "subType": "take_profit", "status": "draft" }
        },
        {
          "type": "stop_loss",
          "order": { "id": "...", "subType": "stop_loss", "status": "draft" }
        }
      ]
    }
  }
}
```

#### List Orders

`GET /api/v1/users/{userId}/orders`

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/orders?status=active&type=buy" \
  -H "X-API-Key: $API_KEY"
```

| Param          | Type   | Values                                                        |
| -------------- | ------ | ------------------------------------------------------------- |
| `status`       | string | `active`, `paused`, `error`, `fulfilled`, `archived`, `draft` |
| `type`         | string | `buy`, `sell`                                                 |
| `tokenAddress` | string | Filter by token                                               |
| `page`         | number | Page number (default: 1, max: 100)                            |
| `pageSize`     | number | Items per page (default: 25, max: 100)                        |

#### Get Order

`GET /api/v1/users/{userId}/orders/{orderId}`

#### Pause Order

`POST /api/v1/users/{userId}/orders/{orderId}/pause`

#### Activate Order

`POST /api/v1/users/{userId}/orders/{orderId}/activate`

#### Delete Order

`DELETE /api/v1/users/{userId}/orders/{orderId}`

---

### Wallet Actions

#### Send Tokens

`POST /api/v1/wallets/{walletId}/actions/send`

```bash
curl -X POST https://partners.andmilo.com/api/v1/wallets/{walletId}/actions/send \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "Dest1nAt1oNAddr3ss...",
    "token": "So11111111111111111111111111111111111111112",
    "amount": 1.5
  }'
```

| Field       | Type   | Description                                   |
| ----------- | ------ | --------------------------------------------- |
| `recipient` | string | Destination Solana address                    |
| `token`     | string | Token mint address                            |
| `amount`    | number | Amount in human-readable units (e.g. 1.5 SOL) |

For native SOL use mint: `So11111111111111111111111111111111111111112`
If a JSON body includes `walletId`, it must match the `{walletId}` path parameter.
**Funding wallet:** the transfer is balance-checked against, and funded from, the
`{walletId}` in the path. If you hold several Milo wallets, each send draws only on
the wallet you name — no other wallet of yours is debited.

**Response (202):**

```json
{ "data": { "data": "5t7...transaction-signature" } }
```

---

### Conversations

Milo uses async conversations. Send a message, then poll for the response.

#### Create Conversation

`POST /api/v1/users/{userId}/conversations`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/conversations \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What tokens are trending on Solana?",
    "agentType": "market-analyst"
  }'
```

| Field       | Type   | Required | Description                            |
| ----------- | ------ | -------- | -------------------------------------- |
| `message`   | string | yes      | Initial message (1-4000 chars)         |
| `agentType` | string | no       | Agent type (default: `market-analyst`) |

**Agent types:**

| Agent          | Value            | Purpose                                  |
| -------------- | ---------------- | ---------------------------------------- |
| Market Analyst | `market-analyst` | Equities research (analyst ratings, insider/congress/8-K, fundamentals, earnings) + token research, technicals, sentiment; perpetuals data (Hyperliquid funding, open interest, max leverage, incl. equity/commodity perps) and prediction-market odds (Kalshi, Polymarket), read-only |
| Auto Trader    | `auto-trader`    | Strategy discussion, can update settings |

**Response (201):**

```json
{
  "data": {
    "conversationId": "uuid",
    "status": "active",
    "agentActive": true,
    "processing": true,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

#### List Conversations

`GET /api/v1/users/{userId}/conversations`

Supports `page` and `pageSize` query params.

#### Get Conversation

`GET /api/v1/users/{userId}/conversations/{conversationId}`

#### Send Message

`POST /api/v1/users/{userId}/conversations/{conversationId}/messages`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/conversations/{conversationId}/messages \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "What about JUP?" }'
```

Body fields: `message` (string, 1-4000 chars, required), `metadata` (object, optional, stored verbatim), and `approval` (optional) — `{ "approvalId": "<uuid from approvalRequest.approvalId>", "decision": "approve" | "reject" }` to decide a pending money-action approval. When `approval` is present, `message` is still saved as the user's turn but the decision comes only from `approval`. See "Approvals for money-moving actions" below.

#### Get Messages

`GET /api/v1/users/{userId}/conversations/{conversationId}/messages`

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/conversations/{conversationId}/messages" \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "data": {
    "messages": [
      { "messageId": "...", "role": "user", "content": "...", "createdAt": "..." },
      {
        "messageId": "...",
        "role": "assistant",
        "content": "Here is NVDA's last session.",
        "createdAt": "...",
        "widgets": [
          { "type": "PriceChart", "data": { "symbol": "NVDA", "interval": "1D", "candles": [] } }
        ]
      }
    ],
    "processing": false
  },
  "meta": { "page": 1, "pageSize": 25, "total": 2, "pages": 1 }
}
```

**Widgets (rich artifacts):** an assistant message may include a `widgets` array — the rich artifacts a tool produced during the run (charts, tables, reports). Each is `{ "type": string, "data": object }`, where `type` is the renderer selector and `data` is the payload. The field is present only on messages that generated artifacts; text-only messages omit it. Known `type` values include `PriceChart`, `PerformanceCompare`, `AnalystConsensus`, `EarningsDigest`, `EarningsTimeline`, `InsiderActivity`, `NewsFeed`, `PeerComparison`, `QuarterlySeries`, `SmartMoney`, `Analysis`, and `TokenList` (ranked token screens — trending/search results and multi-token overviews ride in `data.tokens[]` instead of a text table; read the widget or the ranked stats are lost, and label the metrics with `data.interval` — `24h` for trending/search, the requested `30m`–`24h` window for an overview). Payloads are tool-defined and may gain fields: render the keys you recognize and ignore the rest. Treat `data` as an open bag of market/analysis data (no tenant-scoped fields).

**Approvals for money-moving actions.** A conversation agent never executes a money-moving action straight from a message: swaps, token transfers, buy/sell orders, order cancels, position closes, selecting a trading agent and changing trading-agent settings (pausing auto-trading is not gated). Instead it replies with an assistant message that carries an `approvalRequest` and executes only after the user approves that exact action:

```json
{
  "messageId": "...",
  "role": "assistant",
  "content": "**Approval needed.** I'm ready to execute this action: ...",
  "createdAt": "...",
  "approvalRequest": {
    "approvalId": "6cf9624c-f01e-4d64-b328-64d1f77720b6",
    "expiresAt": "2026-10-15T10:10:00.000Z",
    "status": "pending",
    "actions": [
      { "category": "send", "summary": "Send 1.5 SOL to 9xQe...VFin, from wallet ..." }
    ]
  }
}
```

Show the `summary` lines to your user. To decide, send a follow-up message with `approval` (bound to this user and this conversation, single use):

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/conversations/{conversationId}/messages \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "approve", "approval": { "approvalId": "6cf9624c-...", "decision": "approve" } }'
```

- `decision` is `approve` or `reject`. When `approval` is present, the `message` text is still saved as the user's turn, but it is not interpreted: the decision comes only from `approval`, and the agent does not answer the text. An `approvalId` that is not pending in this conversation (already decided, expired, superseded, or from another conversation) executes nothing and gets a "no pending action" reply.
- Prefer the explicit `approval` field over passing your user's words through. With it, the `approvalId` decides that request while it is `pending` and unexpired, whatever assistant messages came after it. Without it, a message whose whole text is one of these phrases decides only the request carried by the conversation's latest assistant message, that is, a reply sent right after the request (case, punctuation and apostrophes are ignored, a trailing "please", "thanks", "thank you" or "now" is dropped, and a message longer than 80 characters never counts). Approve: `approve`, `approved`, `i approve`, `approve it`, `yes approve`, `yes i approve`, `yes`, `yes please`, `yep`, `yeah`, `confirm`, `confirmed`, `i confirm`, `yes confirm`, `go ahead`, `yes go ahead`, `go for it`, `do it`, `yes do it`, `proceed`, `execute`, `execute it`, `ok`, `okay`, `ok go ahead`, `sure`, `send it`, `place it`, `place the order`. Reject: `cancel`, `cancel it`, `reject`, `rejected`, `i reject`, `deny`, `decline`, `no`, `nope`, `no thanks`, `no cancel`, `i do not approve`, `i dont approve`, `do not approve`, `dont approve`, `do not do it`, `dont do it`, `stop`, `abort`, `never mind`, `nevermind`. A phrase sent when the latest assistant message carries no request, or a different one, decides nothing and is handled as an ordinary message. Any ordinary message cancels the pending request (`status` becomes `superseded`) and nothing is executed.
- Approving requires the deciding API key or OAuth token to hold the scope the action needs: `transfer` for category `send` (token transfers), `trade` for every other category (swaps, orders, order cancels, position closes, trading-agent selection and settings changes); API keys carry every scope. Without it, the reply says which permission is missing, nothing executes, and the request stays pending for a caller that has it; that caller decides it with `approval` and its `approvalId` (the refusal is now the latest assistant message, so a bare phrase would cancel the request). Rejecting needs only `chat`. An approved action runs with the intersection of the scopes of the caller that paused it and the caller that approved it.
- Requests expire after 10 minutes. The outcome (executed with an order id or transaction signature, cancelled, or expired) arrives as the next assistant message. Only approve after your user explicitly approved the summary shown.
- After a reply in which money actions executed, the assistant message ends with a **Receipt** block built only from the actual tool calls and results, one line per action: `Done: <action> (<order id or tx signature>)` or `Failed: <action>: <reason>`. Treat the receipt as the source of truth; when the text above it claims more, a **Correction:** line precedes the receipt.
- `approvalRequest.status` is the request's current state when you read the page: `pending` (awaiting a decision), `approved`, `rejected`, `expired` or `superseded`. It is omitted for a moment right after the message is stored, while the request is still being set up (it cannot be decided yet; read the page again), and if the status cannot be looked up; then treat the request as pending only while it is unexpired and no later user message exists. A request that could not be set up is never approvable: it reads as `superseded`, followed by an assistant message saying so, or as `expired`.
- `approvalRequest` is server-reserved: a `metadata.approvalRequest` key sent by a client is dropped, and approval requests only ever appear as the top-level `approvalRequest` of assistant messages.
- `category` is one of `swap`, `send`, `order`, `order_cancel`, `position_close`, `agent_deploy`, `agent_settings`, `stock_order`, `stock_order_cancel`, `stock_position_close`, or `unknown` (a fallback for an action the server could not classify; still show its `summary`). `approvalRequest` is omitted on all other messages.

**Polling pattern:**

1. Send a message (POST)
2. Poll GET messages every 2-3 seconds
3. When `processing` is `false`, the agent has finished

---

### Positions

#### List Positions

`GET /api/v1/users/{userId}/positions`

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/positions?status=active" \
  -H "X-API-Key: $API_KEY"
```

| Param      | Values                                 |
| ---------- | -------------------------------------- |
| `status`   | `active`, `pending`, `not_active`      |
| `page`     | Page number (default: 1, max: 100)     |
| `pageSize` | Items per page (default: 25, max: 100) |

Each position includes invested amount, realized/unrealized PnL, current value, `totalPnlUsd`, `pnlPercentage`, `walletId`, `tradingAccountId`, and `tradingAccountType`.
Wallet-backed positions include wallet order data and use `tradingAccountType: "milo_wallet"`. Stock brokerage positions use `walletId: null`, `tradingAccountType: "stock_brokerage"`, and derive linked order/current-value data from brokerage order and position records. KuCoin (CEX) positions likewise use `walletId: null` with `tradingAccountType: "cex_brokerage"`.
Thesis PnL is server-calculated as `soldUsd + actualCurrentValueUsd - investedUsd`; `pnlPercentage` is divided by `investedUsd`.

#### Close Position

`POST /api/v1/users/{userId}/positions/{thesisId}/close`

Wallet-backed positions cancel pending orders and create a sell order for remaining holdings. Stock brokerage thesis close returns `closeOrderAction: "unsupported"` for now. `closeOrderAction` can also be `"blocked_loss_breaker"`: the automated trader refuses its own closes that would realize a loss past the capitulation breaker (both a USD and a percent-of-cost threshold), leaving the stop-loss ladder armed and returning a `lossBreaker` object with the measured loss; closes requested through this endpoint are user-initiated and are never blocked by it.

#### Close All Positions

`POST /api/v1/users/{userId}/positions/close-all`

Closes all active and pending positions. Partial failures don't block other positions.

**Response:**

```json
{
  "data": {
    "successes": [{ "thesisId": "...", "cancelled": 2, "sellOrderCreated": true }],
    "failures": [{ "thesisId": "...", "error": "No wallet found" }]
  }
}
```

---

### Holdings

#### Get Holdings

`GET /api/v1/wallets/{walletId}/holdings`

```bash
curl https://partners.andmilo.com/api/v1/wallets/{walletId}/holdings \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "tokenAddress": "So1111...",
      "chain": "solana",
      "decimals": 9,
      "assetClass": "majors",
      "totalHoldings": "1250000000",
      "tokenUSDPrice": "160.40",
      "tokenSolPrice": "1",
      "totalUSDval": "200500.12",
      "totalSolval": "1250.50",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Transactions

#### Get Transactions

`GET /api/v1/wallets/{walletId}/transactions`

All on-chain transactions for a wallet. Uses cursor-based pagination.

```bash
curl "https://partners.andmilo.com/api/v1/wallets/{walletId}/transactions?limit=25" \
  -H "X-API-Key: $API_KEY"
```

| Param    | Type   | Description                            |
| -------- | ------ | -------------------------------------- |
| `limit`  | number | Items per page (default: 25, max: 200) |
| `cursor` | string | Cursor from previous response          |

**Response:**

```json
{
  "data": [ ... ],
  "nextCursor": "eyJ..."
}
```

#### Get Executed Transactions

`GET /api/v1/wallets/{walletId}/executed-transactions`

Only transactions linked to orders (trades). Uses cursor-based pagination.

Transaction signatures are opaque identifiers and may refer to legacy, v0, or v1 Solana transactions. The response shape is unchanged; clients should store and pass the signature without attempting to infer its wire version.

```bash
curl "https://partners.andmilo.com/api/v1/wallets/{walletId}/executed-transactions?limit=25&txType=buy" \
  -H "X-API-Key: $API_KEY"
```

| Param    | Type   | Description                            |
| -------- | ------ | -------------------------------------- |
| `limit`  | number | Items per page (default: 25, max: 200) |
| `cursor` | string | Cursor from previous response          |
| `txType` | string | Filter: `buy` or `sell`                |
| `token`  | string | Filter by token address                |

---

### Diary Logs

`GET /api/v1/users/{userId}/diary-logs`

Auto-trade diary entries showing what Milo did and why.

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/diary-logs?page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "log": "Opened thesis on HYPE",
      "thoughts": "Watching liquidity",
      "tokenAddress": "So111111...",
      "createdAt": "2025-01-01T00:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 58, "pages": 3 }
}
```

The diary is human-readable prose (what an agent did, and why an order was blocked). For the structured decision record, use the Decisions ledger below.

---

### Decisions (audit ledger)

`GET /api/v1/users/{userId}/decisions`

The decision ledger — one structured row per decision the agents made, including the ones that **never placed an order** (shadow decisions and gated skips). This is the "prove it to a committee" surface: confidence, model, gate outcomes, signal family/catalyst and forward returns, straight from the decision snapshots.

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/decisions?action=skip&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

| Param              | Type   | Description                                            |
| ------------------ | ------ | ------------------------------------------------------ |
| `action`           | string | `trade` or `skip`                                      |
| `tradingAccountId` | uuid   | Scope to one trading account                           |
| `page`             | number | Page number (default: 1)                               |
| `pageSize`         | number | Items per page (default: 25, max: 100)                 |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "action": "skip",
      "orderPlaced": false,
      "tokenAddress": "So111111...",
      "assetClass": "majors",
      "signalFamily": "disclosure",
      "strategyKey": "congress_ptr",
      "llmConfidence": 0.82,
      "modelVersion": "claude-opus-4.6",
      "regimeFit": 0.7,
      "riskRewardRatio": 2.1,
      "screenScore": 88,
      "setupGatePassed": true,
      "entryGatePassed": false,
      "catalyst": { "feed": "congress-ptr" },
      "returns": { "h1": null, "h24": 0.03, "h72": null, "d7": null }
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "total": 120, "pages": 5 }
}
```

`orderPlaced` is `false` for shadow decisions and gated skips — the full pipeline ran and recorded the decision, but no order was placed. `returns` are long-biased decimal fractions scored forward from the decision price (`null` until scored). Free-text block reasons for allocation/fee/budget gates remain in `diary-logs`.

---

## Pagination

Most list endpoints use page-based pagination:

| Param      | Default | Max |
| ---------- | ------- | --- |
| `page`     | 1       | 100 |
| `pageSize` | 25      | 100 |

Response includes:

```json
{ "meta": { "page": 1, "pageSize": 25, "total": 100, "pages": 4 } }
```

Transactions and executed transactions use **cursor-based** pagination with `limit` and `cursor` params, returning a `nextCursor` field.

## Rate Limits

Rate limits are enforced across endpoints. Limits vary by endpoint and request context.

Rate limit rejections return `429 Too Many Requests` with:

- `error.code = "rate_limit_exceeded"`
- `Retry-After` header (seconds)
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

Retry behavior: wait for `Retry-After` before retrying.

## Error Handling

```json
{
  "error": {
    "code": "bad_request",
    "message": "Model \"gpt-5.2-high\" requires a Pro plan. Upgrade here: https://buy.stripe.com/...",
    "details": {
      "requestedModelVersion": "gpt-5.2-high",
      "requiredPlan": "pro",
      "requiredPlanLabel": "Pro",
      "upgradeUrl": "https://buy.stripe.com/...",
      "upgradeText": "Upgrade to Pro to use model \"gpt-5.2-high\"."
    }
  }
}
```

| Status | Code                  | Description                               |
| ------ | --------------------- | ----------------------------------------- |
| 400    | `bad_request`         | Invalid input or validation error         |
| 401    | `unauthorized`        | Missing or invalid API key                |
| 404    | `not_found`           | Resource not found                        |
| 409    | `error`               | Conflict (e.g. wallet already registered) |
| 429    | `rate_limit_exceeded` | Rate limit exceeded                       |
| 503    | `service_unavailable` | Research data source unavailable / not configured (retryable) |
| 503    | `provider_unavailable` | Licensed research: upstream provider (FMP) failed — retry shortly; distinct from `404` no-data |
| 500    | `internal_error`      | Server error                              |
