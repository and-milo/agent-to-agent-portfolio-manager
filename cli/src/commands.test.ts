import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMANDS,
  parseModelVersionFlag,
  parseSourceFamilyFlag,
  parseResearchTicker,
  validateCreateOrderDependants,
  validateMinValueUsdFlag,
  validatePagingFlags,
  validateResearchWindowFlags,
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
