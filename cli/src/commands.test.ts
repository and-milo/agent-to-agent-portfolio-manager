import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerApiClient } from './client.js';
import {
  COMMANDS,
  parseModelVersionFlag,
  validateCreateOrderDependants,
  validatePagingFlags,
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

test('accepts null model version sentinel', () => {
  assert.equal(parseModelVersionFlag('null'), null);
});

test('rejects internal model aliases', () => {
  assert.throws(
    () => parseModelVersionFlag('milo-pro'),
    /--model-version must be one of:/,
  );
});

// The partner API strips unknown body keys, so a dataSources flag would be
// silently dropped. Keep the settings/strategy commands free of it.
const SETTINGS_WRITE_COMMANDS = ['update-settings', 'create-strategy', 'update-strategy'];

function getCommand(name: string) {
  const command = COMMANDS.find((c) => c.name === name);
  assert.ok(command, `missing command ${name}`);
  return command;
}

function captureClient() {
  const bodies: Record<string, unknown>[] = [];
  const record = async (...args: unknown[]) => {
    bodies.push(args[args.length - 1] as Record<string, unknown>);
    return {};
  };
  const client = {
    updateAutoTradeSettings: record,
    createStrategy: record,
    updateStrategy: record,
  } as unknown as PartnerApiClient;
  return { client, bodies };
}

test('settings and strategy commands do not expose dataSources', () => {
  for (const name of SETTINGS_WRITE_COMMANDS) {
    const command = getCommand(name);
    for (const flag of command.flags) {
      assert.doesNotMatch(flag.name, /data-sources/i, `${name} --${flag.name}`);
      assert.doesNotMatch(flag.description, /dataSources/, `${name} --${flag.name}`);
    }
  }
});

test('settings and strategy commands send assetClassSettings without dataSources', async () => {
  const assetClassSettings = { memes: { maxPositionUsd: 50 } };
  const flags: Record<string, string> = {
    'user-id': 'user-1',
    'strategy-id': 'strategy-1',
    name: 'Test',
    strategy: 'SWING TRADER',
    'asset-class-settings-json': JSON.stringify(assetClassSettings),
    'data-sources-json': '{"fundingRates":true}',
  };
  for (const name of SETTINGS_WRITE_COMMANDS) {
    const { client, bodies } = captureClient();
    await getCommand(name).handler(flags, client, {});
    assert.equal(bodies.length, 1, name);
    assert.deepEqual(bodies[0].assetClassSettings, assetClassSettings, name);
    assert.equal('dataSources' in bodies[0], false, name);
  }
});
