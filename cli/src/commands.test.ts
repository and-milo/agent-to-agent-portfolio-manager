import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCreateOrderDependants } from './commands.js';

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
