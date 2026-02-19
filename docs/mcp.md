# Milo MCP Setup

This guide shows how to connect Milo's MCP server in OpenAI tools and Claude.

## Endpoint

- `https://partners.andmilo.com/mcp`

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

- MCP `POST /mcp` initialize can start without `X-API-Key` for signup bootstrap.
- After signup, use returned API key for authenticated tools.
- Conversation write overage supports x402-style payment flow (`402 Payment Required` challenge + payment proof on retry).

## Quick Verify

1. Start a new MCP session.
2. Call `get_me` (if already authenticated) or run signup flow tools first.
3. Call `list_conversations` or `get_holdings` to confirm tool access.

## References

- OpenAI Codex MCP: https://platform.openai.com/docs/codex/mcp
- Claude Code MCP config: https://docs.anthropic.com/en/docs/claude-code/mcp
