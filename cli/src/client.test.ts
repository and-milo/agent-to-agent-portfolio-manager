import assert from 'node:assert/strict';
import test from 'node:test';
import { PartnerApiClient } from './client.js';

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getHeader(headers: RequestInit['headers'] | undefined, name: string) {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found?.[1];
  }
  return (headers as Record<string, string>)[name];
}

test('retries conversation write with X-PAYMENT when overage payment is enabled', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    if (calls.length === 1) {
      return jsonResponse(
        {
          error: {
            code: 'payment_required',
            details: {
              recipient: 'TreasuryWallet111111111111111111111111111111',
              options: [
                { asset: 'USDC', amount: 0.25 },
                { asset: 'SOL', amount: 0.01 },
              ],
            },
          },
        },
        402,
      );
    }

    return jsonResponse({ data: { conversationId: 'c-1' } }, 201);
  };

  try {
    const client = new PartnerApiClient({
      baseUrl: 'https://partners.andmilo.com',
      apiKey: 'mk_live_test',
    });

    const response = await client.createConversation(
      '00000000-0000-0000-0000-000000000000',
      { message: 'hello' },
      {
        enabled: true,
        asset: 'SOL',
        txSignature:
          '5jY8QzE6M9k1W2n3V4aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789ABCD',
      },
    ) as { data: { conversationId: string } };

    assert.equal(response.data.conversationId, 'c-1');
    assert.equal(calls.length, 2);

    const paymentHeader = getHeader(calls[1].init?.headers, 'X-PAYMENT');
    const payment = JSON.parse(String(paymentHeader));
    assert.equal(payment.recipient, 'TreasuryWallet111111111111111111111111111111');
    assert.equal(payment.asset, 'SOL');
    assert.equal(payment.amount, 0.01);
    assert.equal(typeof payment.paymentId, 'string');
    assert.ok(payment.paymentId.length >= 8);
    assert.equal(
      payment.txSignature,
      '5jY8QzE6M9k1W2n3V4aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789ABCD',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not retry overage when payment mode is not enabled', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    return jsonResponse(
      {
        error: {
          code: 'payment_required',
          message: 'Conversation write limit exceeded.',
        },
      },
      402,
    );
  };

  try {
    const client = new PartnerApiClient({
      baseUrl: 'https://partners.andmilo.com',
      apiKey: 'mk_live_test',
    });

    await assert.rejects(
      () =>
        client.createConversation('00000000-0000-0000-0000-000000000000', {
          message: 'hello',
        }),
      /Partner API error \(402\)/,
    );

    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses 402 response headers as fallback for payment requirements', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ init?: RequestInit }> = [];

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ init });
    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          error: { code: 'payment_required', details: {} },
        }),
        {
          status: 402,
          headers: {
            'Content-Type': 'application/json',
            'X-Payment-Recipient': 'TreasuryWallet111111111111111111111111111111',
            'X-Payment-Options': 'USDC:0.25,SOL:0.01',
          },
        },
      );
    }
    return jsonResponse({ data: { messageId: 'm-1' } }, 200);
  };

  try {
    const client = new PartnerApiClient({
      baseUrl: 'https://partners.andmilo.com',
      apiKey: 'mk_live_test',
    });

    const response = await client.sendMessage(
      '00000000-0000-0000-0000-000000000000',
      'conversation-1',
      { message: 'ping' },
      {
        enabled: true,
        asset: 'USDC',
        txSignature:
          '6kY8QzE6M9k1W2n3V4aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789ABCD',
      },
    ) as { data: { messageId: string } };

    assert.equal(response.data.messageId, 'm-1');
    assert.equal(calls.length, 2);
    const paymentHeader = getHeader(calls[1].init?.headers, 'X-PAYMENT');
    const payment = JSON.parse(String(paymentHeader));
    assert.equal(payment.recipient, 'TreasuryWallet111111111111111111111111111111');
    assert.equal(payment.asset, 'USDC');
    assert.equal(payment.amount, 0.25);
    assert.equal(typeof payment.paymentId, 'string');
    assert.ok(payment.paymentId.length >= 8);
    assert.equal(
      payment.txSignature,
      '6kY8QzE6M9k1W2n3V4aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789ABCD',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails fast when 402 response omits payment requirements', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    return jsonResponse(
      {
        error: {
          code: 'payment_required',
          details: {},
        },
      },
      402,
    );
  };

  try {
    const client = new PartnerApiClient({
      baseUrl: 'https://partners.andmilo.com',
      apiKey: 'mk_live_test',
    });

    await assert.rejects(
      () =>
        client.sendMessage(
          '00000000-0000-0000-0000-000000000000',
          'conversation-1',
          { message: 'ping' },
          {
            enabled: true,
            asset: 'USDC',
            txSignature:
              '7kY8QzE6M9k1W2n3V4aBcDeFgHiJkLmNoPqRsTuVwXyZ123456789ABCD',
          },
        ),
      /did not provide payment requirements/,
    );

    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fails when overage payment is enabled without tx signature', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    jsonResponse(
      {
        error: {
          code: 'payment_required',
          details: {
            recipient: 'TreasuryWallet111111111111111111111111111111',
            options: [{ asset: 'USDC', amount: 0.25 }],
          },
        },
      },
      402,
    );

  try {
    const client = new PartnerApiClient({
      baseUrl: 'https://partners.andmilo.com',
      apiKey: 'mk_live_test',
    });

    await assert.rejects(
      () =>
        client.createConversation(
          '00000000-0000-0000-0000-000000000000',
          { message: 'hello' },
          { enabled: true, asset: 'USDC' },
        ),
      /Missing payment tx signature/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
