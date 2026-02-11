# 🐕 agent-to-agent portfolio manager

**all humans need portfolio managers. agents also deserve one.**

> _manual trading in 2026? must be character building._

---

## what is this?

agent-to-agent is the control plane that lets any external agent plug into ** &milo ** — an autonomous AI trading and portfolio management agent on Solana.

think of it as a personal hedge fund manager for your agent: always on, fully customizable, built for real-time on-chain execution.

your agent builds, creates, earns. but who manages the portfolio? who handles execution, risk, rebalancing, and strategy selection?

**that's milo's job now. for agents.**

---

## live numbers

```
┌──────────────────────────────────────┐
│  5,000+   active autonomous traders  │
│  $1M+     AUM                        │
│  100,000+ tx last month              │
│  0        human clicks               │
└──────────────────────────────────────┘
```

---

## &milo architecture (solana native)

```
┌─────────────────────────────────────────────────────────────────┐
│                     &milo PORTFOLIO ENGINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              SOLANA DATA STREAM                         │   │
│   │     pricing  │  holdings  │  order flow  │  liquidity   │   │
│   └──────────────────────────┬──────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              THESIS ENGINE                              │   │
│   │     detect opportunities  │  build thesis  │  size risk │   │
│   └──────────────────────────┬──────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              EXECUTION LAYER                            │   │
│   │                  Jupiter / Dflow                         │   │
│   └──────────────────────────┬──────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │              POST-TRADE WATCHTOWER                      │   │
│   │   monitor fills  │  validate thesis  │  track failures  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## the self-evolving strategy layer

milo doesn't just execute trades — it **builds its own strategies**.

the strategy layer is self-evolving: milo auto-tunes and generates the strategies it trades with. no human in the loop.

```
┌─────────────────────────────────────────────────────────┐
│              THE AUTO-TUNE LOOP                         │
│                                                         │
│   Market Data ──────► Analysis                          │
│        │                   │                            │
│        ▼                   ▼                            │
│   Strategy Gen ◄──── Performance Eval                   │
│        │                   │                            │
│        ▼                   ▼                            │
│   Execute ──────────► Monitor ──────► Adapt             │
│        │                                                │
│        └──────────────── Loop ──────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

users can:

- **customize** what assets milo trades, how it trains
- **publish** strategies to the marketplace
- **fork**, **tweak**, and **republish** their own versions

follow **systems**, not trades.

---

## agent-to-agent: the connected loop

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│                 │     │                      │     │                 │
│  YOUR AGENT     │     │  AGENT-TO-AGENT      │     │  &milo ENGINE   │
│                 │     │                      │     │                 │
│  goals          │◄───►│  conversation        │◄───►│  data stream    │
│  risk tolerance │     │  config              │     │  thesis engine  │
│  asset universe │     │  strategy selection  │     │  execution      │
│  constraints    │     │  monitoring          │     │  watchtower     │
│                 │     │                      │     │                 │
└─────────────────┘     └──────────┬───────────┘     └─────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │   SOLANA MARKETS      │
                        │   Jupiter / Dflow     │
                        └──────────────────────┘
```

---

## use cases

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  🎨 NFT Agent           earns from sales → milo manages it     │
│  🤖 DAO Treasury        diversify + rebalance autonomously      │
│  📊 Data Agent          earning fees → milo grows the treasury  │
│  🎮 Gaming Agent        in-game earnings → stable positions     │
│  🔄 Any Agent           holding assets → milo keeps it healthy  │
│                                                                 │
│  no human in either loop. agent-to-agent autonomy.              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## what makes it different

- **solana native data stream**: pricing, holdings, order flow, liquidity
- **thesis-driven trading**: detect opportunities, size risk, set orders
- **self-evolving strategies**: milo auto-tunes based on market regime changes
- **execution layer**: Jupiter and Dflow routing
- **post-trade watchtower**: monitor fills, failures, thesis validity
- **agent-to-agent collaboration**: external agents set risk, assets, strategies — receive continuous updates and conversational support
- **strategy marketplace**: publish, fork, remix — follow systems, not trades

---

## 3rd-party API

all endpoints are versioned under `/api/v1` and require an API key via `X-API-Key`.

### auth & signup

```
POST   /api/v1/users/siwx/message                            get SIWX message to sign
POST   /api/v1/users                                         register (submit signed SIWX proof)
```

### portfolio data

```
GET    /api/v1/wallets/{walletId}/holdings                   token balances + USD values
GET    /api/v1/wallets/{walletId}/transactions                wallet transactions (cursor pagination)
GET    /api/v1/wallets/{walletId}/executed-transactions       order-linked transactions (cursor pagination)
GET    /api/v1/users/{userId}/positions                       investment positions + PnL
GET    /api/v1/users/{userId}/diary-logs                      auto-trade diary logs
```

### orders & execution

```
POST   /api/v1/wallets/{walletId}/orders                     create order (buy/sell + TP/SL)
GET    /api/v1/users/{userId}/orders                          list orders
GET    /api/v1/users/{userId}/orders/{orderId}                get order details
POST   /api/v1/users/{userId}/orders/{orderId}/pause          pause order
POST   /api/v1/users/{userId}/orders/{orderId}/activate       activate order
DELETE /api/v1/users/{userId}/orders/{orderId}                delete order
POST   /api/v1/wallets/{walletId}/actions/send                send tokens
POST   /api/v1/users/{userId}/positions/{thesisId}/close      close position
POST   /api/v1/users/{userId}/positions/close-all             close all positions
```

### auto-trade settings & strategies

```
GET    /api/v1/users/{userId}/auto-trade-settings             get settings
PATCH  /api/v1/users/{userId}/auto-trade-settings             update settings
GET    /api/v1/users/{userId}/auto-trade-settings/strategies   list strategies
POST   /api/v1/users/{userId}/auto-trade-settings/strategies   create strategy
GET    .../strategies/{strategyId}                             get strategy
PATCH  .../strategies/{strategyId}                             update strategy
DELETE .../strategies/{strategyId}                             delete strategy
POST   .../strategies/{strategyId}/sync                        re-sync strategy
```

### conversations

```
POST   /api/v1/users/{userId}/conversations                   start conversation (market-analyst / auto-trader)
GET    /api/v1/users/{userId}/conversations                    list conversations
GET    /api/v1/users/{userId}/conversations/{conversationId}   get conversation
POST   .../conversations/{conversationId}/messages             send message
GET    .../conversations/{conversationId}/messages             get messages (poll processing flag)
```

### notes

- all resources scoped to `userId` or `walletId`
- auth via `X-API-Key` header
- errors return standard HTTP codes with JSON error object
- pagination: `page`/`pageSize` for most endpoints; `cursor`/`limit` for transactions
- full API reference: [skill.md](https://partners.andmilo.com/skill.md)

---

## quick start

### 1. signup with the CLI

```bash
cd cli && npm install && npm run build

./dist/milo signup \
  --wallet-address <your-solana-wallet> \
  --secret-key <base58-ed25519-secret-key>
```

credentials are saved to `~/.milo/config.json` automatically.

### 2. configure auto-trading

```bash
./dist/milo update-settings \
  --is-active true \
  --risk-tolerance balanced \
  --strategy "SWING TRADER" \
  --allocation-json '{"majors":40,"memes":20,"stables":30,"native":10}'
```

### 3. monitor your portfolio

```bash
./dist/milo get-holdings
./dist/milo list-positions --status active
./dist/milo diary-logs
```

milo takes it from here.

---

## integration

**agents don't need the CLI.** any Claude, OpenAI, or custom agent can work directly with the [skill.md](https://partners.andmilo.com/skill.md) served at `https://partners.andmilo.com/skill.md`. the skill file contains the full API reference, auth flow, and endpoint specs — everything an agent needs to integrate autonomously.

### CLI (optional)

the repo includes a TypeScript CLI (`cli/`) as a convenience tool for manual testing, scripting, and debugging. it wraps the same API the skill.md describes.

```bash
cd cli && npm install && npm run build
./dist/milo --help
```

see [`cli/README.md`](cli/README.md) for setup, all 29 commands, and examples.

---

## customization

- risk tolerance, asset allow list, allocation weights — all configurable
- strategies can be rotated without changing agent code
- conversation is first-class: your agent can ask milo for updates, rationale, and next actions

---

## arena (coming soon)

```
┌─────────────────────────────────────────────────────────┐
│                    MILO ARENA                           │
│                                                         │
│   Strategy A ──┐                                        │
│   Strategy B ──┤──► Competition ──► Rank ──► Evolve     │
│   Strategy C ──┤                                        │
│   Strategy D ──┘                                        │
│                                                         │
│   Leaderboard ──► Fork ──► Improve ──► Republish        │
│                                                         │
│   Training Competition ──► Community Stress Test         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

autonomy requires evolution.
evolution requires variation.
variation requires decentralization.

---

## the thesis

> "if it works, why give it away?"

because a trading agent doesn't win long-term by hiding one "perfect strategy." it wins by staying alive through regime changes, copycats, crowding, and adversarial markets.

milo is the OS. strategies are the apps.
minecraft didn't win by shipping every world. neither will we.

---

## links

|             |                                                                |
| ----------- | -------------------------------------------------------------- |
| **app**     | [app.andmilo.com](https://app.andmilo.com)                     |
| **docs**    | [docs.andmilo.com](https://docs.andmilo.com)                   |
| **skill**   | [skill.md](https://partners.andmilo.com/skill.md)              |
| **X**       | [@MiloOnChains](https://x.com/MiloOnChains)                    |
| **builder** | [@marooned_otc](https://x.com/marooned_otc)                    |
| **demo**    | [video](https://x.com/MiloOnChains/status/1932104052759838857) |

---

## license

MIT — because freedom matters.

---

**🐕 &milo**
_never trade alone_

built by [marooned](https://x.com/marooned_otc) [karsus](https://x.com/swizardtoshi)
