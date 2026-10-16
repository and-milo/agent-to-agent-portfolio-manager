import crypto from 'node:crypto';
import type { ConversationOverageAsset, PartnerApiClient } from './client.js';
import type { MiloConfig } from './config.js';
import { saveConfig } from './config.js';
import { base58Decode, base58Encode } from './base58.js';

// ── Types ─────────────────────────────────────────────────────────

export interface FlagDef {
  name: string;
  description: string;
  required?: boolean;
}

export interface CommandDef {
  name: string;
  description: string;
  flags: FlagDef[];
  handler: (
    flags: Record<string, string | undefined>,
    client: PartnerApiClient,
    config: MiloConfig,
  ) => Promise<unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────

function requireFlag(flags: Record<string, string | undefined>, name: string, configFallback?: string): string {
  const val = flags[name] ?? configFallback;
  if (!val) throw new Error(`Missing required flag --${name}`);
  return val;
}

function parseJson(value: string | undefined, name: string): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON for --${name}: ${value}`);
  }
}

const SOLANA_MAINNET_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const MAX_PAGE_VALUE = 100;
const MAX_PAGE_SIZE_VALUE = 100;
const MAX_TAKE_PROFITS = 5;
const MAX_STOP_LOSSES = 5;
const MAX_TOTAL_DEPENDANTS = 8;
// Public model ids are provider-neutral. Azure deployment names remain
// server-side runtime configuration and must never be added to this list.
export const PARTNER_CANONICAL_MODEL_VERSIONS = [
  'o3',
  'gemini-3-pro',
  'gemini-3.1-pro-preview',
  'gpt-5.2-high',
  'gpt-5.2-xh',
  'gpt-5.4',
  'gpt-5.6-terra',
  'grok-4.1-fast-reasoning',
  'grok-4',
  'claude-opus-4.5',
  'claude-opus-4.6',
] as const;
const PARTNER_CANONICAL_MODEL_VERSION_SET = new Set<string>(
  PARTNER_CANONICAL_MODEL_VERSIONS,
);

function parseOptionalJsonArray(value: unknown, flagName: string): unknown[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`--${flagName} must be a JSON array`);
  }
  return value;
}

export function validateCreateOrderDependants(
  takeProfits: unknown,
  stopLosses: unknown,
): void {
  const tp = parseOptionalJsonArray(takeProfits, 'take-profits-json') ?? [];
  const sl = parseOptionalJsonArray(stopLosses, 'stop-losses-json') ?? [];

  if (tp.length > MAX_TAKE_PROFITS) {
    throw new Error(
      `takeProfits cannot exceed ${MAX_TAKE_PROFITS} entries`,
    );
  }
  if (sl.length > MAX_STOP_LOSSES) {
    throw new Error(
      `stopLosses cannot exceed ${MAX_STOP_LOSSES} entries`,
    );
  }
  if (tp.length + sl.length > MAX_TOTAL_DEPENDANTS) {
    throw new Error(
      `Total dependant orders cannot exceed ${MAX_TOTAL_DEPENDANTS}`,
    );
  }
}

function validateOptionalPositiveInt(flagName: string, value: string | undefined, max: number) {
  if (value === undefined) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`--${flagName} must be a positive integer`);
  }
  if (parsed > max) {
    throw new Error(`--${flagName} cannot exceed ${max}`);
  }
}

export function validatePagingFlags(page: string | undefined, pageSize: string | undefined): void {
  validateOptionalPositiveInt('page', page, MAX_PAGE_VALUE);
  validateOptionalPositiveInt('page-size', pageSize, MAX_PAGE_SIZE_VALUE);
}

// Research (GET /api/v1/research/*) — mirrors the partner API's zod schemas:
// ticker 1-6 chars (letters/digits, `.`/`-`), upper-cased; days 1-365;
// limit 1-100 (news: 1-12); minValueUsd >= 0.
const RESEARCH_TICKER_PATTERN = /^[A-Z][A-Z0-9.\-]{0,5}$/;
const RESEARCH_MAX_DAYS = 365;
const RESEARCH_MAX_LIMIT = 100;
const RESEARCH_NEWS_MAX_LIMIT = 12;

export function parseResearchTicker(value: string | undefined, required: true): string;
export function parseResearchTicker(value: string | undefined, required: false): string | undefined;
export function parseResearchTicker(value: string | undefined, required: boolean): string | undefined {
  // A bare `--ticker` reaches here as the parser's valueless-flag sentinel
  // 'true', which would otherwise pass as the ticker TRUE.
  if (value === undefined || value.trim() === '' || value === 'true') {
    if (required || value === 'true') throw new Error('Missing required flag --ticker');
    return undefined;
  }
  const ticker = value.trim().toUpperCase();
  if (!RESEARCH_TICKER_PATTERN.test(ticker)) {
    throw new Error('--ticker must be 1-6 uppercase letters/digits (e.g. NVDA, BRK.B)');
  }
  return ticker;
}

export function validateResearchWindowFlags(
  days: string | undefined,
  limit: string | undefined,
  maxLimit: number = RESEARCH_MAX_LIMIT,
): void {
  validateOptionalPositiveInt('days', days, RESEARCH_MAX_DAYS);
  validateOptionalPositiveInt('limit', limit, maxLimit);
}

export function validateMinValueUsdFlag(value: string | undefined): void {
  if (value === undefined) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('--min-value-usd must be a number >= 0');
  }
}

function parseConversationOverageAsset(value: string | undefined): ConversationOverageAsset {
  const normalized = (value ?? 'USDC').toUpperCase();
  if (normalized !== 'USDC' && normalized !== 'SOL') {
    throw new Error('--payment-asset must be either USDC or SOL');
  }
  return normalized as ConversationOverageAsset;
}

function buildOveragePaymentOpts(flags: Record<string, string | undefined>) {
  const raw = flags['pay-overage'];
  if (raw === undefined || raw === 'false') return undefined;
  const txSignature = flags['payment-tx-signature']?.trim();
  if (!txSignature) {
    throw new Error('--payment-tx-signature is required when --pay-overage is enabled');
  }
  return {
    enabled: true,
    asset: parseConversationOverageAsset(flags['payment-asset']),
    txSignature,
  };
}

export function parseModelVersionFlag(
  value: string | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('--model-version cannot be empty');
  }
  if (trimmed.toLowerCase() === 'null') return null;
  if (!PARTNER_CANONICAL_MODEL_VERSION_SET.has(trimmed)) {
    throw new Error(
      `--model-version must be one of: ${PARTNER_CANONICAL_MODEL_VERSIONS.join(', ')}, or "null"`,
    );
  }
  return trimmed;
}

/** --trading-account-id: a non-empty id, or undefined when the flag is absent. */
export function parseTradingAccountIdFlag(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'true') throw new Error('Missing value for --trading-account-id');
  return trimmed;
}

/** --funding-amount-sol: a finite number >= 1 (partner-api arena deploy). */
export function parseFundingAmountSolFlag(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (value.trim() === '' || value === 'true' || !Number.isFinite(n) || n < 1) {
    throw new Error('--funding-amount-sol must be a number >= 1');
  }
  return n;
}

// Approvals (POST .../messages `approval`) — mirrors the partner API's zod
// schema: approvalId is a UUID (approvalRequest.approvalId on the assistant
// message), decision is approve | reject.
const APPROVAL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApprovalDecision = 'approve' | 'reject';

/**
 * --approve <approvalId> / --reject <approvalId>: at most one of them, and
 * the value must be a well-formed approval id. Returns the request body's
 * `approval`, or undefined when neither flag is present.
 */
export function parseApprovalFlags(
  approve: string | undefined,
  reject: string | undefined,
): { approvalId: string; decision: ApprovalDecision } | undefined {
  if (approve !== undefined && reject !== undefined) {
    throw new Error('Use only one of --approve or --reject');
  }
  const decision: ApprovalDecision | undefined =
    approve !== undefined ? 'approve' : reject !== undefined ? 'reject' : undefined;
  if (!decision) return undefined;
  const value = (decision === 'approve' ? approve : reject)!.trim();
  if (!value || value === 'true') {
    throw new Error(`Missing value for --${decision} (the approvalRequest.approvalId to decide)`);
  }
  if (!APPROVAL_ID_PATTERN.test(value)) {
    throw new Error(`--${decision} must be an approval id (UUID) from approvalRequest.approvalId`);
  }
  return { approvalId: value, decision };
}

/** Current state of an approval request, resolved by the server when the page is read. */
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'superseded';

/** `approvalRequest` on an assistant message (GET .../messages). */
export interface ApprovalRequestView {
  approvalId: string;
  expiresAt: string;
  /** Omitted only if the server could not look the status up. */
  status?: ApprovalRequestStatus;
  /** `category` may be `unknown` (an action the server could not classify). */
  actions: Array<{ category: string; summary: string }>;
}

/**
 * Human-readable lines for the approval requests on a get-messages page,
 * printed to stderr so stdout stays the API's JSON. Reads only the top-level
 * `approvalRequest` of assistant messages (server-reserved). Uses the server's
 * `approvalRequest.status` when present. Only when it is omitted does it fall
 * back to the documented rule: pending only while unexpired and no later user
 * message exists (labelled "inferred"), noting that the server omits status
 * for a moment while a new request is being set up. The server is authoritative either
 * way; an id that is no longer pending executes nothing.
 */
export function describeApprovalRequests(
  response: unknown,
  conversationId: string,
  now: Date = new Date(),
): string[] {
  const messages = (response as { data?: { messages?: unknown } } | undefined)?.data?.messages;
  if (!Array.isArray(messages)) return [];
  const lines: string[] = [];
  messages.forEach((msg, index) => {
    // Server-reserved: only the top-level field of an assistant message is an
    // approval request (never metadata.approvalRequest, never another role).
    const message = msg as { role?: unknown; approvalRequest?: Partial<ApprovalRequestView> } | null;
    if (message?.role !== 'assistant') return;
    const request = message.approvalRequest;
    if (!request || typeof request.approvalId !== 'string') return;
    let status: string;
    let label: string;
    const inferred = !(typeof request.status === 'string' && request.status);
    if (!inferred) {
      status = request.status as string;
      label = status;
    } else {
      const expiresAtMs = Date.parse(String(request.expiresAt ?? ''));
      const answered = messages
        .slice(index + 1)
        .some((later) => (later as { role?: unknown } | null)?.role === 'user');
      status = answered
        ? 'no longer pending'
        : Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime()
          ? 'expired'
          : 'pending';
      label = `${status}, inferred`;
    }
    lines.push(
      `Approval request ${request.approvalId} (expires ${request.expiresAt ?? 'unknown'}) [${label}]:`,
    );
    for (const action of Array.isArray(request.actions) ? request.actions : []) {
      lines.push(`  - [${action?.category ?? 'unknown'}] ${action?.summary ?? ''}`);
    }
    if (inferred) {
      lines.push(
        '  No status from the server: the request may still be being set up (it cannot be decided yet); run get-messages again.',
      );
    }
    if (status === 'pending') {
      lines.push(
        '  Only approve after your user explicitly approved these actions:',
        `  milo send-message --conversation-id ${conversationId} --approve ${request.approvalId}`,
        `  milo send-message --conversation-id ${conversationId} --reject ${request.approvalId}`,
      );
    }
  });
  return lines;
}

/** Signal-feed keys a strategy can opt into (partner-api SOURCE_FAMILY_FEEDS). */
export const SOURCE_FAMILY_FEEDS = [
  'alpha-pro',
  'sec-form4',
  'congress-ptr',
  'sec-8k',
  'analyst-ratings',
] as const;

/**
 * --source-family: a registered feed key, or "null" to opt a strategy back
 * out. Validated here because the generic flag parser accepts anything, and a
 * typo would otherwise surface only as an API 400.
 */
export function parseSourceFamilyFlag(
  value: string | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'null') return null;
  if (!(SOURCE_FAMILY_FEEDS as readonly string[]).includes(trimmed)) {
    throw new Error(
      `--source-family must be one of: ${SOURCE_FAMILY_FEEDS.join(', ')}, or "null" (see \`milo signal-feeds\`)`,
    );
  }
  return trimmed;
}

// ── Commands ──────────────────────────────────────────────────────

// Partner MCP note: initialize can return 429 under bursty traffic or high load
// (authenticated keys get a larger allowance than anonymous per-IP sessions).
// MCP research tools return the rows as a second JSON text block, not only in
// structuredContent.
export const COMMANDS: CommandDef[] = [
  // ── Signup ────────────────────────────────────────────────────

  {
    name: 'signup',
    description:
      'Register a new user via SIWX wallet verification (auto-signs with --secret-key)',
    flags: [
      { name: 'wallet-address', description: 'Solana wallet address', required: true },
      { name: 'secret-key', description: 'Base58-encoded ed25519 secret key (or MILO_SECRET_KEY env)' },
      { name: 'chain-id', description: `Chain ID (default: ${SOLANA_MAINNET_CHAIN_ID})` },
      { name: 'invite-code', description: 'Optional invite code' },
    ],
    handler: async (flags, client, config) => {
      const walletAddress = requireFlag(flags, 'wallet-address');
      const secretKeyStr = flags['secret-key'] ?? process.env['MILO_SECRET_KEY'];
      if (!secretKeyStr) {
        throw new Error('Missing --secret-key or MILO_SECRET_KEY env var (base58-encoded ed25519 secret key)');
      }
      const chainId = flags['chain-id'] ?? SOLANA_MAINNET_CHAIN_ID;

      // Step 1: Get SIWX message from server
      const siwxResult = await client.createSiwxMessage({
        accountAddress: walletAddress,
        chainId,
        ...(flags['invite-code'] ? { inviteCode: flags['invite-code'] } : {}),
      }) as { data: { data: Record<string, unknown>; message: string } };

      const { data: siwxData, message: siwxMessage } = siwxResult.data;

      // Step 2: Sign the message with ed25519
      const secretKeyBytes = base58Decode(secretKeyStr);
      // Solana keypairs are 64 bytes: first 32 = secret, last 32 = public
      const secretKey = secretKeyBytes.slice(0, 32);
      const messageBytes = new TextEncoder().encode(siwxMessage);
      const signatureBytes = crypto.sign(null, messageBytes, {
        key: Buffer.from(secretKey),
        format: 'raw' as any,
        type: 'ed25519' as any,
      } as any);
      const signature = base58Encode(new Uint8Array(signatureBytes));

      // Step 3: Register
      const result = await client.signup({
        signupWallet: walletAddress,
        siwx: { data: siwxData, message: siwxMessage, signature },
      }) as any;

      // Step 4: Save credentials
      const apiKey = result?.data?.apiKey ?? result?.apiKey;
      const userId = result?.data?.user?.id;
      const wallets = result?.data?.wallets ?? [];
      const miloWallet = wallets.find((w: any) => w.type === 'milo');

      const newConfig: MiloConfig = { ...config };
      if (apiKey) newConfig.api_key = apiKey;
      if (userId) newConfig.user_id = userId;
      if (miloWallet?.id) newConfig.wallet_id = miloWallet.id;
      if (miloWallet?.address) newConfig.wallet_address = miloWallet.address;
      saveConfig(newConfig);

      // Auto-configure client for this session
      if (apiKey) client.setApiKey(apiKey);

      return result;
    },
  },

  // ── Me ───────────────────────────────────────────────────────

  {
    name: 'me',
    description: 'Get current user profile and wallets for the authenticated API key',
    flags: [],
    handler: async (_flags, client) => {
      return client.getMe();
    },
  },

  // ── Holdings ──────────────────────────────────────────────────

  {
    name: 'get-holdings',
    description: 'Get token holdings for a wallet',
    flags: [
      { name: 'wallet-id', description: 'Wallet ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const walletId = requireFlag(flags, 'wallet-id', config.wallet_id);
      return client.getHoldings(walletId);
    },
  },

  // ── Transactions ──────────────────────────────────────────────

  {
    name: 'transactions',
    description: 'List wallet transactions',
    flags: [
      { name: 'wallet-id', description: 'Wallet ID (default: from config)' },
      { name: 'limit', description: 'Items per page (default: 25, max: 200)' },
      { name: 'cursor', description: 'Cursor for pagination' },
    ],
    handler: async (flags, client, config) => {
      const walletId = requireFlag(flags, 'wallet-id', config.wallet_id);
      return client.getTransactions(walletId, {
        limit: flags['limit'],
        cursor: flags['cursor'],
      });
    },
  },

  {
    name: 'executed-transactions',
    description: 'Get executed (order-linked) transactions',
    flags: [
      { name: 'wallet-id', description: 'Wallet ID (default: from config)' },
      { name: 'limit', description: 'Items per page (default: 25, max: 200)' },
      { name: 'cursor', description: 'Cursor for pagination' },
      { name: 'tx-type', description: 'Filter by buy or sell' },
      { name: 'token', description: 'Filter by token address' },
    ],
    handler: async (flags, client, config) => {
      const walletId = requireFlag(flags, 'wallet-id', config.wallet_id);
      return client.getExecutedTransactions(walletId, {
        limit: flags['limit'],
        cursor: flags['cursor'],
        txType: flags['tx-type'],
        token: flags['token'],
      });
    },
  },

  // ── Positions ─────────────────────────────────────────────────

  {
    name: 'list-positions',
    description: 'List investment positions with PnL data',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'status', description: 'Filter: active, pending, not_active' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.listPositions(userId, {
        status: flags['status'],
        page: flags['page'],
        pageSize: flags['page-size'],
      });
    },
  },

  {
    name: 'close-position',
    description: 'Close a position (cancels pending orders, sells remaining)',
    flags: [
      { name: 'thesis-id', description: 'Position thesis ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const thesisId = requireFlag(flags, 'thesis-id');
      return client.closePosition(userId, thesisId);
    },
  },

  {
    name: 'close-all-positions',
    description: 'Close all active and pending positions',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      return client.closeAllPositions(userId);
    },
  },

  // ── Orders ────────────────────────────────────────────────────

  {
    name: 'create-order',
    description:
      'Create a buy or sell order with optional TP/SL; validation errors may include error.details.validationIssues',
    flags: [
      { name: 'wallet-id', description: 'Wallet ID (default: from config)' },
      { name: 'token-address', description: 'Token mint address', required: true },
      { name: 'type', description: 'buy or sell', required: true },
      {
        name: 'payload-json',
        description:
          'Order payload JSON (amount, trigger, execution); schema errors can include error.details.validationIssues',
        required: true,
      },
      { name: 'status', description: 'active or draft (default: active)' },
      { name: 'position-thesis-id', description: 'Link to a position thesis' },
      { name: 'take-profits-json', description: `Take-profit ladder JSON array (max ${MAX_TAKE_PROFITS})` },
      { name: 'stop-losses-json', description: `Stop-loss ladder JSON array (max ${MAX_STOP_LOSSES})` },
      {
        name: 'expires-at',
        description:
          'Expiration time (ISO 8601; required for market orders and must be within 120 minutes)',
      },
    ],
    handler: async (flags, client, config) => {
      const walletId = requireFlag(flags, 'wallet-id', config.wallet_id);
      const body: Record<string, unknown> = {
        tokenAddress: requireFlag(flags, 'token-address'),
        type: requireFlag(flags, 'type'),
        payload: parseJson(flags['payload-json'], 'payload-json'),
      };
      if (flags['status']) body.status = flags['status'];
      if (flags['position-thesis-id']) body.positionThesisId = flags['position-thesis-id'];
      if (flags['expires-at']) body.expiresAt = flags['expires-at'];
      const tp = parseJson(flags['take-profits-json'], 'take-profits-json');
      const sl = parseJson(flags['stop-losses-json'], 'stop-losses-json');
      validateCreateOrderDependants(tp, sl);
      if (tp !== undefined) body.takeProfits = tp;
      if (sl !== undefined) body.stopLosses = sl;
      return client.createOrder(walletId, body);
    },
  },

  {
    name: 'list-orders',
    description: 'List orders with optional filters',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'status', description: 'active, paused, error, fulfilled, archived, draft' },
      { name: 'type', description: 'buy or sell' },
      { name: 'token-address', description: 'Filter by token' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.listOrders(userId, {
        status: flags['status'],
        type: flags['type'],
        tokenAddress: flags['token-address'],
        page: flags['page'],
        pageSize: flags['page-size'],
      });
    },
  },

  {
    name: 'get-order',
    description: 'Get details of a specific order',
    flags: [
      { name: 'order-id', description: 'Order ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const orderId = requireFlag(flags, 'order-id');
      return client.getOrder(userId, orderId);
    },
  },

  {
    name: 'pause-order',
    description: '⚠️ Replaces live state: pausing an order stops it executing — pausing a stop-loss/take-profit leaves the position unprotected until re-activated. Pause an active order',
    flags: [
      { name: 'order-id', description: 'Order ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const orderId = requireFlag(flags, 'order-id');
      return client.pauseOrder(userId, orderId);
    },
  },

  {
    name: 'activate-order',
    description: 'Activate a draft or paused order',
    flags: [
      { name: 'order-id', description: 'Order ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const orderId = requireFlag(flags, 'order-id');
      return client.activateOrder(userId, orderId);
    },
  },

  {
    name: 'delete-order',
    description: 'Archive (delete) an order',
    flags: [
      { name: 'order-id', description: 'Order ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const orderId = requireFlag(flags, 'order-id');
      return client.deleteOrder(userId, orderId);
    },
  },

  // ── Wallet Actions ────────────────────────────────────────────

  {
    name: 'send-tokens',
    description:
      'Send tokens from your Milo wallet (wallet-id path value is authoritative)',
    flags: [
      { name: 'wallet-id', description: 'Wallet ID (default: from config)' },
      { name: 'recipient', description: 'Recipient Solana address', required: true },
      { name: 'token', description: 'Token mint address', required: true },
      { name: 'amount', description: 'Amount to send (e.g. 1.5)', required: true },
    ],
    handler: async (flags, client, config) => {
      const walletId = requireFlag(flags, 'wallet-id', config.wallet_id);
      return client.sendTokens(walletId, {
        recipient: requireFlag(flags, 'recipient'),
        token: requireFlag(flags, 'token'),
        amount: Number(requireFlag(flags, 'amount')),
      });
    },
  },

  // ── AutoTrade Settings ────────────────────────────────────────

  {
    name: 'get-settings',
    description: 'Get current auto-trade configuration',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      {
        name: 'trading-account-id',
        description:
          'Trading account to read (ids are in `me` output: tradingAccounts). Omit for the default account.',
      },
    ],
    handler: async (flags, client, config) => {
      const accountId = parseTradingAccountIdFlag(flags['trading-account-id']);
      if (accountId) return client.getAccountAutoTradeSettings(accountId);
      const userId = requireFlag(flags, 'user-id', config.user_id);
      return client.getAutoTradeSettings(userId);
    },
  },

  {
    name: 'update-settings',
    description: 'Update auto-trade configuration',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      {
        name: 'trading-account-id',
        description:
          'Trading account to update (ids are in `me` output: tradingAccounts). Omit for the default account.',
      },
      { name: 'is-active', description: 'Enable (true) or disable (false) auto-trading' },
      { name: 'risk-tolerance', description: 'conservative, balanced, or degen' },
      { name: 'strategy', description: 'VALUE INVESTOR, SWING TRADER, SCALPER, or CUSTOM' },
      { name: 'strategy-id', description: 'Link to a saved strategy (UUID)' },
      {
        name: 'model-version',
        description: `Preferred model (or "null" to clear). Only canonical public ids are accepted: ${PARTNER_CANONICAL_MODEL_VERSIONS.join(', ')}. If unavailable for the account, the API returns 400 with a plan-specific Stripe upgrade link.`,
      },
      { name: 'instructions', description: 'Free-text trading instructions' },
      { name: 'allocation-json', description: 'Asset class allocation JSON (e.g. \'{"majors":40,"memes":20}\')' },
      { name: 'custom-tickers-json', description: 'Custom tickers JSON array (e.g. \'["SOL","JUP"]\')' },
      {
        name: 'data-sources-json',
        description:
          'Global data-source settings JSON (or "null" to clear). Supported keys: fundingRates, openInterest, liquidationData, macroData. Only Pro and Max can change these settings.',
      },
      {
        name: 'asset-class-settings-json',
        description:
          'Per-asset-class settings JSON (or "null" to clear), including nested dataSources overrides.',
      },
    ],
    handler: async (flags, client, config) => {
      const body: Record<string, unknown> = {};
      if (flags['is-active'] !== undefined) body.isActive = flags['is-active'] === 'true';
      if (flags['risk-tolerance']) body.riskTolerance = flags['risk-tolerance'];
      if (flags['strategy']) body.strategy = flags['strategy'];
      if (flags['strategy-id']) body.strategyId = flags['strategy-id'];
      const modelVersion = parseModelVersionFlag(flags['model-version']);
      if (modelVersion !== undefined) body.modelVersion = modelVersion;
      if (flags['instructions']) body.instructions = flags['instructions'];
      const allocation = parseJson(flags['allocation-json'], 'allocation-json');
      if (allocation) body.allocation = allocation;
      const tickers = parseJson(flags['custom-tickers-json'], 'custom-tickers-json');
      if (tickers) body.customTickers = tickers;
      if (flags['data-sources-json'] !== undefined) {
        body.dataSources = parseJson(flags['data-sources-json'], 'data-sources-json');
      }
      if (flags['asset-class-settings-json'] !== undefined) {
        body.assetClassSettings = parseJson(
          flags['asset-class-settings-json'],
          'asset-class-settings-json',
        );
      }
      if (Object.keys(body).length === 0) {
        throw new Error('At least one setting flag must be provided');
      }
      const accountId = parseTradingAccountIdFlag(flags['trading-account-id']);
      if (accountId) return client.updateAccountAutoTradeSettings(accountId, body);
      return client.updateAutoTradeSettings(requireFlag(flags, 'user-id', config.user_id), body);
    },
  },

  // ── Strategies ────────────────────────────────────────────────

  {
    name: 'list-strategies',
    description: 'List autotrade strategies',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'scope', description: 'all, owned, or public' },
      { name: 'q', description: 'Search query' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.listStrategies(userId, {
        scope: flags['scope'],
        q: flags['q'],
        page: flags['page'],
        pageSize: flags['page-size'],
      });
    },
  },

  {
    name: 'get-strategy',
    description: 'Get details of a strategy',
    flags: [
      { name: 'strategy-id', description: 'Strategy ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const strategyId = requireFlag(flags, 'strategy-id');
      return client.getStrategy(userId, strategyId);
    },
  },

  {
    name: 'create-strategy',
    description: 'Create a new autotrade strategy',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'name', description: 'Strategy name', required: true },
      { name: 'strategy', description: 'VALUE INVESTOR, SWING TRADER, SCALPER, or CUSTOM', required: true },
      { name: 'description', description: 'Strategy description' },
      { name: 'instructions', description: 'Trading instructions for the agent' },
      { name: 'allocation-json', description: 'Asset class allocation JSON' },
      { name: 'custom-tickers-json', description: 'Custom tickers JSON array' },
      {
        name: 'data-sources-json',
        description:
          'Global data-source settings JSON. Supported keys: fundingRates, openInterest, liquidationData, macroData. Only Pro and Max can change these settings.',
      },
      {
        name: 'asset-class-settings-json',
        description:
          'Per-asset-class settings JSON, including nested dataSources overrides.',
      },
      {
        name: 'source-family',
        description: `Signal feed to opt into: ${SOURCE_FAMILY_FEEDS.join(', ')} (see \`signal-feeds\`)`,
      },
      { name: 'is-public', description: 'Make publicly discoverable (true/false)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const body: Record<string, unknown> = {
        name: requireFlag(flags, 'name'),
        strategy: requireFlag(flags, 'strategy'),
      };
      if (flags['description']) body.description = flags['description'];
      if (flags['instructions']) body.instructions = flags['instructions'];
      const allocation = parseJson(flags['allocation-json'], 'allocation-json');
      if (allocation) body.allocation = allocation;
      const tickers = parseJson(flags['custom-tickers-json'], 'custom-tickers-json');
      if (tickers) body.customTickers = tickers;
      if (flags['data-sources-json'] !== undefined) {
        body.dataSources = parseJson(flags['data-sources-json'], 'data-sources-json');
      }
      if (flags['asset-class-settings-json'] !== undefined) {
        body.assetClassSettings = parseJson(
          flags['asset-class-settings-json'],
          'asset-class-settings-json',
        );
      }
      const sourceFamily = parseSourceFamilyFlag(flags['source-family']);
      if (sourceFamily !== undefined) body.sourceFamily = sourceFamily;
      if (flags['is-public'] !== undefined) body.isPublic = flags['is-public'] === 'true';
      return client.createStrategy(userId, body);
    },
  },

  {
    name: 'update-strategy',
    description: '⚠️ Replaces live state: every flag you pass overwrites the saved value (no merge); a strategy linked to an active account changes what it trades once re-synced. Update an existing strategy',
    flags: [
      { name: 'strategy-id', description: 'Strategy ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'name', description: 'Strategy name' },
      { name: 'strategy', description: 'Trading strategy type' },
      { name: 'description', description: 'Strategy description' },
      { name: 'instructions', description: 'Trading instructions' },
      { name: 'allocation-json', description: 'Asset class allocation JSON' },
      { name: 'custom-tickers-json', description: 'Custom tickers JSON array' },
      {
        name: 'data-sources-json',
        description:
          'Global data-source settings JSON (or "null" to clear). Supported keys: fundingRates, openInterest, liquidationData, macroData. Only Pro and Max can change these settings.',
      },
      {
        name: 'asset-class-settings-json',
        description:
          'Per-asset-class settings JSON (or "null" to clear), including nested dataSources overrides.',
      },
      {
        name: 'source-family',
        description: `Signal feed to opt into: ${SOURCE_FAMILY_FEEDS.join(', ')}, or "null" to opt out`,
      },
      { name: 'is-public', description: 'Make public (true/false)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const strategyId = requireFlag(flags, 'strategy-id');
      const body: Record<string, unknown> = {};
      if (flags['name']) body.name = flags['name'];
      if (flags['strategy']) body.strategy = flags['strategy'];
      if (flags['description']) body.description = flags['description'];
      if (flags['instructions']) body.instructions = flags['instructions'];
      const allocation = parseJson(flags['allocation-json'], 'allocation-json');
      if (allocation) body.allocation = allocation;
      const tickers = parseJson(flags['custom-tickers-json'], 'custom-tickers-json');
      if (tickers) body.customTickers = tickers;
      if (flags['data-sources-json'] !== undefined) {
        body.dataSources = parseJson(flags['data-sources-json'], 'data-sources-json');
      }
      if (flags['asset-class-settings-json'] !== undefined) {
        body.assetClassSettings = parseJson(
          flags['asset-class-settings-json'],
          'asset-class-settings-json',
        );
      }
      const sourceFamily = parseSourceFamilyFlag(flags['source-family']);
      if (sourceFamily !== undefined) body.sourceFamily = sourceFamily;
      if (flags['is-public'] !== undefined) body.isPublic = flags['is-public'] === 'true';
      return client.updateStrategy(userId, strategyId, body);
    },
  },

  {
    name: 'delete-strategy',
    description: 'Delete a strategy',
    flags: [
      { name: 'strategy-id', description: 'Strategy ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const strategyId = requireFlag(flags, 'strategy-id');
      return client.deleteStrategy(userId, strategyId);
    },
  },

  {
    name: 'sync-strategy',
    description: "⚠️ Replaces live state: re-applies the strategy's allocation/instructions onto the LIVE trading account while trading stays active. Re-sync auto-trade settings with a linked strategy",
    flags: [
      { name: 'strategy-id', description: 'Strategy ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const strategyId = requireFlag(flags, 'strategy-id');
      return client.syncStrategy(userId, strategyId);
    },
  },

  // ── Conversations ─────────────────────────────────────────────

  {
    name: 'create-conversation',
    description: '⚠️ May trigger trades: the auto-trader agent can act on the message (update autotrade settings, close positions). Start a conversation with a Milo AI agent',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'message', description: 'Initial message', required: true },
      { name: 'agent-type', description: 'market-analyst (research incl. read-only perps + prediction-market data) or auto-trader (default: market-analyst)' },
      { name: 'pay-overage', description: 'Legacy conversation-write retry helper (default: false)' },
      { name: 'payment-asset', description: 'Asset hint for --pay-overage legacy flow: USDC or SOL (default: USDC)' },
      { name: 'payment-tx-signature', description: 'Opaque legacy/v0/v1 Solana transaction signature used by --pay-overage (required with --pay-overage)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const body: { message: string; agentType?: string } = {
        message: requireFlag(flags, 'message'),
      };
      if (flags['agent-type']) body.agentType = flags['agent-type'];
      return client.createConversation(userId, body, buildOveragePaymentOpts(flags));
    },
  },

  {
    name: 'list-conversations',
    description: 'List conversations',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.listConversations(userId, {
        page: flags['page'],
        pageSize: flags['page-size'],
      });
    },
  },

  {
    name: 'get-conversation',
    description: 'Get conversation details',
    flags: [
      { name: 'conversation-id', description: 'Conversation ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const conversationId = requireFlag(flags, 'conversation-id');
      return client.getConversation(userId, conversationId);
    },
  },

  {
    name: 'send-message',
    description: '⚠️ May trigger trades: the auto-trader agent can act on the message (update autotrade settings, close positions). Money actions wait for approval: decide the agent\'s approvalRequest (see get-messages) with --approve/--reject <approvalId>; any other message cancels it, and it expires after 10 minutes. Send a message to a conversation',
    flags: [
      { name: 'conversation-id', description: 'Conversation ID', required: true },
      { name: 'message', description: 'Message text (required unless --approve/--reject; then defaults to "approve" / "cancel" and is saved as your turn, but the decision comes only from the flag)' },
      { name: 'approve', description: 'approvalRequest.approvalId to approve; only after your user explicitly approved that exact action' },
      { name: 'reject', description: 'approvalRequest.approvalId to reject (nothing is executed)' },
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'pay-overage', description: 'Legacy conversation-write retry helper (default: false)' },
      { name: 'payment-asset', description: 'Asset hint for --pay-overage legacy flow: USDC or SOL (default: USDC)' },
      { name: 'payment-tx-signature', description: 'Opaque legacy/v0/v1 Solana transaction signature used by --pay-overage (required with --pay-overage)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const conversationId = requireFlag(flags, 'conversation-id');
      const approval = parseApprovalFlags(flags['approve'], flags['reject']);
      const defaultMessage = approval
        ? approval.decision === 'approve' ? 'approve' : 'cancel'
        : undefined;
      return client.sendMessage(userId, conversationId, {
        message: requireFlag(flags, 'message', defaultMessage),
        ...(approval ? { approval } : {}),
      }, buildOveragePaymentOpts(flags));
    },
  },

  {
    name: 'get-messages',
    description: 'Get messages from a conversation (poll processing flag). Approval requests on the page (id, expiry, status, action summaries) are also printed to stderr',
    flags: [
      { name: 'conversation-id', description: 'Conversation ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const conversationId = requireFlag(flags, 'conversation-id');
      validatePagingFlags(flags['page'], flags['page-size']);
      const response = await client.getMessages(userId, conversationId, {
        page: flags['page'],
        pageSize: flags['page-size'],
      });
      const approvalLines = describeApprovalRequests(response, conversationId);
      if (approvalLines.length) process.stderr.write(`${approvalLines.join('\n')}\n`);
      return response;
    },
  },

  // ── Arena ────────────────────────────────────────────────────

  {
    name: 'deploy-arena',
    description: 'Deploy a strategy to the arena',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'strategy-id', description: 'Strategy ID to deploy', required: true },
      {
        name: 'funding-amount-sol',
        description: 'SOL to fund the arena deployment with (min 1; default 1 server-side)',
      },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const strategyId = requireFlag(flags, 'strategy-id');
      const fundingAmountSol = parseFundingAmountSolFlag(flags['funding-amount-sol']);
      return client.deployArenaStrategy(userId, {
        strategyId,
        ...(fundingAmountSol !== undefined ? { fundingAmountSol } : {}),
      });
    },
  },

  {
    name: 'withdraw-arena',
    description: 'Withdraw from the arena',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'strategy-id', description: 'Strategy ID to withdraw', required: true },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const strategyId = requireFlag(flags, 'strategy-id');
      return client.withdrawArenaStrategy(userId, { strategyId });
    },
  },

  {
    name: 'arena-leaderboard',
    description: 'Get the arena leaderboard',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'timeframe', description: 'Timeframe: 1d, 30d, 90d (default: 30d)' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
      { name: 'sort-key', description: 'Sort by: pnl, winRate (token-PnL: profitable tokens / tracked tokens * 100, excluding USDC), returnPct, accountValue' },
      { name: 'sort-direction', description: 'Sort direction: asc, desc' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.getArenaLeaderboard(userId, {
        page: flags['page'],
        pageSize: flags['page-size'],
        timeframe: flags['timeframe'],
        sortKey: flags['sort-key'],
        sortDirection: flags['sort-direction'],
      });
    },
  },

  // ── Quests & Bones ──────────────────────────────────────────────

  {
    name: 'list-quests',
    description: 'List quests with progress and bones rewards (defaults to unlocked)',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'unlocked', description: 'Filter for unlocked quests (default: true)' },
      { name: 'unclaimed', description: 'Filter for unclaimed quests (true/false)' },
      { name: 'claimed', description: 'Filter for claimed quests (true/false)' },
      { name: 'mode', description: 'Sort mode: completed_last' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.listQuests(userId, {
        page: flags['page'],
        pageSize: flags['page-size'],
        unlocked: flags['unlocked'],
        unclaimed: flags['unclaimed'],
        claimed: flags['claimed'],
        mode: flags['mode'],
      });
    },
  },

  {
    name: 'claim-quest',
    description: 'Claim bones (reward points) for a completed quest',
    flags: [
      { name: 'quest-id', description: 'Quest ID to claim', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const questId = requireFlag(flags, 'quest-id');
      return client.claimQuest(userId, questId);
    },
  },

  {
    name: 'bones-balance',
    description: 'Get your bones (reward points) balance',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      return client.getBonesBalance(userId);
    },
  },

  // ── Diary Logs ────────────────────────────────────────────────

  {
    name: 'diary-logs',
    description: 'Get auto-trade diary logs',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.getDiaryLogs(userId, {
        page: flags['page'],
        pageSize: flags['page-size'],
      });
    },
  },

  // ── Config (local utility) ───────────────────────────────────

  {
    name: 'config',
    description: 'Show or update ~/.milo/config.json',
    flags: [
      { name: 'set-api-key', description: 'Set API key' },
      { name: 'set-user-id', description: 'Set user ID' },
      { name: 'set-wallet-id', description: 'Set wallet ID' },
      { name: 'set-wallet-address', description: 'Set wallet address' },
      { name: 'set-base-url', description: 'Set base URL' },
    ],
    handler: async (flags, _client, config) => {
      let changed = false;
      if (flags['set-api-key']) { config.api_key = flags['set-api-key']; changed = true; }
      if (flags['set-user-id']) { config.user_id = flags['set-user-id']; changed = true; }
      if (flags['set-wallet-id']) { config.wallet_id = flags['set-wallet-id']; changed = true; }
      if (flags['set-wallet-address']) { config.wallet_address = flags['set-wallet-address']; changed = true; }
      if (flags['set-base-url']) { config.base_url = flags['set-base-url']; changed = true; }
      if (changed) {
        saveConfig(config);
        return { message: 'Config updated', config };
      }
      return { config };
    },
  },

  // ── Signal feeds & decisions ─────────────────────────────────

  {
    name: 'signal-feeds',
    description:
      'List registered catalyst signal feeds (family, rolloutStage: shadow | live_small | live, gate thresholds)',
    flags: [],
    handler: async (_flags, client) => {
      return client.listSignalFeeds();
    },
  },

  {
    name: 'decisions',
    description:
      'Decision ledger — structured decision snapshots (confidence, gates, forward returns); orderPlaced=false marks shadow/gated decisions that never traded',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'action', description: 'Filter: trade or skip' },
      { name: 'trading-account-id', description: 'Scope to one trading account' },
      { name: 'page', description: `Page number (max: ${MAX_PAGE_VALUE})` },
      { name: 'page-size', description: `Items per page (default: 25, max: ${MAX_PAGE_SIZE_VALUE})` },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      validatePagingFlags(flags['page'], flags['page-size']);
      return client.listDecisions(userId, {
        action: flags['action'],
        tradingAccountId: flags['trading-account-id'],
        page: flags['page'],
        pageSize: flags['page-size'],
      });
    },
  },

  // ── Research (market-level reads; API key only, no user id) ──

  {
    name: 'research-digest',
    description:
      'One-call 90-day disclosure digest for a US stock: insider Form 4 purchases, congressional trades, 8-K filings (whole-window counts/totals, top-5 notable rows, filing links)',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA, BRK.B)', required: true },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      return client.getStockResearchDigest(ticker);
    },
  },

  {
    name: 'insider-transactions',
    description:
      "SEC Form 4 insider open-market purchases for a ticker, newest filing first (Milo's tracked universe only — check meta.coverage.tracked; meta.coverage.tickers lists exactly which tickers are polled)",
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA)', required: true },
      { name: 'days', description: `Look-back window in days (default: 90, max: ${RESEARCH_MAX_DAYS})` },
      { name: 'limit', description: `Max rows (default: 50, max: ${RESEARCH_MAX_LIMIT})` },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      validateResearchWindowFlags(flags['days'], flags['limit']);
      return client.getInsiderTransactions({
        ticker,
        days: flags['days'],
        limit: flags['limit'],
      });
    },
  },

  {
    name: 'insider-buys',
    description:
      "Notable SEC Form 4 insider purchases across Milo's tracked universe, newest first, optionally above a USD value",
    flags: [
      { name: 'days', description: `Look-back window in days (default: 30, max: ${RESEARCH_MAX_DAYS})` },
      { name: 'min-value-usd', description: 'Only purchases worth at least this many USD' },
      { name: 'limit', description: `Max rows (default: 50, max: ${RESEARCH_MAX_LIMIT})` },
    ],
    handler: async (flags, client) => {
      validateResearchWindowFlags(flags['days'], flags['limit']);
      validateMinValueUsdFlag(flags['min-value-usd']);
      return client.getRecentInsiderBuys({
        days: flags['days'],
        minValueUsd: flags['min-value-usd'],
        limit: flags['limit'],
      });
    },
  },

  {
    name: 'congress-trades',
    description:
      'Congressional PTR stock-trade disclosures for a ticker, or market-wide when --ticker is omitted (amount ranges, 30-45 day lag)',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (omit for market-wide)' },
      { name: 'days', description: `Look-back window in days by disclosure date (default: 90, max: ${RESEARCH_MAX_DAYS})` },
      { name: 'limit', description: `Max rows (default: 50, max: ${RESEARCH_MAX_LIMIT})` },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], false);
      validateResearchWindowFlags(flags['days'], flags['limit']);
      return client.getCongressTrades({
        ticker,
        days: flags['days'],
        limit: flags['limit'],
      });
    },
  },

  {
    name: '8k-events',
    description:
      'Recent SEC 8-K material-event filings for a ticker with item codes and titles, newest acceptance first',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA)', required: true },
      { name: 'days', description: `Look-back window in days by filing date (default: 90, max: ${RESEARCH_MAX_DAYS})` },
      { name: 'limit', description: `Max rows (default: 50, max: ${RESEARCH_MAX_LIMIT})` },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      validateResearchWindowFlags(flags['days'], flags['limit']);
      return client.get8kEvents({
        ticker,
        days: flags['days'],
        limit: flags['limit'],
      });
    },
  },

  // Licensed (FMP-derived) research — OPTIONAL: the server mounts these routes
  // only with MCP_LICENSED_RESEARCH_TOOLS=true (404 otherwise); 503
  // provider_unavailable = upstream outage (retry), 404 = no data for ticker.

  {
    name: 'analyst-consensus',
    description:
      '[optional, licensed] Analyst consensus for a ticker: rating mix, price targets, recent grade actions (404 unless the server enables licensed research)',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA)', required: true },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      return client.getAnalystConsensus(ticker);
    },
  },

  {
    name: 'fundamentals',
    description:
      '[optional, licensed] Quarterly fundamentals for a ticker: revenue, net income, free cash flow for the last 12 quarters (404 unless the server enables licensed research)',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA)', required: true },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      return client.getStockFundamentals(ticker);
    },
  },

  {
    name: 'earnings-timeline',
    description:
      '[optional, licensed] Earnings timeline for a ticker: next scheduled report + up to 8 reported quarters with surprise % (404 unless the server enables licensed research)',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA)', required: true },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      return client.getEarningsTimeline(ticker);
    },
  },

  {
    name: 'stock-news',
    description:
      '[optional, licensed] Recent news for a ticker with per-article sentiment in [-1, 1] (404 unless the server enables licensed research)',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA)', required: true },
      { name: 'limit', description: `Max articles (default: 8, max: ${RESEARCH_NEWS_MAX_LIMIT})` },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      validateResearchWindowFlags(undefined, flags['limit'], RESEARCH_NEWS_MAX_LIMIT);
      return client.getStockNews({ ticker, limit: flags['limit'] });
    },
  },

  {
    name: 'peers',
    description:
      '[optional, licensed] Peer comparison for a ticker: the company first, then up to 5 peers by market cap with TTM multiples/margins (404 unless the server enables licensed research)',
    flags: [
      { name: 'ticker', description: 'US equity ticker, 1-6 chars (e.g. NVDA)', required: true },
    ],
    handler: async (flags, client) => {
      const ticker = parseResearchTicker(flags['ticker'], true);
      return client.getPeerComparison(ticker);
    },
  },

];
