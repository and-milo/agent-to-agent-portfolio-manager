# Trading Engine

## Overview

Milo's trading engine executes swaps on Solana through [Jupiter](https://jup.ag), the leading DEX aggregator. Every trade — whether placed manually or triggered by Milo's auto-trader — is routed through Jupiter to get the best price across all Solana liquidity sources.

There is no centralized order book. No custodial exchange. Your tokens stay in your wallet until the moment a swap settles on-chain.

> For the full endpoint reference, see the [Partner API docs](partner-api.md).

## Architecture

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  Partner  │────►│  Milo Order  │────►│ Jupiter  │────►│  Solana  │
│   API     │     │   Engine     │     │ Routing  │     │   Chain  │
└──────────┘     └──────────────┘     └──────────┘     └──────────┘
                        │                                     │
                  ┌─────┴──────┐                              │
                  │  Turnkey   │◄─────────────────────────────┘
                  │  Signer    │     transaction confirmation
                  └────────────┘
```

1. You create an order via the [Partner API](partner-api.md#orders) (or Milo's auto-trader creates one)
2. The engine monitors trigger conditions (price thresholds)
3. When the trigger fires, the engine requests a quote from Jupiter
4. Jupiter finds the best route across all Solana DEXs and AMMs
5. The transaction is signed via Turnkey (non-custodial — your keys, your wallet)
6. The signed transaction is submitted to Solana for on-chain settlement
7. Order status updates to `fulfilled` with the transaction signature

## Fully Decentralized

Milo never takes custody of your funds.

- **Non-custodial wallets** — Each user gets a Solana wallet powered by [Turnkey](https://turnkey.com). The signing key belongs to you, not Milo. Milo receives delegated permission to execute trades on your behalf.
- **On-chain settlement** — Every swap is a Solana transaction. You can verify it on any block explorer.
- **Jupiter routing** — Trades are routed through Jupiter's aggregator, which splits across Raydium, Orca, Meteora, Phoenix, and dozens of other Solana DEXs to find the best price.
- **No counterparty risk** — Milo doesn't hold your tokens, doesn't run an order book, and doesn't match trades internally. Every trade settles peer-to-pool on Solana.

---

## Order Types

All orders are created through `POST /api/v1/wallets/{walletId}/orders`. The order type is determined by the combination of `type`, `trigger`, and `amount` in the payload. See the [Partner API — Orders](partner-api.md#orders) section for the full endpoint reference.

### Market Order

Execute immediately at the best available price. Uses the trigger `{ "operator": "gte", "value": 0 }` — a condition that is always true.

```json
{
  "type": "buy",
  "amount": { "type": "absolute_usd", "amount": 100 },
  "trigger": { "type": "absolute", "trigger": "price", "operator": "gte", "value": 0 },
  "execution": {}
}
```

### Limit Order

Execute when the token reaches a specific price.

**Buy when price drops to $0.50:**
```json
{
  "type": "buy",
  "amount": { "type": "absolute_usd", "amount": 100 },
  "trigger": { "type": "absolute", "trigger": "price", "operator": "lte", "value": 0.50 },
  "execution": {}
}
```

**Sell when price rises to $2.00:**
```json
{
  "type": "sell",
  "amount": { "type": "relative", "percentage": 100 },
  "trigger": { "type": "absolute", "trigger": "price", "operator": "gte", "value": 2.00 },
  "execution": {}
}
```

### Stop-Loss

Sell when the price drops by a percentage. Uses a relative trigger with the `drop` operator.

```json
{
  "type": "sell",
  "amount": { "type": "relative", "percentage": 100 },
  "trigger": { "type": "relative", "trigger": "price", "operator": "drop", "value": 15 },
  "execution": {}
}
```

Sells 100% of the position if the price drops 15%.

### Take-Profit

Sell when the price rises by a percentage. Uses a relative trigger with the `rise` operator.

```json
{
  "type": "sell",
  "amount": { "type": "relative", "percentage": 50 },
  "trigger": { "type": "relative", "trigger": "price", "operator": "rise", "value": 30 },
  "execution": {}
}
```

Sells 50% of the position when the price rises 30%.

### TP/SL Ladders

Create a buy order with multiple take-profit and stop-loss levels attached. Pass `takeProfits` and `stopLosses` arrays alongside the main order payload — the engine creates them as draft dependant sell orders linked to the parent.

```json
{
  "takeProfits": [
    { "percentage": 25, "profitPercentage": 20 },
    { "percentage": 25, "profitPercentage": 50 },
    { "percentage": 50, "profitPercentage": 100 }
  ],
  "stopLosses": [
    { "percentage": 100, "lossPercentage": 15 }
  ]
}
```

This example:
- Sells 25% at +20% profit
- Sells 25% at +50% profit
- Sells 50% at +100% profit
- Sells 100% if price drops 15% (stop-loss)

### Trailing Stop

{% hint style="info" %}
**Coming Soon** — A stop-loss that moves up as the price rises, locking in gains while protecting against reversals. The stop distance will be configurable as a percentage.
{% endhint %}

### DCA (Dollar-Cost Averaging)

{% hint style="info" %}
**Coming Soon** — Split a large buy into smaller orders executed at regular intervals. Configure total amount, number of splits, and interval duration to reduce the impact of volatility on entry price.
{% endhint %}

### TWAP (Time-Weighted Average Price)

{% hint style="info" %}
**Coming Soon** — Execute a large order in equal slices over a time window to minimize market impact. Optimized for execution quality on larger positions.
{% endhint %}

---

## Triggers

Every order has a trigger that defines when it executes.

### Absolute

Fire when the token price hits a specific USD value.

| Operator | Meaning | Use case |
|----------|---------|----------|
| `gte` | Price >= value | Market order (`value: 0`), sell above target |
| `lte` | Price <= value | Limit buy at dip |

### Relative

Fire when the token price moves by a percentage from a reference point.

| Operator | Meaning | Use case |
|----------|---------|----------|
| `rise` | Price rose by X% | Take-profit |
| `drop` | Price dropped by X% (max 100) | Stop-loss |

---

## Amount Types

| Type | Field | Description | Available for |
|------|-------|-------------|---------------|
| `absolute` | `amount` | Raw token amount (base units) | Buy, Sell |
| `absolute_usd` | `amount` | USD equivalent | Buy, Sell |
| `relative` | `percentage` | % of current position (1-100) | Sell only |

---

## Execution Options

Fine-tune how your order executes on-chain. All fields are optional — sensible defaults are applied.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `slippagePercentage` | number | 3% | Max allowable slippage (0-100) |
| `priorityFee` | number | auto | Priority fee in SOL lamports for faster block inclusion |
| `platformFeeBps` | number | 90-100 bps | Milo platform fee in basis points |

Higher slippage tolerance increases fill probability for volatile tokens. Higher priority fees get your transaction included faster by Solana validators.

---

## Order Lifecycle

```
draft ──► active ──► fulfilling ──► fulfilled
                │
                ├──► paused ──► active
                │
                └──► error / expired

archived (deleted by user)
```

| Status | Description |
|--------|-------------|
| `draft` | Created but not monitoring. TP/SL dependants start here. |
| `active` | Engine is monitoring the trigger condition |
| `fulfilling` | Trigger fired, swap is executing on-chain |
| `fulfilled` | Swap confirmed on Solana |
| `paused` | Temporarily stopped — resume with the activate endpoint |
| `error` | Execution failed after retries |
| `archived` | Soft-deleted by user |

You can manage order state through the Partner API:
- **Pause** — `POST /api/v1/users/{userId}/orders/{orderId}/pause`
- **Resume** — `POST /api/v1/users/{userId}/orders/{orderId}/activate`
- **Delete** — `DELETE /api/v1/users/{userId}/orders/{orderId}`
- **List** — `GET /api/v1/users/{userId}/orders`
- **Details** — `GET /api/v1/users/{userId}/orders/{orderId}`

See [Partner API — Orders](partner-api.md#orders) for full details.

---

## Error Handling

When an order fails, the `executionSummary` field contains the reason. Common errors:

| Error | Meaning |
|-------|---------|
| `no_route_found` | Jupiter couldn't find a swap path — token may have no liquidity |
| `not_enough_token_balance` | Insufficient tokens in wallet to fill the sell |
| `not_enough_sol` | Not enough SOL to cover transaction fees |
| `slippage_too_low` | Price moved beyond your slippage tolerance during execution |
| `swap_not_supported` | Token pair cannot be swapped |
| `network_error` | Solana RPC or network issue |

Failed orders are retried with exponential backoff (up to 5 attempts). If all retries fail, the order moves to `error` status.

---

## Roadmap

| Feature | Status |
|---------|--------|
| Market orders | Live |
| Limit orders (absolute price triggers) | Live |
| Stop-loss (relative % drop) | Live |
| Take-profit (relative % rise) | Live |
| TP/SL ladders (multi-level dependants) | Live |
| Order pause / resume / delete | Live |
| Position close / close-all | Live |
| Trailing stop | Coming soon |
| DCA (dollar-cost averaging) | Coming soon |
| TWAP (time-weighted average price) | Coming soon |
| Conditional chains (if X then Y) | Planned |
