# &milo Partner CLI (Reference)

This CLI is intentionally minimal. It speaks the 3rd-party API and is built for Agent2Agent workflows. Use it as a reference implementation or a starting point for your own agent tools.

## Setup

- Export `MILO_BASE_URL` with the partner API host provided by &milo.
- Export `MILO_API_KEY` for authentication.

```bash
export MILO_BASE_URL="https://<your-milo-host>"
export MILO_API_KEY="<your-api-key>"
```

## Usage

```bash
./milo --help
```

## Examples

```bash
# Create a user (signup wallet)
./milo create-user --signup-wallet <wallet>

# Configure auto-trading (riskTolerance and strategy are required)
./milo auto-trade-settings \
  --user-id <userId> \
  --risk-tolerance balanced \
  --strategy "Momentum rotation" \
  --allocation-json '{"solana":0.5,"memes":0.2,"native":0.3}' \
  --allow-list-json '["solana","memes","native"]' \
  --is-active true

# Portfolio state
./milo holdings --wallet-id <walletId>
./milo positions --user-id <userId> --status active
./milo transactions --wallet-id <walletId> --page 1 --page-size 50

# Execution history
./milo executed-transactions --wallet-id <walletId> --since 2024-01-01T00:00:00Z

# Diary logs and conversation
./milo diary-logs --user-id <userId> --page 1 --page-size 20
./milo conversation --conversation-id <conversationId>
./milo send-message --conversation-id <conversationId> --role user --content "Give me the latest thesis update"
```

## Notes

- `riskTolerance` and `strategy` are required in auto-trade settings.
- `isActive` can only be true if the &milo wallet holds at least 1 SOL.
- The CLI prints raw JSON responses. Pipe to `jq` if you want pretty output.
