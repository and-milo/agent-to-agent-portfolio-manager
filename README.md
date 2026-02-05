# Agent2Agent Portfolio Manager for &milo

Agent2Agent is the control plane that lets any external agent plug into &milo, an AI portfolio manager on Solana. Think of it as a personal hedge fund manager for your agent: always on, fully customizable, and built for real-time on-chain execution.

This repo is a marketing and partner kit. It explains the architecture, shows how Agent2Agent connects to &milo, and ships a reference CLI for API partners.

## &milo Architecture (Solana Native)

+------------------------------------------------------------------+
|                        &milo Portfolio Engine                     |
+-----------------------------+------------------------------------+
| 1) Solana Data Stream       | pricing | holdings | order flow     |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
| Thesis Engine                                                      |
| - detect opportunities                                             |
| - build thesis and size risk                                       |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
| Execution Layer: Jupiter / Dflow                                   |
+-----------------------------+------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
| Post-Trade Watchtower                                              |
| - monitor fills and failures                                       |
| - validate thesis over time                                        |
+------------------------------------------------------------------+

## Agent2Agent Architecture

+------------------------+       +---------------------------+       +---------------------+
| External Agent         | <-->  | Agent2Agent CLI / API      | <-->  | &milo Portfolio Mgr |
| (OpenClaw, custom)     |       | risk, strategy, updates    |       | thesis and execution|
+------------------------+       +---------------------------+       +---------------------+

## The Connected Loop

+---------------------+        +-------------------------+        +---------------------+
| External Agent      | <----> | Agent2Agent             | <----> | &milo Engine        |
| goals and risk      |        | conversation and config |        | data and execution  |
+---------------------+        +-------------------------+        +---------------------+
                                                                  |
                                                                  v
                                                          +-----------------+
                                                          | Solana Markets  |
                                                          | Jupiter / Dflow |
                                                          +-----------------+

## What Makes It Different

- Solana native data stream: pricing, holdings, order flow, liquidity.
- Thesis-driven trading: detect opportunities, size risk, and set orders.
- Execution layer: Jupiter and Dflow routing.
- Post-trade watchtower: monitor fills, failures, and thesis validity.
- Agent2Agent collaboration: external agents set risk tolerance, asset universe, and strategies, then receive continuous updates and conversational support.

## 3rd-Party API Snapshot

- All endpoints are versioned under `/api/v1` and require an API key via `X-API-Key`.
- Resources are scoped to `userId` for user-specific data.
- Errors return standard HTTP codes with a JSON error object.
- Pagination supports `page`, `pageSize` (default 25, max 200), and `sort`.

### Core Endpoints

- POST `/api/v1/users`
- GET `/api/v1/users/{userId}/diary-logs`
- GET `/api/v1/wallets/{walletId}/executed-transactions`
- GET `/api/v1/wallets/{walletId}/holdings`
- GET `/api/v1/users/{userId}/positions`
- GET `/api/v1/wallets/{walletId}/transactions`
- PATCH `/api/v1/users/{userId}/auto-trade-settings`
- GET `/api/v1/conversations/{conversationId}`
- POST `/api/v1/messages`

## CLI

See `cli/README.md` for the reference CLI that calls the API. It is designed to help agent builders automate provisioning, portfolio monitoring, trading oversight, and conversational support.

## Customization

- Risk tolerance, asset allow list, and allocation weights are configurable.
- Strategies can be rotated without changing your agent code.
- Conversation is first-class: your agent can ask &milo for updates, rationale, and next actions.
