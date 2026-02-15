# Milo Partner API CLI

TypeScript CLI for the Milo Partner API. Zero runtime dependencies, single-file bundle via tsup.

## Prerequisites

- Node.js 22+

## Setup

```bash
cd cli
npm install
npm run build
```

The build produces `dist/milo` — a self-contained executable.

## MCP Endpoint

The same partner-api server exposes MCP on `/mcp` (Streamable HTTP).  
This CLI continues to use the REST endpoints directly.

## Authentication

Three ways to provide credentials (in order of precedence):

1. **Flags** — `--api-key`, `--base-url`
2. **Environment variables** — `MILO_API_KEY`, `MILO_BASE_URL`
3. **Config file** — `~/.milo/config.json` (auto-saved after `signup`)

```bash
# Option A: signup (auto-saves credentials to ~/.milo/config.json)
./dist/milo signup --wallet-address <addr> --secret-key <base58-ed25519-key>

# Option B: manual config
./dist/milo config --set-api-key <key> --set-user-id <uuid> --set-wallet-id <uuid>

# Option C: env vars
export MILO_API_KEY="<key>"
export MILO_BASE_URL="https://partners.andmilo.com"
```

## Usage

```bash
./dist/milo --help                    # list all commands
./dist/milo <command> --help          # command-specific flags
```

All commands output JSON to stdout. Pipe to `jq` for formatting.

## Commands

| Command | Description |
|---------|-------------|
| `signup` | Register via SIWX wallet verification (auto-signs with `--secret-key`) |
| `get-holdings` | Get token holdings for a wallet |
| `transactions` | List wallet transactions |
| `executed-transactions` | Get executed (order-linked) transactions |
| `list-positions` | List investment positions with PnL |
| `close-position` | Close a position |
| `close-all-positions` | Close all positions (API limit: 1 request/min) |
| `create-order` | Create a buy/sell order with optional TP/SL (API limit: 5 requests/min) |
| `list-orders` | List orders with filters |
| `get-order` | Get order details |
| `pause-order` | Pause an active order |
| `activate-order` | Activate a draft/paused order |
| `delete-order` | Archive an order |
| `send-tokens` | Send tokens from your Milo wallet |
| `get-settings` | Get auto-trade configuration |
| `update-settings` | Update auto-trade configuration |
| `list-strategies` | List autotrade strategies |
| `get-strategy` | Get strategy details |
| `create-strategy` | Create a strategy |
| `update-strategy` | Update a strategy |
| `delete-strategy` | Delete a strategy |
| `sync-strategy` | Re-sync settings with a linked strategy |
| `create-conversation` | Start a conversation with Milo AI |
| `list-conversations` | List conversations |
| `get-conversation` | Get conversation details |
| `send-message` | Send a message to a conversation |
| `get-messages` | Get messages (poll `processing` flag) |
| `diary-logs` | Get auto-trade diary logs |
| `config` | Show or update `~/.milo/config.json` |

## Guardrails and Throttling

- `create-order` preflight validation enforces:
  - `takeProfits.length <= 5`
  - `stopLosses.length <= 5`
  - `takeProfits.length + stopLosses.length <= 8`
- Page-based commands use API pagination caps: `page <= 100`, `pageSize <= 100`.
- API throttles to account for in automation:
  - `POST /api/v1/wallets/{walletId}/orders`: `5/min`
  - `POST /api/v1/users/{userId}/positions/close-all`: `1/min`
- On `429`, respect `Retry-After` and retry only after that delay.

## Examples

```bash
# Signup (saves api_key, user_id, wallet_id to config)
./dist/milo signup \
  --wallet-address 7xKX...abc \
  --secret-key 4wBq...xyz

# After signup, user-id and wallet-id default from config
./dist/milo get-holdings
./dist/milo list-positions --status active
./dist/milo list-orders --status active --type buy
./dist/milo diary-logs --page 1 --page-size 10

# Create an order
./dist/milo create-order \
  --token-address So11111111111111111111111111111111 \
  --type buy \
  --payload-json '{"type":"buy","amount":{"type":"absolute_usd","amount":50},"trigger":{"type":"absolute","trigger":"price","operator":"lte","value":100}}'

# Auto-trade settings
./dist/milo get-settings
./dist/milo update-settings \
  --is-active true \
  --risk-tolerance balanced \
  --strategy "SWING TRADER" \
  --allocation-json '{"majors":40,"memes":20,"stables":30,"native":10}'

# Conversations with Milo AI
./dist/milo create-conversation --message "Analyze SOL price action" --agent-type market-analyst
./dist/milo get-messages --conversation-id <uuid>

# Send tokens
./dist/milo send-tokens \
  --recipient 9abc...def \
  --token So11111111111111111111111111111111 \
  --amount 1.5
```

## Development

```bash
# Run without building
npm run dev -- get-holdings

# Rebuild after changes
npm run build
```
