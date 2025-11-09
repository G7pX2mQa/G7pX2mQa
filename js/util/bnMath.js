// js/game/util/bnMath.js

import { BigNum } from './bigNum.js';

export function approxLog10BigNum(value) {
  if (!(value instanceof BigNum)) {
    try { value = BigNum.fromAny(value ?? 0); } catch { return Number.NEGATIVE_INFINITY; }
  }
  if (!value) return Number.NEGATIVE_INFINITY;
  if (value.isZero?.()) return Number.NEGATIVE_INFINITY;
  if (value.isInfinite?.()) return Number.POSITIVE_INFINITY;

  let storage;
  try { storage = value.toStorage(); } catch { return Number.NEGATIVE_INFINITY; }

  const parts = storage.split(':');
  const sigStr = parts[2] ?? '0';
  let expPart = parts[3] ?? '0';
  let offsetStr = '0';
  const caret = expPart.indexOf('^');
  if (caret >= 0) {
    offsetStr = expPart.slice(caret + 1) || '0';
    expPart   = expPart.slice(0, caret) || '0';
  }
  const baseExp = Number(expPart || '0');
  const offset  = Number(offsetStr || '0');
  const sigNum  = Number(sigStr || '0');
  if (!Number.isFinite(sigNum) || sigNum <= 0) return Number.NEGATIVE_INFINITY;
  const expSum = (Number.isFinite(baseExp) ? baseExp : 0) + (Number.isFinite(offset) ? offset : 0);
  return Math.log10(sigNum) + expSum;
}

export function bigNumFromLog10(log10Value) {
  if (!Number.isFinite(log10Value) || log10Value >= BigNum.MAX_E) {
    return BigNum.fromAny('Infinity');
  }
  let exponent = Math.floor(log10Value);
  let fractional = log10Value - exponent;
  if (!Number.isFinite(fractional)) fractional = 0;

  let mantissa = Math.pow(10, fractional);
  if (!Number.isFinite(mantissa) || mantissa <= 0) mantissa = 1;
  if (mantissa >= 10) { mantissa /= 10; exponent += 1; }

  let exponentStr;
  try {
    exponentStr = Number.isFinite(exponent)
      ? exponent.toLocaleString('en', { useGrouping: false })
      : String(exponent);
  } catch {
    exponentStr = String(exponent);
  }

  const sci = `${mantissa.toPrecision(18)}e${exponentStr}`;
  try { return BigNum.fromScientific(sci).floorToInteger(); }
  catch { return BigNum.fromAny('Infinity'); }
}
