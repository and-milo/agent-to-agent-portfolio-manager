# Partner API

## Overview

HTTP API for external partners to manage users, wallets, trading, and AI conversations on Milo. All endpoints are versioned under `/api/v1` and require an API key (except signup).

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
- MCP forwards caller IP to downstream partner-api calls so signup/SIWX per-IP throttling remains per caller.
- MCP sessions are bounded and idle sessions are evicted; initialize may return `429` under saturation.
- If a session expires, sessioned calls return invalid-session errors and the client should re-initialize.
- There is no server-side API-key fallback for MCP sessions.
- MCP `create_conversation` and `send_message` surface conversation-write overage (`402 Payment Required`) as structured payment guidance (`paymentSupport`) and support optional `payment` input to attach proof on retry.
- Overage payment options are `0.25 USDC` or `0.01 SOL` to `TREASURY_WALLET` (recipient address is returned in `paymentSupport.recipient` / `X-Payment-Recipient`).
- Retry using MCP `create_conversation` or `send_message` with:
  - `payment.recipient`, `payment.asset`, `payment.amount`, `payment.paymentId`, `payment.txSignature`
  - optional `payment.header` (default `X-PAYMENT`)

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

Resolve the authenticated API key to the user profile and wallets. Use this to discover your `userId` and `walletId` values.

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountAddress` | string | yes | Solana wallet address (32-64 chars) |
| `chainId` | string | yes | CAIP-2 chain ID |
| `inviteCode` | string | no | Optional invite code |

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
    "apiKey": "mk_live_..."
  }
}
```

You get two wallets:
- **signup** — Your external signing wallet
- **milo** — Your trading wallet. Deposit SOL here.

Returns `409 Conflict` if the wallet already belongs to an existing user.

---

### Auto-Trade Settings

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

| Field | Type | Description |
|-------|------|-------------|
| `isActive` | boolean | Enable/disable auto-trading |
| `riskTolerance` | string | `conservative`, `balanced`, `degen` |
| `strategy` | string | `VALUE INVESTOR`, `SWING TRADER`, `SCALPER`, `CUSTOM` |
| `strategyId` | uuid \| null | Link a saved strategy |
| `instructions` | string | Free-text trading instructions |
| `customTickers` | string[] | Tokens to focus on |
| `allocation` | object | Asset class percentages |

**Asset classes:** `trenches`, `memes`, `promising-memes`, `staking`, `native`, `majors`, `stables`, `xStocks`, `custom`

`isActive` can only be set to `true` if the Milo wallet holds at least 1 SOL.

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Strategy name (1-200 chars) |
| `strategy` | string | yes | `VALUE INVESTOR`, `SWING TRADER`, `SCALPER`, `CUSTOM` |
| `description` | string | no | Description (max 2000 chars) |
| `instructions` | string | no | Free-text instructions (max 4000 chars) |
| `allocation` | object | no | Asset class percentages |
| `customTickers` | string[] | no | Token tickers to focus on |
| `isPublic` | boolean | no | Make publicly discoverable |

#### List Strategies

`GET /api/v1/users/{userId}/auto-trade-settings/strategies`

```bash
curl "https://partners.andmilo.com/api/v1/users/{userId}/auto-trade-settings/strategies?scope=public&q=DeFi" \
  -H "X-API-Key: $API_KEY"
```

| Param | Type | Description |
|-------|------|-------------|
| `scope` | string | `all`, `owned`, `public` |
| `q` | string | Search by name/description |
| `page` | number | Page number (default: 1) |
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
2. Link it: `PATCH /auto-trade-settings` with `{ "strategyId": "..." }`
3. Milo trades using the snapshot
4. If the strategy is updated, GET settings shows `strategySync.synced: false`
5. Call sync to re-apply the latest version

---

### Arena

Deploy a public strategy to the arena leaderboard. Milo creates a custody wallet, funds it, and trades autonomously using the strategy. The strategy must be public and owned by the user. Deployment requires at least 1 SOL balance (0.01 SOL in dev). Withdrawing transfers all holdings back to the user's Milo wallet.

#### Deploy to Arena

`POST /api/v1/users/{userId}/arena/deploy`

```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/arena/deploy \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "strategyId": "<strategy-uuid>" }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `strategyId` | uuid | yes | ID of a public strategy owned by the user |

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `strategyId` | uuid | yes | ID of the deployed strategy to withdraw |

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

| Param | Type | Values | Default |
|-------|------|--------|---------|
| `timeframe` | string | `1d`, `30d`, `90d` | — |
| `page` | number | Page number | 1 |
| `pageSize` | number | Items per page (max: 100) | 25 |
| `sortKey` | string | `pnl`, `winRate`, `returnPct`, `accountValue` | — |
| `sortDirection` | string | `asc`, `desc` | — |

`winRate` is token-PnL based: `(number of tokens with positive token PnL / total tracked tokens) * 100`, excluding USDC.

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
      "winRate": 0.65,
      "returnPct": 12.5,
      "accountValue": 1120.50,
      "arenaWalletAddress": "<solana-address>",
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

| Param | Type | Description | Default |
|-------|------|-------------|---------|
| `unlocked` | boolean | Filter for unlocked quests (available) | `true` |
| `unclaimed` | boolean | Filter for completed but unclaimed quests | — |
| `claimed` | boolean | Filter for claimed quests | — |
| `mode` | string | `completed_last` | — |
| `page` | number | Page number | 1 |
| `pageSize` | number | Items per page (max: 100) | 25 |

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
        { "requirementId": "uuid", "aggregationKind": "count", "targetValue": 1, "currentValue": 1, "completed": true }
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
    "payload": {
      "type": "buy",
      "amount": { "type": "absolute_usd", "amount": 50 },
      "trigger": { "type": "absolute", "trigger": "price", "operator": "gte", "value": 0 }
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
        { "type": "take_profit", "order": { "id": "...", "subType": "take_profit", "status": "draft" } },
        { "type": "stop_loss", "order": { "id": "...", "subType": "stop_loss", "status": "draft" } }
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

| Param | Type | Values |
|-------|------|--------|
| `status` | string | `active`, `paused`, `error`, `fulfilled`, `archived`, `draft` |
| `type` | string | `buy`, `sell` |
| `tokenAddress` | string | Filter by token |
| `page` | number | Page number (default: 1, max: 100) |
| `pageSize` | number | Items per page (default: 25, max: 100) |

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

| Field | Type | Description |
|-------|------|-------------|
| `recipient` | string | Destination Solana address |
| `token` | string | Token mint address |
| `amount` | number | Amount in human-readable units (e.g. 1.5 SOL) |

For native SOL use mint: `So11111111111111111111111111111111111111112`

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

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | yes | Initial message (1-4000 chars) |
| `agentType` | string | no | Agent type (default: `market-analyst`) |

**Agent types:**

| Agent | Value | Purpose |
|-------|-------|---------|
| Market Analyst | `market-analyst` | Token research, technicals, sentiment |
| Auto Trader | `auto-trader` | Strategy discussion, can update settings |

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

#### Conversation Overage Payments

Conversation write endpoints (`create` + `send message`) include **2 free writes per 60s** per API key (shared across conversations).  
When over the free quota, the API returns `402 Payment Required`.

- Payment header: `X-PAYMENT`
- Recipient wallet: `TREASURY_WALLET` (server environment variable)
- Accepted overage prices:
  - `0.25 USDC`
  - `0.01 SOL`
- Anti-replay: each paid overage request must include a unique one-time `paymentId` (reusing it is rejected).
- On-chain verification: each paid request must include `txSignature` for a confirmed Solana transfer to `TREASURY_WALLET` with the matching asset+amount.

**402 example response:**
```json
{
  "error": {
    "code": "payment_required",
    "message": "Conversation write limit exceeded. Payment is required for overage messages.",
    "details": {
      "reason": "conversation_write_overage",
      "acceptedHeader": "X-PAYMENT",
      "recipient": "<TREASURY_WALLET>",
      "options": [
        { "asset": "USDC", "amount": 0.25 },
        { "asset": "SOL", "amount": 0.01 }
      ],
      "freeTier": { "requests": 2, "windowSeconds": 60 },
      "antiReplay": {
        "required": true,
        "oneTimeIdField": "paymentId",
        "oneTimeTxField": "txSignature",
        "scope": "api_key"
      },
      "onChainVerification": {
        "required": true,
        "chain": "solana",
        "commitment": "confirmed",
        "txField": "txSignature"
      }
    }
  }
}
```

**Paid retry example:**
```bash
curl -X POST https://partners.andmilo.com/api/v1/users/{userId}/conversations/{conversationId}/messages \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-PAYMENT: {\"recipient\":\"<TREASURY_WALLET>\",\"asset\":\"USDC\",\"amount\":0.25,\"paymentId\":\"pay_001_unique\",\"txSignature\":\"<confirmed-solana-tx-signature>\"}" \
  -d '{ "message": "Continue the analysis." }'
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
      { "messageId": "...", "role": "assistant", "content": "...", "createdAt": "..." }
    ],
    "processing": false
  },
  "meta": { "page": 1, "pageSize": 25, "total": 2, "pages": 1 }
}
```

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

| Param | Values |
|-------|--------|
| `status` | `active`, `pending`, `not_active` |
| `page` | Page number (default: 1, max: 100) |
| `pageSize` | Items per page (default: 25, max: 100) |

Each position includes entry/exit orders, TP/SL orders, invested amount, realized/unrealized PnL, and current value.

#### Close Position

`POST /api/v1/users/{userId}/positions/{thesisId}/close`

Cancels pending orders and creates a sell order for remaining holdings.

#### Close All Positions

`POST /api/v1/users/{userId}/positions/close-all`

Closes all active and pending positions. Partial failures don't block other positions.

**Response:**
```json
{
  "data": {
    "successes": [
      { "thesisId": "...", "cancelled": 2, "sellOrderCreated": true }
    ],
    "failures": [
      { "thesisId": "...", "error": "No wallet found" }
    ]
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

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Items per page (default: 25, max: 200) |
| `cursor` | string | Cursor from previous response |

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

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Items per page (default: 25, max: 200) |
| `cursor` | string | Cursor from previous response |
| `txType` | string | Filter: `buy` or `sell` |
| `token` | string | Filter by token address |

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

---

## Pagination

Most list endpoints use page-based pagination:

| Param | Default | Max |
|-------|---------|-----|
| `page` | 1 | 100 |
| `pageSize` | 25 | 100 |

Response includes:
```json
{ "meta": { "page": 1, "pageSize": 25, "total": 100, "pages": 4 } }
```

Transactions and executed transactions use **cursor-based** pagination with `limit` and `cursor` params, returning a `nextCursor` field.

## Rate Limits

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Signup (per IP) | 5 | 60s |
| Signup (per wallet) | 1 | 60s |
| SIWX message (per IP) | 5 | 60s |
| Me (`GET /api/v1/me`) | 60 | 60s |
| Portfolio reads (holdings, transactions, positions, diary-logs) | 60 | 60s |
| Auto-trade settings (write) | 10 | 60s |
| Strategies (write) | 10 | 60s |
| Strategies (read) | 60 | 60s |
| Conversations (write: create, send message) | 2 free then paid overage | 60s |
| Conversations (read) | 30 | 60s |
| Arena write (deploy, withdraw) | 5 | 60s |
| Arena read (leaderboard) | 30 | 60s |
| Quests read (list, bones balance) | 60 | 60s |
| Quests write (claim) | 10 | 60s |
| Wallet actions | 10 | 60s |
| Orders create (`POST /wallets/{walletId}/orders`) | 5 | 60s |
| Orders write (`pause`, `activate`, `delete`) | 10 | 60s |
| Orders (read) | 60 | 60s |
| Position close | 10 | 60s |
| Position close-all (`POST /users/{userId}/positions/close-all`) | 1 | 60s |

Rate limit rejections return `429 Too Many Requests` with:
- `error.code = "rate_limit_exceeded"`
- `Retry-After` header (seconds)
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

Retry behavior: wait for `Retry-After` before retrying.

Conversation write overage returns `402 Payment Required` with:
- `error.code = "payment_required"`
- `X-Payment-Required: true`
- `X-Payment-Header: X-PAYMENT`
- `X-Payment-Recipient: <TREASURY_WALLET>`
- `X-Payment-Options: USDC:0.25,SOL:0.01`
- `X-Payment-Id-Field: paymentId` (one-time value required per paid request)
- `X-Payment-Tx-Field: txSignature` (confirmed payment transaction signature)

Successful paid overage retries (`2xx`) include:
- `PAYMENT-RESPONSE: <base64-json-settlement>` (x402-style acceptance payload)
- `X-PAYMENT-RESPONSE: <same-value>` (legacy mirror)
- `X-Billing-Mode: payg`

## Error Handling

```json
{
  "error": {
    "code": "bad_request",
    "message": "Description of the error"
  }
}
```

| Status | Code | Description |
|--------|------|-------------|
| 400 | `bad_request` | Invalid input or validation error |
| 401 | `unauthorized` | Missing or invalid API key |
| 402 | `payment_required` | Conversation write overage requires payment |
| 404 | `not_found` | Resource not found |
| 409 | `error` | Conflict (e.g. wallet already registered) |
| 429 | `rate_limit_exceeded` | Rate limit exceeded |
| 500 | `internal_error` | Server error |
