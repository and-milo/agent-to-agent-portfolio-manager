# Partner API

## Overview

HTTP API for external partners to manage users, wallets, trading, and AI conversations on Milo. All endpoints are versioned under `/api/v1` and require an API key (except signup).

Trading execution note: executable swap previews and transactions now come from DFlow `/order`, and signed swap transactions are submitted through Helius Sender. The partner-facing request and response shapes remain unchanged.

Need an API key? [Contact us on Discord](https://discord.com/invite/join-milo)

## Authentication

All endpoints (except signup) require the `X-API-Key` header:

```bash
curl -H "X-API-Key: mk_live_..." https://partners.andmilo.com/api/v1/users/{userId}/positions
```

User-scoped endpoints use `{userId}` in the path. Wallet-scoped endpoints use `{walletId}`.

## MCP Endpoint

The same server also exposes an MCP Streamable HTTP endpoint at:

- `POST /mcp` (initialize + JSON-RPC requests)
- `GET /mcp` (SSE stream for a session)
- `DELETE /mcp` (terminate a session)

Notes:

- Use `Mcp-Session-Id` for sessioned requests after initialization.
- `Accept` should include `application/json` and `text/event-stream` for POST.
- `POST /mcp` initialize accepts optional `X-API-Key`.
- If omitted, the session starts unauthenticated and only signup/public MCP tools are usable until `signup` returns an API key.
- MCP tools that forward paginated endpoints enforce `page <= 100` and `pageSize <= 100`.
- Abuse protections and request throttling are enforced. Initialize may return `429` during high load.
- MCP sessions are bounded and idle sessions can be evicted; if a session expires, re-initialize.
- If a session expires, sessioned calls return invalid-session errors and the client should re-initialize.

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
    "apiKey": "mk_live_..."
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
- Canonical OpenAI model ids are `o3`, `gpt-5.2-high`, `gpt-5.2-xh`, and `gpt-5.4`.
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
| `isPublic`      | boolean  | no       | Make publicly discoverable                            |
| `sourceFamily`  | string \| null | no | Registered signal feed the agent opts into (family routing): `congress-ptr`, `sec-form4`, `sec-8k`, or `alpha-pro`. Omit or `null` for generic scan/TA agents. |

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

Re-applies the latest strategy snapshot to your auto-trade settings. Use this when `strategySync.synced` is `false` in the GET settings response.

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
| Market Analyst | `market-analyst` | Token research, technicals, sentiment    |
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

**Widgets (rich artifacts):** an assistant message may include a `widgets` array — the rich artifacts a tool produced during the run (charts, tables, reports). Each is `{ "type": string, "data": object }`, where `type` is the renderer selector and `data` is the payload. The field is present only on messages that generated artifacts; text-only messages omit it. Known `type` values include `PriceChart`, `PerformanceCompare`, `AnalystConsensus`, `EarningsDigest`, `EarningsTimeline`, `InsiderActivity`, `NewsFeed`, `PeerComparison`, `QuarterlySeries`, `SmartMoney`, `Analysis`, and `TokenList` (ranked token screens — trending/search results ride in `data.tokens[]` instead of a text table; read the widget or the ranked stats are lost); each has a payload contract in `docs/artifacts/*.md`. Treat `data` as an open bag of market/analysis data (no tenant-scoped fields).

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

Wallet-backed positions cancel pending orders and create a sell order for remaining holdings. Stock brokerage thesis close returns `closeOrderAction: "unsupported"` for now.

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
| 500    | `internal_error`      | Server error                              |
