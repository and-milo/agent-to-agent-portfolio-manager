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

// ── Commands ──────────────────────────────────────────────────────

export const COMMANDS: CommandDef[] = [
  // ── Signup ────────────────────────────────────────────────────

  {
    name: 'signup',
    description: 'Register a new user via SIWX wallet verification (auto-signs with --secret-key)',
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
    description: 'Close all active and pending positions (API limit: 1 request/min)',
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
    description: 'Create a buy or sell order with optional TP/SL (API limit: 5 requests/min)',
    flags: [
      { name: 'wallet-id', description: 'Wallet ID (default: from config)' },
      { name: 'token-address', description: 'Token mint address', required: true },
      { name: 'type', description: 'buy or sell', required: true },
      { name: 'payload-json', description: 'Order payload JSON (amount, trigger, execution)', required: true },
      { name: 'status', description: 'active or draft (default: active)' },
      { name: 'position-thesis-id', description: 'Link to a position thesis' },
      { name: 'take-profits-json', description: `Take-profit ladder JSON array (max ${MAX_TAKE_PROFITS})` },
      { name: 'stop-losses-json', description: `Stop-loss ladder JSON array (max ${MAX_STOP_LOSSES})` },
      { name: 'expires-at', description: 'Expiration time (ISO 8601)' },
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
    description: 'Pause an active order',
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
    description: 'Send tokens from your Milo wallet',
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
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      return client.getAutoTradeSettings(userId);
    },
  },

  {
    name: 'update-settings',
    description: 'Update auto-trade configuration',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'is-active', description: 'Enable (true) or disable (false) auto-trading' },
      { name: 'risk-tolerance', description: 'conservative, balanced, or degen' },
      { name: 'strategy', description: 'VALUE INVESTOR, SWING TRADER, SCALPER, or CUSTOM' },
      { name: 'strategy-id', description: 'Link to a saved strategy (UUID)' },
      { name: 'instructions', description: 'Free-text trading instructions' },
      { name: 'allocation-json', description: 'Asset class allocation JSON (e.g. \'{"majors":40,"memes":20}\')' },
      { name: 'custom-tickers-json', description: 'Custom tickers JSON array (e.g. \'["SOL","JUP"]\')' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const body: Record<string, unknown> = {};
      if (flags['is-active'] !== undefined) body.isActive = flags['is-active'] === 'true';
      if (flags['risk-tolerance']) body.riskTolerance = flags['risk-tolerance'];
      if (flags['strategy']) body.strategy = flags['strategy'];
      if (flags['strategy-id']) body.strategyId = flags['strategy-id'];
      if (flags['instructions']) body.instructions = flags['instructions'];
      const allocation = parseJson(flags['allocation-json'], 'allocation-json');
      if (allocation) body.allocation = allocation;
      const tickers = parseJson(flags['custom-tickers-json'], 'custom-tickers-json');
      if (tickers) body.customTickers = tickers;
      if (Object.keys(body).length === 0) {
        throw new Error('At least one setting flag must be provided');
      }
      return client.updateAutoTradeSettings(userId, body);
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
      if (flags['is-public'] !== undefined) body.isPublic = flags['is-public'] === 'true';
      return client.createStrategy(userId, body);
    },
  },

  {
    name: 'update-strategy',
    description: 'Update an existing strategy',
    flags: [
      { name: 'strategy-id', description: 'Strategy ID', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'name', description: 'Strategy name' },
      { name: 'strategy', description: 'Trading strategy type' },
      { name: 'description', description: 'Strategy description' },
      { name: 'instructions', description: 'Trading instructions' },
      { name: 'allocation-json', description: 'Asset class allocation JSON' },
      { name: 'custom-tickers-json', description: 'Custom tickers JSON array' },
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
    description: 'Re-sync auto-trade settings with a linked strategy',
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
    description: 'Start a conversation with a Milo AI agent',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'message', description: 'Initial message', required: true },
      { name: 'agent-type', description: 'market-analyst or auto-trader (default: market-analyst)' },
      { name: 'pay-overage', description: 'Auto-pay write overage on 402 using server recipient/options and one-time paymentId (matches MCP create_conversation/send_message .payment fields; accepted retries return PAYMENT-RESPONSE) (default: false)' },
      { name: 'payment-asset', description: 'Preferred overage asset when both are accepted: USDC (0.25) or SOL (0.01), default USDC' },
      { name: 'payment-tx-signature', description: 'Confirmed Solana tx signature for payment to the 402 returned recipient wallet (required with --pay-overage)' },
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
    description: 'Send a message to a conversation',
    flags: [
      { name: 'conversation-id', description: 'Conversation ID', required: true },
      { name: 'message', description: 'Message text', required: true },
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'pay-overage', description: 'Auto-pay write overage on 402 using server recipient/options and one-time paymentId (matches MCP create_conversation/send_message .payment fields; accepted retries return PAYMENT-RESPONSE) (default: false)' },
      { name: 'payment-asset', description: 'Preferred overage asset when both are accepted: USDC (0.25) or SOL (0.01), default USDC' },
      { name: 'payment-tx-signature', description: 'Confirmed Solana tx signature for payment to the 402 returned recipient wallet (required with --pay-overage)' },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const conversationId = requireFlag(flags, 'conversation-id');
      return client.sendMessage(userId, conversationId, {
        message: requireFlag(flags, 'message'),
      }, buildOveragePaymentOpts(flags));
    },
  },

  {
    name: 'get-messages',
    description: 'Get messages from a conversation (poll processing flag)',
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
      return client.getMessages(userId, conversationId, {
        page: flags['page'],
        pageSize: flags['page-size'],
      });
    },
  },

  // ── Arena ────────────────────────────────────────────────────

  {
    name: 'deploy-arena',
    description: 'Deploy a strategy to the arena',
    flags: [
      { name: 'user-id', description: 'User ID (default: from config)' },
      { name: 'strategy-id', description: 'Strategy ID to deploy', required: true },
    ],
    handler: async (flags, client, config) => {
      const userId = requireFlag(flags, 'user-id', config.user_id);
      const strategyId = requireFlag(flags, 'strategy-id');
      return client.deployArenaStrategy(userId, { strategyId });
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
      { name: 'sort-key', description: 'Sort by: pnl, winRate, returnPct, accountValue' },
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
];
