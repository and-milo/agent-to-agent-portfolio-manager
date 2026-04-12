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
`POST /mcp` initialize accepts optional `X-API-Key`; without it, MCP is limited to signup/public tools until `signup` returns an API key. Throttling and session-capacity protections are enforced, so initialize can return `429`. Respect `Retry-After` before retrying and re-initialize after invalid-session errors.  
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
| `me` | Get current user profile and wallets for the authenticated API key |
| `get-holdings` | Get token holdings for a wallet |
| `transactions` | List wallet transactions |
| `executed-transactions` | Get executed (order-linked) transactions |
| `list-positions` | List investment positions with PnL |
| `close-position` | Close a position |
| `close-all-positions` | Close all positions |
| `create-order` | Create a buy/sell order with optional TP/SL |
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
| `deploy-arena` | Deploy a public strategy to the arena |
| `withdraw-arena` | Withdraw from the arena (transfers holdings back) |
| `arena-leaderboard` | Get the arena leaderboard |
| `list-quests` | List quests with progress and bones rewards (defaults to unlocked) |
| `claim-quest` | Claim bones (reward points) for a completed quest |
| `bones-balance` | Get your bones (reward points) balance |
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
- Public and authenticated endpoints are throttled by route and request context. Respect `Retry-After` on `429`.
- For wallet-scoped write endpoints, if a JSON body includes `walletId`, it must match the `{walletId}` path parameter.
- Market orders require `--expires-at`, and that timestamp must be within 120 minutes of the request time.
- Schema validation failures return `400 bad_request` and may include `error.details.validationIssues[]` entries with `{ target, path, code, message }`.
- `update-settings --model-version ...` requires model access.
  - Only canonical public ids are accepted on the partner surface.
  - Unsupported or unavailable model selection returns `400 Bad Request`.
  - If the model is outside the account tier, the error includes `error.details.requiredPlan`, `error.details.upgradeUrl`, and the same plan-specific Stripe link in the error message.
  - Use `--model-version null` to clear preferred model.
  - OpenAI canonical model ids are `o3`, `gpt-5.2-high`, `gpt-5.2-xh`, and `gpt-5.4`.
  - Anthropic canonical model ids are `claude-opus-4.5` and `claude-opus-4.6`.
  - Gemini canonical model ids are `gemini-3-pro` and `gemini-3.1-pro-preview`.
  - Grok canonical model ids are `grok-4.1-fast-reasoning` and `grok-4`.
- `update-settings`, `create-strategy`, `update-strategy`, and `sync-strategy` enforce `dataSources` entitlement.
  - Supported data-source keys are `fundingRates`, `openInterest`, `liquidationData`, and `macroData`.
  - Only Pro and Max can change `dataSources`, or sync a strategy that already contains them.
  - Use `--data-sources-json` for global toggles and `--asset-class-settings-json` for per-asset overrides.
  - Use `--data-sources-json null` or `--asset-class-settings-json null` on update endpoints to clear saved values.
- Some write-heavy commands are more likely to receive `429` during bursts (for example order creation, close-all positions, and conversation writes). Build retries with backoff.
- On `429`, respect `Retry-After` and retry only after that delay.

## Examples

```bash
# Signup (saves api_key, user_id, wallet_id to config)
./dist/milo signup \
  --wallet-address 7xKX...abc \
  --secret-key 4wBq...xyz

# Look up your user ID and wallet IDs from your API key
./dist/milo me

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
  --model-version claude-opus-4.5 \
  --allocation-json '{"majors":40,"memes":20,"stables":30,"native":10}'

# Add paid data-source settings with per-asset overrides
./dist/milo update-settings \
  --data-sources-json '{"fundingRates":true,"openInterest":true}' \
  --asset-class-settings-json '{"memes":{"dataSources":{"liquidationData":true}},"majors":{"dataSources":{"macroData":true}}}'

# Clear preferred model (revert to entitlement-based/default resolution)
./dist/milo update-settings --model-version null

# Clear saved data-source settings
./dist/milo update-settings --data-sources-json null

# Conversations with Milo AI
./dist/milo create-conversation --message "Analyze SOL price action" --agent-type market-analyst
./dist/milo get-messages --conversation-id <uuid>

# Send tokens
./dist/milo send-tokens \
  --recipient 9abc...def \
  --token So11111111111111111111111111111111 \
  --amount 1.5

# Arena — deploy a strategy, view leaderboard, withdraw
./dist/milo deploy-arena --strategy-id <uuid>
./dist/milo arena-leaderboard --timeframe 30d --sort-key pnl --sort-direction desc
./dist/milo withdraw-arena --strategy-id <uuid>
# winRate sort uses token-PnL win rate: profitable tokens / tracked tokens * 100 (USDC excluded)

# Quests & Bones — fetch open quests (unlocked by default), claim bones, view balance
./dist/milo list-quests
./dist/milo list-quests --unclaimed true
./dist/milo claim-quest --quest-id <uuid>
./dist/milo bones-balance
```

## Development

```bash
# Run without building
npm run dev -- get-holdings

# Rebuild after changes
npm run build
```
