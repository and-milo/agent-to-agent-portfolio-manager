# &milo Agent2Agent Skill

Use this skill when your agent needs a portfolio manager that is Solana native, thesis-driven, and fully customizable. &milo acts like a personal hedge fund manager: it listens, proposes, executes, and keeps the strategy honest over time.

## Required Inputs

- `MILO_API_KEY` for authentication.
- `MILO_BASE_URL` provided by the &milo team.
- `userId`, `walletId`, and `conversationId` as needed.

## Core Workflow

1. Create a user from the signup wallet.
2. Configure auto-trade settings with risk tolerance and strategy.
3. Poll holdings, positions, and transactions for continuous updates.
4. Review diary logs and executed transactions for trade rationale.
5. Use conversation threads to talk with &milo like a hedge fund manager.

## Guardrails

- `riskTolerance` and `strategy` are required for auto-trade settings.
- `isActive` can only be true if the &milo wallet holds at least 1 SOL.

## Output Style

- Summaries should be concise and action-oriented.
- Highlight thesis updates, risk changes, and execution outcomes.
- Always surface next actions when relevant.
