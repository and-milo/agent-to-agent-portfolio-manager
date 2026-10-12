# Milo MCP Setup

This guide shows how to connect Milo's MCP server in OpenAI tools and Claude.

## Endpoint

- `https://partners.andmilo.com/mcp`

## What the server exposes

- Server identity: `milo-partner-api` — title "milo — AI trading agents & stock research", website `https://andmilo.com`.
- The server's `instructions` describe Milo as both a **stock research** product (analyst consensus and rating changes, insider Form 4 buying, congressional trading disclosures, SEC 8-K events, fundamentals, earnings and estimates, peers, institutional holders, news) and an **autonomous trading-agent** product (crypto on Solana via self-custody wallets, brokered US equities via linked `stock_brokerage` accounts, public wallets plus plain-English trade diaries). The `market-analyst` conversation agent covers both equities and token research.
- Every tool has a human-readable `title` and MCP tool annotations:
  - Read-only tools (`get_*`, `list_*`) carry `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`.
  - Money-moving or irreversible tools carry `destructiveHint: true`, `idempotentHint: false`, and a leading `⚠️ Moves funds:` / `⚠️ Irreversible:` warning in their description: `close_position`, `close_all_positions`, `create_order`, `activate_order`, `delete_order`, `send_tokens`, `update_autotrade_settings`, `update_account_autotrade_settings`, `delete_strategy`, `deploy_arena_strategy`, `withdraw_arena_strategy`.
  - State-replacing tools are ALSO `destructiveHint: true` (MCP reserves `destructiveHint: false` for additive updates), with a leading `⚠️ Replaces live state:` warning: `sync_strategy` (re-applies a strategy's allocation/instructions onto the live account's autotrade settings while trading stays active — under OAuth it needs the `trade` scope, see Scopes below), `update_strategy` (every passed field overwrites the saved value, no merge) and `pause_order` (pausing a stop-loss/take-profit leaves the position unprotected).
  - Conversation writes `create_conversation` and `send_message` are `destructiveHint: true` with a leading `⚠️ May trigger trades:` warning: the agent that answers can act on the message — the auto-trader agent can update autotrade settings and close positions — so a message requesting a trading action is equivalent to calling the destructive trading tools. Confirm with the user before sending such a message.
  - The remaining tools (`prepare_signup_message`, `signup`, `create_strategy`, `claim_quest`) are additive, non-destructive writes (`readOnlyHint: false`, `destructiveHint: false`).
- Tool names and input schemas are unchanged by the annotations. Clients should put `destructiveHint: true` tools behind a user confirmation.
- **Synchronous stock research tools** (no conversation polling): `get_stock_research_digest` (one-call 90-day digest), `get_insider_transactions` (SEC Form 4 insider open-market purchases for a ticker), `get_recent_insider_buys` (notable purchases across Milo's tracked universe), `get_congress_trades` (congressional PTR disclosures, per ticker or market-wide), `get_8k_events` (SEC 8-K filings with item codes and titles). They are market-level reads — any credential (API key or OAuth bearer, no scope needed) but no userId/walletId — annotated `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`. Tickers are validated (1-6 chars, upper-cased), `days`/`limit` are clamped (365/100) rather than rejected, and every result returns a one-line text summary, the same JSON serialized as a second text block (MCP-spec backwards compatibility for clients that ignore `structuredContent`), and `structuredContent` with `meta.source` (data source + freshness) and `meta.coverage` where relevant. Form 4 coverage is limited to Milo's tracked US-equity universe (in production the S&P 500 plus its tokenized names; `meta.coverage.tickers` is authoritative) (purchases only) — the tools say so.
- **Licensed research tools** (`get_analyst_consensus`, `get_stock_fundamentals`, `get_earnings_timeline`, `get_stock_news`, `get_peer_comparison`, all FMP-derived) exist but are registered only when the server runs with `MCP_LICENSED_RESEARCH_TOOLS=true` (default off — redistributing FMP data through third-party assistants needs a licensing decision). The matching `/api/v1/research/*` routes follow the same flag.
- Research tools never surface raw errors: API errors map to the API's message, anything else to a generic "temporarily unavailable" line. On the licensed tools a provider outage surfaces as the API's `503 provider_unavailable` message ("temporarily unavailable … retry shortly") — distinct from `404` "no … found for TICKER", which means the provider answered and has no data. Retry the former; do not retry the latter.
- Legal & support links are included in the instructions: `https://andmilo.com/privacy-policy`, `https://andmilo.com/terms-and-conditions`, `https://docs.andmilo.com`.

## Authentication: API key or OAuth 2.1

The MCP endpoint accepts two credentials:

| Credential | Header | Who uses it | Scopes |
|---|---|---|---|
| Partner API key | `X-API-Key: sk_live_…` | scripts, the stdio server, existing integrations | all tools, `userId` required as before |
| OAuth 2.1 access token | `Authorization: Bearer mat_…` | Claude (Desktop/web/Code), ChatGPT, MCP Inspector, any client implementing the MCP authorization spec | only the tools the granted scopes cover; `userId` defaults to the signed-in user |

partner-api is both the **authorization server** and the **resource server** (issuer = `https://partners.andmilo.com`, resource = `https://partners.andmilo.com/mcp`). Discovery:

- `GET /.well-known/oauth-authorization-server` — RFC 8414 (`code_challenge_methods_supported: ["S256"]`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`)
- `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp` — RFC 9728

Endpoints: `POST /oauth/register` (RFC 7591 dynamic client registration), `GET /oauth/authorize` (PKCE S256 only, exact `redirect_uri` match — loopback `http://localhost/…` / `http://127.0.0.1/…` match on any port), `GET /oauth/consent?rid=…` (server-rendered consent page: sign a message with the Solana wallet linked to your milo account, or a reviewer username/password), `POST /oauth/token` (`application/x-www-form-urlencoded`; `authorization_code` + `refresh_token`; client auth `none`, `client_secret_basic`, `client_secret_post`, `private_key_jwt`), `POST /oauth/revoke` (RFC 7009). Clients may also identify themselves with a **Client ID Metadata Document** (an https URL as `client_id`, e.g. `https://claude.ai/oauth/claude-code-client-metadata` or `https://chatgpt.com/oauth/client.json`) instead of registering. Every authorization response carries `iss` (RFC 9207) and `state`.

Scopes (`scopes_supported`): `profile` (get_me, list_trading_accounts), `portfolio:read` (holdings, positions, orders, autotrade settings, strategies, arena leaderboard, quests, bones), `chat` (conversation tools), `strategies:write` (create/update strategy templates, pause_order, claim_quest), `offline_access` (refresh tokens). The synchronous research tools need any credential and no scope. The money-moving scopes `trade` (create/activate/delete order, close positions, autotrade settings writes, `sync_strategy` — it re-applies a strategy onto the live account — delete strategy, arena deploy/withdraw) and `transfer` (send_tokens) are **not** advertised and are only grantable to pre-approved clients — directory listings (Claude, ChatGPT) never receive them. Tools outside the granted scopes are absent from `tools/list`; calling one returns `403` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="<granted + needed>"` so a client can step up.

Scopes also bound what the **conversation agents** may do on an OAuth caller's behalf: a `chat` token can start and continue conversations, but the agent's order, swap, position-close and stock-brokerage order tools are disabled unless the token also carries `trade`, its send-tokens tool unless it carries `transfer`, and its strategy create/edit/publish tools unless it carries `strategies:write`. The agent simply does not have those tools; it cannot be talked into moving funds. API-key callers are unrestricted, as before.

Lazy auth: `initialize` and `tools/list` work without a credential. The first call to a protected tool without one returns `401` (the signup tools `prepare_signup_message` / `signup` stay callable anonymously) with
`WWW-Authenticate: Bearer error="invalid_token", error_description="Authentication required", resource_metadata="https://partners.andmilo.com/.well-known/oauth-protected-resource/mcp", scope="profile portfolio:read chat strategies:write offline_access"`
— exactly what Claude/ChatGPT use to show their Connect card. A session that was opened anonymously is upgraded in place when the token arrives; once bound to a user it requires that user's token on every request. Tokens: access 1 h, refresh 30 days rotated on every use (reuse of a rotated refresh token revokes the whole connection), authorization codes single-use for 5 minutes. `Origin` is validated on `/mcp` (missing Origin = server-to-server, allowed).

The same bearer token works on the REST API: `Authorization: Bearer mat_…` is accepted wherever `X-API-Key` is, scope-checked per route (see `docs/api.md`).

## OpenAI (Codex)

### Option A: Codex CLI (official)

```bash
codex mcp add milo --url https://partners.andmilo.com/mcp
codex mcp list
```

You can also configure it in `~/.codex/config.toml`:

```toml
[mcp_servers.milo]
url = "https://partners.andmilo.com/mcp"
```

### Option B: Workspace JSON config (used by this repo setup)

Use `.mcp.json`:

```json
{
  "mcpServers": {
    "milo": {
      "type": "http",
      "url": "https://partners.andmilo.com/mcp"
    }
  }
}
```

## Claude Desktop

Add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "milo": {
      "type": "http",
      "url": "https://partners.andmilo.com/mcp"
    }
  }
}
```

Common macOS path:

- `~/Library/Application Support/Claude/claude_desktop_config.json`

## Auth Notes

- MCP `POST /mcp` initialize can start without `X-API-Key` for signup bootstrap, or without any credential for the OAuth lazy-auth flow (the first protected `tools/call` then returns the `401` challenge above).
- After signup, use returned API key for authenticated tools. OAuth clients present `Authorization: Bearer mat_…` on every request instead.
- With OAuth, `userId` arguments are optional (they default to the signed-in user; a different value is refused). With an API key they are required as before.
- Initialize is subject to throttling and session-capacity protections, so clients should handle `429` and respect `Retry-After` before retrying. Authenticated initialize (API key / OAuth grant) has a much larger allowance than anonymous per-IP initialize; clients that open a new session per tool call should send `X-API-Key` on every request.
- Sessions can expire after idle periods or under load; re-initialize after invalid-session errors.
- Conversation write overage supports x402-style payment flow (`402 Payment Required` challenge + payment proof on retry).

## Quick Verify

1. Start a new MCP session (Claude Desktop/Claude.ai custom connector, Claude Code `claude mcp add --transport http milo https://partners.andmilo.com/mcp`, ChatGPT developer mode or MCP Inspector all discover the OAuth server automatically; approve on the consent page with your Solana wallet).
2. Call `get_me` (if already authenticated) or run signup flow tools first.
3. Call `list_conversations` or `get_holdings` to confirm tool access.
4. Call `get_stock_research_digest` with `{ "ticker": "NVDA" }` to confirm the synchronous research tools (no userId needed).

## References

- OpenAI Codex MCP: https://platform.openai.com/docs/codex/mcp
- Claude Code MCP config: https://docs.anthropic.com/en/docs/claude-code/mcp
