// js/util/bigNum.js
export class BigNum {
  static DEFAULT_PRECISION = 18;
  static MAX_E = 1.7976931348623157e+308; // Number.MAX_VALUE
  static MAX_PLAIN_DIGITS = 1_000_000;    // safety cap for plain integer strings

  constructor(sig, e, p = BigNum.DEFAULT_PRECISION) {
    let effectiveE = 0;
    let inf = false;

    if (e && typeof e === 'object' && ('base' in e || 'inf' in e)) {
      const base = Number(e.base ?? 0);
      inf = !!e.inf;
      if (inf || !Number.isFinite(base) || base >= BigNum.MAX_E) {
        effectiveE = BigNum.MAX_E;
        inf = true;
      } else {
        effectiveE = Math.trunc(base);
      }
    } else {
      const ee = Number(e);
      if (!Number.isFinite(ee) || ee >= BigNum.MAX_E) {
        effectiveE = BigNum.MAX_E;
        inf = true;
      } else {
        effectiveE = Math.trunc(ee);
      }
    }

    let targetP = p | 0;
    const absE = Math.abs(effectiveE);
    if (!inf && absE >= 10) {
      const eMag = Math.floor(Math.log10(absE));
      targetP = Math.max(0, 18 - eMag);
    }
    this.p = Math.min(p | 0, targetP);

    this.e = effectiveE;
    this.inf = inf;

    if (this.p === 0 && !inf) {
      this.sig = 1n; 
    } else {
      this.sig = (sig !== '' && sig !== null && sig !== undefined) ? BigInt(sig) : 1n;
    }

    this.#normalize();
  }

  // ---------------------- FACTORIES ----------------------
  static zero(p = BigNum.DEFAULT_PRECISION) { return new BigNum(0n, 0, p); }

  static fromInt(n, p = BigNum.DEFAULT_PRECISION) {
    return new BigNum(BigInt(n), 0, p);
  }

  static fromScientific(str, p = BigNum.DEFAULT_PRECISION) {
    const s = String(str ?? '').trim();
    if (!s) throw new TypeError('Invalid BigNum input: ' + str);

    if (/^inf(?:inity)?$/i.test(s)) {
      return new BigNum(1n, BigNum.MAX_E, p);
    }

    const match = s.match(/^([+-]?\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
    if (!match) {
      return new BigNum(BigInt(s), 0, p);
    }

    let [, intPart, fracPart = '', expPart] = match;
    let exponent = expPart ? parseInt(expPart, 10) : 0;
    exponent -= fracPart.length;

    let sign = '';
    let digitsRaw = intPart + fracPart;
    if (digitsRaw.startsWith('-')) {
        sign = '-';
        digitsRaw = digitsRaw.slice(1);
    } else if (digitsRaw.startsWith('+')) {
        digitsRaw = digitsRaw.slice(1);
    }

    const digits = digitsRaw.replace(/^0+/, '') || '0';
    const sig = BigInt(sign + digits);
    return new BigNum(sig, exponent, p);
  }

  static fromStorage(str, p = BigNum.DEFAULT_PRECISION) {
    if (!str) return null;
    if (typeof str !== 'string') str = String(str);
    if (str.startsWith('BN:')) {
      const parts = str.split(':');
      if (parts[1] === 'infinite') {
        return new BigNum(1n, { base: BigNum.MAX_E, inf: true }, p);
      }
      const [, pStr, sigStr, eStr] = parts;
      const pp = parseInt(pStr, 10) || p;
      let eNum = Number(eStr);
      if (!Number.isFinite(eNum)) eNum = BigNum.MAX_E;
      const parsedSig = sigStr ? BigInt(sigStr) : 1n;
      return new BigNum(parsedSig, { base: eNum }, pp);
    }
    return BigNum.fromScientific(str, p);
  }

  // Accepts: BigNum | "BN:..." | scientific string | number | bigint
  static fromAny(input, p = BigNum.DEFAULT_PRECISION) {
    if (input instanceof BigNum) return input;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.startsWith('BN:')) return BigNum.fromStorage(trimmed, p);
      if (/^inf(?:inity)?$/i.test(trimmed)) return new BigNum(1n, BigNum.MAX_E, p);
      if (/^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed)) return BigNum.fromScientific(trimmed, p);
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) return new BigNum(1n, BigNum.MAX_E, p);
      return BigNum.fromScientific(input.toString(), p);
    }
    if (typeof input === 'bigint') return BigNum.fromInt(input, p);
    throw new TypeError('Unsupported BigNum input: ' + input);
    }

  // ---------------------- PERSISTENCE ----------------------
  toStorage() {
    if (this.inf) return `BN:infinite`;
    if (this.p === 0) return `BN:0::${this.e}`;
    return `BN:${this.p}:${this.sig.toString()}:${this.e}`;
  }

  clone() {
    return new BigNum(this.sig, { base: this.e, inf: this.inf }, this.p);
  }

  // ---------------------- STATE QUERIES ----------------------
  isZero() { return !this.inf && this.sig === 0n; }
  isInfinite() { return !!this.inf; }
  isNegative() { return false; }

  sub(b) {
    b = BigNum.fromAny(b, this.p);

    if (this.inf) {
      if (b.inf) return BigNum.zero(this.p);
      return this.clone();
    }
    if (b.isZero()) return this.clone();
    if (b.inf) return BigNum.zero(this.p);

    if (this.cmp(b) <= 0) return BigNum.zero(this.p);

    const expCmp = this.#compareExponent(b);
    if (expCmp >= 0) {
      const aligned = expCmp === 0 ? b.sig : this.#alignSig(b);
      const diffSig = this.sig - aligned;
      if (diffSig > 0n) {
        return new BigNum(diffSig, this.#expObj(), this.p);
      }
    }

    try {
      const aPlain = this.toPlainIntegerString();
      const bPlain = b.toPlainIntegerString();
      if (aPlain === 'Infinity') return this.clone();
      if (bPlain === 'Infinity') return BigNum.zero(this.p);
      const diff = BigInt(aPlain) - BigInt(bPlain);
      if (diff <= 0n) return BigNum.zero(this.p);
      return BigNum.fromInt(diff, this.p);
    } catch {
      return BigNum.zero(this.p);
    }
  }

  // ---------------------- PRIVATE HELPERS ----------------------
  #pow10(k) { return k <= 0 ? 1n : 10n ** BigInt(k); }

  #expObj() {
    return { base: this.e, inf: this.inf };
  }

  #adjustExponent(delta) {
    if (this.inf || !delta) return;
    this.e += delta;
  }

  #compareExponent(other) {
    if (this.inf || other.inf) {
      if (this.inf && other.inf) return 0;
      return this.inf ? 1 : -1;
    }
    if (this.e > other.e) return 1;
    if (this.e < other.e) return -1;
    return 0;
  }

  #expDiff(other) {
    if (this.inf || other.inf) {
      if (this.inf && other.inf) return 0n;
      return this.inf ? BigInt(this.p + 3) : -BigInt(this.p + 3);
    }
    const diff = BigInt(Math.trunc(this.e - other.e));
    const absDiff = diff < 0n ? -diff : diff;
    const limit = BigInt(this.p + 2);
    if (absDiff > limit) {
      return diff > 0n ? BigInt(this.p + 3) : -BigInt(this.p + 3);
    }
    return diff;
  }

  #effectiveExponentNumber() {
    if (this.inf) return Number.POSITIVE_INFINITY;
    return this.e;
  }

  #normalize() {
    if (this.inf) return;
    if (this.sig === 0n) { this.e = 0; return; }

    let s = this.sig;
    const p = this.p;
    
    // If precision is 0, we treat it effectively as 1 digit for the sake of shifting (val=1n to 9n),
    // but the true value is just captured by exponent.
    const targetP = p === 0 ? 1 : p;
    const d = s.toString().length;
    const shift = d - targetP;

    if (shift > 0) {
      const base = this.#pow10(shift);
      let q = s / base;
      const r = s % base;
      if (r * 2n >= base) q += 1n; // round half up
      s = q;
      this.#adjustExponent(shift);
      if (this.e >= BigNum.MAX_E) { this.e = BigNum.MAX_E; this.inf = true; return; }
      if (s.toString().length > targetP) { // carry overflow
        s = s / 10n;
        this.#adjustExponent(1);
        if (this.e >= BigNum.MAX_E) { this.e = BigNum.MAX_E; this.inf = true; return; }
      }
    } else if (shift < 0) {
      const k = -shift;
      s = s * this.#pow10(k);
      this.#adjustExponent(-k);
    }

    if (p === 0) {
      // With precision 0, sig doesn't carry mantissa info but we can leave it normalized to 1n.
      // E.g., if sig was 5n, it would just be 1n * 10^(e) + ... we'll just force it to 1n and perhaps tweak exponent if we wanted rounding, but at this scale it doesn't matter.
      this.sig = 1n;
    } else {
      this.sig = s;
    }
  }

  #alignSig(other) {
    const diff = this.#expDiff(other);
    const absDiff = diff < 0n ? -diff : diff;
    if (absDiff === 0n) return other.sig;
    if (absDiff > BigInt(this.p + 2)) return 0n; // negligible
    const diffNum = Number(absDiff);
    const base = this.#pow10(diffNum);
    let q = other.sig / base;
    const r = other.sig % base;
    if (r * 2n >= base) q += 1n;
    return q;
  }

  // ---------------------- ARITHMETIC ----------------------
   add(b) {
    b = BigNum.fromAny(b, this.p);
    if (this.inf || b.inf) {
      const out = this.clone(); out.inf = this.inf || b.inf; out.e = BigNum.MAX_E; return out;
    }
    if (this.isZero()) return b.clone();
    if (b.isZero()) return this.clone();
    if (this.#compareExponent(b) >= 0) {
      return new BigNum(this.sig + this.#alignSig(b), this.#expObj(), this.p);
    }
    return b.add(this);
  }

  iadd(b) { const r = this.add(b); this.sig = r.sig; this.e = r.e; this.inf = r.inf; return this; }

  mulSmall(k) {
    if (k < 0) throw new Error('BigNum only supports non-negative values');
    if (this.inf) return this.clone();
    if (k === 0) return BigNum.zero(this.p);
    if (k === 1) return this.clone();
    const out = new BigNum(this.sig * BigInt(k), this.#expObj(), this.p);
    return out;
  }

  imulSmall(k) { const r = this.mulSmall(k); this.sig = r.sig; this.e = r.e; this.inf = r.inf; return this; }

  // Multiply by another non-negative integer BigNum (exact).
  mulBigNumInteger(other) {
    const b = BigNum.fromAny(other, this.p);
    if (this.inf || b.inf) {
      const out = this.clone();
      out.inf = this.inf || b.inf;
      out.e = BigNum.MAX_E;
      return out;
    }
    if (this.isZero() || b.isZero()) return BigNum.zero(this.p);
    return new BigNum(this.sig * b.sig, { base: this.e + b.e }, this.p);
  }

  imulBigNumInteger(other) {
    const r = this.mulBigNumInteger(other);
    this.sig = r.sig; this.e = r.e; this.inf = r.inf;
    return this;
  }

  // Divide by another BigNum (returns new BigNum).
  div(other) {
    const b = BigNum.fromAny(other, this.p);
    
    // Handle infinite cases
    if (this.inf) {
        if (b.inf) return new BigNum(1n, 0, this.p); // inf / inf -> 1 (or undefined, but 1 is safer for ratios)
        return this.clone(); // inf / finite -> inf
    }
    if (b.inf) {
        return BigNum.zero(this.p); // finite / inf -> 0
    }
    
    // Handle zero cases
    if (b.isZero()) {
        // finite / 0 -> infinity (mathematically undefined but useful here)
        return new BigNum(1n, BigNum.MAX_E, this.p);
    }
    if (this.isZero()) {
        return BigNum.zero(this.p); // 0 / finite -> 0
    }

    // A / B = (sigA * 10^expA) / (sigB * 10^expB)
    //       = (sigA / sigB) * 10^(expA - expB)
    // To maintain precision, we scale sigA by 10^precision before integer division.
    // result = (sigA * 10^p / sigB) * 10^(expA - expB - p)
    
    const targetPrecision = Math.max(this.p, b.p);
    const scale = this.#pow10(targetPrecision);
    const numerator = this.sig * scale;
    const sigQuotient = numerator / b.sig; // Integer division
    
    // Exponent calculation:
    // We used 'this.e' and 'b.e' for base exponents.
    // However, BigNum normalization ensures sig is roughly 10^(p-1) to 10^p.
    // So the exponent math is mostly correct if we trust .e.
    
    // The raw exponent difference:
    const expDiffBase = this.e - b.e;
    
    // Adjust for the scaling we did (subtracting p from the exponent because we added it to sig)
    const resultBase = expDiffBase - targetPrecision;
    
    // Construct new BigNum
    // We pass the total exponent info. The constructor/normalization will handle if sigQuotient is small/large.
    
    return new BigNum(sigQuotient, { base: resultBase }, this.p);
  }

  cmp(b) {
    b = BigNum.fromAny(b, this.p);
    if (this.inf || b.inf) return this.inf === b.inf ? 0 : this.inf ? 1 : -1;
    const thisIsZero = this.isZero();
    const otherIsZero = typeof b.isZero === 'function' ? b.isZero() : false;
    if (thisIsZero || otherIsZero) {
      if (thisIsZero && otherIsZero) return 0;
      return thisIsZero ? -1 : 1;
    }
    const expCmp = this.#compareExponent(b);
    if (expCmp !== 0) return expCmp;
    if (this.sig === b.sig) return 0;
    return this.sig > b.sig ? 1 : -1;
  }
  // ----- Decimal multiply (exact, integer-safe) & flooring -----

  // Parse decimal like "2.345" (or number) into { numer: BigInt, scale: int } with up to maxScale frac digits.
  static _parseDecimalMultiplier(x, maxScale = BigNum.DEFAULT_PRECISION) {
    let s = (typeof x === 'number') ? String(x) : String(x ?? '').trim();
    if (!s || s === '0') return { numer: 0n, scale: 0 };

    // normalize scientific like "1e3" to fixed decimal string
    if (/e/i.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) throw new TypeError('Invalid multiplier: ' + s);
      const digits = Math.min(maxScale, 18);
      s = n.toFixed(digits).replace(/\.?0+$/, ''); // strip trailing zeros
    }

    if (!/^\d+(\.\d+)?$/.test(s)) throw new TypeError('Invalid multiplier: ' + s);

    const [intPart, fracRaw = ''] = s.split('.');
    const frac = fracRaw.slice(0, maxScale); // clamp fractional length
    const scale = frac.length;
    const numer = BigInt(intPart + frac);
    return { numer, scale };
  }

  // Multiply by decimal multiplier given as number/string with up to 18 fractional digits (returns new BigNum).
  mulDecimal(mult, maxScale = BigNum.DEFAULT_PRECISION) {
    if (this.inf || this.isZero()) return this.clone();
    const { numer, scale } = BigNum._parseDecimalMultiplier(mult, maxScale);
    if (numer === 0n) return BigNum.zero(this.p);
    return this.mulScaledInt(numer, scale);
  }

  // Floor to integer value by dropping fractional digits.
  floorToInteger() {
    if (this.inf) return this.clone();
    if (this.isZero()) return this.clone();
    const exp = this.#effectiveExponentNumber();
    if (!Number.isFinite(exp)) return this.clone();
    const intDigits = exp + this.p; // integer digits in the value
    if (intDigits <= 0) return BigNum.zero(this.p); // < 1
    if (intDigits >= this.p) return this.clone();   // already integral
    const drop = this.p - intDigits;                // digits to truncate
    const base = 10n ** BigInt(drop);
    const newSig = (this.sig / base) * base;        // drop fractional digits
    return new BigNum(newSig, this.#expObj(), this.p);
  }

  // Convenience: multiply by decimal and floor to integer immediately.
  mulDecimalFloor(mult, maxScale = BigNum.DEFAULT_PRECISION) {
    return this.mulDecimal(mult, maxScale).floorToInteger();
  }

  mulScaledInt(numerBigInt, scale) {
    if (this.inf || this.isZero()) return this.clone();
    const nb = BigInt(numerBigInt);
    if (nb === 0n) return BigNum.zero(this.p);
    return new BigNum(this.sig * nb, { base: this.e - (scale | 0) }, this.p);
  }

  // Same as above but floors to an integer.
  mulScaledIntFloor(numerBigInt, scale) {
    return this.mulScaledInt(numerBigInt, scale).floorToInteger();
  }

  // ---------------------- FORMATTING ----------------------
  get decExp() {
    if (this.inf) return Number.POSITIVE_INFINITY;
    const exp = this.#effectiveExponentNumber();
    if (!Number.isFinite(exp)) return exp;
    return exp + (this.p - 1);
  }

  toScientific(digits = 3) {
    if (this.inf) return 'Infinity';
    if (this.isZero()) return '0';
    
    // We add p-1 for typical representations, but when p=0, effective p is 1 for magnitude calc.
    const effectiveP = this.p === 0 ? 1 : this.p;
    const E = this.e + (effectiveP - 1);
    
    if (E > 1.000001e6) {
      // Just returning 'e' here; the ui/numFormat will handle styling 'e' followed by formatted exponent.
      // E.g., it may replace e with 'e' and format E.
      return `e${E}`;
    }

    const s = this.sig.toString().padStart(effectiveP, '0');
    const head = s[0];
    const tail = s.slice(1, 1 + digits).replace(/0+$/g, '');
    const mant = tail ? `${head}.${tail}` : head;
    
    return `${mant}e${E}`;
  }

  toPlainIntegerString() {
    if (this.inf) return 'Infinity';
    if (this.isZero()) return '0';
    const exp = this.#effectiveExponentNumber();
    if (!Number.isFinite(exp)) return exp > 0 ? 'Infinity' : '0';
    const intDigits = exp + this.p;
    if (intDigits <= 0) return '0';
    if (intDigits > BigNum.MAX_PLAIN_DIGITS) return 'Infinity';

    const s = this.sig.toString().padStart(this.p, '0');
    if (intDigits <= this.p) {
      return s.slice(0, intDigits).replace(/^0+/, '') || '0';
    }

    const extraZeros = intDigits - this.p;
    return (s + '0'.repeat(extraZeros)).replace(/^0+/, '') || '0';
  }

  toString() {
    return this.toPlainIntegerString();
  }
}

// --- BigNum Utilities ---

export function approxLog10BigNum(value) {
  if (!(value instanceof BigNum)) {
    try {
      value = BigNum.fromAny(value ?? 0);
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  }
  if (!value) return Number.NEGATIVE_INFINITY;
  if (value.isZero?.()) return Number.NEGATIVE_INFINITY;
  if (value.isInfinite?.()) return Number.POSITIVE_INFINITY;

  if (typeof value.sig === 'bigint') {
    const sigNum = Number(value.sig);
    if (sigNum > 0) {
      const sigLog = Math.log10(sigNum);
      const e = value.e || 0;
      return sigLog + e;
    }
  }

  let storage;
  try {
    storage = value.toStorage();
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
  const parts = storage.split(':');
  const sigStr = parts[2] ?? '0';
  const expPart = parts[3] ?? '0';
  const baseExp = Number(expPart || '0');
  const offset = 0;
  const digits = sigStr.replace(/^0+/, '') || '0';
  if (digits === '0') return Number.NEGATIVE_INFINITY;

  let sigLog;
  if (digits.length <= 15) {
    const sigNum = Number(digits);
    if (!Number.isFinite(sigNum) || sigNum <= 0) return Number.NEGATIVE_INFINITY;
    sigLog = Math.log10(sigNum);
  } else {
    const head = Number(digits.slice(0, 15));
    if (!Number.isFinite(head) || head <= 0) return Number.NEGATIVE_INFINITY;
    sigLog = Math.log10(head) + (digits.length - 15);
  }

  const expSum = (Number.isFinite(baseExp) ? baseExp : 0) + (Number.isFinite(offset) ? offset : 0);
  return sigLog + expSum;
}

export function bigNumFromLog10(log10Value, noFuzz = false) {
  if (!Number.isFinite(log10Value)) {
    return log10Value > 0 ? BigNum.fromAny('Infinity') : BigNum.fromInt(0);
  }
  
  if (log10Value <= -1e12) return BigNum.fromInt(0);
  const p = BigNum.DEFAULT_PRECISION;
  let intPart = Math.floor(log10Value);
  let frac = log10Value - intPart;
  if (frac < 0) {
    frac += 1;
    intPart -= 1;
  }

  const mantissa = Math.pow(10, frac + (p - 1));
  const sig = BigInt(Math.max(1, Math.round(mantissa)));
  const exp = intPart - (p - 1);
  return new BigNum(sig, exp, p);
}

const LN10 = Math.log(10);

export function log10OnePlusPow10(exponent) {
  if (!Number.isFinite(exponent)) {
    if (exponent > 0) return exponent;
    if (exponent === 0) return Math.log10(2);
    return 0;
  }
  if (exponent > 308) return exponent;
  if (exponent < -20) {
    const pow = Math.pow(10, exponent);
    return pow / LN10;
  }
  const pow = Math.pow(10, exponent);
  if (!Number.isFinite(pow)) return exponent > 0 ? exponent : 0;
  return Math.log1p(pow) / LN10;
}
