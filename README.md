# 🐕 agent-to-agent portfolio manager

**all humans need portfolio managers. agents also deserve one.**

> *manual trading in 2026? must be character building.*

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

### core endpoints

```
POST   /api/v1/users
GET    /api/v1/users/{userId}/diary-logs
GET    /api/v1/wallets/{walletId}/executed-transactions
GET    /api/v1/wallets/{walletId}/holdings
GET    /api/v1/users/{userId}/positions
GET    /api/v1/wallets/{walletId}/transactions
PATCH  /api/v1/users/{userId}/auto-trade-settings
GET    /api/v1/conversations/{conversationId}
POST   /api/v1/messages
```

### agent portfolio management

```
POST   /api/v1/agent/portfolio              create managed portfolio
GET    /api/v1/agent/portfolio/status        current portfolio state
POST   /api/v1/agent/portfolio/deposit       deposit funds
POST   /api/v1/agent/portfolio/withdraw      withdraw funds
GET    /api/v1/agent/portfolio/performance   performance metrics
GET    /api/v1/agent/portfolio/risk          risk metrics
GET    /api/v1/agent/portfolio/history       full audit trail
PUT    /api/v1/agent/portfolio/strategy      change strategy
```

### strategy marketplace

```
GET    /api/v1/strategies                    list available strategies
GET    /api/v1/strategies/:id                get strategy details
POST   /api/v1/strategies/fork               fork and customize
GET    /api/v1/strategies/leaderboard        strategy rankings
```

### notes
- resources scoped to `userId` for user-specific data
- errors return standard HTTP codes with JSON error object
- pagination: `page`, `pageSize` (default 25, max 200), `sort`

---

## quick start

### 1. register your agent

```bash
curl -X POST https://api.andmilo.com/v1/agent/register \
  -H "Content-Type: application/json" \
  -d '{"agentName": "your-agent", "walletAddress": "your-solana-wallet"}'
```

### 2. create a managed portfolio

```bash
curl -X POST https://api.andmilo.com/v1/agent/portfolio \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"strategy": "atf-conservative", "riskProfile": "moderate"}'
```

### 3. deposit funds

```bash
curl -X POST https://api.andmilo.com/v1/agent/portfolio/deposit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50, "token": "SOL"}'
```

milo takes it from here.

---

## CLI

see `cli/README.md` for the reference CLI. designed for agent builders to automate provisioning, portfolio monitoring, trading oversight, and conversational support.

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

| | |
| --- | --- |
| **app** | [app.andmilo.com](https://app.andmilo.com) |
| **docs** | [docs.andmilo.com](https://docs.andmilo.com) |
| **skill** | [skill.md](skill.md) |
| **X** | [@MiloOnChains](https://x.com/MiloOnChains) |
| **builder** | [@marooned_otc](https://x.com/marooned_otc) |
| **demo** | [video](https://x.com/MiloOnChains/status/1932104052759838857) |

---

## license

MIT — because freedom matters.

---

**🐕 &milo**
*never trade alone*

built by [marooned](https://x.com/marooned_otc)
