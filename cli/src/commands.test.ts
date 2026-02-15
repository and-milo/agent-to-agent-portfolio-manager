import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCreateOrderDependants, validatePagingFlags } from './commands.js';

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
