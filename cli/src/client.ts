/**
 * Lightweight HTTP client for the Milo Partner API.
 * Direct port of the MCP PartnerApiClient — same paths, same methods, same auth.
 * Zero runtime dependencies (uses global fetch).
 */

export interface ClientOpts {
  baseUrl: string;
  apiKey?: string;
}

export type ConversationOverageAsset = 'USDC' | 'SOL';

export interface ConversationOveragePaymentOpts {
  enabled?: boolean;
  asset?: ConversationOverageAsset;
  txSignature?: string;
}

class PartnerApiHttpError extends Error {
  readonly status: number;
  readonly body: any;
  readonly responseHeaders: Headers;

  constructor(status: number, message: string, body: any, responseHeaders: Headers) {
    super(message);
    this.name = 'PartnerApiHttpError';
    this.status = status;
    this.body = body;
    this.responseHeaders = responseHeaders;
  }
}

export class PartnerApiClient {
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor(opts: ClientOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  getApiKey(): string | undefined {
    return this.apiKey;
  }

  /** Authenticated request — requires an API key. */
  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'API key is not set. Run "milo signup" first, or set --api-key / MILO_API_KEY.',
      );
    }
    return this.rawRequest<T>(method, path, body, query, this.apiKey, extraHeaders);
  }

  /** Unauthenticated request — no API key needed. */
  private async publicRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return this.rawRequest<T>(method, path, body, query, undefined, extraHeaders);
  }

  private async rawRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
    apiKey?: string,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    if (body) headers['Content-Type'] = 'application/json';
    if (extraHeaders) {
      for (const [key, value] of Object.entries(extraHeaders)) {
        headers[key] = value;
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    let json: any = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { message: text };
      }
    }

    if (!res.ok) {
      const errMsg = json?.error?.message ?? json?.message ?? res.statusText;
      throw new PartnerApiHttpError(
        res.status,
        `Partner API error (${res.status}): ${errMsg}`,
        json,
        res.headers,
      );
    }

    return json as T;
  }

  private async requestWithOptionalOveragePayment<T = unknown>(
    method: string,
    path: string,
    body: unknown,
    overagePayment?: ConversationOveragePaymentOpts,
  ): Promise<T> {
    try {
      return await this.request<T>(method, path, body);
    } catch (err) {
      if (
        !overagePayment?.enabled ||
        !(err instanceof PartnerApiHttpError) ||
        err.status !== 402
      ) {
        throw err;
      }

      const paymentHeader = this.buildOveragePaymentHeader(
        err.body,
        err.responseHeaders,
        overagePayment,
      );

      return this.request<T>(method, path, body, undefined, {
        'X-PAYMENT': paymentHeader,
      });
    }
  }

  private buildOveragePaymentHeader(
    responseBody: any,
    responseHeaders: Headers,
    overagePayment: ConversationOveragePaymentOpts,
  ) {
    const preferredAsset = overagePayment.asset ?? 'USDC';
    const details = responseBody?.error?.details ?? {};
    const recipientFromBody: string | undefined = details?.recipient;
    const recipient = recipientFromBody ?? responseHeaders.get('X-Payment-Recipient') ?? undefined;

    const optionsFromBody: Array<{ asset?: string; amount?: number }> = Array.isArray(details?.options)
      ? details.options
      : [];
    const optionsFromHeader = this.parsePaymentOptionsHeader(
      responseHeaders.get('X-Payment-Options'),
    );
    const options =
      optionsFromBody.length > 0 ? optionsFromBody : optionsFromHeader;

    const normalizedAsset = preferredAsset.toUpperCase();
    const selected =
      options.find((option) => String(option.asset ?? '').toUpperCase() === normalizedAsset) ??
      options[0];

    if (!recipient || !selected?.asset || selected.amount === undefined) {
      throw new Error(
        'API returned 402 but did not provide payment requirements (recipient/options).',
      );
    }

    const txSignature = overagePayment.txSignature?.trim();
    if (!txSignature) {
      throw new Error(
        'Missing payment tx signature. Provide --payment-tx-signature when using --pay-overage.',
      );
    }

    return JSON.stringify({
      recipient,
      asset: String(selected.asset).toUpperCase(),
      amount: Number(selected.amount),
      paymentId: this.createPaymentId(),
      txSignature,
    });
  }

  private parsePaymentOptionsHeader(value: string | null) {
    if (!value) return [];
    return value
      .split(',')
      .map((entry) => {
        const [assetRaw, amountRaw] = entry.split(':');
        const asset = assetRaw?.trim();
        const amount = amountRaw ? Number(amountRaw.trim()) : Number.NaN;
        if (!asset || !Number.isFinite(amount)) return null;
        return { asset, amount };
      })
      .filter((item): item is { asset: string; amount: number } => item !== null);
  }

  private createPaymentId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }

  // ── Auth (public — no API key) ──────────────────────────────────

  createSiwxMessage(body: {
    accountAddress: string;
    chainId: string;
    inviteCode?: string;
  }) {
    return this.publicRequest<unknown>('POST', '/api/v1/users/siwx/message', body);
  }

  signup(body: { signupWallet: string; siwx: Record<string, unknown> }) {
    return this.publicRequest('POST', '/api/v1/users', body);
  }

  // ── Me ─────────────────────────────────────────────────────────

  getMe() {
    return this.request('GET', '/api/v1/me');
  }

  // ── Holdings ────────────────────────────────────────────────────

  getHoldings(walletId: string) {
    return this.request('GET', `/api/v1/wallets/${walletId}/holdings`);
  }

  // ── Transactions ────────────────────────────────────────────────

  getTransactions(
    walletId: string,
    opts?: { limit?: string; cursor?: string },
  ) {
    return this.request('GET', `/api/v1/wallets/${walletId}/transactions`, undefined, {
      limit: opts?.limit,
      cursor: opts?.cursor,
    });
  }

  getExecutedTransactions(
    walletId: string,
    opts?: { limit?: string; cursor?: string; txType?: string; token?: string },
  ) {
    return this.request('GET', `/api/v1/wallets/${walletId}/executed-transactions`, undefined, {
      limit: opts?.limit,
      cursor: opts?.cursor,
      txType: opts?.txType,
      token: opts?.token,
    });
  }

  // ── Positions ───────────────────────────────────────────────────

  listPositions(
    userId: string,
    opts?: { page?: string; pageSize?: string; status?: string },
  ) {
    return this.request('GET', `/api/v1/users/${userId}/positions`, undefined, {
      page: opts?.page,
      pageSize: opts?.pageSize,
      status: opts?.status,
    });
  }

  closePosition(userId: string, thesisId: string) {
    return this.request('POST', `/api/v1/users/${userId}/positions/${thesisId}/close`);
  }

  closeAllPositions(userId: string) {
    return this.request('POST', `/api/v1/users/${userId}/positions/close-all`);
  }

  // ── Orders ──────────────────────────────────────────────────────

  createOrder(walletId: string, body: Record<string, unknown>) {
    return this.request('POST', `/api/v1/wallets/${walletId}/orders`, body);
  }

  listOrders(
    userId: string,
    opts?: {
      page?: string;
      pageSize?: string;
      status?: string;
      type?: string;
      tokenAddress?: string;
    },
  ) {
    return this.request('GET', `/api/v1/users/${userId}/orders`, undefined, {
      page: opts?.page,
      pageSize: opts?.pageSize,
      status: opts?.status,
      type: opts?.type,
      tokenAddress: opts?.tokenAddress,
    });
  }

  getOrder(userId: string, orderId: string) {
    return this.request('GET', `/api/v1/users/${userId}/orders/${orderId}`);
  }

  pauseOrder(userId: string, orderId: string) {
    return this.request('POST', `/api/v1/users/${userId}/orders/${orderId}/pause`);
  }

  activateOrder(userId: string, orderId: string) {
    return this.request('POST', `/api/v1/users/${userId}/orders/${orderId}/activate`);
  }

  deleteOrder(userId: string, orderId: string) {
    return this.request('DELETE', `/api/v1/users/${userId}/orders/${orderId}`);
  }

  // ── Wallet Actions ──────────────────────────────────────────────

  sendTokens(
    walletId: string,
    body: { recipient: string; token: string; amount: number },
  ) {
    return this.request('POST', `/api/v1/wallets/${walletId}/actions/send`, body);
  }

  // ── AutoTrade Settings ──────────────────────────────────────────

  getAutoTradeSettings(userId: string) {
    return this.request('GET', `/api/v1/users/${userId}/auto-trade-settings`);
  }

  updateAutoTradeSettings(userId: string, body: Record<string, unknown>) {
    return this.request('PATCH', `/api/v1/users/${userId}/auto-trade-settings`, body);
  }

  // ── Strategies ──────────────────────────────────────────────────

  listStrategies(
    userId: string,
    opts?: { page?: string; pageSize?: string; scope?: string; q?: string },
  ) {
    return this.request(
      'GET',
      `/api/v1/users/${userId}/auto-trade-settings/strategies`,
      undefined,
      { page: opts?.page, pageSize: opts?.pageSize, scope: opts?.scope, q: opts?.q },
    );
  }

  getStrategy(userId: string, strategyId: string) {
    return this.request(
      'GET',
      `/api/v1/users/${userId}/auto-trade-settings/strategies/${strategyId}`,
    );
  }

  createStrategy(userId: string, body: Record<string, unknown>) {
    return this.request(
      'POST',
      `/api/v1/users/${userId}/auto-trade-settings/strategies`,
      body,
    );
  }

  updateStrategy(userId: string, strategyId: string, body: Record<string, unknown>) {
    return this.request(
      'PATCH',
      `/api/v1/users/${userId}/auto-trade-settings/strategies/${strategyId}`,
      body,
    );
  }

  deleteStrategy(userId: string, strategyId: string) {
    return this.request(
      'DELETE',
      `/api/v1/users/${userId}/auto-trade-settings/strategies/${strategyId}`,
    );
  }

  syncStrategy(userId: string, strategyId: string) {
    return this.request(
      'POST',
      `/api/v1/users/${userId}/auto-trade-settings/strategies/${strategyId}/sync`,
    );
  }

  // ── Arena ──────────────────────────────────────────────────────

  deployArenaStrategy(userId: string, body: { strategyId: string }) {
    return this.request('POST', `/api/v1/users/${userId}/arena/deploy`, body);
  }

  withdrawArenaStrategy(userId: string, body: { strategyId: string }) {
    return this.request('POST', `/api/v1/users/${userId}/arena/withdraw`, body);
  }

  getArenaLeaderboard(
    userId: string,
    opts?: {
      page?: string;
      pageSize?: string;
      timeframe?: string;
      sortKey?: string;
      sortDirection?: string;
    },
  ) {
    return this.request('GET', `/api/v1/users/${userId}/arena/leaderboard`, undefined, {
      page: opts?.page,
      pageSize: opts?.pageSize,
      timeframe: opts?.timeframe,
      sortKey: opts?.sortKey,
      sortDirection: opts?.sortDirection,
    });
  }

  // ── Quests ────────────────────────────────────────────────────────

  listQuests(
    userId: string,
    opts?: {
      page?: string;
      pageSize?: string;
      unlocked?: string;
      unclaimed?: string;
      claimed?: string;
      mode?: string;
    },
  ) {
    return this.request('GET', `/api/v1/users/${userId}/quests`, undefined, {
      page: opts?.page,
      pageSize: opts?.pageSize,
      unlocked: opts?.unlocked,
      unclaimed: opts?.unclaimed,
      claimed: opts?.claimed,
      mode: opts?.mode,
    });
  }

  claimQuest(userId: string, questId: string) {
    return this.request('POST', `/api/v1/users/${userId}/quests/${questId}/claim`);
  }

  getBonesBalance(userId: string) {
    return this.request('GET', `/api/v1/users/${userId}/quests/bones`);
  }

  // ── Conversations ───────────────────────────────────────────────

  createConversation(
    userId: string,
    body: { message: string; agentType?: string },
    overagePayment?: ConversationOveragePaymentOpts,
  ) {
    return this.requestWithOptionalOveragePayment(
      'POST',
      `/api/v1/users/${userId}/conversations`,
      body,
      overagePayment,
    );
  }

  listConversations(userId: string, opts?: { page?: string; pageSize?: string }) {
    return this.request('GET', `/api/v1/users/${userId}/conversations`, undefined, {
      page: opts?.page,
      pageSize: opts?.pageSize,
    });
  }

  getConversation(userId: string, conversationId: string) {
    return this.request('GET', `/api/v1/users/${userId}/conversations/${conversationId}`);
  }

  sendMessage(
    userId: string,
    conversationId: string,
    body: { message: string },
    overagePayment?: ConversationOveragePaymentOpts,
  ) {
    return this.requestWithOptionalOveragePayment(
      'POST',
      `/api/v1/users/${userId}/conversations/${conversationId}/messages`,
      body,
      overagePayment,
    );
  }

  getMessages(
    userId: string,
    conversationId: string,
    opts?: { page?: string; pageSize?: string },
  ) {
    return this.request(
      'GET',
      `/api/v1/users/${userId}/conversations/${conversationId}/messages`,
      undefined,
      { page: opts?.page, pageSize: opts?.pageSize },
    );
  }

  // ── Diary Logs ──────────────────────────────────────────────────

  getDiaryLogs(userId: string, opts?: { page?: string; pageSize?: string }) {
    return this.request('GET', `/api/v1/users/${userId}/diary-logs`, undefined, {
      page: opts?.page,
      pageSize: opts?.pageSize,
    });
  }
}
