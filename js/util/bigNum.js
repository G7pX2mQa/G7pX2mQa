// js/util/bigNum.js

export class BigNum {
  static DEFAULT_PRECISION = 15;
  static MINIMUM_PRECISION = 3;
  static MAX_E = 1.7976931348623157e+308; // Number.MAX_VALUE
  static MAX_PLAIN_DIGITS = 1000;    // safety cap for plain integer strings
  static MAX_UI_DIGITS = 100;

  constructor(sig, e, p = BigNum.DEFAULT_PRECISION) {
    let effectiveE = 0;
    let inf = false;
    this._isNaN = false;
    if (Number.isNaN(sig)) {
      this.sig = NaN;
      this.e = 0;
      this.inf = false;
      this._isNaN = true;
      this.p = p;
      return;
    }

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
      if (absE >= 1e21) {
        targetP = 0;
      } else {
        const eMag = Math.floor(Math.log10(absE));
        targetP = Math.max(BigNum.MINIMUM_PRECISION, BigNum.DEFAULT_PRECISION - eMag);
      }
    }
    this.p = Math.min(p | 0, targetP);

    this.e = effectiveE;
    this.inf = inf;

    if (this.p === 0 && !inf) {
      this.sig = 1; 
    } else {
      this.sig = (sig !== '' && sig !== null && sig !== undefined) ? Number(sig) : 1;
    }

    this.#normalize();
  }

  // ---------------------- FACTORIES ----------------------
  static zero(p = BigNum.DEFAULT_PRECISION) { return new BigNum(0, 0, p); }
  static min(a, b) {
    a = BigNum.fromAny(a);
    b = BigNum.fromAny(b);
    return a.cmp(b) <= 0 ? a : b;
  }

  static fromInt(n, p = BigNum.DEFAULT_PRECISION) {
    return new BigNum(Number(n), 0, p);
  }

  static fromScientific(str, p = BigNum.DEFAULT_PRECISION) {
    const s = String(str ?? '').trim();
    if (!s) throw new TypeError('Invalid BigNum input: ' + str);

    if (/^inf(?:inity)?$/i.test(s)) {
      return new BigNum(1, BigNum.MAX_E, p);
    }

    const match = s.match(/^([+-]?\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
    if (!match) {
      return new BigNum(Number(s), 0, p);
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
    if (digits === '0') return new BigNum(0, 0, p);

    // Do not coerce the full digit string with Number(...): plain save values
    // can exceed Number.MAX_VALUE even though BigNum can represent them. Keep
    // only the configured significant digits and move the rest into the
    // decimal exponent.
    const precision = Math.max(1, p | 0);
    const sigDigits = digits.slice(0, precision);
    const sig = Number(sign + sigDigits);
    return new BigNum(sig, exponent + (digits.length - sigDigits.length), p);
  }

  static fromStorage(str, p = BigNum.DEFAULT_PRECISION) {
    if (!str) return null;
    if (typeof str !== 'string') str = String(str);
    if (str.startsWith('BN:')) {
      const parts = str.split(":");
      if (parts[1] === 'NaN') return new BigNum(NaN, 0, p);
      if (parts[1] === 'infinite') {
        return new BigNum(1, { base: BigNum.MAX_E, inf: true }, p);
      }
      if (parts[1] === 'zero') {
        return new BigNum(0, { base: 0 }, p);
      }
      if (parts.length < 4) return null;
      const [, pStr, sigStr, eStr] = parts;
      const pp = parseInt(pStr, 10) || p;
      let eNum = Number(eStr);
      if (!Number.isFinite(eNum)) return null;
      const parsedSig = sigStr ? Number(sigStr) : 1;
      if (!Number.isFinite(parsedSig)) return null;
      return new BigNum(parsedSig, { base: eNum }, pp);
    }
    return BigNum.fromScientific(str, p);
  }

  // Accepts: BigNum | "BN:..." | scientific string | number
  static fromAny(input, p = BigNum.DEFAULT_PRECISION) {
    if (input instanceof BigNum) return input;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.startsWith('BN:')) return BigNum.fromStorage(trimmed, p);
      if (/^NaN$/i.test(trimmed)) return new BigNum(NaN, 0, p);
      if (/^inf(?:inity)?$/i.test(trimmed)) return new BigNum(1, BigNum.MAX_E, p);
      if (/^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed)) return BigNum.fromScientific(trimmed, p);
    }
    if (typeof input === 'number') {
      if (Number.isNaN(input)) return new BigNum(NaN, 0, p);
      if (!Number.isFinite(input)) return new BigNum(1, BigNum.MAX_E, p);
      return BigNum.fromScientific(input.toString(), p);
    }
    
    throw new TypeError('Unsupported BigNum input: ' + input);
    }

  // ---------------------- PERSISTENCE ----------------------
  toStorage() {
    if (this._isNaN) return `BN:NaN`;
    if (this.inf) return `BN:infinite`;
    if (this.isZero()) return `BN:zero`;
    if (this.p === 0) return `BN:0::${this.e}`;
    return `BN:${this.p}:${this.sig.toString()}:${this.e}`;
  }

  clone() {
    if (this._isNaN) return new BigNum(NaN, 0, this.p);
    return new BigNum(this.sig, { base: this.e, inf: this.inf }, this.p);
  }

  // ---------------------- STATE QUERIES ----------------------
  isNaN() { return !!this._isNaN; }
  isZero() { return !this.inf && this.sig === 0; }
  isInfinite() { return !!this.inf; }
  isNegative() { return !this._isNaN && this.sig < 0; }

  sub(b) {
    b = BigNum.fromAny(b, this.p);
    if (this._isNaN || b._isNaN) return new BigNum(NaN, 0, this.p);

    if (this.inf) {
      if (b.inf) return this.clone();
      return this.clone();
    }
    if (b.isZero()) return this.clone();
    if (b.inf) return BigNum.zero(this.p);

    if (this.cmp(b) <= 0) return BigNum.zero(this.p);

    const expCmp = this.#compareExponent(b);
    if (expCmp >= 0) {
      const aligned = expCmp === 0 ? b.sig : this.#alignSig(b);
      const diffSig = this.sig - aligned;
      if (diffSig > 0) {
        return new BigNum(diffSig, this.#expObj(), this.p);
      }
    }

    const maxCompensable = Math.max(this.p, b.p) + 2;
    if (Math.abs(this.e - b.e) > maxCompensable) {
      return this.e > b.e ? this.clone() : BigNum.zero(this.p);
    }

    const minE = Math.min(this.e, b.e);
    const shiftA = this.e - minE;
    const shiftB = b.e - minE;

    const scaledA = shiftA === 0 ? this.sig : this.sig * this.#pow10(shiftA);
    const scaledB = shiftB === 0 ? b.sig : b.sig * this.#pow10(shiftB);

    const exactDiff = scaledA - scaledB;
    if (exactDiff <= 0) return BigNum.zero(this.p);

    return new BigNum(exactDiff, minE, this.p);
  }

  // ---------------------- PRIVATE HELPERS ----------------------
  #pow10(k) { return k <= 0 ? 1 : Math.pow(10, k); }

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
      if (this.inf && other.inf) return 0;
      return this.inf ? Number(this.p + 3) : -Number(this.p + 3);
    }
    const diff = Number(Math.trunc(this.e - other.e));
    const absDiff = diff < 0 ? -diff : diff;
    const limit = Number(this.p + 2);
    if (absDiff > limit) {
      return diff > 0 ? Number(this.p + 3) : -Number(this.p + 3);
    }
    return diff;
  }

  #effectiveExponentNumber() {
    if (this.inf) return Number.POSITIVE_INFINITY;
    return this.e;
  }

  #normalize() {
    if (this.inf) return;
    if (this.sig === 0) { this.e = 0; return; }

    let s = this.sig;
    const p = this.p;
    
    // If precision is 0, we treat it effectively as 1 digit for the sake of shifting (val=1 to 9),
    // but the true value is just captured by exponent.
    const targetP = p === 0 ? 1 : p;
    const d = s === 0 ? 1 : fastDigitCount(s);
    const shift = d - targetP;

    if (shift > 0) {
      const base = this.#pow10(shift);
      let q = Math.floor(s / base);
      const r = s - q * base;
      if (r * 2 >= base) q += 1;
      s = q;
      this.#adjustExponent(shift);
      if (this.e >= BigNum.MAX_E) { this.e = BigNum.MAX_E; this.inf = true; return; }
      if ((s === 0 ? 1 : fastDigitCount(s)) > targetP) { // carry overflow
        s = s / 10;
        this.#adjustExponent(1);
        if (this.e >= BigNum.MAX_E) { this.e = BigNum.MAX_E; this.inf = true; return; }
      }
    } else if (shift < 0) {
      const k = -shift;
      s = s * this.#pow10(k);
      this.#adjustExponent(-k);
    }

    if (p === 0) {
      // With precision 0, sig doesn't carry mantissa info but we can leave it normalized to 1.
      // E.g., if sig was 5, it would just be 1 * 10^(e) + ... we'll just force it to 1 and perhaps tweak exponent if we wanted rounding, but at this scale it doesn't matter.
      this.sig = 1;
    } else {
      this.sig = s;
    }
  }

  #alignSig(other) {
    const diff = this.#expDiff(other);
    const absDiff = diff < 0 ? -diff : diff;
    if (absDiff === 0) return other.sig;
    if (absDiff > Number(this.p + 2)) return 0; // negligible
    const diffNum = Number(absDiff);
    const base = this.#pow10(diffNum);
    let q = Math.floor(other.sig / base);
    const r = other.sig - q * base;
    if (r * 2 >= base) q += 1;
    return q;
  }

  // ---------------------- ARITHMETIC ----------------------
   add(b) {
    b = BigNum.fromAny(b, this.p);
    if (this._isNaN || b._isNaN) return new BigNum(NaN, 0, this.p);
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

  iadd(b) { const r = this.add(b); this.sig = r.sig; this.e = r.e; this.inf = r.inf; this._isNaN = r._isNaN; return this; }

  mulSmall(k) {
    if (this._isNaN || Number.isNaN(k)) return new BigNum(NaN, 0, this.p);
    if (k < 0) throw new Error('BigNum only supports non-negative values');
    if (this.inf) return k === 0 ? new BigNum(NaN, 0, this.p) : this.clone();
    if (k === 0) return BigNum.zero(this.p);
    if (k === 1) return this.clone();
    const out = new BigNum(this.sig * Number(k), this.#expObj(), this.p);
    return out;
  }

  imulSmall(k) { const r = this.mulSmall(k); this.sig = r.sig; this.e = r.e; this.inf = r.inf; this._isNaN = r._isNaN; return this; }

  // Multiply by another non-negative integer BigNum (exact).
  mulBigNumInteger(other) {
    const b = BigNum.fromAny(other, this.p);
    if (this._isNaN || b._isNaN) return new BigNum(NaN, 0, this.p);
    if ((this.inf && b.isZero()) || (b.inf && this.isZero())) return new BigNum(NaN, 0, this.p);
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
    this.sig = r.sig; this.e = r.e; this.inf = r.inf; this._isNaN = r._isNaN;
    return this;
  }

  // Divide by another BigNum (returns new BigNum).
  div(other) {
    const b = BigNum.fromAny(other, this.p);
    
    // Handle infinite cases
    if (this.inf) {
        if (b.inf) return this.clone();
        return this.clone(); // inf / finite -> inf
    }
    if (b.inf) {
        return BigNum.zero(this.p); // finite / inf -> 0
    }
    
    // Handle zero cases
    if (b.isZero()) {
        if (this.isZero()) return new BigNum(NaN, 0, this.p);
        // finite / 0 -> infinity (mathematically undefined but useful here)
        return new BigNum(1, BigNum.MAX_E, this.p);
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
    const floatQuotient = this.sig / b.sig;
    const sigQuotient = Math.round(floatQuotient * scale);
    
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
    if (this._isNaN || b._isNaN) return NaN;
    if (this.inf || b.inf) return this.inf === b.inf ? 0 : this.inf ? 1 : -1;
    
    const thisIsZero = this.isZero();
    const otherIsZero = typeof b.isZero === 'function' ? b.isZero() : false;
    if (thisIsZero || otherIsZero) {
      if (thisIsZero && otherIsZero) return 0;
      return thisIsZero ? -1 : 1;
    }

    const expCmp = this.#compareExponent(b);

    // If magnitudes differ by a huge amount, safely fast path.
    // The maximum possible compensation by a mismatched mantissa length is `p` (precision length).
    const maxCompensable = Math.max(this.p, b.p) + 2; 
    
    if (Math.abs(this.e - b.e) > maxCompensable) {
       return expCmp; // Cannot possibly be compensated by mantissa strings.
    }

    let aSig = this.sig;
    let bSig = b.sig;

    if (expCmp > 0) {
      bSig = this.#alignSig(b);
    } else if (expCmp < 0) {
      aSig = b.#alignSig(this);
    }

    if (aSig === bSig) return 0;
    return aSig > bSig ? 1 : -1;
  }
  // ----- Decimal multiply (exact, integer-safe) & flooring -----

  // Parse decimal like "2.345" (or number) into { numer: Number, scale: Number } with up to maxScale frac digits.
  static _parseDecimalMultiplier(x, maxScale = BigNum.DEFAULT_PRECISION) {
    let s = (typeof x === 'number') ? String(x) : String(x ?? '').trim();
    if (!s || s === '0') return { numer: 0, scale: 0 };

    // normalize scientific like "1e3" to fixed decimal string
    if (/e/i.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) throw new TypeError('Invalid multiplier: ' + s);
      if (n >= 1e21 || n <= 1e-7) {
          return { _isBigNum: true, bn: BigNum.fromAny(n) };
      }
      const digits = Math.min(maxScale, BigNum.DEFAULT_PRECISION);
      s = n.toFixed(digits).replace(/\.?0+$/, ''); // strip trailing zeros
    }

    if (!/^\d+(\.\d+)?$/.test(s)) throw new TypeError('Invalid multiplier: ' + s);

    const [intPart, fracRaw = ''] = s.split('.');
    const frac = fracRaw.slice(0, maxScale); // clamp fractional length
    const scale = frac.length;
    const numer = Number(intPart + frac);
    return { numer, scale };
  }

  // Multiply by decimal multiplier given as number/string with up to 18 fractional digits (returns new BigNum).
  mulDecimal(mult, maxScale = BigNum.DEFAULT_PRECISION) {
    if (this._isNaN || Number.isNaN(mult)) return new BigNum(NaN, 0, this.p);
    if (this.inf || this.isZero()) return this.clone();
    const result = BigNum._parseDecimalMultiplier(mult, maxScale);
    if (result._isBigNum) {
        const b = result.bn;
        return new BigNum(this.sig * b.sig, { base: this.e + b.e }, this.p);
    }
    const { numer, scale } = result;
    if (numer === 0) return BigNum.zero(this.p);
    return this.mulScaledInt(numer, scale);
  }

  // Floor to integer value by dropping fractional digits.
  floorToInteger() {
    if (this._isNaN) return new BigNum(NaN, 0, this.p);
    if (this.inf) return this.clone();
    if (this.isZero()) return this.clone();
    const exp = this.#effectiveExponentNumber();
    if (!Number.isFinite(exp)) return this.clone();
    const intDigits = exp + this.p; // integer digits in the value
    if (intDigits <= 0) return BigNum.zero(this.p); // < 1
    if (intDigits >= this.p) return this.clone();   // already integral
    const drop = this.p - intDigits;                // digits to truncate
    const base = Math.pow(10, drop);
    const newSig = Math.floor(this.sig / base) * base; // drop fractional digits
    return new BigNum(newSig, this.#expObj(), this.p);
  }

  // Convenience: multiply by decimal and floor to integer immediately.
  mulDecimalFloor(mult, maxScale = BigNum.DEFAULT_PRECISION) {
    return this.mulDecimal(mult, maxScale).floorToInteger();
  }

  mulScaledInt(numer, scale) {
    if (this._isNaN || Number.isNaN(numer)) return new BigNum(NaN, 0, this.p);
    const numerNum = numer;
    if (this.inf || this.isZero()) return this.clone();
    const nb = Number(numerNum);
    if (nb === 0) return BigNum.zero(this.p);
    return new BigNum(this.sig * nb, { base: this.e - (scale | 0) }, this.p);
  }

  // Same as above but floors to an integer.
  mulScaledIntFloor(numer, scale) {
    return this.mulScaledInt(numer, scale).floorToInteger();
  }

  // ---------------------- FORMATTING ----------------------
  get decExp() {
    if (this.inf) return Number.POSITIVE_INFINITY;
    const exp = this.#effectiveExponentNumber();
    if (!Number.isFinite(exp)) return exp;
    return exp + (this.p - 1);
  }

  toScientific(digits = 3) {
    if (this._isNaN) return 'NaN';
    if (this.inf) return 'Infinity';
    if (this.isZero()) return '0';
    
    // We add p-1 for typical representations, but when p=0, effective p is 1 for magnitude calc.
    const effectiveP = this.p === 0 ? 1 : this.p;
    const E = this.e + (effectiveP - 1);
    
    if (E >= 1000000) {
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
    if (this._isNaN) return 'NaN';
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
    if (this._isNaN) return 'NaN';
    return this.toPlainIntegerString();
  }
}

// --- BigNum Utilities ---

function fastDigitCount(n) {
  if (n < 1) {
    if (n === 0) return 1;
    return Math.floor(Math.log10(n)) + 1;
  }
  if (n < 1000000000) {
    if (n < 10000) {
      if (n < 100) return n < 10 ? 1 : 2;
      return n < 1000 ? 3 : 4;
    } else {
      if (n < 1000000) return n < 100000 ? 5 : 6;
      if (n < 100000000) return n < 10000000 ? 7 : 8;
      return 9;
    }
  } else {
    if (n < 100000000000000) {
      if (n < 100000000000) return n < 10000000000 ? 10 : 11;
      if (n < 10000000000000) return n < 1000000000000 ? 12 : 13;
      return 14;
    } else {
      if (n < 100000000000000000) {
        if (n < 1000000000000000) return 15;
        if (n < 10000000000000000) return 16;
        return 17;
      } else {
        if (n < 1000000000000000000) return 18;
        if (n < 10000000000000000000) return 19;
        if (n < 100000000000000000000) return 20;
        if (n < 1000000000000000000000) return 21;
        return Math.floor(Math.log10(n)) + 1;
      }
    }
  }
}

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
  if (value.isNaN?.()) return NaN;
  if (value.isInfinite?.()) return Number.POSITIVE_INFINITY;

  if (typeof value.sig === 'number') {
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
  if (digits.length <= BigNum.DEFAULT_PRECISION) {
    const sigNum = Number(digits);
    if (!Number.isFinite(sigNum) || sigNum <= 0) return Number.NEGATIVE_INFINITY;
    sigLog = Math.log10(sigNum);
  } else {
    const head = Number(digits.slice(0, BigNum.DEFAULT_PRECISION));
    if (!Number.isFinite(head) || head <= 0) return Number.NEGATIVE_INFINITY;
    sigLog = Math.log10(head) + (digits.length - BigNum.DEFAULT_PRECISION);
  }

  const expSum = (Number.isFinite(baseExp) ? baseExp : 0) + (Number.isFinite(offset) ? offset : 0);
  return sigLog + expSum;
}

export function bigNumFromLog10(log10Value, noFuzz = false) {
  if (Number.isNaN(log10Value)) return new BigNum(NaN, 0);
  if (!Number.isFinite(log10Value)) {
    return log10Value > 0 ? BigNum.fromAny('Infinity') : BigNum.fromInt(0);
  }
  
  if (log10Value <= -1e12) return BigNum.fromInt(0);

  if (!noFuzz) {
    const rounded = Math.round(log10Value);
    if (Math.abs(log10Value - rounded) < 1e-12) {
      log10Value = rounded;
    }
  }

  const p = BigNum.DEFAULT_PRECISION;
  let intPart = Math.floor(log10Value);
  let frac = log10Value - intPart;
  if (frac < 0) {
    frac += 1;
    intPart -= 1;
  }

  let baseVal = Math.pow(10, frac);
  let mantissa;
  if (!noFuzz) {
    baseVal = Math.round(baseVal * 1e14) / 1e14;
    mantissa = Math.round(baseVal * 1e14) * Math.pow(10, p - 1 - 14);
  } else {
    mantissa = baseVal * Math.pow(10, p - 1);
  }
  const sig = Math.max(1, Math.round(mantissa));
  const exp = intPart - (p - 1);
  return new BigNum(sig, exp, p);
}

const LN10 = Math.log(10);

export function log10OnePlusPow10(exponent) {
  if (Number.isNaN(exponent)) return NaN;
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

export function bigNumIsInfinite(bn) {
  return !!(bn && typeof bn === 'object' && (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())));
}
