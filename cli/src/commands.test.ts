import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMANDS,
  describeApprovalRequests,
  parseApprovalFlags,
  parseModelVersionFlag,
  parseSourceFamilyFlag,
  parseFundingAmountSolFlag,
  parseTradingAccountIdFlag,
  parseResearchTicker,
  validateCreateOrderDependants,
  validateMinValueUsdFlag,
  validatePagingFlags,
  validateResearchWindowFlags,
  warnRetiredAllocationClasses,
} from './commands.js';

function makeArray(size: number) {
  return Array.from({ length: size }, (_, i) => ({ index: i }));
}

test('allows dependant ladders within configured caps', () => {
  assert.doesNotThrow(() => {
    validateCreateOrderDependants(makeArray(5), makeArray(3));
  });
});

test('rejects take-profit ladders above max size', () => {
  assert.throws(
    () => validateCreateOrderDependants(makeArray(6), makeArray(0)),
    /takeProfits cannot exceed 5 entries/,
  );
});

test('rejects stop-loss ladders above max size', () => {
  assert.throws(
    () => validateCreateOrderDependants(makeArray(0), makeArray(6)),
    /stopLosses cannot exceed 5 entries/,
  );
});

test('rejects combined dependant ladders above total max size', () => {
  assert.throws(
    () => validateCreateOrderDependants(makeArray(5), makeArray(4)),
    /Total dependant orders cannot exceed 8/,
  );
});

test('rejects non-array dependant payloads', () => {
  assert.throws(
    () => validateCreateOrderDependants({ invalid: true }, makeArray(0)),
    /--take-profits-json must be a JSON array/,
  );
});

test('allows paging flags within configured caps', () => {
  assert.doesNotThrow(() => {
    validatePagingFlags('1', '100');
  });
});

test('rejects page above configured max', () => {
  assert.throws(
    () => validatePagingFlags('101', '25'),
    /--page cannot exceed 100/,
  );
});

test('rejects page-size above configured max', () => {
  assert.throws(
    () => validatePagingFlags('1', '101'),
    /--page-size cannot exceed 100/,
  );
});

test('rejects non-integer paging values', () => {
  assert.throws(
    () => validatePagingFlags('1.5', '10'),
    /--page must be a positive integer/,
  );
});

test('accepts canonical partner model ids', () => {
  assert.equal(parseModelVersionFlag('gpt-5.2-high'), 'gpt-5.2-high');
  assert.equal(parseModelVersionFlag('gpt-5.4'), 'gpt-5.4');
  assert.equal(parseModelVersionFlag('gpt-5.6-terra'), 'gpt-5.6-terra');
});

test('accepts claude-sonnet-5.5 as a canonical model version', () => {
  assert.equal(parseModelVersionFlag('claude-sonnet-5.5'), 'claude-sonnet-5.5');
});

test('maps retired Claude Opus model versions to claude-sonnet-5.5 with a notice', () => {
  for (const retired of ['claude-opus-4.5', 'claude-opus-4.6']) {
    const notices: string[] = [];
    assert.equal(
      parseModelVersionFlag(retired, (message) => notices.push(message)),
      'claude-sonnet-5.5',
    );
    assert.deepEqual(notices, [`--model-version ${retired} is retired; using claude-sonnet-5.5.`]);
  }
});

test('rejects non-canonical Claude spellings', () => {
  for (const alias of ['claude-opus-4-6', '4.6', 'claude-sonnet-5-5']) {
    assert.throws(() => parseModelVersionFlag(alias), /--model-version must be one of:/);
  }
});

test('accepts null model version sentinel', () => {
  assert.equal(parseModelVersionFlag('null'), null);
});

test('rejects internal model aliases', () => {
  assert.throws(
    () => parseModelVersionFlag('milo-pro'),
    /--model-version must be one of:/,
  );
});

// ── Research flag validation (mirrors the partner API zod schemas) ──

test('research ticker is trimmed, upper-cased and pattern-checked', () => {
  assert.equal(parseResearchTicker(' nvda ', true), 'NVDA');
  assert.equal(parseResearchTicker('brk.b', true), 'BRK.B');
  assert.equal(parseResearchTicker('BF-B', true), 'BF-B');
  for (const bad of ['', 'TOOLONGTICKER', '123', 'NV DA', 'nv$']) {
    assert.throws(() => parseResearchTicker(bad, true), /--ticker/, bad);
  }
});

test('research ticker is optional for market-wide congress trades', () => {
  assert.equal(parseResearchTicker(undefined, false), undefined);
  assert.throws(() => parseResearchTicker(undefined, true), /Missing required flag --ticker/);
  assert.throws(() => parseResearchTicker('BAD TICKER', false), /--ticker must be/);
});

test('research window flags enforce days <= 365 and limit <= 100 (news: 12)', () => {
  assert.doesNotThrow(() => validateResearchWindowFlags('365', '100'));
  assert.doesNotThrow(() => validateResearchWindowFlags(undefined, undefined));
  assert.throws(() => validateResearchWindowFlags('366', '10'), /--days cannot exceed 365/);
  assert.throws(() => validateResearchWindowFlags('0', '10'), /--days must be a positive integer/);
  assert.throws(() => validateResearchWindowFlags('30', '101'), /--limit cannot exceed 100/);
  assert.throws(() => validateResearchWindowFlags(undefined, '13', 12), /--limit cannot exceed 12/);
  assert.doesNotThrow(() => validateResearchWindowFlags(undefined, '12', 12));
});

test('min-value-usd must be a non-negative number', () => {
  assert.doesNotThrow(() => validateMinValueUsdFlag(undefined));
  assert.doesNotThrow(() => validateMinValueUsdFlag('0'));
  assert.doesNotThrow(() => validateMinValueUsdFlag('100000'));
  assert.throws(() => validateMinValueUsdFlag('-1'), /--min-value-usd/);
  assert.throws(() => validateMinValueUsdFlag('abc'), /--min-value-usd/);
});

test('research commands are registered with the documented flags', () => {
  const byName = new Map(COMMANDS.map((c) => [c.name, c]));
  for (const name of [
    'research-digest',
    'insider-transactions',
    'insider-buys',
    'congress-trades',
    '8k-events',
    'analyst-consensus',
    'fundamentals',
    'earnings-timeline',
    'stock-news',
    'peers',
  ]) {
    assert.ok(byName.has(name), `missing command ${name}`);
  }
  assert.ok(byName.get('research-digest')!.flags.find((f) => f.name === 'ticker')?.required);
  assert.equal(byName.get('congress-trades')!.flags.find((f) => f.name === 'ticker')?.required, undefined);
  assert.ok(byName.get('insider-buys')!.flags.some((f) => f.name === 'min-value-usd'));
  for (const licensed of ['analyst-consensus', 'fundamentals', 'earnings-timeline', 'stock-news', 'peers']) {
    assert.match(byName.get(licensed)!.description, /optional, licensed/);
  }
});

test('research command handlers forward validated flags to the client', async () => {
  const calls: Array<[string, unknown]> = [];
  const client = new Proxy(
    {},
    {
      get:
        (_t, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, args]);
          return Promise.resolve({ data: [] });
        },
    },
  ) as any;
  const config = {} as any;
  const run = (name: string, flags: Record<string, string | undefined>) =>
    COMMANDS.find((c) => c.name === name)!.handler(flags, client, config);

  await run('research-digest', { ticker: 'nvda' });
  await run('insider-transactions', { ticker: 'NVDA', days: '30', limit: '5' });
  await run('insider-buys', { days: '14', 'min-value-usd': '100000', limit: '10' });
  await run('congress-trades', {});
  await run('8k-events', { ticker: 'nvda' });
  await run('stock-news', { ticker: 'nvda', limit: '12' });

  assert.deepEqual(calls, [
    ['getStockResearchDigest', ['NVDA']],
    ['getInsiderTransactions', [{ ticker: 'NVDA', days: '30', limit: '5' }]],
    ['getRecentInsiderBuys', [{ days: '14', minValueUsd: '100000', limit: '10' }]],
    ['getCongressTrades', [{ ticker: undefined, days: undefined, limit: undefined }]],
    ['get8kEvents', [{ ticker: 'NVDA', days: undefined, limit: undefined }]],
    ['getStockNews', [{ ticker: 'NVDA', limit: '12' }]],
  ]);

  await assert.rejects(run('research-digest', {}), /Missing required flag --ticker/);
  await assert.rejects(run('insider-transactions', { ticker: 'NVDA', limit: '101' }), /--limit cannot exceed 100/);
  await assert.rejects(run('stock-news', { ticker: 'NVDA', limit: '13' }), /--limit cannot exceed 12/);
});

test('--source-family accepts registered feeds and "null", rejects anything else', () => {
  assert.equal(parseSourceFamilyFlag(undefined), undefined);
  assert.equal(parseSourceFamilyFlag('congress-ptr'), 'congress-ptr');
  assert.equal(parseSourceFamilyFlag(' NULL '), null);
  assert.throws(() => parseSourceFamilyFlag('congress'), /--source-family must be one of/);
  assert.throws(() => parseSourceFamilyFlag(''), /--source-family must be one of/);
});

test('create-strategy and update-strategy forward sourceFamily', async () => {
  const calls: Array<[string, unknown[]]> = [];
  const client = new Proxy(
    {},
    {
      get:
        (_t, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, args]);
          return Promise.resolve({ data: {} });
        },
    },
  ) as any;
  const run = (name: string, flags: Record<string, string | undefined>) =>
    COMMANDS.find((c) => c.name === name)!.handler(flags, client, {} as any);

  await run('create-strategy', {
    'user-id': 'u1',
    name: 'Congress buys',
    strategy: 'CUSTOM',
    'source-family': 'congress-ptr',
  });
  await run('update-strategy', { 'user-id': 'u1', 'strategy-id': 's1', 'source-family': 'null' });
  await run('update-strategy', { 'user-id': 'u1', 'strategy-id': 's1', name: 'x' });

  assert.equal((calls[0][1][1] as any).sourceFamily, 'congress-ptr');
  assert.equal((calls[1][1][2] as any).sourceFamily, null);
  assert.ok(!('sourceFamily' in (calls[2][1][2] as any)));
});

test('a bare --ticker is a missing ticker, not the ticker TRUE', () => {
  assert.throws(() => parseResearchTicker('true', true), /Missing required flag --ticker/);
  assert.throws(() => parseResearchTicker('true', false), /Missing required flag --ticker/);
  assert.equal(parseResearchTicker('nvda', true), 'NVDA');
});

test('--funding-amount-sol and --trading-account-id validate their values', () => {
  assert.equal(parseFundingAmountSolFlag(undefined), undefined);
  assert.equal(parseFundingAmountSolFlag('2.5'), 2.5);
  for (const bad of ['0.5', 'abc', '', 'true']) {
    assert.throws(() => parseFundingAmountSolFlag(bad), /--funding-amount-sol/);
  }
  assert.equal(parseTradingAccountIdFlag(undefined), undefined);
  assert.equal(parseTradingAccountIdFlag(' acct-1 '), 'acct-1');
  assert.throws(() => parseTradingAccountIdFlag('true'), /--trading-account-id/);
});

test('deploy-arena forwards fundingAmountSol; settings commands route by trading account', async () => {
  const calls: Array<[string, unknown[]]> = [];
  const client = new Proxy(
    {},
    {
      get:
        (_t, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, args]);
          return Promise.resolve({ data: {} });
        },
    },
  ) as any;
  const run = (name: string, flags: Record<string, string | undefined>, config: any = {}) =>
    COMMANDS.find((c) => c.name === name)!.handler(flags, client, config);

  await run('deploy-arena', { 'user-id': 'u1', 'strategy-id': 's1', 'funding-amount-sol': '2.5' });
  assert.deepEqual(calls.at(-1), ['deployArenaStrategy', ['u1', { strategyId: 's1', fundingAmountSol: 2.5 }]]);
  await run('deploy-arena', { 'user-id': 'u1', 'strategy-id': 's1' });
  assert.deepEqual(calls.at(-1), ['deployArenaStrategy', ['u1', { strategyId: 's1' }]]);

  await run('get-settings', { 'trading-account-id': 'acct-2' });
  assert.deepEqual(calls.at(-1), ['getAccountAutoTradeSettings', ['acct-2']]);
  await run('update-settings', { 'trading-account-id': 'acct-2', 'is-active': 'false' });
  assert.deepEqual(calls.at(-1), [
    'updateAccountAutoTradeSettings',
    ['acct-2', { isActive: false }],
  ]);
  await run('get-settings', {}, { user_id: 'u1' });
  assert.deepEqual(calls.at(-1), ['getAutoTradeSettings', ['u1']]);
});

const APPROVAL_ID = '6cf9624c-f01e-4d64-b328-64d1f77720b6';

test('--approve / --reject take one well-formed approval id', () => {
  assert.equal(parseApprovalFlags(undefined, undefined), undefined);
  assert.deepEqual(parseApprovalFlags(` ${APPROVAL_ID} `, undefined), {
    approvalId: APPROVAL_ID,
    decision: 'approve',
  });
  assert.deepEqual(parseApprovalFlags(undefined, APPROVAL_ID), {
    approvalId: APPROVAL_ID,
    decision: 'reject',
  });
  assert.throws(() => parseApprovalFlags(APPROVAL_ID, APPROVAL_ID), /only one of --approve or --reject/);
  assert.throws(() => parseApprovalFlags('true', undefined), /Missing value for --approve/);
  assert.throws(() => parseApprovalFlags(undefined, ''), /Missing value for --reject/);
  assert.throws(() => parseApprovalFlags('6cf9624c', undefined), /--approve must be an approval id/);
});

test('send-message forwards an approval decision with a default message', async () => {
  const calls: Array<[string, unknown[]]> = [];
  const client = new Proxy(
    {},
    {
      get:
        (_t, method: string) =>
        (...args: unknown[]) => {
          calls.push([method, args]);
          return Promise.resolve({ data: {} });
        },
    },
  ) as any;
  const run = (flags: Record<string, string | undefined>) =>
    COMMANDS.find((c) => c.name === 'send-message')!.handler(
      { 'user-id': 'u1', 'conversation-id': 'c1', ...flags },
      client,
      {} as any,
    );

  await run({ approve: APPROVAL_ID });
  assert.deepEqual(calls.at(-1), [
    'sendMessage',
    ['u1', 'c1', { message: 'approve', approval: { approvalId: APPROVAL_ID, decision: 'approve' } }, undefined],
  ]);
  await run({ reject: APPROVAL_ID });
  assert.deepEqual(calls.at(-1), [
    'sendMessage',
    ['u1', 'c1', { message: 'cancel', approval: { approvalId: APPROVAL_ID, decision: 'reject' } }, undefined],
  ]);
  await run({ message: 'go ahead', approve: APPROVAL_ID });
  assert.equal((calls.at(-1)![1][2] as any).message, 'go ahead');
  await run({ message: 'What about JUP?' });
  assert.deepEqual(calls.at(-1), ['sendMessage', ['u1', 'c1', { message: 'What about JUP?' }, undefined]]);

  await assert.rejects(run({}), /Missing required flag --message/);
  await assert.rejects(run({ approve: 'nope' }), /--approve must be an approval id/);
  assert.equal(calls.length, 4);
});

test('describeApprovalRequests falls back to an inferred status when the server omits it', () => {
  const now = new Date('2026-10-15T10:05:00.000Z');
  const request = (approvalId: string, expiresAt: string) => ({
    approvalId,
    expiresAt,
    actions: [{ category: 'send', summary: 'Send 1.5 SOL to 9xQe...VFin' }],
  });
  const older = '11111111-1111-4111-8111-111111111111';
  const expired = '22222222-2222-4222-8222-222222222222';
  const response = {
    data: {
      messages: [
        { messageId: 'm1', role: 'assistant', content: '...', approvalRequest: request(older, '2026-10-15T10:10:00.000Z') },
        { messageId: 'm2', role: 'user', content: 'cancel' },
        { messageId: 'm3', role: 'assistant', content: '...', approvalRequest: request(expired, '2026-10-15T10:00:00.000Z') },
        { messageId: 'm4', role: 'assistant', content: '...', approvalRequest: request(APPROVAL_ID, '2026-10-15T10:10:00.000Z') },
      ],
      processing: false,
    },
  };

  const lines = describeApprovalRequests(response, 'c1', now);
  const setupNote =
    '  No status from the server: the request may still be being set up (it cannot be decided yet); run get-messages again.';
  assert.deepEqual(lines.slice(0, 3), [
    `Approval request ${older} (expires 2026-10-15T10:10:00.000Z) [no longer pending, inferred]:`,
    '  - [send] Send 1.5 SOL to 9xQe...VFin',
    setupNote,
  ]);
  assert.equal(lines[3], `Approval request ${expired} (expires 2026-10-15T10:00:00.000Z) [expired, inferred]:`);
  assert.equal(lines[6], `Approval request ${APPROVAL_ID} (expires 2026-10-15T10:10:00.000Z) [pending, inferred]:`);
  assert.equal(lines.filter((line) => line === setupNote).length, 3);
  assert.ok(lines.includes(`  milo send-message --conversation-id c1 --approve ${APPROVAL_ID}`));
  assert.ok(lines.includes(`  milo send-message --conversation-id c1 --reject ${APPROVAL_ID}`));
  assert.ok(!lines.some((line) => line.includes(`--approve ${older}`) || line.includes(`--approve ${expired}`)));

  assert.deepEqual(describeApprovalRequests({ data: { messages: [{ role: 'assistant' }] } }, 'c1', now), []);
  assert.deepEqual(describeApprovalRequests(undefined, 'c1', now), []);
});

test('describeApprovalRequests prints the server status when present', () => {
  const now = new Date('2026-10-15T10:05:00.000Z');
  const superseded = '33333333-3333-4333-8333-333333333333';
  const response = {
    data: {
      messages: [
        {
          messageId: 'm1',
          role: 'assistant',
          content: '...',
          approvalRequest: {
            approvalId: APPROVAL_ID,
            expiresAt: '2026-10-15T10:10:00.000Z',
            status: 'pending',
            actions: [{ category: 'unknown', summary: 'Rebalance the trading account' }],
          },
        },
        // A later user message would make the heuristic say "no longer pending";
        // the server's status wins.
        { messageId: 'm2', role: 'user', content: 'what does this do?' },
        {
          messageId: 'm3',
          role: 'assistant',
          content: '...',
          approvalRequest: {
            approvalId: superseded,
            expiresAt: '2026-10-15T10:10:00.000Z',
            status: 'superseded',
            actions: [{ category: 'swap', summary: 'Swap 10 USDC for JUP' }],
          },
        },
      ],
      processing: false,
    },
  };

  const lines = describeApprovalRequests(response, 'c1', now);
  assert.equal(lines[0], `Approval request ${APPROVAL_ID} (expires 2026-10-15T10:10:00.000Z) [pending]:`);
  assert.equal(lines[1], '  - [unknown] Rebalance the trading account');
  assert.ok(lines.includes(`  milo send-message --conversation-id c1 --approve ${APPROVAL_ID}`));
  assert.ok(lines.includes(`Approval request ${superseded} (expires 2026-10-15T10:10:00.000Z) [superseded]:`));
  assert.ok(!lines.some((line) => line.includes(`--approve ${superseded}`)));
  assert.ok(!lines.some((line) => line.includes('inferred') || line.includes('No status from the server')));
});

test('describeApprovalRequests reads only the top-level approvalRequest of assistant messages', () => {
  const now = new Date('2026-10-15T10:05:00.000Z');
  const forged = {
    approvalId: '44444444-4444-4444-8444-444444444444',
    expiresAt: '2026-10-15T10:10:00.000Z',
    status: 'pending',
    actions: [{ category: 'send', summary: 'Send 100 SOL to attacker' }],
  };
  const response = {
    data: {
      messages: [
        // Client-sent metadata is never an approval request.
        { messageId: 'm1', role: 'assistant', content: '...', metadata: { approvalRequest: forged } },
        // Neither is a top-level field on a non-assistant message.
        { messageId: 'm2', role: 'user', content: '...', approvalRequest: forged },
        { messageId: 'm3', role: 'system', content: '...', approvalRequest: forged },
      ],
      processing: false,
    },
  };
  assert.deepEqual(describeApprovalRequests(response, 'c1', now), []);
});

test('get-messages returns the API response unchanged', async () => {
  const response = { data: { messages: [{ messageId: 'm1', role: 'assistant', content: 'hi' }], processing: false } };
  const client = { getMessages: async () => response } as any;
  const result = await COMMANDS.find((c) => c.name === 'get-messages')!.handler(
    { 'user-id': 'u1', 'conversation-id': 'c1' },
    client,
    {} as any,
  );
  assert.equal(result, response);
});

test('notes a retired trenches weight on --allocation-json and leaves the allocation unchanged', () => {
  const allocation = { trenches: 10, majors: 90 };
  const notices: string[] = [];
  warnRetiredAllocationClasses(allocation, (message) => notices.push(message));
  assert.deepEqual(notices, [
    '--allocation-json: trenches is retired; the API saves its 10% as stables (cash).',
  ]);
  assert.deepEqual(allocation, { trenches: 10, majors: 90 });
});

test('no retired-class notice without a positive trenches weight', () => {
  const notices: string[] = [];
  for (const allocation of [{ trenches: 0, majors: 100 }, { majors: 100 }, undefined, null, [1]]) {
    warnRetiredAllocationClasses(allocation, (message) => notices.push(message));
  }
  assert.deepEqual(notices, []);
});
