/**
 * Money handling.
 *
 * Rule: a monetary value is an integer count of MINOR UNITS (paise, cents).
 * It is never a float, never a Number with a fractional part, and never
 * reconstructed by multiplying a decimal by 100 in floating point.
 *
 * `0.1 + 0.2 !== 0.3` is not a rounding curiosity in a finance product — it is
 * a corrupted ledger. Parsing therefore works on the *string* a user typed and
 * assembles the integer digit by digit.
 */

export const MAX_AMOUNT_MINOR = 1_000_000_000; // ₹1,00,00,000.00 — matches the DB CHECK

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'AUD' | 'CAD' | 'JPY';

interface CurrencyMeta {
  readonly code: CurrencyCode;
  readonly label: string;
  readonly symbol: string;
  readonly decimals: number;
  /** BCP-47 locale whose grouping convention suits the currency. */
  readonly locale: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  INR: { code: 'INR', label: 'Indian Rupee', symbol: '₹', decimals: 2, locale: 'en-IN' },
  USD: { code: 'USD', label: 'US Dollar', symbol: '$', decimals: 2, locale: 'en-US' },
  EUR: { code: 'EUR', label: 'Euro', symbol: '€', decimals: 2, locale: 'de-DE' },
  GBP: { code: 'GBP', label: 'British Pound', symbol: '£', decimals: 2, locale: 'en-GB' },
  AED: { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ', decimals: 2, locale: 'en-AE' },
  SGD: { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$', decimals: 2, locale: 'en-SG' },
  AUD: { code: 'AUD', label: 'Australian Dollar', symbol: 'A$', decimals: 2, locale: 'en-AU' },
  CAD: { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$', decimals: 2, locale: 'en-CA' },
  JPY: { code: 'JPY', label: 'Japanese Yen', symbol: '¥', decimals: 0, locale: 'ja-JP' },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const DEFAULT_CURRENCY: CurrencyCode = 'INR';

export function currencyMeta(code: string): CurrencyMeta {
  return CURRENCIES[code as CurrencyCode] ?? CURRENCIES[DEFAULT_CURRENCY];
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

/** Number of minor units in one major unit, e.g. 100 for INR, 1 for JPY. */
export function minorPerMajor(code: string): number {
  return 10 ** currencyMeta(code).decimals;
}

/* ------------------------------------------------------------------------ */
/* Parsing                                                                   */
/* ------------------------------------------------------------------------ */

export class MoneyParseError extends Error {}

/**
 * Parse user input into minor units without ever touching floating point.
 *
 * Accepts "1234.5", "1,234.50", "₹1,234.50", " 1234 ", "-45" (sign stripped —
 * direction is carried by transaction type, never by the amount).
 * Extra fractional digits are rejected rather than silently rounded, so a
 * fat-fingered "10.567" surfaces as an error instead of becoming ₹10.57.
 */
export function parseMoneyToMinor(input: string | number, currency: string = DEFAULT_CURRENCY): number {
  const decimals = currencyMeta(currency).decimals;

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new MoneyParseError('Enter a valid amount.');
    // Round-trip through a fixed-precision string so binary float noise
    // (e.g. 10.1 * 100 === 1009.9999…) can never reach the integer.
    return parseMoneyToMinor(input.toFixed(decimals), currency);
  }

  const cleaned = input.trim().replace(/[\s,_]/g, '').replace(/^[^0-9.\-]+/, '');
  if (cleaned === '') throw new MoneyParseError('Enter an amount.');

  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) throw new MoneyParseError('Enter a valid amount.');

  const [, , wholeRaw = '', fractionRaw] = match;
  const whole = wholeRaw === '' ? '0' : wholeRaw;
  if (whole === '0' && !fractionRaw) {
    if (wholeRaw === '') throw new MoneyParseError('Enter a valid amount.');
  }

  let fraction = fractionRaw ?? '';
  if (fraction.length > decimals) {
    // Allow a trailing run of zeros ("10.500" for a 2-decimal currency).
    const excess = fraction.slice(decimals);
    if (/[^0]/.test(excess)) {
      throw new MoneyParseError(
        decimals === 0
          ? 'This currency does not use decimals.'
          : `Use at most ${decimals} decimal places.`,
      );
    }
    fraction = fraction.slice(0, decimals);
  }
  fraction = fraction.padEnd(decimals, '0');

  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, '');
  const minor = Number(digits);

  if (!Number.isSafeInteger(minor)) throw new MoneyParseError('That amount is too large.');
  return minor;
}

/** Non-throwing variant for form-level validation. */
export function tryParseMoneyToMinor(
  input: string | number,
  currency: string = DEFAULT_CURRENCY,
): { ok: true; minor: number } | { ok: false; error: string } {
  try {
    return { ok: true, minor: parseMoneyToMinor(input, currency) };
  } catch (error) {
    return { ok: false, error: error instanceof MoneyParseError ? error.message : 'Enter a valid amount.' };
  }
}

/* ------------------------------------------------------------------------ */
/* Formatting                                                                */
/* ------------------------------------------------------------------------ */

const formatterCache = new Map<string, Intl.NumberFormat>();

/**
 * Number formatting is deliberately restricted to `style: 'decimal'`, with the
 * currency symbol prepended from our own table.
 *
 * `style: 'currency'` resolves its symbol from whatever ICU build the runtime
 * ships. Node and the browser disagree — notably on narrow symbols and on
 * whether a non-breaking space follows the symbol — which makes a server-
 * rendered amount differ from the client-rendered one and trips React's
 * hydration check. Decimal grouping (including the Indian 1,00,000 pattern) is
 * stable across every runtime we care about.
 */
function decimalFormatter(currency: string, decimals: number): Intl.NumberFormat {
  const meta = currencyMeta(currency);
  const key = `${meta.locale}:${decimals}`;
  let cached = formatterCache.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(meta.locale, {
      style: 'decimal',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: true,
    });
    formatterCache.set(key, cached);
  }
  return cached;
}

/** Minor units → major units as a Number. Display only, never for arithmetic. */
export function toMajor(minor: number, currency: string = DEFAULT_CURRENCY): number {
  return minor / minorPerMajor(currency);
}

export interface FormatMoneyOptions {
  /** Drop the decimal part entirely, e.g. "₹65,000". */
  compactDecimals?: boolean;
  /** Render "12.4K" / "1.2L" style short forms for dense chart labels. */
  abbreviate?: boolean;
  /** Always prefix with + or −. */
  signed?: boolean;
  /** Omit the currency symbol. */
  bare?: boolean;
}

export function formatMoney(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  options: FormatMoneyOptions = {},
): string {
  const meta = currencyMeta(currency);
  const negative = minor < 0;
  const magnitude = Math.abs(minor);

  let body: string;
  if (options.abbreviate) {
    body = abbreviateMinor(magnitude, meta, options.bare === true);
  } else {
    const decimals = options.compactDecimals ? 0 : meta.decimals;
    const digits = decimalFormatter(currency, decimals).format(toMajor(magnitude, currency));
    body = options.bare ? digits : `${meta.symbol}${digits}`;
  }

  const sign = negative ? '−' : options.signed ? '+' : '';
  return `${sign}${body}`;
}

/**
 * Split a formatted amount into its parts so the UI can render the trailing
 * decimals in a muted tone — the "₹1,894.00" treatment from the references.
 */
export interface MoneyParts {
  sign: '' | '−' | '+';
  symbol: string;
  whole: string;
  fraction: string;
  decimalSeparator: string;
}

export function formatMoneyParts(
  minor: number,
  currency: string = DEFAULT_CURRENCY,
  options: { signed?: boolean } = {},
): MoneyParts {
  const meta = currencyMeta(currency);
  const negative = minor < 0;
  const magnitude = Math.abs(minor);

  const parts = decimalFormatter(currency, meta.decimals).formatToParts(
    toMajor(magnitude, currency),
  );

  let whole = '';
  let fraction = '';
  let decimalSeparator = '.';

  for (const part of parts) {
    if (part.type === 'integer' || part.type === 'group') whole += part.value;
    else if (part.type === 'decimal') decimalSeparator = part.value;
    else if (part.type === 'fraction') fraction += part.value;
  }

  return {
    sign: negative ? '−' : options.signed ? '+' : '',
    symbol: meta.symbol,
    whole,
    fraction,
    decimalSeparator,
  };
}

/** Indian numbering for INR (K / L / Cr), Western for everything else. */
function abbreviateMinor(magnitudeMinor: number, meta: CurrencyMeta, bare: boolean): string {
  const major = magnitudeMinor / 10 ** meta.decimals;
  const symbol = bare ? '' : meta.symbol;
  const round = (value: number) =>
    (Math.round(value * 10) / 10).toLocaleString(meta.locale, { maximumFractionDigits: 1 });

  if (meta.code === 'INR') {
    if (major >= 1e7) return `${symbol}${round(major / 1e7)}Cr`;
    if (major >= 1e5) return `${symbol}${round(major / 1e5)}L`;
    if (major >= 1e3) return `${symbol}${round(major / 1e3)}K`;
  } else {
    if (major >= 1e9) return `${symbol}${round(major / 1e9)}B`;
    if (major >= 1e6) return `${symbol}${round(major / 1e6)}M`;
    if (major >= 1e3) return `${symbol}${round(major / 1e3)}K`;
  }
  return `${symbol}${major.toLocaleString(meta.locale, { maximumFractionDigits: 0 })}`;
}

/* ------------------------------------------------------------------------ */
/* Arithmetic helpers — all integer, all total                               */
/* ------------------------------------------------------------------------ */

export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Percentage as a Number, for display and chart geometry only.
 * Returns 0 when the denominator is 0 so callers never render NaN.
 */
export function percentOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return (part / whole) * 100;
}

export function formatPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Split an amount into `count` integer parts that sum back exactly to the
 * original. Remainder paise go to the earliest parts, so nothing is lost.
 */
export function splitMinorEvenly(minor: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(minor / count);
  const remainder = minor - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}
