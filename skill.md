---
name: milo
version: 1.0.0
description: Autonomous Solana portfolio management. Non-custodial wallets, auto-trading, market analysis, orders, transfers, and AI conversations.
---

# Milo Partner API Skill

Milo is an autonomous Solana portfolio manager. Through this API you can register users, create non-custodial wallets, send tokens, place buy/sell orders, manage positions, configure auto-trading strategies, and converse with Milo's AI agents.

## Feature Overview

- **Non-custodial Solana wallet** - Each user gets a Milo wallet (created via Turnkey). The user's signing key owns the wallet; Milo receives delegated permission to execute trades.
- **Auto-trading** - Configure risk tolerance, strategy, and asset allocation. Milo's auto-trader agent monitors markets and executes trades autonomously.
- **Orders** - Create limit, market, stop-loss, and take-profit orders on any Solana token.
- **Token transfers** - Send any SPL token or SOL from your Milo wallet to any Solana address.
- **Positions** - Track open positions with PnL data, close positions.
- **AI conversations** - Chat with Milo's market analyst, auto-trader, or game agent. Async processing with polling.
- **Portfolio data** - Holdings, transactions, executed transactions, diary logs.

## Quick Start

1. **Get SIWX message** - Call `POST /api/v1/users/siwx/message` with your wallet address to get a message to sign.
2. **Register** - Sign the message with your wallet's ed25519 key, then call `POST /api/v1/users` with the signed SIWX proof to create a user and receive an API key + Milo wallet.
3. **Save credentials** - Store the API key, user ID, wallet ID, and wallet address in `~/.milo/config.json`.
4. **Deposit SOL** - Send SOL to your Milo wallet address (the `type: "milo"` wallet from signup).
5. **Activate auto-trader** - Call `PATCH /api/v1/users/{userId}/auto-trade-settings` with `{ "isActive": true }`.
6. **Start trading** - Create orders, chat with agents, or let the auto-trader manage your portfolio.

## Credential Storage

After signup, persist credentials locally so they survive across sessions:

```json
// ~/.milo/config.json
{
  "api_key": "mk_live_...",
  "user_id": "uuid",
  "wallet_id": "uuid",
  "wallet_address": "7xKXtg...",
  "base_url": "{{BASE_URL}}"
}
```

> **Warning:** In ephemeral environments (containers, serverless), this file may not persist. Use environment variables or a secrets manager instead.

All authenticated requests require the header:

```
X-API-Key: <api_key>
```

(NOT `Authorization: Bearer` — the API uses the `X-API-Key` header.)

## MCP Access

The partner-api host also exposes MCP at `/mcp` using Streamable HTTP:
- `POST /mcp` (initialize + JSON-RPC requests)
- `GET /mcp` (session SSE stream)
- `DELETE /mcp` (terminate session)

## Wallet & Deposits

Milo creates a **non-custodial** Solana wallet for each user via Turnkey. The wallet-creating account is the owner; Milo receives delegated permission for trading.

On signup you receive two wallets:

- `type: "signup"` - Your external signing wallet (used for SIWX verification).
- `type: "milo"` - Your Milo trading wallet. **Deposit SOL here** for trading.

To check your wallet balance, use the holdings endpoint:

```bash
curl {{BASE_URL}}/api/v1/wallets/{walletId}/holdings \
  -H "X-API-Key: $API_KEY"
```

## First Boot Protocol

When starting fresh with no saved credentials:

1. **Generate a Solana keypair** for SIWX signing.
2. **Request a SIWX message from the server:**
   ```bash
   curl -X POST {{BASE_URL}}/api/v1/users/siwx/message \
     -H "Content-Type: application/json" \
     -d '{
       "accountAddress": "<your-wallet-address>",
       "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
     }'
   ```
   This returns `{ "data": { ... }, "message": "<message-string>" }`. The `data` object contains all SIWX fields (domain, uri, nonce, etc.) and the `message` is the human-readable string to sign.
3. **Sign the message** — Sign the `message` string (UTF-8 encoded bytes) with your Solana keypair's ed25519 private key. Base58-encode the resulting signature.
4. **Register:**
   ```bash
   curl -X POST {{BASE_URL}}/api/v1/users \
     -H "Content-Type: application/json" \
     -d '{
       "signupWallet": "<your-wallet-address>",
       "siwx": {
         "data": <data-object-from-step-2>,
         "message": "<message-string-from-step-2>",
         "signature": "<base58-signature-from-step-3>"
       }
     }'
   ```
   **Important:** Pass the `data` and `message` exactly as returned by the server. Do not construct them manually.
5. **Save** the returned `apiKey`, `user.id`, and `wallets[1]` (the Milo wallet) to `~/.milo/config.json`.
6. **Deposit SOL** to the Milo wallet address.
7. **Configure auto-trade:**
   ```bash
   curl -X PATCH {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings \
     -H "X-API-Key: $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "isActive": true,
       "riskTolerance": "balanced",
       "strategy": "SWING TRADER"
     }'
   ```

## Heartbeat Protocol

See [heartbeat.md]({{BASE_URL}}/heartbeat.md) for the recurring check-in protocol. Run every 4+ hours to stay informed about your portfolio.

---

## Cookbook — Working with Milo

This cookbook walks through the most common workflows end-to-end. Follow these recipes to get up and running quickly.

### Recipe 1: Get your API key

Before anything else you need credentials. Generate a Solana keypair, request a SIWX message from the server, sign it, and register.

```bash
# 1. Request a SIWX message to sign
curl -X POST {{BASE_URL}}/api/v1/users/siwx/message \
  -H "Content-Type: application/json" \
  -d '{
    "accountAddress": "<your-wallet-address>",
    "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
  }'
# → returns { "data": { "data": { ... }, "message": "<message-to-sign>" } }

# 2. Sign the "message" string (UTF-8 bytes) with your ed25519 private key
#    Base58-encode the signature

# 3. Register with the signed proof
curl -X POST {{BASE_URL}}/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "signupWallet": "<your-wallet-address>",
    "siwx": {
      "data": <data-object-from-step-1>,
      "message": "<message-string-from-step-1>",
      "signature": "<base58-signature-from-step-2>"
    }
  }'

# 4. Save the response — you need these for every subsequent call
#    api_key  → Authorization header
#    user.id  → {userId} in routes
#    wallets[1].id      → {walletId} (the "milo" wallet)
#    wallets[1].address → deposit SOL here
```

Store credentials in `~/.milo/config.json` so they persist across sessions.

---

### Recipe 2: Activate the auto-trader

Once registered, turn on Milo's autonomous trading agent.

```bash
curl -X PATCH {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": true,
    "riskTolerance": "balanced",
    "strategy": "SWING TRADER",
    "instructions": "Focus on SOL ecosystem tokens. Avoid meme coins.",
    "customTickers": ["SOL", "JUP", "BONK"]
  }'
```

That's it — Milo will start monitoring markets and placing trades according to your configuration. You can verify it's active:

```bash
curl {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY"
```

---

### Recipe 3: Talk with Milo about your investment strategy

Use the **auto-trader** agent to discuss, refine, or brainstorm your trading strategy. This is a conversation — Milo understands your portfolio context.

```bash
# 1. Start a conversation with the auto-trader
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/conversations \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I want to shift my strategy toward DeFi blue-chips. What allocation do you recommend for a balanced risk profile?",
    "agentType": "auto-trader"
  }'
# → returns { conversationId, processing: true }

# 2. Poll for the response (wait 2-3s between polls)
curl "{{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId}/messages" \
  -H "X-API-Key: $API_KEY"
# → when processing: false, the agent has responded

# 3. Continue the conversation
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId}/messages \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Good plan. Apply those changes to my auto-trade settings." }'
```

**Tip:** The auto-trader agent can directly update your settings when you ask it to — it has tool access to modify your allocation, risk tolerance, and instructions.

---

### Recipe 4: Fetch your positions

Check what Milo is holding and how each position is performing.

```bash
# List all active positions with PnL
curl "{{BASE_URL}}/api/v1/users/{userId}/positions?status=active&page=1&pageSize=50" \
  -H "X-API-Key: $API_KEY"
```

Each position includes the token, entry price, current PnL, and thesis. Use `status=pending` for positions still being built, or omit the filter to get everything.

For a deeper look at your wallet's token balances:

```bash
curl {{BASE_URL}}/api/v1/wallets/{walletId}/holdings \
  -H "X-API-Key: $API_KEY"
```

---

### Recipe 5: Revalidate a position with Milo

Have Milo re-analyze an existing position to decide whether to hold, add, or exit.

```bash
# 1. Get the position's thesisId from the positions list (Recipe 4)
# 2. Start a conversation with the auto-trader, referencing the position
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/conversations \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Re-evaluate my position on JUP (thesis {thesisId}). Given the latest market conditions, should I hold, take partial profit, or close it entirely?",
    "agentType": "auto-trader"
  }'

# 3. Poll for the response
curl "{{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId}/messages" \
  -H "X-API-Key: $API_KEY"

# 4. If Milo recommends closing, you can close it directly:
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/positions/{thesisId}/close \
  -H "X-API-Key: $API_KEY"
```

---

### Recipe 6: Ask Milo about a specific token

Use the **market-analyst** agent for token research. It can pull market data, analyze trends, and give you a thesis.

```bash
# 1. Ask the market analyst about a token
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/conversations \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What do you think about RENDER? Give me a full analysis — fundamentals, technicals, and whether it fits my current portfolio.",
    "agentType": "market-analyst"
  }'

# 2. Poll for the response
curl "{{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId}/messages" \
  -H "X-API-Key: $API_KEY"

# 3. Follow up with more questions in the same conversation
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId}/messages \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Compare it with RNDR vs HNT for a DePIN play. Which is the better entry right now?" }'
```

**Tip:** The market-analyst agent focuses on research and analysis. If you want Milo to actually execute a trade based on the analysis, either create an order manually or switch to the auto-trader agent.

---

### Putting it all together

A typical session with Milo looks like:

1. **Check in** — Fetch positions and holdings (Recipes 4)
2. **Strategize** — Talk to the auto-trader about adjusting your approach (Recipe 3)
3. **Research** — Ask the market analyst about tokens you're curious about (Recipe 6)
4. **Validate** — Revalidate existing positions with fresh analysis (Recipe 5)
5. **Act** — Let the auto-trader handle execution, or place manual orders via the Orders API

Run the [heartbeat protocol]({{BASE_URL}}/heartbeat.md) every 4+ hours to keep this cycle going automatically.

---

## Complete API Reference

### Authentication

All endpoints (except signup) require:

```
X-API-Key: <api_key>
```

### Signup

Signup is a two-step process: first request a SIWX message from the server, then sign it and submit the proof.

#### POST /api/v1/users/siwx/message

Generate a SIWX message for the wallet to sign. This is step 1 of signup.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/siwx/message \
  -H "Content-Type: application/json" \
  -d '{
    "accountAddress": "<wallet-address>",
    "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
  }'
```

**Request body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountAddress` | string | yes | Solana wallet address (32-64 chars) |
| `chainId` | string | yes | CAIP-2 chain ID (e.g. `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`) |
| `inviteCode` | string | no | Optional invite code |

**Response (200):**

```json
{
  "data": {
    "data": {
      "accountAddress": "<wallet-address>",
      "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      "domain": "andmilo.com",
      "uri": "https://andmilo.com",
      "version": "v1",
      "nonce": "<server-generated-nonce>",
      "issuedAt": "2025-06-15T12:00:00.000Z",
      "expirationTime": "2025-06-22T12:00:00.000Z",
      "statement": "By signing, you agree to andmilo Terms of Use..."
    },
    "message": "andmilo.com wants you to sign in with your Solana account:\n<wallet-address>\n\n..."
  }
}
```

Sign the `message` string (UTF-8 encoded bytes) with the wallet's ed25519 private key. Base58-encode the signature. Then proceed to step 2.

#### POST /api/v1/users

Create a new user via SIWX wallet verification. This is step 2 of signup.

```bash
curl -X POST {{BASE_URL}}/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "signupWallet": "<wallet-address>",
    "siwx": {
      "data": <data-object-from-siwx-message-response>,
      "message": "<message-string-from-siwx-message-response>",
      "signature": "<base58-ed25519-signature>"
    }
  }'
```

**Important:** Pass the `data` and `message` fields exactly as returned by `POST /api/v1/users/siwx/message`. Do not construct them manually.

**Response (200):**

```json
{
  "data": {
    "user": {
      "id": "uuid",
      "signupWalletId": "uuid",
      "provider": "siwx",
      "createdAt": "..."
    },
    "wallets": [
      {
        "id": "uuid",
        "address": "<address>",
        "chain": "solana",
        "type": "signup"
      },
      {
        "id": "uuid",
        "address": "<address>",
        "chain": "solana",
        "type": "milo"
      }
    ],
    "apiKey": "mk_live_..."
  }
}
```

---

### Auto-Trade Settings

#### GET /api/v1/users/{userId}/auto-trade-settings

Get current auto-trade configuration.

```bash
curl {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY"
```

#### PATCH /api/v1/users/{userId}/auto-trade-settings

Update auto-trade configuration.

```bash
curl -X PATCH {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "isActive": true,
    "riskTolerance": "balanced",
    "strategy": "SWING TRADER",
    "instructions": "Focus on SOL ecosystem tokens",
    "customTickers": ["SOL", "JUP", "BONK"]
  }'
```

**Settings fields:**
| Field | Type | Values |
|-------|------|--------|
| `isActive` | boolean | Enable/disable auto-trading |
| `riskTolerance` | string | `conservative`, `balanced`, `degen` |
| `strategy` | string | `VALUE INVESTOR`, `SWING TRADER`, `SCALPER`, `CUSTOM` |
| `strategyId` | uuid \| null | Link a saved strategy to auto-trade settings |
| `instructions` | string | Free-text trading instructions for the agent |
| `customTickers` | string[] | Specific tokens to focus on |
| `allocation` | object | Asset class allocation percentages |
| `assetClassSettings` | object | Per-asset-class configuration |

**Asset classes for allocation:** `trenches`, `memes`, `promising-memes`, `staking`, `native`, `majors`, `stables`, `xStocks`, `custom`

---

### Strategies

Strategies are reusable autotrade configurations that live under auto-trade settings. Create a strategy, link it to your settings, and sync when the strategy evolves.

**Workflow:**

1. **Create** a strategy with allocation, instructions, and trading approach.
2. **Link** it via `PATCH /auto-trade-settings` with `{ "strategyId": "<uuid>" }`. This takes a **snapshot** of the strategy into your settings.
3. **Use** — Milo auto-trades according to the snapshot.
4. If the strategy is updated later, the GET settings response includes `strategySync.synced: false`.
5. **Sync** — call `POST .../strategies/{strategyId}/sync` to re-apply the latest version.

#### POST /api/v1/users/{userId}/auto-trade-settings/strategies

Create a new strategy.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings/strategies \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SOL Ecosystem DCA",
    "description": "Dollar cost average into SOL ecosystem tokens",
    "strategy": "SWING TRADER",
    "instructions": "Focus on SOL, JUP, and BONK with balanced entries",
    "allocation": { "majors": 45, "native": 25, "staking": 10, "promising-memes": 15, "xStocks": 5 },
    "customTickers": ["SOL", "JUP", "BONK"],
    "isPublic": false
  }'
```

**Response (201):**

```json
{
  "data": {
    "id": "uuid",
    "name": "SOL Ecosystem DCA",
    "strategy": "SWING TRADER",
    "allocation": { ... },
    "createdAt": "..."
  }
}
```

**Create/update fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes (create) | Strategy name (1-200 chars) |
| `description` | string \| null | no | Description (max 2000 chars) |
| `instructions` | string | no | Free-text instructions (max 4000 chars) |
| `strategy` | string | yes (create) | `VALUE INVESTOR`, `SWING TRADER`, `SCALPER`, `CUSTOM` |
| `allocation` | object | no | Asset class allocation percentages |
| `customTickers` | string[] \| null | no | Token tickers to focus on |
| `assetClassSettings` | object \| null | no | Per-asset-class configuration |
| `isPublic` | boolean | no | Make strategy publicly discoverable |

#### GET /api/v1/users/{userId}/auto-trade-settings/strategies

List strategies with filters.

```bash
curl "{{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings/strategies?scope=owned&page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

**Query parameters:**
| Param | Values | Description |
|-------|--------|-------------|
| `scope` | `all`, `owned`, `public` | Filter by ownership |
| `q` | string | Search by name/description |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Items per page (default: 25, max: 100) |

#### GET /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}

Get strategy details.

```bash
curl {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId} \
  -H "X-API-Key: $API_KEY"
```

#### PATCH /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}

Update a strategy. All fields are optional.

```bash
curl -X PATCH {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId} \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Strategy Name",
    "instructions": "New instructions for the agent"
  }'
```

#### DELETE /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}

Delete a strategy.

```bash
curl -X DELETE {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId} \
  -H "X-API-Key: $API_KEY"
```

#### POST /api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}/sync

Re-sync auto-trade settings with the linked strategy. Takes a fresh snapshot of the strategy's current allocation, instructions, and configuration.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}/sync \
  -H "X-API-Key: $API_KEY"
```

**Strategy sync workflow:**

1. Link a strategy to your settings:

```bash
curl -X PATCH {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "strategyId": "<strategy-uuid>", "isActive": true }'
```

2. Check sync status (included in GET settings response):

```json
{
  "strategyId": "uuid",
  "strategySync": {
    "strategyId": "uuid",
    "synced": false,
    "strategyUpdatedAt": "2025-06-15T14:00:00.000Z",
    "settingsUpdatedAt": "2025-06-01T10:00:00.000Z"
  }
}
```

3. When `synced` is `false`, re-sync:

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/auto-trade-settings/strategies/{strategyId}/sync \
  -H "X-API-Key: $API_KEY"
```

---

### Wallet Actions

#### POST /api/v1/wallets/{walletId}/actions/send

Send tokens from your Milo wallet to a recipient address.

```bash
curl -X POST {{BASE_URL}}/api/v1/wallets/{walletId}/actions/send \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "<solana-address>",
    "token": "<token-mint-address>",
    "amount": 1.5
  }'
```

**Response (202):**

```json
{ "data": "<transaction-signature>" }
```

> **Note:** For native SOL, use the SOL mint address: `So11111111111111111111111111111111111111112`.

---

### Orders

#### POST /api/v1/wallets/{walletId}/orders

Create a new order, optionally with take-profit and stop-loss dependants.

```bash
curl -X POST {{BASE_URL}}/api/v1/wallets/{walletId}/orders \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "So11111111111111111111111111111111111111112",
    "type": "buy",
    "status": "active",
    "expiresAt": "2026-12-31T23:59:59.000Z",
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

**Response** includes the main order plus a `dependants` array:

```json
{
  "data": {
    "id": "...",
    "type": "buy",
    "status": "active",
    "dependants": [
      {
        "type": "take_profit",
        "order": {
          "id": "...",
          "parentId": "...",
          "subType": "take_profit",
          "status": "draft"
        }
      },
      {
        "type": "take_profit",
        "order": {
          "id": "...",
          "parentId": "...",
          "subType": "take_profit",
          "status": "draft"
        }
      },
      {
        "type": "stop_loss",
        "order": {
          "id": "...",
          "parentId": "...",
          "subType": "stop_loss",
          "status": "draft"
        }
      }
    ]
  }
}
```

**Take-profit / Stop-loss ladder (optional):**

`takeProfits` array — each item:

- `percentage` (1–100) — percent of position to sell
- `profitPercentage` (> 0) — profit percent to trigger the TP

`stopLosses` array — each item:

- `percentage` (1–100) — percent of position to sell
- `lossPercentage` (1–100) — loss percent to trigger the SL

Dependant creation flow (enforced):
- Main order is created first.
- TP and SL dependants are created sequentially as draft sell children (`parentId` = main order ID).
- Dependant failures are captured per dependant entry while the main order still returns `201`.

Guardrails (always enforce mode):
- `takeProfits.length <= 5`
- `stopLosses.length <= 5`
- `takeProfits.length + stopLosses.length <= 8`

Violations return `400 bad_request` with a clear validation message. Dependants use relative triggers (`rise` for TP, `drop` for SL).

**Order payload structure:**

Buy order amounts:

- `{ "type": "absolute", "amount": 1000000 }` - Raw token amount
- `{ "type": "absolute_usd", "amount": 50 }` - USD equivalent

Sell order amounts (additional option):

- `{ "type": "relative", "percentage": 50 }` - Percentage of position

Trigger types:

- Market order: `{ "type": "absolute", "trigger": "price", "operator": "gte", "value": 0 }`
- Limit buy: `{ "type": "absolute", "trigger": "price", "operator": "lte", "value": 150.00 }`
- Stop loss: `{ "type": "relative", "trigger": "price", "operator": "drop", "value": 10 }` (10% drop)
- Take profit: `{ "type": "relative", "trigger": "price", "operator": "rise", "value": 25 }` (25% rise)

Execution options (all optional):

- `slippagePercentage` - Max slippage (0-100)
- `priorityFee` - Priority fee in SOL lamports
- `platformFeeBps` - Platform fee override in basis points

**Linking to a thesis:** Pass `positionThesisId` (UUID) in the body to attach the order (and its TP/SL dependants) to a position thesis.

#### GET /api/v1/users/{userId}/orders

List orders with filters.

```bash
curl "{{BASE_URL}}/api/v1/users/{userId}/orders?status=active&type=buy&page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

**Query parameters:**
| Param | Type | Values |
|-------|------|--------|
| `status` | string | `active`, `paused`, `error`, `fulfilled`, `archived`, `draft` |
| `type` | string | `buy`, `sell` |
| `tokenAddress` | string | Filter by token |
| `page` | number | Page number (default: 1, max: 100) |
| `pageSize` | number | Items per page (default: 25, max: 100) |

#### GET /api/v1/users/{userId}/orders/{orderId}

Get order details.

```bash
curl {{BASE_URL}}/api/v1/users/{userId}/orders/{orderId} \
  -H "X-API-Key: $API_KEY"
```

#### POST /api/v1/users/{userId}/orders/{orderId}/pause

Pause an active order.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/orders/{orderId}/pause \
  -H "X-API-Key: $API_KEY"
```

#### POST /api/v1/users/{userId}/orders/{orderId}/activate

Activate a draft or paused order.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/orders/{orderId}/activate \
  -H "X-API-Key: $API_KEY"
```

#### DELETE /api/v1/users/{userId}/orders/{orderId}

Archive (delete) an order.

```bash
curl -X DELETE {{BASE_URL}}/api/v1/users/{userId}/orders/{orderId} \
  -H "X-API-Key: $API_KEY"
```

---

### Conversations

Milo uses an async conversation model. You send a message and the agent processes it in the background. Poll the messages endpoint for the response using the `processing` flag.

#### POST /api/v1/users/{userId}/conversations

Create a new conversation and send the first message.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/conversations \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the current market sentiment for SOL?",
    "agentType": "market-analyst"
  }'
```

**Agent types:**
| Agent | ID | Purpose |
|-------|----|---------|
| Market Analyst | `market-analyst` | Market analysis, token research, sentiment |
| Auto Trader | `auto-trader` | Trading strategy discussion |
| Game Agent | `milo-game-agent` | Gamified trading experience |

**Response (201):**

```json
{
  "data": {
    "conversationId": "...",
    "status": "active",
    "agentActive": true,
    "processing": true,
    "createdAt": "..."
  }
}
```

#### GET /api/v1/users/{userId}/conversations

List conversations.

```bash
curl "{{BASE_URL}}/api/v1/users/{userId}/conversations?page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

#### GET /api/v1/users/{userId}/conversations/{conversationId}

Get conversation details.

```bash
curl {{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId} \
  -H "X-API-Key: $API_KEY"
```

#### POST /api/v1/users/{userId}/conversations/{conversationId}/messages

Send a follow-up message.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId}/messages \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "message": "What about JUP?" }'
```

#### GET /api/v1/users/{userId}/conversations/{conversationId}/messages

Poll for messages. Check `processing` flag to know if the agent is still working.

```bash
curl "{{BASE_URL}}/api/v1/users/{userId}/conversations/{conversationId}/messages?page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "data": {
    "messages": [
      {
        "messageId": "...",
        "role": "user",
        "content": "...",
        "createdAt": "..."
      },
      {
        "messageId": "...",
        "role": "assistant",
        "content": "...",
        "createdAt": "..."
      }
    ],
    "processing": false
  },
  "meta": { "page": 1, "pageSize": 25, "total": 2, "pages": 1 }
}
```

**Polling pattern:**

1. Send a message (POST).
2. Poll GET messages every 2-3 seconds.
3. When `processing` is `false`, the agent has finished responding.

---

### Portfolio

#### GET /api/v1/wallets/{walletId}/holdings

Get current token holdings for a wallet.

```bash
curl {{BASE_URL}}/api/v1/wallets/{walletId}/holdings \
  -H "X-API-Key: $API_KEY"
```

#### GET /api/v1/wallets/{walletId}/transactions

Get all transactions for a wallet.

```bash
curl "{{BASE_URL}}/api/v1/wallets/{walletId}/transactions?page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

#### GET /api/v1/wallets/{walletId}/executed-transactions

Get executed transactions (order-linked trades) for a wallet. Uses cursor-based pagination.

```bash
curl "{{BASE_URL}}/api/v1/wallets/{walletId}/executed-transactions?limit=25" \
  -H "X-API-Key: $API_KEY"

# To paginate, pass the nextCursor from the previous response:
curl "{{BASE_URL}}/api/v1/wallets/{walletId}/executed-transactions?limit=25&cursor=<nextCursor>" \
  -H "X-API-Key: $API_KEY"
```

**Query parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Items per page (default: 25, max: 200) |
| `cursor` | string | Cursor from previous response's `nextCursor` |
| `txType` | string | Filter by `buy` or `sell` |
| `token` | string | Filter by token address |

#### GET /api/v1/users/{userId}/positions

Get positions with PnL data.

```bash
curl "{{BASE_URL}}/api/v1/users/{userId}/positions?status=active&page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

**Query parameters:**
| Param | Values |
|-------|--------|
| `status` | `active`, `pending`, `not_active` |

#### POST /api/v1/users/{userId}/positions/{thesisId}/close

Close a single position. Cancels pending orders and creates a sell order for remaining holdings.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/positions/{thesisId}/close \
  -H "X-API-Key: $API_KEY"
```

#### POST /api/v1/users/{userId}/positions/close-all

Close **all** active and pending positions for a user. Each position is closed independently — partial failures don't block other positions.

```bash
curl -X POST {{BASE_URL}}/api/v1/users/{userId}/positions/close-all \
  -H "X-API-Key: $API_KEY"
```

**Response:**

```json
{
  "data": {
    "successes": [
      { "thesisId": "...", "cancelled": 2, "sellOrderCreated": true }
    ],
    "failures": [{ "thesisId": "...", "error": "No wallet found" }]
  }
}
```

#### GET /api/v1/users/{userId}/diary-logs

Get auto-trade diary logs.

```bash
curl "{{BASE_URL}}/api/v1/users/{userId}/diary-logs?page=1&pageSize=25" \
  -H "X-API-Key: $API_KEY"
```

---

## Rate Limits

| Endpoint Group                                                  | Limit | Window |
| --------------------------------------------------------------- | ----- | ------ |
| Signup (per IP)                                                 | 5     | 60s    |
| Signup (per wallet)                                             | 1     | 60s    |
| Portfolio reads (holdings, transactions, positions, diary-logs) | 60    | 60s    |
| Auto-trade settings (write)                                     | 10    | 60s    |
| Strategies (write: create, update, delete)                      | 10    | 60s    |
| Strategies (read: list, get)                                    | 60    | 60s    |
| Conversations (write: create, send message)                     | 2     | 60s    |
| Conversations (read: list, get, messages)                       | 30    | 60s    |
| Wallet actions (send)                                           | 10    | 60s    |
| Orders create (`POST /wallets/{walletId}/orders`)              | 5     | 60s    |
| Orders write (`pause`, `activate`, `delete`)                    | 10    | 60s    |
| Orders (read: list, get)                                        | 60    | 60s    |
| Position close                                                  | 10    | 60s    |
| Position close-all (`POST /users/{userId}/positions/close-all`) | 1     | 60s    |

Rate limit rejections return `429 Too Many Requests` with:
- `error.code = "rate_limit_exceeded"`
- `Retry-After` header (seconds)
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers

Retry behavior: back off and retry only after `Retry-After` elapses.

## Pagination

All list endpoints support pagination:

- `page` - Page number (default: 1, max: 100)
- `pageSize` - Items per page (default: 25, max: 100)

Response includes `meta`:

```json
{ "meta": { "page": 1, "pageSize": 25, "total": 100, "pages": 4 } }
```

## Error Codes

| Status | Code             | Description                                     |
| ------ | ---------------- | ----------------------------------------------- |
| 400    | `bad_request`    | Invalid input, missing fields, validation error |
| 401    | `unauthorized`   | Missing or invalid API key                      |
| 404    | `not_found`      | Resource not found                              |
| 409    | `error`          | Conflict (e.g., user already exists)            |
| 429    | `rate_limit_exceeded` | Rate limit exceeded                        |
| 500    | `internal_error` | Unexpected server error                         |

**Error response format:**

```json
{
  "error": {
    "code": "bad_request",
    "message": "Description of the error"
  }
}
```
