import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMoney,
  formatMoneyParts,
  parseMoneyToMinor,
  MoneyParseError,
  percentOf,
  splitMinorEvenly,
  sumMinor,
  toMajor,
} from '../src/lib/money.ts';

/**
 * Money is the part of this product that must not be "mostly right".
 * These tests pin the exact-integer contract.
 */

describe('parseMoneyToMinor', () => {
  test('parses plain and grouped decimals exactly', () => {
    assert.equal(parseMoneyToMinor('1234.56', 'INR'), 123456);
    assert.equal(parseMoneyToMinor('1,234.56', 'INR'), 123456);
    assert.equal(parseMoneyToMinor('₹1,234.56', 'INR'), 123456);
    assert.equal(parseMoneyToMinor('  1234  ', 'INR'), 123400);
    assert.equal(parseMoneyToMinor('0.05', 'INR'), 5);
    assert.equal(parseMoneyToMinor('.5', 'INR'), 50);
  });

  test('never loses a paisa to binary floating point', () => {
    // The canonical failure: 0.1 + 0.2 !== 0.3 in floats. As integers it is exact.
    assert.equal(parseMoneyToMinor('0.1', 'INR') + parseMoneyToMinor('0.2', 'INR'), 30);
    assert.notEqual(0.1 + 0.2, 0.3); // the trap this design avoids

    // 10.1 * 100 is 1009.9999999999999 in floating point; parsing is exact.
    assert.equal(parseMoneyToMinor('10.1', 'INR'), 1010);
    assert.equal(parseMoneyToMinor('0.29', 'INR'), 29);
    assert.equal(parseMoneyToMinor('8.11', 'INR'), 811);
  });

  test('accepts a number input without float drift', () => {
    assert.equal(parseMoneyToMinor(10.1, 'INR'), 1010);
    assert.equal(parseMoneyToMinor(0.29, 'INR'), 29);
    assert.equal(parseMoneyToMinor(1234.56, 'INR'), 123456);
  });

  test('tolerates trailing zeros beyond the currency precision', () => {
    assert.equal(parseMoneyToMinor('10.500', 'INR'), 1050);
    assert.equal(parseMoneyToMinor('10.5000000', 'INR'), 1050);
  });

  test('rejects excess significant decimals rather than rounding', () => {
    assert.throws(() => parseMoneyToMinor('10.567', 'INR'), MoneyParseError);
  });

  test('honours zero-decimal currencies', () => {
    assert.equal(parseMoneyToMinor('1200', 'JPY'), 1200);
    assert.throws(() => parseMoneyToMinor('1200.5', 'JPY'), MoneyParseError);
  });

  test('rejects empty and malformed input', () => {
    assert.throws(() => parseMoneyToMinor('', 'INR'), MoneyParseError);
    assert.throws(() => parseMoneyToMinor('abc', 'INR'), MoneyParseError);
    assert.throws(() => parseMoneyToMinor(Number.NaN, 'INR'), MoneyParseError);
  });

  test('strips a leading sign — direction comes from transaction type', () => {
    assert.equal(parseMoneyToMinor('-450', 'INR'), 45000);
  });
});

describe('formatMoney', () => {
  test('uses Indian grouping for INR', () => {
    assert.equal(formatMoney(10000000, 'INR'), '₹1,00,000.00');
    assert.equal(formatMoney(123456, 'INR'), '₹1,234.56');
  });

  test('uses Western grouping for USD', () => {
    assert.equal(formatMoney(10000000, 'USD'), '$100,000.00');
  });

  test('compactDecimals drops the paise', () => {
    assert.equal(formatMoney(123456, 'INR', { compactDecimals: true }), '₹1,235');
  });

  test('renders a true minus sign for negatives', () => {
    assert.equal(formatMoney(-123456, 'INR'), '−₹1,234.56');
  });

  test('abbreviates with Indian units for INR', () => {
    assert.equal(formatMoney(1000000000, 'INR', { abbreviate: true }), '₹1Cr');
    assert.equal(formatMoney(10000000, 'INR', { abbreviate: true }), '₹1L');
    assert.equal(formatMoney(500000, 'INR', { abbreviate: true }), '₹5K');
  });

  test('round-trips through parse without drift', () => {
    for (const value of ['0.01', '9.99', '1234.56', '99999.99', '100000.00']) {
      const minor = parseMoneyToMinor(value, 'INR');
      assert.equal(toMajor(minor, 'INR').toFixed(2), Number(value).toFixed(2));
    }
  });
});

describe('formatMoneyParts', () => {
  test('splits the figure so the UI can mute the decimals', () => {
    const parts = formatMoneyParts(189400, 'INR');
    assert.equal(parts.symbol, '₹');
    assert.equal(parts.whole, '1,894');
    assert.equal(parts.fraction, '00');
    assert.equal(parts.decimalSeparator, '.');
    assert.equal(parts.sign, '');
  });

  test('marks negatives', () => {
    assert.equal(formatMoneyParts(-500, 'INR').sign, '−');
  });
});

describe('integer arithmetic helpers', () => {
  test('sumMinor stays exact over many values', () => {
    const values = Array.from({ length: 1000 }, () => 1);
    assert.equal(sumMinor(values), 1000);
  });

  test('percentOf guards divide-by-zero', () => {
    assert.equal(percentOf(50, 0), 0);
    assert.equal(percentOf(50, 200), 25);
  });

  test('splitMinorEvenly conserves every paisa', () => {
    const parts = splitMinorEvenly(100, 3);
    assert.deepEqual(parts, [34, 33, 33]);
    assert.equal(sumMinor(parts), 100);

    const odd = splitMinorEvenly(1, 4);
    assert.equal(sumMinor(odd), 1);
  });
});
