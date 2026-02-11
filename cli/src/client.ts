/**
 * Lightweight HTTP client for the Milo Partner API.
 * Direct port of the MCP PartnerApiClient — same paths, same methods, same auth.
 * Zero runtime dependencies (uses global fetch).
 */

export interface ClientOpts {
  baseUrl: string;
  apiKey?: string;
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
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'API key is not set. Run "milo signup" first, or set --api-key / MILO_API_KEY.',
      );
    }
    return this.rawRequest<T>(method, path, body, query, this.apiKey);
  }

  /** Unauthenticated request — no API key needed. */
  private async publicRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
  ): Promise<T> {
    return this.rawRequest<T>(method, path, body, query);
  }

  private async rawRequest<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | undefined>,
    apiKey?: string,
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

    const res = await fetch(url.toString(), {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const json = await res.json();
    if (!res.ok) {
      const errMsg = json?.error?.message ?? json?.message ?? res.statusText;
      throw new Error(`Partner API error (${res.status}): ${errMsg}`);
    }

    return json as T;
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

  // ── Conversations ───────────────────────────────────────────────

  createConversation(
    userId: string,
    body: { message: string; agentType?: string },
  ) {
    return this.request('POST', `/api/v1/users/${userId}/conversations`, body);
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
  ) {
    return this.request(
      'POST',
      `/api/v1/users/${userId}/conversations/${conversationId}/messages`,
      body,
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
