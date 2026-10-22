# Milo Partner API CLI

TypeScript CLI for the Milo Partner API. Zero runtime dependencies, single-file bundle via tsup.

Transaction signatures are opaque and may identify legacy, v0, or v1 Solana transactions. The CLI stores and forwards them unchanged.

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
`POST /mcp` initialize accepts optional `X-API-Key` or an OAuth 2.1 bearer token (`Authorization: Bearer mat_…`; discovery at `/.well-known/oauth-authorization-server`, consent with your Solana wallet). Without either, MCP is limited to signup/public tools and `tools/list` until `signup` returns an API key or the first protected `tools/call` (anything beyond the public signup tools) triggers the OAuth `401` challenge. The CLI itself keeps using API keys. The key `signup` returns is bound to that MCP session only: clients that open a new session per tool call must send it as `X-API-Key` on every request. Throttling and session-capacity protections are enforced (authenticated callers get a larger initialize allowance than anonymous per-IP sessions), so initialize can return `429`. Respect `Retry-After` before retrying and re-initialize after invalid-session errors.  
MCP tools are annotated read-only vs destructive: money-moving/irreversible tools, state-replacing tools (`sync_strategy`, `update_strategy`, `pause_order`) and the conversation writes (`create_conversation`, `send_message` — the agent can update autotrade settings or close positions when asked, after the user approves its `approvalRequest`) carry `destructiveHint: true` and a ⚠️ warning in the description; only signup, `create_strategy` and `claim_quest` are additive writes. The matching CLI commands (`pause-order`, `update-strategy`, `sync-strategy`, `create-conversation`, `send-message`) carry the same ⚠️ in their help text — confirm before running them; see `docs/mcp.md`.  
This CLI continues to use the REST endpoints directly.

Research endpoints (`GET /api/v1/research/*`, API key or OAuth bearer, no user id) are available over REST, as synchronous MCP tools (`get_stock_research_digest`, `get_insider_transactions`, `get_recent_insider_buys`, `get_congress_trades`, `get_8k_events`) and as the CLI commands under "Stock research" below.

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
| `signal-feeds` | List registered catalyst signal feeds (rollout stage + gates) |
| `decisions` | Decision ledger incl. shadow/gated decisions that never traded |
| `close-position` | Close a position |
| `close-all-positions` | Close all positions |
| `create-order` | Create a buy/sell order with optional TP/SL |
| `list-orders` | List orders with filters |
| `get-order` | Get order details |
| `pause-order` | ⚠️ Pause an active order (pausing a stop-loss/take-profit leaves the position unprotected) |
| `activate-order` | Activate a draft/paused order |
| `delete-order` | Archive an order |
| `send-tokens` | Send tokens from your Milo wallet |
| `get-settings` | Get auto-trade configuration (`--trading-account-id` for a non-default account) |
| `update-settings` | Update auto-trade configuration (`--trading-account-id` for a non-default account) |
| `list-strategies` | List autotrade strategies |
| `get-strategy` | Get strategy details |
| `create-strategy` | Create a strategy (`--source-family` opts it into a signal feed; see `signal-feeds`) |
| `update-strategy` | ⚠️ Update a strategy (passed fields overwrite saved values; affects a linked live account once re-synced; `--source-family null` opts out of a feed) |
| `delete-strategy` | Delete a strategy |
| `sync-strategy` | ⚠️ Re-sync settings with a linked strategy (replaces the live account's allocation/instructions) |
| `deploy-arena` | Deploy a public strategy to the arena (`--funding-amount-sol`, min 1, default 1) |
| `withdraw-arena` | Withdraw from the arena (transfers holdings back) |
| `arena-leaderboard` | Get the arena leaderboard |
| `list-quests` | List quests with progress and bones rewards (defaults to unlocked) |
| `claim-quest` | Claim bones (reward points) for a completed quest |
| `bones-balance` | Get your bones (reward points) balance |
| `create-conversation` | ⚠️ Start a conversation with Milo AI (the auto-trader agent may change settings / close positions when asked) |
| `list-conversations` | List conversations |
| `get-conversation` | Get conversation details |
| `send-message` | ⚠️ Send a message to a conversation (the auto-trader agent may change settings / close positions when asked); `--approve` / `--reject <approvalId>` decides a pending approval request |
| `get-messages` | Get messages (poll `processing` flag); approval requests on the page (id, expiry, status, summaries) are also printed to stderr |
| `diary-logs` | Get auto-trade diary logs |
| `config` | Show or update `~/.milo/config.json` |

`signal-feeds`, `decisions` and `diary-logs` only show partner-visible signal feeds: decisions and diary entries from internal feeds are excluded from both the items and the totals.

### Stock research (API key, no user id)

The CLI authenticates with an API key (`--api-key` / `MILO_API_KEY`, sent as `X-API-Key`). The underlying REST routes and MCP tools also accept an OAuth bearer, but the CLI does not send one.

| Command | Description |
|---------|-------------|
| `research-digest` | One-call 90-day disclosure digest for a ticker: insider Form 4 purchases, congressional trades, 8-K filings — whole-window counts/totals, top-5 notable rows, filing links |
| `insider-transactions` | SEC Form 4 insider open-market purchases for a ticker (Milo's tracked universe only — check `meta.coverage.tracked`; `meta.coverage.tickers` lists exactly which tickers are polled) |
| `insider-buys` | Notable insider purchases across Milo's tracked universe, optionally above `--min-value-usd` |
| `congress-trades` | Congressional PTR disclosures for a ticker, or market-wide when `--ticker` is omitted |
| `8k-events` | SEC 8-K material-event filings for a ticker with item codes and titles |
| `analyst-consensus` | *(optional, licensed)* Analyst rating mix, price targets, recent grade actions |
| `fundamentals` | *(optional, licensed)* Quarterly revenue / net income / free cash flow (12 quarters) |
| `earnings-timeline` | *(optional, licensed)* Next scheduled report + up to 8 reported quarters with surprise % |
| `stock-news` | *(optional, licensed)* Recent news with per-article sentiment (`--limit` max 12) |
| `peers` | *(optional, licensed)* The company + up to 5 peers by market cap with TTM multiples/margins |

The five *optional, licensed* commands are FMP-derived and only work against a server running with `MCP_LICENSED_RESEARCH_TOOLS=true` — otherwise they return `404 not_found`. On an enabled server: `503 service_unavailable` means `FMP_API_KEY` is missing, `503 provider_unavailable` means the upstream provider failed (transient — retry shortly), and `404 not_found` means the provider answered and has no data for that ticker. Every `503` on a research route is retryable; a `404` is not an outage.

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
  - OpenAI canonical model ids are `gpt-5.6-terra` (the default), `o3`, `gpt-5.2-high`, `gpt-5.2-xh`, and `gpt-5.4`.
  - OpenAI ids are provider-neutral. Pass canonical ids to the CLI; Azure deployment names are server-managed and are rejected as model ids.
  - The Anthropic canonical model id is `claude-sonnet-5.5` (Pro and Max).
  - `claude-opus-4.5` and `claude-opus-4.6` are retired: the CLI sends `claude-sonnet-5.5` instead (and says so on stderr), which is also what the API saves if it receives a retired id.
  - Gemini canonical model ids are `gemini-3-pro` and `gemini-3.1-pro-preview`.
  - Grok canonical model ids are `grok-4.1-fast-reasoning` and `grok-4`.
- `update-settings`, `create-strategy`, `update-strategy`, and `sync-strategy` enforce `dataSources` entitlement.
  - Supported data-source keys are `fundingRates`, `openInterest`, `liquidationData`, and `macroData`.
  - Only Pro and Max can change `dataSources`, or sync a strategy that already contains them.
  - Use `--data-sources-json` for global toggles and `--asset-class-settings-json` for per-asset overrides.
  - Use `--data-sources-json null` or `--asset-class-settings-json null` on update endpoints to clear saved values.
- Some write-heavy commands are more likely to receive `429` during bursts (for example order creation, close-all positions, and conversation writes). Build retries with backoff.
- On `429`, respect `Retry-After` and retry only after that delay.
- Money-moving actions requested in a conversation (swaps, token transfers, buy/sell orders, order cancels, position closes, selecting a trading agent and changing trading-agent settings; pausing auto-trading is not gated) never run straight from a message. The agent replies with an assistant message carrying `approvalRequest` (`approvalId`, `expiresAt`, `status`, `actions[]` with `category` + human `summary`; `category` may be `unknown`, still show its `summary`) and executes only after that exact request is approved. `status` is the current state when the page is read: `pending`, `approved`, `rejected`, `expired` or `superseded`. `get-messages` prints each approval request on the page to stderr (id, expiry, status, action summaries), reading only the top-level `approvalRequest` of assistant messages (it is server-reserved: a client-sent `metadata.approvalRequest` is dropped), so stdout stays the API JSON; only if the server omits `status` does it infer one (pending only while unexpired and no later user message exists) and label it `inferred`. `status` is omitted for a moment while a new request is still being set up (it cannot be decided yet; run `get-messages` again), and a request that could not be set up reads as `superseded` or `expired`, never approvable. Decide it with `send-message --approve <approvalId>` or `--reject <approvalId>` (one of them, a UUID; `--message` then defaults to `approve` / `cancel`). Approving needs the action's scope on the key or token you use: `transfer` for category `send`, `trade` for every other category (API keys carry every scope); without it the reply names the missing permission, nothing executes and the request stays pending; a properly scoped caller must then decide it with `--approve <approvalId>` (the refusal is now the latest assistant message, so a bare text approve would cancel the request). Rejecting needs only `chat`, and the approved action runs with the intersection of the pausing and approving callers' scopes. With either flag the message text is saved as your turn but not interpreted: the decision comes only from the flag, by `approvalId`, while that request is `pending` and unexpired (whatever assistant messages came after it); an id that is no longer pending executes nothing. Prefer the flags over passing your user's words through: without them, a message whose whole text is an approve or reject phrase (for example `yes`, `ok`, `go ahead`, `no`, `stop`; full lists in `docs/api.md`) decides only the request carried by the latest assistant message, so a bare text approve only works as the reply right after the request. Sent at any other point it decides nothing and is handled as an ordinary message. Requests are bound to this user and conversation, single use, and expire after 10 minutes; any other message cancels a pending request (`status` becomes `superseded`) and nothing is executed. The outcome (executed with an order id or transaction signature, cancelled, or expired) arrives as the next assistant message. When money actions executed, that message ends with a **Receipt** block (one `Done:` / `Failed:` line per action, built from the actual tool results) that `get-messages` prints verbatim in `content`; treat it as the source of truth, and note that a **Correction:** line precedes it when the text above claims more. Only approve after your user explicitly approved the summary shown.
- Research commands validate `--ticker` (1-6 letters/digits, `.`/`-`; upper-cased), `--days` (1-365), `--limit` (1-100; `stock-news` 1-12) and `--min-value-usd` (>= 0) locally before calling the API, mirroring the server's `400 bad_request` rules.

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
  --model-version claude-sonnet-5.5 \
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
./dist/milo create-conversation --message "What are BTC funding and open interest on Hyperliquid, and the Kalshi odds for the October Fed decision?"
./dist/milo get-messages --conversation-id <uuid>

# Approve (or reject) a money action the agent paused for approval.
# The approvalId comes from approvalRequest on the assistant message.
./dist/milo send-message --conversation-id <uuid> --message "Close my JUP position"
./dist/milo get-messages --conversation-id <uuid>   # stderr: approval request id, expiry, status, summaries
./dist/milo send-message --conversation-id <uuid> --approve <approvalId>
./dist/milo send-message --conversation-id <uuid> --reject <approvalId>

# Send tokens — funded from --wallet-id (defaults to config.wallet_id).
# The named wallet is authoritative: no other wallet of yours is debited.
./dist/milo send-tokens \
  --wallet-id <uuid> \
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

# Stock research — synchronous disclosure reads (no user id needed)
./dist/milo research-digest --ticker NVDA
./dist/milo insider-transactions --ticker NVDA --days 90 --limit 50
./dist/milo insider-buys --days 30 --min-value-usd 100000
./dist/milo congress-trades                      # market-wide
./dist/milo congress-trades --ticker NVDA --days 60
./dist/milo 8k-events --ticker NVDA
# Licensed (FMP-derived) — only on servers with MCP_LICENSED_RESEARCH_TOOLS=true
./dist/milo analyst-consensus --ticker NVDA
./dist/milo earnings-timeline --ticker NVDA
./dist/milo stock-news --ticker NVDA --limit 12
```

## Development

```bash
# Run without building
npm run dev -- get-holdings

# Rebuild after changes
npm run build
```
