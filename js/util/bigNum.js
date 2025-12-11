// js/util/bigNum.js
export class BigNum {
  static DEFAULT_PRECISION = 18;
  static MAX_E = 1.7976931348623157e+308; // Number.MAX_VALUE
  static MAX_PLAIN_DIGITS = 1_000_000;    // safety cap for plain integer strings

  constructor(sig, e, p = BigNum.DEFAULT_PRECISION) {
    this.p = p | 0;
    this.sig = BigInt(sig);
    this._eOffset = 0n;

    if (e && typeof e === 'object' && ('base' in e || 'offset' in e || 'inf' in e)) {
      const base = Number(e.base ?? 0);
      const inf = !!e.inf;
      if (inf || !Number.isFinite(base) || base >= BigNum.MAX_E) {
        this.e = BigNum.MAX_E;
        this.inf = true;
        this._eOffset = 0n;
      } else {
        this.e = Math.trunc(base);
        this.inf = false;
        const off = e.offset ?? 0;
        this._eOffset = typeof off === 'bigint' ? off : BigInt(off);
      }
    } else {
      const ee = Number(e);
      if (!Number.isFinite(ee) || ee >= BigNum.MAX_E) {
        this.e = BigNum.MAX_E;
        this.inf = true;
      } else {
        this.e = Math.trunc(ee);
        this.inf = false;
      }
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

    const match = s.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
    if (!match) {
      return new BigNum(BigInt(s), 0, p);
    }

    let [, intPart, fracPart = '', expPart] = match;
    let exponent = expPart ? parseInt(expPart, 10) : 0;
    exponent -= fracPart.length;

    const digits = (intPart + fracPart).replace(/^0+/, '') || '0';
    const sig = BigInt(digits);
    return new BigNum(sig, exponent, p);
  }

  static fromStorage(str, p = BigNum.DEFAULT_PRECISION) {
    if (!str) return null;
    if (typeof str !== 'string') str = String(str);
    if (str.startsWith('BN:')) {
      const [, pStr, sigStr, eStr] = str.split(':');
      const pp = parseInt(pStr, 10) || p;
      let baseStr = eStr;
      let offset = 0n;
      const caret = eStr.indexOf('^');
      if (caret >= 0) {
        baseStr = eStr.slice(0, caret);
        const offStr = eStr.slice(caret + 1) || '0';
        try { offset = BigInt(offStr); }
        catch { offset = 0n; }
      }
      let eNum = Number(baseStr);
      if (!Number.isFinite(eNum)) eNum = BigNum.MAX_E;
      return new BigNum(BigInt(sigStr), { base: eNum, offset }, pp);
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
      if (/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed)) return BigNum.fromScientific(trimmed, p);
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
    if (this.inf) return `BN:${this.p}:${this.sig.toString()}:${BigNum.MAX_E}`;
    const offsetSuffix = this._eOffset !== 0n ? `^${this._eOffset.toString()}` : '';
    return `BN:${this.p}:${this.sig.toString()}:${this.e}${offsetSuffix}`;
  }

  clone() {
    return new BigNum(this.sig, { base: this.e, offset: this._eOffset, inf: this.inf }, this.p);
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
    return { base: this.e, offset: this._eOffset, inf: this.inf };
  }

  #adjustExponent(delta) {
    if (this.inf || !delta) return;
    const prev = this.e;
    const next = prev + delta;
    this.e = Math.trunc(next);
    const applied = this.e - prev;
    const leftover = BigInt(delta - applied);
    if (leftover) this._eOffset += leftover;
  }

  #totalExponentBigInt() {
    if (this.inf) return this._eOffset >= 0n ? BigInt(Number.MAX_SAFE_INTEGER) : -BigInt(Number.MAX_SAFE_INTEGER);
    const base = BigInt(Math.trunc(this.e));
    return base + this._eOffset;
  }

  #compareExponent(other) {
    if (this.inf || other.inf) {
      if (this.inf && other.inf) return 0;
      return this.inf ? 1 : -1;
    }
    const a = this.#totalExponentBigInt();
    const b = other.#totalExponentBigInt();
    if (a > b) return 1;
    if (a < b) return -1;
    return 0;
  }

  #expDiff(other) {
    if (this.inf || other.inf) {
      if (this.inf && other.inf) return 0n;
      return this.inf ? BigInt(this.p + 3) : -BigInt(this.p + 3);
    }
    const diff = this.#totalExponentBigInt() - other.#totalExponentBigInt();
    const absDiff = diff < 0n ? -diff : diff;
    const limit = BigInt(this.p + 2);
    if (absDiff > limit) {
      return diff > 0n ? BigInt(this.p + 3) : -BigInt(this.p + 3);
    }
    return diff;
  }

  #offsetAsNumber() {
    if (this._eOffset === 0n) return 0;
    const offNum = Number(this._eOffset);
    if (!Number.isFinite(offNum) || !Number.isSafeInteger(offNum)) {
      return offNum > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    return offNum;
  }

  #effectiveExponentNumber() {
    if (this.inf) return Number.POSITIVE_INFINITY;
    const offset = this.#offsetAsNumber();
    if (!Number.isFinite(offset)) return this.e;
    return this.e + offset;
  }

  #normalize() {
    if (this.inf) return;
    if (this.sig === 0n) { this.e = 0; return; }

    let s = this.sig;
    const p = this.p;
    const d = s.toString().length;
    const shift = d - p;

    if (shift > 0) {
      const base = this.#pow10(shift);
      let q = s / base;
      const r = s % base;
      if (r * 2n >= base) q += 1n; // round half up
      s = q;
      this.#adjustExponent(shift);
      if (this.e >= BigNum.MAX_E) { this.e = BigNum.MAX_E; this.inf = true; return; }
      if (s.toString().length > p) { // carry overflow
        s = s / 10n;
        this.#adjustExponent(1);
        if (this.e >= BigNum.MAX_E) { this.e = BigNum.MAX_E; this.inf = true; return; }
      }
    } else if (shift < 0) {
      const k = -shift;
      s = s * this.#pow10(k);
      this.#adjustExponent(-k);
    }

    this.sig = s;
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

  iadd(b) { const r = this.add(b); this.sig = r.sig; this.e = r.e; this._eOffset = r._eOffset; this.inf = r.inf; return this; }

  mulSmall(k) {
    if (k < 0) throw new Error('BigNum only supports non-negative values');
    if (this.inf) return this.clone();
    if (k === 0) return BigNum.zero(this.p);
    if (k === 1) return this.clone();
    const out = new BigNum(this.sig * BigInt(k), this.#expObj(), this.p);
    return out;
  }

  imulSmall(k) { const r = this.mulSmall(k); this.sig = r.sig; this.e = r.e; this._eOffset = r._eOffset; this.inf = r.inf; return this; }

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
    const baseSum = this.e + b.e;
    const offsetSum = this._eOffset + b._eOffset;
    return new BigNum(this.sig * b.sig, { base: baseSum, offset: offsetSum }, this.p);
  }

  imulBigNumInteger(other) {
    const r = this.mulBigNumInteger(other);
    this.sig = r.sig; this.e = r.e; this._eOffset = r._eOffset; this.inf = r.inf;
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
    
    const scale = this.#pow10(this.p);
    const numerator = this.sig * scale;
    const sigQuotient = numerator / b.sig; // Integer division
    
    // Exponent calculation:
    // We used 'this.e' and 'b.e' for base exponents, plus offsets.
    // However, BigNum normalization ensures sig is roughly 10^(p-1) to 10^p.
    // So the exponent math is mostly correct if we trust .e and ._eOffset.
    
    // The raw exponent difference:
    const expDiffBase = BigInt(this.e) - BigInt(b.e);
    const expDiffOffset = this._eOffset - b._eOffset;
    
    // Adjust for the scaling we did (subtracting p from the exponent because we added it to sig)
    const pBigInt = BigInt(this.p);
    const totalExpBase = expDiffBase - pBigInt;
    
    // Construct new BigNum
    // We pass the total exponent info. The constructor/normalization will handle if sigQuotient is small/large.
    
    // We need to fit totalExpBase + expDiffOffset into {base, offset}.
    // base is a Number, offset is a BigInt.
    
    // Try to put as much as possible into 'base' (Number) to keep offset small if possible,
    // though normalization handles it.
    
    // Safe conversion of expDiffBase to Number?
    // expDiffBase can be large if inputs are large.
    
    // Let's just put everything into offset first, then let constructor handle it?
    // Constructor expects 'base' to be Number.
    
    let resultBase = Number(totalExpBase);
    let resultOffset = expDiffOffset;
    
    if (!Number.isSafeInteger(resultBase)) {
         // If base is too large/small for Number, move it to offset.
         resultOffset += totalExpBase;
         resultBase = 0;
    }
    
    return new BigNum(sigQuotient, { base: resultBase, offset: resultOffset }, this.p);
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
    return new BigNum(this.sig * nb, this.e - (scale | 0), this.p);
  }

  // Same as above but floors to an integer.
  mulScaledIntFloor(numerBigInt, scale) {
    return this.mulScaledInt(numerBigInt, scale).floorToInteger();
  }

  // ---------------------- FORMATTING ----------------------
  get decExp() {
    if (this.inf) return Number.POSITIVE_INFINITY;
    const exp = this.#effectiveExponentNumber();
    if (!Number.isFinite(exp)) return this.e + (this.p - 1);
    return exp + (this.p - 1);
  }

  toScientific(digits = 3) {
    if (this.inf) return 'Infinity';
    if (this.isZero()) return '0';
    const s = this.sig.toString().padStart(this.p, '0');
    const head = s[0];
    const tail = s.slice(1, 1 + digits).replace(/0+$/g, '');
    const mant = tail ? `${head}.${tail}` : head;
    const exp = this.#effectiveExponentNumber();
    const E = Number.isFinite(exp) ? (exp + (this.p - 1)) : (this.e + (this.p - 1));
    return `${mant}e${E}`;
  }

  toPlainIntegerString() {
    if (this.inf) return 'Infinity';
    if (this.isZero()) return '0';
    const exp = this.#effectiveExponentNumber();
    if (!Number.isFinite(exp)) return 'Infinity';
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
