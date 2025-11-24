(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // js/util/bigNum.js
  var BigNum;
  var init_bigNum = __esm({
    "js/util/bigNum.js"() {
      BigNum = class _BigNum {
        static DEFAULT_PRECISION = 18;
        static MAX_E = 17976931348623157e292;
        // Number.MAX_VALUE
        static MAX_PLAIN_DIGITS = 1e6;
        // safety cap for plain integer strings
        constructor(sig, e, p = _BigNum.DEFAULT_PRECISION) {
          this.p = p | 0;
          this.sig = BigInt(sig);
          this._eOffset = 0n;
          if (e && typeof e === "object" && ("base" in e || "offset" in e || "inf" in e)) {
            const base = Number(e.base ?? 0);
            const inf = !!e.inf;
            if (inf || !Number.isFinite(base) || base >= _BigNum.MAX_E) {
              this.e = _BigNum.MAX_E;
              this.inf = true;
              this._eOffset = 0n;
            } else {
              this.e = Math.trunc(base);
              this.inf = false;
              const off = e.offset ?? 0;
              this._eOffset = typeof off === "bigint" ? off : BigInt(off);
            }
          } else {
            const ee = Number(e);
            if (!Number.isFinite(ee) || ee >= _BigNum.MAX_E) {
              this.e = _BigNum.MAX_E;
              this.inf = true;
            } else {
              this.e = Math.trunc(ee);
              this.inf = false;
            }
          }
          this.#normalize();
        }
        // ---------------------- FACTORIES ----------------------
        static zero(p = _BigNum.DEFAULT_PRECISION) {
          return new _BigNum(0n, 0, p);
        }
        static fromInt(n, p = _BigNum.DEFAULT_PRECISION) {
          return new _BigNum(BigInt(n), 0, p);
        }
        static fromScientific(str, p = _BigNum.DEFAULT_PRECISION) {
          const s = String(str ?? "").trim();
          if (!s) throw new TypeError("Invalid BigNum input: " + str);
          if (/^inf(?:inity)?$/i.test(s)) {
            return new _BigNum(1n, _BigNum.MAX_E, p);
          }
          const match = s.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
          if (!match) {
            return new _BigNum(BigInt(s), 0, p);
          }
          let [, intPart, fracPart = "", expPart] = match;
          let exponent = expPart ? parseInt(expPart, 10) : 0;
          exponent -= fracPart.length;
          const digits = (intPart + fracPart).replace(/^0+/, "") || "0";
          const sig = BigInt(digits);
          return new _BigNum(sig, exponent, p);
        }
        static fromStorage(str, p = _BigNum.DEFAULT_PRECISION) {
          if (!str) return null;
          if (typeof str !== "string") str = String(str);
          if (str.startsWith("BN:")) {
            const [, pStr, sigStr, eStr] = str.split(":");
            const pp = parseInt(pStr, 10) || p;
            let baseStr = eStr;
            let offset = 0n;
            const caret = eStr.indexOf("^");
            if (caret >= 0) {
              baseStr = eStr.slice(0, caret);
              const offStr = eStr.slice(caret + 1) || "0";
              try {
                offset = BigInt(offStr);
              } catch {
                offset = 0n;
              }
            }
            let eNum = Number(baseStr);
            if (!Number.isFinite(eNum)) eNum = _BigNum.MAX_E;
            return new _BigNum(BigInt(sigStr), { base: eNum, offset }, pp);
          }
          return _BigNum.fromScientific(str, p);
        }
        // Accepts: BigNum | "BN:..." | scientific string | number | bigint
        static fromAny(input, p = _BigNum.DEFAULT_PRECISION) {
          if (input instanceof _BigNum) return input;
          if (typeof input === "string") {
            const trimmed = input.trim();
            if (trimmed.startsWith("BN:")) return _BigNum.fromStorage(trimmed, p);
            if (/^inf(?:inity)?$/i.test(trimmed)) return new _BigNum(1n, _BigNum.MAX_E, p);
            if (/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed)) return _BigNum.fromScientific(trimmed, p);
          }
          if (typeof input === "number") {
            if (!Number.isFinite(input)) return new _BigNum(1n, _BigNum.MAX_E, p);
            return _BigNum.fromScientific(input.toString(), p);
          }
          if (typeof input === "bigint") return _BigNum.fromInt(input, p);
          throw new TypeError("Unsupported BigNum input: " + input);
        }
        // ---------------------- PERSISTENCE ----------------------
        toStorage() {
          if (this.inf) return `BN:${this.p}:${this.sig.toString()}:${_BigNum.MAX_E}`;
          const offsetSuffix = this._eOffset !== 0n ? `^${this._eOffset.toString()}` : "";
          return `BN:${this.p}:${this.sig.toString()}:${this.e}${offsetSuffix}`;
        }
        clone() {
          return new _BigNum(this.sig, { base: this.e, offset: this._eOffset, inf: this.inf }, this.p);
        }
        // ---------------------- STATE QUERIES ----------------------
        isZero() {
          return !this.inf && this.sig === 0n;
        }
        isInfinite() {
          return !!this.inf;
        }
        isNegative() {
          return false;
        }
        sub(b) {
          b = _BigNum.fromAny(b, this.p);
          if (this.inf) {
            if (b.inf) return _BigNum.zero(this.p);
            return this.clone();
          }
          if (b.inf) return _BigNum.zero(this.p);
          if (this.cmp(b) <= 0) return _BigNum.zero(this.p);
          const expCmp = this.#compareExponent(b);
          if (expCmp >= 0) {
            const aligned = expCmp === 0 ? b.sig : this.#alignSig(b);
            const diffSig = this.sig - aligned;
            if (diffSig > 0n) {
              return new _BigNum(diffSig, this.#expObj(), this.p);
            }
          }
          try {
            const aPlain = this.toPlainIntegerString();
            const bPlain = b.toPlainIntegerString();
            if (aPlain === "Infinity") return this.clone();
            if (bPlain === "Infinity") return _BigNum.zero(this.p);
            const diff = BigInt(aPlain) - BigInt(bPlain);
            if (diff <= 0n) return _BigNum.zero(this.p);
            return _BigNum.fromInt(diff, this.p);
          } catch {
            return _BigNum.zero(this.p);
          }
        }
        // ---------------------- PRIVATE HELPERS ----------------------
        #pow10(k) {
          return k <= 0 ? 1n : 10n ** BigInt(k);
        }
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
          if (this.sig === 0n) {
            this.e = 0;
            return;
          }
          let s = this.sig;
          const p = this.p;
          const d = s.toString().length;
          const shift = d - p;
          if (shift > 0) {
            const base = this.#pow10(shift);
            let q = s / base;
            const r = s % base;
            if (r * 2n >= base) q += 1n;
            s = q;
            this.#adjustExponent(shift);
            if (this.e >= _BigNum.MAX_E) {
              this.e = _BigNum.MAX_E;
              this.inf = true;
              return;
            }
            if (s.toString().length > p) {
              s = s / 10n;
              this.#adjustExponent(1);
              if (this.e >= _BigNum.MAX_E) {
                this.e = _BigNum.MAX_E;
                this.inf = true;
                return;
              }
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
          if (absDiff > BigInt(this.p + 2)) return 0n;
          const diffNum = Number(absDiff);
          const base = this.#pow10(diffNum);
          let q = other.sig / base;
          const r = other.sig % base;
          if (r * 2n >= base) q += 1n;
          return q;
        }
        // ---------------------- ARITHMETIC ----------------------
        add(b) {
          b = _BigNum.fromAny(b, this.p);
          if (this.inf || b.inf) {
            const out = this.clone();
            out.inf = this.inf || b.inf;
            out.e = _BigNum.MAX_E;
            return out;
          }
          if (this.isZero()) return b.clone();
          if (b.isZero()) return this.clone();
          if (this.#compareExponent(b) >= 0) {
            return new _BigNum(this.sig + this.#alignSig(b), this.#expObj(), this.p);
          }
          return b.add(this);
        }
        iadd(b) {
          const r = this.add(b);
          this.sig = r.sig;
          this.e = r.e;
          this._eOffset = r._eOffset;
          this.inf = r.inf;
          return this;
        }
        mulSmall(k) {
          if (k < 0) throw new Error("BigNum only supports non-negative values");
          if (this.inf) return this.clone();
          if (k === 0) return _BigNum.zero(this.p);
          if (k === 1) return this.clone();
          const out = new _BigNum(this.sig * BigInt(k), this.#expObj(), this.p);
          return out;
        }
        imulSmall(k) {
          const r = this.mulSmall(k);
          this.sig = r.sig;
          this.e = r.e;
          this._eOffset = r._eOffset;
          this.inf = r.inf;
          return this;
        }
        // Multiply by another non-negative integer BigNum (exact).
        mulBigNumInteger(other) {
          const b = _BigNum.fromAny(other, this.p);
          if (this.inf || b.inf) {
            const out = this.clone();
            out.inf = this.inf || b.inf;
            out.e = _BigNum.MAX_E;
            return out;
          }
          if (this.isZero() || b.isZero()) return _BigNum.zero(this.p);
          const baseSum = this.e + b.e;
          const offsetSum = this._eOffset + b._eOffset;
          return new _BigNum(this.sig * b.sig, { base: baseSum, offset: offsetSum }, this.p);
        }
        imulBigNumInteger(other) {
          const r = this.mulBigNumInteger(other);
          this.sig = r.sig;
          this.e = r.e;
          this._eOffset = r._eOffset;
          this.inf = r.inf;
          return this;
        }
        cmp(b) {
          b = _BigNum.fromAny(b, this.p);
          if (this.inf || b.inf) return this.inf === b.inf ? 0 : this.inf ? 1 : -1;
          const thisIsZero = this.isZero();
          const otherIsZero = typeof b.isZero === "function" ? b.isZero() : false;
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
        static _parseDecimalMultiplier(x, maxScale = _BigNum.DEFAULT_PRECISION) {
          let s = typeof x === "number" ? String(x) : String(x ?? "").trim();
          if (!s || s === "0") return { numer: 0n, scale: 0 };
          if (/e/i.test(s)) {
            const n = Number(s);
            if (!Number.isFinite(n) || n < 0) throw new TypeError("Invalid multiplier: " + s);
            const digits = Math.min(maxScale, 18);
            s = n.toFixed(digits).replace(/\.?0+$/, "");
          }
          if (!/^\d+(\.\d+)?$/.test(s)) throw new TypeError("Invalid multiplier: " + s);
          const [intPart, fracRaw = ""] = s.split(".");
          const frac = fracRaw.slice(0, maxScale);
          const scale = frac.length;
          const numer = BigInt(intPart + frac);
          return { numer, scale };
        }
        // Multiply by decimal multiplier given as number/string with up to 18 fractional digits (returns new BigNum).
        mulDecimal(mult, maxScale = _BigNum.DEFAULT_PRECISION) {
          if (this.inf || this.isZero()) return this.clone();
          const { numer, scale } = _BigNum._parseDecimalMultiplier(mult, maxScale);
          if (numer === 0n) return _BigNum.zero(this.p);
          return this.mulScaledInt(numer, scale);
        }
        // Floor to integer value by dropping fractional digits.
        floorToInteger() {
          if (this.inf) return this.clone();
          if (this.isZero()) return this.clone();
          const exp = this.#effectiveExponentNumber();
          if (!Number.isFinite(exp)) return this.clone();
          const intDigits = exp + this.p;
          if (intDigits <= 0) return _BigNum.zero(this.p);
          if (intDigits >= this.p) return this.clone();
          const drop = this.p - intDigits;
          const base = 10n ** BigInt(drop);
          const newSig = this.sig / base * base;
          return new _BigNum(newSig, this.#expObj(), this.p);
        }
        // Convenience: multiply by decimal and floor to integer immediately.
        mulDecimalFloor(mult, maxScale = _BigNum.DEFAULT_PRECISION) {
          return this.mulDecimal(mult, maxScale).floorToInteger();
        }
        mulScaledInt(numerBigInt, scale) {
          if (this.inf || this.isZero()) return this.clone();
          const nb = BigInt(numerBigInt);
          if (nb === 0n) return _BigNum.zero(this.p);
          return new _BigNum(this.sig * nb, this.e - (scale | 0), this.p);
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
          if (this.inf) return "Infinity";
          if (this.isZero()) return "0";
          const s = this.sig.toString().padStart(this.p, "0");
          const head = s[0];
          const tail = s.slice(1, 1 + digits).replace(/0+$/g, "");
          const mant = tail ? `${head}.${tail}` : head;
          const exp = this.#effectiveExponentNumber();
          const E2 = Number.isFinite(exp) ? exp + (this.p - 1) : this.e + (this.p - 1);
          return `${mant}e${E2}`;
        }
        toPlainIntegerString() {
          if (this.inf) return "Infinity";
          if (this.isZero()) return "0";
          const exp = this.#effectiveExponentNumber();
          if (!Number.isFinite(exp)) return "Infinity";
          const intDigits = exp + this.p;
          if (intDigits <= 0) return "0";
          if (intDigits > _BigNum.MAX_PLAIN_DIGITS) return "Infinity";
          const s = this.sig.toString().padStart(this.p, "0");
          if (intDigits <= this.p) {
            return s.slice(0, intDigits).replace(/^0+/, "") || "0";
          }
          const extraZeros = intDigits - this.p;
          return (s + "0".repeat(extraZeros)).replace(/^0+/, "") || "0";
        }
        toString() {
          return this.toPlainIntegerString();
        }
      };
    }
  });

  // js/util/numFormat.js
  function localeInt(s) {
    const num = Number(s);
    if (!Number.isFinite(num)) return String(s);
    try {
      return NF_INT.format(num);
    } catch {
      return String(s);
    }
  }
  function addOneDigitString(str) {
    let carry = 1, a = str.split("");
    for (let i = a.length - 1; i >= 0 && carry; i--) {
      let d = a[i].charCodeAt(0) - 48 + carry;
      carry = d >= 10 ? 1 : 0;
      a[i] = String.fromCharCode(48 + d % 10);
    }
    if (carry) a.unshift("1");
    return a.join("");
  }
  function formatExponentString(rawDigits, sign = "") {
    let ds = (rawDigits || "").replace(/^0+/, "") || "0";
    if (ds.length < 4) return sign + localeInt(ds);
    if (ds.length <= 7) {
      const n = Number(ds);
      if (Number.isFinite(n) && n <= 1e6) return sign + NF_INT.format(n);
    }
    const E2 = ds.length - 1;
    if (E2 <= 300) {
      const exp = Math.floor(E2 / 3) * 3;
      const suffix = SUFFIX_BY_EXP.get(exp) || "";
      const d = E2 - exp;
      const intDigits = d + 1;
      const decimals = 4 - intDigits;
      const totalDigits2 = intDigits + decimals;
      if (ds.length < totalDigits2 + 1) ds += "0".repeat(totalDigits2 + 1 - ds.length);
      let head2 = ds.slice(0, totalDigits2);
      const nextDigit2 = ds.charCodeAt(totalDigits2) || 48;
      if (nextDigit2 >= 53) head2 = addOneDigitString(head2);
      let intStr, fracStr;
      if (head2.length > totalDigits2) {
        intStr = head2.slice(0, intDigits + 1);
        fracStr = "0".repeat(decimals);
      } else {
        intStr = head2.slice(0, intDigits);
        fracStr = head2.slice(intDigits);
      }
      return sign + `${intStr}${decimals ? "." + fracStr : ""}${suffix}`;
    }
    const totalDigits = 4;
    if (ds.length < totalDigits + 1) ds += "0".repeat(totalDigits + 1 - ds.length);
    let head = ds.slice(0, totalDigits);
    const nextDigit = ds.charCodeAt(totalDigits) || 48;
    if (nextDigit >= 53) head = addOneDigitString(head);
    const mantInt = head.slice(0, 1);
    const mantFrac = head.slice(1);
    return sign + `${mantInt}.${mantFrac}e` + formatExponentString(String(E2));
  }
  function formatExponentChain(expRaw) {
    expRaw = String(expRaw).trim();
    let topSign = "";
    if (expRaw[0] === "+" || expRaw[0] === "-") {
      topSign = expRaw[0] === "-" ? "-" : "";
      expRaw = expRaw.slice(1);
    }
    if (/^\d+$/.test(expRaw)) return topSign + formatExponentString(expRaw);
    const m = expRaw.match(/^(\d+)(?:\.(\d+))?e([+-]?)(\d+)$/i);
    if (!m) return topSign + expRaw;
    const [, int, frac = "", sign2, kDigits] = m;
    let kGe303 = false, k = 0;
    if (kDigits.length > 3) kGe303 = true;
    else {
      k = parseInt(kDigits || "0", 10) || 0;
      kGe303 = k >= 303;
    }
    let ds = (int + frac).replace(/^0+/, "") || "0";
    if (ds.length < 5) ds += "0".repeat(5 - ds.length);
    let four = ds.slice(0, 4);
    const next = ds.charCodeAt(4) || 48;
    if (next >= 53) four = addOneDigitString(four);
    if (kGe303) {
      const mant = four.slice(0, 1) + "." + four.slice(1);
      const sign2Prefix2 = sign2 === "-" ? "-" : "";
      return topSign + mant + "e" + formatExponentString(kDigits, sign2Prefix2);
    }
    const exp = Math.floor(k / 3) * 3;
    const suffix = SUFFIX_BY_EXP.get(exp) || "";
    const remainder = k - exp;
    const intDigits = remainder + 1;
    const decimals = 4 - intDigits;
    let intStr, fracStr;
    if (four.length > 4) {
      intStr = four.slice(0, intDigits + 1);
      fracStr = "0".repeat(decimals);
    } else {
      intStr = four.slice(0, intDigits);
      fracStr = four.slice(intDigits);
    }
    const sign2Prefix = sign2 === "-" ? "-" : "";
    return topSign + sign2Prefix + intStr + (decimals ? "." + fracStr : "") + suffix;
  }
  function mantissaFourDigits(sci) {
    const i = sci.toLowerCase().indexOf("e");
    if (i < 0) return sci;
    const rawMant = sci.slice(0, i);
    let ds = rawMant.replace(".", "");
    if (!/^\d+$/.test(ds)) return sci;
    if (ds.length < 5) ds += "0".repeat(5 - ds.length);
    let head = ds.slice(0, 4);
    const next = ds.charCodeAt(4) || 48;
    if (next >= 53) head = addOneDigitString(head);
    if (head.length > 4) head = head.slice(0, 4);
    const mantissa = head.slice(0, 1) + "." + head.slice(1);
    const rawExp = sci.slice(i + 1);
    return mantissa + "e" + formatExponentChain(rawExp);
  }
  function formatNumber(bn) {
    if (!(bn instanceof BigNum)) return String(bn);
    if (bn.isInfinite && bn.isInfinite()) return '<span class="infinity-symbol">\u221E</span>';
    if (bn.isZero()) return "0";
    const E2 = bn.decExp ?? bn.e + (bn.p - 1);
    if (E2 >= 303) {
      return mantissaFourDigits(bn.toScientific(3));
    }
    if (E2 < 6) {
      return localeInt(bn.toPlainIntegerString());
    }
    const exp = Math.floor(E2 / 3) * 3;
    const suffix = SUFFIX_BY_EXP.get(exp);
    if (!suffix) return mantissaFourDigits(bn.toScientific(3));
    const d = E2 - exp;
    const intDigits = d + 1;
    const decimals = 4 - intDigits;
    const totalDigits = intDigits + decimals;
    let s = bn.sig.toString().padStart(bn.p, "0");
    if (s.length < totalDigits + 1) s += "0".repeat(totalDigits + 1 - s.length);
    let head = s.slice(0, totalDigits);
    const nextDigit = s.charCodeAt(totalDigits) || 48;
    if (nextDigit >= 53) head = addOneDigitString(head);
    let intStr, fracStr;
    if (head.length > totalDigits) {
      intStr = head.slice(0, intDigits + 1);
      fracStr = "0".repeat(decimals);
    } else {
      intStr = head.slice(0, intDigits);
      fracStr = head.slice(intDigits);
    }
    return `${intStr}${decimals ? "." + fracStr : ""}${suffix}`;
  }
  var SUFFIX_ENTRIES, SUFFIX_BY_EXP, NF_INT;
  var init_numFormat = __esm({
    "js/util/numFormat.js"() {
      init_bigNum();
      SUFFIX_ENTRIES = [
        [300, "NoNg"],
        [297, "OcNg"],
        [294, "SpNg"],
        [291, "SxNg"],
        [288, "QnNg"],
        [285, "QdNg"],
        [282, "TNg"],
        [279, "DNg"],
        [276, "UNg"],
        [273, "Ng"],
        [270, "NoOg"],
        [267, "OcOg"],
        [264, "SpOg"],
        [261, "SxOg"],
        [258, "QnOg"],
        [255, "QdOg"],
        [252, "TOg"],
        [249, "DOg"],
        [246, "UOg"],
        [243, "Og"],
        [240, "NoSg"],
        [237, "OcSg"],
        [234, "SpSg"],
        [231, "SxSg"],
        [228, "QnSg"],
        [225, "QdSg"],
        [222, "TSg"],
        [219, "DSg"],
        [216, "USg"],
        [213, "Sg"],
        [210, "Nosg"],
        [207, "Ocsg"],
        [204, "Spsg"],
        [201, "Sxsg"],
        [198, "Qnsg"],
        [195, "Qdsg"],
        [192, "Tsg"],
        [189, "Dsg"],
        [186, "Usg"],
        [183, "sg"],
        [180, "NoQg"],
        [177, "OcQg"],
        [174, "SpQg"],
        [171, "SxQg"],
        [168, "QnQg"],
        [165, "QdQg"],
        [162, "TQg"],
        [159, "DQg"],
        [156, "UQg"],
        [153, "Qg"],
        [150, "Noqg"],
        [147, "Ocqg"],
        [144, "Spqg"],
        [141, "Sxqg"],
        [138, "Qnqg"],
        [135, "Qdqg"],
        [132, "Tqg"],
        [129, "Dqg"],
        [126, "Uqg"],
        [123, "qg"],
        [120, "NoTg"],
        [117, "OcTg"],
        [114, "SpTg"],
        [111, "SxTg"],
        [108, "QnTg"],
        [105, "QdTg"],
        [102, "TTg"],
        [99, "DTg"],
        [96, "UTg"],
        [93, "Tg"],
        [90, "NoVt"],
        [87, "OcVt"],
        [84, "SpVt"],
        [81, "SxVt"],
        [78, "QnVt"],
        [75, "QdVt"],
        [72, "TVt"],
        [69, "DVt"],
        [66, "UVt"],
        [63, "Vt"],
        [60, "NoDe"],
        [57, "OcDe"],
        [54, "SpDe"],
        [51, "SxDe"],
        [48, "QnDe"],
        [45, "QdDe"],
        [42, "TDe"],
        [39, "DDe"],
        [36, "UDe"],
        [33, "De"],
        [30, "No"],
        [27, "Oc"],
        [24, "Sp"],
        [21, "Sx"],
        [18, "Qn"],
        [15, "Qd"],
        [12, "T"],
        [9, "B"],
        [6, "M"]
      ];
      SUFFIX_BY_EXP = new Map(SUFFIX_ENTRIES);
      NF_INT = new Intl.NumberFormat(void 0, { maximumFractionDigits: 0, useGrouping: true });
    }
  });

  // js/util/storage.js
  var storage_exports = {};
  __export(storage_exports, {
    CURRENCIES: () => CURRENCIES,
    KEYS: () => KEYS,
    STORAGE_PREFIX: () => STORAGE_PREFIX,
    bank: () => bank,
    clearAllStorage: () => clearAllStorage,
    ensureCurrencyDefaults: () => ensureCurrencyDefaults,
    ensureMultiplierDefaults: () => ensureMultiplierDefaults,
    ensureStorageDefaults: () => ensureStorageDefaults,
    getActiveSlot: () => getActiveSlot,
    getCurrency: () => getCurrency,
    getCurrencyMultiplierBN: () => getCurrencyMultiplierBN,
    getHasOpenedSaveSlot: () => getHasOpenedSaveSlot,
    getSlotModifiedFlagKey: () => getSlotModifiedFlagKey,
    getSlotSignature: () => getSlotSignature,
    getSlotSignatureKey: () => getSlotSignatureKey,
    hasModifiedSave: () => hasModifiedSave,
    isCurrencyLocked: () => isCurrencyLocked,
    markSaveSlotModified: () => markSaveSlotModified,
    onCurrencyChange: () => onCurrencyChange,
    peekCurrency: () => peekCurrency,
    primeStorageWatcherSnapshot: () => primeStorageWatcherSnapshot,
    setActiveSlot: () => setActiveSlot,
    setCurrency: () => setCurrency,
    setCurrencyMultiplierBN: () => setCurrencyMultiplierBN,
    setHasOpenedSaveSlot: () => setHasOpenedSaveSlot,
    setSlotSignature: () => setSlotSignature,
    watchStorageKey: () => watchStorageKey
  });
  function normalizeSlotValue(slot) {
    const n = parseInt(slot, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function slotSignatureKey(slot) {
    const normalized = normalizeSlotValue(slot);
    if (normalized == null) return null;
    return `${SLOT_SIGNATURE_PREFIX}:${normalized}`;
  }
  function slotModifiedKey(slot) {
    const normalized = normalizeSlotValue(slot);
    if (normalized == null) return null;
    return `${SLOT_MODIFIED_PREFIX}:${normalized}`;
  }
  function notifyCurrencySubscribers(detail = {}) {
    if (currencyChangeSubscribers.size === 0) return;
    currencyChangeSubscribers.forEach((entry) => {
      if (!entry || typeof entry.handler !== "function") return;
      if (entry.key && detail.key && entry.key !== detail.key) return;
      if (entry.slot != null && detail.slot != null && entry.slot !== detail.slot) return;
      try {
        entry.handler(detail);
      } catch {
      }
    });
  }
  function onCurrencyChange(handler, { key = null, slot = null } = {}) {
    if (typeof handler !== "function") {
      return () => {
      };
    }
    const entry = {
      handler,
      key: key ?? null,
      slot: slot ?? null
    };
    currencyChangeSubscribers.add(entry);
    return () => {
      currencyChangeSubscribers.delete(entry);
    };
  }
  function ensureStorageWatcherTimer() {
    if (storageWatcherTimer != null || storageWatchers.size === 0) return;
    const root = typeof window !== "undefined" ? window : globalThis;
    storageWatcherTimer = root.setInterval(runStorageWatchers, STORAGE_WATCH_INTERVAL_MS);
  }
  function stopStorageWatcherTimerIfIdle() {
    if (storageWatchers.size !== 0 || storageWatcherTimer == null) return;
    const root = typeof window !== "undefined" ? window : globalThis;
    root.clearInterval(storageWatcherTimer);
    storageWatcherTimer = null;
  }
  function parseWith(entry, raw) {
    if (!entry || typeof entry.parse !== "function") return raw;
    try {
      return entry.parse(raw);
    } catch {
      return raw;
    }
  }
  function valuesEqual(entry, a, b) {
    if (!entry || typeof entry.equals !== "function") {
      return Object.is(a, b);
    }
    try {
      return entry.equals(a, b);
    } catch {
      return Object.is(a, b);
    }
  }
  function runStorageWatchers() {
    if (storageWatchers.size === 0) {
      stopStorageWatcherTimerIfIdle();
      return;
    }
    storageWatchers.forEach((entries, key) => {
      if (!entries || entries.size === 0) return;
      let raw;
      try {
        raw = localStorage.getItem(key);
      } catch {
        raw = null;
      }
      entries.forEach((entry) => {
        if (!entry) return;
        const parsed = parseWith(entry, raw);
        if (!entry.initialized) {
          entry.lastRaw = raw;
          entry.lastValue = parsed;
          entry.initialized = true;
          if (entry.emitCurrentValue) {
            try {
              entry.onChange?.(parsed, {
                key,
                raw,
                previous: void 0,
                previousRaw: void 0,
                initial: true,
                rawChanged: true,
                valueChanged: true
              });
            } catch {
            }
          }
          return;
        }
        const rawChanged = raw !== entry.lastRaw;
        const valueChanged = !valuesEqual(entry, entry.lastValue, parsed);
        if (!rawChanged && !valueChanged) return;
        const previousValue = entry.lastValue;
        const previousRaw = entry.lastRaw;
        entry.lastRaw = raw;
        entry.lastValue = parsed;
        try {
          entry.onChange?.(parsed, {
            key,
            raw,
            previous: previousValue,
            previousRaw,
            rawChanged,
            valueChanged
          });
        } catch {
        }
      });
    });
  }
  function watchStorageKey(key, {
    parse,
    equals,
    onChange,
    emitCurrentValue = false
  } = {}) {
    if (!key || typeof localStorage === "undefined") {
      return () => {
      };
    }
    const entry = {
      parse,
      equals,
      onChange,
      emitCurrentValue,
      lastRaw: void 0,
      lastValue: void 0,
      initialized: false
    };
    let set = storageWatchers.get(key);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      storageWatchers.set(key, set);
    }
    set.add(entry);
    ensureStorageWatcherTimer();
    return () => {
      const entries = storageWatchers.get(key);
      if (!entries) return;
      entries.delete(entry);
      if (entries.size === 0) {
        storageWatchers.delete(key);
        stopStorageWatcherTimerIfIdle();
      }
    };
  }
  function primeStorageWatcherSnapshot(key, rawValue) {
    if (!key) return;
    const entries = storageWatchers.get(key);
    if (!entries || entries.size === 0) return;
    let raw = rawValue;
    if (raw === void 0) {
      try {
        raw = localStorage.getItem(key);
      } catch {
        raw = null;
      }
    }
    entries.forEach((entry) => {
      if (!entry) return;
      entry.lastRaw = raw;
      entry.lastValue = parseWith(entry, raw);
      entry.initialized = true;
    });
  }
  function bigNumEquals(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (a instanceof BigNum && typeof a.cmp === "function") {
      try {
        return a.cmp(b) === 0;
      } catch {
      }
    }
    if (b instanceof BigNum && typeof b.cmp === "function") {
      try {
        return b.cmp(a) === 0;
      } catch {
      }
    }
    if (typeof a?.cmp === "function") {
      try {
        return a.cmp(b) === 0;
      } catch {
      }
    }
    if (typeof b?.cmp === "function") {
      try {
        return b.cmp(a) === 0;
      } catch {
      }
    }
    try {
      return Object.is(String(a), String(b));
    } catch {
      return Object.is(a, b);
    }
  }
  function parseBigNumOrZero(raw) {
    if (raw == null) return BigNum.fromInt(0);
    try {
      return BigNum.fromAny(raw);
    } catch {
      return BigNum.fromInt(0);
    }
  }
  function cleanupCurrencyWatchers() {
    currencyWatcherCleanup.forEach((stop) => {
      try {
        stop?.();
      } catch {
      }
    });
    currencyWatcherCleanup.clear();
  }
  function bindCurrencyWatchersForSlot(slot) {
    if (slot === currencyWatcherBoundSlot) return;
    cleanupCurrencyWatchers();
    currencyWatcherBoundSlot = slot ?? null;
    if (slot == null) return;
    for (const currencyKey of Object.values(CURRENCIES)) {
      const storageKey = `${KEYS.CURRENCY[currencyKey]}:${slot}`;
      const stop = watchStorageKey(storageKey, {
        parse: parseBigNumOrZero,
        equals: bigNumEquals,
        onChange: (value, meta) => {
          if (!meta?.valueChanged) return;
          if (typeof window === "undefined") return;
          const detail = { key: currencyKey, value, slot };
          notifyCurrencySubscribers(detail);
          try {
            window.dispatchEvent(new CustomEvent("currency:change", { detail }));
          } catch {
          }
        }
      });
      currencyWatcherCleanup.set(storageKey, stop);
    }
  }
  function initCurrencyStorageWatchers() {
    if (typeof window === "undefined") return;
    bindCurrencyWatchersForSlot(getActiveSlot());
    window.addEventListener("saveSlot:change", () => {
      bindCurrencyWatchersForSlot(getActiveSlot());
    });
  }
  function getActiveSlot() {
    const raw = localStorage.getItem(KEYS.SAVE_SLOT);
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function setActiveSlot(n) {
    const v = Math.max(1, parseInt(n, 10) || 1);
    localStorage.setItem(KEYS.SAVE_SLOT, String(v));
    try {
      window.dispatchEvent(new CustomEvent("saveSlot:change", { detail: { slot: v } }));
    } catch {
    }
  }
  function keyFor(base, slot = getActiveSlot()) {
    if (slot == null) return null;
    return `${base}:${slot}`;
  }
  function isDebugLocked(key) {
    try {
      const lockedKeys = globalThis?.__cccLockedStorageKeys;
      return lockedKeys?.has?.(key) ?? false;
    } catch {
      return false;
    }
  }
  function getSlotSignatureKey(slot = getActiveSlot()) {
    return slotSignatureKey(slot);
  }
  function getSlotModifiedFlagKey(slot = getActiveSlot()) {
    return slotModifiedKey(slot);
  }
  function getSlotSignature(slot = getActiveSlot()) {
    if (typeof localStorage === "undefined") return null;
    const key = slotSignatureKey(slot);
    if (!key) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function setSlotSignature(slot, signature) {
    if (typeof localStorage === "undefined") return;
    const key = slotSignatureKey(slot);
    if (!key) return;
    try {
      if (signature == null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, String(signature));
      }
    } catch {
    }
  }
  function hasModifiedSave(slot = getActiveSlot()) {
    if (typeof localStorage === "undefined") return false;
    const key = slotModifiedKey(slot);
    if (!key) return false;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }
  function markSaveSlotModified(slot = getActiveSlot()) {
    if (typeof localStorage === "undefined") return;
    const normalized = normalizeSlotValue(slot);
    if (normalized == null) return;
    if (hasModifiedSave(normalized)) return;
    const key = slotModifiedKey(normalized);
    if (!key) return;
    try {
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("saveSlot:modified", { detail: { slot: normalized } }));
    } catch {
    }
  }
  function getHasOpenedSaveSlot() {
    return localStorage.getItem(KEYS.HAS_OPENED_SAVE_SLOT) === "true";
  }
  function setHasOpenedSaveSlot(value) {
    localStorage.setItem(KEYS.HAS_OPENED_SAVE_SLOT, value ? "true" : "false");
  }
  function ensureStorageDefaults() {
    if (localStorage.getItem(KEYS.HAS_OPENED_SAVE_SLOT) === null) {
      setHasOpenedSaveSlot(false);
    }
  }
  function ensureCurrencyDefaults() {
    const slot = getActiveSlot();
    if (slot == null) return;
    for (const key of Object.values(CURRENCIES)) {
      const k = `${KEYS.CURRENCY[key]}:${slot}`;
      if (!localStorage.getItem(k)) localStorage.setItem(k, "0");
    }
  }
  function ensureMultiplierDefaults() {
    const slot = getActiveSlot();
    if (slot == null) return;
    for (const key of Object.values(CURRENCIES)) {
      const km = `${KEYS.MULTIPLIER[key]}:${slot}`;
      if (!localStorage.getItem(km)) {
        const theor = scaledFromIntBN(BigNum.fromInt(1));
        setMultiplierScaled(key, theor);
      } else {
        getMultiplierScaled(key);
      }
    }
  }
  function getCurrency(key) {
    const k = keyFor(KEYS.CURRENCY[key]);
    if (!k) return BigNum.fromInt(0);
    const raw = localStorage.getItem(k);
    if (!raw) return BigNum.fromInt(0);
    try {
      return BigNum.fromAny(raw);
    } catch {
      return BigNum.fromInt(0);
    }
  }
  function setCurrency(key, value, { delta = null, previous = null } = {}) {
    const slot = getActiveSlot();
    const k = keyFor(KEYS.CURRENCY[key], slot);
    const prev = previous ?? getCurrency(key);
    if (!k) return prev;
    if (isCurrencyLocked(key, slot)) {
      let deltaBn = null;
      if (delta) {
        try {
          deltaBn = delta instanceof BigNum ? delta.clone?.() ?? delta : BigNum.fromAny(delta);
        } catch {
          deltaBn = null;
        }
      }
      const detail = { key, value: prev, slot, delta: deltaBn ?? void 0 };
      notifyCurrencySubscribers(detail);
      try {
        window.dispatchEvent(new CustomEvent("currency:change", { detail }));
      } catch {
      }
      return prev;
    }
    let bn;
    try {
      bn = BigNum.fromAny(value);
    } catch {
      bn = BigNum.fromInt(0);
    }
    if (bn.isNegative?.()) bn = BigNum.fromInt(0);
    const expectedRaw = bn.toStorage();
    try {
      localStorage.setItem(k, expectedRaw);
    } catch {
    }
    let persistedRaw = null;
    try {
      persistedRaw = localStorage.getItem(k);
    } catch {
    }
    const effectiveRaw = persistedRaw ?? expectedRaw;
    let effective = bn;
    try {
      if (persistedRaw != null) {
        effective = BigNum.fromAny(persistedRaw);
        if (effective.isNegative?.()) effective = BigNum.fromInt(0);
      }
    } catch {
    }
    primeStorageWatcherSnapshot(k, effectiveRaw);
    const changed = !bigNumEquals(prev, effective);
    if (changed) {
      let deltaBn = null;
      try {
        deltaBn = effective.sub?.(prev);
      } catch {
      }
      if (!deltaBn && delta) {
        try {
          deltaBn = delta instanceof BigNum ? delta : BigNum.fromAny(delta);
        } catch {
          deltaBn = null;
        }
      }
      const detail = { key, value: effective, slot, delta: deltaBn ?? void 0 };
      notifyCurrencySubscribers(detail);
      try {
        window.dispatchEvent(new CustomEvent("currency:change", { detail }));
      } catch {
      }
    }
    return effective;
  }
  function scaledFromIntBN(intBN) {
    return intBN.mulScaledIntFloor(1n, -MULT_SCALE);
  }
  function intFromScaled(theorBN) {
    const bn = BigNum.fromAny(theorBN);
    if (bn.isInfinite()) return bn.clone();
    const scaled = bn.mulScaledIntFloor(1n, MULT_SCALE);
    if (scaled.isZero()) return BigNum.fromInt(1);
    return scaled;
  }
  function getMultiplierScaled(key) {
    const k = keyFor(KEYS.MULTIPLIER[key]);
    if (!k) return scaledFromIntBN(BigNum.fromInt(1));
    const raw = localStorage.getItem(k);
    if (!raw || !raw.startsWith(MULT_SCALE_TAG)) {
      const theor = scaledFromIntBN(BigNum.fromInt(1));
      setMultiplierScaled(key, theor);
      return theor;
    }
    const payload = raw.slice(MULT_SCALE_TAG.length);
    try {
      return BigNum.fromAny(payload);
    } catch {
      const theor = scaledFromIntBN(BigNum.fromInt(1));
      setMultiplierScaled(key, theor);
      return theor;
    }
  }
  function setMultiplierScaled(key, theoreticalBN, slot = getActiveSlot()) {
    const k = keyFor(KEYS.MULTIPLIER[key], slot);
    if (!k) return;
    if (isCurrencyLocked(key, slot)) return;
    let prev = scaledFromIntBN(BigNum.fromInt(1));
    const existingRaw = localStorage.getItem(k);
    if (existingRaw?.startsWith?.(MULT_SCALE_TAG)) {
      try {
        prev = BigNum.fromAny(existingRaw.slice(MULT_SCALE_TAG.length));
      } catch {
      }
    }
    const bn = BigNum.fromAny(theoreticalBN);
    const raw = MULT_SCALE_TAG + bn.toStorage();
    try {
      localStorage.setItem(k, raw);
    } catch {
    }
    let persistedRaw = null;
    try {
      persistedRaw = localStorage.getItem(k);
    } catch {
    }
    const effectiveRaw = persistedRaw ?? raw;
    let effective = bn;
    try {
      const payload = effectiveRaw?.startsWith?.(MULT_SCALE_TAG) ? effectiveRaw.slice(MULT_SCALE_TAG.length) : null;
      if (payload != null) effective = BigNum.fromAny(payload);
    } catch {
    }
    try {
      primeStorageWatcherSnapshot(k, effectiveRaw);
    } catch {
    }
    if (!bigNumEquals(prev, effective)) {
      try {
        window.dispatchEvent(new CustomEvent("currency:multiplier", {
          detail: { key, mult: intFromScaled(effective), slot }
        }));
      } catch {
      }
    }
  }
  function getCurrencyMultiplierBN(key) {
    return intFromScaled(getMultiplierScaled(key));
  }
  function isCurrencyLocked(key, slot = getActiveSlot()) {
    const k = keyFor(KEYS.CURRENCY[key], slot);
    return isDebugLocked(k);
  }
  function setCurrencyMultiplierBN(key, intBNValue) {
    const v = BigNum.fromAny(intBNValue);
    const theor = scaledFromIntBN(v);
    setMultiplierScaled(key, theor, getActiveSlot());
    return v;
  }
  function peekCurrency(slot, key) {
    const raw = localStorage.getItem(`${KEYS.CURRENCY[key]}:${slot}`);
    if (!raw) return BigNum.fromInt(0);
    try {
      return BigNum.fromAny(raw);
    } catch {
      return BigNum.fromInt(0);
    }
  }
  function clearAllStorage() {
    Object.values(KEYS).forEach((v) => {
      if (typeof v === "string") {
        localStorage.removeItem(v);
      } else if (typeof v === "object") {
        Object.values(v).forEach((sub) => localStorage.removeItem(sub));
      }
    });
  }
  function makeCurrencyHandle(key) {
    const fn = (x) => {
      try {
        const bn = BigNum.fromAny(x);
        return typeof formatNumber === "function" ? formatNumber(bn) : bn.toString();
      } catch {
        return "NaN";
      }
    };
    Object.defineProperty(fn, "value", {
      get() {
        return getCurrency(key);
      }
    });
    fn.toString = function toString() {
      return this.value.toString();
    };
    fn.add = function add(x) {
      const amt = BigNum.fromAny(x);
      const next = this.value.add(amt);
      const effective = setCurrency(key, next, { delta: amt, previous: this.value });
      return effective;
    };
    fn.sub = function sub(x) {
      const amt = BigNum.fromAny(x);
      const cur = this.value;
      let next = cur.sub(amt);
      if (next.isNegative?.()) next = BigNum.fromInt(0);
      setCurrency(key, next);
      return next;
    };
    fn.set = function set(x) {
      const val = BigNum.fromAny(x);
      let delta = null;
      let current;
      try {
        current = this.value;
        if (current && typeof current.sub === "function") {
          delta = val.sub(current);
        }
      } catch {
      }
      const effective = setCurrency(key, val, { delta, previous: current });
      return effective;
    };
    fn.fmt = function fmt(x) {
      const bn = BigNum.fromAny(x);
      return typeof formatNumber === "function" ? formatNumber(bn) : bn.toString();
    };
    fn.mult = {
      get() {
        return getCurrencyMultiplierBN(key);
      },
      set(x) {
        return setCurrencyMultiplierBN(key, x);
      },
      multiplyByInt(x) {
        const factor = BigNum.fromAny(x).floorToInteger();
        let theor = getMultiplierScaled(key).mulBigNumInteger(factor);
        if (theor.isZero()) theor = scaledFromIntBN(BigNum.fromInt(1));
        setMultiplierScaled(key, theor);
        return intFromScaled(theor);
      },
      multiplyByDecimal(x) {
        let parsed;
        try {
          parsed = BigNum._parseDecimalMultiplier(String(x), MULT_SCALE);
        } catch {
          parsed = { numer: 1n, scale: 0 };
        }
        let theor = getMultiplierScaled(key).mulScaledIntFloor(parsed.numer, parsed.scale);
        if (theor.isZero()) theor = scaledFromIntBN(BigNum.fromInt(1));
        setMultiplierScaled(key, theor);
        const next = intFromScaled(theor);
        return next.isZero() ? BigNum.fromInt(1) : next;
      },
      multiplyByPercent(pct) {
        const factor = Number(pct) / 100 + 1;
        return this.multiplyByDecimal(String(factor));
      },
      applyTo(amount) {
        const mult = this.get();
        if (mult.isInfinite()) {
          return BigNum.fromAny("Infinity");
        }
        const amt = BigNum.fromAny(amount, mult.p);
        if (amt.isZero() || mult.isZero()) return amt.clone();
        return amt.mulBigNumInteger(mult);
      }
    };
    fn.addWithMultiplier = function addWithMultiplier(baseAmount) {
      const inc = fn.mult.applyTo(baseAmount);
      return fn.add(inc);
    };
    return fn;
  }
  var PREFIX, STORAGE_PREFIX, SLOT_SIGNATURE_PREFIX, SLOT_MODIFIED_PREFIX, MULT_SCALE, MULT_SCALE_TAG, STORAGE_WATCH_INTERVAL_MS, storageWatchers, storageWatcherTimer, currencyChangeSubscribers, currencyWatcherCleanup, currencyWatcherBoundSlot, KEYS, CURRENCIES, bank;
  var init_storage = __esm({
    "js/util/storage.js"() {
      init_bigNum();
      init_numFormat();
      PREFIX = "ccc:";
      STORAGE_PREFIX = PREFIX;
      SLOT_SIGNATURE_PREFIX = `${PREFIX}slotSig`;
      SLOT_MODIFIED_PREFIX = `${PREFIX}slotMod`;
      MULT_SCALE = 18;
      MULT_SCALE_TAG = "XM:";
      STORAGE_WATCH_INTERVAL_MS = 140;
      storageWatchers = /* @__PURE__ */ new Map();
      storageWatcherTimer = null;
      currencyChangeSubscribers = /* @__PURE__ */ new Set();
      currencyWatcherCleanup = /* @__PURE__ */ new Map();
      currencyWatcherBoundSlot = null;
      KEYS = {
        HAS_OPENED_SAVE_SLOT: `${PREFIX}hasOpenedSaveSlot`,
        SAVE_SLOT: `${PREFIX}saveSlot`,
        CURRENCY: {},
        MULTIPLIER: {}
      };
      CURRENCIES = {
        COINS: "coins",
        BOOKS: "books",
        GOLD: "gold"
      };
      for (const key of Object.values(CURRENCIES)) {
        KEYS.CURRENCY[key] = `${PREFIX}${key}`;
        KEYS.MULTIPLIER[key] = `${PREFIX}mult:${key}`;
      }
      initCurrencyStorageWatchers();
      bank = new Proxy({}, {
        get(_, prop) {
          if (Object.values(CURRENCIES).includes(prop)) return makeCurrencyHandle(prop);
          if (typeof prop === "string" && CURRENCIES[prop.toUpperCase?.()]) {
            return makeCurrencyHandle(CURRENCIES[prop.toUpperCase()]);
          }
          return void 0;
        }
      });
      if (typeof window !== "undefined") {
        window.bank = bank;
        window.coins = bank.coins;
        window.books = bank.books;
      }
    }
  });

  // js/util/slotsManager.js
  function setDeleteMode(on) {
    deleteMode = !!on;
    document.body.classList.toggle("slots-delete-mode", deleteMode);
    const btn = document.getElementById("manage-saves");
    if (btn) btn.textContent = deleteMode ? "Done" : "Manage save slots";
    document.querySelectorAll(".slot-card").forEach((card) => {
      card.classList.toggle("is-deleting", deleteMode);
      card.setAttribute("aria-pressed", deleteMode ? "true" : "false");
    });
  }
  function removeAllKeysForSlot(slot) {
    const re = new RegExp(`^ccc:.*:${slot}$`);
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (re.test(k)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  }
  function initSlotsManager() {
    if (initialized) return;
    initialized = true;
    const manageBtn = document.getElementById("manage-saves");
    const grid = document.querySelector(".slots-grid");
    if (!manageBtn || !grid) return;
    manageBtn.addEventListener("click", (e) => {
      e.preventDefault();
      setDeleteMode(!deleteMode);
    });
    window.addEventListener("keydown", (e) => {
      if (deleteMode && e.key === "Escape") setDeleteMode(false);
    });
    const onPointerDownCapture = (e) => {
      if (!deleteMode) return;
      const card = e.target.closest(".slot-card");
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onClickCapture2 = (e) => {
      if (!deleteMode) return;
      const card = e.target.closest(".slot-card");
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      let slot = parseInt(card.dataset.slot, 10);
      if (!Number.isFinite(slot) || slot <= 0) {
        const cards = Array.from(document.querySelectorAll(".slot-card"));
        slot = cards.indexOf(card) + 1;
      }
      const hasData = localStorage.getItem(`ccc:coins:${slot}`) !== null;
      if (!hasData) {
        alert(`Slot ${slot} has no save data.`);
        return;
      }
      if (!confirm(`Delete save data in Slot ${slot}? This cannot be undone.`)) return;
      removeAllKeysForSlot(slot);
      if (getActiveSlot() === slot) {
        try {
          localStorage.removeItem(KEYS.SAVE_SLOT);
        } catch {
        }
      }
      refreshSlotsView();
      setDeleteMode(false);
    };
    grid.addEventListener("pointerdown", onPointerDownCapture, true);
    grid.addEventListener("click", onClickCapture2, true);
    setDeleteMode(false);
  }
  var deleteMode, initialized;
  var init_slotsManager = __esm({
    "js/util/slotsManager.js"() {
      init_storage();
      init_slots();
      deleteMode = false;
      initialized = false;
      document.addEventListener("DOMContentLoaded", () => {
        try {
          initSlotsManager();
        } catch {
        }
      });
    }
  });

  // js/util/slots.js
  var slots_exports = {};
  __export(slots_exports, {
    initSlots: () => initSlots,
    refreshSlotsView: () => refreshSlotsView
  });
  function hasSlotData(slot) {
    return localStorage.getItem(`ccc:coins:${slot}`) !== null;
  }
  function coinsTextFor(slot) {
    if (!hasSlotData(slot)) return "No save data";
    try {
      const bn = peekCurrency(slot, "coins");
      return `Coins: ${bn.toString()}`;
    } catch {
      return "Coins: 0";
    }
  }
  function renderSlotCards() {
    const cards = document.querySelectorAll(".slot-card");
    cards.forEach((btn, idx) => {
      const slot = idx + 1;
      const titleEl = btn.querySelector(".slot-title");
      if (titleEl) titleEl.textContent = coinsTextFor(slot);
      btn.dataset.slot = String(slot);
    });
  }
  function initSlots(onSelect) {
    const cards = document.querySelectorAll(".slot-card");
    renderSlotCards();
    cards.forEach((btn, idx) => {
      const slotNum = idx + 1;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        setActiveSlot(slotNum);
        ensureCurrencyDefaults();
        ensureMultiplierDefaults();
        setHasOpenedSaveSlot(true);
        if (typeof onSelect === "function") onSelect(slotNum, ev);
        renderSlotCards();
      });
    });
  }
  function refreshSlotsView() {
    renderSlotCards();
  }
  var init_slots = __esm({
    "js/util/slots.js"() {
      init_bigNum();
      init_slotsManager();
      init_storage();
    }
  });

  // js/util/audioCache.js
  var audioCache_exports = {};
  __export(audioCache_exports, {
    registerPreloadedAudio: () => registerPreloadedAudio,
    takePreloadedAudio: () => takePreloadedAudio
  });
  function registerPreloadedAudio(src, element) {
    const key = normalize(src);
    if (!key || !element) return;
    element.pause?.();
    try {
      element.currentTime = 0;
    } catch (_) {
    }
    cache.set(key, element);
  }
  function takePreloadedAudio(src) {
    const key = normalize(src);
    if (!cache.has(key)) return null;
    const el = cache.get(key);
    cache.delete(key);
    return el;
  }
  var cache, normalize;
  var init_audioCache = __esm({
    "js/util/audioCache.js"() {
      cache = /* @__PURE__ */ new Map();
      normalize = (src) => {
        try {
          return new URL(src, document.baseURI).href;
        } catch (_) {
          return src;
        }
      };
    }
  });

  // js/ui/hudLayout.js
  function syncXpMpHudLayout() {
    if (typeof document === "undefined") return;
    const hud = document.querySelector(".hud-top");
    if (!hud) return;
    const xpEl = document.querySelector("[data-xp-hud]");
    const mpEl = document.querySelector("[data-mp-hud]");
    const xpVisible = !!(xpEl && !xpEl.hasAttribute("hidden"));
    const mpVisible = !!(mpEl && !mpEl.hasAttribute("hidden"));
    hud.classList.toggle("hud-top--xp-only", xpVisible && !mpVisible);
    hud.classList.toggle("hud-top--xp-mp", xpVisible && mpVisible);
    if (!xpVisible && !mpVisible) {
      hud.classList.remove("hud-top--xp-only", "hud-top--xp-mp");
    }
  }
  var init_hudLayout = __esm({
    "js/ui/hudLayout.js"() {
    }
  });

  // js/game/xpSystem.js
  var xpSystem_exports = {};
  __export(xpSystem_exports, {
    addExternalCoinMultiplierProvider: () => addExternalCoinMultiplierProvider,
    addExternalXpGainMultiplierProvider: () => addExternalXpGainMultiplierProvider,
    addXp: () => addXp,
    broadcastXpChange: () => broadcastXpChange,
    computeCoinMultiplierForXpLevel: () => computeCoinMultiplierForXpLevel,
    getXpLevelStorageKey: () => getXpLevelStorageKey,
    getXpRequirementForXpLevel: () => getXpRequirementForXpLevel,
    getXpState: () => getXpState,
    initXpSystem: () => initXpSystem,
    isXpSystemUnlocked: () => isXpSystemUnlocked,
    onXpChange: () => onXpChange,
    refreshCoinMultiplierFromXpLevel: () => refreshCoinMultiplierFromXpLevel,
    resetXpProgress: () => resetXpProgress,
    setExternalBookRewardProvider: () => setExternalBookRewardProvider,
    setExternalCoinMultiplierProvider: () => setExternalCoinMultiplierProvider,
    setExternalXpGainMultiplierProvider: () => setExternalXpGainMultiplierProvider,
    unlockXpSystem: () => unlockXpSystem
  });
  function getXpLevelStorageKey(slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    return resolvedSlot == null ? null : KEY_XP_LEVEL(resolvedSlot);
  }
  function bigIntToFloatApprox(value) {
    if (value === 0n) return 0;
    const str = value.toString();
    const len = str.length;
    const headDigits = Math.min(len, 15);
    const head = Number(str.slice(0, headDigits));
    const exponent = len - headDigits;
    if (!Number.isFinite(head)) return Number.POSITIVE_INFINITY;
    const scaled = head * Math.pow(10, exponent);
    return Number.isFinite(scaled) ? scaled : Number.POSITIVE_INFINITY;
  }
  function bigNumIsInfinite(bn) {
    return !!(bn && typeof bn === "object" && (bn.isInfinite?.() || typeof bn.isInfinite === "function" && bn.isInfinite()));
  }
  function bigNumIsZero(bn) {
    return !bn || typeof bn !== "object" || (bn.isZero?.() || typeof bn.isZero === "function" && bn.isZero());
  }
  function bigNumToFiniteNumber(bn) {
    if (!bn || typeof bn !== "object") return 0;
    if (bigNumIsInfinite(bn)) return Number.POSITIVE_INFINITY;
    const sci = typeof bn.toScientific === "function" ? bn.toScientific(18) : String(bn);
    if (!sci || sci === "Infinity") return Number.POSITIVE_INFINITY;
    const match = sci.match(/^([0-9]+(?:\.[0-9]+)?)e([+-]?\d+)$/i);
    if (match) {
      const mant = parseFloat(match[1]);
      const exp = parseInt(match[2], 10);
      if (!Number.isFinite(mant) || !Number.isFinite(exp)) return Number.POSITIVE_INFINITY;
      if (exp >= 309) return Number.POSITIVE_INFINITY;
      return mant * Math.pow(10, exp);
    }
    const num = Number(sci);
    return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
  }
  function logBigNumToNumber(bn) {
    if (!bn || typeof bn !== "object") return 0;
    if (bigNumIsInfinite(bn)) return Number.POSITIVE_INFINITY;
    if (typeof bn.cmp === "function" && bn.cmp(maxLog10Bn) >= 0) {
      return Number.POSITIVE_INFINITY;
    }
    return bigNumToFiniteNumber(bn);
  }
  function computeBonusCountBn(levelBn) {
    if (!levelBn || typeof levelBn !== "object") return BigNum.fromInt(0);
    const divided = levelBn.mulDecimal(TEN_DIVISOR_DECIMAL, 1);
    const floored = divided.floorToInteger();
    if (typeof divided.cmp === "function" && divided.cmp(floored) === 0) {
      if (floored.isZero?.() || typeof floored.isZero === "function" && floored.isZero()) {
        return floored;
      }
      return floored.sub?.(bnOne()) ?? BigNum.fromInt(0);
    }
    return floored;
  }
  function computeLevelLogTerm(levelBn) {
    if (!levelBn || typeof levelBn !== "object") return BigNum.fromInt(0);
    return levelBn.mulDecimal(LOG_STEP_DECIMAL, 18);
  }
  function computeBonusLogTerm(levelBn) {
    const bonusCount = computeBonusCountBn(levelBn);
    if (bigNumIsZero(bonusCount)) return null;
    return bonusCount.mulDecimal(LOG_DECADE_BONUS_DECIMAL, 18);
  }
  function approximateCoinMultiplierFromBigNum(levelBn) {
    if (!levelBn || typeof levelBn !== "object") {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    const levelLog = computeLevelLogTerm(levelBn);
    let totalLog = levelLog;
    const bonusLog = computeBonusLogTerm(levelBn);
    if (bonusLog) {
      totalLog = totalLog.add?.(bonusLog) ?? totalLog;
    }
    const logNumber = logBigNumToNumber(totalLog);
    if (!Number.isFinite(logNumber)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    const approx = bigNumFromLog10(logNumber);
    const approxIsInf = approx.isInfinite?.() || typeof approx.isInfinite === "function" && approx.isInfinite();
    if (approxIsInf) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    const levelTerm = levelBn.clone?.() ?? (() => {
      try {
        return BigNum.fromAny(levelBn ?? 0);
      } catch {
        return BigNum.fromInt(0);
      }
    })();
    let combined = approx.clone?.() ?? approx;
    if (typeof combined.add === "function") {
      combined = combined.add(levelTerm);
    } else if (typeof levelTerm.add === "function") {
      combined = levelTerm.add(combined);
    }
    return combined;
  }
  function enforceXpInfinityInvariant() {
    const levelIsInf = bigNumIsInfinite(xpState.xpLevel);
    const progIsInf = bigNumIsInfinite(xpState.progress);
    if (!levelIsInf && !progIsInf) return false;
    const inf = infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    xpState.xpLevel = inf.clone?.() ?? inf;
    xpState.progress = inf.clone?.() ?? inf;
    requirementBn = inf.clone?.() ?? inf;
    if (bank?.books) {
      try {
        if (typeof bank.books.set === "function") {
          bank.books.set(inf.clone?.() ?? inf);
        } else if (typeof bank.books.add === "function") {
          bank.books.add(inf.clone?.() ?? inf);
        }
      } catch {
      }
    }
    return true;
  }
  function notifyXpSubscribers(detail = {}) {
    if (xpChangeSubscribers.size === 0) return;
    xpChangeSubscribers.forEach((entry) => {
      if (!entry || typeof entry.handler !== "function") return;
      if (entry.slot != null && detail.slot != null && entry.slot !== detail.slot) return;
      try {
        entry.handler(detail);
      } catch {
      }
    });
  }
  function onXpChange(handler, { slot = null } = {}) {
    if (typeof handler !== "function") {
      return () => {
      };
    }
    const entry = { handler, slot: slot ?? null };
    xpChangeSubscribers.add(entry);
    return () => {
      xpChangeSubscribers.delete(entry);
    };
  }
  function bnZero() {
    return BigNum.fromInt(0);
  }
  function bnOne() {
    return BigNum.fromInt(1);
  }
  function cloneBigNumSafe(value) {
    if (!value) return bnZero();
    if (typeof value.clone === "function") {
      try {
        return value.clone();
      } catch {
      }
    }
    try {
      return BigNum.fromAny(value);
    } catch {
      return bnZero();
    }
  }
  function bigNumEqualsSafe(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a?.cmp === "function") {
      try {
        return a.cmp(b) === 0;
      } catch {
      }
    }
    if (typeof b?.cmp === "function") {
      try {
        return b.cmp(a) === 0;
      } catch {
      }
    }
    try {
      return Object.is(String(a), String(b));
    } catch {
      return false;
    }
  }
  function cleanupXpStorageWatchers() {
    while (xpStorageWatcherCleanups.length > 0) {
      const stop = xpStorageWatcherCleanups.pop();
      try {
        stop?.();
      } catch {
      }
    }
  }
  function parseBigNumOrZero2(raw) {
    if (raw == null) return bnZero();
    try {
      return BigNum.fromAny(raw);
    } catch {
      return bnZero();
    }
  }
  function handleExternalXpStorageChange(reason) {
    if (handlingExternalXpStorage) return;
    handlingExternalXpStorage = true;
    try {
      const slot = xpStorageWatcherSlot ?? getActiveSlot();
      const prev = {
        unlocked: xpState.unlocked,
        xpLevel: cloneBigNumSafe(xpState.xpLevel),
        progress: cloneBigNumSafe(xpState.progress),
        requirement: cloneBigNumSafe(requirementBn)
      };
      ensureStateLoaded(true);
      updateHud();
      syncCoinMultiplierWithXpLevel(true);
      const current = {
        unlocked: xpState.unlocked,
        xpLevel: cloneBigNumSafe(xpState.xpLevel),
        progress: cloneBigNumSafe(xpState.progress),
        requirement: cloneBigNumSafe(requirementBn)
      };
      const unlockedChanged = prev.unlocked !== current.unlocked;
      const levelChanged = !bigNumEqualsSafe(prev.xpLevel, current.xpLevel);
      const progressChanged = !bigNumEqualsSafe(prev.progress, current.progress);
      if (!unlockedChanged && !levelChanged && !progressChanged) {
        return;
      }
      let xpLevelsGained = bnZero();
      if (levelChanged) {
        try {
          xpLevelsGained = current.xpLevel.sub?.(prev.xpLevel) ?? bnZero();
        } catch {
          xpLevelsGained = bnZero();
        }
      }
      let xpAdded = null;
      if (!levelChanged && progressChanged) {
        try {
          xpAdded = current.progress.sub?.(prev.progress) ?? null;
        } catch {
          xpAdded = null;
        }
      }
      if (typeof window !== "undefined" || xpChangeSubscribers.size > 0) {
        const detail = {
          unlocked: current.unlocked,
          xpLevelsGained: xpLevelsGained?.clone?.() ?? xpLevelsGained,
          xpAdded: xpAdded?.clone?.() ?? xpAdded,
          xpLevel: current.xpLevel?.clone?.() ?? current.xpLevel,
          progress: current.progress?.clone?.() ?? current.progress,
          requirement: current.requirement?.clone?.() ?? current.requirement,
          source: "storage",
          changeType: reason,
          slot
        };
        notifyXpSubscribers(detail);
        if (typeof window !== "undefined") {
          try {
            window.dispatchEvent(new CustomEvent("xp:change", { detail }));
          } catch {
          }
        }
      }
    } finally {
      handlingExternalXpStorage = false;
    }
  }
  function bindXpStorageWatchersForSlot(slot) {
    if (slot === xpStorageWatcherSlot) return;
    cleanupXpStorageWatchers();
    xpStorageWatcherSlot = slot ?? null;
    if (slot == null) return;
    const watch = (key, options) => {
      const stop = watchStorageKey(key, options);
      if (typeof stop === "function") {
        xpStorageWatcherCleanups.push(stop);
      }
    };
    watch(KEY_UNLOCK(slot), {
      parse: (raw) => raw === "1",
      equals: (a, b) => a === b,
      onChange: () => handleExternalXpStorageChange("unlock")
    });
    watch(KEY_XP_LEVEL(slot), {
      parse: parseBigNumOrZero2,
      equals: bigNumEqualsSafe,
      onChange: () => handleExternalXpStorageChange("xpLevel")
    });
    watch(KEY_PROGRESS(slot), {
      parse: parseBigNumOrZero2,
      equals: bigNumEqualsSafe,
      onChange: () => handleExternalXpStorageChange("progress")
    });
  }
  function ensureXpStorageWatchers() {
    if (xpStorageWatchersInitialized) {
      bindXpStorageWatchersForSlot(getActiveSlot());
      return;
    }
    xpStorageWatchersInitialized = true;
    bindXpStorageWatchersForSlot(getActiveSlot());
    if (typeof window !== "undefined") {
      window.addEventListener("saveSlot:change", () => {
        bindXpStorageWatchersForSlot(getActiveSlot());
        ensureStateLoaded(true);
        updateHud();
        syncCoinMultiplierWithXpLevel(true);
      });
    }
  }
  function stripHtml(value) {
    if (typeof value !== "string") return "";
    return value.replace(/<[^>]*>/g, "");
  }
  function approxLog10(bn) {
    if (!bn || typeof bn !== "object") return Number.NEGATIVE_INFINITY;
    if (bn.isInfinite?.() || typeof bn.isInfinite === "function" && bn.isInfinite()) {
      return Number.POSITIVE_INFINITY;
    }
    if (bn.isZero?.() || typeof bn.isZero === "function" && bn.isZero()) {
      return Number.NEGATIVE_INFINITY;
    }
    const sig = bn.sig;
    const expBase = typeof bn.e === "number" ? bn.e : Number(bn.e ?? 0);
    const expOffset = typeof bn._eOffset === "bigint" ? bigIntToFloatApprox(bn._eOffset) : Number(bn._eOffset ?? 0);
    if (!Number.isFinite(expBase)) {
      return expBase > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    if (!Number.isFinite(expOffset)) {
      return expOffset > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    const totalExponent = expBase + expOffset;
    if (!Number.isFinite(totalExponent)) {
      return totalExponent > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    let mantissaLog = 0;
    if (typeof sig === "bigint") {
      const sigStr = sig.toString();
      const trimmed = sigStr.replace(/^0+/, "");
      if (!trimmed) return Number.NEGATIVE_INFINITY;
      const digits = trimmed.length;
      const headDigits = Math.min(digits, 15);
      const headSlice = trimmed.slice(0, headDigits);
      const head = Number.parseFloat(headSlice);
      if (Number.isFinite(head) && head > 0) {
        mantissaLog = Math.log10(head) + (digits - headDigits);
      } else {
        mantissaLog = digits - 1;
      }
    } else {
      try {
        const sci = typeof bn.toScientific === "function" ? bn.toScientific(12) : String(bn);
        if (!sci || sci === "0") return Number.NEGATIVE_INFINITY;
        if (sci === "Infinity") return Number.POSITIVE_INFINITY;
        const match = sci.match(/^([0-9]+(?:\.[0-9]+)?)e([+-]?\d+)$/i);
        if (match) {
          const mant = parseFloat(match[1]);
          const exp = parseInt(match[2], 10) || 0;
          if (!(mant > 0) || !Number.isFinite(mant)) return Number.NEGATIVE_INFINITY;
          mantissaLog = Math.log10(mant) + exp;
        } else {
          const num = Number(sci);
          if (!Number.isFinite(num) || num <= 0) return Number.NEGATIVE_INFINITY;
          mantissaLog = Math.log10(num);
        }
      } catch {
        return Number.NEGATIVE_INFINITY;
      }
    }
    return totalExponent + mantissaLog;
  }
  function ensureExactRequirementCacheUpTo(levelBigInt) {
    const target = levelBigInt < EXACT_REQUIREMENT_CACHE_LEVEL ? levelBigInt : EXACT_REQUIREMENT_CACHE_LEVEL;
    if (target <= highestCachedExactLevel) return;
    let currentLevel = highestCachedExactLevel;
    let currentRequirement = xpRequirementCache.get(currentLevel.toString());
    if (!currentRequirement) {
      currentRequirement = BigNum.fromInt(10);
      xpRequirementCache.set(currentLevel.toString(), currentRequirement);
    }
    while (currentLevel < target) {
      const nextLevel = currentLevel + 1n;
      let nextRequirement = currentRequirement.mulScaledIntFloor(11n, 1);
      if (nextLevel > 1n && (nextLevel - 1n) % 10n === 0n) {
        nextRequirement = nextRequirement.mulScaledIntFloor(25n, 1);
      }
      xpRequirementCache.set(nextLevel.toString(), nextRequirement);
      currentRequirement = nextRequirement;
      currentLevel = nextLevel;
      const isInfinite = currentRequirement.isInfinite?.() || typeof currentRequirement.isInfinite === "function" && currentRequirement.isInfinite();
      if (isInfinite) {
        highestCachedExactLevel = currentLevel;
        return;
      }
    }
    highestCachedExactLevel = currentLevel;
  }
  function bigNumFromLog10(log10Value) {
    if (!Number.isFinite(log10Value) || log10Value >= BigNum.MAX_E) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    let exponent = Math.floor(log10Value);
    let fractional = log10Value - exponent;
    if (!Number.isFinite(fractional)) {
      fractional = 0;
    }
    let mantissa = Math.pow(10, fractional);
    if (!Number.isFinite(mantissa) || mantissa <= 0) {
      mantissa = 1;
    }
    if (mantissa >= 10) {
      mantissa /= 10;
      exponent += 1;
    }
    let exponentStr;
    try {
      exponentStr = Number.isFinite(exponent) ? exponent.toLocaleString("en", { useGrouping: false }) : String(exponent);
    } catch {
      exponentStr = String(exponent);
    }
    const sci = `${mantissa.toPrecision(18)}e${exponentStr}`;
    try {
      return BigNum.fromScientific(sci).floorToInteger();
    } catch {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
  }
  function approximateRequirementFromLevel(levelBn) {
    const baseLevel = highestCachedExactLevel > 0n ? highestCachedExactLevel : 0n;
    const baseRequirement = xpRequirementCache.get(baseLevel.toString());
    if (!baseRequirement || bigNumIsInfinite(baseRequirement)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    const baseLevelBn = BigNum.fromAny(baseLevel.toString());
    const baseLog = approxLog10(baseRequirement);
    let totalLog = BigNum.fromInt(0);
    if (Number.isFinite(baseLog) && baseLog > 0) {
      try {
        totalLog = BigNum.fromScientific(baseLog.toString());
      } catch {
        totalLog = BigNum.fromInt(0);
      }
    }
    const deltaLevel = levelBn.sub?.(baseLevelBn) ?? BigNum.fromInt(0);
    if (!bigNumIsZero(deltaLevel)) {
      totalLog = totalLog.add?.(deltaLevel.mulDecimal(LOG_STEP_DECIMAL, 18)) ?? totalLog;
    }
    const targetBonus = computeBonusCountBn(levelBn);
    const baseBonus = computeBonusCountBn(baseLevelBn);
    const deltaBonus = targetBonus.sub?.(baseBonus) ?? BigNum.fromInt(0);
    if (!bigNumIsZero(deltaBonus)) {
      totalLog = totalLog.add?.(deltaBonus.mulDecimal(LOG_DECADE_BONUS_DECIMAL, 18)) ?? totalLog;
    }
    const logNumber = logBigNumToNumber(totalLog);
    if (!Number.isFinite(logNumber)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    return bigNumFromLog10(logNumber);
  }
  function progressRatio(progressBn, requirement) {
    if (!requirement || typeof requirement !== "object") return 0;
    if (!progressBn || typeof progressBn !== "object") return 0;
    const reqIsInf = bigNumIsInfinite(requirement);
    const progIsInf = bigNumIsInfinite(progressBn);
    if (reqIsInf) {
      return progIsInf ? 1 : 0;
    }
    const reqIsZero = bigNumIsZero(requirement);
    if (reqIsZero) return 0;
    const progIsZero = bigNumIsZero(progressBn);
    if (progIsZero) return 0;
    const logProg = approxLog10(progressBn);
    const logReq = approxLog10(requirement);
    if (!Number.isFinite(logProg) || !Number.isFinite(logReq)) {
      return logProg >= logReq ? 1 : 0;
    }
    const diff = logProg - logReq;
    const ratio = Math.pow(10, diff);
    if (!Number.isFinite(ratio)) {
      return diff >= 0 ? 1 : 0;
    }
    if (ratio <= 0) return 0;
    if (ratio >= 1) return 1;
    return ratio;
  }
  function ensureHudRefs() {
    if (hudRefs.container && hudRefs.container.isConnected) return true;
    hudRefs.container = document.querySelector(".xp-counter[data-xp-hud]");
    if (!hudRefs.container) return false;
    hudRefs.bar = hudRefs.container.querySelector(".xp-bar");
    hudRefs.fill = hudRefs.container.querySelector(".xp-bar__fill");
    hudRefs.xpLevelValue = hudRefs.container.querySelector(".xp-level-value");
    hudRefs.progress = hudRefs.container.querySelector("[data-xp-progress]");
    return true;
  }
  function xpRequirementForXpLevel(xpLevelInput) {
    let xpLvlBn;
    try {
      xpLvlBn = xpLevelInput instanceof BigNum ? xpLevelInput.clone?.() ?? xpLevelInput : BigNum.fromAny(xpLevelInput ?? 0);
    } catch {
      xpLvlBn = BigNum.fromInt(0);
    }
    const lvlIsInf = xpLvlBn.isInfinite?.() || typeof xpLvlBn.isInfinite === "function" && xpLvlBn.isInfinite();
    if (lvlIsInf) {
      return BigNum.fromAny("Infinity");
    }
    let levelPlain = "0";
    try {
      levelPlain = xpLvlBn.toPlainIntegerString?.() ?? xpLvlBn.toString?.() ?? "0";
    } catch {
      levelPlain = "0";
    }
    let targetLevelInfo = { bigInt: null, finite: true };
    if (levelPlain && levelPlain !== "Infinity") {
      try {
        targetLevelInfo = { bigInt: BigInt(levelPlain), finite: true };
      } catch {
        targetLevelInfo = { bigInt: null, finite: true };
      }
    } else {
      targetLevelInfo = { bigInt: null, finite: true };
    }
    const targetLevel = targetLevelInfo.bigInt ?? 0n;
    if (targetLevelInfo.bigInt != null && targetLevel <= 0n) {
      const baseRequirement = xpRequirementCache.get("0");
      return baseRequirement.clone?.() ?? baseRequirement;
    }
    if (targetLevelInfo.bigInt != null) {
      ensureExactRequirementCacheUpTo(targetLevel);
      const targetKey = targetLevel.toString();
      const cachedExact = xpRequirementCache.get(targetKey);
      if (cachedExact) {
        return cachedExact.clone?.() ?? cachedExact;
      }
    }
    const approximate = approximateRequirementFromLevel(xpLvlBn);
    const approxIsInf = approximate.isInfinite?.() || typeof approximate.isInfinite === "function" && approximate.isInfinite();
    if (approxIsInf) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    if (targetLevelInfo.bigInt != null) {
      xpRequirementCache.set(targetLevelInfo.bigInt.toString(), approximate);
    }
    return approximate.clone?.() ?? approximate;
  }
  function updateXpRequirement() {
    requirementBn = xpRequirementForXpLevel(xpState.xpLevel);
  }
  function resetLockedXpState() {
    xpState.xpLevel = bnZero();
    xpState.progress = bnZero();
    updateXpRequirement();
    syncCoinMultiplierWithXpLevel(true);
  }
  function xpLevelBigIntInfo(xpLevelValue) {
    if (!xpLevelValue || typeof xpLevelValue !== "object") {
      return { bigInt: 0n, finite: false };
    }
    const levelIsInfinite = xpLevelValue.isInfinite?.() || typeof xpLevelValue.isInfinite === "function" && xpLevelValue.isInfinite();
    if (levelIsInfinite) {
      return { bigInt: null, finite: false };
    }
    let plain = "0";
    try {
      plain = xpLevelValue.toPlainIntegerString?.() ?? xpLevelValue.toString?.() ?? "0";
    } catch {
      plain = "0";
    }
    if (!plain || plain === "Infinity") {
      return { bigInt: null, finite: true };
    }
    try {
      return { bigInt: BigInt(plain), finite: true };
    } catch {
      return { bigInt: null, finite: true };
    }
  }
  function syncCoinMultiplierWithXpLevel(force = false) {
    const multApi = bank?.coins?.mult;
    if (!multApi || typeof multApi.set !== "function" || typeof multApi.multiplyByDecimal !== "function") {
      return;
    }
    const levelInfo = xpLevelBigIntInfo(xpState.xpLevel);
    const levelBigInt = levelInfo.bigInt;
    const levelIsInfinite = !levelInfo.finite;
    const levelStorageKey = typeof xpState.xpLevel?.toStorage === "function" ? xpState.xpLevel.toStorage() : null;
    if (!force) {
      if (levelIsInfinite && lastSyncedCoinLevelWasInfinite) {
        return;
      }
      if (!levelIsInfinite && levelBigInt != null && !lastSyncedCoinLevelWasInfinite && !lastSyncedCoinUsedApproximation && lastSyncedCoinLevel != null && levelBigInt === lastSyncedCoinLevel) {
        return;
      }
      if (!levelIsInfinite && levelBigInt == null && lastSyncedCoinUsedApproximation && levelStorageKey && lastSyncedCoinApproxKey && levelStorageKey === lastSyncedCoinApproxKey) {
        return;
      }
    }
    if (levelIsInfinite) {
      try {
        multApi.set(infinityRequirementBn);
      } catch {
      }
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = true;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
      return;
    }
    let multiplierBn;
    if (levelBigInt != null && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
      let working = BigNum.fromInt(1);
      const iterations = Number(levelBigInt);
      for (let i = 0; i < iterations; i += 1) {
        working = working.mulDecimal("1.1", 18);
      }
      let levelAdd;
      try {
        levelAdd = BigNum.fromAny(levelBigInt.toString());
      } catch {
        levelAdd = BigNum.fromInt(iterations);
      }
      if (typeof working.add === "function") {
        working = working.add(levelAdd);
      } else if (typeof levelAdd.add === "function") {
        working = levelAdd.add(working);
      }
      multiplierBn = working.clone?.() ?? working;
    } else {
      multiplierBn = approximateCoinMultiplierFromBigNum(xpState.xpLevel);
    }
    let finalMultiplier = multiplierBn.clone?.() ?? multiplierBn;
    const providers = coinMultiplierProviders.size > 0 ? Array.from(coinMultiplierProviders) : typeof externalCoinMultiplierProvider === "function" ? [externalCoinMultiplierProvider] : [];
    for (const provider of providers) {
      if (typeof provider !== "function") continue;
      try {
        const maybe = provider({
          baseMultiplier: finalMultiplier.clone?.() ?? finalMultiplier,
          xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
          xpUnlocked: xpState.unlocked
        });
        if (maybe instanceof BigNum) {
          finalMultiplier = maybe.clone?.() ?? maybe;
        } else if (maybe != null) {
          finalMultiplier = BigNum.fromAny(maybe);
        }
      } catch {
      }
    }
    const multIsInf = finalMultiplier.isInfinite?.() || typeof finalMultiplier.isInfinite === "function" && finalMultiplier.isInfinite();
    try {
      multApi.set(finalMultiplier.clone?.() ?? finalMultiplier);
    } catch {
    }
    if (multIsInf) {
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = true;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
    } else if (levelBigInt != null && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
      lastSyncedCoinLevel = levelBigInt;
      lastSyncedCoinLevelWasInfinite = false;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
    } else {
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = false;
      lastSyncedCoinUsedApproximation = true;
      lastSyncedCoinApproxKey = levelStorageKey;
    }
  }
  function ensureStateLoaded(force = false) {
    const slot = getActiveSlot();
    if (slot == null) {
      lastSlot = null;
      stateLoaded = false;
      xpState.unlocked = false;
      resetLockedXpState();
      return xpState;
    }
    if (!force && stateLoaded && slot === lastSlot) return xpState;
    lastSlot = slot;
    stateLoaded = true;
    try {
      const unlockedRaw = localStorage.getItem(KEY_UNLOCK(slot));
      xpState.unlocked = unlockedRaw === "1";
    } catch {
      xpState.unlocked = false;
    }
    try {
      xpState.xpLevel = BigNum.fromAny(localStorage.getItem(KEY_XP_LEVEL(slot)) ?? "0");
    } catch {
      xpState.xpLevel = bnZero();
    }
    try {
      xpState.progress = BigNum.fromAny(localStorage.getItem(KEY_PROGRESS(slot)) ?? "0");
    } catch {
      xpState.progress = bnZero();
    }
    if (!xpState.unlocked) {
      resetLockedXpState();
      return xpState;
    }
    enforceXpInfinityInvariant();
    updateXpRequirement();
    syncCoinMultiplierWithXpLevel(true);
    ensureXpStorageWatchers();
    return xpState;
  }
  function persistState() {
    const slot = getActiveSlot();
    if (slot == null) return;
    const expected = {
      unlocked: xpState.unlocked ? "1" : "0",
      level: xpState.xpLevel.toStorage(),
      progress: xpState.progress.toStorage()
    };
    try {
      localStorage.setItem(KEY_UNLOCK(slot), expected.unlocked);
    } catch {
    }
    try {
      localStorage.setItem(KEY_XP_LEVEL(slot), expected.level);
    } catch {
    }
    try {
      localStorage.setItem(KEY_PROGRESS(slot), expected.progress);
    } catch {
    }
    const persisted = (() => {
      let unlocked = xpState.unlocked;
      let level = xpState.xpLevel;
      let progress = xpState.progress;
      try {
        unlocked = localStorage.getItem(KEY_UNLOCK(slot)) === "1";
      } catch {
      }
      try {
        const rawLevel = localStorage.getItem(KEY_XP_LEVEL(slot));
        if (rawLevel) level = BigNum.fromAny(rawLevel);
      } catch {
      }
      try {
        const rawProgress = localStorage.getItem(KEY_PROGRESS(slot));
        if (rawProgress) progress = BigNum.fromAny(rawProgress);
      } catch {
      }
      return { unlocked, level, progress };
    })();
    primeStorageWatcherSnapshot(KEY_UNLOCK(slot), persisted.unlocked ? "1" : "0");
    primeStorageWatcherSnapshot(KEY_XP_LEVEL(slot), persisted.level?.toStorage?.() ?? expected.level);
    primeStorageWatcherSnapshot(KEY_PROGRESS(slot), persisted.progress?.toStorage?.() ?? expected.progress);
    const mismatch = persisted.unlocked !== xpState.unlocked || (persisted.level?.toStorage?.() ?? null) !== expected.level || (persisted.progress?.toStorage?.() ?? null) !== expected.progress;
    if (mismatch) {
      xpState.unlocked = persisted.unlocked;
      xpState.xpLevel = persisted.level;
      xpState.progress = persisted.progress;
      updateXpRequirement();
      syncCoinMultiplierWithXpLevel(true);
      updateHud();
    }
  }
  function handleXpLevelUpRewards() {
    syncCoinMultiplierWithXpLevel(true);
    let reward = bnOne();
    if (typeof externalBookRewardProvider === "function") {
      try {
        const maybe = externalBookRewardProvider({
          baseReward: reward.clone?.() ?? reward,
          xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
          xpUnlocked: xpState.unlocked
        });
        if (maybe instanceof BigNum) {
          reward = maybe.clone?.() ?? maybe;
        } else if (maybe != null) {
          reward = BigNum.fromAny(maybe);
        }
      } catch {
      }
    }
    try {
      if (bank?.books?.addWithMultiplier) {
        bank.books.addWithMultiplier(reward);
      } else if (bank?.books?.add) {
        bank.books.add(reward);
      }
    } catch {
    }
    const syncedLevelInfo = xpLevelBigIntInfo(xpState.xpLevel);
    if (!syncedLevelInfo.finite) {
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = true;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
    } else if (syncedLevelInfo.bigInt != null) {
      lastSyncedCoinLevel = syncedLevelInfo.bigInt;
      lastSyncedCoinLevelWasInfinite = false;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
    } else {
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = false;
      lastSyncedCoinUsedApproximation = true;
      lastSyncedCoinApproxKey = typeof xpState.xpLevel?.toStorage === "function" ? xpState.xpLevel.toStorage() : null;
    }
  }
  function updateHud() {
    if (!ensureHudRefs()) return;
    const { container: container2, bar, fill, xpLevelValue, progress } = hudRefs;
    if (!container2) return;
    if (!xpState.unlocked) {
      container2.setAttribute("hidden", "");
      if (fill) {
        fill.style.setProperty("--xp-fill", "0%");
        fill.style.width = "0%";
      }
      if (xpLevelValue) xpLevelValue.textContent = "0";
      if (progress) {
        const reqHtml = formatNumber(requirementBn);
        progress.innerHTML = `<span class="xp-progress-current">0</span><span class="xp-progress-separator">/</span><span class="xp-progress-required">${reqHtml}</span><span class="xp-progress-suffix">XP</span>`;
      }
      if (bar) {
        bar.setAttribute("aria-valuenow", "0");
        const reqPlain = stripHtml(formatNumber(requirementBn));
        bar.setAttribute("aria-valuetext", `0 / ${reqPlain || "10"} XP`);
      }
      syncXpMpHudLayout();
      return;
    }
    container2.removeAttribute("hidden");
    const requirement = requirementBn;
    const ratio = progressRatio(xpState.progress, requirement);
    const pct = `${(ratio * 100).toFixed(2)}%`;
    if (fill) {
      fill.style.setProperty("--xp-fill", pct);
      fill.style.width = pct;
    }
    if (xpLevelValue) {
      xpLevelValue.innerHTML = formatNumber(xpState.xpLevel);
    }
    if (progress) {
      const currentHtml = formatNumber(xpState.progress);
      const reqHtml = formatNumber(requirement);
      progress.innerHTML = `<span class="xp-progress-current">${currentHtml}</span><span class="xp-progress-separator">/</span><span class="xp-progress-required">${reqHtml}</span><span class="xp-progress-suffix">XP</span>`;
    }
    if (bar) {
      bar.setAttribute("aria-valuenow", (ratio * 100).toFixed(2));
      const currPlain = stripHtml(formatNumber(xpState.progress));
      const reqPlain = stripHtml(formatNumber(requirement));
      bar.setAttribute("aria-valuetext", `${currPlain} / ${reqPlain} XP`);
    }
    syncXpMpHudLayout();
  }
  function initXpSystem({ forceReload = false } = {}) {
    ensureHudRefs();
    ensureStateLoaded(forceReload);
    updateXpRequirement();
    updateHud();
    ensureXpStorageWatchers();
    return getXpState();
  }
  function unlockXpSystem() {
    ensureStateLoaded();
    if (xpState.unlocked) {
      updateHud();
      return false;
    }
    resetLockedXpState();
    xpState.unlocked = true;
    persistState();
    updateHud();
    syncCoinMultiplierWithXpLevel(true);
    try {
      window.dispatchEvent(new CustomEvent("xp:unlock", { detail: getXpState() }));
    } catch {
    }
    return true;
  }
  function resetXpProgress({ keepUnlock = true } = {}) {
    ensureStateLoaded();
    const wasUnlocked = xpState.unlocked;
    resetLockedXpState();
    xpState.unlocked = keepUnlock ? wasUnlocked || xpState.unlocked : false;
    persistState();
    updateHud();
    syncCoinMultiplierWithXpLevel(true);
    return getXpState();
  }
  function addXp(amount, { silent = false } = {}) {
    ensureStateLoaded();
    const slot = lastSlot ?? getActiveSlot();
    if (!xpState.unlocked) {
      return {
        unlocked: false,
        xpLevelsGained: bnZero(),
        xpAdded: bnZero(),
        xpLevel: xpState.xpLevel,
        requirement: requirementBn
      };
    }
    let inc;
    try {
      if (amount instanceof BigNum) {
        inc = amount.clone?.() ?? BigNum.fromAny(amount ?? 0);
      } else {
        inc = BigNum.fromAny(amount ?? 0);
      }
    } catch {
      inc = bnZero();
    }
    if (!inc.isZero?.()) {
      const providers = xpGainMultiplierProviders.size > 0 ? Array.from(xpGainMultiplierProviders) : typeof externalXpGainMultiplierProvider === "function" ? [externalXpGainMultiplierProvider] : [];
      for (const provider of providers) {
        if (typeof provider !== "function") continue;
        try {
          const maybe = provider({
            baseGain: inc.clone?.() ?? inc,
            xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
            xpUnlocked: xpState.unlocked
          });
          if (maybe instanceof BigNum) {
            inc = maybe.clone?.() ?? maybe;
          } else if (maybe != null) {
            inc = BigNum.fromAny(maybe);
          }
        } catch {
        }
      }
    }
    inc = applyStatMultiplierOverride("xp", inc);
    if (inc.isZero?.() || typeof inc.isZero === "function" && inc.isZero()) {
      updateHud();
      return {
        unlocked: true,
        xpLevelsGained: bnZero(),
        xpAdded: inc,
        xpLevel: xpState.xpLevel,
        requirement: requirementBn
      };
    }
    xpState.progress = xpState.progress.add(inc);
    updateXpRequirement();
    const progressIsInf = xpState.progress?.isInfinite?.() || typeof xpState.progress?.isInfinite === "function" && xpState.progress.isInfinite();
    const levelIsInf = xpState.xpLevel?.isInfinite?.() || typeof xpState.xpLevel?.isInfinite === "function" && xpState.xpLevel.isInfinite();
    const gainIsInf = inc?.isInfinite?.() || typeof inc?.isInfinite === "function" && inc.isInfinite();
    if (progressIsInf || levelIsInf || gainIsInf) {
      const inf = infinityRequirementBn.clone?.() ?? infinityRequirementBn;
      xpState.xpLevel = inf.clone?.() ?? inf;
      xpState.progress = inf.clone?.() ?? inf;
      requirementBn = inf.clone?.() ?? inf;
      enforceXpInfinityInvariant();
      persistState();
      updateHud();
      syncCoinMultiplierWithXpLevel(true);
      const detail2 = {
        unlocked: true,
        xpLevelsGained: bnZero(),
        xpAdded: inc.clone?.() ?? inc,
        xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
        progress: xpState.progress.clone?.() ?? xpState.progress,
        requirement: requirementBn.clone?.() ?? requirementBn,
        slot
      };
      notifyXpSubscribers(detail2);
      if (!silent && typeof window !== "undefined") {
        try {
          window.dispatchEvent(new CustomEvent("xp:change", { detail: detail2 }));
        } catch {
        }
      }
      return detail2;
    }
    let xpLevelsGained = bnZero();
    let guard = 0;
    const limit = 1e5;
    while (xpState.progress.cmp?.(requirementBn) >= 0 && guard < limit) {
      xpState.progress = xpState.progress.sub(requirementBn);
      xpState.xpLevel = xpState.xpLevel.add(bnOne());
      xpLevelsGained = xpLevelsGained.add(bnOne());
      handleXpLevelUpRewards();
      updateXpRequirement();
      const reqIsInf = requirementBn.isInfinite?.() || typeof requirementBn.isInfinite === "function" && requirementBn.isInfinite();
      if (reqIsInf) {
        break;
      }
      guard += 1;
    }
    if (guard >= limit) {
      xpState.progress = bnZero();
    }
    persistState();
    updateHud();
    const syncedLevelAfterAdd = xpLevelBigIntInfo(xpState.xpLevel);
    if (!syncedLevelAfterAdd.finite) {
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = true;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
    } else if (syncedLevelAfterAdd.bigInt != null) {
      lastSyncedCoinLevel = syncedLevelAfterAdd.bigInt;
      lastSyncedCoinLevelWasInfinite = false;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
    } else {
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = false;
      lastSyncedCoinUsedApproximation = true;
      lastSyncedCoinApproxKey = typeof xpState.xpLevel?.toStorage === "function" ? xpState.xpLevel.toStorage() : null;
    }
    const detail = {
      unlocked: true,
      xpLevelsGained: xpLevelsGained.clone?.() ?? xpLevelsGained,
      xpAdded: inc.clone?.() ?? inc,
      xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
      progress: xpState.progress.clone?.() ?? xpState.progress,
      requirement: requirementBn.clone?.() ?? requirementBn,
      slot
    };
    notifyXpSubscribers(detail);
    if (!silent && typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("xp:change", { detail }));
      } catch {
      }
    }
    return detail;
  }
  function getXpState() {
    ensureStateLoaded();
    return {
      unlocked: xpState.unlocked,
      xpLevel: xpState.xpLevel.clone?.() ?? xpState.xpLevel,
      progress: xpState.progress.clone?.() ?? xpState.progress,
      requirement: requirementBn.clone?.() ?? requirementBn
    };
  }
  function broadcastXpChange(detailOverrides = {}) {
    ensureStateLoaded();
    const slot = lastSlot ?? getActiveSlot();
    const detail = {
      ...getXpState(),
      slot,
      ...detailOverrides
    };
    notifyXpSubscribers(detail);
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("xp:change", { detail }));
      } catch {
      }
    }
    return detail;
  }
  function isXpSystemUnlocked() {
    ensureStateLoaded();
    return !!xpState.unlocked;
  }
  function getXpRequirementForXpLevel(xpLevel) {
    return xpRequirementForXpLevel(xpLevel);
  }
  function computeCoinMultiplierForXpLevel(levelValue) {
    let xpLevelBn;
    try {
      xpLevelBn = levelValue instanceof BigNum ? levelValue : BigNum.fromAny(levelValue ?? 0);
    } catch {
      xpLevelBn = BigNum.fromInt(0);
    }
    const levelInfo = xpLevelBigIntInfo(xpLevelBn);
    const levelBigInt = levelInfo.bigInt;
    const levelIsInfinite = !levelInfo.finite;
    if (levelIsInfinite) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
    }
    let multiplierBn;
    if (levelBigInt != null && levelBigInt <= EXACT_COIN_LEVEL_LIMIT) {
      let working = BigNum.fromInt(1);
      const iterations = Number(levelBigInt);
      for (let i = 0; i < iterations; i += 1) {
        working = working.mulDecimal("1.1", 18);
      }
      let levelAdd;
      try {
        levelAdd = BigNum.fromAny(levelBigInt.toString());
      } catch {
        levelAdd = BigNum.fromInt(iterations);
      }
      if (typeof working.add === "function") {
        working = working.add(levelAdd);
      } else if (typeof levelAdd.add === "function") {
        working = levelAdd.add(working);
      }
      multiplierBn = working.clone?.() ?? working;
    } else {
      multiplierBn = approximateCoinMultiplierFromBigNum(xpLevelBn);
    }
    let finalMultiplier = multiplierBn.clone?.() ?? multiplierBn;
    const providers = coinMultiplierProviders.size > 0 ? Array.from(coinMultiplierProviders) : typeof externalCoinMultiplierProvider === "function" ? [externalCoinMultiplierProvider] : [];
    for (const provider of providers) {
      if (typeof provider !== "function") continue;
      try {
        const maybe = provider({
          baseMultiplier: finalMultiplier.clone?.() ?? finalMultiplier,
          xpLevel: xpLevelBn.clone?.() ?? xpLevelBn,
          xpUnlocked: !!xpState.unlocked
        });
        if (maybe instanceof BigNum) {
          finalMultiplier = maybe.clone?.() ?? maybe;
        } else if (maybe != null) {
          finalMultiplier = BigNum.fromAny(maybe);
        }
      } catch {
      }
    }
    return finalMultiplier.clone?.() ?? finalMultiplier;
  }
  function setExternalCoinMultiplierProvider(fn) {
    externalCoinMultiplierProvider = typeof fn === "function" ? fn : null;
    coinMultiplierProviders.clear();
    if (externalCoinMultiplierProvider) {
      coinMultiplierProviders.add(externalCoinMultiplierProvider);
    }
    ensureStateLoaded();
    syncCoinMultiplierWithXpLevel(true);
  }
  function refreshCoinMultiplierFromXpLevel() {
    ensureStateLoaded();
    syncCoinMultiplierWithXpLevel(true);
  }
  function setExternalXpGainMultiplierProvider(fn) {
    externalXpGainMultiplierProvider = typeof fn === "function" ? fn : null;
    xpGainMultiplierProviders.clear();
    if (externalXpGainMultiplierProvider) {
      xpGainMultiplierProviders.add(externalXpGainMultiplierProvider);
    }
  }
  function addExternalCoinMultiplierProvider(fn) {
    if (typeof fn !== "function") return () => {
    };
    coinMultiplierProviders.add(fn);
    ensureStateLoaded();
    syncCoinMultiplierWithXpLevel(true);
    return () => {
      coinMultiplierProviders.delete(fn);
      ensureStateLoaded();
      syncCoinMultiplierWithXpLevel(true);
    };
  }
  function addExternalXpGainMultiplierProvider(fn) {
    if (typeof fn !== "function") return () => {
    };
    xpGainMultiplierProviders.add(fn);
    ensureStateLoaded();
    return () => {
      xpGainMultiplierProviders.delete(fn);
    };
  }
  function setExternalBookRewardProvider(fn) {
    externalBookRewardProvider = typeof fn === "function" ? fn : null;
  }
  var KEY_PREFIX, KEY_UNLOCK, KEY_XP_LEVEL, KEY_PROGRESS, lastSlot, stateLoaded, requirementBn, xpRequirementCache, highestCachedExactLevel, infinityRequirementBn, lastSyncedCoinLevel, lastSyncedCoinLevelWasInfinite, lastSyncedCoinUsedApproximation, lastSyncedCoinApproxKey, externalCoinMultiplierProvider, externalXpGainMultiplierProvider, coinMultiplierProviders, xpGainMultiplierProviders, externalBookRewardProvider, EXACT_REQUIREMENT_CACHE_LEVEL, LOG_STEP, LOG_DECADE_BONUS, EXACT_COIN_LEVEL_LIMIT, LOG_STEP_DECIMAL, LOG_DECADE_BONUS_DECIMAL, TEN_DIVISOR_DECIMAL, maxLog10Bn, xpState, xpChangeSubscribers, hudRefs, xpStorageWatcherCleanups, xpStorageWatchersInitialized, xpStorageWatcherSlot, handlingExternalXpStorage;
  var init_xpSystem = __esm({
    "js/game/xpSystem.js"() {
      init_bigNum();
      init_storage();
      init_debugPanel();
      init_numFormat();
      init_hudLayout();
      KEY_PREFIX = "ccc:xp";
      KEY_UNLOCK = (slot) => `${KEY_PREFIX}:unlocked:${slot}`;
      KEY_XP_LEVEL = (slot) => `${KEY_PREFIX}:level:${slot}`;
      KEY_PROGRESS = (slot) => `${KEY_PREFIX}:progress:${slot}`;
      lastSlot = null;
      stateLoaded = false;
      requirementBn = BigNum.fromInt(10);
      xpRequirementCache = /* @__PURE__ */ new Map();
      xpRequirementCache.set("0", requirementBn);
      highestCachedExactLevel = 0n;
      infinityRequirementBn = BigNum.fromAny("Infinity");
      lastSyncedCoinLevel = null;
      lastSyncedCoinLevelWasInfinite = false;
      lastSyncedCoinUsedApproximation = false;
      lastSyncedCoinApproxKey = null;
      externalCoinMultiplierProvider = null;
      externalXpGainMultiplierProvider = null;
      coinMultiplierProviders = /* @__PURE__ */ new Set();
      xpGainMultiplierProviders = /* @__PURE__ */ new Set();
      externalBookRewardProvider = null;
      EXACT_REQUIREMENT_CACHE_LEVEL = 5000n;
      LOG_STEP = Math.log10(11 / 10);
      LOG_DECADE_BONUS = Math.log10(5 / 2);
      EXACT_COIN_LEVEL_LIMIT = 200n;
      LOG_STEP_DECIMAL = "0.04139268515822507";
      LOG_DECADE_BONUS_DECIMAL = "0.3979400086720376";
      TEN_DIVISOR_DECIMAL = "0.1";
      maxLog10Bn = BigNum.fromScientific(String(BigNum.MAX_E));
      xpState = {
        unlocked: false,
        xpLevel: BigNum.fromInt(0),
        progress: BigNum.fromInt(0)
      };
      xpChangeSubscribers = /* @__PURE__ */ new Set();
      hudRefs = {
        container: null,
        bar: null,
        fill: null,
        xpLevelValue: null,
        progress: null
      };
      xpStorageWatcherCleanups = [];
      xpStorageWatchersInitialized = false;
      xpStorageWatcherSlot = null;
      handlingExternalXpStorage = false;
      if (typeof window !== "undefined") {
        window.xpSystem = window.xpSystem || {};
        Object.assign(window.xpSystem, {
          initXpSystem,
          unlockXpSystem,
          addXp,
          getXpState,
          isXpSystemUnlocked,
          getXpRequirementForXpLevel,
          setExternalCoinMultiplierProvider,
          addExternalCoinMultiplierProvider,
          refreshCoinMultiplierFromXpLevel,
          setExternalXpGainMultiplierProvider,
          addExternalXpGainMultiplierProvider,
          setExternalBookRewardProvider,
          resetXpProgress
        });
      }
    }
  });

  // js/ui/merchantDelve/resetTab.js
  var resetTab_exports = {};
  __export(resetTab_exports, {
    canPerformForgeReset: () => canPerformForgeReset,
    computeForgeGoldFromInputs: () => computeForgeGoldFromInputs,
    computePendingForgeGold: () => computePendingForgeGold,
    getForgeDebugOverrideState: () => getForgeDebugOverrideState,
    hasDoneForgeReset: () => hasDoneForgeReset,
    initResetPanel: () => initResetPanel,
    initResetSystem: () => initResetSystem,
    isForgeUnlocked: () => isForgeUnlocked,
    onForgeUpgradeUnlocked: () => onForgeUpgradeUnlocked,
    performForgeReset: () => performForgeReset,
    setForgeDebugOverride: () => setForgeDebugOverride,
    setForgeResetCompleted: () => setForgeResetCompleted,
    updateResetPanel: () => updateResetPanel
  });
  function playForgeResetSound() {
    try {
      if (!forgeResetAudio) {
        forgeResetAudio = new Audio(FORGE_RESET_SOUND_SRC);
      } else {
        forgeResetAudio.currentTime = 0;
      }
      forgeResetAudio.play().catch(() => {
      });
    } catch {
    }
  }
  function resetPendingGoldSignature() {
    pendingGoldInputSignature = null;
  }
  function getPendingGoldWithMultiplier() {
    try {
      return bank.gold?.mult?.applyTo?.(resetState.pendingGold) ?? resetState.pendingGold;
    } catch {
      return resetState.pendingGold;
    }
  }
  function cleanupWatchers() {
    while (watchers.length) {
      const stop = watchers.pop();
      try {
        stop?.();
      } catch {
      }
    }
  }
  function ensureValueListeners() {
    if (!coinChangeUnsub && typeof onCurrencyChange === "function") {
      coinChangeUnsub = onCurrencyChange((detail = {}) => {
        if (detail?.key && detail.key !== CURRENCIES.COINS) return;
        if (detail?.slot != null && resetState.slot != null && detail.slot !== resetState.slot) return;
        recomputePendingGold();
      });
    }
    if (!xpChangeUnsub && typeof onXpChange === "function") {
      xpChangeUnsub = onXpChange((detail = {}) => {
        if (detail?.slot != null && resetState.slot != null && detail.slot !== resetState.slot) return;
        recomputePendingGold();
        updateResetPanel();
      });
    }
  }
  function levelToNumber(levelBn) {
    if (!levelBn || typeof levelBn !== "object") return 0;
    if (levelBn.isInfinite?.()) return Number.POSITIVE_INFINITY;
    try {
      const plain = levelBn.toPlainIntegerString?.();
      if (plain && plain !== "Infinity" && plain.length <= 15) {
        const num = Number(plain);
        if (Number.isFinite(num)) return num;
      }
    } catch {
    }
    const approx = approxLog10BigNum(levelBn);
    if (!Number.isFinite(approx)) return Number.POSITIVE_INFINITY;
    if (approx > 308) return Number.POSITIVE_INFINITY;
    return Math.pow(10, approx);
  }
  function getXpLevelBn() {
    try {
      const state = getXpState();
      if (state && state.xpLevel) return state.xpLevel;
    } catch {
    }
    return bnZero2();
  }
  function computeForgeGold(coinsBn, levelBn) {
    if (!coinsBn || typeof coinsBn !== "object") return bnZero2();
    if (coinsBn.isZero?.()) return bnZero2();
    const logCoins = approxLog10BigNum(coinsBn);
    if (!Number.isFinite(logCoins)) {
      return logCoins > 0 ? BN.fromAny("Infinity") : bnZero2();
    }
    const logScaled = logCoins - 5;
    if (!Number.isFinite(logScaled)) return bnZero2();
    const pow2 = bigNumFromLog102(logScaled * Math.log10(2));
    const levelNum = Math.max(0, levelToNumber(levelBn));
    const levelFactor = Math.max(0, (levelNum - 30) / 5);
    const pow14 = levelFactor <= 0 ? bnOne2() : bigNumFromLog102(levelFactor * Math.log10(1.4));
    const floorLog = Math.floor(logScaled);
    const pow115 = floorLog <= 0 ? bnOne2() : bigNumFromLog102(floorLog * Math.log10(1.15));
    let total = BN.fromInt(10);
    total = total.mulBigNumInteger(pow2);
    total = total.mulBigNumInteger(pow14);
    total = total.mulBigNumInteger(pow115);
    const floored = total.floorToInteger();
    return floored.isZero?.() ? bnZero2() : floored;
  }
  function computeForgeGoldFromInputs(coinsBn, levelBn) {
    return computeForgeGold(coinsBn, levelBn);
  }
  function ensureResetSlot() {
    if (resetState.slot != null) return resetState.slot;
    const slot = getActiveSlot();
    resetState.slot = slot;
    return slot;
  }
  function setForgeResetCompleted(value) {
    const slot = ensureResetSlot();
    if (slot == null) return;
    resetState.hasDoneForgeReset = !!value;
    try {
      localStorage.setItem(FORGE_COMPLETED_KEY(slot), resetState.hasDoneForgeReset ? "1" : "0");
    } catch {
    }
    primeStorageWatcherSnapshot(FORGE_COMPLETED_KEY(slot));
  }
  function getForgeDebugOverride(slot = getActiveSlot()) {
    if (slot == null) return null;
    try {
      const raw = localStorage.getItem(FORGE_DEBUG_OVERRIDE_KEY(slot));
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {
    }
    return null;
  }
  function getForgeDebugOverrideState(slot = getActiveSlot()) {
    return getForgeDebugOverride(slot);
  }
  function setForgeDebugOverride(value, slot = getActiveSlot()) {
    if (slot == null) return;
    if (value == null) {
      try {
        localStorage.removeItem(FORGE_DEBUG_OVERRIDE_KEY(slot));
      } catch {
      }
      primeStorageWatcherSnapshot(FORGE_DEBUG_OVERRIDE_KEY(slot));
      return;
    }
    const normalized = !!value;
    try {
      localStorage.setItem(FORGE_DEBUG_OVERRIDE_KEY(slot), normalized ? "1" : "0");
    } catch {
    }
    primeStorageWatcherSnapshot(FORGE_DEBUG_OVERRIDE_KEY(slot));
  }
  function setForgeUnlocked(value) {
    const slot = ensureResetSlot();
    if (slot == null) return;
    resetState.forgeUnlocked = !!value;
    try {
      localStorage.setItem(FORGE_UNLOCK_KEY(slot), resetState.forgeUnlocked ? "1" : "0");
    } catch {
    }
    primeStorageWatcherSnapshot(FORGE_UNLOCK_KEY(slot));
  }
  function readPersistentFlags(slot) {
    if (slot == null) {
      resetState.forgeUnlocked = false;
      resetState.hasDoneForgeReset = false;
      resetState.flagsPrimed = false;
      return;
    }
    try {
      resetState.forgeUnlocked = localStorage.getItem(FORGE_UNLOCK_KEY(slot)) === "1";
    } catch {
      resetState.forgeUnlocked = false;
    }
    try {
      resetState.hasDoneForgeReset = localStorage.getItem(FORGE_COMPLETED_KEY(slot)) === "1";
    } catch {
      resetState.hasDoneForgeReset = false;
    }
    resetState.flagsPrimed = true;
  }
  function ensurePersistentFlagsPrimed() {
    const slot = getActiveSlot();
    if (slot == null) {
      resetState.flagsPrimed = false;
      return;
    }
    if (resetState.slot !== slot) {
      resetState.slot = slot;
      resetPendingGoldSignature();
      resetState.flagsPrimed = false;
    }
    if (!resetState.flagsPrimed) {
      readPersistentFlags(slot);
    }
  }
  function bindStorageWatchers(slot) {
    if (watchersBoundSlot === slot) return;
    cleanupWatchers();
    watchersBoundSlot = slot;
    if (slot == null) return;
    watchers.push(watchStorageKey(FORGE_UNLOCK_KEY(slot), {
      onChange(value) {
        const next = value === "1";
        if (resetState.forgeUnlocked !== next) {
          resetState.forgeUnlocked = next;
          updateResetPanel();
        }
      }
    }));
    watchers.push(watchStorageKey(FORGE_COMPLETED_KEY(slot), {
      onChange(value) {
        const next = value === "1";
        if (resetState.hasDoneForgeReset !== next) {
          resetState.hasDoneForgeReset = next;
          updateResetPanel();
        }
      }
    }));
  }
  function getPendingInputSignature(coins, level) {
    const coinSig = coins?.toStorage?.() ?? coins?.toString?.() ?? String(coins ?? "");
    const levelSig = level?.toStorage?.() ?? level?.toString?.() ?? String(level ?? "");
    return `${coinSig}|${levelSig}`;
  }
  function recomputePendingGold(force = false) {
    const coins = bank.coins?.value ?? bnZero2();
    const level = getXpLevelBn();
    const signature = getPendingInputSignature(coins, level);
    if (!force && pendingGoldInputSignature === signature) {
      return;
    }
    pendingGoldInputSignature = signature;
    if (!meetsLevelRequirement()) {
      resetState.pendingGold = bnZero2();
    } else {
      resetState.pendingGold = computeForgeGold(coins, level);
    }
    updateResetPanel();
  }
  function canAccessForgeTab() {
    const override = getForgeDebugOverride();
    if (override != null) return !!override;
    return resetState.forgeUnlocked || getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.UNLOCK_FORGE) >= 1;
  }
  function meetsLevelRequirement() {
    try {
      const levelBn = getXpLevelBn();
      if (levelBn && typeof levelBn.cmp === "function") {
        return levelBn.cmp(MIN_FORGE_LEVEL) >= 0;
      }
    } catch {
    }
    return false;
  }
  function isForgeUnlocked() {
    ensurePersistentFlagsPrimed();
    const override = getForgeDebugOverride();
    if (override != null) return !!override;
    return !!resetState.forgeUnlocked || canAccessForgeTab();
  }
  function hasDoneForgeReset() {
    ensurePersistentFlagsPrimed();
    return !!resetState.hasDoneForgeReset;
  }
  function computePendingForgeGold() {
    recomputePendingGold();
    return resetState.pendingGold.clone?.() ?? resetState.pendingGold;
  }
  function canPerformForgeReset() {
    if (!isForgeUnlocked()) return false;
    if (!meetsLevelRequirement()) return false;
    if (resetState.pendingGold.isZero?.()) return false;
    const coins = bank.coins?.value;
    if (!coins || coins.isZero?.()) return false;
    return true;
  }
  function resetUpgrades() {
    const upgrades2 = getUpgradesForArea(AREA_KEYS.STARTER_COVE);
    for (const upg of upgrades2) {
      if (!upg) continue;
      const tieKey = upg.tieKey || upg.tie;
      if (tieKey === UPGRADE_TIES.UNLOCK_XP || tieKey === UPGRADE_TIES.UNLOCK_FORGE) continue;
      if (upg.costType === "gold") continue;
      setLevel(AREA_KEYS.STARTER_COVE, upg.id, 0, true, { resetHmEvolutions: true });
    }
  }
  function performForgeReset() {
    if (!canPerformForgeReset()) return false;
    const reward = resetState.pendingGold.clone?.() ?? resetState.pendingGold;
    try {
      const withMultiplier = bank.gold?.mult?.applyTo?.(reward) ?? reward;
      if (bank.gold?.add) {
        bank.gold.add(withMultiplier);
      }
    } catch {
    }
    try {
      bank.coins.set(0);
    } catch {
    }
    try {
      bank.books.set(0);
    } catch {
    }
    try {
      resetXpProgress({ keepUnlock: true });
    } catch {
    }
    resetUpgrades();
    recomputePendingGold();
    setForgeUnlocked(true);
    if (!resetState.hasDoneForgeReset) {
      setForgeResetCompleted(true);
    }
    initMutationSystem();
    unlockMutationSystem();
    updateResetPanel();
    return true;
  }
  function formatBn(value) {
    try {
      return formatNumber(value);
    } catch {
      return value?.toString?.() ?? "0";
    }
  }
  function setLayerActive(layer) {
    for (const key in resetState.layerButtons) {
      resetState.layerButtons[key].classList.toggle("is-active", key === layer);
    }
  }
  function buildPanel(panelEl) {
    panelEl.innerHTML = `
    <div class="merchant-reset">
      <aside class="merchant-reset__sidebar">
        <button type="button" class="merchant-reset__layer is-active" data-reset-layer="forge">
          <img src="${RESET_ICON_SRC}" alt="">
          <span>Forge</span>
        </button>
      </aside>
      <div class="merchant-reset__main">
        <div class="merchant-reset__layout">
          <header class="merchant-reset__header">
            <div class="merchant-reset__titles">
              <h3>Forge</h3>
            </div>
          </header>

          <div class="merchant-reset__content">
            <div class="merchant-reset__titles">
              <p>
                Resets Coins, Books, XP, Coin upgrades, and Book upgrades for Gold<br>
                Increase pending Gold amount by increasing Coins and XP Level<br>
                The button below shows how much Gold you will get upon reset
              </p>
            </div>
            <div class="merchant-reset__status" data-reset-status></div>
          </div>

          <div class="merchant-reset__actions">
            <button type="button" class="merchant-reset__action" data-reset-action>
              <span class="merchant-reset__action-plus">+</span>
              <span class="merchant-reset__action-icon">
                <img src="${GOLD_ICON_SRC}" alt="">
              </span>
              <span class="merchant-reset__action-amount" data-reset-pending>0</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
    resetState.panel = panelEl;
    resetState.pendingEl = panelEl.querySelector("[data-reset-pending]");
    resetState.statusEl = panelEl.querySelector("[data-reset-status]");
    resetState.actionBtn = panelEl.querySelector("[data-reset-action]");
    resetState.mainEl = panelEl.querySelector(".merchant-reset__main");
    resetState.layerButtons = {
      forge: panelEl.querySelector('[data-reset-layer="forge"]')
    };
    Object.entries(resetState.layerButtons).forEach(([key, btn]) => {
      if (!btn) return;
      btn.addEventListener("click", () => {
        setLayerActive(key);
        updateResetPanel();
      });
    });
    if (resetState.actionBtn) {
      resetState.actionBtn.addEventListener("click", () => {
        if (performForgeReset()) {
          playForgeResetSound();
          updateResetPanel();
        }
      });
    }
    updateResetPanel();
  }
  function initResetPanel(panelEl) {
    if (!panelEl || panelEl.__resetInit) return;
    panelEl.__resetInit = true;
    buildPanel(panelEl);
  }
  function updatePendingDisplay() {
    if (!resetState.actionBtn) return;
    const amountEl = resetState.actionBtn.querySelector("[data-reset-pending]");
    if (amountEl) {
      amountEl.innerHTML = formatBn(getPendingGoldWithMultiplier());
    }
  }
  function updateStatusDisplay() {
    if (!resetState.statusEl) return;
    const el = resetState.statusEl;
    el.innerHTML = "";
    ensurePersistentFlagsPrimed();
    resetState.mainEl?.classList.toggle("is-forge-complete", !!resetState.hasDoneForgeReset);
    if (resetState.hasDoneForgeReset) {
      return;
    }
    el.innerHTML = `
  <span style="color:#02e815; text-shadow: 0 3px 6px rgba(0,0,0,0.55);">
    Forging for the first time will unlock
    <span style="color:#ffb347; text-shadow: 0 3px 6px rgba(0,0,0,0.55);
    ">Mutations</span> and a new Merchant dialogue<br>
    Mutated Coins will yield more Coin and XP value than normal
  </span>
`;
  }
  function updateActionState() {
    if (!resetState.actionBtn) return;
    const btn = resetState.actionBtn;
    if (!isForgeUnlocked()) {
      btn.disabled = true;
      btn.innerHTML = '<span class="merchant-reset__req-msg">Unlock the Forge upgrade to access resets</span>';
      return;
    }
    if (!meetsLevelRequirement()) {
      btn.disabled = true;
      btn.innerHTML = '<span class="merchant-reset__req-msg">Reach XP Level 31 to perform a Forge reset</span>';
      return;
    }
    if (resetState.pendingGold.isZero?.()) {
      btn.disabled = true;
      btn.innerHTML = '<span class="merchant-reset__req-msg">Collect more coins to earn Gold from a Forge reset</span>';
      return;
    }
    btn.disabled = false;
    btn.innerHTML = `
    <span class="merchant-reset__action-plus">+</span>
    <span class="merchant-reset__action-icon"><img src="${GOLD_ICON_SRC}" alt=""></span>
    <span class="merchant-reset__action-amount" data-reset-pending>${formatBn(getPendingGoldWithMultiplier())}</span>
  `;
  }
  function updateResetPanel() {
    if (!resetState.panel) return;
    updatePendingDisplay();
    updateStatusDisplay();
    updateActionState();
  }
  function onForgeUpgradeUnlocked() {
    initResetSystem();
    setForgeUnlocked(true);
    updateResetPanel();
  }
  function bindGlobalEvents() {
    if (typeof window === "undefined") return;
    window.addEventListener("currency:change", (e) => {
      if (e.detail?.key === "coins") {
        recomputePendingGold();
      }
    });
    window.addEventListener("currency:multiplier", (e) => {
      const detail = e?.detail;
      if (!detail || detail.key !== CURRENCIES.GOLD) return;
      if (detail.slot != null && resetState.slot != null && detail.slot !== resetState.slot) return;
      updateResetPanel();
    });
    window.addEventListener("xp:change", () => {
      recomputePendingGold();
      updateResetPanel();
    });
    window.addEventListener("debug:change", (e) => {
      if (e?.detail?.slot != null && resetState.slot != null && e.detail.slot !== resetState.slot) return;
      resetPendingGoldSignature();
      recomputePendingGold(true);
      updateResetPanel();
    });
  }
  function initResetSystem() {
    if (initialized2) {
      resetState.slot = getActiveSlot();
      resetPendingGoldSignature();
      ensureValueListeners();
      recomputePendingGold(true);
      return;
    }
    initialized2 = true;
    initMutationSystem();
    const slot = getActiveSlot();
    resetState.slot = slot;
    resetPendingGoldSignature();
    readPersistentFlags(slot);
    if (resetState.hasDoneForgeReset && !isMutationUnlocked()) {
      try {
        unlockMutationSystem();
      } catch {
      }
    }
    if (!resetState.forgeUnlocked && canAccessForgeTab()) {
      setForgeUnlocked(true);
    }
    bindStorageWatchers(slot);
    ensureValueListeners();
    bindGlobalEvents();
    recomputePendingGold(true);
    if (mutationUnsub) {
      try {
        mutationUnsub();
      } catch {
      }
      mutationUnsub = null;
    }
    mutationUnsub = onMutationChange(() => {
      const sprite = getMutationCoinSprite();
      if (typeof window !== "undefined" && window.spawner && typeof window.spawner.setCoinSprite === "function") {
        try {
          window.spawner.setCoinSprite(sprite);
        } catch {
        }
      }
    });
    if (typeof window !== "undefined") {
      window.addEventListener("saveSlot:change", () => {
        const nextSlot = getActiveSlot();
        resetState.slot = nextSlot;
        resetPendingGoldSignature();
        readPersistentFlags(nextSlot);
        if (resetState.hasDoneForgeReset && !isMutationUnlocked()) {
          try {
            unlockMutationSystem();
          } catch {
          }
        }
        if (!resetState.forgeUnlocked && canAccessForgeTab()) {
          setForgeUnlocked(true);
        }
        bindStorageWatchers(nextSlot);
        ensureValueListeners();
        recomputePendingGold(true);
        updateResetPanel();
      });
    }
  }
  var BN, bnZero2, bnOne2, GOLD_ICON_SRC, RESET_ICON_SRC, FORGE_RESET_SOUND_SRC, forgeResetAudio, FORGE_UNLOCK_KEY, FORGE_COMPLETED_KEY, FORGE_DEBUG_OVERRIDE_KEY, MIN_FORGE_LEVEL, resetState, watchers, watchersBoundSlot, initialized2, mutationUnsub, pendingGoldInputSignature, coinChangeUnsub, xpChangeUnsub;
  var init_resetTab = __esm({
    "js/ui/merchantDelve/resetTab.js"() {
      init_bigNum();
      init_storage();
      init_numFormat();
      init_xpSystem();
      init_upgrades();
      init_mutationSystem();
      BN = BigNum;
      bnZero2 = () => BN.fromInt(0);
      bnOne2 = () => BN.fromInt(1);
      GOLD_ICON_SRC = "img/currencies/gold/gold.png";
      RESET_ICON_SRC = "img/misc/forge.png";
      FORGE_RESET_SOUND_SRC = "sounds/forge_reset.mp3";
      forgeResetAudio = null;
      FORGE_UNLOCK_KEY = (slot) => `ccc:reset:forge:${slot}`;
      FORGE_COMPLETED_KEY = (slot) => `ccc:reset:forge:completed:${slot}`;
      FORGE_DEBUG_OVERRIDE_KEY = (slot) => `ccc:debug:forgeUnlocked:${slot}`;
      MIN_FORGE_LEVEL = BN.fromInt(31);
      resetState = {
        slot: null,
        forgeUnlocked: false,
        hasDoneForgeReset: false,
        pendingGold: bnZero2(),
        panel: null,
        pendingEl: null,
        requirementEl: null,
        actionBtn: null,
        statusEl: null,
        layerButtons: {},
        flagsPrimed: false
      };
      watchers = [];
      watchersBoundSlot = null;
      initialized2 = false;
      mutationUnsub = null;
      pendingGoldInputSignature = null;
      coinChangeUnsub = null;
      xpChangeUnsub = null;
      if (typeof window !== "undefined") {
        window.resetSystem = window.resetSystem || {};
        Object.assign(window.resetSystem, {
          initResetSystem,
          performForgeReset,
          computePendingForgeGold
        });
      }
    }
  });

  // js/game/upgrades.js
  var upgrades_exports = {};
  __export(upgrades_exports, {
    AREA_KEYS: () => AREA_KEYS,
    HM_EVOLUTION_INTERVAL: () => HM_EVOLUTION_INTERVAL,
    MAX_LEVEL_DELTA: () => MAX_LEVEL_DELTA,
    UPGRADE_TIES: () => UPGRADE_TIES,
    approxLog10BigNum: () => approxLog10BigNum,
    bigNumFromLog10: () => bigNumFromLog102,
    buyMax: () => buyMax,
    buyOne: () => buyOne,
    buyTowards: () => buyTowards,
    clearPermanentUpgradeUnlock: () => clearPermanentUpgradeUnlock,
    computeDefaultUpgradeCost: () => computeDefaultUpgradeCost,
    computeUpgradeEffects: () => computeUpgradeEffects,
    costToBuyOne: () => costToBuyOne,
    estimateFlatBulk: () => estimateFlatBulk,
    estimateGeometricBulk: () => estimateGeometricBulk,
    evaluateBulkPurchase: () => evaluateBulkPurchase,
    evolveUpgrade: () => evolveUpgrade,
    formatMultForUi: () => formatMultForUi,
    getCurrentAreaKey: () => getCurrentAreaKey,
    getHmEvolutions: () => getHmEvolutions,
    getHmNextMilestoneLevel: () => getHmNextMilestoneLevel,
    getIconUrl: () => getIconUrl,
    getLevel: () => getLevel,
    getLevelNumber: () => getLevelNumber,
    getMagnetLevel: () => getMagnetLevel,
    getMpValueMultiplierBn: () => getMpValueMultiplierBn,
    getUpgrade: () => getUpgrade,
    getUpgradeLockState: () => getUpgradeLockState,
    getUpgradesForArea: () => getUpgradesForArea,
    markUpgradePermanentlyUnlocked: () => markUpgradePermanentlyUnlocked,
    normalizeBigNum: () => normalizeBigNum,
    onUpgradesChanged: () => onUpgradesChanged,
    peekNextPrice: () => peekNextPrice,
    setLevel: () => setLevel,
    upgradeUiModel: () => upgradeUiModel
  });
  function hasScaling(upg) {
    try {
      const scaling = ensureUpgradeScaling(upg);
      if (!scaling) return false;
      if (scaling.ratioMinus1 > 0) return true;
      const c0 = BigNum.fromAny(upg.costAtLevel?.(0) ?? 0);
      const c1 = BigNum.fromAny(upg.costAtLevel?.(1) ?? 0);
      const cF = BigNum.fromAny(upg.costAtLevel?.(32) ?? 0);
      return !(c0.cmp(c1) === 0 && c0.cmp(cF) === 0);
    } catch {
      return false;
    }
  }
  function isInfinityLevelForScaled(upg, lvlBn) {
    if (!hasScaling(upg)) return false;
    try {
      const bn = lvlBn?.clone ? lvlBn : BigNum.fromAny(lvlBn ?? 0);
      if (bn.isInfinite?.()) return true;
      const log10 = approxLog10BigNum(bn);
      return Number.isFinite(log10) && log10 >= SCALED_INFINITY_LVL_LOG10;
    } catch {
      return false;
    }
  }
  function approxLog10BigNum(value) {
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
    let storage;
    try {
      storage = value.toStorage();
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
    const parts = storage.split(":");
    const sigStr = parts[2] ?? "0";
    let expPart = parts[3] ?? "0";
    let offsetStr = "0";
    const caret = expPart.indexOf("^");
    if (caret >= 0) {
      offsetStr = expPart.slice(caret + 1) || "0";
      expPart = expPart.slice(0, caret) || "0";
    }
    const baseExp = Number(expPart || "0");
    const offset = Number(offsetStr || "0");
    const sigNum = Number(sigStr || "0");
    if (!Number.isFinite(sigNum) || sigNum <= 0) return Number.NEGATIVE_INFINITY;
    const expSum = (Number.isFinite(baseExp) ? baseExp : 0) + (Number.isFinite(offset) ? offset : 0);
    return Math.log10(sigNum) + expSum;
  }
  function bigNumFromLog102(log10Value) {
    if (!Number.isFinite(log10Value)) {
      return log10Value > 0 ? BigNum.fromAny("Infinity") : BigNum.fromInt(0);
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
  function shopStatusRank(status) {
    return SHOP_REVEAL_STATUS_ORDER[status] ?? 0;
  }
  function classifyUpgradeStatus(lockState) {
    if (!lockState || lockState.locked === false) return "unlocked";
    if (lockState.hidden) return "mysterious";
    return "locked";
  }
  function upgradeRevealKey(areaKey, upg) {
    const normArea = normalizeAreaKey(areaKey || upg?.area);
    if (!normArea) return null;
    const tieKey = normalizeUpgradeTie(upg?.tie ?? upg?.tieKey);
    if (tieKey) {
      return `${normArea}:${tieKey}`;
    }
    const rawId = normalizeUpgradeId(upg?.id);
    let idStr = "";
    if (typeof rawId === "number") {
      if (!Number.isFinite(rawId)) return null;
      idStr = String(Math.trunc(rawId));
    } else if (typeof rawId === "string") {
      const trimmed = rawId.trim();
      if (!trimmed) return null;
      idStr = trimmed;
    } else {
      return null;
    }
    return `${normArea}:${idStr}`;
  }
  function upgradeLegacyRevealKey(areaKey, upg) {
    const normArea = normalizeAreaKey(areaKey || upg?.area);
    if (!normArea) return null;
    const rawId = normalizeUpgradeId(upg?.id);
    if (rawId == null) return null;
    if (typeof rawId === "number") {
      if (!Number.isFinite(rawId)) return null;
      return `${normArea}:${Math.trunc(rawId)}`;
    }
    const trimmed = String(rawId).trim();
    return trimmed ? `${normArea}:${trimmed}` : null;
  }
  function migrateUpgradeStateKey(state, fromKey, toKey) {
    if (!state || !state.upgrades || typeof state.upgrades !== "object") return false;
    if (!fromKey || !toKey || fromKey === toKey) return false;
    if (state.upgrades[toKey]) return false;
    if (!state.upgrades[fromKey]) return false;
    state.upgrades[toKey] = state.upgrades[fromKey];
    delete state.upgrades[fromKey];
    return true;
  }
  function ensureShopRevealState(slot = getActiveSlot()) {
    const slotKey2 = String(slot ?? "default");
    if (shopRevealStateCache.has(slotKey2)) {
      return shopRevealStateCache.get(slotKey2);
    }
    let parsed = { upgrades: {} };
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(`${SHOP_REVEAL_STATE_KEY_BASE}:${slotKey2}`);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === "object") {
            const upgrades2 = obj.upgrades && typeof obj.upgrades === "object" ? obj.upgrades : {};
            parsed = { upgrades: upgrades2 };
          }
        }
      } catch {
      }
    }
    if (!parsed || typeof parsed !== "object") parsed = { upgrades: {} };
    if (!parsed.upgrades || typeof parsed.upgrades !== "object") parsed.upgrades = {};
    shopRevealStateCache.set(slotKey2, parsed);
    return parsed;
  }
  function saveShopRevealState(state, slot = getActiveSlot()) {
    const slotKey2 = String(slot ?? "default");
    if (!state || typeof state !== "object") {
      state = { upgrades: {} };
    }
    if (!state.upgrades || typeof state.upgrades !== "object") {
      state.upgrades = {};
    }
    shopRevealStateCache.set(slotKey2, state);
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(`${SHOP_REVEAL_STATE_KEY_BASE}:${slotKey2}`, JSON.stringify(state));
    } catch {
    }
  }
  function ensureShopPermaUnlockState(slot = getActiveSlot()) {
    const slotKey2 = String(slot ?? "default");
    if (shopPermaUnlockStateCache.has(slotKey2)) {
      return shopPermaUnlockStateCache.get(slotKey2);
    }
    let parsed = { upgrades: {} };
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(`${SHOP_PERMA_UNLOCK_KEY_BASE}:${slotKey2}`);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === "object") {
            const upgrades2 = obj.upgrades && typeof obj.upgrades === "object" ? obj.upgrades : {};
            parsed = { upgrades: upgrades2 };
          }
        }
      } catch {
      }
    }
    if (!parsed || typeof parsed !== "object") parsed = { upgrades: {} };
    if (!parsed.upgrades || typeof parsed.upgrades !== "object") parsed.upgrades = {};
    shopPermaUnlockStateCache.set(slotKey2, parsed);
    return parsed;
  }
  function saveShopPermaUnlockState(state, slot = getActiveSlot()) {
    const slotKey2 = String(slot ?? "default");
    if (!state || typeof state !== "object") {
      state = { upgrades: {} };
    }
    if (!state.upgrades || typeof state.upgrades !== "object") {
      state.upgrades = {};
    }
    shopPermaUnlockStateCache.set(slotKey2, state);
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(`${SHOP_PERMA_UNLOCK_KEY_BASE}:${slotKey2}`, JSON.stringify(state));
    } catch {
    }
  }
  function ensureShopPermaMystState(slot = getActiveSlot()) {
    const slotKey2 = String(slot ?? "default");
    if (shopPermaMystStateCache.has(slotKey2)) {
      return shopPermaMystStateCache.get(slotKey2);
    }
    let parsed = { upgrades: {} };
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(`${SHOP_PERMA_MYST_KEY_BASE}:${slotKey2}`);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === "object") {
            const upgrades2 = obj.upgrades && typeof obj.upgrades === "object" ? obj.upgrades : {};
            parsed = { upgrades: upgrades2 };
          }
        }
      } catch {
      }
    }
    if (!parsed || typeof parsed !== "object") parsed = { upgrades: {} };
    if (!parsed.upgrades || typeof parsed.upgrades !== "object") parsed.upgrades = {};
    shopPermaMystStateCache.set(slotKey2, parsed);
    return parsed;
  }
  function saveShopPermaMystState(state, slot = getActiveSlot()) {
    const slotKey2 = String(slot ?? "default");
    if (!state || typeof state !== "object") state = { upgrades: {} };
    if (!state.upgrades || typeof state.upgrades !== "object") state.upgrades = {};
    shopPermaMystStateCache.set(slotKey2, state);
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(`${SHOP_PERMA_MYST_KEY_BASE}:${slotKey2}`, JSON.stringify(state));
    } catch {
    }
  }
  function markUpgradePermanentlyMysterious(areaKey, upg, slot = getActiveSlot()) {
    const key = upgradeRevealKey(areaKey, upg);
    if (!key) return;
    const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
    const state = ensureShopPermaMystState(slot);
    if (state.upgrades[key]) return;
    state.upgrades[key] = true;
    if (legacyKey && state.upgrades[legacyKey]) {
      delete state.upgrades[legacyKey];
    }
    saveShopPermaMystState(state, slot);
  }
  function isUpgradePermanentlyMysterious(areaKey, upg, slot = getActiveSlot()) {
    const key = upgradeRevealKey(areaKey, upg);
    if (!key) return false;
    const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
    const state = ensureShopPermaMystState(slot);
    if (state.upgrades[key]) return true;
    if (legacyKey && state.upgrades[legacyKey]) {
      state.upgrades[key] = state.upgrades[legacyKey];
      delete state.upgrades[legacyKey];
      saveShopPermaMystState(state, slot);
      return true;
    }
    return false;
  }
  function markUpgradePermanentlyUnlocked(areaKey, upg, slot = getActiveSlot()) {
    const key = upgradeRevealKey(areaKey, upg);
    if (!key) return;
    const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
    const state = ensureShopPermaUnlockState(slot);
    if (state.upgrades[key]) return;
    state.upgrades[key] = true;
    if (legacyKey && state.upgrades[legacyKey]) {
      delete state.upgrades[legacyKey];
    }
    saveShopPermaUnlockState(state, slot);
  }
  function clearPermanentUpgradeUnlock(areaKey, upg, slot = getActiveSlot()) {
    const key = upgradeRevealKey(areaKey, upg);
    if (!key) return;
    const permaState = ensureShopPermaUnlockState(slot);
    if (permaState.upgrades[key]) {
      delete permaState.upgrades[key];
      saveShopPermaUnlockState(permaState, slot);
    }
    const revealState = ensureShopRevealState(slot);
    if (!revealState.upgrades[key] || revealState.upgrades[key].status !== "locked") {
      revealState.upgrades[key] = { status: "locked" };
      saveShopRevealState(revealState, slot);
    }
    const upgId = typeof upg?.id !== "undefined" ? upg.id : upg;
    if (upgId != null) {
      invalidateUpgradeState(areaKey, upgId, slot);
    }
    notifyChanged();
  }
  function isUpgradePermanentlyUnlocked(areaKey, upg, slot = getActiveSlot()) {
    const key = upgradeRevealKey(areaKey, upg);
    if (!key) return false;
    const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
    const state = ensureShopPermaUnlockState(slot);
    if (state.upgrades[key]) return true;
    if (legacyKey && state.upgrades[legacyKey]) {
      state.upgrades[key] = state.upgrades[legacyKey];
      delete state.upgrades[legacyKey];
      saveShopPermaUnlockState(state, slot);
      return true;
    }
    return false;
  }
  function determineLockState(ctx) {
    const upgRef = ctx && ctx.upg ? ctx.upg : this && typeof this === "object" ? this : null;
    const tieKey = normalizeUpgradeTie(upgRef?.tie ?? upgRef?.tieKey);
    const area = ctx?.areaKey || AREA_KEYS.STARTER_COVE;
    if (!tieKey || !SPECIAL_LOCK_STATE_TIES.has(tieKey)) {
      return { locked: true, iconOverride: LOCKED_UPGRADE_ICON_DATA_URL, useLockedBase: true };
    }
    let currentLevel = 0;
    try {
      currentLevel = upgRef && typeof upgRef.id !== "undefined" ? getLevelNumber(area, upgRef.id) : 0;
    } catch {
    }
    if (currentLevel >= 1) {
      return { locked: false, hidden: false, useLockedBase: false };
    }
    let xpUnlocked = false;
    try {
      xpUnlocked = ctx && typeof ctx.xpUnlocked !== "undefined" ? !!ctx.xpUnlocked : safeIsXpUnlocked();
    } catch {
    }
    function determineUnlockXpLockState() {
      if (safeHasMetMerchant()) {
        return {
          locked: false,
          hidden: false,
          hideCost: false,
          hideEffect: false,
          useLockedBase: false
        };
      }
      const revealText = "Explore the Delve menu to reveal this upgrade";
      return {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText,
        hidden: true,
        hideCost: true,
        hideEffect: true,
        useLockedBase: true
      };
    }
    if (tieKey === UPGRADE_TIES.UNLOCK_XP) {
      return determineUnlockXpLockState();
    }
    if (tieKey === UPGRADE_TIES.UNLOCK_FORGE) {
      if (!xpUnlocked) {
        return { locked: true, iconOverride: LOCKED_UPGRADE_ICON_DATA_URL, useLockedBase: true };
      }
      let xp312 = false;
      try {
        const xpBn = currentXpLevelBigNum();
        xp312 = levelBigNumToNumber2(xpBn) >= 31;
      } catch {
      }
      if (!xp312) {
        const revealText = upgRef?.revealRequirement || "Reach XP Level 31 to reveal this upgrade";
        return {
          locked: true,
          iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
          hidden: true,
          hideCost: true,
          hideEffect: true,
          useLockedBase: true,
          titleOverride: HIDDEN_UPGRADE_TITLE,
          descOverride: revealText,
          reason: revealText
        };
      }
      return { locked: false };
    }
    if (hasDoneForgeReset() || isUpgradePermanentlyUnlocked(area, upgRef)) {
      try {
        markUpgradePermanentlyUnlocked(area, upgRef);
      } catch {
      }
      return { locked: false, hidden: false, useLockedBase: false };
    }
    if (!xpUnlocked) {
      return { locked: true, iconOverride: LOCKED_UPGRADE_ICON_DATA_URL, useLockedBase: true };
    }
    if (isUpgradePermanentlyMysterious(area, upgRef)) {
      const revealText = "Do a Forge reset to reveal this upgrade";
      return {
        locked: true,
        iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
        hidden: true,
        hideCost: true,
        hideEffect: true,
        useLockedBase: true,
        titleOverride: HIDDEN_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText
      };
    }
    let xp31 = false;
    try {
      const xpBn = currentXpLevelBigNum();
      xp31 = levelBigNumToNumber2(xpBn) >= 31;
    } catch {
    }
    if (!xp31) {
      const revealText = "Do a Forge reset to reveal this upgrade";
      return {
        locked: true,
        iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
        useLockedBase: true,
        titleOverride: LOCKED_UPGRADE_TITLE,
        descOverride: revealText,
        reason: revealText,
        hidden: false,
        hideCost: false,
        hideEffect: false
      };
    }
    try {
      markUpgradePermanentlyMysterious(area, upgRef);
    } catch {
    }
    return {
      locked: true,
      iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
      hidden: true,
      hideCost: true,
      hideEffect: true,
      useLockedBase: true
    };
  }
  function normalizeAreaKey(areaKey) {
    if (typeof areaKey === "string") {
      const trimmed = areaKey.trim();
      if (trimmed) {
        return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      }
    }
    return "";
  }
  function normalizeUpgradeTie(tieValue) {
    if (typeof tieValue === "string") {
      const trimmed = tieValue.trim();
      if (trimmed) {
        return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      }
    }
    return "";
  }
  function isXpAdjacentUpgrade(areaKey, upg) {
    const tieKey = normalizeUpgradeTie(upg?.tie ?? upg?.tieKey);
    if (tieKey && XP_MYSTERY_UPGRADE_TIES.has(tieKey)) {
      return true;
    }
    const normalizedId = normalizeUpgradeId(upg?.id);
    const numericId = typeof normalizedId === "number" ? normalizedId : Number.parseInt(normalizedId, 10);
    const idKey = Number.isFinite(numericId) ? String(numericId) : normalizedId != null ? String(normalizedId) : "";
    if (!idKey) return false;
    const areaCandidates = [];
    if (areaKey != null) areaCandidates.push(areaKey);
    if (upg?.area != null) areaCandidates.push(upg.area);
    for (const candidate of areaCandidates) {
      const normArea = normalizeAreaKey(candidate);
      if (!normArea) continue;
      if (XP_MYSTERY_LEGACY_KEYS.has(`${normArea}:${idKey}`)) {
        return true;
      }
    }
    return false;
  }
  function safeIsXpUnlocked() {
    try {
      return !!isXpSystemUnlocked();
    } catch {
      return false;
    }
  }
  function safeHasMetMerchant(slot = getActiveSlot()) {
    const slotKey2 = String(slot ?? "default");
    if (typeof localStorage === "undefined") return false;
    try {
      return localStorage.getItem(`${MERCHANT_MET_KEY_BASE}:${slotKey2}`) === "1";
    } catch {
      return false;
    }
  }
  function currentXpLevelBigNum() {
    try {
      const state = typeof getXpState === "function" ? getXpState() : null;
      if (state?.xpLevel instanceof BigNum) {
        return state.xpLevel.clone?.() ?? state.xpLevel;
      }
      if (state?.xpLevel != null) {
        return BigNum.fromAny(state.xpLevel);
      }
    } catch {
    }
    return BigNum.fromInt(0);
  }
  function bookValueMultiplierBn(level) {
    const L = ensureLevelBigNum(level);
    try {
      const plain = L.toPlainIntegerString?.();
      if (plain && plain !== "Infinity" && plain.length <= 15) {
        const lvl = Math.max(0, Number(plain));
        return bigNumFromLog102(lvl * Math.log10(2)).floorToInteger();
      }
    } catch {
    }
    return BigNum.fromAny("Infinity");
  }
  function normalizedUpgradeLevel(levelValue) {
    if (typeof levelValue === "number" && Number.isFinite(levelValue)) {
      return Math.max(0, Math.floor(levelValue));
    }
    if (typeof levelValue === "bigint") {
      if (levelValue < 0n) return 0;
      const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
      const clamped = levelValue > maxSafe ? maxSafe : levelValue;
      return Number(clamped);
    }
    if (levelValue instanceof BigNum) {
      try {
        const plain = levelValue.toPlainIntegerString?.();
        if (plain && plain !== "Infinity") {
          const parsed = Number.parseInt(plain, 10);
          if (Number.isFinite(parsed)) {
            return Math.max(0, parsed);
          }
        }
      } catch {
      }
    }
    return 0;
  }
  function hundredPercentPerLevelMultiplier(levelValue) {
    const lvl = normalizedUpgradeLevel(levelValue);
    if (lvl <= 0) {
      return BigNum.fromInt(1);
    }
    try {
      const asBigInt = BigInt(lvl) + 1n;
      return BigNum.fromAny(asBigInt.toString());
    } catch {
      try {
        return BigNum.fromAny(String(lvl + 1));
      } catch {
        return BigNum.fromInt(1);
      }
    }
  }
  function mergeLockStates(base, override) {
    const merged = Object.assign({ locked: false }, base || {});
    if (!override || typeof override !== "object") return merged;
    const keys = [
      "locked",
      "iconOverride",
      "titleOverride",
      "descOverride",
      "reason",
      "hideCost",
      "hideEffect",
      "hidden",
      "useLockedBase"
    ];
    for (const key of keys) {
      if (override[key] !== void 0) merged[key] = override[key];
    }
    return merged;
  }
  function normalizeUpgradeId(upgId) {
    if (typeof upgId === "number") {
      if (!Number.isFinite(upgId)) return upgId;
      return Math.trunc(upgId);
    }
    if (typeof upgId === "string") {
      const trimmed = upgId.trim();
      if (!trimmed) return trimmed;
      if (/^[+-]?\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
      return trimmed;
    }
    return upgId;
  }
  function ensureLevelBigNum(value) {
    try {
      const bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
      if (bn.isInfinite?.()) return bn.clone?.() ?? bn;
      const plain = bn.toPlainIntegerString?.();
      if (plain === "Infinity") return BigNum.fromAny("Infinity");
      if (!plain) return BigNum.fromInt(0);
      const normalized = plain.replace(/^0+(?=\d)/, "");
      if (!normalized) return BigNum.fromInt(0);
      return BigNum.fromAny(normalized);
    } catch {
      const num = Math.max(0, Math.floor(Number(value) || 0));
      return BigNum.fromInt(num);
    }
  }
  function levelBigNumToNumber2(value) {
    let bn;
    try {
      bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
    } catch {
      return 0;
    }
    if (bn.isInfinite?.()) {
      return Number.POSITIVE_INFINITY;
    }
    try {
      const plain = bn.toPlainIntegerString?.();
      if (!plain || plain === "Infinity") {
        return plain === "Infinity" ? Number.MAX_VALUE : 0;
      }
      const digits = plain.replace(/^0+/, "");
      if (!digits) return 0;
      if (digits.length <= 15) {
        const num = Number(digits);
        return Number.isFinite(num) ? num : 0;
      }
      const lead = digits.slice(0, 15);
      const leadNum = Number(lead);
      const leadLen = lead.length;
      if (!Number.isFinite(leadNum) || leadNum <= 0) return 0;
      let mantissa = leadNum / Math.pow(10, leadLen - 1);
      let exponent = digits.length - 1;
      if (mantissa <= 0 || !Number.isFinite(mantissa)) return 0;
      if (mantissa >= 10) {
        const shift = Math.floor(Math.log10(mantissa));
        if (Number.isFinite(shift) && shift > 0) {
          mantissa /= Math.pow(10, shift);
          exponent += shift;
        }
      } else if (mantissa < 1) {
        const shift = Math.ceil(Math.log10(1 / mantissa));
        if (Number.isFinite(shift) && shift > 0) {
          mantissa *= Math.pow(10, shift);
          exponent -= shift;
        }
      }
      if (exponent > 308) {
        return Number.MAX_VALUE;
      }
      if (exponent < -324) {
        return 0;
      }
      const approx = mantissa * Math.pow(10, exponent);
      if (!Number.isFinite(approx)) {
        return exponent > 0 ? Number.MAX_VALUE : 0;
      }
      return approx;
    } catch {
      const approx = approxLog10BigNum(bn);
      if (!Number.isFinite(approx)) return Number.MAX_VALUE;
      if (approx > 308) return Number.MAX_VALUE;
      if (approx < -324) return 0;
      const value2 = Math.pow(10, approx);
      return Number.isFinite(value2) ? value2 : Number.MAX_VALUE;
    }
  }
  function plainLevelDelta(nextLevelBn, prevLevelBn) {
    const next = ensureLevelBigNum(nextLevelBn);
    const prev = ensureLevelBigNum(prevLevelBn);
    if (next.isInfinite?.()) {
      return prev.isInfinite?.() ? BigNum.fromInt(0) : BigNum.fromAny("Infinity");
    }
    if (prev.isInfinite?.()) {
      return BigNum.fromInt(0);
    }
    try {
      const nextPlain = next.toPlainIntegerString?.();
      const prevPlain = prev.toPlainIntegerString?.();
      if (!nextPlain || !prevPlain) return BigNum.fromInt(0);
      if (nextPlain === "Infinity") return BigNum.fromAny("Infinity");
      if (prevPlain === "Infinity") return BigNum.fromInt(0);
      if (nextPlain === prevPlain) return BigNum.fromInt(0);
      const diff = BigInt(nextPlain) - BigInt(prevPlain);
      if (diff <= 0n) return BigNum.fromInt(0);
      return BigNum.fromAny(diff.toString());
    } catch {
      return BigNum.fromInt(0);
    }
  }
  function decimalMultiplierString(value) {
    if (!Number.isFinite(value) || value <= 0) return "1";
    let out = value.toFixed(12);
    out = out.replace(/0+$/, "");
    if (out.endsWith(".")) out += "0";
    return out;
  }
  function computeDefaultUpgradeCost(baseCost, level, upgType = "NM") {
    let baseBn;
    try {
      baseBn = BigNum.fromAny(baseCost ?? 0);
    } catch {
      baseBn = BigNum.fromInt(0);
    }
    let levelNumber = 0;
    try {
      if (level instanceof BigNum) {
        const plain = level.toPlainIntegerString?.();
        if (plain && plain !== "Infinity") {
          levelNumber = Number.parseInt(plain, 10);
        }
      } else {
        levelNumber = Number(level) || 0;
      }
    } catch {
      levelNumber = 0;
    }
    const upg = { upgType, numUpgEvolutions: 0 };
    if (`${upgType ?? ""}`.toUpperCase() === "HM") {
      const evolutions = Math.max(0, Math.floor(levelNumber / HM_EVOLUTION_INTERVAL));
      if (Number.isFinite(evolutions)) {
        upg.numUpgEvolutions = evolutions;
      }
    }
    const preset = resolveDefaultScalingRatio(upg);
    const ratio = Number.isFinite(preset?.ratio) ? preset.ratio : 1;
    const scaling = {
      baseBn,
      baseLog10: approxLog10BigNum(baseBn),
      ratio,
      ratioMinus1: Math.max(0, ratio - 1),
      ratioLog10: Math.log10(Math.max(ratio, 1)),
      ratioLn: Math.log(Math.max(ratio, 1)),
      ratioStr: decimalMultiplierString(Math.max(ratio, 1)),
      defaultPreset: preset?.preset
    };
    upg.scaling = scaling;
    return costAtLevelUsingScaling(upg, levelNumber);
  }
  function normalizeHmEvolutionCount(value) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return Math.max(0, Math.floor(n));
    return 0;
  }
  function activeEvolutionsForUpgrade(upg) {
    if (!upg) return 0;
    const active = Number(upg.activeEvolutions);
    if (Number.isFinite(active) && active >= 0) return active;
    return normalizeHmEvolutionCount(upg.numUpgEvolutions);
  }
  function hmLevelCapForEvolutions(evolutions) {
    const cycles = normalizeHmEvolutionCount(evolutions);
    const cap = HM_EVOLUTION_INTERVAL * (cycles + 1);
    const capBn = BigNum.fromAny(cap);
    return {
      cap,
      capBn,
      capFmtHtml: formatBigNumAsHtml(capBn),
      capFmtText: formatBigNumAsPlain(capBn)
    };
  }
  function hmMilestoneHits(levelBn, milestoneLevel) {
    if (!levelBn || typeof milestoneLevel !== "number") return 0;
    try {
      const plain = levelBn.toPlainIntegerString?.();
      if (!plain || plain === "Infinity") return 0;
      const lvl = BigInt(plain);
      const base = BigInt(Math.max(0, Math.floor(milestoneLevel)));
      const interval = BigInt(HM_EVOLUTION_INTERVAL);
      if (lvl < base) return 0;
      const delta = lvl - base;
      const cycles = delta / interval;
      return Number(cycles + 1n);
    } catch {
      const approx = levelBigNumToNumber2(levelBn);
      if (!Number.isFinite(approx) || approx < milestoneLevel) return 0;
      const delta = approx - milestoneLevel;
      return Math.max(0, Math.floor(delta / HM_EVOLUTION_INTERVAL) + 1);
    }
  }
  function hmMilestoneMultiplier(multiplier, hits) {
    if (!(hits > 0)) return BigNum.fromInt(1);
    let out;
    try {
      out = BigNum.fromAny(multiplier ?? 1);
    } catch {
      out = BigNum.fromInt(1);
    }
    let result = out.clone?.() ?? out;
    for (let i = 1; i < hits; i += 1) {
      try {
        result = result.mulBigNumInteger(out);
      } catch {
        try {
          result = result.mulDecimal(String(out), 18);
        } catch {
          return BigNum.fromAny("Infinity");
        }
      }
    }
    return result;
  }
  function resolveHmMilestones(upg, areaKey = DEFAULT_AREA_KEY) {
    const milestones = upg?.hmMilestones;
    if (Array.isArray(milestones)) return milestones;
    if (!milestones || typeof milestones !== "object") return [];
    const normalizedArea = normalizeAreaKey(areaKey || upg?.area || DEFAULT_AREA_KEY);
    if (normalizedArea) {
      if (Array.isArray(milestones[normalizedArea])) return milestones[normalizedArea];
      if (Array.isArray(milestones[areaKey])) return milestones[areaKey];
    }
    if (Array.isArray(milestones.default)) return milestones.default;
    return [];
  }
  function safeMultiplyBigNum(base, factor) {
    let out = base instanceof BigNum ? base : BigNum.fromAny(base ?? 1);
    let f = factor instanceof BigNum ? factor : null;
    if (!f) {
      try {
        f = BigNum.fromAny(factor ?? 1);
      } catch {
        return out;
      }
    }
    try {
      return out.mulBigNumInteger(f);
    } catch {
    }
    try {
      return out.mulDecimal(f.toScientific?.(12) ?? String(factor ?? "1"), 18);
    } catch {
    }
    return out;
  }
  function applyHmEvolutionMeta(upg, evolutions = 0) {
    if (!upg || upg.upgType !== "HM") return;
    delete upg.scaling;
    const { cap, capBn, capFmtHtml, capFmtText } = hmLevelCapForEvolutions(evolutions);
    upg.activeEvolutions = evolutions;
    upg.lvlCap = cap;
    upg.lvlCapBn = capBn;
    upg.lvlCapFmtHtml = capFmtHtml;
    upg.lvlCapFmtText = capFmtText;
  }
  function computeHmMultipliers(upg, levelBn, areaKey = DEFAULT_AREA_KEY) {
    if (!upg || upg.upgType !== "HM") {
      return {
        selfMult: BigNum.fromInt(1),
        xpMult: BigNum.fromInt(1),
        coinMult: BigNum.fromInt(1),
        mpMult: BigNum.fromInt(1)
      };
    }
    const milestones = resolveHmMilestones(upg, areaKey);
    let selfMult = BigNum.fromInt(1);
    let xpMult = BigNum.fromInt(1);
    let coinMult = BigNum.fromInt(1);
    let mpMult = BigNum.fromInt(1);
    for (const m of milestones) {
      const hits = hmMilestoneHits(levelBn, Number(m?.level ?? m?.lvl ?? 0));
      if (!(hits > 0)) continue;
      const mult = hmMilestoneMultiplier(m.multiplier ?? m.mult ?? m.value ?? 1, hits);
      const target = `${m.target ?? m.type ?? "self"}`.toLowerCase();
      if (target === "xp") {
        xpMult = safeMultiplyBigNum(xpMult, mult);
      } else if (target === "coin" || target === "coins") {
        coinMult = safeMultiplyBigNum(coinMult, mult);
      } else if (target === "mp") {
        mpMult = safeMultiplyBigNum(mpMult, mult);
      } else {
        selfMult = safeMultiplyBigNum(selfMult, mult);
      }
    }
    const evolutions = activeEvolutionsForUpgrade(upg);
    for (let i = 0; i < evolutions; i += 1) {
      selfMult = safeMultiplyBigNum(selfMult, HM_EVOLUTION_EFFECT_MULT_BN);
    }
    return { selfMult, xpMult, coinMult, mpMult };
  }
  function hmNextMilestoneLevel(upg, levelBn, areaKey = DEFAULT_AREA_KEY) {
    if (!upg || upg.upgType !== "HM") return null;
    if (levelBn?.isInfinite?.()) return BigNum.fromAny("Infinity");
    const milestones = resolveHmMilestones(upg, areaKey);
    if (!milestones.length) return null;
    let best = null;
    for (const m of milestones) {
      const lvl = Math.max(0, Math.floor(Number(m?.level ?? m?.lvl ?? 0)));
      const hits = hmMilestoneHits(levelBn, lvl);
      let candidate = null;
      try {
        const base = BigInt(lvl);
        const nextHits = BigInt(Math.max(0, hits));
        const targetBi = base + BigInt(HM_EVOLUTION_INTERVAL) * nextHits;
        if (targetBi > 0n) {
          candidate = BigNum.fromAny(targetBi.toString());
        }
      } catch {
      }
      if (!candidate) {
        const increment = BigNum.fromAny(HM_EVOLUTION_INTERVAL * Math.max(0, hits));
        try {
          candidate = increment.add(BigNum.fromAny(lvl));
        } catch {
          candidate = BigNum.fromAny(lvl + HM_EVOLUTION_INTERVAL * hits);
        }
      }
      if (!candidate) continue;
      if (levelBn?.cmp?.(candidate) >= 0) {
        try {
          candidate = candidate.add(BigNum.fromAny(HM_EVOLUTION_INTERVAL));
        } catch {
        }
      }
      if (!best || best.cmp(candidate) > 0) {
        best = candidate;
      }
    }
    return best;
  }
  function resolveDefaultScalingRatio(upg) {
    if (!upg) return null;
    const tryPreset = (name) => {
      const presetName = `${name ?? ""}`.toUpperCase();
      if (!presetName) return null;
      const presetFn = DEFAULT_SCALING_PRESETS[presetName];
      if (typeof presetFn !== "function") return null;
      const ratio = presetFn(upg);
      if (!Number.isFinite(ratio) || ratio <= 0) return null;
      return { ratio, preset: presetName };
    };
    return tryPreset(upg.scalingPreset) || tryPreset(upg.upgType) || tryPreset("STANDARD");
  }
  function ensureUpgradeScaling(upg) {
    if (!upg) return null;
    if (upg.scaling && upg.scaling.baseBn) return upg.scaling;
    try {
      const baseBn = BigNum.fromAny(upg.baseCost ?? upg.baseCostBn ?? 0);
      const providedScaling = upg.scaling ?? {};
      let ratio = Number(providedScaling.ratio);
      if (!(ratio > 0) || !Number.isFinite(ratio)) ratio = null;
      let ratioStr = typeof providedScaling.ratioStr === "string" ? providedScaling.ratioStr.trim() : "";
      if (!ratio && ratioStr) {
        const parsed = Number(ratioStr);
        if (Number.isFinite(parsed) && parsed > 0) {
          ratio = parsed;
        }
      }
      let ratioLog10 = Number(providedScaling.ratioLog10);
      if (!Number.isFinite(ratioLog10)) ratioLog10 = null;
      if (!ratio && ratioLog10 != null) {
        const pow = Math.pow(10, ratioLog10);
        if (Number.isFinite(pow) && pow > 0) ratio = pow;
      }
      let ratioLn = Number(providedScaling.ratioLn);
      if (!Number.isFinite(ratioLn)) ratioLn = null;
      if (!ratio && ratioLn != null) {
        const exp = Math.exp(ratioLn);
        if (Number.isFinite(exp) && exp > 0) ratio = exp;
      }
      if (!ratio) {
        const ratioMinus12 = Number(providedScaling.ratioMinus1);
        if (Number.isFinite(ratioMinus12) && ratioMinus12 > 0) {
          ratio = ratioMinus12 + 1;
        }
      }
      let defaultPreset = null;
      if (!ratio) {
        const resolved = resolveDefaultScalingRatio(upg);
        if (resolved) {
          ratio = resolved.ratio;
          defaultPreset = resolved.preset;
        }
      }
      if (!(ratio > 1)) {
        ratio = 1;
        ratioStr = "1";
        ratioLog10 = 0;
        ratioLn = 0;
        var ratioMinus1 = 0;
      } else {
        ratio = Number(ratio);
        ratioStr = decimalMultiplierString(ratio);
        ratioLog10 = Math.log10(ratio);
        ratioLn = Math.log(ratio);
        var ratioMinus1 = Math.max(1e-12, ratio - 1);
      }
      const baseLog10 = approxLog10BigNum(baseBn);
      const scaling = Object.assign({}, providedScaling, {
        baseBn,
        baseLog10,
        ratio,
        ratioMinus1,
        ratioLog10,
        ratioLn,
        ratioStr,
        defaultPreset: defaultPreset ?? providedScaling.defaultPreset
      });
      upg.scaling = scaling;
      try {
        const c0 = BigNum.fromAny(upg.costAtLevel?.(0) ?? 0);
        const c1 = BigNum.fromAny(upg.costAtLevel?.(1) ?? 0);
        const cF = BigNum.fromAny(upg.costAtLevel?.(32) ?? 0);
        if (c0.cmp(c1) === 0 && c0.cmp(cF) === 0) {
          scaling.ratio = 1;
          scaling.ratioMinus1 = 0;
          scaling.ratioLog10 = 0;
          scaling.ratioLn = 0;
          scaling.ratioStr = "1";
        }
      } catch {
      }
      return scaling;
    } catch {
      return null;
    }
  }
  function costAtLevelUsingScaling(upg, level) {
    const scaling = ensureUpgradeScaling(upg);
    if (!scaling) return BigNum.fromInt(0);
    const lvl = Math.max(0, Math.floor(Number(level) || 0));
    if (lvl === 0) return BigNum.fromAny(scaling.baseBn);
    if (lvl <= 100) {
      let price = BigNum.fromAny(scaling.baseBn);
      for (let i = 0; i < lvl; i += 1) {
        price = price.mulDecimal(scaling.ratioStr);
      }
      return price.floorToInteger();
    }
    if (lvl < 1e4) {
      const anchor = Math.max(0, lvl - 10);
      let price = bigNumFromLog102(scaling.baseLog10 + anchor * scaling.ratioLog10);
      for (let step = anchor; step < lvl; step += 1) {
        price = price.mulDecimal(scaling.ratioStr);
      }
      return price.floorToInteger();
    }
    return bigNumFromLog102(scaling.baseLog10 + lvl * scaling.ratioLog10).floorToInteger();
  }
  function logExpMinus1(x) {
    if (!Number.isFinite(x)) return x;
    if (x < 1e-6) {
      return Math.log(Math.expm1(x));
    }
    if (x < 50) {
      return Math.log(Math.expm1(x));
    }
    const negExp = Math.exp(-x);
    return x + Math.log1p(-negExp);
  }
  function logSeriesTotal(upg, startLevel, count) {
    if (!(count > 0)) return Number.NEGATIVE_INFINITY;
    const scaling = ensureUpgradeScaling(upg);
    if (!scaling) return Number.NEGATIVE_INFINITY;
    if (!(scaling.ratioMinus1 > 0) || !Number.isFinite(scaling.ratioLn)) {
      return Number.POSITIVE_INFINITY;
    }
    const startLn = scaling.baseLog10 * LN10 + startLevel * scaling.ratioLn;
    const growth = scaling.ratioLn * count;
    const numerLn = logExpMinus1(growth);
    if (!Number.isFinite(numerLn)) return Number.POSITIVE_INFINITY;
    const denomLn = Math.log(scaling.ratioMinus1);
    const totalLn = startLn + numerLn - denomLn;
    return totalLn / LN10;
  }
  function totalCostBigNum(upg, startLevel, count) {
    if (!(count > 0)) return BigNum.fromInt(0);
    const scaling = ensureUpgradeScaling(upg);
    if (!scaling) return BigNum.fromInt(0);
    const targetLevel = startLevel + count;
    if (targetLevel <= 100) {
      let price = BigNum.fromAny(upg.costAtLevel(startLevel));
      let total = BigNum.fromInt(0);
      for (let i = 0; i < count; i += 1) {
        total = total.add(price);
        if (i + 1 < count) price = price.mulDecimalFloor(scaling.ratioStr);
      }
      return total;
    }
    if (targetLevel < 1e4) {
      const tailCount = Math.min(10, count);
      const headCount = count - tailCount;
      let total = BigNum.fromInt(0);
      if (headCount > 0) {
        const headLog = logSeriesTotal(upg, startLevel, headCount);
        total = total.add(bigNumFromLog102(headLog));
      }
      if (tailCount > 0) {
        const tailStart = startLevel + headCount;
        let price = BigNum.fromAny(upg.costAtLevel(tailStart));
        for (let i = 0; i < tailCount; i += 1) {
          total = total.add(price);
          if (i + 1 < tailCount) price = price.mulDecimalFloor(scaling.ratioStr);
        }
      }
      return total;
    }
    const totalLog = logSeriesTotal(upg, startLevel, count);
    return bigNumFromLog102(totalLog);
  }
  function log10OnePlusPow10(exponent) {
    if (!Number.isFinite(exponent)) {
      if (exponent > 0) return exponent;
      if (exponent === 0) return Math.log10(2);
      return 0;
    }
    if (exponent > 308) return exponent;
    if (exponent < -20) {
      const pow2 = Math.pow(10, exponent);
      return pow2 / LN10;
    }
    const pow = Math.pow(10, exponent);
    if (!Number.isFinite(pow)) return exponent > 0 ? exponent : 0;
    return Math.log1p(pow) / LN10;
  }
  function nextDownPositive(value) {
    if (!(value > 0) || !Number.isFinite(value)) return value;
    FLOAT64_VIEW[0] = value;
    if (FLOAT64_VIEW[0] <= 0) return 0;
    INT64_VIEW[0] -= 1n;
    const next = FLOAT64_VIEW[0];
    return next > 0 ? next : 0;
  }
  function safeDecrementCount(value) {
    if (!(value > 0)) return 0;
    const dec = Math.floor(value - 1);
    if (dec < value) return dec;
    const next = nextDownPositive(value);
    if (next < value) return next;
    return value > 1 ? value / 2 : 0;
  }
  function countToBigNum(count) {
    if (!(count > 0) || !Number.isFinite(count)) return BigNum.fromInt(0);
    const floored = Math.floor(count);
    if (!(floored > 0)) return BigNum.fromInt(0);
    if (floored <= Number.MAX_SAFE_INTEGER) {
      return BigNum.fromInt(floored);
    }
    let str;
    try {
      str = floored.toLocaleString("fullwide", { useGrouping: false, maximumFractionDigits: 0 });
    } catch {
      str = floored.toString();
    }
    if (!str || !/\d/.test(str)) return BigNum.fromInt(0);
    return BigNum.fromAny(str);
  }
  function calculateBulkPurchase(upg, startLevel, walletBn, maxLevels = MAX_LEVEL_DELTA, options = {}) {
    const scaling = ensureUpgradeScaling(upg);
    const zero = BigNum.fromInt(0);
    const opts = options || {};
    const fastOnly = !!opts.fastOnly;
    walletBn = walletBn instanceof BigNum ? walletBn : BigNum.fromAny(walletBn ?? 0);
    if (!scaling) {
      return { count: zero, spent: zero, nextPrice: zero, numericCount: 0 };
    }
    const startLevelNum = Math.max(0, Math.floor(levelBigNumToNumber2(startLevel)));
    const cap = Number.isFinite(upg.lvlCap) ? Math.max(0, Math.floor(upg.lvlCap)) : Number.POSITIVE_INFINITY;
    const maxLevelsNum = typeof maxLevels === "number" ? maxLevels : levelBigNumToNumber2(maxLevels);
    const capRoom = Number.isFinite(cap) ? Math.max(0, cap - startLevelNum) : MAX_LEVEL_DELTA_LIMIT;
    let room = Number.isFinite(maxLevelsNum) ? Math.max(0, Math.floor(maxLevelsNum)) : MAX_LEVEL_DELTA_LIMIT;
    room = Math.min(room, MAX_LEVEL_DELTA_LIMIT, capRoom);
    if (!(room > 0)) {
      const nextPrice2 = capRoom <= 0 ? zero : BigNum.fromAny(upg.costAtLevel(startLevelNum));
      return { count: zero, spent: zero, nextPrice: nextPrice2, numericCount: 0 };
    }
    const remainingToHundred = 100 - startLevelNum;
    if (Number.isFinite(startLevelNum) && remainingToHundred > 0) {
      const limit2 = Math.min(room, remainingToHundred);
      let price = BigNum.fromAny(upg.costAtLevel(startLevelNum));
      let spent2 = zero;
      let count2 = 0;
      while (count2 < limit2) {
        price = BigNum.fromAny(upg.costAtLevel(startLevelNum + count2));
        const newSpent = spent2.add(price);
        if (newSpent.cmp(walletBn) > 0) break;
        spent2 = newSpent;
        count2 += 1;
      }
      const nextLevel = startLevelNum + count2;
      const reachedCap = Number.isFinite(cap) && nextLevel >= cap;
      const countBn2 = countToBigNum(count2);
      if (count2 < limit2 || reachedCap || room <= count2) {
        const nextPrice2 = reachedCap ? zero : BigNum.fromAny(upg.costAtLevel(nextLevel));
        return { count: countBn2, spent: spent2, nextPrice: nextPrice2, numericCount: count2 };
      }
      const nextStartLevel = (() => {
        try {
          return toUpgradeBigNum(startLevel ?? startLevelNum, startLevelNum).add(countBn2);
        } catch {
          return startLevelNum + count2;
        }
      })();
      const tail = calculateBulkPurchase(
        upg,
        nextStartLevel,
        walletBn.sub(spent2),
        room - count2,
        options
      );
      const tailCount = tail?.count instanceof BigNum ? tail.count : countToBigNum(tail?.numericCount ?? 0);
      const totalCount = countBn2.add(tailCount);
      const totalSpent = (tail?.spent ?? zero).add(spent2);
      return {
        count: totalCount,
        spent: totalSpent,
        nextPrice: tail?.nextPrice ?? zero,
        numericCount: count2 + (tail?.numericCount ?? 0)
      };
    }
    let walletLog = approxLog10BigNum(walletBn);
    const ratioLog10 = scaling.ratioLog10;
    const ratioMinus1 = scaling.ratioMinus1;
    const firstPrice = BigNum.fromAny(upg.costAtLevel(startLevelNum));
    const startPriceLog = scaling.baseLog10 + startLevelNum * ratioLog10;
    const needBnSearch = ratioMinus1 > 0 && (!Number.isFinite(walletLog) || Math.abs(walletLog) > 1e6 && Math.abs(startPriceLog) > 1e6);
    if (needBnSearch) {
      const firstPrice2 = BigNum.fromAny(upg.costAtLevel(startLevelNum));
      if (walletBn.cmp(firstPrice2) < 0) {
        return { count: zero, spent: zero, nextPrice: firstPrice2, numericCount: 0 };
      }
      const hardLimit = Number.isFinite(room) ? Math.max(1, Math.floor(room)) : Number.MAX_VALUE;
      let lo = 1;
      let hi = 1;
      while (hi < hardLimit) {
        const spentLog2 = logSeriesTotal(upg, startLevelNum, hi);
        const spentBn = bigNumFromLog102(spentLog2);
        if (spentBn.cmp(walletBn) <= 0) {
          const doubled = hi * 2;
          if (!Number.isFinite(doubled) || doubled <= hi) {
            hi = hardLimit;
            break;
          }
          lo = hi;
          hi = Math.min(doubled, hardLimit);
        } else {
          break;
        }
      }
      let steps = 0;
      while (lo < hi && steps < 256) {
        const mid = Math.max(lo + 1, Math.floor((lo + hi + 1) / 2));
        const spentLog2 = logSeriesTotal(upg, startLevelNum, mid);
        const spentBn = bigNumFromLog102(spentLog2);
        if (spentBn.cmp(walletBn) <= 0) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
        steps++;
      }
      const count2 = Math.max(1, lo);
      const countBn2 = countToBigNum(count2);
      let spent2 = zero;
      let nextPrice2 = zero;
      if (!fastOnly) {
        spent2 = totalCostBigNum(upg, startLevelNum, count2);
        if (Number.isFinite(cap)) {
          const capRoom2 = Math.max(0, Math.floor(cap - Math.min(startLevelNum, cap)));
          if (count2 >= capRoom2) {
            nextPrice2 = zero;
          } else {
            nextPrice2 = bigNumFromLog102(startPriceLog + count2 * ratioLog10);
          }
        } else {
          nextPrice2 = bigNumFromLog102(startPriceLog + count2 * ratioLog10);
        }
      }
      return {
        count: countBn2,
        spent: spent2,
        nextPrice: nextPrice2,
        numericCount: count2
      };
    }
    if (walletBn.cmp(firstPrice) < 0) {
      return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
    }
    let isConstantCost = false;
    let secondPrice = null, farPrice = null;
    try {
      secondPrice = BigNum.fromAny(upg.costAtLevel(startLevelNum + 1));
    } catch {
    }
    try {
      const farProbe = Math.min(
        Number.isFinite(cap) ? Math.max(startLevelNum + 1, Math.floor(cap)) : startLevelNum + 32,
        startLevelNum + 32
      );
      farPrice = BigNum.fromAny(upg.costAtLevel(farProbe));
    } catch {
    }
    if (!isConstantCost && !(scaling.ratioMinus1 > 0)) {
      isConstantCost = true;
    }
    if (secondPrice && farPrice) {
      isConstantCost = secondPrice.cmp(firstPrice) === 0 && farPrice.cmp(firstPrice) === 0;
    }
    if (!isConstantCost && !(scaling.ratioMinus1 > 0)) {
      isConstantCost = true;
    }
    const limit = Number.isFinite(room) ? Math.max(0, Math.floor(room)) : Number.MAX_VALUE;
    if (isConstantCost) {
      const capBn = toUpgradeBigNum(upg.lvlCapBn ?? "Infinity", "Infinity");
      const lvlBn = toUpgradeBigNum(startLevel ?? 0, 0);
      const roomBn = capBn.isInfinite?.() ? BigNum.fromAny("Infinity") : capBn.sub(lvlBn).floorToInteger();
      const { count: count2, countBn: countBn2, spent: spent2, nextPrice: nextPrice2 } = estimateFlatBulk(
        firstPrice,
        walletBn,
        roomBn
      );
      return {
        count: countBn2,
        spent: spent2,
        nextPrice: nextPrice2,
        numericCount: count2
      };
    }
    if (!(ratioLog10 > 0) || !(ratioMinus1 > 0)) {
      const capBn = toUpgradeBigNum(upg.lvlCapBn ?? "Infinity", "Infinity");
      const lvlBn = toUpgradeBigNum(startLevel ?? 0, 0);
      const roomBn = capBn.isInfinite?.() ? BigNum.fromAny("Infinity") : capBn.sub(lvlBn).floorToInteger();
      const { count: count2, countBn: countBn2, spent: spent2, nextPrice: nextPrice2 } = estimateFlatBulk(firstPrice, walletBn, roomBn);
      return { count: countBn2, spent: spent2, nextPrice: nextPrice2, numericCount: count2 };
    }
    const ratioMinus1Log = Math.log10(ratioMinus1);
    if (!Number.isFinite(ratioMinus1Log)) {
      return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
    }
    const logTarget = log10OnePlusPow10(walletLog + ratioMinus1Log - startPriceLog);
    let approxCount = logTarget / ratioLog10;
    if (!Number.isFinite(approxCount) || approxCount < 0) approxCount = 0;
    let count = Math.floor(Math.min(limit, approxCount));
    if (!Number.isFinite(count)) count = limit;
    if (count <= 0) count = 1;
    const EPS = 1e-7;
    let spentLog = logSeriesTotal(upg, startLevelNum, count);
    let tuneSteps = 0;
    const MAX_TUNE_STEPS = 2048;
    while (count > 0 && (!Number.isFinite(spentLog) || spentLog > walletLog + EPS) && tuneSteps < MAX_TUNE_STEPS) {
      const overshoot = Number.isFinite(spentLog) ? Math.max(1, Math.ceil((spentLog - walletLog) / Math.max(ratioLog10, 1e-12))) : Math.max(1, Math.floor(count / 2));
      const reduced = Math.max(0, Math.floor(count - overshoot));
      if (reduced < count) {
        count = reduced;
      } else {
        const next = nextDownPositive(count);
        if (!(next < count)) break;
        count = next;
      }
      spentLog = count > 0 ? logSeriesTotal(upg, startLevelNum, count) : Number.NEGATIVE_INFINITY;
      tuneSteps += 1;
    }
    if (count <= 0 || !Number.isFinite(count)) {
      if (walletBn.cmp(firstPrice) >= 0) {
        count = 1;
        spentLog = approxLog10BigNum(firstPrice);
      } else {
        return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
      }
    }
    if (count < limit) {
      const safeTimes2 = (x) => {
        const y = x * 2;
        return Number.isFinite(y) ? y : Number.MAX_VALUE;
      };
      let lo = count;
      let hi = Math.min(limit, Math.max(count + 1, safeTimes2(count)));
      let hiLog = logSeriesTotal(upg, startLevelNum, hi);
      while (lo < hi && Number.isFinite(hiLog) && hiLog <= walletLog + EPS && hi < limit) {
        lo = hi;
        hi = Math.min(limit, safeTimes2(hi));
        hiLog = logSeriesTotal(upg, startLevelNum, hi);
      }
      let left = lo, right = hi;
      for (let i = 0; i < 256 && left < right; i += 1) {
        const mid = Math.floor((left + right + 1) / 2);
        const midLog = logSeriesTotal(upg, startLevelNum, mid);
        if (Number.isFinite(midLog) && midLog <= walletLog + EPS) {
          left = mid;
          spentLog = midLog;
        } else {
          right = mid - 1;
        }
      }
      count = left;
    }
    let spent = null;
    if (!fastOnly) {
      spent = totalCostBigNum(upg, startLevelNum, count);
      let guard = 0;
      while (spent.cmp(walletBn) > 0 && count > 0 && guard < MAX_TUNE_STEPS) {
        const decremented = safeDecrementCount(count);
        if (!(decremented < count)) break;
        count = decremented;
        spent = totalCostBigNum(upg, startLevelNum, count);
        guard += 1;
      }
      if (count <= 0) {
        return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
      }
      if (count < limit && guard < MAX_TUNE_STEPS) {
        while (count < limit && guard < MAX_TUNE_STEPS) {
          const nextLevel = startLevelNum + count;
          let nextCost;
          try {
            if (Number.isFinite(nextLevel) && nextLevel < Number.MAX_SAFE_INTEGER / 2) {
              nextCost = BigNum.fromAny(upg.costAtLevel(nextLevel));
            } else {
              const nextLog = startPriceLog + count * ratioLog10;
              nextCost = bigNumFromLog102(nextLog).floorToInteger();
            }
          } catch {
            break;
          }
          const newSpent = spent.add(nextCost);
          if (newSpent.cmp(walletBn) > 0) {
            break;
          }
          spent = newSpent;
          count += 1;
          guard += 1;
        }
      }
    }
    let nextPrice = zero;
    const canUseNumericFinal = !fastOnly && Number.isFinite(startLevelNum) && Number.isFinite(count) && startLevelNum < Number.MAX_SAFE_INTEGER / 2 && count < Number.MAX_SAFE_INTEGER / 2;
    if (!fastOnly) {
      if (Number.isFinite(cap)) {
        const capRoom2 = Math.max(0, Math.floor(cap - Math.min(startLevelNum, cap)));
        if (count >= capRoom2) {
          nextPrice = zero;
        } else if (canUseNumericFinal) {
          const finalLevel = Math.floor(startLevelNum + count);
          nextPrice = BigNum.fromAny(upg.costAtLevel(finalLevel));
        } else {
          const nextLog = startPriceLog + count * ratioLog10;
          nextPrice = bigNumFromLog102(nextLog);
        }
      } else {
        if (canUseNumericFinal) {
          const finalLevel = Math.floor(startLevelNum + count);
          nextPrice = BigNum.fromAny(upg.costAtLevel(finalLevel));
        } else {
          const nextLog = startPriceLog + count * ratioLog10;
          nextPrice = bigNumFromLog102(nextLog);
        }
      }
    }
    const countBn = countToBigNum(count);
    return {
      count: countBn,
      spent,
      nextPrice,
      numericCount: count
    };
  }
  function computeBulkMeta(upg) {
    try {
      const basePrice = BigNum.fromAny(upg.costAtLevel(0));
      const nextPrice = BigNum.fromAny(
        typeof upg.nextCostAfter === "function" ? upg.nextCostAfter(basePrice, 1) : upg.costAtLevel(1)
      );
      const logBase = approxLog10BigNum(basePrice);
      const logNext = approxLog10BigNum(nextPrice);
      if (!Number.isFinite(logBase) || !Number.isFinite(logNext)) return null;
      const ratioLog = logNext - logBase;
      if (!Number.isFinite(ratioLog) || ratioLog <= 0) return null;
      const ratio = Math.pow(10, ratioLog);
      if (!Number.isFinite(ratio) || ratio <= 1) return null;
      const denom = ratio - 1;
      if (!(denom > 0) || !Number.isFinite(denom)) return null;
      return {
        ratio,
        ratioLog,
        logDenom: Math.log10(denom)
      };
    } catch {
      return null;
    }
  }
  function estimateFlatBulk(priceBn, walletBn, roomBn) {
    if (!(priceBn instanceof BigNum)) priceBn = BigNum.fromAny(priceBn ?? 0);
    if (!(walletBn instanceof BigNum)) walletBn = BigNum.fromAny(walletBn ?? 0);
    if (!(roomBn instanceof BigNum)) roomBn = BigNum.fromAny(roomBn ?? 0);
    if (priceBn.isZero?.()) return { count: 0 };
    if (walletBn.isZero?.()) return { count: 0 };
    const wPlain = walletBn.toPlainIntegerString?.();
    const pPlain = priceBn.toPlainIntegerString?.();
    if (wPlain && wPlain !== "Infinity" && pPlain && pPlain !== "Infinity") {
      const q = BigInt(wPlain) / BigInt(pPlain);
      let countBn2 = BigNum.fromAny(q.toString());
      if (!roomBn.isInfinite?.() && countBn2.cmp(roomBn) > 0) countBn2 = roomBn;
      const spent2 = priceBn.mulBigNumInteger(countBn2);
      return { count: levelCapToNumber(countBn2), countBn: countBn2, spent: spent2, nextPrice: priceBn };
    }
    const wl = approxLog10BigNum(walletBn);
    const pl = approxLog10BigNum(priceBn);
    if (!Number.isFinite(wl) || !Number.isFinite(pl) || wl < pl) return { count: 0 };
    let countBn = bigNumFromLog102(wl - pl).floorToInteger();
    if (!roomBn.isInfinite?.() && countBn.cmp(roomBn) > 0) countBn = roomBn;
    const spent = priceBn.mulBigNumInteger(countBn);
    const nextPrice = priceBn;
    return { count: levelCapToNumber(countBn), countBn, spent, nextPrice };
  }
  function estimateGeometricBulk(priceBn, walletBn, meta, maxLevels) {
    if (!meta || maxLevels <= 0) return { count: 0 };
    const walletLog = approxLog10BigNum(walletBn);
    const priceLog = approxLog10BigNum(priceBn);
    if (!Number.isFinite(walletLog) || !Number.isFinite(priceLog)) return { count: 0 };
    if (walletLog < priceLog) return { count: 0 };
    const numerator = walletLog - priceLog + meta.logDenom;
    if (!Number.isFinite(numerator) || numerator <= 0) return { count: 0 };
    let hi = Math.floor(numerator / meta.ratioLog);
    if (!Number.isFinite(hi) || hi <= 0) return { count: 0 };
    hi = Math.min(hi, maxLevels);
    if (hi <= 0) return { count: 0 };
    let lo = 0;
    let hiBound = hi;
    for (let iter = 0; iter < 64 && lo < hiBound; iter += 1) {
      const mid = Math.max(0, Math.floor((lo + hiBound + 1) / 2));
      const spentLog2 = priceLog + mid * meta.ratioLog - meta.logDenom;
      if (spentLog2 <= walletLog) {
        lo = mid;
      } else {
        hiBound = mid - 1;
      }
    }
    const best = Math.min(lo, maxLevels);
    if (best <= 0) return { count: 0 };
    const spentLog = priceLog + best * meta.ratioLog - meta.logDenom;
    if (spentLog > walletLog) return { count: 0 };
    const nextPriceLog = priceLog + best * meta.ratioLog;
    const spent = bigNumFromLog102(spentLog);
    const nextPrice = bigNumFromLog102(nextPriceLog);
    return {
      count: best,
      spent,
      nextPrice,
      spentLog,
      nextPriceLog
    };
  }
  function toUpgradeBigNum(value, fallback) {
    try {
      return BigNum.fromAny(value ?? fallback ?? 0);
    } catch {
      return BigNum.fromAny(fallback ?? 0);
    }
  }
  function levelCapToNumber(bn) {
    if (!(bn instanceof BigNum)) return Infinity;
    if (bn.isInfinite?.()) return Infinity;
    try {
      const plain = bn.toPlainIntegerString();
      if (plain === "Infinity") return Infinity;
      if (!plain) return 0;
      if (plain.length > 15) return Number.MAX_SAFE_INTEGER;
      const num = Number(plain);
      if (!Number.isFinite(num)) return Number.MAX_SAFE_INTEGER;
      return Math.max(0, Math.floor(num));
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  function formatBigNumAsHtml(bn) {
    return formatNumber(bn instanceof BigNum ? bn : BigNum.fromAny(bn ?? 0));
  }
  function formatMultForUi(value) {
    try {
      if (value && (value instanceof BigNum || value.toPlainIntegerString)) {
        const log10 = approxLog10BigNum(value);
        if (Number.isFinite(log10) && log10 < 3) {
          const approx = Math.pow(10, log10);
          return String(approx.toFixed(3)).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
        }
        return formatNumber(value);
      }
      const n = Number(value) || 0;
      if (Math.abs(n) < 1e3) {
        return String(n.toFixed(3)).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
      }
      return formatNumber(n);
    } catch {
      return "1";
    }
  }
  function formatBigNumAsPlain(bn) {
    return formatBigNumAsHtml(bn).replace(/<[^>]*>/g, "");
  }
  function safeCloneBigNum(value) {
    if (value instanceof BigNum) {
      try {
        return value.clone?.() ?? BigNum.fromAny(value);
      } catch {
        return BigNum.fromInt(0);
      }
    }
    try {
      return BigNum.fromAny(value ?? 0);
    } catch {
      return BigNum.fromInt(0);
    }
  }
  function emitUpgradeLevelChange(upg, prevLevelNum, prevLevelBn, nextLevelNum, nextLevelBn) {
    if (!upg || typeof upg.onLevelChange !== "function") return;
    const oldBn = safeCloneBigNum(prevLevelBn ?? prevLevelNum ?? 0);
    const newBn = safeCloneBigNum(nextLevelBn ?? nextLevelNum ?? 0);
    const payload = {
      upgrade: upg,
      oldLevel: Number.isFinite(prevLevelNum) ? prevLevelNum : levelBigNumToNumber2(oldBn),
      newLevel: Number.isFinite(nextLevelNum) ? nextLevelNum : levelBigNumToNumber2(newBn),
      oldLevelBn: oldBn,
      newLevelBn: newBn
    };
    try {
      upg.onLevelChange(payload);
    } catch {
    }
  }
  function nmCostBN(upg, level) {
    return costAtLevelUsingScaling(upg, level);
  }
  function syncBookCurrencyMultiplierFromUpgrade(levelOverride) {
    const multHandle = bank?.books?.mult;
    if (!multHandle || typeof multHandle.set !== "function") return;
    let resolvedLevel = 0;
    const xpUnlocked = safeIsXpUnlocked();
    if (xpUnlocked) {
      if (Number.isFinite(levelOverride)) {
        resolvedLevel = Math.max(0, Math.floor(levelOverride));
      } else {
        const storedLevel = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.BOOK_VALUE_I);
        resolvedLevel = Math.max(0, Number.isFinite(storedLevel) ? storedLevel : 0);
      }
    }
    let multiplier;
    try {
      multiplier = bookValueMultiplierBn(resolvedLevel);
    } catch {
      multiplier = BigNum.fromInt(1);
    }
    try {
      multHandle.set(multiplier.clone?.() ?? multiplier);
    } catch {
    }
  }
  function getAreaUpgradeOrder(areaKey) {
    const normalizedArea = normalizeAreaKey(areaKey);
    if (!normalizedArea) return null;
    if (areaUpgradeOrderCache.has(normalizedArea)) {
      return areaUpgradeOrderCache.get(normalizedArea);
    }
    const order = /* @__PURE__ */ new Map();
    let rank = 0;
    for (const upg of REGISTRY) {
      if (normalizeAreaKey(upg?.area) !== normalizedArea) continue;
      const normalizedId = normalizeUpgradeId(upg?.id);
      if (normalizedId == null || order.has(normalizedId)) continue;
      order.set(normalizedId, rank);
      rank += 1;
    }
    areaUpgradeOrderCache.set(normalizedArea, order);
    return order;
  }
  function normalizeAreaStateRecordOrder(areaKey, arr) {
    if (!Array.isArray(arr) || arr.length <= 1) return false;
    const order = getAreaUpgradeOrder(areaKey);
    if (!order?.size) return false;
    const baseRank = order.size;
    const entries = arr.map((rec, idx) => {
      const normalizedId = normalizeUpgradeId(rec?.id);
      const rank = order.has(normalizedId) ? order.get(normalizedId) : baseRank + idx;
      return { rec, rank, idx };
    });
    let needsSort = false;
    for (let i = 1; i < entries.length; i += 1) {
      const prev = entries[i - 1];
      const curr = entries[i];
      if (curr.rank < prev.rank || curr.rank === prev.rank && curr.idx < prev.idx) {
        needsSort = true;
        break;
      }
    }
    if (!needsSort) return false;
    entries.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
    arr.length = 0;
    for (const entry of entries) arr.push(entry.rec);
    return true;
  }
  function parseUpgradeStateArray(raw) {
    if (typeof raw !== "string" || !raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  function readStateFromAvailableStorage(key, options = {}) {
    const {
      includeLocal = true
    } = options || {};
    const result = {
      data: null,
      raw: null,
      storageChecked: false,
      storageFound: false,
      checkedLocal: false,
      foundLocal: false,
      sourceType: null
    };
    if (!key) return result;
    const storages = [];
    try {
      if (includeLocal && typeof localStorage !== "undefined") {
        storages.push({ storage: localStorage, type: "local" });
        result.storageChecked = true;
        result.checkedLocal = true;
      }
    } catch {
    }
    for (const entry of storages) {
      const { storage, type } = entry || {};
      const getItem = storage?.getItem;
      if (typeof getItem !== "function") continue;
      let raw;
      try {
        raw = getItem.call(storage, key);
      } catch {
        raw = null;
      }
      if (raw != null) {
        result.storageFound = true;
        if (type === "local") result.foundLocal = true;
      }
      const parsed = parseUpgradeStateArray(raw);
      if (parsed) {
        const payload = typeof raw === "string" && raw ? raw : (() => {
          try {
            return JSON.stringify(parsed);
          } catch {
            return null;
          }
        })();
        result.data = parsed;
        result.raw = payload;
        result.sourceType = type;
        return result;
      }
    }
    return result;
  }
  function cacheAreaState(key, arr, raw) {
    if (!key) return;
    if (Array.isArray(arr)) {
      areaStateMemoryCache.set(key, arr);
    }
    if (typeof raw === "string") {
      areaStatePayloadCache.set(key, raw);
    }
  }
  function clearCachedAreaState(storageKey) {
    if (!storageKey) return;
    areaStateMemoryCache.delete(storageKey);
    areaStatePayloadCache.delete(storageKey);
  }
  function clearCachedUpgradeStates(areaKey, slot) {
    const slotKey2 = slot == null ? "null" : String(slot);
    const prefix = `${slotKey2}:${areaKey}:`;
    for (const key of upgradeStateCache.keys()) {
      if (key.startsWith(prefix)) {
        upgradeStateCache.delete(key);
      }
    }
  }
  function keyForArea(areaKey, slot = getActiveSlot()) {
    if (slot == null) return null;
    return `ccc:upgrades:${areaKey}:${slot}`;
  }
  function cleanupUpgradeStorageWatchers() {
    upgradeStorageWatcherCleanup.forEach((stop) => {
      try {
        stop?.();
      } catch {
      }
    });
    upgradeStorageWatcherCleanup.clear();
  }
  function handleUpgradeStorageChange(areaKey, slot, storageKey, rawPayload, meta = {}) {
    if (!storageKey) return;
    const { rawChanged, valueChanged } = meta;
    if (!rawChanged && !valueChanged) return;
    try {
      if (typeof rawPayload === "string") {
        const arr = parseUpgradeStateArray(rawPayload);
        if (arr) {
          cacheAreaState(storageKey, arr, rawPayload);
        } else {
          clearCachedAreaState(storageKey);
        }
      } else {
        clearCachedAreaState(storageKey);
      }
    } catch {
      clearCachedAreaState(storageKey);
    }
    clearCachedUpgradeStates(areaKey, slot);
    notifyChanged();
  }
  function bindUpgradeStorageWatchersForSlot(slot) {
    if (slot === upgradeStorageWatcherBoundSlot) return;
    cleanupUpgradeStorageWatchers();
    upgradeStorageWatcherBoundSlot = slot ?? null;
    if (slot == null) return;
    for (const areaKey of Object.values(AREA_KEYS)) {
      const storageKey = keyForArea(areaKey, slot);
      if (!storageKey) continue;
      const stop = watchStorageKey(storageKey, {
        parse: (raw) => typeof raw === "string" ? raw : null,
        onChange: (rawPayload, meta) => {
          if (!meta?.rawChanged && !meta?.valueChanged) return;
          handleUpgradeStorageChange(areaKey, slot, storageKey, rawPayload, meta);
        }
      });
      upgradeStorageWatcherCleanup.set(storageKey, stop);
    }
  }
  function loadAreaState(areaKey, slot = getActiveSlot(), options = {}) {
    const { forceReload = false } = options || {};
    const storageKey = keyForArea(areaKey, slot);
    if (!storageKey) return [];
    const backupKey = `${storageKey}:backup`;
    const primary = readStateFromAvailableStorage(storageKey, {
      includeLocal: true
    });
    const backup = readStateFromAvailableStorage(backupKey, {
      includeLocal: true
    });
    if (primary.storageChecked && !primary.storageFound && backup.data) {
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(backupKey);
        }
      } catch {
      }
      clearCachedAreaState(storageKey);
      clearCachedUpgradeStates(areaKey, slot);
      return [];
    }
    if (primary.data) {
      const normalized = normalizeAreaStateRecordOrder(areaKey, primary.data);
      if (normalized) {
        saveAreaState(areaKey, primary.data, slot);
      } else {
        cacheAreaState(storageKey, primary.data, primary.raw);
      }
      if (backup.storageFound) {
        try {
          if (typeof localStorage !== "undefined") {
            localStorage.removeItem(backupKey);
          }
        } catch {
        }
      }
      return primary.data;
    }
    if (backup.data) {
      const normalized = normalizeAreaStateRecordOrder(areaKey, backup.data);
      if (normalized) {
        saveAreaState(areaKey, backup.data, slot);
      } else {
        cacheAreaState(storageKey, backup.data, backup.raw);
      }
      try {
        if (typeof localStorage !== "undefined") {
          const backupPayload = backup.raw ?? JSON.stringify(backup.data);
          localStorage.setItem(storageKey, backupPayload);
          localStorage.removeItem(backupKey);
        }
      } catch {
      }
      return backup.data;
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(backupKey);
      }
    } catch {
    }
    const storagesChecked = primary.storageChecked || backup.storageChecked;
    const storageHadValue = primary.storageFound || backup.storageFound;
    if (!forceReload && !storagesChecked) {
      const cached = areaStateMemoryCache.get(storageKey);
      if (Array.isArray(cached)) {
        normalizeAreaStateRecordOrder(areaKey, cached);
        return cached;
      }
      const cachedPayload = areaStatePayloadCache.get(storageKey);
      const parsed = parseUpgradeStateArray(cachedPayload);
      if (parsed) {
        const normalized = normalizeAreaStateRecordOrder(areaKey, parsed);
        if (normalized) {
          saveAreaState(areaKey, parsed, slot);
        } else {
          cacheAreaState(storageKey, parsed, cachedPayload);
        }
        return parsed;
      }
    }
    if (!storageHadValue) {
      clearCachedAreaState(storageKey);
      clearCachedUpgradeStates(areaKey, slot);
    }
    return [];
  }
  function saveAreaState(areaKey, stateArr, slot = getActiveSlot()) {
    const storageKey = keyForArea(areaKey, slot);
    if (!storageKey) return;
    const arr = Array.isArray(stateArr) ? stateArr : [];
    normalizeAreaStateRecordOrder(areaKey, arr);
    let payload = null;
    try {
      payload = JSON.stringify(arr);
    } catch {
      try {
        payload = JSON.stringify([]);
      } catch {
        payload = "[]";
      }
    }
    cacheAreaState(storageKey, arr, payload);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(storageKey, payload);
        try {
          primeStorageWatcherSnapshot(storageKey, payload);
        } catch {
        }
      }
    } catch {
    }
    try {
      const verify = localStorage.getItem(storageKey);
      if (verify !== payload) {
        localStorage.setItem(storageKey, payload);
        try {
          primeStorageWatcherSnapshot(storageKey, payload);
        } catch {
        }
      }
    } catch {
    }
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`${storageKey}:backup`);
      }
    } catch {
    }
  }
  function resolveUpgradeIdentifier(areaKey, upgId) {
    if (upgId && typeof upgId === "object" && typeof upgId.id !== "undefined") {
      return normalizeUpgradeId(upgId.id);
    }
    const normalized = normalizeUpgradeId(upgId);
    if (typeof normalized === "number" || normalized == null) {
      return normalized;
    }
    if (typeof normalized === "string") {
      const tieKey = normalizeUpgradeTie(normalized);
      if (tieKey) {
        const upg = upgradeTieLookup.get(tieKey);
        if (upg) {
          const requestedArea = normalizeAreaKey(areaKey);
          if (!requestedArea || normalizeAreaKey(upg.area) === requestedArea) {
            return normalizeUpgradeId(upg.id);
          }
        }
      }
    }
    return normalized;
  }
  function upgradeCacheKey(areaKey, upgId, slot = getActiveSlot()) {
    const slotKey2 = slot == null ? "null" : String(slot);
    const resolvedId = resolveUpgradeIdentifier(areaKey, upgId);
    return `${slotKey2}:${areaKey}:${normalizeUpgradeId(resolvedId)}`;
  }
  function ensureUpgradeState(areaKey, upgId) {
    const resolvedId = resolveUpgradeIdentifier(areaKey, upgId);
    const normalizedId = normalizeUpgradeId(resolvedId);
    const slot = getActiveSlot();
    const key = upgradeCacheKey(areaKey, normalizedId, slot);
    let state = upgradeStateCache.get(key);
    if (state) return state;
    const upg = getUpgrade(areaKey, normalizedId);
    const arr = loadAreaState(areaKey, slot);
    let rec = arr.find((u) => u && normalizeUpgradeId(u.id) === normalizedId);
    let recNeedsSave = false;
    if (!rec) {
      rec = { id: normalizedId, lvl: BigNum.fromInt(0).toStorage() };
      if (upg) {
        try {
          rec.nextCost = BigNum.fromAny(upg.costAtLevel(0)).toStorage();
        } catch {
          rec.nextCost = BigNum.fromInt(0).toStorage();
        }
      }
      rec.nextCostLvl = rec.lvl;
      arr.push(rec);
      saveAreaState(areaKey, arr, slot);
    } else if (rec.id !== normalizedId) {
      rec.id = normalizedId;
      recNeedsSave = true;
    }
    let hmEvolutions = 0;
    if (upg?.upgType === "HM") {
      hmEvolutions = normalizeHmEvolutionCount(
        rec.hmEvolutions ?? rec.evolutions ?? rec.evol ?? upg.numUpgEvolutions
      );
      applyHmEvolutionMeta(upg, hmEvolutions);
    }
    const lvlBn = ensureLevelBigNum(rec.lvl);
    let lvl = levelBigNumToNumber2(lvlBn);
    try {
      const capBn = upg?.lvlCapBn ?? BigNum.fromAny("Infinity");
      if (!capBn.isInfinite?.() && lvlBn.cmp(capBn) > 0) {
        const clamped = capBn.clone?.() ?? capBn;
        lvl = levelBigNumToNumber2(clamped);
        const clampedStorage = clamped.toStorage();
        rec.lvl = clampedStorage;
        rec.nextCost = BigNum.fromInt(0).toStorage();
        rec.nextCostLvl = clampedStorage;
        saveAreaState(areaKey, arr, slot);
      }
    } catch {
    }
    let normalizedLvlStorage = null;
    try {
      normalizedLvlStorage = lvlBn?.toStorage?.() ?? ensureLevelBigNum(lvl).toStorage();
    } catch {
    }
    if (normalizedLvlStorage && rec.lvl !== normalizedLvlStorage) {
      rec.lvl = normalizedLvlStorage;
      recNeedsSave = true;
    }
    const costLevelStorage = typeof rec.nextCostLvl === "string" ? rec.nextCostLvl : null;
    let nextCostStale = !costLevelStorage || costLevelStorage !== normalizedLvlStorage;
    let nextCostBn = null;
    if (!nextCostStale && rec.nextCost != null) {
      try {
        nextCostBn = BigNum.fromAny(rec.nextCost);
      } catch {
        nextCostBn = null;
        nextCostStale = true;
      }
    }
    if (!nextCostBn || nextCostStale) {
      if (upg) {
        try {
          nextCostBn = BigNum.fromAny(upg.costAtLevel(lvl));
        } catch {
          nextCostBn = BigNum.fromInt(0);
        }
      } else {
        nextCostBn = BigNum.fromInt(0);
      }
      try {
        rec.nextCost = nextCostBn.toStorage();
        if (normalizedLvlStorage) {
          rec.nextCostLvl = normalizedLvlStorage;
        } else {
          delete rec.nextCostLvl;
        }
        recNeedsSave = true;
      } catch {
      }
    }
    if (recNeedsSave) {
      try {
        saveAreaState(areaKey, arr, slot);
      } catch {
      }
    }
    if (upg?.upgType === "HM" && lvlBn?.isInfinite?.()) {
      if (!upg.lvlCapBn?.isInfinite?.()) {
        const infCap = BigNum.fromAny("Infinity");
        upg.lvlCapBn = infCap;
        upg.lvlCap = Number.POSITIVE_INFINITY;
        upg.lvlCapFmtHtml = formatBigNumAsHtml(infCap);
        upg.lvlCapFmtText = formatBigNumAsPlain(infCap);
      }
    }
    state = { areaKey, upgId: normalizedId, upg, rec, arr, lvl, lvlBn, nextCostBn, slot, hmEvolutions };
    upgradeStateCache.set(key, state);
    return state;
  }
  function commitUpgradeState(state) {
    if (!state) return;
    const { areaKey } = state;
    const slot = state.slot ?? getActiveSlot();
    if (!areaKey || slot == null) return;
    const normalizedId = normalizeUpgradeId(state.upgId ?? state.rec?.id);
    let arr = loadAreaState(areaKey, slot, { forceReload: true });
    if (!Array.isArray(arr)) arr = [];
    let rec = arr.find((u) => u && normalizeUpgradeId(u.id) === normalizedId);
    if (!rec) {
      rec = { id: normalizedId };
      arr.push(rec);
    } else if (rec.id !== normalizedId) {
      rec.id = normalizedId;
    }
    try {
      const capBn = state.upg?.lvlCapBn ?? BigNum.fromAny("Infinity");
      let inBn = state.lvlBn?.clone?.() ?? ensureLevelBigNum(state.lvlBn ?? state.lvl);
      if (!capBn.isInfinite?.() && inBn.cmp(capBn) > 0) {
        inBn = capBn.clone?.() ?? capBn;
        state.lvlBn = inBn;
        state.lvl = levelBigNumToNumber2(inBn);
      }
    } catch {
    }
    try {
      rec.lvl = state.lvlBn?.toStorage?.() ?? ensureLevelBigNum(state.lvlBn ?? state.lvl).toStorage();
    } catch {
      rec.lvl = ensureLevelBigNum(state.lvl ?? 0).toStorage();
    }
    const currentLvlStorage = rec.lvl;
    if (state.nextCostBn != null) {
      try {
        rec.nextCost = BigNum.fromAny(state.nextCostBn).toStorage();
      } catch {
        try {
          rec.nextCost = BigNum.fromAny(state.nextCostBn ?? 0).toStorage();
        } catch {
          rec.nextCost = BigNum.fromInt(0).toStorage();
        }
      }
      rec.nextCostLvl = currentLvlStorage;
    } else {
      delete rec.nextCostLvl;
    }
    if (state.hmEvolutions != null) {
      rec.hmEvolutions = normalizeHmEvolutionCount(state.hmEvolutions);
    }
    saveAreaState(areaKey, arr, slot);
    state.rec = rec;
    state.arr = arr;
    state.slot = slot;
  }
  function invalidateUpgradeState(areaKey, upgId, slot = getActiveSlot()) {
    upgradeStateCache.delete(upgradeCacheKey(areaKey, upgId, slot));
  }
  function getLevelNumber(areaKey, upgId) {
    return ensureUpgradeState(areaKey, upgId).lvl;
  }
  function getHmEvolutions(areaKey, upgId) {
    return ensureUpgradeState(areaKey, upgId).hmEvolutions ?? 0;
  }
  function getMpValueMultiplierBn() {
    let mult = hundredPercentPerLevelMultiplier(
      getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.MP_VALUE_I)
    );
    try {
      const hmUpg = getUpgrade(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
      const hmLvl = getLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
      const { mpMult } = computeHmMultipliers(hmUpg, hmLvl, AREA_KEYS.STARTER_COVE);
      mult = safeMultiplyBigNum(mult, mpMult);
    } catch {
    }
    return mult;
  }
  function getMagnetLevel() {
    const lvl = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.MAGNET);
    if (!Number.isFinite(lvl)) {
      return 0;
    }
    return Math.max(0, Math.floor(lvl));
  }
  function computeUpgradeLockStateFor(areaKey, upg) {
    if (!upg) return { locked: false };
    const xpUnlocked = safeIsXpUnlocked();
    const xpLevelBn = xpUnlocked ? currentXpLevelBigNum() : BigNum.fromInt(0);
    const xpLevel = xpUnlocked ? levelBigNumToNumber2(xpLevelBn) : 0;
    let baseState = { locked: false };
    if (upg.requiresUnlockXp && !xpUnlocked) {
      const isXpAdj = isXpAdjacentUpgrade(areaKey, upg);
      const xpRevealText = "Unlock the XP system to reveal this upgrade";
      const unlockXpVisible = safeHasMetMerchant();
      if (isXpAdj) {
        if (!unlockXpVisible) {
          const meetText = 'Meet the Merchant to reveal "Unlock XP"';
          baseState = {
            locked: true,
            iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
            titleOverride: LOCKED_UPGRADE_TITLE,
            descOverride: meetText,
            reason: meetText,
            hidden: false,
            hideCost: false,
            hideEffect: false,
            useLockedBase: true
          };
        } else {
          baseState = {
            locked: true,
            iconOverride: MYSTERIOUS_UPGRADE_ICON_DATA_URL,
            titleOverride: HIDDEN_UPGRADE_TITLE,
            descOverride: xpRevealText,
            reason: xpRevealText,
            hidden: true,
            hideCost: true,
            hideEffect: true,
            useLockedBase: true
          };
        }
      } else {
        baseState = {
          locked: true,
          iconOverride: LOCKED_UPGRADE_ICON_DATA_URL,
          titleOverride: LOCKED_UPGRADE_TITLE,
          descOverride: xpRevealText,
          reason: 'Purchase "Unlock XP" to reveal this upgrade',
          hidden: false,
          hideCost: false,
          hideEffect: false,
          useLockedBase: true
        };
      }
    }
    let state = mergeLockStates({ locked: false }, baseState);
    if (typeof upg.computeLockState === "function") {
      try {
        const ctx = {
          areaKey,
          upg,
          xpUnlocked,
          xpLevelBn,
          xpLevel,
          baseLocked: state.locked,
          getUpgradeLevel(targetId) {
            return getLevelNumber(areaKey, targetId);
          }
        };
        const custom = upg.computeLockState(ctx);
        state = mergeLockStates(state, custom);
      } catch {
      }
    }
    const slot = getActiveSlot();
    const revealKey = upgradeRevealKey(areaKey, upg);
    const permaUnlocked = revealKey ? isUpgradePermanentlyUnlocked(areaKey, upg, slot) : false;
    if (revealKey) {
      const revealState = ensureShopRevealState(slot);
      const permaState = ensureShopPermaUnlockState(slot);
      const permaMystState = ensureShopPermaMystState(slot);
      const hyphenKey = revealKey.replace(/_/g, "-");
      const legacyKey = upgradeLegacyRevealKey(areaKey, upg);
      let needsRevealSave = false;
      if (migrateUpgradeStateKey(revealState, hyphenKey, revealKey)) {
        needsRevealSave = true;
      }
      if (legacyKey && migrateUpgradeStateKey(revealState, legacyKey, revealKey)) {
        needsRevealSave = true;
      }
      if (needsRevealSave) {
        saveShopRevealState(revealState, slot);
      }
      let needsPermaSave = false;
      if (migrateUpgradeStateKey(permaState, hyphenKey, revealKey)) {
        needsPermaSave = true;
      }
      if (legacyKey && migrateUpgradeStateKey(permaState, legacyKey, revealKey)) {
        needsPermaSave = true;
      }
      if (needsPermaSave) {
        saveShopPermaUnlockState(permaState, slot);
      }
      let needsPermaMystSave = false;
      if (migrateUpgradeStateKey(permaMystState, hyphenKey, revealKey)) {
        needsPermaMystSave = true;
      }
      if (legacyKey && migrateUpgradeStateKey(permaMystState, legacyKey, revealKey)) {
        needsPermaMystSave = true;
      }
      if (needsPermaMystSave) {
        saveShopPermaMystState(permaMystState, slot);
      }
    }
    if (state.locked) {
      const hiddenState = !!state.hidden;
      if (!state.iconOverride) state.iconOverride = LOCKED_UPGRADE_ICON_DATA_URL;
      if (hiddenState) {
        if (!state.titleOverride) state.titleOverride = HIDDEN_UPGRADE_TITLE;
      } else if (!state.titleOverride || state.titleOverride === HIDDEN_UPGRADE_TITLE) {
        state.titleOverride = LOCKED_UPGRADE_TITLE;
      }
      if (state.useLockedBase == null) state.useLockedBase = true;
      if (!state.reason && upg?.revealRequirement) state.reason = upg.revealRequirement;
      if (!state.descOverride) {
        if (state.reason) {
          state.descOverride = `${state.reason}`;
        } else if (upg?.revealRequirement) {
          state.descOverride = upg.revealRequirement;
        } else if (hiddenState) {
          state.descOverride = "This upgrade is currently hidden.";
        }
      }
    } else {
      state.hidden = false;
      state.hideCost = false;
      state.hideEffect = false;
      state.useLockedBase = false;
      if (state.iconOverride === LOCKED_UPGRADE_ICON_DATA_URL || state.iconOverride === MYSTERIOUS_UPGRADE_ICON_DATA_URL) {
        delete state.iconOverride;
      }
      if (state.titleOverride === HIDDEN_UPGRADE_TITLE || state.titleOverride === LOCKED_UPGRADE_TITLE) {
        delete state.titleOverride;
      }
      delete state.descOverride;
      delete state.reason;
    }
    if (state.locked && upg.requiresUnlockXp && !xpUnlocked && !state.iconOverride) {
      state.iconOverride = LOCKED_UPGRADE_ICON_DATA_URL;
    }
    if (revealKey) {
      const revealState = ensureShopRevealState(slot);
      const rec = revealState.upgrades[revealKey] || {};
      const tieKey = normalizeUpgradeTie(upg?.tie ?? upg?.tieKey);
      const isForgePlaceholder = tieKey && FORGE_PLACEHOLDER_TIES.has(tieKey);
      let storedStatus = rec.status || "locked";
      if (isUpgradePermanentlyUnlocked(areaKey, upg, slot)) {
        storedStatus = "unlocked";
      } else if (isUpgradePermanentlyMysterious(areaKey, upg, slot) && storedStatus === "locked") {
        let xpReached31 = false;
        try {
          xpReached31 = levelBigNumToNumber2(currentXpLevelBigNum()) >= 31;
        } catch {
        }
        storedStatus = isForgePlaceholder && !xpReached31 ? "locked" : "mysterious";
      }
      let storedRank = shopStatusRank(storedStatus);
      let currentStatus = classifyUpgradeStatus(state);
      let currentRank = shopStatusRank(currentStatus);
      const applyStoredMysterious = () => {
        state.locked = true;
        const snap = rec.snapshot;
        if (snap && typeof snap === "object") {
          state = mergeLockStates(state, snap);
        }
        state.iconOverride = MYSTERIOUS_UPGRADE_ICON_DATA_URL;
        state.titleOverride = HIDDEN_UPGRADE_TITLE;
        const reasonText = upg?.revealRequirement || state.reason || state.descOverride || "This upgrade is currently hidden.";
        state.descOverride = reasonText;
        if (!state.reason && upg?.revealRequirement) state.reason = upg.revealRequirement;
        state.hidden = true;
        state.hideCost = true;
        state.hideEffect = true;
        state.useLockedBase = true;
      };
      if (storedRank > currentRank) {
        if (storedStatus === "unlocked") {
          state.locked = false;
          state.hidden = false;
          state.hideCost = false;
          state.hideEffect = false;
          state.useLockedBase = false;
        } else if (storedStatus === "mysterious") {
          applyStoredMysterious();
        }
        currentStatus = classifyUpgradeStatus(state);
        currentRank = shopStatusRank(currentStatus);
      }
      let shouldSave = false;
      let normalizedStatus = rec && typeof rec === "object" && typeof rec.status === "string" ? rec.status : "locked";
      const isForgePlaceholderForSave = isForgePlaceholder;
      let xpReached31Now = false;
      try {
        xpReached31Now = levelBigNumToNumber2(currentXpLevelBigNum()) >= 31;
      } catch {
      }
      if (isForgePlaceholderForSave && !xpReached31Now && normalizedStatus === "mysterious") {
        normalizedStatus = "locked";
      }
      if (!rec || typeof rec !== "object" || Object.keys(rec).length !== 1 || rec.status !== normalizedStatus) {
        revealState.upgrades[revealKey] = { status: normalizedStatus };
        shouldSave = true;
      }
      if (currentRank > storedRank) {
        rec.status = currentStatus;
        revealState.upgrades[revealKey] = { status: rec.status };
        shouldSave = true;
        storedStatus = currentStatus;
        storedRank = currentRank;
        if (currentStatus === "unlocked") {
          markUpgradePermanentlyUnlocked(areaKey, upg, slot);
        } else if (currentStatus === "mysterious") {
          let xpReached31 = false;
          try {
            xpReached31 = levelBigNumToNumber2(currentXpLevelBigNum()) >= 31;
          } catch {
          }
          if (!isForgePlaceholder || xpReached31) {
            markUpgradePermanentlyMysterious(areaKey, upg, slot);
          }
        }
      }
      if (storedStatus === "unlocked") {
        state.locked = false;
        state.hidden = false;
        state.hideCost = false;
        state.hideEffect = false;
        state.useLockedBase = false;
        if (state.iconOverride === LOCKED_UPGRADE_ICON_DATA_URL || state.iconOverride === MYSTERIOUS_UPGRADE_ICON_DATA_URL) {
          delete state.iconOverride;
        }
        if (state.titleOverride === HIDDEN_UPGRADE_TITLE || state.titleOverride === LOCKED_UPGRADE_TITLE) {
          delete state.titleOverride;
        }
        delete state.descOverride;
        delete state.reason;
        if (rec.status !== "unlocked") {
          revealState.upgrades[revealKey] = { status: "unlocked" };
          shouldSave = true;
        }
        markUpgradePermanentlyUnlocked(areaKey, upg, slot);
      } else if (storedStatus === "mysterious" && currentStatus !== "mysterious") {
        applyStoredMysterious();
        currentStatus = classifyUpgradeStatus(state);
        currentRank = shopStatusRank(currentStatus);
      }
      if (shouldSave) saveShopRevealState(revealState, slot);
    }
    return state;
  }
  function isUpgradeLocked(areaKey, upg) {
    return !!computeUpgradeLockStateFor(areaKey, upg).locked;
  }
  function isHmReadyToEvolve(upg, lvlBn, evolutions = null) {
    if (!upg || upg.upgType !== "HM") return false;
    if (lvlBn?.isInfinite?.()) return false;
    const safeEvol = Number.isFinite(evolutions) ? evolutions : activeEvolutionsForUpgrade(upg);
    const { capBn, cap } = hmLevelCapForEvolutions(safeEvol);
    try {
      return lvlBn?.cmp?.(capBn) >= 0;
    } catch {
    }
    const lvlNum = levelBigNumToNumber2(lvlBn);
    return Number.isFinite(lvlNum) && lvlNum >= cap;
  }
  function getLevel(areaKey, upgId) {
    const state = ensureUpgradeState(areaKey, upgId);
    if (state.lvlBn?.clone) return state.lvlBn.clone();
    return ensureLevelBigNum(state.lvl ?? 0);
  }
  function peekNextPrice(areaKey, upgId) {
    const state = ensureUpgradeState(areaKey, upgId);
    const upg = state.upg;
    if (!upg) return BigNum.fromInt(0);
    if (state.nextCostBn && !state.nextCostBn.isZero?.()) {
      return state.nextCostBn.clone?.() ?? BigNum.fromAny(state.nextCostBn);
    }
    const lvlBn = state.lvlBn ?? ensureLevelBigNum(state.lvl ?? 0);
    const nextBn = lvlBn.add(BigNum.fromInt(1));
    const nextNum = levelBigNumToNumber2(nextBn);
    try {
      return BigNum.fromAny(upg.costAtLevel(nextNum));
    } catch {
      return BigNum.fromInt(0);
    }
  }
  function setLevel(areaKey, upgId, lvl, clampToCap = true, options = {}) {
    const state = ensureUpgradeState(areaKey, upgId);
    const upg = state.upg;
    const { resetHmEvolutions = false } = options ?? {};
    if (resetHmEvolutions && upg?.upgType === "HM") {
      state.hmEvolutions = 0;
      applyHmEvolutionMeta(upg, 0);
    }
    const cap = upg?.lvlCap ?? Infinity;
    const prevLevelNum = state.lvl;
    const prevLevelBn = safeCloneBigNum(state.lvlBn ?? ensureLevelBigNum(state.lvl ?? 0));
    let desiredBn = ensureLevelBigNum(lvl);
    if (desiredBn.isInfinite?.()) {
      desiredBn = BigNum.fromAny("Infinity");
    }
    let nextBn = desiredBn;
    try {
      if (upg && isInfinityLevelForScaled(upg, nextBn)) {
        nextBn = BigNum.fromAny("Infinity");
      }
    } catch {
    }
    if (clampToCap && Number.isFinite(cap)) {
      const capBn = ensureLevelBigNum(cap);
      if (nextBn.cmp(capBn) > 0) nextBn = capBn;
    }
    if (clampToCap && Number.isFinite(cap)) {
      const capBn = ensureLevelBigNum(cap);
      if (nextBn.cmp(capBn) > 0) nextBn = capBn;
    }
    if (state.lvlBn?.cmp && state.lvlBn.cmp(nextBn) === 0) return state.lvl;
    const nextNum = levelBigNumToNumber2(nextBn);
    if (!upg) {
      state.lvl = nextNum;
      state.lvlBn = nextBn;
      state.nextCostBn = BigNum.fromInt(0);
      commitUpgradeState(state);
      invalidateUpgradeState(areaKey, upgId);
      notifyChanged();
      return state.lvl;
    }
    state.lvl = nextNum;
    state.lvlBn = nextBn;
    try {
      state.nextCostBn = BigNum.fromAny(upg.costAtLevel(nextNum));
    } catch {
      state.nextCostBn = BigNum.fromInt(0);
    }
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    emitUpgradeLevelChange(upg, prevLevelNum, prevLevelBn, state.lvl, state.lvlBn);
    notifyChanged();
    return state.lvl;
  }
  function getUpgradesForArea(areaKey) {
    return REGISTRY.filter((u) => u.area === areaKey);
  }
  function getUpgrade(areaKey, upgId) {
    const normalizedArea = normalizeAreaKey(areaKey);
    const normalizedId = normalizeUpgradeId(upgId);
    const tieKey = typeof normalizedId === "string" ? normalizeUpgradeTie(normalizedId) : normalizeUpgradeTie(upgId);
    return REGISTRY.find((u) => {
      if (normalizedArea && normalizeAreaKey(u.area) !== normalizedArea) return false;
      if (normalizeUpgradeId(u.id) === normalizedId) return true;
      if (tieKey && u.tieKey === tieKey) return true;
      return false;
    }) || null;
  }
  function getUpgradeLockState(areaKey, upgId) {
    const upg = typeof upgId === "object" && upgId ? upgId : getUpgrade(areaKey, upgId);
    return computeUpgradeLockStateFor(areaKey, upg);
  }
  function normalizeUpgradeIconPath(iconPath) {
    const raw = String(iconPath ?? "").trim();
    if (!raw) return "";
    if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
    if (raw.startsWith("//")) return raw;
    const replaceSlashes = (value) => value.replace(/\\+/g, "/");
    let path = replaceSlashes(raw);
    if (path.startsWith("/")) {
      return path.replace(/\/{2,}/g, "/");
    }
    path = path.replace(/^\.\/+/u, "");
    while (path.startsWith("../")) {
      path = path.slice(3);
    }
    const segments = path.split("/").map((seg) => seg.trim()).filter((seg) => seg && seg !== ".");
    if (!segments.length) return "";
    const normalized = [];
    for (const segment of segments) {
      if (segment === "..") {
        normalized.pop();
        continue;
      }
      normalized.push(segment);
    }
    if (!normalized.length) return "";
    const SHARED_ROOTS = /* @__PURE__ */ new Set(["stats", "currencies", "misc"]);
    for (let i = 0; i < normalized.length; i += 1) {
      const lower = normalized[i].toLowerCase();
      if (lower === "img") {
        normalized.splice(i, 1);
        i -= 1;
        continue;
      }
      if (lower === "sc_upgrade_icons" || lower === "sc_upg_icons") {
        normalized[i] = "sc_upg_icons";
        while (normalized[i + 1] && /^(?:sc_upgrade_icons|sc_upg_icons)$/i.test(normalized[i + 1])) {
          normalized.splice(i + 1, 1);
        }
      }
    }
    if (!normalized.length) return "";
    if (normalized.length > 1 && normalized[0].toLowerCase() === "sc_upg_icons" && SHARED_ROOTS.has(normalized[1].toLowerCase())) {
      normalized.shift();
    }
    if (normalized.length === 1) {
      normalized.unshift("sc_upg_icons");
    }
    const result = normalized.join("/");
    if (!result) return "";
    return `img/${result}`;
  }
  function getIconUrl(upg) {
    if (!upg) return "";
    return normalizeUpgradeIconPath(upg.icon);
  }
  function costToBuyOne(areaKey, upgId) {
    const upg = getUpgrade(areaKey, upgId);
    const lvlBn = getLevel(areaKey, upgId);
    const lvl = levelBigNumToNumber2(lvlBn);
    if (!upg) return 0;
    if (lvl >= upg.lvlCap) return 0;
    return upg.costAtLevel(lvl);
  }
  function buyOne(areaKey, upgId) {
    const state = ensureUpgradeState(areaKey, upgId);
    const upg = state.upg;
    if (!upg) return { bought: 0, spent: 0 };
    if (isUpgradeLocked(areaKey, upg)) {
      return { bought: 0, spent: 0 };
    }
    const lvlNum = state.lvl;
    const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
    const prevLevelBn = safeCloneBigNum(lvlBn);
    if (lvlNum >= upg.lvlCap) return { bought: 0, spent: 0 };
    if (isInfinityLevelForScaled(upg, lvlBn)) {
      state.lvlBn = BigNum.fromAny("Infinity");
      state.lvl = levelBigNumToNumber2(state.lvlBn);
      state.nextCostBn = BigNum.fromAny("Infinity");
      commitUpgradeState(state);
      invalidateUpgradeState(areaKey, upgId);
      notifyChanged();
      return { bought: 0, spent: 0 };
    }
    const rawPrice = state.nextCostBn ?? BigNum.fromAny(upg.costAtLevel(lvlNum));
    const priceBn = rawPrice instanceof BigNum ? rawPrice : BigNum.fromAny(rawPrice ?? 0);
    const costType = upg.costType;
    const walletEntry = costType ? bank[costType] : null;
    let spent = BigNum.fromInt(0);
    if (walletEntry && !priceBn.isZero?.()) {
      const haveRaw = walletEntry.value;
      const have = haveRaw instanceof BigNum ? haveRaw : BigNum.fromAny(haveRaw ?? 0);
      if (have.cmp(priceBn) < 0) {
        return { bought: 0, spent: 0 };
      }
      spent = priceBn.clone?.() ?? BigNum.fromAny(priceBn);
      walletEntry.sub(spent);
    } else {
      if (!priceBn.isZero?.()) {
        return { bought: 0, spent: 0 };
      }
      spent = BigNum.fromInt(0);
    }
    const nextLevelBn = lvlBn.add(BigNum.fromInt(1));
    state.lvlBn = nextLevelBn;
    state.lvl = levelBigNumToNumber2(nextLevelBn);
    state.nextCostBn = BigNum.fromAny(
      typeof upg.nextCostAfter === "function" ? upg.nextCostAfter(spent, state.lvl) : upg.costAtLevel(state.lvl)
    );
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    emitUpgradeLevelChange(upg, lvlNum, prevLevelBn, state.lvl, state.lvlBn);
    notifyChanged();
    return { bought: 1, spent };
  }
  function evolveUpgrade(areaKey, upgId) {
    const state = ensureUpgradeState(areaKey, upgId);
    const upg = state.upg;
    if (!upg || upg.upgType !== "HM") return { evolved: false };
    const lvlBn = state.lvlBn ?? ensureLevelBigNum(state.lvl);
    if (!isHmReadyToEvolve(upg, lvlBn, state.hmEvolutions)) {
      return { evolved: false };
    }
    const nextEvol = normalizeHmEvolutionCount(state.hmEvolutions) + 1;
    state.hmEvolutions = nextEvol;
    applyHmEvolutionMeta(upg, nextEvol);
    try {
      state.nextCostBn = BigNum.fromAny(upg.costAtLevel(state.lvl));
    } catch {
      state.nextCostBn = BigNum.fromAny("Infinity");
    }
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    emitUpgradeLevelChange(upg, state.lvl, lvlBn, state.lvl, lvlBn);
    notifyChanged();
    return { evolved: true };
  }
  function buyMax(areaKey, upgId) {
    const state = ensureUpgradeState(areaKey, upgId);
    const upg = state.upg;
    if (!upg) return { bought: 0, spent: BigNum.fromInt(0) };
    if (isUpgradeLocked(areaKey, upg)) {
      return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    }
    const lvlNum = state.lvl;
    const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
    const cap = Number.isFinite(upg.lvlCap) ? Math.max(0, Math.floor(upg.lvlCap)) : Infinity;
    if (Number.isFinite(cap) && lvlNum >= cap) return { bought: 0, spent: BigNum.fromInt(0) };
    const walletHandle = bank[upg.costType];
    const walletValue = walletHandle?.value;
    const wallet = walletValue instanceof BigNum ? walletValue.clone?.() ?? BigNum.fromAny(walletValue) : BigNum.fromAny(walletValue ?? 0);
    if (upg.unlockUpgrade) {
      const nextCost2 = state.nextCostBn?.clone?.() ?? BigNum.fromInt(0);
      if (nextCost2.isZero?.()) {
        return buyOne(areaKey, upgId);
      }
    }
    if (wallet.isZero?.()) return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    if (wallet.isInfinite?.()) {
      const prevLevel = lvlBn.clone?.() ?? ensureLevelBigNum(lvlBn);
      const prevLevelNum = levelBigNumToNumber2(prevLevel);
      const prevLevelStorage = prevLevel.toStorage?.();
      let targetLevelBn;
      if (upg.upgType === "HM") {
        targetLevelBn = BigNum.fromAny("Infinity");
        if (!upg.lvlCapBn?.isInfinite?.()) {
          const infCap = BigNum.fromAny("Infinity");
          upg.lvlCapBn = infCap;
          upg.lvlCap = Number.POSITIVE_INFINITY;
          upg.lvlCapFmtHtml = formatBigNumAsHtml(infCap);
          upg.lvlCapFmtText = formatBigNumAsPlain(infCap);
        }
      } else {
        const capBn = upg.lvlCapBn?.clone?.() ?? toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
        targetLevelBn = capBn?.clone?.() ?? capBn;
      }
      let purchased = targetLevelBn.sub(prevLevel);
      if (purchased.isZero?.()) {
        const plainDelta = plainLevelDelta(targetLevelBn, prevLevel);
        if (!plainDelta.isZero?.()) {
          purchased = plainDelta;
        }
      }
      if (purchased.isZero?.()) {
        const nextStorage = targetLevelBn.toStorage?.();
        if (prevLevelStorage && nextStorage && prevLevelStorage !== nextStorage) {
          if (targetLevelBn.isInfinite?.()) {
            try {
              purchased = BigNum.fromAny("Infinity");
            } catch {
              purchased = BigNum.fromInt(1);
            }
          } else {
            purchased = BigNum.fromInt(1);
          }
        }
      }
      state.lvlBn = targetLevelBn.clone?.() ?? targetLevelBn;
      if (upg.upgType === "NM" && Number.isFinite(upg.lvlCap)) {
        state.lvl = upg.lvlCap;
      } else {
        state.lvl = levelBigNumToNumber2(state.lvlBn);
      }
      state.nextCostBn = BigNum.fromAny("Infinity");
      bank[upg.costType].set(wallet);
      commitUpgradeState(state);
      invalidateUpgradeState(areaKey, upgId);
      emitUpgradeLevelChange(
        upg,
        prevLevelNum,
        prevLevel,
        state.lvl,
        state.lvlBn
      );
      notifyChanged();
      return { bought: purchased, spent: BigNum.fromInt(0) };
    }
    const nextCost = state.nextCostBn?.clone?.() ?? BigNum.fromAny(upg.costAtLevel(lvlNum));
    if (wallet.cmp(nextCost) < 0) {
      return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    }
    const room = Number.isFinite(cap) ? Math.max(0, cap - lvlNum) : MAX_LEVEL_DELTA;
    if (!(room > 0)) {
      return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    }
    const outcome = calculateBulkPurchase(upg, lvlBn, wallet, room);
    const countBn = outcome.count instanceof BigNum ? outcome.count : BigNum.fromAny(outcome.count ?? 0);
    if (countBn.isZero?.()) {
      return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    }
    const spent = outcome.spent ?? BigNum.fromInt(0);
    const remaining = wallet.sub(spent);
    bank[upg.costType].set(remaining);
    const nextLevelBn = lvlBn.add(countBn);
    state.lvlBn = nextLevelBn;
    state.lvl = levelBigNumToNumber2(nextLevelBn);
    if (outcome.nextPrice) {
      state.nextCostBn = outcome.nextPrice;
    } else if (Number.isFinite(state.lvl)) {
      state.nextCostBn = BigNum.fromAny(upg.costAtLevel(state.lvl));
    } else {
      state.nextCostBn = BigNum.fromAny("Infinity");
    }
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    emitUpgradeLevelChange(upg, lvlNum, lvlBn, state.lvl, state.lvlBn);
    notifyChanged();
    return { bought: countBn, spent };
  }
  function buyTowards(areaKey, upgId, maxLevels) {
    const state = ensureUpgradeState(areaKey, upgId);
    const upg = state.upg;
    if (!upg) return { bought: 0, spent: BigNum.fromInt(0) };
    if (isUpgradeLocked(areaKey, upg)) {
      return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    }
    const lvlNum = state.lvl;
    const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
    const cap = Number.isFinite(upg.lvlCap) ? Math.max(0, Math.floor(upg.lvlCap)) : Infinity;
    if (Number.isFinite(cap) && lvlNum >= cap) return { bought: 0, spent: BigNum.fromInt(0) };
    const walletHandle = bank[upg.costType];
    const walletValue = walletHandle?.value;
    const wallet = walletValue instanceof BigNum ? walletValue.clone?.() ?? BigNum.fromAny(walletValue) : BigNum.fromAny(walletValue ?? 0);
    if (wallet.isZero?.()) return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    const capRoom = Number.isFinite(cap) ? Math.max(0, cap - lvlNum) : void 0;
    const maxRoom = Number.isFinite(maxLevels) ? Math.max(0, Math.floor(maxLevels)) : maxLevels instanceof BigNum ? levelBigNumToNumber2(maxLevels) : void 0;
    const room = Number.isFinite(capRoom) ? Number.isFinite(maxRoom) ? Math.min(capRoom, maxRoom) : capRoom : maxRoom;
    const outcome = calculateBulkPurchase(upg, lvlBn, wallet, room);
    const countBn = outcome.count instanceof BigNum ? outcome.count : BigNum.fromAny(outcome.count ?? 0);
    if (countBn.isZero?.()) {
      return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
    }
    const spent = outcome.spent ?? BigNum.fromInt(0);
    const remaining = wallet.sub(spent);
    bank[upg.costType].set(remaining);
    const nextLevelBn = lvlBn.add(countBn);
    state.lvlBn = nextLevelBn;
    state.lvl = levelBigNumToNumber2(nextLevelBn);
    if (outcome.nextPrice) {
      state.nextCostBn = outcome.nextPrice;
    } else if (Number.isFinite(state.lvl)) {
      state.nextCostBn = BigNum.fromAny(upg.costAtLevel(state.lvl));
    } else {
      state.nextCostBn = BigNum.fromAny("Infinity");
    }
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    emitUpgradeLevelChange(upg, lvlNum, lvlBn, state.lvl, state.lvlBn);
    notifyChanged();
    return { bought: countBn, spent };
  }
  function evaluateBulkPurchase(upg, startLevel, walletBn, maxLevels = MAX_LEVEL_DELTA, options = {}) {
    const wallet = walletBn instanceof BigNum ? walletBn : BigNum.fromAny(walletBn ?? 0);
    const outcome = calculateBulkPurchase(upg, startLevel, wallet, maxLevels, options);
    return {
      count: outcome.count,
      spent: outcome.spent ?? BigNum.fromInt(0),
      nextPrice: outcome.nextPrice ?? BigNum.fromInt(0),
      numericCount: outcome.numericCount ?? 0
    };
  }
  function computeUpgradeEffects(areaKey) {
    const ups = getUpgradesForArea(areaKey);
    let cpsMult = 1;
    let coinValueMultBn = BigNum.fromInt(1);
    let xpGainMultBn = BigNum.fromInt(1);
    let bookRewardMultBn = BigNum.fromInt(1);
    for (const u of ups) {
      const lvlBn = getLevel(areaKey, u.id);
      const lvlNum = levelBigNumToNumber2(lvlBn);
      const tieKey = u.tieKey || normalizeUpgradeTie(u.tie);
      if (tieKey === UPGRADE_TIES.FASTER_COINS) {
        cpsMult *= u.effectMultiplier(lvlNum);
      } else if (tieKey === UPGRADE_TIES.FASTER_COINS_II) {
        cpsMult *= u.effectMultiplier(lvlNum);
      } else if (tieKey === UPGRADE_TIES.COIN_VALUE_I) {
        const lvl = Math.max(0, Number.isFinite(lvlNum) ? lvlNum : 0);
        if (lvl > 0) {
          const factor = 1 + 0.5 * lvl;
          let str = factor.toFixed(6);
          str = str.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
          coinValueMultBn = coinValueMultBn.mulDecimal(str, 18);
        }
      } else if (tieKey === UPGRADE_TIES.COIN_VALUE_II) {
        const lvl = normalizedUpgradeLevel(lvlNum);
        if (lvl > 0) {
          try {
            const bonus = hundredPercentPerLevelMultiplier(lvl);
            coinValueMultBn = coinValueMultBn.mulBigNumInteger(bonus);
          } catch {
          }
        }
      } else if (tieKey === UPGRADE_TIES.BOOK_VALUE_I) {
        bookRewardMultBn = bookValueMultiplierBn(lvlNum);
      } else if (tieKey === UPGRADE_TIES.XP_VALUE_I) {
        const lvl = Math.max(0, Number.isFinite(lvlNum) ? lvlNum : 0);
        xpGainMultBn = BigNum.fromAny(1 + lvl * 2);
      } else if (tieKey === UPGRADE_TIES.XP_VALUE_II) {
        const lvl = normalizedUpgradeLevel(lvlNum);
        if (lvl > 0) {
          try {
            const bonus = hundredPercentPerLevelMultiplier(lvl);
            xpGainMultBn = xpGainMultBn.mulBigNumInteger(bonus);
          } catch {
          }
        }
      }
    }
    return {
      coinsPerSecondMult: cpsMult,
      coinsPerSecondAbsolute: BASE_CPS * cpsMult,
      coinValueMultiplier: coinValueMultBn,
      xpGainMultiplier: xpGainMultBn,
      bookRewardMultiplier: bookRewardMultBn
    };
  }
  function registerXpUpgradeEffects() {
    try {
      initResetSystem();
    } catch {
    }
    try {
      addExternalCoinMultiplierProvider(({ baseMultiplier, xpUnlocked }) => {
        if (!xpUnlocked) return baseMultiplier;
        let result;
        try {
          result = baseMultiplier instanceof BigNum ? baseMultiplier.clone?.() ?? baseMultiplier : BigNum.fromAny(baseMultiplier ?? 0);
        } catch {
          result = BigNum.fromInt(0);
        }
        try {
          const lvl1 = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.COIN_VALUE_I);
          const safeLvl1 = Math.max(0, Number.isFinite(lvl1) ? lvl1 : 0);
          if (safeLvl1 > 0) {
            let str = (1 + 0.5 * safeLvl1).toFixed(6);
            str = str.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
            try {
              result = result.mulDecimal(str, 18);
            } catch {
            }
          }
        } catch {
        }
        try {
          const lvl2 = normalizedUpgradeLevel(
            getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.COIN_VALUE_II)
          );
          if (lvl2 > 0) {
            const bonus = hundredPercentPerLevelMultiplier(lvl2);
            try {
              result = result.mulBigNumInteger(bonus);
            } catch {
            }
          }
        } catch {
        }
        try {
          const hmUpg = getUpgrade(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
          const hmLvl = getLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
          const { coinMult } = computeHmMultipliers(hmUpg, hmLvl, AREA_KEYS.STARTER_COVE);
          result = safeMultiplyBigNum(result, coinMult);
        } catch {
        }
        return result;
      });
    } catch {
    }
    try {
      addExternalXpGainMultiplierProvider(({ baseGain, xpUnlocked }) => {
        if (!xpUnlocked) return baseGain;
        let gain;
        try {
          gain = baseGain instanceof BigNum ? baseGain.clone?.() ?? baseGain : BigNum.fromAny(baseGain ?? 0);
        } catch {
          gain = BigNum.fromInt(0);
        }
        try {
          const lvl1 = getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.XP_VALUE_I);
          const safeLvl1 = Math.max(0, Number.isFinite(lvl1) ? lvl1 : 0);
          if (safeLvl1 > 0) {
            try {
              gain = gain.mulBigNumInteger(BigNum.fromAny(1 + safeLvl1 * 2));
            } catch {
            }
          }
        } catch {
        }
        try {
          const lvl2 = normalizedUpgradeLevel(
            getLevelNumber(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.XP_VALUE_II)
          );
          if (lvl2 > 0) {
            const bonus = hundredPercentPerLevelMultiplier(lvl2);
            try {
              gain = gain.mulBigNumInteger(bonus);
            } catch {
            }
          }
        } catch {
        }
        try {
          const hmUpg = getUpgrade(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
          const hmLvl = getLevel(AREA_KEYS.STARTER_COVE, UPGRADE_TIES.ENDLESS_XP);
          let base = 1;
          try {
            base = hmUpg?.effectMultiplier?.(hmLvl) ?? 1;
          } catch {
          }
          const { selfMult, xpMult } = computeHmMultipliers(hmUpg, hmLvl, AREA_KEYS.STARTER_COVE);
          gain = safeMultiplyBigNum(gain, safeMultiplyBigNum(base, selfMult));
          gain = safeMultiplyBigNum(gain, xpMult);
        } catch {
        }
        return gain;
      });
    } catch {
    }
    try {
      setExternalBookRewardProvider(({ baseReward, xpUnlocked }) => {
        if (!xpUnlocked) return baseReward;
        try {
          return baseReward instanceof BigNum ? baseReward.clone?.() ?? baseReward : BigNum.fromAny(baseReward ?? 0);
        } catch {
          return BigNum.fromInt(0);
        }
      });
    } catch {
    }
    syncBookCurrencyMultiplierFromUpgrade();
    if (typeof window !== "undefined") {
      window.addEventListener("saveSlot:change", () => {
        try {
          syncBookCurrencyMultiplierFromUpgrade();
        } catch {
        }
        try {
          refreshCoinMultiplierFromXpLevel();
        } catch {
        }
      });
    }
  }
  function onUpgradesChanged(cb) {
    if (typeof cb === "function") listeners.push(cb);
    return () => {
      listeners = listeners.filter((x) => x !== cb);
    };
  }
  function notifyChanged() {
    try {
      listeners.forEach((cb) => cb());
    } catch {
    }
    try {
      document.dispatchEvent(new CustomEvent("ccc:upgrades:changed"));
    } catch {
    }
    try {
      refreshCoinMultiplierFromXpLevel();
    } catch {
    }
  }
  function getCurrentAreaKey() {
    const gameRoot = document.getElementById("game-root");
    if (gameRoot?.classList?.contains("area-cove")) return AREA_KEYS.STARTER_COVE;
    return AREA_KEYS.STARTER_COVE;
  }
  function upgradeUiModel(areaKey, upgId) {
    const upg = getUpgrade(areaKey, upgId);
    if (!upg) return null;
    const lvlBn = getLevel(areaKey, upgId);
    const lvl = levelBigNumToNumber2(lvlBn);
    const lvlFmtHtml = formatBigNumAsHtml(lvlBn);
    const lvlFmtText = formatBigNumAsPlain(lvlBn);
    const lvlCapBn = upg.lvlCapBn ?? toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
    const lvlCapFmtHtml = upg.lvlCapFmtHtml ?? formatBigNumAsHtml(lvlCapBn);
    const lvlCapFmtText = upg.lvlCapFmtText ?? formatBigNumAsPlain(lvlCapBn);
    const nextPrice = lvl < upg.lvlCap ? peekNextPrice(areaKey, upgId) : BigNum.fromInt(0);
    const nextPriceFmt = formatBigNumAsHtml(nextPrice);
    const haveRaw = bank[upg.costType]?.value;
    const have = haveRaw instanceof BigNum ? haveRaw : BigNum.fromAny(haveRaw ?? 0);
    const lockState = getUpgradeLockState(areaKey, upgId);
    const locked = !!lockState.locked;
    const displayTitle = lockState.titleOverride ?? upg.title;
    const displayDesc = lockState.descOverride ?? upg.desc;
    const hmMilestones = resolveHmMilestones(upg, areaKey);
    let effect = "";
    if (typeof upg.effectSummary === "function" && !(locked && lockState.hideEffect)) {
      effect = upg.effectSummary(lvl);
      if (typeof effect === "string") effect = effect.trim();
    }
    const iconUrl = lockState.iconOverride ?? getIconUrl(upg);
    return {
      upg,
      lvl,
      lvlBn,
      lvlFmtHtml,
      lvlFmtText,
      lvlCapBn,
      lvlCapFmtHtml,
      lvlCapFmtText,
      nextPrice,
      nextPriceFmt,
      have,
      haveFmt: bank[upg.costType]?.fmt(have) ?? String(have),
      effect,
      iconUrl,
      lockState,
      locked,
      areaKey,
      hmMilestones,
      displayTitle,
      displayDesc,
      unlockUpgrade: !!upg.unlockUpgrade,
      hmEvolutions: upg.upgType === "HM" ? getHmEvolutions(areaKey, upgId) : 0,
      hmReadyToEvolve: upg.upgType === "HM" ? isHmReadyToEvolve(upg, lvlBn, getHmEvolutions(areaKey, upgId)) : false,
      hmNextMilestone: upg.upgType === "HM" ? hmNextMilestoneLevel(upg, lvlBn, areaKey) : null
    };
  }
  function getHmNextMilestoneLevel(areaKey, upgId) {
    const upg = getUpgrade(areaKey, upgId);
    if (!upg || upg.upgType !== "HM") return null;
    const lvlBn = getLevel(areaKey, upgId);
    return hmNextMilestoneLevel(upg, lvlBn, areaKey);
  }
  function normalizeBigNum(value) {
    return bigNumFromLog102(approxLog10BigNum(value ?? 0));
  }
  var MAX_LEVEL_DELTA, HM_EVOLUTION_INTERVAL, HM_EVOLUTION_EFFECT_MULT_BN, DEFAULT_AREA_KEY, SCALED_INFINITY_LVL_LOG10, UPGRADE_TIES, LOCKED_UPGRADE_ICON_DATA_URL, MYSTERIOUS_UPGRADE_ICON_DATA_URL, HIDDEN_UPGRADE_TITLE, LOCKED_UPGRADE_TITLE, FORGE_PLACEHOLDER_TIES, SPECIAL_LOCK_STATE_TIES, XP_MYSTERY_UPGRADE_TIES, XP_MYSTERY_LEGACY_KEYS, MERCHANT_MET_KEY_BASE, SHOP_REVEAL_STATE_KEY_BASE, SHOP_PERMA_UNLOCK_KEY_BASE, SHOP_PERMA_MYST_KEY_BASE, SHOP_REVEAL_STATUS_ORDER, shopRevealStateCache, shopPermaUnlockStateCache, shopPermaMystStateCache, upgradeTieLookup, BOOK_VALUE_TIE_KEY, BN2, toBn, E, LN10, DEFAULT_SCALING_PRESETS, MAX_LEVEL_DELTA_LIMIT, FLOAT64_BUFFER, FLOAT64_VIEW, INT64_VIEW, AREA_KEYS, REGISTRY, areaStatePayloadCache, areaStateMemoryCache, upgradeStateCache, areaUpgradeOrderCache, upgradeStorageWatcherCleanup, upgradeStorageWatcherBoundSlot, BASE_CPS, listeners;
  var init_upgrades = __esm({
    "js/game/upgrades.js"() {
      init_storage();
      init_bigNum();
      init_numFormat();
      init_xpSystem();
      init_mutationSystem();
      init_resetTab();
      MAX_LEVEL_DELTA = BigNum.fromAny("Infinity");
      HM_EVOLUTION_INTERVAL = 1e3;
      HM_EVOLUTION_EFFECT_MULT_BN = BigNum.fromInt(1e3);
      DEFAULT_AREA_KEY = "";
      SCALED_INFINITY_LVL_LOG10 = 308;
      UPGRADE_TIES = {
        FASTER_COINS: "coin_1",
        UNLOCK_XP: "none_1",
        FASTER_COINS_II: "book_1",
        COIN_VALUE_I: "book_2",
        BOOK_VALUE_I: "book_3",
        XP_VALUE_I: "coin_2",
        UNLOCK_FORGE: "none_2",
        COIN_VALUE_II: "gold_1",
        XP_VALUE_II: "gold_2",
        MP_VALUE_I: "gold_3",
        MAGNET: "gold_4",
        ENDLESS_XP: "coin_3"
      };
      LOCKED_UPGRADE_ICON_DATA_URL = "img/misc/locked.png";
      MYSTERIOUS_UPGRADE_ICON_DATA_URL = "img/misc/mysterious.png";
      HIDDEN_UPGRADE_TITLE = "Hidden Upgrade";
      LOCKED_UPGRADE_TITLE = "Locked Upgrade";
      FORGE_PLACEHOLDER_TIES = /* @__PURE__ */ new Set([
        UPGRADE_TIES.COIN_VALUE_II,
        UPGRADE_TIES.XP_VALUE_II,
        UPGRADE_TIES.MP_VALUE_I,
        UPGRADE_TIES.MAGNET,
        UPGRADE_TIES.ENDLESS_XP
      ]);
      SPECIAL_LOCK_STATE_TIES = /* @__PURE__ */ new Set([
        UPGRADE_TIES.UNLOCK_XP,
        UPGRADE_TIES.UNLOCK_FORGE,
        ...FORGE_PLACEHOLDER_TIES
      ]);
      XP_MYSTERY_UPGRADE_TIES = /* @__PURE__ */ new Set([
        UPGRADE_TIES.FASTER_COINS_II,
        UPGRADE_TIES.COIN_VALUE_I,
        UPGRADE_TIES.BOOK_VALUE_I,
        UPGRADE_TIES.XP_VALUE_I
      ]);
      XP_MYSTERY_LEGACY_KEYS = /* @__PURE__ */ new Set([
        "starter_cove:3",
        "starter_cove:4",
        "starter_cove:5",
        "starter_cove:6"
      ]);
      MERCHANT_MET_KEY_BASE = "ccc:merchantMet";
      SHOP_REVEAL_STATE_KEY_BASE = "ccc:shop:reveals";
      SHOP_PERMA_UNLOCK_KEY_BASE = "ccc:shop:permaUnlocks";
      SHOP_PERMA_MYST_KEY_BASE = "ccc:shop:permaMyst";
      SHOP_REVEAL_STATUS_ORDER = { locked: 0, mysterious: 1, unlocked: 2 };
      shopRevealStateCache = /* @__PURE__ */ new Map();
      shopPermaUnlockStateCache = /* @__PURE__ */ new Map();
      shopPermaMystStateCache = /* @__PURE__ */ new Map();
      upgradeTieLookup = /* @__PURE__ */ new Map();
      BOOK_VALUE_TIE_KEY = normalizeUpgradeTie(UPGRADE_TIES.BOOK_VALUE_I);
      BN2 = BigNum;
      toBn = (x) => BN2.fromAny(x ?? 0);
      E = {
        addPctPerLevel(p) {
          const pNum = Number(p);
          const pStr = String(pNum);
          return (level) => {
            const L = toBn(level);
            try {
              const plain = L.toPlainIntegerString?.();
              if (plain && plain !== "Infinity" && plain.length <= 15) {
                const lvl = Math.max(0, Number(plain));
                return 1 + pNum * lvl;
              }
            } catch {
            }
            try {
              return BN2.fromInt(1).add(L.mulDecimal(pStr));
            } catch {
              const logL = approxLog10BigNum(L);
              if (Number.isFinite(logL)) {
                const logTerm = logL + Math.log10(Math.abs(pNum || 0));
                return bigNumFromLog102(logTerm);
              }
              return BigNum.fromAny("Infinity");
            }
          };
        },
        addFlatPerLevel(x) {
          const xNum = Number(x);
          const xStr = String(xNum);
          return (level) => {
            const L = toBn(level);
            try {
              const plain = L.toPlainIntegerString?.();
              if (plain && plain !== "Infinity" && plain.length <= 15) {
                const lvl = Math.max(0, Number(plain));
                return 1 + xNum * lvl;
              }
            } catch {
            }
            try {
              return BN2.fromInt(1).add(L.mulDecimal(xStr));
            } catch {
              return 1;
            }
          };
        },
        powPerLevel(base) {
          const baseNum = Number(base);
          const b = Number.isFinite(baseNum) ? baseNum : Number(toBn(base).toScientific(6));
          const log10b = Math.log10(b);
          return (level) => {
            const L = toBn(level);
            try {
              const plain = L.toPlainIntegerString?.();
              if (plain && plain !== "Infinity" && plain.length <= 7) {
                const lvl = Math.max(0, Number(plain));
                const log10 = log10b * lvl;
                if (log10 < 308) {
                  const val = Math.pow(b, lvl);
                  if (Number.isFinite(val)) return val;
                }
                return bigNumFromLog102(log10);
              }
            } catch {
            }
            try {
              const approxLvl = levelBigNumToNumber2(L);
              const log10 = log10b * approxLvl;
              return bigNumFromLog102(log10);
            } catch {
              return BigNum.fromInt(1);
            }
          };
        }
      };
      LN10 = Math.log(10);
      DEFAULT_SCALING_PRESETS = {
        STANDARD(upg) {
          const upgType = `${upg?.upgType ?? ""}`.toUpperCase();
          if (upgType === "HM") {
            const evol = activeEvolutionsForUpgrade(upg);
            return 1.5 + 0.1 * evol;
          }
          return 1.2;
        },
        HM(upg) {
          return DEFAULT_SCALING_PRESETS.STANDARD(upg);
        },
        NM() {
          return 1.2;
        }
      };
      MAX_LEVEL_DELTA_LIMIT = (() => {
        try {
          const approx = levelBigNumToNumber2(MAX_LEVEL_DELTA);
          if (!Number.isFinite(approx)) return Number.POSITIVE_INFINITY;
          if (approx <= 0) return 0;
          return Math.floor(approx);
        } catch {
          return Number.MAX_SAFE_INTEGER;
        }
      })();
      FLOAT64_BUFFER = new ArrayBuffer(8);
      FLOAT64_VIEW = new Float64Array(FLOAT64_BUFFER);
      INT64_VIEW = new BigInt64Array(FLOAT64_BUFFER);
      AREA_KEYS = {
        STARTER_COVE: "starter_cove"
      };
      REGISTRY = [
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 1,
          tie: UPGRADE_TIES.FASTER_COINS,
          title: "Faster Coins",
          desc: "Increases coin spawn rate by +10% per level",
          lvlCap: 10,
          baseCost: 10,
          costType: "coins",
          upgType: "NM",
          icon: "sc_upgrade_icons/faster_coins.png",
          costAtLevel(level) {
            return nmCostBN(this, level);
          },
          nextCostAfter(_, nextLevel) {
            return nmCostBN(this, nextLevel);
          },
          effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Coin spawn rate bonus: ${formatMultForUi(mult)}x`;
          },
          effectMultiplier: E.addPctPerLevel(0.1)
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 2,
          tie: UPGRADE_TIES.UNLOCK_XP,
          title: "Unlock XP",
          desc: "Unlocks the XP system and a new Merchant dialogue\nXP system: Collect Coins for XP to level up and gain Books\nEach XP Level also boosts Coin value by a decent amount",
          lvlCap: 1,
          upgType: "NM",
          icon: "stats/xp/xp.png",
          baseIconOverride: "img/stats/xp/xp_base.png",
          unlockUpgrade: true,
          costAtLevel() {
            return BigNum.fromInt(0);
          },
          nextCostAfter() {
            return BigNum.fromInt(0);
          },
          computeLockState: determineLockState,
          effectSummary() {
            return "";
          },
          onLevelChange({ newLevel, newLevelBn }) {
            const reached = Number.isFinite(newLevel) ? newLevel >= 1 : (newLevelBn?.cmp?.(BigNum.fromInt(1)) ?? -1) >= 0;
            if (reached) {
              try {
                unlockXpSystem();
              } catch {
              }
            }
          }
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 3,
          tie: UPGRADE_TIES.FASTER_COINS_II,
          title: "Faster Coins II",
          desc: "Increases Coin spawn rate by +10% per level",
          lvlCap: 15,
          baseCost: 1,
          costType: "books",
          upgType: "NM",
          icon: "sc_upgrade_icons/faster_coins2.png",
          requiresUnlockXp: true,
          costAtLevel() {
            return this.baseCostBn?.clone?.() ?? BigNum.fromInt(1);
          },
          nextCostAfter() {
            return this.costAtLevel();
          },
          effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Coin spawn rate bonus: ${formatMultForUi(mult)}x`;
          },
          effectMultiplier: E.addPctPerLevel(0.1)
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 4,
          tie: UPGRADE_TIES.COIN_VALUE_I,
          title: "Coin Value",
          desc: "Increases Coin value by +50% per level",
          lvlCap: 100,
          baseCost: 1,
          costType: "books",
          upgType: "NM",
          icon: "sc_upgrade_icons/coin_val1.png",
          requiresUnlockXp: true,
          costAtLevel() {
            return this.baseCostBn?.clone?.() ?? BigNum.fromInt(1);
          },
          nextCostAfter() {
            return this.costAtLevel();
          },
          effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Coin value bonus: ${formatMultForUi(mult)}x`;
          },
          effectMultiplier: E.addPctPerLevel(0.5),
          onLevelChange() {
            try {
              refreshCoinMultiplierFromXpLevel();
            } catch {
            }
          }
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 5,
          tie: UPGRADE_TIES.BOOK_VALUE_I,
          title: "Book Value",
          desc: "Doubles Books gained when increasing XP Level",
          lvlCap: 1,
          baseCost: 10,
          costType: "books",
          upgType: "NM",
          icon: "sc_upgrade_icons/book_val1.png",
          requiresUnlockXp: true,
          costAtLevel() {
            return this.baseCostBn?.clone?.() ?? BigNum.fromInt(1);
          },
          nextCostAfter() {
            return this.costAtLevel();
          },
          effectSummary(level) {
            const mult = bookValueMultiplierBn(level);
            return `Book value bonus: ${formatMultForUi(mult)}x`;
          },
          onLevelChange({ newLevel }) {
            syncBookCurrencyMultiplierFromUpgrade(newLevel);
          }
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 6,
          tie: UPGRADE_TIES.XP_VALUE_I,
          title: "XP Value",
          desc: "Increases XP value by +200% per level",
          lvlCap: 10,
          baseCost: 1e3,
          costType: "coins",
          upgType: "NM",
          icon: "sc_upgrade_icons/xp_val1.png",
          requiresUnlockXp: true,
          costAtLevel(level) {
            return nmCostBN(this, level);
          },
          nextCostAfter(_, nextLevel) {
            return nmCostBN(this, nextLevel);
          },
          effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `XP value bonus: ${formatMultForUi(mult)}x`;
          },
          effectMultiplier: E.addFlatPerLevel(2)
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 7,
          tie: UPGRADE_TIES.UNLOCK_FORGE,
          title: "Unlock Forge",
          desc: "Unlocks the Reset tab and the Forge reset in the Delve menu",
          lvlCap: 1,
          upgType: "NM",
          icon: "misc/forge.png",
          baseIconOverride: "img/stats/mp/mp_base.png",
          requiresUnlockXp: true,
          revealRequirement: "Reach XP Level 31 to reveal this upgrade",
          unlockUpgrade: true,
          costAtLevel() {
            return BigNum.fromInt(0);
          },
          nextCostAfter() {
            return BigNum.fromInt(0);
          },
          computeLockState: determineLockState,
          onLevelChange({ newLevel }) {
            if ((newLevel ?? 0) >= 1) {
              try {
                onForgeUpgradeUnlocked();
              } catch {
              }
            }
          }
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 8,
          tie: UPGRADE_TIES.COIN_VALUE_II,
          title: "Coin Value II",
          desc: "Increases Coin value by +100% per level",
          lvlCap: 100,
          baseCost: 1,
          costType: "gold",
          upgType: "NM",
          icon: "sc_upgrade_icons/coin_val2.png",
          requiresUnlockXp: true,
          costAtLevel(level) {
            return nmCostBN(this, level);
          },
          nextCostAfter(_, nextLevel) {
            return nmCostBN(this, nextLevel);
          },
          computeLockState: determineLockState,
          effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `Coin value bonus: ${formatMultForUi(mult)}x`;
          },
          effectMultiplier: E.addPctPerLevel(1),
          onLevelChange() {
            try {
              refreshCoinMultiplierFromXpLevel();
            } catch {
            }
          }
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 9,
          tie: UPGRADE_TIES.XP_VALUE_II,
          title: "XP Value II",
          desc: "Increases XP value by +100% per level",
          lvlCap: 100,
          baseCost: 3,
          costType: "gold",
          upgType: "NM",
          icon: "sc_upgrade_icons/xp_val2.png",
          requiresUnlockXp: true,
          costAtLevel(level) {
            return nmCostBN(this, level);
          },
          nextCostAfter(_, nextLevel) {
            return nmCostBN(this, nextLevel);
          },
          computeLockState: determineLockState,
          effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `XP value bonus: ${formatMultForUi(mult)}x`;
          },
          effectMultiplier: E.addPctPerLevel(1)
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 10,
          tie: UPGRADE_TIES.MP_VALUE_I,
          title: "MP Value",
          desc: "Increases MP value by +100% per level",
          lvlCap: 100,
          baseCost: 25,
          costType: "gold",
          upgType: "NM",
          icon: "sc_upgrade_icons/mp_val1.png",
          requiresUnlockXp: true,
          costAtLevel(level) {
            return nmCostBN(this, level);
          },
          nextCostAfter(_, nextLevel) {
            return nmCostBN(this, nextLevel);
          },
          computeLockState: determineLockState,
          effectSummary(level) {
            const mult = this.effectMultiplier(level);
            return `MP value bonus: ${formatMultForUi(mult)}x`;
          },
          effectMultiplier: E.addPctPerLevel(1)
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 11,
          tie: UPGRADE_TIES.MAGNET,
          title: "Magnet",
          desc: "Increases Magnet radius by +1 Unit per level\nMagnet: Increases the distance from which you can collect Coins",
          lvlCap: 10,
          baseCost: 100,
          costType: "gold",
          upgType: "NM",
          icon: "sc_upgrade_icons/magnet.png",
          requiresUnlockXp: true,
          scaling: { ratio: 2 },
          costAtLevel(level) {
            return nmCostBN(this, level);
          },
          nextCostAfter(_, nextLevel) {
            return nmCostBN(this, nextLevel);
          },
          computeLockState: determineLockState,
          effectSummary(level) {
            const units = normalizedUpgradeLevel(level);
            const unitsText = formatMultForUi(units);
            const suffix = unitsText === "1" ? "Unit" : "Units";
            return `Magnet radius: ${unitsText} ${suffix}`;
          },
          effectMultiplier: E.addPctPerLevel(1)
        },
        {
          area: AREA_KEYS.STARTER_COVE,
          id: 12,
          tie: UPGRADE_TIES.ENDLESS_XP,
          title: "Endless XP",
          desc: "The first Milestone-type upgrade\nMilestones: Reach a certain upgrade level for powerful buffs\nMultiplies XP value by 1.1x per level",
          lvlCap: HM_EVOLUTION_INTERVAL,
          baseCost: 1e6,
          costType: "coins",
          upgType: "HM",
          icon: "sc_upg_icons/xp_val_hm.png",
          requiresUnlockXp: true,
          scalingPreset: "HM",
          hmMilestones: [
            { level: 10, multiplier: 1.5, target: "self" },
            { level: 25, multiplier: 2, target: "self" },
            { level: 50, multiplier: 5, target: "mp" },
            { level: 100, multiplier: 10, target: "xp" },
            { level: 200, multiplier: 15, target: "coin" },
            { level: 400, multiplier: 25, target: "self" },
            { level: 800, multiplier: 100, target: "self" }
          ],
          costAtLevel(level) {
            return costAtLevelUsingScaling(this, level);
          },
          nextCostAfter(_, nextLevel) {
            return costAtLevelUsingScaling(this, nextLevel);
          },
          computeLockState: determineLockState,
          effectSummary(level) {
            const lvlBn = ensureLevelBigNum(level);
            let baseMult;
            try {
              baseMult = this.effectMultiplier(lvlBn);
            } catch {
              baseMult = 1;
            }
            const { selfMult } = computeHmMultipliers(this, lvlBn, this.area);
            const total = safeMultiplyBigNum(baseMult, selfMult);
            return `XP value bonus: ${formatMultForUi(total)}x`;
          },
          effectMultiplier: E.powPerLevel(1.1)
        }
      ];
      for (const upg of REGISTRY) {
        const tieKey = normalizeUpgradeTie(upg.tie ?? upg.tieKey);
        upg.tieKey = tieKey;
        if (tieKey && !upgradeTieLookup.has(tieKey)) {
          upgradeTieLookup.set(tieKey, upg);
        }
        upg.baseCost = toUpgradeBigNum(upg.baseCost ?? 0, 0);
        upg.baseCostBn = upg.baseCost;
        upg.numUpgEvolutions = normalizeHmEvolutionCount(upg.numUpgEvolutions);
        if (upg.upgType === "HM") {
          applyHmEvolutionMeta(upg, upg.numUpgEvolutions);
        } else {
          upg.lvlCapBn = toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
          upg.lvlCap = levelCapToNumber(upg.lvlCapBn);
          upg.lvlCapFmtHtml = formatBigNumAsHtml(upg.lvlCapBn);
          upg.lvlCapFmtText = formatBigNumAsPlain(upg.lvlCapBn);
        }
        const isSingleLevelCap = Number.isFinite(upg.lvlCap) && Math.max(0, Math.floor(upg.lvlCap)) === 1;
        const isBookValueUpgrade = tieKey === BOOK_VALUE_TIE_KEY;
        if (isSingleLevelCap && !isBookValueUpgrade) {
          upg.unlockUpgrade = true;
          upg.baseCost = BigNum.fromInt(0);
          upg.baseCostBn = upg.baseCost;
          upg.costAtLevel = () => BigNum.fromInt(0);
          upg.nextCostAfter = () => BigNum.fromInt(0);
        }
        upg.bulkMeta = computeBulkMeta(upg);
        ensureUpgradeScaling(upg);
      }
      areaStatePayloadCache = /* @__PURE__ */ new Map();
      areaStateMemoryCache = /* @__PURE__ */ new Map();
      upgradeStateCache = /* @__PURE__ */ new Map();
      areaUpgradeOrderCache = /* @__PURE__ */ new Map();
      upgradeStorageWatcherCleanup = /* @__PURE__ */ new Map();
      upgradeStorageWatcherBoundSlot = null;
      if (typeof window !== "undefined") {
        bindUpgradeStorageWatchersForSlot(getActiveSlot());
        window.addEventListener("saveSlot:change", () => {
          bindUpgradeStorageWatchersForSlot(getActiveSlot());
        });
      }
      BASE_CPS = 1;
      registerXpUpgradeEffects();
      listeners = [];
    }
  });

  // js/misc/merchantDialogues.js
  var MERCHANT_DIALOGUES;
  var init_merchantDialogues = __esm({
    "js/misc/merchantDialogues.js"() {
      MERCHANT_DIALOGUES = {
        0: {
          start: "n0",
          nodes: {
            n0: { type: "line", say: "So you want to delve deeper within my shop, do you?", next: "c1" },
            r_who: { type: "line", say: "I am the Merchant.", next: "c2" },
            r_where: { type: "line", say: "The cove.", next: "c2" },
            r_confused: { type: "line", say: "Okay.", next: "c2" },
            c1: { type: "choice", options: [
              { label: "Who are you?", to: "r_who" },
              { label: "Where am I?", to: "r_where" },
              { label: "I just clicked on this green button and now I\u2019m confused.", to: "r_confused" }
            ] },
            c2: { type: "choice", options: [
              { label: "What?", to: "r2_what" },
              { label: "That\u2019s not helpful.", to: "r2_okay" },
              { label: "Okay.", to: "r2_okay" }
            ] },
            r2_what: { type: "line", say: "What?", next: "c3" },
            r2_okay: { type: "line", say: "Okay.", next: "c3" },
            c3: { type: "choice", options: [
              { label: "What?", to: "r2_what" },
              { label: "That\u2019s not helpful.", to: "r2_okay" },
              { label: "Goodbye.", to: "end" }
            ] }
          }
        },
        1: {
          start: "n0",
          nodes: {
            n0: { type: "line", say: "Hello again.", next: "c0" },
            c0: { type: "choice", options: [
              { label: "You never answered my questions.", to: "m1a" },
              { label: "Hello.", to: "m1b" },
              { label: "I am still very confused.", to: "m1c" }
            ] },
            m1a: { type: "line", say: "Yes I did.", next: "c1a" },
            m1b: { type: "line", say: "Hello.", next: "c1b" },
            m1c: { type: "line", say: "Okay.", next: "c1c" },
            c1a: { type: "choice", options: [
              { label: "No you didn\u2019t.", to: "m1a" },
              { label: "Liar.", to: "m2a" },
              { label: "Okay I guess you\u2019re right.", to: "m2b" }
            ] },
            c1b: { type: "choice", options: [
              { label: "You never answered my questions.", to: "m1a" },
              { label: "That does not help.", to: "m1c" },
              { label: "Okay.", to: "m2b" }
            ] },
            c1c: { type: "choice", options: [
              { label: "Yes.", to: "m2a" },
              { label: "Hmm\u2026", to: "m1c" },
              { label: "Okay.", to: "m2b" }
            ] },
            m2a: { type: "line", say: "No.", next: "c1c" },
            m2b: { type: "line", say: "Would you like some Coins? Free of charge. You look like you could use some right now.", next: "c2a" },
            c2a: { type: "choice", options: [
              { label: "What?", to: "m3a" },
              { label: "No.", to: "m3b" },
              { label: "Give me the coins now.", to: "end" }
            ] },
            m3a: { type: "line", say: "What?", next: "c2a" },
            m3b: { type: "line", say: "Okay, no Coins for you then.", next: "c2b" },
            c2b: { type: "choice", options: [
              { label: "No wait, actually I want the coins. Give them to me now.", to: "end" },
              { label: "On second thought, maybe I do want the coins. Give them to me now.", to: "end" },
              { label: "Okay, bye, I don\u2019t need your filthy coins anyway.", to: "end_nr" }
            ] }
          }
        },
        2: {
          start: "n0",
          nodes: {
            n0: { type: "line", say: "I see you\u2019ve unlocked the XP system.", next: "c0" },
            c0: { type: "choice", options: [
              { label: "What does it do?", to: "m1a" },
              { label: "What does that mean?", to: "m1b" },
              { label: "Yes I did that.", to: "m1c" }
            ] },
            m1a: { type: "line", say: "The XP system is a powerful ancient mechanism, designed to allow rapid influx of coin-collecting power. Increasing your XP Level grants you Books infused with my power, capable of great things.", next: "c1a" },
            m1b: { type: "line", say: "It means you can grow passively stronger by collecting coins.", next: "c1b" },
            m1c: { type: "line", say: "And do you know how the XP system works?", next: "c1c" },
            c1a: { type: "choice", options: [
              { label: "This XP system, by whom was it designed, exactly?", to: "m2b" },
              { label: "What does that mean?", to: "m1b" },
              { label: "Okay.", to: "m2a" }
            ] },
            c1b: { type: "choice", options: [
              { label: "Can you explain in more detail?", to: "m1a" },
              { label: "Why?", to: "m2c" },
              { label: "Okay.", to: "m2a" }
            ] },
            c1c: { type: "choice", options: [
              { label: "I have no idea.", to: "m1a" },
              { label: "I don\u2019t know the full details.", to: "m1a" },
              { label: "Yes.", to: "m2a" }
            ] },
            m2a: { type: "line", say: "Would you like some Books, free of charge? They will help you accelerate your coin-collecting power.", next: "c2a" },
            m2b: { type: "line", say: "I dunno.", next: "c2b" },
            m2c: { type: "line", say: "Because I dunno.", next: "c2c" },
            m2d: { type: "line", say: "What?", next: "c2c" },
            m2e: { type: "line", say: "I\u2019ve already told you, so you can increase your coin-collecting power.", next: "c2d" },
            m2f: { type: "line", say: "Are you sure you don\u2019t want free Books?", next: "c3a" },
            c2a: { type: "choice", options: [
              { label: "No.", to: "m2f" },
              { label: "Why are you giving me all this free stuff?", to: "m2e" },
              { label: "Yeah, sure.", to: "end" }
            ] },
            c2b: { type: "choice", options: [
              { label: "What?", to: "m2d" },
              { label: "Why not?", to: "m2c" },
              { label: "\u2026", to: "m2a" }
            ] },
            c2c: { type: "choice", options: [
              { label: "\u2026", to: "m2a" },
              { label: "\u2026", to: "m2a" },
              { label: "\u2026", to: "m2a" }
            ] },
            c2d: { type: "choice", options: [
              { label: "But why does that matter?", to: "m3a" },
              { label: "But what does that mean?", to: "m3a" },
              { label: "\u2026", to: "m3a" }
            ] },
            m3a: { type: "line", say: "If you want free Books, then don\u2019t ask further questions.", next: "c3a" },
            c3a: { type: "choice", options: [
              { label: "Okay, actually give me the free stuff.", to: "end" },
              { label: "Okay fine, I\u2019ll take those books off your hands.", to: "end" },
              { label: "I don\u2019t need your charity.", to: "end_nr" }
            ] }
          }
        },
        3: {
          start: "n0",
          nodes: {
            n0: { type: "line", say: "Level 999. I hoped to see it one day. Placeholder admiration intensifies.", next: "c0" },
            c0: { type: "choice", options: [
              { label: "Was it worth it?", to: "q0" },
              { label: "What happens next?", to: "q1" },
              { label: "I need a break.", to: "end" }
            ] },
            q0: { type: "line", say: "Only you can decide that. But the data you gathered will fuel upcoming secrets.", next: "c1" },
            q1: { type: "line", say: "Beyond this? More systems, more bargains, and more reasons to climb. Placeholder, of course.", next: "c1" },
            c1: { type: "choice", options: [
              { label: "Where are the rewards?", to: "q2" },
              { label: "I\u2019ll keep going.", to: "end" },
              { label: "I need another hint.", to: "q3" }
            ] },
            q2: { type: "line", say: "For now, take pride. The tangible prizes arrive in a future update.", next: "c1" },
            q3: { type: "line", say: "Watch the Merchant tab. New dialogues will appear at milestones beyond this.", next: "c1" }
          }
        }
      };
    }
  });

  // js/util/ghostTapGuard.js
  var ghostTapGuard_exports = {};
  __export(ghostTapGuard_exports, {
    GHOST_TAP_TIMEOUT_MS: () => DEFAULT_TIMEOUT_MS,
    clearGhostTapTarget: () => clearGhostTapTarget,
    consumeGhostTapGuard: () => consumeGhostTapGuard,
    installGhostTapGuard: () => installGhostTapGuard,
    markGhostTapTarget: () => markGhostTapTarget,
    setGhostTapSelector: () => setGhostTapSelector,
    shouldSkipGhostTap: () => shouldSkipGhostTap,
    suppressNextGhostTap: () => suppressNextGhostTap
  });
  function nowMs() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
  function getDocument() {
    if (typeof document === "undefined") return null;
    return document;
  }
  function findTapTarget(node) {
    const doc = getDocument();
    if (!doc) return null;
    const ElementCtor = typeof Element !== "undefined" ? Element : null;
    if (!node || !ElementCtor) return null;
    if (!(node instanceof ElementCtor)) {
      node = node.parentElement;
    }
    if (!node || !node.closest) return null;
    return node.closest(selector);
  }
  function clearGhostTapTarget(el) {
    if (!el) return;
    el[ELEMENT_SKIP_PROP] = 0;
  }
  function markGhostTapTarget(el, timeout = DEFAULT_TIMEOUT_MS) {
    if (!el) return;
    const now = nowMs();
    const delay = Number.isFinite(timeout) ? Math.max(0, Number(timeout)) : DEFAULT_TIMEOUT_MS;
    if (delay > 0) {
      el[ELEMENT_SKIP_PROP] = now + delay;
    } else {
      el[ELEMENT_SKIP_PROP] = 0;
    }
    lastMarkedTarget = el;
    if (delay > 0) suppressNextGhostTap(delay);
  }
  function consumeGhostTapGuard(target) {
    if (typeof window === "undefined") return false;
    const until = window[GLOBAL_SKIP_PROP];
    if (typeof until !== "number") return false;
    const now = nowMs();
    if (now <= until) {
      window[GLOBAL_SKIP_PROP] = null;
      if (target && lastMarkedTarget && target === lastMarkedTarget) {
        return false;
      }
      return true;
    }
    window[GLOBAL_SKIP_PROP] = null;
    return false;
  }
  function shouldSkipGhostTap(el) {
    if (!el) return false;
    const until = Number(el[ELEMENT_SKIP_PROP] || 0);
    if (!Number.isFinite(until) || until <= 0) return false;
    const now = nowMs();
    if (now <= until) {
      if (lastMarkedTarget && el === lastMarkedTarget) {
        clearGhostTapTarget(el);
        return false;
      }
      clearGhostTapTarget(el);
      return true;
    }
    clearGhostTapTarget(el);
    return false;
  }
  function suppressNextGhostTap(timeout = DEFAULT_TIMEOUT_MS) {
    if (typeof window === "undefined") return;
    const now = nowMs();
    const targetDelay = Math.max(0, Number.isFinite(timeout) ? timeout : DEFAULT_TIMEOUT_MS);
    if (targetDelay <= 0) {
      window[GLOBAL_SKIP_PROP] = null;
      return;
    }
    const target = now + targetDelay;
    const current = typeof window[GLOBAL_SKIP_PROP] === "number" ? window[GLOBAL_SKIP_PROP] : 0;
    window[GLOBAL_SKIP_PROP] = Math.max(current, target);
  }
  function onPointerStart(event) {
    if (event.pointerType === "mouse") return;
    if (typeof event.button === "number" && event.button !== 0) return;
    lastTouchMs = lastTouchStartMs = nowMs();
    lastTouchDurationMs = 0;
    const target = findTapTarget(event.target);
    if (!target) return;
    if (consumeGhostTapGuard(target)) {
      clearGhostTapTarget(target);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function onTouchStart(event) {
    lastTouchMs = lastTouchStartMs = nowMs();
    lastTouchDurationMs = 0;
    const target = findTapTarget(event.target);
    if (!target) return;
    if (consumeGhostTapGuard(target)) {
      clearGhostTapTarget(target);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function onPointerEnd(event) {
    if (event.pointerType === "mouse") return;
    if (typeof event.button === "number" && event.button !== 0) return;
    const now = nowMs();
    if (lastTouchStartMs > 0) {
      lastTouchDurationMs = now - lastTouchStartMs;
    }
    lastTouchMs = now;
  }
  function onTouchEnd() {
    const now = nowMs();
    if (lastTouchStartMs > 0) {
      lastTouchDurationMs = now - lastTouchStartMs;
    }
    lastTouchMs = now;
  }
  function onClickCapture(event) {
    const now = nowMs();
    const sinceTouchStart = lastTouchStartMs > 0 ? now - lastTouchStartMs : -1;
    if (sinceTouchStart < 0) return;
    const target = findTapTarget(event.target);
    if (!target) return;
    const effectiveDuration = lastTouchDurationMs || sinceTouchStart;
    if (effectiveDuration >= longPressMs) {
      clearGhostTapTarget(target);
      lastTouchDurationMs = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (consumeGhostTapGuard(target)) {
      clearGhostTapTarget(target);
      lastTouchDurationMs = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    lastTouchDurationMs = 0;
  }
  function installGhostTapGuard(options = {}) {
    if (guardInstalled) return;
    const doc = getDocument();
    if (!doc || typeof window === "undefined") return;
    guardInstalled = true;
    hasPointerEvents = "PointerEvent" in window;
    hasTouchEvents = !hasPointerEvents && "ontouchstart" in window;
    if (options.selector) {
      selector = `${options.selector}, ${TARGET_SELECTOR}`;
    }
    if (Number.isFinite(options.longPressMs) && options.longPressMs >= 0) {
      longPressMs = options.longPressMs;
    }
    doc.addEventListener("click", onClickCapture, true);
    if (hasPointerEvents) {
      doc.addEventListener("pointerdown", onPointerStart, { capture: true, passive: false });
      doc.addEventListener("pointerup", onPointerEnd, { capture: true, passive: true });
    } else if (hasTouchEvents) {
      doc.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
      doc.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    }
  }
  function setGhostTapSelector(extraSelector) {
    if (!extraSelector) return;
    selector = `${extraSelector}, ${TARGET_SELECTOR}`;
  }
  var DEFAULT_TIMEOUT_MS, ELEMENT_SKIP_PROP, GLOBAL_SKIP_PROP, TARGET_SELECTOR, DEFAULT_LONG_PRESS_MS, guardInstalled, selector, hasPointerEvents, hasTouchEvents, lastMarkedTarget, lastTouchMs, lastTouchStartMs, lastTouchDurationMs, longPressMs;
  var init_ghostTapGuard = __esm({
    "js/util/ghostTapGuard.js"() {
      DEFAULT_TIMEOUT_MS = 0;
      ELEMENT_SKIP_PROP = Symbol("ccc:ghostTap:skipUntil");
      GLOBAL_SKIP_PROP = "__cccGhostTapSkipUntil";
      TARGET_SELECTOR = '[data-ghost-tap-target], button, [role="button"], [data-btn], .game-btn, .btn, .slot-card, a[href], input, select, textarea, summary';
      DEFAULT_LONG_PRESS_MS = 80;
      guardInstalled = false;
      selector = TARGET_SELECTOR;
      hasPointerEvents = false;
      hasTouchEvents = false;
      lastMarkedTarget = null;
      lastTouchMs = 0;
      lastTouchStartMs = 0;
      lastTouchDurationMs = 0;
      longPressMs = DEFAULT_LONG_PRESS_MS;
    }
  });

  // js/ui/merchantDelve/dlgTab.js
  function hasMetMerchant() {
    try {
      return localStorage.getItem(sk(MERCHANT_MET_KEY_BASE2)) === "1";
    } catch {
      return false;
    }
  }
  function bindRapidActivation(target, handler, { once = false } = {}) {
    if (!target || typeof handler !== "function") return () => {
    };
    let used = false;
    let pointerTriggered = false;
    let activePointerId = null;
    const run = (event) => {
      if (once && used) return;
      if (event?.type === "click" && shouldSkipGhostTap(target)) {
        event.preventDefault?.();
        return;
      }
      markGhostTapTarget(target);
      used = once ? true : used;
      Promise.resolve(handler(event)).catch(() => {
      });
      if (once) cleanup();
    };
    const resetPointerTrigger = () => {
      pointerTriggered = false;
      activePointerId = null;
    };
    const onClick = (event) => {
      if (pointerTriggered) {
        resetPointerTrigger();
        return;
      }
      run(event);
    };
    const onPointerDown = (event) => {
      if (event.pointerType === "mouse") return;
      if (typeof event.button === "number" && event.button !== 0) return;
      pointerTriggered = true;
      activePointerId = typeof event.pointerId === "number" ? event.pointerId : null;
      suppressNextGhostTap(160);
    };
    const onPointerUp = (event) => {
      if (!pointerTriggered) return;
      if (activePointerId != null && typeof event.pointerId === "number" && event.pointerId !== activePointerId) {
        return;
      }
      resetPointerTrigger();
      run(event);
    };
    const onPointerCancel = () => {
      if (!pointerTriggered) return;
      resetPointerTrigger();
    };
    const onTouchStart2 = (event) => {
      pointerTriggered = true;
      suppressNextGhostTap(160);
    };
    const onTouchEnd2 = (event) => {
      if (!pointerTriggered) return;
      resetPointerTrigger();
      run(event);
    };
    const onTouchCancel = () => {
      if (!pointerTriggered) return;
      resetPointerTrigger();
    };
    const cleanup = () => {
      target.removeEventListener("click", onClick);
      if (HAS_POINTER_EVENTS) {
        target.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      } else if (HAS_TOUCH_EVENTS) {
        target.removeEventListener("touchstart", onTouchStart2);
        window.removeEventListener("touchend", onTouchEnd2);
        window.removeEventListener("touchcancel", onTouchCancel);
      }
    };
    target.addEventListener("click", onClick);
    if (HAS_POINTER_EVENTS) {
      target.addEventListener("pointerdown", onPointerDown, { passive: false });
      window.addEventListener("pointerup", onPointerUp, { passive: false });
      window.addEventListener("pointercancel", onPointerCancel, { passive: false });
    } else if (HAS_TOUCH_EVENTS) {
      target.addEventListener("touchstart", onTouchStart2, { passive: false });
      window.addEventListener("touchend", onTouchEnd2, { passive: false });
      window.addEventListener("touchcancel", onTouchCancel, { passive: false });
    }
    return cleanup;
  }
  function dialogueStatusRank(status) {
    return DIALOGUE_STATUS_ORDER[status] ?? 0;
  }
  function snapshotLockDisplay(info) {
    if (!info || typeof info !== "object") return null;
    return {
      title: info.title ?? null,
      blurb: info.blurb ?? null,
      tooltip: info.tooltip ?? null,
      message: info.message ?? null,
      icon: info.icon ?? null,
      headerTitle: info.headerTitle ?? null,
      ariaLabel: info.ariaLabel ?? null
    };
  }
  function buildUnlockedDialogueInfo(meta) {
    return {
      status: "unlocked",
      unlocked: true,
      title: meta.title,
      blurb: meta.blurb,
      tooltip: "",
      message: "",
      icon: null,
      headerTitle: null,
      ariaLabel: meta.title || "Merchant dialogue"
    };
  }
  function bigNumToSafeInteger(value) {
    if (value && typeof value === "object") {
      if (typeof value.toPlainIntegerString === "function") {
        try {
          const plain = value.toPlainIntegerString();
          if (plain != null) {
            const parsed = Number.parseInt(plain, 10);
            if (Number.isFinite(parsed)) return parsed;
          }
        } catch {
        }
      }
      if (typeof value.toString === "function") {
        try {
          const str = value.toString();
          if (str != null) {
            const parsed = Number.parseInt(str, 10);
            if (Number.isFinite(parsed)) return parsed;
          }
        } catch {
        }
      }
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    if (numeric <= 0) return 0;
    return Math.floor(numeric);
  }
  function getPlayerProgress() {
    const progress = {
      xpUnlocked: false,
      xpLevel: 0,
      hasForgeReset: false
    };
    try {
      progress.xpUnlocked = typeof isXpSystemUnlocked === "function" && isXpSystemUnlocked();
    } catch {
      progress.xpUnlocked = false;
    }
    if (progress.xpUnlocked) {
      try {
        const state = typeof getXpState === "function" ? getXpState() : null;
        if (state && typeof state === "object") {
          progress.xpLevel = bigNumToSafeInteger(state.xpLevel);
        }
      } catch {
        progress.xpLevel = 0;
      }
    }
    try {
      progress.hasForgeReset = typeof hasDoneForgeReset === "function" && hasDoneForgeReset();
    } catch {
      progress.hasForgeReset = false;
    }
    return progress;
  }
  function resolveDialogueLock(meta, progress) {
    let rawState;
    try {
      rawState = typeof meta.unlock === "function" ? meta.unlock(progress) : true;
    } catch {
      rawState = false;
    }
    const rawObj = rawState && typeof rawState === "object" ? rawState : null;
    let status = "locked";
    if (rawState === true) {
      status = "unlocked";
    } else if (rawObj) {
      const normalized = String(rawObj.status ?? "").toLowerCase();
      if (normalized === "unlocked" || rawObj.unlocked === true) {
        status = "unlocked";
      } else if (normalized === "mysterious") {
        status = "mysterious";
      } else {
        status = "locked";
      }
    } else if (rawState === false || rawState == null) {
      status = "locked";
    }
    const info = {
      status,
      unlocked: status === "unlocked",
      title: status === "unlocked" ? meta.title : "???",
      blurb: status === "unlocked" ? meta.blurb : status === "mysterious" ? DEFAULT_MYSTERIOUS_BLURB : DEFAULT_LOCKED_BLURB,
      tooltip: "",
      message: "",
      icon: null,
      headerTitle: null,
      ariaLabel: ""
    };
    if (status === "unlocked") {
      info.ariaLabel = meta.title || "Merchant dialogue";
      return info;
    }
    info.title = rawObj?.title ?? "???";
    info.blurb = rawObj?.requirement ?? rawObj?.message ?? rawObj?.tooltip ?? (status === "mysterious" ? DEFAULT_MYSTERIOUS_BLURB : DEFAULT_LOCKED_BLURB);
    info.tooltip = rawObj?.tooltip ?? (status === "locked" ? "Locked Dialogue" : "Hidden Dialogue");
    info.message = rawObj?.message ?? (status === "mysterious" ? DEFAULT_LOCK_MESSAGE : "");
    info.icon = rawObj?.icon ?? (status === "mysterious" ? MYSTERIOUS_ICON_SRC : null);
    info.headerTitle = rawObj?.headerTitle ?? (status === "mysterious" ? HIDDEN_DIALOGUE_TITLE : LOCKED_DIALOGUE_TITLE);
    info.ariaLabel = rawObj?.ariaLabel ?? (status === "mysterious" ? "Hidden merchant dialogue" : "Locked merchant dialogue");
    return info;
  }
  function ensureProgressEvents() {
    if (progressEventsBound) return;
    progressEventsBound = true;
    const handler = onProgressChanged;
    if (typeof window !== "undefined") {
      window.addEventListener("xp:change", handler);
      window.addEventListener("xp:unlock", handler);
    }
    document.addEventListener("ccc:upgrades:changed", handler);
    const slot = getActiveSlot();
    if (slot != null) {
      const key = `${FORGE_COMPLETED_KEY_BASE}:${slot}`;
      watchStorageKey(key, { onChange: handler });
    }
  }
  function onProgressChanged() {
    renderDialogueList();
  }
  function completeDialogueOnce(id, meta) {
    const state = loadDlgState();
    const k = String(id);
    const prev = state[k] || {};
    if (meta.once && prev.claimed) return false;
    prev.claimed = true;
    state[k] = prev;
    saveDlgState(state);
    grantReward(meta.reward);
    return true;
  }
  function grantReward(reward) {
    if (!reward) return;
    if (reward.type === "coins") {
      try {
        bank.coins.add(reward.amount);
      } catch (e) {
        console.warn("Failed to grant coin reward:", reward, e);
      }
      return;
    }
    if (reward.type === "books") {
      try {
        bank.books.addWithMultiplier?.(reward.amount) ?? bank.books.add(reward.amount);
      } catch (e) {
        console.warn("Failed to grant book reward:", reward, e);
      }
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("merchantReward", { detail: reward }));
    } catch {
    }
  }
  function rewardLabel(reward) {
    if (!reward) return "";
    if (reward.type === "coins") return `Reward: ${reward.amount} coins`;
    if (reward.type === "books") return `Reward: ${reward.amount} Books`;
    return "Reward available";
  }
  function loadDlgState() {
    try {
      return JSON.parse(localStorage.getItem(sk(MERCHANT_DLG_STATE_KEY_BASE)) || "{}");
    } catch {
      return {};
    }
  }
  function saveDlgState(s) {
    const key = sk(MERCHANT_DLG_STATE_KEY_BASE);
    try {
      const payload = JSON.stringify(s);
      localStorage.setItem(key, payload);
      try {
        primeStorageWatcherSnapshot(key, payload);
      } catch {
      }
    } catch {
    }
  }
  function parseDlgStateRaw(raw) {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  function cleanupMerchantDlgStateWatcher() {
    const stop = merchantDlgWatcherCleanup;
    merchantDlgWatcherCleanup = null;
    if (typeof stop === "function") {
      try {
        stop();
      } catch {
      }
    }
  }
  function handleMerchantDlgStateChange(_, meta = {}) {
    if (!meta?.rawChanged) return;
    renderDialogueList();
  }
  function bindMerchantDlgStateWatcherForSlot(slot) {
    if (slot === merchantDlgWatcherSlot) return;
    cleanupMerchantDlgStateWatcher();
    merchantDlgWatcherSlot = slot ?? null;
    if (slot == null) {
      renderDialogueList();
      return;
    }
    const storageKey = `${MERCHANT_DLG_STATE_KEY_BASE}:${slot}`;
    merchantDlgWatcherCleanup = watchStorageKey(storageKey, {
      parse: parseDlgStateRaw,
      onChange: handleMerchantDlgStateChange
    });
    try {
      primeStorageWatcherSnapshot(storageKey);
    } catch {
    }
    renderDialogueList();
  }
  function ensureMerchantDlgStateWatcher() {
    if (merchantDlgWatcherInitialized) {
      bindMerchantDlgStateWatcherForSlot(getActiveSlot());
      return;
    }
    merchantDlgWatcherInitialized = true;
    bindMerchantDlgStateWatcherForSlot(getActiveSlot());
    if (typeof window !== "undefined") {
      window.addEventListener("saveSlot:change", () => {
        bindMerchantDlgStateWatcherForSlot(getActiveSlot());
      });
    }
  }
  function ensureAudioCtx() {
    if (!__audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      __audioCtx = new Ctx();
    }
    if (!__typingGain) {
      __typingGain = __audioCtx.createGain();
      __typingGain.gain.value = IS_MOBILE ? 0.15 : 0.3;
      __typingGain.connect(__audioCtx.destination);
    }
  }
  function pickSupportedSrc() {
    return TYPING_SFX_SOURCE[0];
  }
  async function loadTypingBuffer() {
    ensureAudioCtx();
    if (__typingBuffer) return __typingBuffer;
    if (__bufferLoadPromise) return __bufferLoadPromise;
    const url = pickSupportedSrc();
    __bufferLoadPromise = (async () => {
      const res = await fetch(url, { cache: "force-cache" });
      const arr = await res.arrayBuffer();
      return await __audioCtx.decodeAudioData(arr);
    })().then((buf) => __typingBuffer = buf).catch((err) => {
      console.warn("Typing SFX decode failed:", err);
      __bufferLoadPromise = null;
    });
    return __bufferLoadPromise;
  }
  function ensureTypingAudioElement() {
    if (__typingSfx) return __typingSfx;
    const a = new Audio();
    a.loop = true;
    a.preload = "auto";
    a.muted = false;
    a.volume = 1;
    const url = pickSupportedSrc();
    a.src = url;
    __typingSfx = a;
    return a;
  }
  function ensureElementGraph() {
    ensureAudioCtx();
    ensureTypingAudioElement();
    if (!__typingSource) {
      __typingSource = __audioCtx.createMediaElementSource(__typingSfx);
      __typingSource.connect(__typingGain);
    }
  }
  function setTypingGainForDevice() {
    if (!__typingGain) return;
    __typingGain.gain.value = IS_MOBILE ? 0.15 : 0.3;
  }
  function primeTypingSfx() {
    if (__typingSfxPrimed) return;
    __typingSfxPrimed = true;
    ensureAudioCtx();
    __audioCtx.resume().catch(() => {
    });
    loadTypingBuffer();
    const a = ensureTypingAudioElement();
    ensureElementGraph();
    const prevLoop = a.loop;
    const prevMuted = a.muted;
    a.loop = false;
    a.muted = true;
    a.play().then(() => {
      a.pause();
      a.currentTime = 0;
    }).catch((err) => {
      if (err.name !== "AbortError") {
        console.warn("Typing SFX prime error:", err);
        __typingSfxPrimed = false;
      }
    }).finally(() => {
      a.loop = prevLoop;
      a.muted = prevMuted;
    });
  }
  async function startTypingSfx() {
    ensureAudioCtx();
    await __audioCtx.resume().catch(() => {
    });
    await loadTypingBuffer();
    if (__isTypingActive && __typingBuffer) {
      if (__bufferSource) {
        try {
          __bufferSource.stop(0);
        } catch {
        }
        try {
          __bufferSource.disconnect();
        } catch {
        }
        __bufferSource = null;
      }
      __bufferSource = __audioCtx.createBufferSource();
      __bufferSource.buffer = __typingBuffer;
      __bufferSource.loop = true;
      __bufferSource.connect(__typingGain);
      __bufferSource.start(0);
      return;
    }
    ensureElementGraph();
    if (__isTypingActive && __typingSfx) {
      __typingSfx.currentTime = 0;
      try {
        await __typingSfx.play();
      } catch {
        const once = () => {
          if (__isTypingActive) __typingSfx.play().catch(() => {
          });
          document.removeEventListener("click", once);
        };
        document.addEventListener("click", once, { once: true });
      }
    }
  }
  function stopTypingSfx() {
    if (__bufferSource) {
      try {
        __bufferSource.stop(0);
      } catch {
      }
      try {
        __bufferSource.disconnect();
      } catch {
      }
      __bufferSource = null;
    }
    if (__typingSfx) {
      __typingSfx.pause();
      __typingSfx.currentTime = 0;
    }
  }
  function typeText(el, full, msPerChar = 22, skipTargets = []) {
    return new Promise((resolve) => {
      let i = 0, skipping = false;
      let armed = false;
      __isTypingActive = true;
      startTypingSfx();
      const skip = (e) => {
        if (!armed) return;
        e.preventDefault();
        skipping = true;
      };
      const onKey = (e) => {
        if (!armed) return;
        if (e.key === "Enter" || e.key === " ") skipping = true;
      };
      const targets = skipTargets.length ? skipTargets : [el];
      requestAnimationFrame(() => {
        armed = true;
        targets.forEach((t) => t.addEventListener("click", skip, { once: true }));
        document.addEventListener("keydown", onKey, { once: true });
      });
      el.classList.add("is-typing");
      el.textContent = "";
      const cleanup = () => {
        targets.forEach((t) => t.removeEventListener("click", skip));
        document.removeEventListener("keydown", onKey);
        el.classList.remove("is-typing");
        stopTypingSfx();
        __isTypingActive = false;
      };
      const tick = () => {
        if (skipping) {
          el.textContent = full;
          cleanup();
          resolve();
          return;
        }
        el.textContent = full.slice(0, i++);
        if (i <= full.length) setTimeout(tick, msPerChar);
        else {
          cleanup();
          resolve();
        }
      };
      tick();
    });
  }
  function openDialogueLockInfo(lockInfo = {}) {
    if (!merchantOverlayEl) return;
    primeTypingSfx();
    const overlay = document.createElement("div");
    overlay.className = "merchant-firstchat merchant-lockinfo";
    overlay.setAttribute("data-dismissible", "1");
    overlay.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="${lockInfo.ariaLabel || HIDDEN_DIALOGUE_TITLE}">
      <div class="merchant-firstchat__header">
        <div class="name"></div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row merchant-lockinfo__row">
        <img class="merchant-firstchat__icon" src="${lockInfo.icon || MYSTERIOUS_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text merchant-lockinfo__message"></div>
      </div>
      <div class="merchant-firstchat__actions merchant-lockinfo__actions">
        <button type="button" class="merchant-firstchat__continue merchant-lockinfo__close">Close</button>
      </div>
    </div>
  `;
    merchantOverlayEl.appendChild(overlay);
    const cardEl = overlay.querySelector(".merchant-firstchat__card");
    const nameEl = overlay.querySelector(".merchant-firstchat__header .name");
    const messageEl = overlay.querySelector(".merchant-lockinfo__message");
    const closeBtn = overlay.querySelector(".merchant-lockinfo__close");
    nameEl.textContent = lockInfo.headerTitle || HIDDEN_DIALOGUE_TITLE;
    messageEl.textContent = lockInfo.message || DEFAULT_LOCK_MESSAGE;
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    merchantOverlayEl.classList.add("firstchat-active");
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      overlay.classList.remove("is-visible");
      merchantOverlayEl.classList.remove("firstchat-active");
      stopTypingSfx();
      __isTypingActive = false;
      document.removeEventListener("keydown", onEsc, true);
      setTimeout(() => overlay.remove(), 160);
    };
    const onEsc = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
    };
    document.addEventListener("keydown", onEsc, true);
    overlay.addEventListener("pointerdown", (e) => {
      if (!cardEl.contains(e.target)) {
        e.preventDefault();
        blockInteraction(160);
        close();
      }
    });
    const doCloseFromBtn = (e) => {
      if (!e || e.pointerType !== "mouse") blockInteraction(160);
      close();
    };
    bindRapidActivation(closeBtn, () => {
      doCloseFromBtn();
    }, { once: true });
    closeBtn.focus?.();
  }
  function openDialogueModal(id, meta) {
    primeTypingSfx();
    const overlay = document.createElement("div");
    overlay.className = "merchant-firstchat";
    overlay.setAttribute("data-dismissible", "1");
    overlay.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="${meta.title}">
      <div class="merchant-firstchat__header">
        <div class="name">Merchant</div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row">
        <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text">\u2026</div>
      </div>
      <div class="merchant-firstchat__choices"></div>
    </div>
  `;
    merchantOverlayEl.appendChild(overlay);
    const onEscToCancel = (e) => {
      if (e.key !== "Escape") return;
      if (!overlay.isConnected) return;
      cancelWithoutReward();
    };
    document.addEventListener("keydown", onEscToCancel, { capture: true });
    requestAnimationFrame(() => overlay.classList.add("is-visible"));
    merchantOverlayEl.classList.add("firstchat-active");
    const textEl = overlay.querySelector(".merchant-firstchat__text");
    const rowEl = overlay.querySelector(".merchant-firstchat__row");
    const cardEl = overlay.querySelector(".merchant-firstchat__card");
    const choicesEl = overlay.querySelector(".merchant-firstchat__choices");
    let ended = false;
    const closeModal = () => {
      document.removeEventListener("keydown", onEscToCancel, { capture: true });
      overlay.classList.remove("is-visible");
      merchantOverlayEl.classList.remove("firstchat-active");
      stopTypingSfx();
      __isTypingActive = false;
      setTimeout(() => overlay.remove(), 160);
    };
    const cancelWithoutReward = () => {
      if (ended) return;
      ended = true;
      closeModal();
      renderDialogueList();
    };
    overlay.addEventListener("pointerdown", (e) => {
      if (!cardEl.contains(e.target)) {
        e.preventDefault();
        if (e.pointerType !== "mouse") blockInteraction(160);
        cancelWithoutReward();
      }
    });
    const engine = new DialogueEngine({
      textEl,
      choicesEl,
      skipTargets: [textEl, rowEl, cardEl],
      onEnd: (info) => {
        if (ended) return;
        ended = true;
        if (info && info.noReward) {
          closeModal();
          renderDialogueList();
          return;
        }
        completeDialogueOnce(id, meta);
        closeModal();
        renderDialogueList();
      }
    });
    const state = loadDlgState();
    const claimed = !!state[id]?.claimed;
    const script = structuredClone(MERCHANT_DIALOGUES[meta.scriptId]);
    if (claimed && script.nodes.m2b && script.nodes.c2a && meta.scriptId === 1) {
      script.nodes.m2b.say = "I've already given you Coins, goodbye.";
      script.nodes.c2a.options = [
        { label: "Goodbye.", to: "end_nr" },
        { label: "Goodbye.", to: "end_nr" },
        { label: "Goodbye.", to: "end_nr" }
      ];
    }
    if (claimed && meta.scriptId === 2 && script.nodes.m2a) {
      script.nodes.m2a.say = "I've already given you Books, goodbye.";
      if (script.nodes.c2a) {
        script.nodes.c2a.options = [
          { label: "Goodbye.", to: "end_nr" },
          { label: "Goodbye.", to: "end_nr" },
          { label: "Goodbye.", to: "end_nr" }
        ];
      }
    }
    engine.load(script);
    engine.start();
  }
  function ensureMerchantScrollbar() {
    const scroller = merchantOverlayEl?.querySelector(".merchant-content");
    if (!scroller || scroller.__customScroll) return;
    if (!merchantSheetEl) return;
    const bar = document.createElement("div");
    bar.className = "merchant-scrollbar";
    const thumb = document.createElement("div");
    thumb.className = "merchant-scrollbar__thumb";
    bar.appendChild(thumb);
    merchantSheetEl.appendChild(bar);
    const isTouch = window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches;
    const FADE_SCROLL_MS = 150;
    const FADE_DRAG_MS = 120;
    const supportsScrollEnd = "onscrollend" in window;
    let fadeTimer = null;
    const syncScrollShadow = () => {
      const hasShadow = (scroller.scrollTop || 0) > 0;
      merchantSheetEl?.classList.toggle("has-scroll-shadow", hasShadow);
    };
    const updateBounds = () => {
      const grabber = merchantOverlayEl.querySelector(".merchant-grabber");
      const header = merchantOverlayEl.querySelector(".merchant-header");
      const actions = merchantOverlayEl.querySelector(".merchant-actions");
      const top = (grabber?.offsetHeight || 0) + (header?.offsetHeight || 0) | 0;
      const bottom = (actions?.offsetHeight || 0) | 0;
      bar.style.top = top + "px";
      bar.style.bottom = bottom + "px";
    };
    const updateThumb = () => {
      const { scrollHeight, clientHeight, scrollTop } = scroller;
      const barH = bar.clientHeight || 1;
      const visibleRatio = clientHeight / Math.max(1, scrollHeight);
      const thumbH = Math.max(28, Math.round(barH * visibleRatio));
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      const range = Math.max(0, barH - thumbH);
      const y = Math.round(scrollTop / maxScroll * range);
      thumb.style.height = thumbH + "px";
      thumb.style.transform = `translateY(${y}px)`;
      bar.style.display = scrollHeight <= clientHeight + 1 ? "none" : "";
    };
    const updateAll = () => {
      updateBounds();
      updateThumb();
      syncScrollShadow();
    };
    const showBar = () => {
      if (!isTouch) return;
      merchantSheetEl.classList.add("is-scrolling");
      if (fadeTimer) clearTimeout(fadeTimer);
    };
    const scheduleHide = (delay) => {
      if (!isTouch) return;
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
        merchantSheetEl.classList.remove("is-scrolling");
      }, delay);
    };
    const onScroll = () => {
      updateThumb();
      syncScrollShadow();
      if (isTouch) showBar();
      if (!supportsScrollEnd) scheduleHide(FADE_SCROLL_MS);
    };
    const onScrollEnd = () => scheduleHide(FADE_SCROLL_MS);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) {
      scroller.addEventListener("scrollend", onScrollEnd, { passive: true });
    }
    const ro = new ResizeObserver(updateAll);
    ro.observe(scroller);
    window.addEventListener("resize", updateAll);
    requestAnimationFrame(updateAll);
    let dragging = false;
    let dragStartY = 0;
    let startScrollTop = 0;
    const startDrag = (e) => {
      dragging = true;
      dragStartY = e.clientY;
      startScrollTop = scroller.scrollTop;
      thumb.classList.add("dragging");
      showBar();
      try {
        thumb.setPointerCapture(e.pointerId);
      } catch {
      }
      e.preventDefault();
    };
    const onDragMove2 = (e) => {
      if (!dragging) return;
      const barH = bar.clientHeight || 1;
      const thH = thumb.clientHeight || 1;
      const range = Math.max(1, barH - thH);
      const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      const deltaY = e.clientY - dragStartY;
      const scrollDelta = deltaY / range * scrollMax;
      scroller.scrollTop = startScrollTop + scrollDelta;
    };
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove("dragging");
      scheduleHide(FADE_DRAG_MS);
      try {
        thumb.releasePointerCapture(e.pointerId);
      } catch {
      }
    };
    thumb.addEventListener("pointerdown", startDrag);
    window.addEventListener("pointermove", onDragMove2, { passive: true });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    bar.addEventListener("pointerdown", (e) => {
      if (e.target === thumb) return;
      const rect = bar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const barH = bar.clientHeight || 1;
      const thH = thumb.clientHeight || 1;
      const range = Math.max(0, barH - thH);
      const targetY = Math.max(0, Math.min(clickY - thH / 2, range));
      const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = targetY / Math.max(1, range) * scrollMax;
      showBar();
      scheduleHide(FADE_SCROLL_MS);
    });
    scroller.__customScroll = { bar, thumb, ro, updateAll };
  }
  function ensureMerchantOverlay() {
    if (merchantOverlayEl) return;
    merchantOverlayEl = document.createElement("div");
    merchantOverlayEl.className = "merchant-overlay";
    merchantOverlayEl.id = "merchant-overlay";
    merchantOverlayEl.setAttribute("inert", "");
    merchantSheetEl = document.createElement("div");
    merchantSheetEl.className = "merchant-sheet";
    merchantSheetEl.setAttribute("role", "dialog");
    merchantSheetEl.setAttribute("aria-modal", "false");
    merchantSheetEl.setAttribute("aria-label", "Merchant");
    const grabber = document.createElement("div");
    grabber.className = "merchant-grabber";
    grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;
    const header = document.createElement("header");
    header.className = "merchant-header";
    header.innerHTML = `
    <div class="merchant-title">Merchant</div>
    <div class="merchant-line" aria-hidden="true"></div>
  `;
    const content = document.createElement("div");
    content.className = "merchant-content";
    const tabs = document.createElement("div");
    tabs.className = "merchant-tabs";
    tabs.setAttribute("role", "tablist");
    const panelsWrap = document.createElement("div");
    panelsWrap.className = "merchant-panels";
    const panelDialogue = document.createElement("section");
    panelDialogue.className = "merchant-panel is-active";
    panelDialogue.id = "merchant-panel-dialogue";
    const panelReset = document.createElement("section");
    panelReset.className = "merchant-panel";
    panelReset.id = "merchant-panel-reset";
    const panelMinigames = document.createElement("section");
    panelMinigames.className = "merchant-panel";
    panelMinigames.id = "merchant-panel-minigames";
    const resetUnlocked = (() => {
      try {
        return !!isForgeUnlocked?.();
      } catch {
        return false;
      }
    })();
    merchantTabUnlockState.set("reset", resetUnlocked);
    MERCHANT_TABS_DEF.forEach((def) => {
      if (def.key === "dialogue") merchantTabUnlockState.set("dialogue", true);
      const stored = merchantTabUnlockState.get(def.key);
      const unlocked = stored != null ? stored : !!def.unlocked;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "merchant-tab";
      btn.dataset.tab = def.key;
      const lockedLabel = def.lockedLabel || "???";
      btn.textContent = unlocked ? def.label : lockedLabel;
      if (!unlocked) {
        btn.classList.add("is-locked");
        btn.disabled = true;
        btn.title = "???";
      } else {
        btn.title = def.label || "Tab";
      }
      def.unlocked = unlocked;
      merchantTabUnlockState.set(def.key, unlocked);
      bindRapidActivation(btn, (event) => {
        if (btn.disabled) {
          event?.preventDefault?.();
          return;
        }
        selectMerchantTab(def.key);
      });
      tabs.appendChild(btn);
      merchantTabs.buttons[def.key] = btn;
    });
    merchantTabs.panels["dialogue"] = panelDialogue;
    merchantTabs.panels["reset"] = panelReset;
    merchantTabs.panels["minigames"] = panelMinigames;
    merchantTabs.tablist = tabs;
    panelsWrap.append(panelDialogue, panelReset, panelMinigames);
    content.append(tabs, panelsWrap);
    try {
      initResetSystem();
    } catch {
    }
    try {
      initResetPanel(panelReset);
    } catch {
    }
    try {
      updateResetPanel();
    } catch {
    }
    try {
      if (isForgeUnlocked?.()) {
        unlockMerchantTabs(["reset"]);
      }
    } catch {
    }
    const actions = document.createElement("div");
    actions.className = "merchant-actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "merchant-close";
    closeBtn.textContent = "Close";
    merchantCloseBtn = closeBtn;
    actions.appendChild(closeBtn);
    const firstChat = document.createElement("div");
    firstChat.className = "merchant-firstchat merchant-firstchat--initial";
    firstChat.innerHTML = `
    <div class="merchant-firstchat__card" role="dialog" aria-label="First chat">
      <div class="merchant-firstchat__header">
        <div class="name">Merchant</div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row">
        <img class="merchant-firstchat__icon" src="${MERCHANT_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text" id="merchant-first-line">\u2026</div>
      </div>
      <div class="merchant-firstchat__choices" id="merchant-first-choices"></div>
    </div>
  `;
    merchantSheetEl.append(grabber, header, content, actions, firstChat);
    merchantOverlayEl.appendChild(merchantSheetEl);
    document.body.appendChild(merchantOverlayEl);
    initDialogueTab();
    ensureMerchantScrollbar();
    if (!merchantEventsBound) {
      merchantEventsBound = true;
      const onCloseClick = () => {
        closeMerchant();
      };
      bindRapidActivation(closeBtn, onCloseClick, { once: false });
      document.addEventListener("keydown", onKeydownForMerchant);
      grabber.addEventListener("pointerdown", onMerchantDragStart);
      grabber.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
      merchantOverlayEl.addEventListener("pointerdown", primeTypingSfx, { once: true });
    }
  }
  function initDialogueTab() {
    const panel = document.getElementById("merchant-panel-dialogue");
    if (!panel || panel.__dlgInit) return;
    panel.__dlgInit = true;
    const list = document.createElement("div");
    list.className = "merchant-dialogue-list";
    panel.appendChild(list);
    panel.__dlgList = list;
    ensureProgressEvents();
    renderDialogueList();
  }
  function renderDialogueList() {
    const panel = document.getElementById("merchant-panel-dialogue");
    if (!panel) return;
    const list = panel.__dlgList;
    if (!list) return;
    const progress = getPlayerProgress();
    const state = loadDlgState();
    let stateDirty = false;
    list.innerHTML = "";
    Object.entries(DLG_CATALOG).forEach(([id, meta]) => {
      const entryState = state[id] || {};
      const storedStatus = entryState.status || "locked";
      const storedRank = dialogueStatusRank(storedStatus);
      let lockInfo = resolveDialogueLock(meta, progress);
      let status = lockInfo.status;
      let rank = dialogueStatusRank(status);
      if (rank > storedRank) {
        entryState.status = status;
        if (status === "mysterious") {
          entryState.lockSnapshot = snapshotLockDisplay(lockInfo);
        } else if (status === "unlocked") {
          delete entryState.lockSnapshot;
        }
        state[id] = entryState;
        stateDirty = true;
      } else if (rank < storedRank) {
        if (storedStatus === "unlocked") {
          lockInfo = buildUnlockedDialogueInfo(meta);
          status = "unlocked";
          rank = dialogueStatusRank(status);
        } else if (storedStatus === "mysterious") {
          const snapshot = entryState.lockSnapshot || snapshotLockDisplay(lockInfo) || {};
          lockInfo = {
            status: "mysterious",
            unlocked: false,
            title: snapshot.title ?? lockInfo.title ?? "???",
            blurb: snapshot.blurb ?? lockInfo.blurb ?? DEFAULT_MYSTERIOUS_BLURB,
            tooltip: snapshot.tooltip ?? lockInfo.tooltip ?? "Hidden Dialogue",
            message: snapshot.message ?? lockInfo.message ?? DEFAULT_LOCK_MESSAGE,
            icon: snapshot.icon ?? lockInfo.icon ?? MYSTERIOUS_ICON_SRC,
            headerTitle: snapshot.headerTitle ?? lockInfo.headerTitle ?? HIDDEN_DIALOGUE_TITLE,
            ariaLabel: snapshot.ariaLabel ?? lockInfo.ariaLabel ?? "Hidden merchant dialogue"
          };
          status = "mysterious";
          rank = dialogueStatusRank(status);
        }
      }
      const unlocked = status === "unlocked";
      const isMysterious = status === "mysterious";
      const locked = status === "locked";
      const claimed = !!entryState.claimed;
      const showComplete = unlocked && !!(meta.once && claimed);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "dlg-card";
      card.dataset.dlgStatus = status;
      card.disabled = !!locked;
      if (locked) {
        card.classList.add("is-locked");
        card.setAttribute("aria-disabled", "true");
        card.setAttribute("tabindex", "-1");
      } else {
        card.removeAttribute("aria-disabled");
        card.removeAttribute("tabindex");
      }
      if (isMysterious) {
        card.classList.add("is-mysterious");
      }
      const title = document.createElement("div");
      title.className = "dlg-title";
      title.textContent = unlocked ? meta.title : lockInfo.title ?? "???";
      const blurb = document.createElement("div");
      blurb.className = "dlg-blurb";
      blurb.textContent = unlocked ? meta.blurb : lockInfo.blurb ?? "";
      const reward = document.createElement("div");
      reward.className = "dlg-reward";
      if (unlocked && meta.reward) {
        if (meta.reward.type === "coins") {
          reward.classList.add("has-reward");
          reward.innerHTML = `
          <span class="reward-label">Reward:</span>
          <span class="coin">
            <span class="coin-icon" aria-hidden="true"></span>
            <span class="amt">${meta.reward.amount}</span>
          </span>
        `;
          reward.setAttribute("aria-label", `Reward: ${meta.reward.amount} coins`);
        } else if (meta.reward.type === "books") {
          reward.classList.add("has-reward");
          reward.innerHTML = `
          <span class="reward-label">Reward:</span>
          <span class="book">
            <span class="book-icon" aria-hidden="true"></span>
            <span class="amt">${meta.reward.amount}</span>
          </span>
        `;
          reward.setAttribute("aria-label", `Reward: ${meta.reward.amount} Books`);
        } else {
          reward.textContent = rewardLabel(meta.reward);
        }
      } else {
        reward.textContent = "";
      }
      const ariaLabel = unlocked ? `${meta.title}${showComplete ? " (completed)" : ""}` : lockInfo.ariaLabel || (isMysterious ? "Hidden merchant dialogue" : "Locked merchant dialogue");
      card.setAttribute("aria-label", ariaLabel);
      if (lockInfo.tooltip) {
        card.title = lockInfo.tooltip;
      } else if (unlocked) {
        card.title = "Left-click: Start Dialogue";
      } else {
        card.removeAttribute("title");
      }
      card.append(title, blurb, reward);
      if (showComplete) {
        card.classList.add("is-complete");
        const again = document.createElement("div");
        again.className = "dlg-again";
        again.textContent = "Ask Again?";
        card.classList.add("has-again");
        card.append(again);
      }
      list.appendChild(card);
      const handleCardClick = (event) => {
        if (card.classList.contains("is-locked") && !isMysterious) {
          event?.preventDefault?.();
          return;
        }
        if (unlocked) {
          openDialogueModal(id, meta);
        } else if (isMysterious) {
          openDialogueLockInfo(lockInfo);
        }
      };
      if (unlocked || isMysterious) {
        bindRapidActivation(card, handleCardClick);
      }
    });
    if (stateDirty) {
      saveDlgState(state);
    }
  }
  function runFirstMeet() {
    const fc = merchantOverlayEl.querySelector(".merchant-firstchat");
    const textEl = fc.querySelector("#merchant-first-line");
    const rowEl = fc.querySelector(".merchant-firstchat__row");
    const cardEl = fc.querySelector(".merchant-firstchat__card");
    const choicesEl = fc.querySelector("#merchant-first-choices");
    const engine = new DialogueEngine({
      textEl,
      choicesEl,
      skipTargets: [textEl, rowEl, cardEl],
      onEnd: () => {
        try {
          localStorage.setItem(sk(MERCHANT_MET_KEY_BASE2), "1");
        } catch {
        }
        try {
          window.dispatchEvent(new Event(MERCHANT_MET_EVENT));
        } catch {
        }
        fc.classList.remove("is-visible");
        merchantOverlayEl.classList.remove("firstchat-active");
      }
    });
    engine.load(MERCHANT_DIALOGUES[0]);
    engine.start();
  }
  function resetFirstChatOverlayState() {
    if (!merchantOverlayEl) return;
    const fc = merchantOverlayEl.querySelector(".merchant-firstchat--initial");
    if (!fc) return;
    fc.classList.remove("is-visible");
    const textEl = fc.querySelector("#merchant-first-line");
    if (textEl) {
      textEl.classList.remove("is-typing");
      textEl.textContent = "\u2026";
    }
    const choicesEl = fc.querySelector("#merchant-first-choices");
    if (choicesEl) {
      choicesEl.classList.remove("is-visible");
      choicesEl.style.opacity = "0";
      choicesEl.style.transform = "translateY(6px)";
      choicesEl.style.pointerEvents = "none";
      choicesEl.style.minHeight = "";
      choicesEl.innerHTML = "";
    }
    merchantOverlayEl.classList.remove("firstchat-active");
  }
  function openMerchant() {
    ensureMerchantOverlay();
    if (merchantOpen) return;
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && !merchantOverlayEl.contains(activeEl)) {
      merchantLastFocus = activeEl;
    } else {
      merchantLastFocus = null;
    }
    merchantOpen = true;
    let met = false;
    try {
      met = localStorage.getItem(sk(MERCHANT_MET_KEY_BASE2)) === "1";
    } catch {
      met = false;
    }
    if (!met) {
      merchantOverlayEl.classList.add("firstchat-instant");
    }
    merchantSheetEl.style.transition = "none";
    merchantSheetEl.style.transform = "";
    merchantOverlayEl.removeAttribute("inert");
    void merchantSheetEl.offsetHeight;
    requestAnimationFrame(() => {
      if (!merchantOverlayEl.classList.contains("firstchat-instant")) {
        merchantSheetEl.style.transition = "";
      }
      merchantOverlayEl.classList.add("is-open");
      blockInteraction(140);
      if (merchantCloseBtn && typeof merchantCloseBtn.focus === "function") {
        try {
          merchantCloseBtn.focus({ preventScroll: true });
        } catch {
        }
      }
      let last = "dialogue";
      try {
        last = localStorage.getItem(sk(MERCHANT_TAB_KEY_BASE)) || "dialogue";
      } catch {
      }
      selectMerchantTab(last);
      stopTypingSfx();
      if (!met) {
        const fc = merchantOverlayEl.querySelector(".merchant-firstchat");
        fc?.classList.add("is-visible");
        merchantOverlayEl.classList.add("firstchat-active");
        runFirstMeet();
      }
    });
  }
  function closeMerchant() {
    if (!merchantOpen) return;
    if (IS_MOBILE) {
      try {
        suppressNextGhostTap(100);
      } catch {
      }
      try {
        blockInteraction(80);
      } catch {
      }
    }
    merchantOpen = false;
    merchantSheetEl.style.transition = "";
    merchantSheetEl.style.transform = "";
    merchantOverlayEl.classList.remove("is-open");
    merchantOverlayEl.classList.remove("firstchat-instant");
    resetFirstChatOverlayState();
    const activeEl = document.activeElement;
    if (activeEl && merchantOverlayEl.contains(activeEl)) {
      let target = merchantLastFocus;
      if (!target || !target.isConnected) {
        target = document.querySelector('[data-btn="shop"], .btn-shop');
      }
      if (target && typeof target.focus === "function") {
        try {
          target.focus({ preventScroll: true });
        } catch {
        }
      }
    }
    merchantOverlayEl.setAttribute("inert", "");
    merchantLastFocus = null;
    stopTypingSfx();
    __isTypingActive = false;
  }
  function onKeydownForMerchant(e) {
    if (!merchantOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeMerchant();
    }
  }
  function onMerchantDragStart(e) {
    if (!merchantOpen) return;
    const clientY = typeof e.clientY === "number" ? e.clientY : e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    merchantDrag = {
      startY: clientY,
      lastY: clientY,
      startT: performance.now(),
      moved: 0,
      canceled: false
    };
    merchantSheetEl.style.transition = "none";
    window.addEventListener("pointermove", onMerchantDragMove, { passive: true });
    window.addEventListener("pointerup", onMerchantDragEnd);
    window.addEventListener("pointercancel", onMerchantDragCancel);
  }
  function onMerchantDragMove(e) {
    if (!merchantDrag || merchantDrag.canceled) return;
    const y = e.clientY;
    if (typeof y !== "number") return;
    const dy = Math.max(0, y - merchantDrag.startY);
    merchantDrag.lastY = y;
    merchantDrag.moved = dy;
    merchantSheetEl.style.transform = `translateY(${dy}px)`;
  }
  function onMerchantDragEnd() {
    if (!merchantDrag || merchantDrag.canceled) {
      cleanupMerchantDrag();
      return;
    }
    const dt = Math.max(1, performance.now() - merchantDrag.startT);
    const dy = merchantDrag.moved;
    const velocity = dy / dt;
    const shouldClose = velocity > 0.55 && dy > 40 || dy > 140;
    if (shouldClose) {
      suppressNextGhostTap(160);
      merchantSheetEl.style.transition = "transform 140ms ease-out";
      merchantSheetEl.style.transform = "translateY(100%)";
      setTimeout(() => {
        closeMerchant();
      }, 150);
    } else {
      merchantSheetEl.style.transition = "transform 180ms ease";
      merchantSheetEl.style.transform = "translateY(0)";
    }
    cleanupMerchantDrag();
  }
  function onMerchantDragCancel() {
    if (!merchantDrag) return;
    merchantDrag.canceled = true;
    merchantSheetEl.style.transition = "transform 180ms ease";
    merchantSheetEl.style.transform = "translateY(0)";
    cleanupMerchantDrag();
  }
  function cleanupMerchantDrag() {
    window.removeEventListener("pointermove", onMerchantDragMove);
    window.removeEventListener("pointerup", onMerchantDragEnd);
    window.removeEventListener("pointercancel", onMerchantDragCancel);
    merchantDrag = null;
  }
  function selectMerchantTab(key) {
    const def = MERCHANT_TABS_DEF.find((t) => t.key === key);
    const unlocked = merchantTabUnlockState.get(key);
    if (!def || !unlocked) key = "dialogue";
    for (const k in merchantTabs.buttons) {
      merchantTabs.buttons[k].classList.toggle("is-active", k === key);
    }
    for (const k in merchantTabs.panels) {
      merchantTabs.panels[k].classList.toggle("is-active", k === key);
    }
    try {
      localStorage.setItem(sk(MERCHANT_TAB_KEY_BASE), key);
    } catch {
    }
  }
  function unlockMerchantTabs(keys = []) {
    keys.forEach((key) => {
      const def = MERCHANT_TABS_DEF.find((t) => t.key === key);
      if (!def) return;
      merchantTabUnlockState.set(key, true);
      def.unlocked = true;
      const btn = merchantTabs.buttons[key];
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-locked");
        btn.textContent = def.label;
        btn.title = def.label || "Tab";
      }
    });
  }
  var MERCHANT_ICON_SRC, MERCHANT_MET_KEY_BASE2, MERCHANT_TAB_KEY_BASE, MERCHANT_DLG_STATE_KEY_BASE, MERCHANT_MET_EVENT, sk, MERCHANT_TABS_DEF, merchantTabUnlockState, MYSTERIOUS_ICON_SRC, HIDDEN_DIALOGUE_TITLE, LOCKED_DIALOGUE_TITLE, DEFAULT_MYSTERIOUS_BLURB, DEFAULT_LOCKED_BLURB, DEFAULT_LOCK_MESSAGE, DIALOGUE_STATUS_ORDER, FORGE_COMPLETED_KEY_BASE, HAS_POINTER_EVENTS, HAS_TOUCH_EVENTS, progressEventsBound, merchantDlgWatcherInitialized, merchantDlgWatcherSlot, merchantDlgWatcherCleanup, DLG_CATALOG, merchantOverlayEl, merchantSheetEl, merchantCloseBtn, merchantOpen, merchantDrag, merchantLastFocus, merchantEventsBound, merchantTabs, TYPING_SFX_SOURCE, __audioCtx, __typingGain, __typingBuffer, __bufferLoadPromise, __typingSfx, __typingSource, __bufferSource, __typingSfxPrimed, __isTypingActive, DialogueEngine;
  var init_dlgTab = __esm({
    "js/ui/merchantDelve/dlgTab.js"() {
      init_storage();
      init_bigNum();
      init_merchantDialogues();
      init_xpSystem();
      init_resetTab();
      init_shopOverlay();
      init_ghostTapGuard();
      init_main();
      MERCHANT_ICON_SRC = "img/misc/merchant.png";
      MERCHANT_MET_KEY_BASE2 = "ccc:merchantMet";
      MERCHANT_TAB_KEY_BASE = "ccc:merchantTab";
      MERCHANT_DLG_STATE_KEY_BASE = "ccc:merchant:dlgState";
      MERCHANT_MET_EVENT = "ccc:merchant:met";
      sk = (base) => `${base}:${getActiveSlot()}`;
      MERCHANT_TABS_DEF = [
        { key: "dialogue", label: "Dialogue", unlocked: true },
        { key: "reset", label: "Reset", unlocked: false, lockedLabel: "???" },
        { key: "minigames", label: "???", unlocked: false }
      ];
      merchantTabUnlockState = /* @__PURE__ */ new Map([
        ["dialogue", true],
        ["reset", false],
        ["minigames", false]
      ]);
      MYSTERIOUS_ICON_SRC = "img/misc/mysterious.png";
      HIDDEN_DIALOGUE_TITLE = "Hidden Dialogue";
      LOCKED_DIALOGUE_TITLE = "Locked Dialogue";
      DEFAULT_MYSTERIOUS_BLURB = "Hidden Dialogue";
      DEFAULT_LOCKED_BLURB = "Locked";
      DEFAULT_LOCK_MESSAGE = "Locked Dialogue";
      DIALOGUE_STATUS_ORDER = { locked: 0, mysterious: 1, unlocked: 2 };
      FORGE_COMPLETED_KEY_BASE = "ccc:reset:forge:completed";
      HAS_POINTER_EVENTS = typeof window !== "undefined" && "PointerEvent" in window;
      HAS_TOUCH_EVENTS = !HAS_POINTER_EVENTS && typeof window !== "undefined" && "ontouchstart" in window;
      progressEventsBound = false;
      merchantDlgWatcherInitialized = false;
      merchantDlgWatcherSlot = null;
      merchantDlgWatcherCleanup = null;
      DLG_CATALOG = {
        1: {
          title: "A Generous Gift",
          blurb: "The Merchant is feeling extra nice today",
          scriptId: 1,
          reward: { type: "coins", amount: 100 },
          unlock: (progress) => true,
          once: true
        },
        2: {
          title: "A New Experience",
          blurb: "Discuss the XP system with the Merchant",
          scriptId: 2,
          reward: { type: "books", amount: 5 },
          once: true,
          unlock: (progress) => {
            if (!progress?.xpUnlocked) {
              return {
                status: "mysterious",
                requirement: "Unlock the XP system to reveal this dialogue",
                message: "Unlock the XP system to reveal this dialogue",
                icon: MYSTERIOUS_ICON_SRC,
                headerTitle: HIDDEN_DIALOGUE_TITLE,
                ariaLabel: "Hidden merchant dialogue. Unlock the XP system to reveal this dialogue"
              };
            }
            return true;
          }
        },
        3: {
          title: "Edge of Mastery",
          blurb: "Placeholder musings earned through the Forge.",
          scriptId: 3,
          unlock: (progress) => {
            if (progress?.hasForgeReset) {
              return true;
            }
            if (!progress?.xpUnlocked || (progress?.xpLevel ?? 0) < 31) {
              return {
                status: "locked",
                title: "???",
                blurb: DEFAULT_LOCKED_BLURB,
                tooltip: "Locked Dialogue",
                ariaLabel: "Locked Dialogue."
              };
            }
            return {
              status: "mysterious",
              requirement: "Do a Forge reset to reveal this dialogue",
              message: "Do a Forge reset to reveal this dialogue",
              icon: MYSTERIOUS_ICON_SRC,
              headerTitle: HIDDEN_DIALOGUE_TITLE,
              ariaLabel: "Hidden merchant dialogue. Do a Forge reset to reveal this dialogue"
            };
          },
          once: false
        }
      };
      ensureMerchantDlgStateWatcher();
      merchantOverlayEl = null;
      merchantSheetEl = null;
      merchantCloseBtn = null;
      merchantOpen = false;
      merchantDrag = null;
      merchantLastFocus = null;
      merchantEventsBound = false;
      merchantTabs = { buttons: {}, panels: {}, tablist: null };
      TYPING_SFX_SOURCE = ["sounds/merchant_typing.mp3"];
      __audioCtx = null;
      __typingGain = null;
      __typingBuffer = null;
      __bufferLoadPromise = null;
      __typingSfx = null;
      __typingSource = null;
      __bufferSource = null;
      __typingSfxPrimed = false;
      __isTypingActive = false;
      window.matchMedia?.("(any-pointer: coarse)")?.addEventListener?.("change", setTypingGainForDevice);
      window.addEventListener("orientationchange", setTypingGainForDevice);
      DialogueEngine = class {
        constructor({ textEl, choicesEl, skipTargets, onEnd }) {
          this.textEl = textEl;
          this.choicesEl = choicesEl;
          this.skipTargets = skipTargets;
          this.onEnd = onEnd || (() => {
          });
          this.nodes = {};
          this.current = null;
          this.deferNextChoices = false;
          this._reservedH = 0;
        }
        load(script) {
          this.nodes = script.nodes || {};
          this.startId = script.start;
        }
        async start() {
          if (!this.startId) return;
          await this.goto(this.startId);
        }
        async goto(id) {
          const node = this.nodes[id];
          if (!node) return;
          this.current = id;
          if (node.type === "line") {
            const nextNode = this.nodes[node.next];
            if (!this.deferNextChoices && nextNode && nextNode.type === "choice") {
              this._renderChoices(nextNode.options || [], true);
            } else {
              this._hideChoices();
            }
            await typeText(this.textEl, node.say, node.msPerChar ?? 22, this.skipTargets);
            if (nextNode && nextNode.type === "choice") {
              this.current = node.next;
              if (this.deferNextChoices) {
                this.deferNextChoices = false;
                this._renderChoices(nextNode.options || [], false);
                this.choicesEl.style.minHeight = "";
                return;
              }
              this._revealPreparedChoices();
              return;
            }
            this.choicesEl.style.minHeight = "";
            if (node.next === "end" || node.end === true) return this.onEnd();
            if (node.next) return this.goto(node.next);
            return;
          }
          if (node.type === "choice") {
            this._renderChoices(node.options || [], false);
          }
        }
        _hideChoices() {
          this.choicesEl.classList.remove("is-visible");
          this._applyInlineChoiceHide();
        }
        _renderChoices(options, prepare = false) {
          this.choicesEl.innerHTML = "";
          for (const opt of options) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "choice";
            btn.textContent = opt.label;
            bindRapidActivation(btn, async (event) => {
              event?.stopPropagation?.();
              this._reservedH = this.choicesEl.offsetHeight | 0;
              this.choicesEl.style.minHeight = this._reservedH + "px";
              this._hideChoices();
              this.choicesEl.innerHTML = "";
              this.deferNextChoices = true;
              if (opt.to === "end") {
                return this.onEnd({ noReward: false });
              }
              if (opt.to === "end_nr") {
                return this.onEnd({ noReward: true });
              }
              await this.goto(opt.to);
            }, { once: true });
            this.choicesEl.appendChild(btn);
          }
          if (prepare) {
            this.choicesEl.classList.remove("is-visible");
            this._applyInlineChoiceHide();
            return;
          }
          this._clearInlineChoiceHide();
          requestAnimationFrame(() => this.choicesEl.classList.add("is-visible"));
        }
        _revealPreparedChoices() {
          this._clearInlineChoiceHide();
          requestAnimationFrame(() => this.choicesEl.classList.add("is-visible"));
        }
        _applyInlineChoiceHide() {
          this.choicesEl.style.opacity = "0";
          this.choicesEl.style.transform = "translateY(6px)";
          this.choicesEl.style.pointerEvents = "none";
        }
        _clearInlineChoiceHide() {
          this.choicesEl.style.opacity = "";
          this.choicesEl.style.transform = "";
          this.choicesEl.style.pointerEvents = "";
        }
      };
    }
  });

  // js/ui/shopOverlay.js
  function resolveUpgradeId(upgLike) {
    if (!upgLike) return null;
    const rawId = typeof upgLike.id !== "undefined" ? upgLike.id : upgLike;
    if (typeof rawId === "number") {
      return Number.isFinite(rawId) ? Math.trunc(rawId) : null;
    }
    if (typeof rawId === "string") {
      const parsed = Number.parseInt(rawId.trim(), 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }
  function isForgeUnlockUpgrade(upgLike) {
    return resolveUpgradeId(upgLike) === FORGE_UNLOCK_UPGRADE_ID;
  }
  function blockInteraction(ms = 140) {
    if (!IS_MOBILE) return;
    let shield = document.getElementById("ccc-tap-shield");
    if (!shield) {
      shield = document.createElement("div");
      shield.id = "ccc-tap-shield";
      Object.assign(shield.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        pointerEvents: "auto",
        background: "transparent"
      });
      const eat = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      ["pointerdown", "pointerup", "click", "touchstart", "touchend", "mousedown", "mouseup"].forEach((ev) => shield.addEventListener(ev, eat, { capture: true, passive: false }));
    }
    document.body.appendChild(shield);
    clearTimeout(shield.__t);
    shield.__t = setTimeout(() => shield.remove(), ms);
  }
  function openHmMilestoneDialog(lines) {
    const existing = document.querySelector(".hm-milestones-overlay");
    if (existing) existing.remove();
    const overlay = document.createElement("div");
    overlay.className = "hm-milestones-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Milestones");
    const dialog = document.createElement("div");
    dialog.className = "hm-milestones-dialog";
    const title = document.createElement("h3");
    title.className = "hm-milestones-title";
    title.textContent = "Milestones";
    const list = document.createElement("ul");
    list.className = "hm-milestones-list";
    for (const line of lines) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.className = "hm-milestone-text";
      if (line && typeof line === "object") {
        text.textContent = line.text ?? "";
        if (line.achieved) li.classList.add("hm-milestone-achieved");
      } else {
        text.textContent = line;
      }
      li.appendChild(text);
      list.appendChild(li);
    }
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "hm-milestones-close";
    closeBtn.textContent = "Close";
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKeydown);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    closeBtn.addEventListener("click", close);
    document.addEventListener("keydown", onKeydown);
    dialog.appendChild(title);
    dialog.appendChild(list);
    dialog.appendChild(closeBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    if (typeof closeBtn.focus === "function") {
      closeBtn.focus({ preventScroll: true });
    }
  }
  function stripTags(html) {
    return String(html ?? "").replace(/<[^>]*>/g, "");
  }
  function createSfxPlayer({ src, mobileVolume, desktopVolume }) {
    let base = null;
    let ac = null;
    let gain = null;
    let buffer = null;
    let bufferPromise = null;
    let bufferPromiseHandled = false;
    let pendingPlays = 0;
    function ensureBase() {
      if (base) return base;
      const preloaded = takePreloadedAudio(src);
      const el = preloaded || new Audio(src);
      el.preload = "auto";
      el.playsInline = true;
      el.crossOrigin = "anonymous";
      el.load?.();
      base = el;
      return base;
    }
    function ensureWebAudio() {
      if (!IS_MOBILE) return false;
      const baseAudio = ensureBase();
      if (!baseAudio) return false;
      if (!("AudioContext" in window || "webkitAudioContext" in window)) {
        return false;
      }
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      } catch (_) {
        ac = null;
        return false;
      }
      if (!ac) return false;
      if (ac.state === "suspended") {
        try {
          ac.resume();
        } catch (_) {
        }
      }
      if (!gain) {
        gain = ac.createGain();
        gain.connect(ac.destination);
      }
      return true;
    }
    function ensureBuffer() {
      if (!ac) return null;
      if (buffer) return buffer;
      if (bufferPromise) return null;
      const srcUrl = ensureBase()?.currentSrc || src;
      try {
        bufferPromise = fetch(srcUrl).then((resp) => resp.ok ? resp.arrayBuffer() : Promise.reject(resp.status)).then((buf) => new Promise((resolve, reject) => {
          let settled = false;
          const onOk = (decoded) => {
            if (settled) return;
            settled = true;
            resolve(decoded);
          };
          const onErr = (err) => {
            if (settled) return;
            settled = true;
            reject(err);
          };
          const ret = ac.decodeAudioData(buf, onOk, onErr);
          if (ret && typeof ret.then === "function") {
            ret.then(onOk, onErr);
          }
        })).then((decoded) => {
          buffer = decoded;
          bufferPromise = null;
          bufferPromiseHandled = false;
          return decoded;
        }).catch(() => {
          bufferPromise = null;
          bufferPromiseHandled = false;
          return null;
        });
        bufferPromiseHandled = false;
      } catch (_) {
        bufferPromise = null;
        bufferPromiseHandled = false;
      }
      return buffer || null;
    }
    function playMobileFallback() {
      const baseAudio = ensureBase();
      if (!baseAudio) return;
      baseAudio.muted = false;
      baseAudio.volume = mobileVolume;
      try {
        baseAudio.currentTime = 0;
      } catch (_) {
      }
      baseAudio.play().catch(() => {
      });
    }
    function playMobileWebAudio() {
      if (!ensureWebAudio()) return false;
      if (!ac || !gain) return false;
      const playBuffer = (decoded) => {
        if (!decoded) return false;
        try {
          const node = ac.createBufferSource();
          node.buffer = decoded;
          node.connect(gain);
          const t = ac.currentTime;
          try {
            gain.gain.setValueAtTime(mobileVolume, t);
          } catch (_) {
            gain.gain.value = mobileVolume;
          }
          node.start();
          return true;
        } catch (_) {
          return false;
        }
      };
      if (buffer) {
        return playBuffer(buffer);
      }
      pendingPlays += 1;
      if (!bufferPromise) {
        ensureBuffer();
      }
      if (!bufferPromise) {
        const plays = Math.max(1, pendingPlays);
        pendingPlays = 0;
        for (let i = 0; i < plays; i += 1) {
          playMobileFallback();
        }
        return true;
      }
      if (bufferPromise && !bufferPromiseHandled) {
        bufferPromiseHandled = true;
        bufferPromise.then((decoded) => {
          const plays = Math.max(1, pendingPlays);
          pendingPlays = 0;
          if (!decoded) {
            for (let i = 0; i < plays; i += 1) {
              playMobileFallback();
            }
            return;
          }
          for (let i = 0; i < plays; i += 1) {
            if (!playBuffer(decoded)) {
              playMobileFallback();
              break;
            }
          }
        });
      }
      return true;
    }
    function playDesktop() {
      const baseAudio = ensureBase();
      if (!baseAudio) return;
      baseAudio.volume = desktopVolume;
      const a = baseAudio.cloneNode();
      a.volume = desktopVolume;
      a.play().catch(() => {
      });
    }
    return {
      play() {
        try {
          if (IS_MOBILE) {
            if (playMobileWebAudio()) return;
            playMobileFallback();
            return;
          }
          playDesktop();
        } catch {
        }
      }
    };
  }
  function playPurchaseSfx() {
    purchaseSfx.play();
  }
  function playEvolveSfx() {
    evolveSfx.play();
  }
  function currencyIconHTML(type) {
    const src = CURRENCY_ICON_SRC[type] || CURRENCY_ICON_SRC.coins;
    return `<img alt="" src="${src}" class="coin-ico">`;
  }
  function ensureCustomScrollbar() {
    const scroller = shopOverlayEl?.querySelector(".shop-scroller");
    if (!scroller || scroller.__customScroll) return;
    const bar = document.createElement("div");
    bar.className = "shop-scrollbar";
    const thumb = document.createElement("div");
    thumb.className = "shop-scrollbar__thumb";
    bar.appendChild(thumb);
    shopSheetEl.appendChild(bar);
    scroller.__customScroll = { bar, thumb };
    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const FADE_SCROLL_MS = 150;
    const FADE_DRAG_MS = 120;
    const supportsScrollEnd = "onscrollend" in window;
    const syncScrollShadow = () => {
      const hasShadow = (scroller.scrollTop || 0) > 0;
      shopSheetEl?.classList.toggle("has-scroll-shadow", hasShadow);
    };
    const updateBounds = () => {
      const grab = shopOverlayEl.querySelector(".shop-grabber");
      const header = shopOverlayEl.querySelector(".shop-header");
      const actions = shopOverlayEl.querySelector(".shop-actions");
      const top = (grab?.offsetHeight || 0) + (header?.offsetHeight || 0) | 0;
      const bottom = (actions?.offsetHeight || 0) | 0;
      bar.style.top = top + "px";
      bar.style.bottom = bottom + "px";
    };
    const updateThumb = () => {
      const { scrollHeight, clientHeight, scrollTop } = scroller;
      const barH = bar.clientHeight;
      const visibleRatio = clientHeight / Math.max(1, scrollHeight);
      const thumbH = Math.max(28, Math.round(barH * visibleRatio));
      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      const range = Math.max(0, barH - thumbH);
      const y = Math.round(scrollTop / maxScroll * range);
      thumb.style.height = thumbH + "px";
      thumb.style.transform = `translateY(${y}px)`;
      bar.style.display = scrollHeight <= clientHeight + 1 ? "none" : "";
    };
    const updateAll = () => {
      updateBounds();
      updateThumb();
      syncScrollShadow();
    };
    const showBar = () => {
      if (!isTouch) return;
      shopSheetEl.classList.add("is-scrolling");
      clearTimeout(scroller.__fadeTimer);
    };
    const scheduleHide = (delay) => {
      if (!isTouch) return;
      clearTimeout(scroller.__fadeTimer);
      scroller.__fadeTimer = setTimeout(() => {
        shopSheetEl.classList.remove("is-scrolling");
      }, delay);
    };
    const onScroll = () => {
      updateThumb();
      syncScrollShadow();
      if (isTouch) showBar();
      if (!supportsScrollEnd) scheduleHide(FADE_SCROLL_MS);
    };
    const onScrollEnd = () => scheduleHide(FADE_SCROLL_MS);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    if (supportsScrollEnd) {
      scroller.addEventListener("scrollend", onScrollEnd, { passive: true });
    }
    const ro = new ResizeObserver(updateAll);
    ro.observe(scroller);
    window.addEventListener("resize", updateAll);
    requestAnimationFrame(updateAll);
    let dragging = false;
    let dragStartY = 0;
    let startScrollTop = 0;
    const startDrag = (e) => {
      dragging = true;
      dragStartY = e.clientY;
      startScrollTop = scroller.scrollTop;
      thumb.classList.add("dragging");
      showBar();
      try {
        thumb.setPointerCapture(e.pointerId);
      } catch {
      }
      e.preventDefault();
    };
    const onDragMove2 = (e) => {
      if (!dragging) return;
      const barH = bar.clientHeight;
      const thH = thumb.clientHeight;
      const range = Math.max(1, barH - thH);
      const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      const deltaY = e.clientY - dragStartY;
      const scrollDelta = deltaY / range * scrollMax;
      scroller.scrollTop = startScrollTop + scrollDelta;
    };
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove("dragging");
      scheduleHide(FADE_DRAG_MS);
      try {
        thumb.releasePointerCapture(e.pointerId);
      } catch {
      }
    };
    thumb.addEventListener("pointerdown", startDrag);
    window.addEventListener("pointermove", onDragMove2, { passive: true });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    bar.addEventListener("pointerdown", (e) => {
      if (e.target === thumb) return;
      const rect = bar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;
      const barH = bar.clientHeight;
      const thH = thumb.clientHeight;
      const range = Math.max(0, barH - thH);
      const targetY = Math.max(0, Math.min(clickY - thH / 2, range));
      const scrollMax = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      scroller.scrollTop = targetY / Math.max(1, range) * scrollMax;
      showBar();
      scheduleHide(FADE_SCROLL_MS);
    });
  }
  function buildUpgradesData() {
    const areaKey = getCurrentAreaKey();
    const defs = getUpgradesForArea(areaKey);
    upgrades = {};
    for (const def of defs) {
      const lvlBn = getLevel(areaKey, def.id);
      const lvlNum = getLevelNumber(areaKey, def.id);
      const lockState = getUpgradeLockState(areaKey, def.id);
      const icon = lockState.iconOverride ?? getIconUrl(def);
      const title = lockState.titleOverride ?? def.title;
      const desc = lockState.descOverride ?? def.desc;
      const locked = !!lockState.locked;
      const hmReady = def.upgType === "HM" ? !!upgradeUiModel(areaKey, def.id)?.hmReadyToEvolve : false;
      upgrades[def.id] = {
        id: def.id,
        icon,
        title,
        desc,
        level: lvlBn,
        levelNumeric: lvlNum,
        area: def.area,
        meta: def,
        locked,
        lockState,
        useLockedBase: !!lockState.useLockedBase || locked,
        baseIconOverride: def.baseIconOverride || lockState.baseIconOverride || null,
        hmReady
      };
    }
  }
  function levelsRemainingToCap(upg, currentLevelBn, currentLevelNumber) {
    if (!upg) return BigNum.fromInt(0);
    const capBn = upg.lvlCapBn?.clone?.() ?? (Number.isFinite(upg.lvlCap) ? BigNum.fromAny(upg.lvlCap) : null);
    if (!capBn) return BigNum.fromInt(0);
    if (capBn.isInfinite?.()) return BigNum.fromAny("Infinity");
    let lvlBn;
    try {
      lvlBn = currentLevelBn instanceof BigNum ? currentLevelBn : BigNum.fromAny(currentLevelBn ?? currentLevelNumber ?? 0);
    } catch {
      const fallback = Math.max(0, Math.floor(Number(currentLevelNumber) || 0));
      lvlBn = BigNum.fromInt(fallback);
    }
    if (lvlBn.isInfinite?.()) return BigNum.fromInt(0);
    try {
      const capPlain = capBn.toPlainIntegerString?.();
      const lvlPlain = lvlBn.toPlainIntegerString?.();
      if (capPlain === "Infinity") return BigNum.fromAny("Infinity");
      if (capPlain && lvlPlain && capPlain !== "Infinity" && lvlPlain !== "Infinity") {
        const capInt = BigInt(capPlain);
        const lvlInt = BigInt(lvlPlain);
        const delta = capInt - lvlInt;
        if (delta > 0n) {
          return BigNum.fromAny(delta.toString());
        }
        return BigNum.fromInt(0);
      }
    } catch {
    }
    const capNumber = Number.isFinite(upg.lvlCap) ? Math.max(0, Math.floor(upg.lvlCap)) : Infinity;
    if (!Number.isFinite(capNumber)) return BigNum.fromAny("Infinity");
    const lvlNumber = Math.max(0, Math.floor(Number(currentLevelNumber) || 0));
    const room = Math.max(0, capNumber - lvlNumber);
    if (room > 0) {
      try {
        return BigNum.fromAny(room);
      } catch {
        return BigNum.fromInt(room | 0);
      }
    }
    return BigNum.fromInt(0);
  }
  function computeAffordableLevels(upg, currentLevelNumeric, currentLevelBn) {
    let lvlBn;
    try {
      lvlBn = currentLevelBn instanceof BigNum ? currentLevelBn : BigNum.fromAny(currentLevelBn ?? currentLevelNumeric ?? 0);
    } catch {
      const fallback = Math.max(0, Math.floor(Number(currentLevelNumeric) || 0));
      lvlBn = BigNum.fromInt(fallback);
    }
    if (lvlBn.isInfinite?.()) return BigNum.fromInt(0);
    const lvl = Math.max(0, Math.floor(Number(currentLevelNumeric) || 0));
    const cap = Number.isFinite(upg.lvlCap) ? Math.max(0, Math.floor(upg.lvlCap)) : Infinity;
    const walletEntry = bank[upg.costType];
    const walletValue = walletEntry?.value;
    const walletBn = walletValue instanceof BigNum ? walletValue : BigNum.fromAny(walletValue ?? 0);
    if (walletBn.isZero?.()) return BigNum.fromInt(0);
    if (walletBn.isInfinite?.()) {
      const isHmType = upg?.upgType === "HM";
      const maxed = Number.isFinite(cap) && lvl >= cap;
      if (isHmType && !maxed || !Number.isFinite(cap)) {
        return BigNum.fromAny("Infinity");
      }
      return levelsRemainingToCap(upg, lvlBn, currentLevelNumeric);
    }
    if (Number.isFinite(cap) && lvl >= cap) return BigNum.fromInt(0);
    try {
      const nextLvlNum = levelBigNumToNumber(lvlBn.add(BigNum.fromInt(1)));
      const c0 = BigNum.fromAny(upg.costAtLevel(lvl));
      const c1 = BigNum.fromAny(upg.costAtLevel(nextLvlNum));
      const farProbeLevel = Math.min(
        Number.isFinite(cap) ? cap : lvl + 32,
        lvl + 32
      );
      const cFar = BigNum.fromAny(upg.costAtLevel(farProbeLevel));
      const isTrulyFlat = c0.cmp(c1) === 0 && c0.cmp(cFar) === 0;
      if (isTrulyFlat) {
        const remainingBn = levelsRemainingToCap(upg, lvlBn, lvl);
        const room3 = Number.isFinite(upg.lvlCap) ? Math.min(
          Math.max(0, Math.floor(levelBigNumToNumber(remainingBn))),
          Number.MAX_SAFE_INTEGER - 2
        ) : Number.MAX_SAFE_INTEGER;
        let lo = 0;
        let hi = Math.max(0, room3);
        while (lo < hi) {
          const mid = Math.floor((lo + hi + 1) / 2);
          const midBn = BigNum.fromInt(mid);
          const total = typeof c0.mulBigNumInteger === "function" ? c0.mulBigNumInteger(midBn) : BigNum.fromAny(c0 ?? 0).mulBigNumInteger(midBn);
          if (total.cmp(walletBn) <= 0) lo = mid;
          else hi = mid - 1;
        }
        return BigNum.fromInt(lo);
      }
      const room2 = Number.isFinite(cap) ? Math.max(0, cap - lvl) : void 0;
      const { count: count2 } = evaluateBulkPurchase(upg, lvlBn, walletBn, room2, { fastOnly: true });
      return count2 ?? BigNum.fromInt(0);
    } catch {
    }
    const room = Number.isFinite(cap) ? Math.max(0, cap - lvl) : void 0;
    const { count } = evaluateBulkPurchase(upg, lvlBn, walletBn, room, { fastOnly: true });
    return count ?? BigNum.fromInt(0);
  }
  function renderShopGrid() {
    const grid = shopOverlayEl?.querySelector("#shop-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const key in upgrades) {
      const upg = upgrades[key];
      const btn = document.createElement("button");
      btn.className = "shop-upgrade";
      btn.setAttribute("data-upgid", upg.id);
      btn.type = "button";
      btn.setAttribute("role", "gridcell");
      btn.dataset.upgId = String(upg.id);
      const locked = !!upg.locked;
      const lockIcon = upg.lockState?.iconOverride;
      const hasMysteriousIcon = typeof lockIcon === "string" && lockIcon.includes("mysterious");
      const isMysterious = locked && (upg.lockState?.hidden || hasMysteriousIcon);
      const isPlainLocked = locked && !isMysterious;
      btn.classList.toggle("is-locked", locked);
      btn.classList.toggle("is-locked-plain", isPlainLocked);
      btn.disabled = isPlainLocked;
      if (isPlainLocked) {
        btn.setAttribute("aria-disabled", "true");
        btn.setAttribute("tabindex", "-1");
      } else {
        btn.removeAttribute("aria-disabled");
        btn.removeAttribute("tabindex");
      }
      btn.dataset.locked = locked ? "1" : "0";
      btn.dataset.lockedPlain = isPlainLocked ? "1" : "0";
      btn.dataset.mysterious = isMysterious ? "1" : "0";
      const isHM = upg.meta?.upgType === "HM";
      const evolveReady = isHM && upg.hmReady;
      const levelIsInfinite = isHM && upg.level?.isInfinite?.();
      btn.classList.toggle("hm-evolve-ready", evolveReady);
      const canPlusBn = locked ? BigNum.fromInt(0) : computeAffordableLevels(upg.meta, upg.levelNumeric, upg.level);
      const plusBn = canPlusBn instanceof BigNum ? canPlusBn : BigNum.fromAny(canPlusBn);
      const levelHtml = formatNumber(upg.level);
      const levelPlain = stripTags(levelHtml);
      const plusHtml = formatNumber(plusBn);
      const plusPlain = stripTags(plusHtml);
      const hasPlus = !plusBn.isZero?.();
      const rawCap = Number.isFinite(upg.lvlCap) ? upg.lvlCap : Number.isFinite(upg.meta?.lvlCap) ? upg.meta.lvlCap : Infinity;
      const capNumber = Number.isFinite(rawCap) ? Math.max(0, Math.floor(rawCap)) : Infinity;
      const levelDigits = Number.parseFloat(String(levelPlain || "").replace(/,/g, ""));
      const levelNumber = Number.isFinite(upg.levelNumeric) ? upg.levelNumeric : Number.isFinite(levelDigits) ? levelDigits : NaN;
      const hasFiniteCap = Number.isFinite(capNumber);
      const capReached = evolveReady ? false : levelIsInfinite ? true : hasFiniteCap && Number.isFinite(levelNumber) ? levelNumber >= capNumber : false;
      const isBookValueUpgrade = upg.meta?.tie === UPGRADE_TIES.BOOK_VALUE_I;
      const isSingleLevelCap = hasFiniteCap && capNumber === 1;
      const isUnlockUpgrade = !!upg.meta?.unlockUpgrade || isSingleLevelCap && !isBookValueUpgrade;
      const showUnlockableBadge = !locked && isUnlockUpgrade && !capReached;
      const showUnlockedBadge = !locked && isUnlockUpgrade && !showUnlockableBadge && capReached;
      let badgeHtml;
      let badgePlain;
      let needsTwoLines = false;
      if (locked) {
        badgeHtml = "";
        badgePlain = "";
        const reason = isMysterious ? (upg.lockState?.reason || "").trim() : "";
        const ariaLabel = reason ? `${upg.title} (Locked, ${reason})` : `${upg.title} (Locked)`;
        btn.setAttribute("aria-label", ariaLabel);
      } else {
        if (showUnlockableBadge || showUnlockedBadge) {
          badgeHtml = showUnlockableBadge ? "Unlockable" : "Unlocked";
          badgePlain = badgeHtml;
          btn.setAttribute("aria-label", `${upg.title}, ${badgePlain}`);
        } else {
          const numericLevel = Number.isFinite(upg.levelNumeric) ? upg.levelNumeric : NaN;
          const plainDigits = String(levelPlain || "").replace(/,/g, "");
          const isInf = /∞|Infinity/i.test(plainDigits);
          const over999 = Number.isFinite(numericLevel) ? numericLevel >= 1e3 : isInf || /^\d{4,}$/.test(plainDigits);
          needsTwoLines = hasPlus && over999;
          if (needsTwoLines) {
            const lvlSpan = `<span class="badge-lvl">${levelHtml}</span>`;
            const plusSpan = `<span class="badge-plus">(+${plusHtml})</span>`;
            badgeHtml = `${lvlSpan}${plusSpan}`;
            badgePlain = `${levelPlain} (+${plusPlain})`;
          } else {
            badgeHtml = hasPlus ? `${levelHtml} (+${plusHtml})` : levelHtml;
            badgePlain = hasPlus ? `${levelPlain} (+${plusPlain})` : levelPlain;
          }
          btn.setAttribute("aria-label", `${upg.title}, level ${badgePlain}`);
        }
      }
      if (locked) {
        btn.title = isMysterious ? "Hidden Upgrade" : "Locked Upgrade";
      } else if (upg.meta?.unlockUpgrade) {
        btn.title = "Left-click: Details \u2022 Right-click: Unlock";
      } else {
        btn.title = "Left-click: Details \u2022 Right-click: Buy Max";
      }
      const tile = document.createElement("div");
      tile.className = "shop-tile";
      const baseImg = document.createElement("img");
      baseImg.className = "base";
      const costType = upg.meta?.costType || "coins";
      const useLockedBase = upg.useLockedBase || locked;
      const fallbackBaseSrc = BASE_ICON_SRC_BY_COST[costType] || BASE_ICON_SRC_BY_COST.coins;
      const resolvedBaseSrc = upg.baseIconOverride || fallbackBaseSrc;
      baseImg.src = useLockedBase ? LOCKED_BASE_ICON_SRC : resolvedBaseSrc;
      baseImg.alt = "";
      const iconImg = document.createElement("img");
      iconImg.className = "icon";
      iconImg.src = upg.icon || TRANSPARENT_PX;
      iconImg.alt = "";
      iconImg.addEventListener("error", () => {
        iconImg.src = TRANSPARENT_PX;
      });
      btn.addEventListener("click", (event) => {
        if (btn.disabled || isPlainLocked) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (shouldSkipGhostTap(btn)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        markGhostTapTarget(btn);
        openUpgradeOverlay(upg.meta);
      });
      btn.addEventListener("pointerdown", (event) => {
        if (btn.disabled || isPlainLocked) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          return;
        }
        if (event.pointerType !== "mouse") {
          markGhostTapTarget(btn);
        }
      });
      btn.addEventListener("contextmenu", (e) => {
        if (IS_MOBILE) return;
        if (locked) return;
        e.preventDefault();
        e.stopPropagation();
        const areaKey = getCurrentAreaKey();
        const { bought } = buyMax(areaKey, upg.id);
        const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
        if (!boughtBn.isZero?.()) {
          playPurchaseSfx();
          if (isForgeUnlockUpgrade(upg.meta)) {
            try {
              unlockMerchantTabs(["reset"]);
            } catch {
            }
          }
          updateShopOverlay();
        }
      });
      tile.appendChild(baseImg);
      if (!locked && capReached) {
        const maxedOverlay = document.createElement("img");
        maxedOverlay.className = "maxed-overlay";
        maxedOverlay.src = MAXED_BASE_OVERLAY_SRC;
        maxedOverlay.alt = "";
        tile.appendChild(maxedOverlay);
      }
      tile.appendChild(iconImg);
      if (!locked) {
        const badge = document.createElement("span");
        badge.className = "level-badge";
        if (needsTwoLines) badge.classList.add("two-line");
        if (badgeHtml === badgePlain) {
          badge.textContent = badgeHtml;
        } else {
          badge.innerHTML = badgeHtml;
        }
        if (hasPlus || showUnlockableBadge) badge.classList.add("can-buy");
        if (capReached) badge.classList.add("is-maxed");
        tile.appendChild(badge);
      }
      btn.appendChild(tile);
      grid.appendChild(btn);
    }
  }
  function ensureShopOverlay() {
    if (shopOverlayEl) return;
    shopOverlayEl = document.createElement("div");
    shopOverlayEl.className = "shop-overlay";
    shopOverlayEl.id = "shop-overlay";
    shopSheetEl = document.createElement("div");
    shopSheetEl.className = "shop-sheet";
    shopSheetEl.setAttribute("role", "dialog");
    shopSheetEl.setAttribute("aria-modal", "false");
    shopSheetEl.setAttribute("aria-label", "Shop");
    const grabber = document.createElement("div");
    grabber.className = "shop-grabber";
    grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;
    const content = document.createElement("div");
    content.className = "shop-content";
    const header = document.createElement("header");
    header.className = "shop-header";
    header.innerHTML = `
    <div class="shop-title">Shop</div>
    <div class="shop-line" aria-hidden="true"></div>
  `;
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    grid.id = "shop-grid";
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Shop Upgrades");
    const scroller = document.createElement("div");
    scroller.className = "shop-scroller";
    scroller.appendChild(grid);
    content.append(header, scroller);
    ensureCustomScrollbar();
    const actions = document.createElement("div");
    actions.className = "shop-actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "shop-close";
    closeBtn.textContent = "Close";
    const delveBtn = document.createElement("button");
    delveBtn.type = "button";
    delveBtn.className = "shop-delve";
    delveBtn.textContent = "Delve";
    const openDelveOverlay = () => {
      if (shouldSkipGhostTap(delveBtn)) return;
      markGhostTapTarget(delveBtn);
      primeTypingSfx();
      openMerchant();
    };
    delveBtn.addEventListener("click", openDelveOverlay);
    delveBtnEl = delveBtn;
    updateDelveGlow = () => {
      if (!delveBtnEl) return;
      const met = hasMetMerchant();
      delveBtnEl.classList.toggle("is-new", !met);
    };
    updateDelveGlow();
    actions.appendChild(closeBtn);
    actions.append(delveBtn);
    shopSheetEl.append(grabber, content, actions);
    shopOverlayEl.appendChild(shopSheetEl);
    document.body.appendChild(shopOverlayEl);
    shopOverlayEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      __shopPostOpenPointer = true;
    }, { capture: true, passive: true });
    shopOverlayEl.addEventListener("touchstart", () => {
      __shopPostOpenPointer = true;
    }, { capture: true, passive: true });
    shopOverlayEl.addEventListener("click", (e) => {
      if (!IS_MOBILE) return;
      if (!__shopPostOpenPointer) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
    }, { capture: true });
    updateShopOverlay(true);
    if (!eventsBound) {
      let onCloseClick = function(e) {
        if (IS_MOBILE) {
          blockInteraction(80);
        }
        closeShop();
      };
      eventsBound = true;
      closeBtn.addEventListener("click", onCloseClick, { passive: true });
      const hasPointerEvents2 = typeof window !== "undefined" && "PointerEvent" in window;
      if (hasPointerEvents2) {
        closeBtn.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "mouse") return;
          if (typeof e.button === "number" && e.button !== 0) return;
          markGhostTapTarget(closeBtn);
          blockInteraction(80);
          closeShop();
          e.preventDefault();
        }, { passive: false });
      } else {
        closeBtn.addEventListener("touchstart", (e) => {
          markGhostTapTarget(closeBtn);
          blockInteraction(80);
          closeShop();
          e.preventDefault();
        }, { passive: false });
      }
      const onDelvePointerDown = (e) => {
        if (e.pointerType === "mouse") return;
        if (typeof e.button === "number" && e.button !== 0) return;
        markGhostTapTarget(delveBtn);
        primeTypingSfx();
        openMerchant();
        e.preventDefault();
      };
      const onDelveTouchStart = (e) => {
        markGhostTapTarget(delveBtn);
        primeTypingSfx();
        openMerchant();
        e.preventDefault();
      };
      if (hasPointerEvents2) {
        delveBtn.addEventListener("pointerdown", onDelvePointerDown, { passive: false });
      } else {
        delveBtn.addEventListener("touchstart", onDelveTouchStart, { passive: false });
      }
      document.addEventListener("keydown", onKeydownForShop);
      grabber.addEventListener("pointerdown", onDragStart);
      grabber.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
      let _shopBadgeTimer = null;
      const scheduleShopRerender = () => {
        if (!shopOpen) return;
        clearTimeout(_shopBadgeTimer);
        _shopBadgeTimer = setTimeout(() => {
          updateShopOverlay();
        }, 60);
      };
      window.addEventListener("currency:change", scheduleShopRerender);
      window.addEventListener("xp:change", scheduleShopRerender);
      window.addEventListener("xp:unlock", scheduleShopRerender);
      const onUpgradesChanged3 = () => {
        if (!shopOpen) return;
        updateShopOverlay();
      };
      document.addEventListener("ccc:upgrades:changed", onUpgradesChanged3);
      window.addEventListener(MERCHANT_MET_EVENT, () => {
        if (typeof updateDelveGlow === "function") updateDelveGlow();
        if (shopOpen) updateShopOverlay();
      });
    }
  }
  function ensureUpgradeOverlay() {
    if (upgOverlayEl) return;
    upgOverlayEl = document.createElement("div");
    upgOverlayEl.className = "upg-overlay";
    upgSheetEl = document.createElement("div");
    upgSheetEl.className = "upg-sheet";
    upgSheetEl.setAttribute("role", "dialog");
    upgSheetEl.setAttribute("aria-modal", "false");
    upgSheetEl.setAttribute("aria-label", "Upgrade");
    const grab = document.createElement("div");
    grab.className = "upg-grabber";
    grab.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;
    const header = document.createElement("header");
    header.className = "upg-header";
    const content = document.createElement("div");
    content.className = "upg-content";
    const actions = document.createElement("div");
    actions.className = "upg-actions";
    upgSheetEl.append(grab, header, content, actions);
    upgOverlayEl.appendChild(upgSheetEl);
    document.body.appendChild(upgOverlayEl);
    upgOverlayEl.addEventListener("pointerdown", (e) => {
      if (!IS_MOBILE) return;
      if (e.pointerType === "mouse") return;
      if (e.target === upgOverlayEl) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    upgOverlayEl.addEventListener("click", (e) => {
      if (!IS_MOBILE) return;
      if (e.target === upgOverlayEl) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    let drag2 = null;
    function onDragStart2(e) {
      if (!upgOpen) return;
      const y = typeof e.clientY === "number" ? e.clientY : e.touches?.[0]?.clientY || 0;
      drag2 = { startY: y, lastY: y, moved: 0 };
      upgSheetEl.style.transition = "none";
      window.addEventListener("pointermove", onDragMove2);
      window.addEventListener("pointerup", onDragEnd2);
      window.addEventListener("pointercancel", onDragEnd2);
    }
    function onDragMove2(e) {
      if (!drag2) return;
      const y = e.clientY;
      if (typeof y !== "number") return;
      const dy = Math.max(0, y - drag2.startY);
      drag2.lastY = y;
      drag2.moved = dy;
      upgSheetEl.style.transform = `translateY(${dy}px)`;
    }
    function onDragEnd2(e) {
      if (!drag2) return;
      const shouldClose = drag2.moved > 140;
      upgSheetEl.style.transition = "transform 160ms ease";
      upgSheetEl.style.transform = shouldClose ? "translateY(100%)" : "translateY(0)";
      if (shouldClose) {
        if (IS_MOBILE && (!e || e.pointerType !== "mouse")) {
          try {
            blockInteraction(120);
          } catch {
          }
        }
        setTimeout(closeUpgradeMenu, 160);
      }
      drag2 = null;
      window.removeEventListener("pointermove", onDragMove2);
      window.removeEventListener("pointerup", onDragEnd2);
      window.removeEventListener("pointercancel", onDragEnd2);
    }
    grab.addEventListener("pointerdown", onDragStart2, { passive: true });
  }
  function closeUpgradeMenu() {
    if (IS_MOBILE) {
      try {
        blockInteraction(160);
      } catch {
      }
    }
    if (typeof upgOverlayCleanup === "function") {
      const fn = upgOverlayCleanup;
      upgOverlayCleanup = null;
      try {
        fn();
      } catch {
      }
    }
    upgOpen = false;
    if (!upgOverlayEl || !upgSheetEl) return;
    upgSheetEl.style.transition = "";
    upgSheetEl.style.transform = "";
    upgOverlayEl.classList.remove("is-open");
    upgOverlayEl.style.pointerEvents = "none";
  }
  function openUpgradeOverlay(upgDef) {
    ensureUpgradeOverlay();
    upgOpen = true;
    let upgOpenLocal = true;
    const areaKey = getCurrentAreaKey();
    const initialLockState = getUpgradeLockState(areaKey, upgDef.id) || {};
    const initialLocked = !!initialLockState.locked;
    const initialMysterious = initialLocked && (initialLockState.hidden || initialLockState.hideEffect || initialLockState.hideCost || typeof initialLockState.iconOverride === "string" && initialLockState.iconOverride.includes("mysterious"));
    if (initialLocked && !initialMysterious) {
      upgOpen = false;
      return;
    }
    const isHM = upgDef.upgType === "HM";
    const isEndlessXp = upgDef.tie === UPGRADE_TIES.ENDLESS_XP;
    const ui = () => upgradeUiModel(areaKey, upgDef.id);
    const spacer = (h) => {
      const s = document.createElement("div");
      s.style.height = h;
      return s;
    };
    const makeLine = (html) => {
      const d = document.createElement("div");
      d.className = "upg-line";
      d.innerHTML = html;
      return d;
    };
    function recenterUnlockOverlayIfNeeded(model) {
      const content = upgSheetEl.querySelector(".upg-content");
      if (!content) return;
      const lockState = model?.lockState || getUpgradeLockState(areaKey, upgDef.id) || {};
      const isHiddenUpgrade = !!(lockState.hidden || lockState.hideEffect || lockState.hideCost);
      if (!model || !model.unlockUpgrade || isHiddenUpgrade) {
        content.style.marginTop = "";
        return;
      }
      const header = upgSheetEl.querySelector(".upg-header");
      const actions = upgSheetEl.querySelector(".upg-actions");
      if (!header || !actions) return;
      content.style.marginTop = "";
      const headerRect = header.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const available = actionsRect.top - headerRect.bottom;
      const freeSpace = available - contentRect.height;
      if (freeSpace <= 0) return;
      const BIAS = 0.42;
      const topOffset = freeSpace * BIAS;
      content.style.marginTop = `${topOffset}px`;
    }
    const rerender = () => {
      const model = ui();
      if (!model) return;
      const lockState = model.lockState || getUpgradeLockState(areaKey, upgDef.id);
      const locked = !!lockState?.locked;
      const isHiddenUpgrade = locked && (lockState?.hidden || lockState?.hideEffect || lockState?.hideCost);
      const lockHidden = locked && isHiddenUpgrade;
      const isUnlockVisible = !!model.unlockUpgrade && !lockHidden;
      upgSheetEl.classList.toggle("is-locked-hidden", lockHidden);
      const header = upgSheetEl.querySelector(".upg-header");
      header.innerHTML = "";
      const title = document.createElement("div");
      title.className = "upg-title";
      title.textContent = model.displayTitle || model.upg.title;
      const evolveReady = !!model.hmReadyToEvolve;
      const capReached = evolveReady ? false : model.lvlBn?.isInfinite?.() ? true : Number.isFinite(model.upg.lvlCap) ? model.lvl >= model.upg.lvlCap : false;
      const level = document.createElement("div");
      level.className = "upg-level";
      const capHtml = model.lvlCapFmtHtml ?? model.upg.lvlCapFmtHtml ?? formatNumber(model.lvlCapBn);
      const capPlain = model.lvlCapFmtText ?? model.upg.lvlCapFmtText ?? stripTags(capHtml);
      const levelHtml = evolveReady ? `Level ${model.lvlFmtHtml} / ${capHtml} (EVOLVE READY)` : capReached ? `Level ${model.lvlFmtHtml} / ${capHtml} (MAXED)` : `Level ${model.lvlFmtHtml} / ${capHtml}`;
      const levelPlain = evolveReady ? `Level ${model.lvlFmtText} / ${capPlain} (EVOLVE READY)` : capReached ? `Level ${model.lvlFmtText} / ${capPlain} (MAXED)` : `Level ${model.lvlFmtText} / ${capPlain}`;
      level.innerHTML = levelHtml;
      level.setAttribute("aria-label", levelPlain);
      if (isHiddenUpgrade) {
        level.hidden = true;
      } else {
        level.hidden = false;
        level.removeAttribute("aria-hidden");
      }
      upgSheetEl.classList.toggle("is-maxed", capReached);
      upgSheetEl.classList.toggle("hm-evolve-ready", evolveReady);
      upgSheetEl.classList.toggle("is-unlock-upgrade", isUnlockVisible);
      header.append(title, level);
      const content = upgSheetEl.querySelector(".upg-content");
      content.innerHTML = "";
      content.scrollTop = 0;
      upgSheetEl.classList.toggle("is-hm-upgrade", isHM);
      upgSheetEl.classList.toggle("is-endless-xp", isEndlessXp);
      const desc = document.createElement("div");
      desc.className = "upg-desc centered";
      if (lockHidden) desc.classList.add("lock-desc");
      const baseDesc = (model.displayDesc || model.upg.desc || "").trim();
      if (evolveReady) {
        desc.classList.add("hm-evolve-note");
        desc.textContent = "Evolve this upgrade to multiply its effect by 1000x";
      } else if (baseDesc) {
        desc.textContent = baseDesc;
      } else {
        desc.hidden = true;
      }
      content.appendChild(desc);
      const info = document.createElement("div");
      info.className = "upg-info";
      info.appendChild(spacer("12px"));
      if (locked && lockState?.reason && !isHiddenUpgrade) {
        const descText = (model.displayDesc || "").trim();
        const reasonText = String(lockState.reason ?? "").trim();
        const isDuplicateNote = descText && descText === reasonText;
        if (!isDuplicateNote) {
          const note = document.createElement("div");
          note.className = "upg-line lock-note";
          note.textContent = lockState.reason;
          info.appendChild(note);
          info.appendChild(spacer("12px"));
        }
      }
      if (model.effect && !(locked && lockState?.hideEffect)) {
        const effectText = model.effect;
        info.appendChild(makeLine(`<span class="bonus-line">${effectText}</span>`));
        info.appendChild(spacer("12px"));
      }
      const iconHTML = currencyIconHTML(model.upg.costType);
      const nextPriceBn = model.nextPrice instanceof BigNum ? model.nextPrice : BigNum.fromAny(model.nextPrice || 0);
      const stopBuying = capReached || evolveReady;
      if (!model.unlockUpgrade && !stopBuying && (!locked || !lockState?.hideCost)) {
        const costs = document.createElement("div");
        costs.className = "upg-costs";
        const lineCost = document.createElement("div");
        lineCost.className = "upg-line";
        lineCost.innerHTML = `Cost: ${iconHTML} ${bank[model.upg.costType].fmt(nextPriceBn)}`;
        costs.appendChild(lineCost);
        if (isHM) {
          const lineMilestone = document.createElement("div");
          lineMilestone.className = "upg-line";
          let milestoneCost = "\u2014";
          try {
            if (model.hmNextMilestone && model.hmNextMilestone.cmp(model.lvlBn) > 0) {
              const deltaBn = model.hmNextMilestone.sub(model.lvlBn);
              const deltaPlain = deltaBn.toPlainIntegerString?.();
              const deltaNum = Math.max(
                0,
                Math.floor(Number(deltaPlain && deltaPlain !== "Infinity" ? deltaPlain : Number(deltaBn.toString() || 0)))
              );
              const { spent } = evaluateBulkPurchase(
                model.upg,
                model.lvlBn,
                BigNum.fromAny("Infinity"),
                deltaNum
              );
              milestoneCost = bank[model.upg.costType].fmt(spent);
            }
          } catch {
          }
          lineMilestone.innerHTML = `Cost to next milestone: ${iconHTML} ${milestoneCost}`;
          costs.appendChild(lineMilestone);
        }
        const lineHave = document.createElement("div");
        lineHave.className = "upg-line";
        lineHave.innerHTML = `You have: ${iconHTML} ${bank[model.upg.costType].fmt(model.have)}`;
        costs.appendChild(lineHave);
        info.appendChild(costs);
      }
      content.appendChild(info);
      if (isHM) {
        const milestonesRow = document.createElement("div");
        milestonesRow.className = "hm-view-milestones-row";
        const viewMilestonesBtn = document.createElement("button");
        viewMilestonesBtn.type = "button";
        viewMilestonesBtn.className = "shop-delve hm-view-milestones";
        viewMilestonesBtn.textContent = "View Milestones";
        viewMilestonesBtn.addEventListener("click", () => {
          const milestones = Array.isArray(model.hmMilestones) ? model.hmMilestones : [];
          if (!milestones.length) return;
          const evolutions = Math.max(0, Math.floor(Number(model.hmEvolutions ?? 0)));
          const evolutionOffset = (() => {
            try {
              return BigInt(HM_EVOLUTION_INTERVAL) * BigInt(evolutions);
            } catch {
              return 0n;
            }
          })();
          const formatMilestoneLevel = (levelBn) => {
            if (model.lvlBn?.isInfinite?.()) return "Infinity";
            try {
              const plain = levelBn?.toPlainIntegerString?.();
              if (plain && plain !== "Infinity") {
                if (plain.length <= 15) {
                  const asNum = Number(plain);
                  if (Number.isFinite(asNum)) return asNum.toLocaleString();
                }
                return plain.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
              }
            } catch {
            }
            return formatNumber(levelBn);
          };
          const lines = milestones.sort((a, b) => Number(a?.level ?? 0) - Number(b?.level ?? 0)).map((m) => {
            const lvl = Math.max(0, Math.floor(Number(m?.level ?? 0)));
            const milestoneLevelBn = (() => {
              if (model.lvlBn?.isInfinite?.()) return BigNum.fromAny("Infinity");
              try {
                return BigNum.fromAny((BigInt(lvl) + evolutionOffset).toString());
              } catch {
                return BigNum.fromAny(lvl + HM_EVOLUTION_INTERVAL * evolutions);
              }
            })();
            const milestonePlain = milestoneLevelBn?.toPlainIntegerString?.();
            const levelText = formatMilestoneLevel(milestoneLevelBn);
            const mult = formatMultForUi(m?.multiplier ?? m?.mult ?? m?.value ?? 1);
            const target = `${m?.target ?? m?.type ?? "self"}`.toLowerCase();
            const achieved = (() => {
              if (model.lvlBn?.isInfinite?.()) return true;
              try {
                return model.lvlBn?.cmp?.(milestoneLevelBn) >= 0;
              } catch {
              }
              if (Number.isFinite(model.lvl) && milestonePlain && milestonePlain !== "Infinity") {
                const approxTarget = Number(milestonePlain);
                if (Number.isFinite(approxTarget)) return model.lvl >= approxTarget;
              }
              return false;
            })();
            if (target === "xp") return { text: `Level ${levelText}: Multiplies XP value by ${mult}x`, achieved };
            if (target === "coin" || target === "coins") return { text: `Level ${levelText}: Multiplies Coin value by ${mult}x`, achieved };
            if (target === "mp") return { text: `Level ${levelText}: Multiplies MP value by ${mult}x`, achieved };
            return { text: `Level ${levelText}: Multiplies this upgrade\u2019s effect by ${mult}x`, achieved };
          });
          openHmMilestoneDialog(lines);
        });
        milestonesRow.appendChild(viewMilestonesBtn);
        content.appendChild(milestonesRow);
      }
      const actions = upgSheetEl.querySelector(".upg-actions");
      actions.innerHTML = "";
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "shop-close";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", () => {
        upgOpenLocal = false;
        closeUpgradeMenu();
      });
      if ("PointerEvent" in window) {
        closeBtn.addEventListener("pointerdown", (e) => {
          if (e.pointerType === "mouse") return;
          if (typeof e.button === "number" && e.button !== 0) return;
          markGhostTapTarget(closeBtn);
          suppressNextGhostTap(320);
          blockInteraction(160);
          upgOpenLocal = false;
          closeUpgradeMenu();
          e.preventDefault();
        }, { passive: false });
      } else {
        closeBtn.addEventListener("touchstart", (e) => {
          markGhostTapTarget(closeBtn);
          suppressNextGhostTap(320);
          blockInteraction(160);
          upgOpenLocal = false;
          closeUpgradeMenu();
          e.preventDefault();
        }, { passive: false });
      }
      if (locked) {
        actions.append(closeBtn);
        closeBtn.focus();
      } else if (capReached) {
        actions.append(closeBtn);
        closeBtn.focus();
      } else {
        const canAffordNext = model.have.cmp(nextPriceBn) >= 0;
        if (evolveReady) {
          const evolveBtn = document.createElement("button");
          evolveBtn.type = "button";
          evolveBtn.className = "shop-delve hm-evolve-btn";
          evolveBtn.textContent = "Evolve";
          evolveBtn.addEventListener("click", () => {
            const { evolved } = evolveUpgrade(areaKey, upgDef.id);
            if (!evolved) return;
            playEvolveSfx();
            updateShopOverlay();
            rerender();
          });
          actions.append(closeBtn, evolveBtn);
          evolveBtn.focus();
          recenterUnlockOverlayIfNeeded(model);
          return;
        }
        if (model.unlockUpgrade) {
          const unlockBtn = document.createElement("button");
          unlockBtn.type = "button";
          unlockBtn.className = "shop-delve";
          unlockBtn.textContent = "Unlock";
          unlockBtn.disabled = !canAffordNext;
          unlockBtn.addEventListener("click", () => {
            const { bought } = buyOne(areaKey, upgDef.id);
            const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
            if (!boughtBn.isZero?.()) {
              playPurchaseSfx();
              if (isForgeUnlockUpgrade(upgDef)) {
                try {
                  unlockMerchantTabs(["reset"]);
                } catch {
                }
              }
              updateShopOverlay();
              rerender();
            }
          });
          actions.append(closeBtn, unlockBtn);
          (canAffordNext ? unlockBtn : closeBtn).focus();
          recenterUnlockOverlayIfNeeded(model);
          return;
        }
        const buyBtn = document.createElement("button");
        buyBtn.type = "button";
        buyBtn.className = "shop-delve";
        buyBtn.textContent = "Buy";
        buyBtn.disabled = !canAffordNext;
        const performBuy = () => {
          const fresh = upgradeUiModel(areaKey, upgDef.id);
          const priceNow = fresh.nextPrice instanceof BigNum ? fresh.nextPrice : BigNum.fromAny(fresh.nextPrice || 0);
          if (fresh.have.cmp(priceNow) < 0) return;
          const { bought } = buyOne(areaKey, upgDef.id);
          const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
          if (boughtBn.isZero?.()) return;
          playPurchaseSfx();
          updateShopOverlay();
          rerender();
        };
        if ("PointerEvent" in window) {
          buyBtn.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse") return;
            if (typeof event.button === "number" && event.button !== 0) return;
            if (typeof markGhostTapTarget === "function") {
              markGhostTapTarget(buyBtn, 160);
            }
            performBuy();
            event.preventDefault();
          }, { passive: false });
        } else {
          buyBtn.addEventListener("touchstart", (event) => {
            if (typeof markGhostTapTarget === "function") {
              markGhostTapTarget(buyBtn, 160);
            }
            performBuy();
            event.preventDefault();
          }, { passive: false });
        }
        buyBtn.addEventListener("click", (event) => {
          if (IS_MOBILE) return;
          if (typeof markGhostTapTarget === "function") {
            markGhostTapTarget(buyBtn, 160);
          }
          performBuy();
        });
        const buyMaxBtn = document.createElement("button");
        buyMaxBtn.type = "button";
        buyMaxBtn.className = "shop-delve";
        buyMaxBtn.textContent = "Buy Max";
        buyMaxBtn.disabled = !canAffordNext;
        const performBuyMax = () => {
          if (buyMaxBtn.disabled) return;
          const fresh = upgradeUiModel(areaKey, upgDef.id);
          if (fresh.have.cmp(BigNum.fromInt(1)) < 0) return;
          const { bought } = buyMax(areaKey, upgDef.id);
          const boughtBn = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
          if (!boughtBn.isZero?.()) {
            playPurchaseSfx();
            updateShopOverlay();
            rerender();
          }
        };
        if ("PointerEvent" in window) {
          buyMaxBtn.addEventListener("pointerdown", (event) => {
            if (event.pointerType === "mouse") return;
            if (typeof event.button === "number" && event.button !== 0) return;
            if (typeof markGhostTapTarget === "function") {
              markGhostTapTarget(buyMaxBtn, 160);
            }
            performBuyMax();
            event.preventDefault();
          }, { passive: false });
        } else {
          buyMaxBtn.addEventListener("touchstart", (event) => {
            if (typeof markGhostTapTarget === "function") {
              markGhostTapTarget(buyMaxBtn, 160);
            }
            performBuyMax();
            event.preventDefault();
          }, { passive: false });
        }
        buyMaxBtn.addEventListener("click", (event) => {
          if (IS_MOBILE) return;
          if (typeof markGhostTapTarget === "function") {
            markGhostTapTarget(buyMaxBtn, 160);
          }
          performBuyMax();
        });
        actions.append(closeBtn, buyBtn, buyMaxBtn);
        if (isHM) {
          const buyNextBtn = document.createElement("button");
          buyNextBtn.type = "button";
          buyNextBtn.className = "shop-delve";
          buyNextBtn.textContent = "Buy Next";
          buyNextBtn.disabled = model.have.cmp(BigNum.fromInt(1)) < 0;
          const performBuyNext = () => {
            if (buyNextBtn.disabled) return;
            const fresh = upgradeUiModel(areaKey, upgDef.id);
            if (fresh.hmReadyToEvolve) return;
            const target = fresh.hmNextMilestone;
            if (!target || !fresh.lvlBn || target.cmp(fresh.lvlBn) <= 0) {
              const { bought } = buyMax(areaKey, upgDef.id);
              const boughtBn2 = bought instanceof BigNum ? bought : BigNum.fromAny(bought ?? 0);
              if (!boughtBn2.isZero?.()) {
                playPurchaseSfx();
                updateShopOverlay();
                rerender();
              }
              return;
            }
            let deltaNum = 0;
            try {
              const diffPlain = target.sub(fresh.lvlBn).toPlainIntegerString?.();
              if (diffPlain && diffPlain !== "Infinity") deltaNum = Number(diffPlain);
              else deltaNum = Number(target.sub(fresh.lvlBn).toString());
            } catch {
            }
            deltaNum = Math.max(0, Math.floor(deltaNum));
            const walletRaw = bank[fresh.upg.costType]?.value;
            const walletBn = walletRaw instanceof BigNum ? walletRaw : BigNum.fromAny(walletRaw ?? 0);
            const evalResult = evaluateBulkPurchase(fresh.upg, fresh.lvlBn, walletBn, deltaNum);
            const count = evalResult.count;
            let reachable = false;
            try {
              const plain = count?.toPlainIntegerString?.();
              if (plain && plain !== "Infinity") reachable = Number(plain) >= deltaNum;
              else reachable = Number(count ?? 0) >= deltaNum;
            } catch {
            }
            const purchase = reachable ? buyTowards(areaKey, upgDef.id, deltaNum) : buyMax(areaKey, upgDef.id);
            const boughtBn = purchase.bought instanceof BigNum ? purchase.bought : BigNum.fromAny(purchase.bought ?? 0);
            if (!boughtBn.isZero?.()) {
              playPurchaseSfx();
              updateShopOverlay();
              rerender();
            }
          };
          if ("PointerEvent" in window) {
            buyNextBtn.addEventListener("pointerdown", (event) => {
              if (event.pointerType === "mouse") return;
              if (typeof event.button === "number" && event.button !== 0) return;
              if (typeof markGhostTapTarget === "function") {
                markGhostTapTarget(buyNextBtn, 160);
              }
              performBuyNext();
              event.preventDefault();
            }, { passive: false });
          } else {
            buyNextBtn.addEventListener("touchstart", (event) => {
              if (typeof markGhostTapTarget === "function") {
                markGhostTapTarget(buyNextBtn, 160);
              }
              performBuyNext();
              event.preventDefault();
            }, { passive: false });
          }
          buyNextBtn.addEventListener("click", (event) => {
            if (IS_MOBILE) return;
            if (typeof markGhostTapTarget === "function") {
              markGhostTapTarget(buyNextBtn, 160);
            }
            performBuyNext();
          });
          actions.appendChild(buyNextBtn);
        }
        (canAffordNext ? buyBtn : closeBtn).focus();
      }
      recenterUnlockOverlayIfNeeded(model);
    };
    const onCurrencyChange2 = () => {
      if (!upgOpenLocal) return;
      rerender();
    };
    const onUpgradesChanged3 = () => {
      if (!upgOpenLocal) return;
      rerender();
    };
    window.addEventListener("currency:change", onCurrencyChange2);
    window.addEventListener("xp:change", onCurrencyChange2);
    window.addEventListener("xp:unlock", onCurrencyChange2);
    document.addEventListener("ccc:upgrades:changed", onUpgradesChanged3);
    rerender();
    upgOverlayEl.classList.add("is-open");
    upgOverlayEl.style.pointerEvents = "auto";
    blockInteraction(140);
    upgSheetEl.style.transition = "none";
    upgSheetEl.style.transform = "translateY(100%)";
    void upgSheetEl.offsetHeight;
    requestAnimationFrame(() => {
      upgSheetEl.style.transition = "";
      upgSheetEl.style.transform = "";
    });
    const onKey = (e) => {
      if (!upgOpenLocal) return;
      if (e.key === "Escape") {
        e.preventDefault();
        upgOpenLocal = false;
        closeUpgradeMenu();
      }
    };
    window.addEventListener("keydown", onKey, true);
    upgOverlayCleanup = () => {
      upgOpenLocal = false;
      window.removeEventListener("currency:change", onCurrencyChange2);
      window.removeEventListener("xp:change", onCurrencyChange2);
      window.removeEventListener("xp:unlock", onCurrencyChange2);
      document.removeEventListener("ccc:upgrades:changed", onUpgradesChanged3);
      window.removeEventListener("keydown", onKey, true);
    };
  }
  function onKeydownForShop(e) {
    if (!shopOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeShop();
    }
  }
  function openShop() {
    ensureShopOverlay();
    if (shopCloseTimer) {
      clearTimeout(shopCloseTimer);
      shopCloseTimer = null;
    }
    if (typeof updateDelveGlow === "function") updateDelveGlow();
    updateShopOverlay(true);
    if (shopOpen) return;
    shopOpen = true;
    shopSheetEl.style.transition = "none";
    shopSheetEl.style.transform = "";
    shopOverlayEl.style.pointerEvents = "auto";
    void shopSheetEl.offsetHeight;
    requestAnimationFrame(() => {
      shopSheetEl.style.transition = "";
      shopOverlayEl.classList.add("is-open");
      __shopOpenStamp = performance.now();
      __shopPostOpenPointer = false;
      if (IS_MOBILE) {
        try {
          setTimeout(() => suppressNextGhostTap(240), 120);
        } catch {
        }
      }
      blockInteraction(10);
      ensureCustomScrollbar();
      const focusable = shopOverlayEl.querySelector("#shop-grid .shop-upgrade") || shopOverlayEl.querySelector("#shop-grid");
      if (focusable) focusable.focus();
    });
  }
  function closeShop(force = false) {
    const forceClose = force === true;
    const overlayOpen = shopOverlayEl?.classList?.contains("is-open");
    if (!forceClose && !shopOpen && !overlayOpen) {
      if (shopCloseTimer) {
        clearTimeout(shopCloseTimer);
        shopCloseTimer = null;
      }
      return;
    }
    if (shopCloseTimer) {
      clearTimeout(shopCloseTimer);
      shopCloseTimer = null;
    }
    shopOpen = false;
    if (shopSheetEl) {
      shopSheetEl.style.transition = "";
      shopSheetEl.style.transform = "";
    }
    shopOverlayEl.classList.remove("is-open");
    shopOverlayEl.style.pointerEvents = "none";
    __shopPostOpenPointer = false;
  }
  function onDragStart(e) {
    if (!shopOpen) return;
    const clientY = typeof e.clientY === "number" ? e.clientY : e.touches && e.touches[0] ? e.touches[0].clientY : 0;
    drag = { startY: clientY, lastY: clientY, startT: performance.now(), moved: 0, canceled: false };
    shopSheetEl.style.transition = "none";
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragCancel);
  }
  function onDragMove(e) {
    if (!drag || drag.canceled) return;
    const y = e.clientY;
    if (typeof y !== "number") return;
    const dy = Math.max(0, y - drag.startY);
    drag.lastY = y;
    drag.moved = dy;
    shopSheetEl.style.transform = `translateY(${dy}px)`;
  }
  function onDragEnd() {
    if (!drag || drag.canceled) return cleanupDrag();
    const dt = Math.max(1, performance.now() - drag.startT);
    const dy = drag.moved;
    const velocity = dy / dt;
    const shouldClose = velocity > 0.55 && dy > 40 || dy > 140;
    if (shouldClose) {
      suppressNextGhostTap(100);
      blockInteraction(80);
      shopSheetEl.style.transition = "transform 140ms ease-out";
      shopSheetEl.style.transform = "translateY(100%)";
      shopOpen = false;
      shopCloseTimer = setTimeout(() => {
        shopCloseTimer = null;
        closeShop(true);
      }, 150);
    } else {
      shopSheetEl.style.transition = "transform 180ms ease";
      shopSheetEl.style.transform = "translateY(0)";
    }
    cleanupDrag();
  }
  function onDragCancel() {
    if (!drag) return;
    drag.canceled = true;
    shopSheetEl.style.transition = "transform 180ms ease";
    shopSheetEl.style.transform = "translateY(0)";
    cleanupDrag();
  }
  function cleanupDrag() {
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
    window.removeEventListener("pointercancel", onDragCancel);
    drag = null;
  }
  function updateShopOverlay(force = false) {
    if (!force && !shopOpen) return;
    buildUpgradesData();
    renderShopGrid();
  }
  var shopOverlayEl, shopSheetEl, shopOpen, drag, eventsBound, delveBtnEl, updateDelveGlow, shopCloseTimer, __shopOpenStamp, __shopPostOpenPointer, BASE_ICON_SRC_BY_COST, LOCKED_BASE_ICON_SRC, MAXED_BASE_OVERLAY_SRC, CURRENCY_ICON_SRC, FORGE_UNLOCK_UPGRADE_ID, PURCHASE_SFX_SRC, EVOLVE_SFX_SRC, MOBILE_PURCHASE_VOLUME, DESKTOP_PURCHASE_VOLUME, purchaseSfx, evolveSfx, TRANSPARENT_PX, upgrades, upgOverlayEl, upgSheetEl, upgOpen, upgOverlayCleanup;
  var init_shopOverlay = __esm({
    "js/ui/shopOverlay.js"() {
      init_storage();
      init_bigNum();
      init_numFormat();
      init_main();
      init_dlgTab();
      init_audioCache();
      init_upgrades();
      init_ghostTapGuard();
      shopOverlayEl = null;
      shopSheetEl = null;
      shopOpen = false;
      drag = null;
      eventsBound = false;
      delveBtnEl = null;
      updateDelveGlow = null;
      shopCloseTimer = null;
      __shopOpenStamp = 0;
      __shopPostOpenPointer = false;
      if (typeof window !== "undefined") {
        window.addEventListener("debug:change", (e) => {
          const activeSlot = typeof getActiveSlot === "function" ? getActiveSlot() : null;
          const targetSlot = e?.detail?.slot ?? activeSlot;
          if (activeSlot != null && targetSlot != null && activeSlot !== targetSlot) return;
          updateShopOverlay(true);
        });
      }
      BASE_ICON_SRC_BY_COST = {
        coins: "img/currencies/coin/coin_base.png",
        books: "img/currencies/book/book_base.png",
        gold: "img/currencies/gold/gold_base.png"
      };
      LOCKED_BASE_ICON_SRC = "img/misc/locked_base.png";
      MAXED_BASE_OVERLAY_SRC = "img/misc/maxed.png";
      CURRENCY_ICON_SRC = {
        coins: "img/currencies/coin/coin.png",
        books: "img/currencies/book/book.png",
        gold: "img/currencies/gold/gold.png"
      };
      FORGE_UNLOCK_UPGRADE_ID = 7;
      PURCHASE_SFX_SRC = "sounds/purchase_upg.mp3";
      EVOLVE_SFX_SRC = "sounds/evolve_upg.mp3";
      MOBILE_PURCHASE_VOLUME = 0.12;
      DESKTOP_PURCHASE_VOLUME = 0.3;
      purchaseSfx = createSfxPlayer({
        src: PURCHASE_SFX_SRC,
        mobileVolume: MOBILE_PURCHASE_VOLUME,
        desktopVolume: DESKTOP_PURCHASE_VOLUME
      });
      evolveSfx = createSfxPlayer({
        src: EVOLVE_SFX_SRC,
        mobileVolume: MOBILE_PURCHASE_VOLUME * 2,
        desktopVolume: DESKTOP_PURCHASE_VOLUME * 2
      });
      TRANSPARENT_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3x0S8AAAAASUVORK5CYII=";
      upgrades = {};
      upgOverlayEl = null;
      upgSheetEl = null;
      upgOpen = false;
      upgOverlayCleanup = null;
    }
  });

  // js/ui/hudButtons.js
  var hudButtons_exports = {};
  __export(hudButtons_exports, {
    applyHudLayout: () => applyHudLayout,
    initHudButtons: () => initHudButtons,
    isMapUnlocked: () => isMapUnlocked,
    isShopUnlocked: () => isShopUnlocked,
    lockMap: () => lockMap,
    lockShop: () => lockShop,
    unlockMap: () => unlockMap,
    unlockShop: () => unlockShop
  });
  function slotKey(base) {
    const slot = getActiveSlot();
    return slot == null ? base : `${base}:${slot}`;
  }
  function isUnlocked(base) {
    const key = slotKey(base);
    const slotRaw = localStorage.getItem(key);
    if (slotRaw != null) return slotRaw === "1";
    return localStorage.getItem(base) === "1";
  }
  function isShopUnlocked() {
    ensureUnlockDefaults();
    return isUnlocked(BASE_KEYS.SHOP);
  }
  function isMapUnlocked() {
    ensureUnlockDefaults();
    return isUnlocked(BASE_KEYS.MAP);
  }
  function setUnlocked(base, v) {
    const val = v ? "1" : "0";
    const key = slotKey(base);
    localStorage.setItem(key, val);
    if (key !== base && localStorage.getItem(base) != null) {
      localStorage.setItem(base, val);
    }
    try {
      window.dispatchEvent(new CustomEvent("unlock:change", {
        detail: { key: base, slot: getActiveSlot() }
      }));
    } catch {
    }
  }
  function ensureUnlockDefaults() {
    for (const key of Object.values(BASE_KEYS)) {
      const sk2 = slotKey(key);
      const hasSlot = localStorage.getItem(sk2) != null;
      if (!hasSlot) localStorage.setItem(sk2, "0");
    }
  }
  function setButtonVisible(key, visible) {
    const el = document.querySelector(`.hud-bottom [data-btn="${key}"]`);
    if (el) el.hidden = !visible;
  }
  function updateShopButtonTamperState() {
    const btn = document.querySelector('.hud-bottom [data-btn="shop"]');
    if (!btn) return;
    btn.classList.toggle("btn-shop--modified", hasModifiedSave());
  }
  function phonePortrait() {
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    const isPortrait = window.innerHeight >= window.innerWidth;
    return isCoarse && isPortrait;
  }
  function applyHudLayout() {
    const hud = document.querySelector(".hud-bottom");
    if (!hud) return;
    const mapBtn = hud.querySelector('[data-btn="map"]');
    const isMapVisible = !!(mapBtn && !mapBtn.hidden);
    const isPhonePortrait = phonePortrait();
    const baseOrder = ["help", "shop", "stats", "map"];
    const mobileMapOrder = ["help", "stats", "shop", "map"];
    const desiredOrder = isPhonePortrait && isMapVisible ? mobileMapOrder : baseOrder;
    const desiredNodes = desiredOrder.map((key) => hud.querySelector(`.game-btn[data-btn="${key}"]`)).filter(Boolean);
    const remainingNodes = [...hud.children].filter((el) => !desiredNodes.includes(el));
    const finalOrder = [...desiredNodes, ...remainingNodes];
    const needsReorder = finalOrder.length && finalOrder.some((el, idx) => hud.children[idx] !== el);
    if (needsReorder) {
      const frag = document.createDocumentFragment();
      finalOrder.forEach((node) => frag.appendChild(node));
      hud.appendChild(frag);
    }
    const all = [...hud.querySelectorAll(".game-btn")];
    const visible = all.filter((el) => !el.hidden);
    hud.classList.remove("is-2", "is-3", "is-4");
    visible.forEach((el) => {
      el.style.gridColumn = "";
      el.style.gridRow = "";
      el.classList.remove("span-2");
      el.style.order = "";
    });
    hud.style.gridTemplateColumns = "";
    hud.classList.add(`is-${visible.length}`);
    if (!isPhonePortrait) {
      const cs = getComputedStyle(hud);
      const gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;
      const cw = hud.clientWidth;
      const per = Math.max(180, Math.floor((cw - 3 * gap) / 4));
      if (visible.length === 2) {
        hud.style.gridTemplateColumns = `1fr ${per}px ${per}px 1fr`;
        visible[0].style.gridColumn = "2";
        visible[1].style.gridColumn = "3";
        return;
      }
      if (visible.length === 3) {
        hud.style.gridTemplateColumns = `1fr ${per}px ${per}px ${per}px 1fr`;
        visible[0].style.gridColumn = "2";
        visible[1].style.gridColumn = "3";
        visible[2].style.gridColumn = "4";
        return;
      }
    }
    if (isPhonePortrait && visible.length === 3) {
      const help = hud.querySelector('[data-btn="help"]:not([hidden])');
      const stats = hud.querySelector('[data-btn="stats"]:not([hidden])');
      const shop = hud.querySelector('[data-btn="shop"]:not([hidden])');
      if (help && stats && shop) {
        help.style.gridColumn = "1";
        help.style.gridRow = "1";
        stats.style.gridColumn = "2";
        stats.style.gridRow = "1";
        shop.style.gridColumn = "1 / -1";
        shop.style.gridRow = "2";
      }
    }
  }
  function initHudButtons() {
    ensureUnlockDefaults();
    setButtonVisible("help", true);
    setButtonVisible("stats", true);
    setButtonVisible("shop", isUnlocked(BASE_KEYS.SHOP));
    setButtonVisible("map", isUnlocked(BASE_KEYS.MAP));
    updateShopButtonTamperState();
    applyHudLayout();
    if (!listenersBound) {
      listenersBound = true;
      window.addEventListener("resize", applyHudLayout);
      window.addEventListener("orientationchange", applyHudLayout);
      window.addEventListener("saveSlot:change", () => {
        setButtonVisible("shop", isUnlocked(BASE_KEYS.SHOP));
        setButtonVisible("map", isUnlocked(BASE_KEYS.MAP));
        updateShopButtonTamperState();
        applyHudLayout();
      });
      window.addEventListener("saveSlot:modified", (event) => {
        const active = getActiveSlot();
        const slot = event?.detail?.slot;
        if (slot != null && active != null && slot !== active) return;
        updateShopButtonTamperState();
      });
    }
    if (!actionsBound) {
      actionsBound = true;
      const hud = document.querySelector(".hud-bottom");
      if (hud) {
        const activate = (btn) => {
          if (!btn) return;
          const key = btn.getAttribute("data-btn");
          if (key === "shop") {
            openShop();
          }
        };
        const onClick = (e) => {
          const btn = e.target.closest(".game-btn");
          if (!btn) return;
          const key = btn.getAttribute("data-btn");
          if (key !== "shop") return;
          if (shouldSkipGhostTap(btn)) return;
          markGhostTapTarget(btn);
          activate(btn);
        };
        const hasPointerEvents2 = typeof window !== "undefined" && "PointerEvent" in window;
        const onPointerDown = (e) => {
          if (e.pointerType === "mouse") return;
          if (typeof e.button === "number" && e.button !== 0) return;
          const btn = e.target.closest(".game-btn");
          if (!btn) return;
          const key = btn.getAttribute("data-btn");
          if (key !== "shop") return;
          markGhostTapTarget(btn);
          activate(btn);
          e.preventDefault();
        };
        const onTouchStart2 = (e) => {
          const btn = e.target.closest(".game-btn");
          if (!btn) return;
          const key = btn.getAttribute("data-btn");
          if (key !== "shop") return;
          markGhostTapTarget(btn);
          activate(btn);
          e.preventDefault();
        };
        hud.addEventListener("click", onClick, { passive: true });
        if (hasPointerEvents2) {
          hud.addEventListener("pointerdown", onPointerDown, { passive: false });
        } else {
          hud.addEventListener("touchstart", onTouchStart2, { passive: false });
        }
      }
    }
  }
  function unlockShop() {
    setUnlocked(BASE_KEYS.SHOP, true);
    setButtonVisible("shop", true);
    applyHudLayout();
  }
  function unlockMap() {
    setUnlocked(BASE_KEYS.MAP, true);
    setButtonVisible("map", true);
    applyHudLayout();
  }
  function lockShop() {
    setUnlocked(BASE_KEYS.SHOP, false);
    setButtonVisible("shop", false);
    applyHudLayout();
  }
  function lockMap() {
    setUnlocked(BASE_KEYS.MAP, false);
    setButtonVisible("map", false);
    applyHudLayout();
  }
  var BASE_KEYS, listenersBound, actionsBound;
  var init_hudButtons = __esm({
    "js/ui/hudButtons.js"() {
      init_shopOverlay();
      init_storage();
      init_ghostTapGuard();
      BASE_KEYS = {
        SHOP: "ccc:unlock:shop",
        MAP: "ccc:unlock:map"
      };
      listenersBound = false;
      actionsBound = false;
    }
  });

  // js/util/debugPanel.js
  var debugPanel_exports = {};
  __export(debugPanel_exports, {
    applyAllCurrencyOverridesForActiveSlot: () => applyAllCurrencyOverridesForActiveSlot,
    applyStatMultiplierOverride: () => applyStatMultiplierOverride,
    getDebugCurrencyMultiplierOverride: () => getDebugCurrencyMultiplierOverride,
    getDebugStatMultiplierOverride: () => getDebugStatMultiplierOverride,
    setDebugCurrencyMultiplierOverride: () => setDebugCurrencyMultiplierOverride,
    setDebugPanelAccess: () => setDebugPanelAccess,
    setDebugStatMultiplierOverride: () => setDebugStatMultiplierOverride
  });
  function isOnMenu() {
    const menuRoot = document.querySelector(".menu-root");
    if (!menuRoot) return false;
    const style = window.getComputedStyle?.(menuRoot);
    if (!style) return menuRoot.style.display !== "none";
    return style.display !== "none" && style.visibility !== "hidden" && !menuRoot.hidden;
  }
  function isGameVisible() {
    const gameRoot = document.getElementById("game-root");
    if (!gameRoot) return false;
    const style = window.getComputedStyle?.(gameRoot);
    if (!style) {
      return gameRoot.style.display !== "none" && gameRoot.style.visibility !== "hidden" && !gameRoot.hidden;
    }
    return style.display !== "none" && style.visibility !== "hidden" && !gameRoot.hidden;
  }
  function addDebugPanelCleanup(fn) {
    if (typeof fn === "function") {
      debugPanelCleanups.push(fn);
    }
  }
  function createEmptyExpansionState() {
    return { sections: /* @__PURE__ */ new Set(), subsections: /* @__PURE__ */ new Set() };
  }
  function captureDebugPanelExpansionState() {
    const panel = document.getElementById(DEBUG_PANEL_ID);
    if (!panel) return createEmptyExpansionState();
    const sections = /* @__PURE__ */ new Set();
    panel.querySelectorAll(".debug-panel-section-toggle").forEach((toggle) => {
      const key = toggle.dataset.sectionKey ?? toggle.textContent;
      if (toggle.classList.contains("expanded")) {
        sections.add(key);
      }
    });
    const subsections = /* @__PURE__ */ new Set();
    panel.querySelectorAll(".debug-panel-subsection-toggle").forEach((toggle) => {
      const key = toggle.dataset.subsectionKey ?? toggle.textContent;
      if (toggle.classList.contains("expanded")) {
        subsections.add(key);
      }
    });
    return { sections, subsections };
  }
  function applyDebugPanelExpansionState(panel) {
    const { sections, subsections } = debugPanelExpansionState ?? createEmptyExpansionState();
    panel.querySelectorAll(".debug-panel-section-toggle").forEach((toggle) => {
      const key = toggle.dataset.sectionKey ?? toggle.textContent;
      if (!sections.has(key)) return;
      const content = toggle.nextElementSibling;
      toggle.classList.add("expanded");
      if (content) content.classList.add("active");
    });
    panel.querySelectorAll(".debug-panel-subsection-toggle").forEach((toggle) => {
      const key = toggle.dataset.subsectionKey ?? toggle.textContent;
      if (!subsections.has(key)) return;
      const content = toggle.nextElementSibling;
      toggle.classList.add("expanded");
      if (content) content.classList.add("active");
    });
  }
  function cleanupDebugPanelResources() {
    debugPanelCleanups.forEach((fn) => {
      try {
        fn?.();
      } catch {
      }
    });
    debugPanelCleanups = [];
    liveBindings.length = 0;
  }
  function registerLiveBinding(binding) {
    if (!binding || typeof binding.refresh !== "function") return;
    liveBindings.push(binding);
  }
  function refreshLiveBindings(predicate) {
    liveBindings.forEach((binding) => {
      if (typeof predicate === "function" && !predicate(binding)) return;
      try {
        binding.refresh();
      } catch {
      }
    });
  }
  function setupLiveBindingListeners() {
    if (typeof window === "undefined") return;
    const currencyHandler = (event) => {
      const { key, slot } = event?.detail ?? {};
      const targetSlot = slot ?? getActiveSlot();
      refreshLiveBindings((binding) => binding.type === "currency" && binding.key === key && binding.slot === targetSlot);
    };
    window.addEventListener("currency:change", currencyHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener("currency:change", currencyHandler));
    const currencyMultiplierHandler = (event) => {
      const { key, slot } = event?.detail ?? {};
      const targetSlot = slot ?? getActiveSlot();
      refreshLiveBindings((binding) => binding.type === "currency-mult" && binding.key === key && binding.slot === targetSlot);
    };
    window.addEventListener("currency:multiplier", currencyMultiplierHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener("currency:multiplier", currencyMultiplierHandler));
    const xpHandler = (event) => {
      const { slot } = event?.detail ?? {};
      const targetSlot = slot ?? getActiveSlot();
      refreshLiveBindings((binding) => binding.type === "xp" && binding.slot === targetSlot);
    };
    window.addEventListener("xp:change", xpHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener("xp:change", xpHandler));
    const mutationHandler = () => {
      const targetSlot = getActiveSlot();
      refreshLiveBindings((binding) => binding.type === "mutation" && binding.slot === targetSlot);
      refreshLiveBindings((binding) => binding.type === "stat-mult" && binding.key === "mutation" && binding.slot === targetSlot);
    };
    window.addEventListener("mutation:change", mutationHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener("mutation:change", mutationHandler));
    const upgradeHandler = () => {
      const targetSlot = getActiveSlot();
      refreshLiveBindings((binding) => binding.type === "upgrade" && binding.slot === targetSlot);
      refreshLiveBindings((binding) => binding.type === "currency-mult" && binding.slot === targetSlot);
      refreshLiveBindings((binding) => binding.type === "stat-mult" && binding.slot === targetSlot);
    };
    document.addEventListener("ccc:upgrades:changed", upgradeHandler, { passive: true });
    addDebugPanelCleanup(() => document.removeEventListener("ccc:upgrades:changed", upgradeHandler));
    const slotHandler = () => {
      const targetSlot = getActiveSlot();
      refreshLiveBindings((binding) => binding.slot === targetSlot);
    };
    window.addEventListener("saveSlot:change", slotHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener("saveSlot:change", slotHandler));
    const unlockHandler = (event) => {
      const { slot, key } = event?.detail ?? {};
      const targetSlot = slot ?? getActiveSlot();
      refreshLiveBindings((binding) => binding.type === "unlock" && (binding.slot == null || binding.slot === targetSlot) && (binding.key == null || binding.key === key));
    };
    window.addEventListener("unlock:change", unlockHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener("unlock:change", unlockHandler));
  }
  function getAreas() {
    return [
      {
        key: AREA_KEYS.STARTER_COVE,
        title: "The Cove",
        currencies: [
          { key: CURRENCIES.COINS, label: "Coins" },
          { key: CURRENCIES.BOOKS, label: "Books" },
          { key: CURRENCIES.GOLD, label: "Gold" }
        ],
        stats: [
          { key: "xp", label: "XP" },
          { key: "mutation", label: "MP" }
        ]
      }
    ];
  }
  function ensureDebugPanelStyles() {
    let style = document.getElementById(DEBUG_PANEL_STYLE_ID);
    if (style) return;
    style = document.createElement("style");
    style.id = DEBUG_PANEL_STYLE_ID;
    style.textContent = `
        .debug-panel {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            width: 600px;
            max-height: 100vh;
            overflow-y: auto;
            background: rgb(0, 0, 0);
            color: #fff;
            font-family: Arial, sans-serif;
            padding: 12px;
            border-radius: 6px 0 0 6px;
            box-shadow: -2px 0 10px rgba(0, 0, 0, 0.6);
            z-index: 2147483646;
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.22) rgba(0, 0, 0, 0.5);
			border: 1px solid white;
        }

        .debug-panel::-webkit-scrollbar,
        .debug-panel-section-content::-webkit-scrollbar,
        .debug-panel-subsection-content::-webkit-scrollbar {
            width: 10px;
        }

        .debug-panel::-webkit-scrollbar-track,
        .debug-panel-section-content::-webkit-scrollbar-track,
        .debug-panel-subsection-content::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.35);
            border-radius: 6px;
        }

        .debug-panel::-webkit-scrollbar-thumb,
        .debug-panel-section-content::-webkit-scrollbar-thumb,
        .debug-panel-subsection-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.22);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .debug-panel::-webkit-scrollbar-thumb:hover,
        .debug-panel-section-content::-webkit-scrollbar-thumb:hover,
        .debug-panel-subsection-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .debug-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }

        .debug-panel-title {
            font-size: 1.2em;
            font-weight: bold;
        }

        .debug-panel-info {
            font-size: 0.95em;
            color: #ccc;
        }

        .debug-panel-info-line + .debug-panel-info-line {
            margin-top: 2px;
        }

        @media (pointer: coarse) {
            .debug-panel-info-mobile-hidden {
                display: none;
            }
        }

        @media (max-width: 600px) {
            .debug-panel {
                left: 0;
                right: 0;
                top: 0;
                transform: none;
                width: auto;
                max-width: none;
                max-height: calc(90vh - 12px);
                padding: 8px;
                margin: 6px;
                border-radius: 8px;
            }

            .debug-panel-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 6px;
            }

            .debug-panel-title {
                font-size: 1.05em;
            }

            .debug-panel-info {
                font-size: 0.85em;
            }

            .debug-panel-section-toggle,
            .debug-panel-subsection-toggle {
                align-items: flex-start;
                gap: 6px;
            }

            .debug-panel-row {
                flex-direction: column;
                align-items: stretch;
            }

            .debug-panel-toggle,
            .debug-misc-button {
                width: 100%;
            }

            .debug-misc-button-list {
                justify-content: flex-start;
            }

            .debug-panel-close-buttons {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                width: 100%;
            }

            .debug-panel-close {
                width: 100%;
                font-size: 1em;
                padding: 10px 14px;
                border-radius: 6px;
                background: hsla(0, 80%, 40%, 0.15);
                border: 1px solid hsla(0, 80%, 40%, 0.45);
                color: #fff;
                text-align: center;
            }

            .debug-panel-close + .debug-panel-close {
                margin-top: 6px;
            }
        }

        .debug-panel-close-buttons {
            display: none;
            gap: 8px;
        }

        .debug-panel-close {
            background: hsla(0, 80%, 40%, 0.15);
            border: 1px solid hsla(0, 80%, 40%, 0.45);
            color: #fff;
            font-size: 1.05em;
            cursor: pointer;
            border-radius: 4px;
            padding: 6px 10px;
            transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .debug-panel-close:hover {
            background: hsla(0, 80%, 40%, 0.22);
        }

        .debug-panel-close:active {
            transform: translateY(1px);
            background: hsla(0, 80%, 40%, 0.28);
        }

        .debug-panel-close.debug-panel-close-collapse {
            font-size: 1em;
        }

        .debug-panel-section {
            border: 1px solid #444;
            border-radius: 4px;
            margin-bottom: 10px;
            background: rgba(255, 255, 255, 0.05);
        }

        .debug-panel-section-toggle {
            width: 100%;
            text-align: left;
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: #fff;
            padding: 8px 10px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .debug-panel-section-toggle::before {
            content: '\u25B6';
            font-size: 1em;
            width: 1em;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .debug-panel-section-toggle.expanded::before {
            content: '\u25BC';
        }

        .debug-panel-section-content {
            padding: 8px 10px;
            border-top: 1px solid #444;
            display: none;
        }

        .debug-panel-section-content.active {
            display: block;
        }

        .debug-panel-empty {
            color: #aaa;
            font-style: italic;
        }

        .action-log-entry {
            display: flex;
            gap: 6px;
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .action-log-entry:last-child {
            border-bottom: none;
        }

        .action-log-time {
            color: #7bc0ff;
            font-weight: bold;
            min-width: 60px;
        }

        .action-log-message {
            flex: 1;
        }

        .action-log-empty {
            color: #aaa;
            font-style: italic;
            padding: 6px 0;
        }

        .action-log-number {
            color: #ffd54f;
            font-weight: bold;
        }

        .action-log-number::after {
            content: attr(data-unit);
            color: #ffa726;
            font-weight: normal;
            margin-left: 0;
        }

        .action-log-number[data-unit]:not([data-unit=""])::after {
            margin-left: 2px;
        }

        .action-log-level {
            color: #ffd700;
            font-weight: bold;
            text-shadow: 0 0 2px rgba(0,0,0,0.5);
            border-radius: 3px;
            padding: 0 2px;
        }

        .action-log-level span {
            color: #ffd700;
        }

        .action-log-gold {
            color: #ffd700;
            font-weight: bold;
            text-shadow: 0 0 2px rgba(0,0,0,0.5);
            border-radius: 3px;
            padding: 0;
        }

        .debug-panel-subsection {
            margin: 8px 0 12px;
            border: 1px solid #333;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.03);
        }

        .debug-panel-subsection-toggle {
            width: 100%;
            text-align: left;
            background: rgba(255, 255, 255, 0.06);
            border: none;
            color: #fff;
            padding: 6px 8px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.95em;
        }

        .debug-panel-subsection-toggle::before {
            content: '\u25B6';
            font-size: 1em;
            width: 1em;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .debug-panel-subsection-toggle.expanded::before {
            content: '\u25BC';
        }

        .debug-panel-subsection-content {
            display: none;
            padding: 8px 10px;
            border-top: 1px solid #333;
        }

        .debug-panel-subsection-content.active {
            display: block;
        }

        .debug-panel-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 4px 0;
        }

        .debug-panel-toggle {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid #555;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.12s ease, transform 0.12s ease;
        }

        .debug-panel-toggle:hover {
            background: rgba(255, 255, 255, 0.12);
            transform: translateY(-1px);
        }

        .debug-panel-toggle.debug-danger-button {
            border-color: hsla(0, 80%, 40%, 0.45);
            background: hsla(0, 80%, 40%, 0.15);
            color: #fff;
            font-weight: 700;
            letter-spacing: 0.2px;
        }

        .debug-panel-toggle.debug-danger-button:hover {
            background: hsla(0, 80%, 40%, 0.22);
        }

        .debug-panel-toggle.debug-danger-button:active {
            background: hsla(0, 80%, 40%, 0.28);
            transform: translateY(1px);
        }

        .debug-misc-button-list {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: center;
        }

        .debug-misc-button {
            flex: 0 1 170px;
            min-width: 150px;
            max-width: 190px;
            padding: 6px 10px;
            text-align: center;
            font-weight: 600;
            font-size: 0.95em;
        }

        .debug-misc-button:hover {
            background: rgba(255, 255, 255, 0.14);
        }

        .debug-unlock-row {
            align-items: flex-start;
            justify-content: flex-start;
        }
		
		.debug-unlock-row,
		.debug-unlock-row * {
			user-select: none;
		}

        .debug-unlock-row .flag-toggle {
            flex: 0 0 auto;
        }

        .debug-unlock-text {
            flex: 1;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        }

        .debug-unlock-title {
            font-weight: 600;
        }

        .debug-unlock-desc {
            color: #aaa;
            font-size: 0.9em;
        }

        .debug-calculator-inputs {
            display: flex;
            flex: 0 0 245px;
            gap: 8px;
            flex-wrap: wrap;
        }

        .debug-calculator-output {
            min-width: 120px;
            text-align: right;
            font-family: Consolas, 'Courier New', monospace;
        }

        .debug-panel .infinity-symbol {
            font-size: 1.5em;
            line-height: 1.05;
        }

        .debug-panel-row label {
            flex: 1;
            font-size: 0.95em;
        }

        .debug-panel-input {
            flex: 0 0 245px;
            max-width: 100%;
            background: #111;
            color: #fff;
            border: 1px solid #555;
            padding: 6px 8px;
            border-radius: 4px;
            font-family: Consolas, 'Courier New', monospace;
        }

        .debug-lock-button {
            flex: 0 0 50px;
            max-width: 60px;
            padding: 6px 8px;
            border-radius: 4px;
            border: 1px solid #555;
            background: #111;
            color: #fff;
            font-weight: bold;
            cursor: pointer;
        }

        .debug-lock-button.locked {
            background: #440000;
            border-color: #aa0000;
            color: #ff6666;
        }

        .debug-panel-input.debug-invalid {
            border-color: #e66;
            box-shadow: 0 0 0 1px #e66;
        }

        .debug-panel-id {
            font-size: 0.8em;
            color: #aaa;
            margin-left: 6px;
            position: relative;
            top: -2px;
        }

        .debug-panel-toggle-button {
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 2147483647;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            border: 1px solid #666;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 0.9em;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }

        .debug-panel-toggle-button:hover {
            background: rgba(0, 0, 0, 0.95);
        }

        .flag-toggle {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }

        .flag-toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .flag-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #555;
            transition: .2s;
            border-radius: 12px;
        }

        .flag-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .2s;
            border-radius: 50%;
        }

        .flag-toggle input:checked + .flag-slider {
            background-color: #2196F3;
        }

        .flag-toggle input:checked + .flag-slider:before {
            transform: translateX(26px);
        }
		
		.debug-unlock-row:hover {
			cursor: pointer;
		}
    `;
    document.head.appendChild(style);
  }
  function removeDebugPanelToggleButton() {
    const existingButton = document.getElementById(DEBUG_PANEL_TOGGLE_ID);
    if (existingButton) existingButton.remove();
  }
  function shouldShowDebugPanelToggleButton() {
    return debugPanelAccess && IS_MOBILE && getActiveSlot() != null && !isOnMenu() && isGameVisible();
  }
  function onMenuVisibilityChange(event) {
    if (event?.detail?.visible) {
      closeDebugPanel();
    }
    createDebugPanelToggleButton();
  }
  function createSection(title, contentId, contentBuilder) {
    const section = document.createElement("div");
    section.className = "debug-panel-section";
    const toggle = document.createElement("button");
    toggle.className = "debug-panel-section-toggle";
    toggle.type = "button";
    toggle.textContent = title;
    const stateKey = contentId || `${title}-${sectionKeyCounter++}`;
    toggle.dataset.sectionKey = stateKey;
    section.appendChild(toggle);
    const content = document.createElement("div");
    content.className = "debug-panel-section-content";
    content.id = contentId;
    content.dataset.sectionKey = stateKey;
    contentBuilder(content);
    section.appendChild(content);
    toggle.addEventListener("click", () => {
      const expanded = toggle.classList.toggle("expanded");
      content.classList.toggle("active", expanded);
    });
    return section;
  }
  function createSubsection(title, contentBuilder, { defaultExpanded = false } = {}) {
    const container2 = document.createElement("div");
    container2.className = "debug-panel-subsection";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "debug-panel-subsection-toggle";
    toggle.textContent = title;
    const stateKey = `${title}-${subsectionKeyCounter++}`;
    toggle.dataset.subsectionKey = stateKey;
    container2.appendChild(toggle);
    const content = document.createElement("div");
    content.className = "debug-panel-subsection-content";
    content.dataset.subsectionKey = stateKey;
    contentBuilder(content);
    container2.appendChild(content);
    toggle.addEventListener("click", () => {
      const expanded = toggle.classList.toggle("expanded");
      content.classList.toggle("active", expanded);
    });
    if (defaultExpanded) {
      toggle.classList.add("expanded");
      content.classList.add("active");
    }
    return container2;
  }
  function bigNumEquals2(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a?.cmp === "function") {
      try {
        return a.cmp(b) === 0;
      } catch {
      }
    }
    if (typeof b?.cmp === "function") {
      try {
        return b.cmp(a) === 0;
      } catch {
      }
    }
    try {
      return Object.is(String(a), String(b));
    } catch {
      return false;
    }
  }
  function bigNumToFiniteNumber2(value) {
    try {
      const fromScientific = value?.toScientific?.(18);
      const num = Number.parseFloat(fromScientific ?? value);
      return Number.isFinite(num) ? num : Number.NaN;
    } catch {
      return Number.NaN;
    }
  }
  function getCurrencyStorageKey(currencyKey, slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    if (resolvedSlot == null) return null;
    return `${KEYS.CURRENCY[currencyKey]}:${resolvedSlot}`;
  }
  function getCurrencyValueForSlot(currencyKey, slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    if (resolvedSlot == null) return BigNum.fromInt(0);
    const handle = bank?.[currencyKey];
    if (handle) {
      try {
        return handle.value ?? BigNum.fromInt(0);
      } catch {
      }
    }
    try {
      return peekCurrency(resolvedSlot, currencyKey);
    } catch {
      return BigNum.fromInt(0);
    }
  }
  function applyCurrencyState(currencyKey, value, slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    const previous = getCurrencyValueForSlot(currencyKey, resolvedSlot);
    if (resolvedSlot == null || resolvedSlot !== getActiveSlot()) {
      return { previous, next: previous };
    }
    const storageKey = getCurrencyStorageKey(currencyKey, resolvedSlot);
    const wasLocked = storageKey && isStorageKeyLocked(storageKey);
    if (wasLocked) unlockStorageKey(storageKey);
    let next = previous;
    try {
      markSaveSlotModified(resolvedSlot);
      const effective = setCurrency(currencyKey, value, { previous });
      next = effective ?? previous;
      if (storageKey) primeStorageWatcherSnapshot(storageKey);
    } catch {
    } finally {
      if (wasLocked) lockStorageKey(storageKey);
    }
    refreshLiveBindings((binding) => binding.type === "currency" && binding.key === currencyKey && binding.slot === resolvedSlot);
    return { previous, next };
  }
  function buildOverrideKey(slot, key) {
    return `${slot ?? "null"}::${key}`;
  }
  function getCurrencyOverride(slot, key) {
    return currencyOverrides.get(buildOverrideKey(slot, key)) ?? null;
  }
  function clearCurrencyMultiplierOverride(currencyKey, slot = getActiveSlot()) {
    const cacheKey = buildOverrideKey(slot, currencyKey);
    currencyOverrides.delete(cacheKey);
    currencyOverrideBaselines.delete(cacheKey);
    refreshLiveBindings((binding) => binding.type === "currency-mult" && binding.key === currencyKey && binding.slot === slot);
  }
  function getStatOverride(slot, key) {
    const lockAwareRefresh = !isStatMultiplierLocked(key, slot);
    const cacheKey = buildOverrideKey(slot, key);
    const cached = statOverrides.get(cacheKey);
    if (!lockAwareRefresh && cached) return cached;
    const fromStorage = loadStatMultiplierOverrideFromStorage(key, slot);
    if (!fromStorage) {
      if (lockAwareRefresh) statOverrides.delete(cacheKey);
      return null;
    }
    statOverrides.set(cacheKey, fromStorage);
    return fromStorage;
  }
  function notifyStatMultiplierChange(statKey, slot) {
    refreshLiveBindings((binding) => binding.type === "stat-mult" && binding.key === statKey && binding.slot === slot);
  }
  function clearStatMultiplierOverride(statKey, slot = getActiveSlot()) {
    const storageKey = getStatMultiplierStorageKey(statKey, slot);
    statOverrides.delete(buildOverrideKey(slot, statKey));
    statOverrideBaselines.delete(buildOverrideKey(slot, statKey));
    if (!storageKey || typeof localStorage === "undefined") return;
    if (isStorageKeyLocked(storageKey)) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
    }
    notifyStatMultiplierChange(statKey, slot);
  }
  function isStatMultiplierLocked(statKey, slot = getActiveSlot()) {
    return isStorageKeyLocked(getStatMultiplierStorageKey(statKey, slot));
  }
  function getLockedStatOverride(slot, statKey) {
    if (!isStatMultiplierLocked(statKey, slot)) return null;
    return getStatOverride(slot, statKey);
  }
  function getStatMultiplierDisplayValue(statKey, slot = getActiveSlot()) {
    const gameValue = getGameStatMultiplier(statKey);
    const effectiveOverride = getEffectiveStatMultiplierOverride(statKey, slot, gameValue);
    return effectiveOverride ?? gameValue;
  }
  function getStatMultiplierStorageKey(statKey, slot = getActiveSlot()) {
    if (!statKey) return null;
    const resolvedSlot = slot ?? getActiveSlot();
    if (resolvedSlot == null) return null;
    return `${STAT_MULTIPLIER_STORAGE_PREFIX}:${statKey}:${resolvedSlot}`;
  }
  function getGameStatMultiplier(statKey) {
    try {
      if (statKey === "xp") {
        const { xpGainMultiplier } = computeUpgradeEffects(AREA_KEYS.STARTER_COVE) ?? {};
        if (xpGainMultiplier) return xpGainMultiplier;
      } else if (statKey === "mutation") {
        const valueMult = getMpValueMultiplierBn?.();
        if (valueMult) return valueMult;
        const mult = getMutationMultiplier();
        if (mult) return mult;
      }
    } catch {
    }
    return BigNum.fromInt(1);
  }
  function loadStatMultiplierOverrideFromStorage(statKey, slot = getActiveSlot()) {
    const storageKey = getStatMultiplierStorageKey(statKey, slot);
    if (!storageKey || typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      return BigNum.fromAny(raw);
    } catch {
      return null;
    }
  }
  function storeStatMultiplierOverride(statKey, slot, value) {
    const storageKey = getStatMultiplierStorageKey(statKey, slot);
    if (!storageKey || typeof localStorage === "undefined") return;
    try {
      const bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 1);
      const locked = isStorageKeyLocked(storageKey);
      const setter = locked && originalSetItem ? originalSetItem : localStorage.setItem.bind(localStorage);
      if (locked && !originalSetItem) unlockStorageKey(storageKey);
      setter(storageKey, bn.toStorage?.() ?? String(bn));
      if (locked && !originalSetItem) lockStorageKey(storageKey);
    } catch {
    }
  }
  function applyCurrencyOverrideForSlot(currencyKey, slot = getActiveSlot()) {
    if (slot == null) return;
    const override = getCurrencyOverride(slot, currencyKey);
    if (!override) return;
    if (slot !== getActiveSlot()) return;
    const cacheKey = buildOverrideKey(slot, currencyKey);
    if (currencyOverrideApplications.has(cacheKey)) return;
    currencyOverrideApplications.add(cacheKey);
    try {
      const current = bank?.[currencyKey]?.mult?.get?.();
      if (!bigNumEquals2(current, override)) {
        bank?.[currencyKey]?.mult?.set?.(override);
      }
    } catch {
    } finally {
      currencyOverrideApplications.delete(cacheKey);
    }
  }
  function ensureCurrencyOverrideListener() {
    if (currencyListenerAttached || typeof window === "undefined") return;
    currencyListenerAttached = true;
    try {
      window.addEventListener("currency:multiplier", (event) => {
        const { key, slot, mult } = event?.detail ?? {};
        const targetSlot = slot ?? getActiveSlot();
        const cacheKey = buildOverrideKey(targetSlot, key);
        if (!targetSlot || !currencyOverrides.has(cacheKey)) return;
        if (currencyOverrideApplications.has(cacheKey)) return;
        const baseline = currencyOverrideBaselines.get(cacheKey);
        const override = getCurrencyOverride(targetSlot, key);
        if (baseline && override && mult) {
          const baselineNum = bigNumToFiniteNumber2(baseline);
          const nextNum = bigNumToFiniteNumber2(mult);
          if (Number.isFinite(baselineNum) && Number.isFinite(nextNum) && baselineNum !== 0) {
            const ratio = nextNum / baselineNum;
            if (ratio && ratio !== 1) {
              try {
                const scaledOverride = override.mulDecimal?.(ratio) ?? override;
                currencyOverrides.set(cacheKey, scaledOverride);
              } catch {
              }
            }
          }
          currencyOverrideBaselines.set(cacheKey, mult);
        } else if (mult) {
          currencyOverrideBaselines.set(cacheKey, mult);
        }
        applyCurrencyOverrideForSlot(key, targetSlot);
      }, { passive: true });
      window.addEventListener("saveSlot:change", () => {
        applyAllCurrencyOverridesForActiveSlot();
      }, { passive: true });
    } catch {
    }
  }
  function applyAllCurrencyOverridesForActiveSlot() {
    const slot = getActiveSlot();
    if (slot == null) return;
    Object.values(CURRENCIES).forEach((key) => {
      applyCurrencyOverrideForSlot(key, slot);
    });
  }
  function setDebugCurrencyMultiplierOverride(currencyKey, value, slot = getActiveSlot()) {
    if (!currencyKey || slot == null) return null;
    ensureCurrencyOverrideListener();
    let bn;
    try {
      bn = value instanceof BigNum ? value.clone?.() ?? value : BigNum.fromAny(value ?? 1);
    } catch {
      bn = BigNum.fromInt(1);
    }
    const cacheKey = buildOverrideKey(slot, currencyKey);
    currencyOverrides.set(cacheKey, bn);
    const gameValue = bank?.[currencyKey]?.mult?.get?.();
    currencyOverrideBaselines.set(cacheKey, gameValue);
    applyCurrencyOverrideForSlot(currencyKey, slot);
    return bn;
  }
  function getDebugCurrencyMultiplierOverride(currencyKey, slot = getActiveSlot()) {
    if (!currencyKey || slot == null) return null;
    return getCurrencyOverride(slot, currencyKey);
  }
  function setDebugStatMultiplierOverride(statKey, value, slot = getActiveSlot()) {
    if (!statKey || slot == null) return null;
    let bn;
    try {
      bn = value instanceof BigNum ? value.clone?.() ?? value : BigNum.fromAny(value ?? 1);
    } catch {
      bn = BigNum.fromInt(1);
    }
    statOverrides.set(buildOverrideKey(slot, statKey), bn);
    statOverrideBaselines.set(buildOverrideKey(slot, statKey), getGameStatMultiplier(statKey));
    storeStatMultiplierOverride(statKey, slot, bn);
    notifyStatMultiplierChange(statKey, slot);
    return bn;
  }
  function getDebugStatMultiplierOverride(statKey, slot = getActiveSlot()) {
    if (!statKey || slot == null) return null;
    return getStatOverride(slot, statKey);
  }
  function applyStatMultiplierOverride(statKey, amount, slot = getActiveSlot()) {
    const gameValue = getGameStatMultiplier(statKey);
    const override = getEffectiveStatMultiplierOverride(statKey, slot, gameValue);
    if (!override) return amount;
    let base;
    try {
      base = amount instanceof BigNum ? amount.clone?.() ?? amount : BigNum.fromAny(amount ?? 0);
    } catch {
      return amount;
    }
    try {
      if (bigNumEquals2(base, gameValue)) {
        return override;
      }
    } catch {
    }
    try {
      if (base.isZero?.()) return base;
    } catch {
      return base;
    }
    const cacheKey = buildOverrideKey(slot, statKey);
    const baseline = statOverrideBaselines.get(cacheKey);
    const multiplierForRatio = isStatMultiplierLocked(statKey, slot) && baseline ? baseline : gameValue;
    const overrideNum = bigNumToFiniteNumber2(override);
    const gameValueNum = bigNumToFiniteNumber2(multiplierForRatio);
    const ratio = Number.isFinite(overrideNum) && Number.isFinite(gameValueNum) && gameValueNum !== 0 ? overrideNum / gameValueNum : Number.NaN;
    if (Number.isFinite(ratio) && ratio !== 1) {
      try {
        return base.mulDecimal?.(ratio) ?? base;
      } catch {
      }
    }
    return base;
  }
  function getEffectiveStatMultiplierOverride(statKey, slot, gameValue) {
    const override = getStatOverride(slot, statKey);
    const cacheKey = buildOverrideKey(slot, statKey);
    if (!override) {
      statOverrideBaselines.delete(cacheKey);
      return null;
    }
    const baseline = statOverrideBaselines.get(cacheKey);
    const locked = isStatMultiplierLocked(statKey, slot);
    if (!baseline) {
      statOverrideBaselines.set(cacheKey, gameValue);
    } else if (!bigNumEquals2(baseline, gameValue)) {
      statOverrideBaselines.set(cacheKey, gameValue);
      if (locked) {
        return override;
      }
      statOverrideBaselines.set(cacheKey, gameValue);
      clearStatMultiplierOverride(statKey, slot);
      return null;
    }
    return override;
  }
  function ensureStorageLockPatch() {
    if (storageLockPatched || typeof localStorage === "undefined") return;
    storageLockPatched = true;
    try {
      originalSetItem = localStorage.setItem.bind(localStorage);
      originalRemoveItem = localStorage.removeItem.bind(localStorage);
      localStorage.setItem = (key, value) => {
        if (lockedStorageKeys.has(key)) return;
        return originalSetItem(key, value);
      };
      localStorage.removeItem = (key) => {
        if (lockedStorageKeys.has(key)) return;
        return originalRemoveItem(key);
      };
    } catch {
    }
  }
  function isStorageKeyLocked(key) {
    return key != null && lockedStorageKeys.has(key);
  }
  function lockStorageKey(key) {
    if (!key) return;
    ensureStorageLockPatch();
    lockedStorageKeys.add(key);
  }
  function unlockStorageKey(key) {
    if (!key) return;
    lockedStorageKeys.delete(key);
  }
  function toggleStorageLock(key) {
    if (!key) return false;
    if (isStorageKeyLocked(key)) {
      unlockStorageKey(key);
      return false;
    }
    lockStorageKey(key);
    return true;
  }
  function createLockToggle(storageKey, { onToggle } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "debug-lock-button";
    const refresh = () => {
      const locked = isStorageKeyLocked(storageKey);
      button.textContent = locked ? "L" : "UL";
      button.classList.toggle("locked", locked);
    };
    button.addEventListener("click", () => {
      toggleStorageLock(storageKey);
      if (typeof onToggle === "function") {
        try {
          onToggle(isStorageKeyLocked(storageKey));
        } catch {
        }
      }
      refresh();
    });
    refresh();
    return { button, refresh };
  }
  function collapseAllDebugCategories() {
    const panel = document.getElementById(DEBUG_PANEL_ID);
    if (!panel) return;
    panel.querySelectorAll(".debug-panel-section-toggle").forEach((toggle) => {
      toggle.classList.remove("expanded");
      const content = toggle.nextElementSibling;
      if (content) content.classList.remove("active");
    });
    panel.querySelectorAll(".debug-panel-subsection-toggle").forEach((toggle) => {
      toggle.classList.remove("expanded");
      const content = toggle.nextElementSibling;
      if (content) content.classList.remove("active");
    });
  }
  function formatBigNumForInput(value) {
    try {
      const bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
      if (bn.isInfinite?.()) {
        const precision2 = Number.parseInt(bn?.p, 10) || BigNum.DEFAULT_PRECISION;
        return `BN:${precision2}:1:${BigNum.MAX_E}`;
      }
      const storage = bn.toStorage?.();
      const [, pStr = `${BigNum.DEFAULT_PRECISION}`, sigPart = "0", expPart = "0"] = (storage || "").split(":");
      const precision = Number.parseInt(pStr, 10) || BigNum.DEFAULT_PRECISION;
      if (bn.isZero?.()) {
        return `BN:${precision}:${"0".repeat(precision)}:-17`;
      }
      const paddedSig = sigPart.padStart(precision, "0");
      return `BN:${precision}:${paddedSig}:${expPart}`;
    } catch {
      return String(value ?? "");
    }
  }
  function parseBigNumInput(raw) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) return BigNum.fromInt(0);
    try {
      if (/^inf(?:inity)?$/i.test(trimmed)) {
        return BigNum.fromAny("Infinity");
      }
      return BigNum.fromAny(trimmed);
    } catch {
      return null;
    }
  }
  function setInputValidity(input, valid) {
    input.classList.toggle("debug-invalid", !valid);
  }
  function flagDebugUsage() {
    const slot = getActiveSlot();
    try {
      markSaveSlotModified(slot);
    } catch {
    }
    try {
      window.dispatchEvent(new CustomEvent("debug:change", { detail: { slot } }));
    } catch {
    }
  }
  function getActionLogKey(slot = getActiveSlot()) {
    if (slot == null) return null;
    return `${ACTION_LOG_STORAGE_PREFIX}:${slot}`;
  }
  function getCurrentActionLog(slot = getActiveSlot()) {
    const key = getActionLogKey(slot);
    if (!key) return [];
    let raw = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
    }
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function persistActionLog(entries, slot = getActiveSlot()) {
    const key = getActionLogKey(slot);
    if (!key || typeof localStorage === "undefined") return;
    const trimmed = (Array.isArray(entries) ? entries : []).slice(0, MAX_ACTION_LOG_ENTRIES);
    try {
      localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {
    }
  }
  function appendActionLogEntry(entry, slot = getActiveSlot()) {
    const log = getCurrentActionLog(slot);
    log.unshift(entry);
    if (log.length > MAX_ACTION_LOG_ENTRIES) {
      log.length = MAX_ACTION_LOG_ENTRIES;
    }
    persistActionLog(log, slot);
    return log;
  }
  function logAction(message) {
    const slot = getActiveSlot();
    if (slot == null) return;
    const now = /* @__PURE__ */ new Date();
    const entry = {
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      message,
      timestamp: now.getTime()
    };
    appendActionLogEntry(entry, slot);
    updateActionLogDisplay();
  }
  function updateActionLogDisplay() {
    if (!actionLogContainer) return;
    const actionLog = getCurrentActionLog();
    if (actionLog.length === 0) {
      actionLogContainer.innerHTML = "";
      const msg = document.createElement("div");
      msg.className = "action-log-empty";
      msg.textContent = "Actions you perform in the Debug Panel will be logged permanently in this action log.";
      actionLogContainer.appendChild(msg);
      return;
    }
    actionLogContainer.innerHTML = actionLog.map((entry) => {
      let formattedMessage = entry.message?.replace?.(/\[GOLD\](.*?)\[\/GOLD\]/g, '<span class="action-log-gold">$1</span>') ?? "";
      formattedMessage = formattedMessage.replace(/\b(?:Level|Lv)\s?(\d+)\b/g, '<span class="action-log-level">Lv$1</span>');
      formattedMessage = formattedMessage.replace(/(\d[\d,.]*(?:e[+-]?\d+)*(?:[KMBTQa-zA-Z]*))/g, (match) => /\d/.test(match) ? `<span class="action-log-number">${match}</span>` : match);
      formattedMessage = formattedMessage.replace(/<span[^>]*class="[^"]*infinity-symbol[^"]*"[^>]*>∞<\/span>/g, '<span class="action-log-number">inf</span>');
      formattedMessage = formattedMessage.replace(/∞/g, '<span class="action-log-number">inf</span>');
      return `
            <div class="action-log-entry">
                <span class="action-log-time">${entry.time}:</span>
                <span class="action-log-message">${formattedMessage}</span>
            </div>
        `;
    }).join("");
  }
  function dialogueStateStorageKey(slot = getActiveSlot()) {
    if (slot == null) return null;
    return `${MERCHANT_DLG_STATE_KEY_BASE}:${slot}`;
  }
  function persistDialogueState(state, slot = getActiveSlot()) {
    const key = dialogueStateStorageKey(slot);
    if (!key) return;
    try {
      const payload = JSON.stringify(state || {});
      localStorage.setItem(key, payload);
    } catch {
    }
  }
  function loadDialogueState(slot = getActiveSlot()) {
    const key = dialogueStateStorageKey(slot);
    if (!key) return {};
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function grantDialogueReward(reward) {
    if (!reward) return;
    if (reward.type === "coins") {
      try {
        bank.coins.add(reward.amount);
      } catch (e) {
        console.warn("Failed to grant coin reward:", reward, e);
      }
      return;
    }
    if (reward.type === "books") {
      try {
        bank.books.addWithMultiplier?.(reward.amount) ?? bank.books.add(reward.amount);
      } catch (e) {
        console.warn("Failed to grant book reward:", reward, e);
      }
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("merchantReward", { detail: reward }));
    } catch {
    }
  }
  function completeAllDialoguesForDebug() {
    const slot = getActiveSlot();
    if (slot == null) return { completed: 0 };
    const state = loadDialogueState(slot);
    let completed = 0;
    Object.entries(DLG_CATALOG).forEach(([id, meta]) => {
      const key = String(id);
      const prev = state[key] || {};
      const alreadyClaimed = !!prev.claimed;
      const next = Object.assign({}, prev, { status: "unlocked", claimed: true });
      state[key] = next;
      if (!alreadyClaimed) {
        completed += 1;
        grantDialogueReward(meta.reward);
      }
    });
    persistDialogueState(state, slot);
    return { completed };
  }
  function restoreAllDialoguesForDebug() {
    const slot = getActiveSlot();
    if (slot == null) return { restored: 0 };
    const state = loadDialogueState(slot);
    let restored = 0;
    Object.entries(DLG_CATALOG).forEach(([id]) => {
      const key = String(id);
      const prev = state[key] || {};
      if (prev.claimed) restored += 1;
      state[key] = Object.assign({}, prev, { claimed: false });
    });
    persistDialogueState(state, slot);
    return { restored };
  }
  function createInputRow(labelText, initialValue, onCommit, { idLabel, storageKey, onLockChange } = {}) {
    const row = document.createElement("div");
    row.className = "debug-panel-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    if (idLabel != null) {
      label.append(" ");
      const idSpan = document.createElement("span");
      idSpan.className = "debug-panel-id";
      idSpan.textContent = `(ID: ${idLabel})`;
      label.appendChild(idSpan);
    }
    row.appendChild(label);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "debug-panel-input";
    let editing = false;
    let pendingValue = null;
    let skipBlurCommit = false;
    const lockToggle = storageKey ? createLockToggle(storageKey, { onToggle: onLockChange }) : null;
    const setValue = (value) => {
      if (editing) {
        pendingValue = value;
        return;
      }
      pendingValue = null;
      input.value = formatBigNumForInput(value);
    };
    row.appendChild(input);
    if (lockToggle) {
      row.appendChild(lockToggle.button);
    }
    const commitValue = () => {
      const parsed = parseBigNumInput(input.value);
      if (!parsed) {
        setInputValidity(input, false);
        return;
      }
      setInputValidity(input, true);
      const wasLocked = storageKey && isStorageKeyLocked(storageKey);
      if (wasLocked) unlockStorageKey(storageKey);
      try {
        onCommit(parsed, { input, setValue });
      } finally {
        if (wasLocked) lockStorageKey(storageKey);
        if (lockToggle) lockToggle.refresh();
      }
    };
    input.addEventListener("focus", () => {
      editing = true;
    });
    input.addEventListener("change", commitValue);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        skipBlurCommit = true;
        commitValue();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      editing = false;
      if (!skipBlurCommit) {
        commitValue();
      }
      skipBlurCommit = false;
      if (pendingValue != null) {
        const next = pendingValue;
        pendingValue = null;
        setValue(next);
      }
    });
    setValue(initialValue);
    if (lockToggle) lockToggle.refresh();
    return { row, input, setValue, isEditing: () => editing };
  }
  function createUnlockToggleRow({ labelText, description, isUnlocked: isUnlocked2, onEnable, onDisable, slot }) {
    const row = document.createElement("div");
    row.className = "debug-panel-row debug-unlock-row";
    const toggle = document.createElement("label");
    toggle.className = "flag-toggle";
    toggle.setAttribute("aria-label", labelText);
    const input = document.createElement("input");
    input.type = "checkbox";
    const slider = document.createElement("span");
    slider.className = "flag-slider";
    toggle.appendChild(input);
    toggle.appendChild(slider);
    const textContainer = document.createElement("div");
    textContainer.className = "debug-unlock-text";
    const title = document.createElement("span");
    title.className = "debug-unlock-title";
    title.textContent = labelText;
    textContainer.appendChild(title);
    if (description) {
      const desc = document.createElement("span");
      desc.className = "debug-unlock-desc";
      desc.textContent = `- ${description}`;
      textContainer.appendChild(desc);
    }
    row.appendChild(toggle);
    row.appendChild(textContainer);
    const toggleRow = () => {
      input.checked = !input.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    row.addEventListener("click", (event) => {
      if (toggle.contains(event.target)) return;
      toggleRow();
    });
    let lastKnown = false;
    const refresh = () => {
      let unlocked = false;
      try {
        unlocked = typeof isUnlocked2 === "function" ? !!isUnlocked2() : false;
      } catch {
      }
      input.checked = unlocked;
      lastKnown = unlocked;
      return unlocked;
    };
    input.addEventListener("change", () => {
      const previous = lastKnown;
      const unlocked = input.checked;
      try {
        if (unlocked) {
          onEnable?.();
        } else {
          onDisable?.();
        }
      } catch {
      }
      flagDebugUsage();
      const refreshed = refresh();
      if (previous !== refreshed) {
        logAction(`Toggled ${labelText} [GOLD]${previous ? "True" : "False"}[/GOLD] \u2192 [GOLD]${refreshed ? "True" : "False"}[/GOLD]`);
      }
    });
    refresh();
    registerLiveBinding({ type: "unlock", slot, refresh });
    return row;
  }
  function formatCalculatorResult(value) {
    try {
      if (value instanceof BigNum || typeof value?.toScientific === "function") {
        return formatNumber(value);
      }
      const num = Number(value);
      if (Number.isFinite(num)) {
        return formatNumber(num);
      }
      return String(value ?? "\u2014");
    } catch {
      return "\u2014";
    }
  }
  function createCalculatorRow({ labelText, inputs = [], compute }) {
    const row = document.createElement("div");
    row.className = "debug-panel-row debug-calculator-row";
    const label = document.createElement("label");
    label.textContent = labelText;
    row.appendChild(label);
    const controls = document.createElement("div");
    controls.className = "debug-calculator-inputs";
    row.appendChild(controls);
    const output = document.createElement("div");
    output.className = "debug-calculator-output";
    output.textContent = "\u2014";
    row.appendChild(output);
    const fieldEls = [];
    const recompute = () => {
      const values = {};
      let hasError = false;
      fieldEls.forEach(({ config, el }) => {
        if (config.type === "select") {
          values[config.key] = el.value;
          return;
        }
        const parsed = parseBigNumInput(el.value);
        const valid = parsed instanceof BigNum;
        setInputValidity(el, valid);
        if (!valid) {
          hasError = true;
          return;
        }
        values[config.key] = parsed;
      });
      if (hasError || typeof compute !== "function") {
        output.textContent = "\u2014";
        return;
      }
      try {
        const result = compute(values);
        output.innerHTML = formatCalculatorResult(result);
      } catch {
        output.textContent = "\u2014";
      }
    };
    inputs.forEach((inputConfig) => {
      const config = Object.assign({ type: "text", defaultValue: "" }, inputConfig);
      if (!config.key) return;
      if (config.type === "select") {
        const select = document.createElement("select");
        select.className = "debug-panel-input";
        (config.options || []).forEach(({ value, label: optLabel }) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = optLabel ?? value;
          if (config.defaultValue != null && config.defaultValue === value) {
            option.selected = true;
          }
          select.appendChild(option);
        });
        select.addEventListener("change", recompute);
        controls.appendChild(select);
        fieldEls.push({ config, el: select });
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.className = "debug-panel-input";
        input.placeholder = config.label || "";
        input.value = config.defaultValue ?? "";
        input.addEventListener("input", recompute);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            recompute();
          }
        });
        controls.appendChild(input);
        fieldEls.push({ config, el: input });
      }
    });
    recompute();
    return row;
  }
  function applyXpState({ level, progress }) {
    const slot = getActiveSlot();
    if (slot == null) return;
    try {
      unlockXpSystem();
    } catch {
    }
    const unlockKey = XP_KEYS.unlock(slot);
    try {
      localStorage.setItem(unlockKey, "1");
    } catch {
    }
    primeStorageWatcherSnapshot(unlockKey, "1");
    if (level != null) {
      try {
        const raw = level.toStorage?.() ?? BigNum.fromAny(level).toStorage();
        const key = XP_KEYS.level(slot);
        localStorage.setItem(key, raw);
        primeStorageWatcherSnapshot(key, raw);
      } catch {
      }
    }
    if (progress != null) {
      try {
        const raw = progress.toStorage?.() ?? BigNum.fromAny(progress).toStorage();
        const key = XP_KEYS.progress(slot);
        localStorage.setItem(key, raw);
        primeStorageWatcherSnapshot(key, raw);
      } catch {
      }
    }
    try {
      initXpSystem({ forceReload: true });
    } catch {
    }
    try {
      broadcastXpChange({ changeType: "debug-panel", slot });
    } catch {
    }
    try {
      refreshLiveBindings();
    } catch {
    }
  }
  function applyMutationState({ level, progress }) {
    const slot = getActiveSlot();
    if (slot == null) return;
    try {
      const forgeUnlocked = typeof isForgeUnlocked === "function" ? isForgeUnlocked() : false;
      const forgeOverride = typeof getForgeDebugOverrideState === "function" ? getForgeDebugOverrideState() : null;
      if (!forgeUnlocked && forgeOverride !== true) {
        setForgeDebugOverride?.(true);
      }
    } catch {
    }
    try {
      if (typeof hasDoneForgeReset === "function" && !hasDoneForgeReset()) {
        setForgeResetCompleted?.(true);
      }
    } catch {
    }
    try {
      setMutationUnlockedForDebug(true);
    } catch {
    }
    try {
      updateResetPanel?.();
    } catch {
    }
    try {
      initMutationSystem();
    } catch {
    }
    try {
      unlockMutationSystem();
    } catch {
    }
    const unlockKey = MUTATION_KEYS.unlock(slot);
    try {
      localStorage.setItem(unlockKey, "1");
    } catch {
    }
    primeStorageWatcherSnapshot(unlockKey, "1");
    if (level != null) {
      try {
        const raw = level.toStorage?.() ?? BigNum.fromAny(level).toStorage();
        const key = MUTATION_KEYS.level(slot);
        localStorage.setItem(key, raw);
        primeStorageWatcherSnapshot(key, raw);
      } catch {
      }
    }
    if (progress != null) {
      try {
        const raw = progress.toStorage?.() ?? BigNum.fromAny(progress).toStorage();
        const key = MUTATION_KEYS.progress(slot);
        localStorage.setItem(key, raw);
        primeStorageWatcherSnapshot(key, raw);
      } catch {
      }
    }
    try {
      initMutationSystem({ forceReload: true });
    } catch {
    }
    try {
      broadcastMutationChange({ changeType: "debug-panel", slot });
    } catch {
    }
    try {
      refreshLiveBindings();
    } catch {
    }
  }
  function buildAreaCurrencies(container2, area) {
    const slot = getActiveSlot();
    if (slot == null) {
      const msg = document.createElement("div");
      msg.className = "debug-panel-empty";
      msg.textContent = "Select a save slot to edit currency values.";
      container2.appendChild(msg);
      return;
    }
    const areaLabel = area?.title ?? area?.key ?? "Unknown Area";
    area.currencies.forEach((currency) => {
      const storageKey = getCurrencyStorageKey(currency.key, slot);
      const current = getCurrencyValueForSlot(currency.key, slot);
      const currencyRow = createInputRow(currency.label, current, (value, { setValue }) => {
        const latestSlot = getActiveSlot();
        if (latestSlot == null) return;
        if (latestSlot !== slot) return;
        const { previous, next } = applyCurrencyState(currency.key, value, latestSlot);
        setValue(next);
        if (!bigNumEquals2(previous, next)) {
          flagDebugUsage();
          logAction(`Modified ${currency.label} (${areaLabel}) ${formatNumber(previous)} \u2192 ${formatNumber(next)}`);
        }
      }, {
        storageKey,
        onLockChange: () => currencyRow.setValue(getCurrencyValueForSlot(currency.key, getActiveSlot()))
      });
      registerLiveBinding({
        type: "currency",
        key: currency.key,
        slot,
        refresh: () => {
          if (slot !== getActiveSlot()) return;
          const latest = getCurrencyValueForSlot(currency.key, slot);
          currencyRow.setValue(latest);
        }
      });
      container2.appendChild(currencyRow.row);
    });
  }
  function buildAreaStats(container2, area) {
    const slot = getActiveSlot();
    if (slot == null) {
      const msg = document.createElement("div");
      msg.className = "debug-panel-empty";
      msg.textContent = "Select a save slot to edit stats.";
      container2.appendChild(msg);
      return;
    }
    const xp = getXpState();
    const mutation = getMutationState();
    const areaLabel = area?.title ?? area?.key ?? "Unknown Area";
    const xpLevelKey = XP_KEYS.level(slot);
    const xpLevelRow = createInputRow("XP Level", xp.xpLevel, (value, { setValue }) => {
      const prev = getXpState().xpLevel;
      applyXpState({ level: value });
      const latest = getXpState();
      setValue(latest.xpLevel);
      if (!bigNumEquals2(prev, latest.xpLevel)) {
        flagDebugUsage();
        logAction(`Modified XP Level (${areaLabel}) ${formatNumber(prev)} \u2192 ${formatNumber(latest.xpLevel)}`);
      }
    }, { storageKey: xpLevelKey });
    registerLiveBinding({
      type: "xp",
      slot,
      refresh: () => {
        if (slot !== getActiveSlot()) return;
        xpLevelRow.setValue(getXpState().xpLevel);
      }
    });
    container2.appendChild(xpLevelRow.row);
    const xpProgressKey = XP_KEYS.progress(slot);
    const xpProgressRow = createInputRow("XP Progress", xp.progress, (value, { setValue }) => {
      const prev = getXpState();
      const prevLevel = prev?.xpLevel?.clone?.() ?? prev?.xpLevel;
      const prevProgress = prev?.progress?.clone?.() ?? prev?.progress;
      applyXpState({ progress: value });
      const latest = getXpState();
      setValue(latest.progress);
      xpLevelRow.setValue(latest.xpLevel);
      if (!bigNumEquals2(prevProgress, latest.progress) || !bigNumEquals2(prevLevel, latest.xpLevel)) {
        flagDebugUsage();
        logAction(`Modified XP Progress (${areaLabel}) ${formatNumber(prevProgress)} \u2192 ${formatNumber(latest.progress)}`);
      }
    }, { storageKey: xpProgressKey });
    registerLiveBinding({
      type: "xp",
      slot,
      refresh: () => {
        if (slot !== getActiveSlot()) return;
        xpProgressRow.setValue(getXpState().progress);
      }
    });
    container2.appendChild(xpProgressRow.row);
    const mpLevelKey = MUTATION_KEYS.level(slot);
    const mpLevelRow = createInputRow("MP Level", mutation.level, (value, { setValue }) => {
      const prev = getMutationState().level;
      applyMutationState({ level: value });
      const latest = getMutationState();
      setValue(latest.level);
      if (!bigNumEquals2(prev, latest.level)) {
        flagDebugUsage();
        logAction(`Modified MP Level (${areaLabel}) ${formatNumber(prev)} \u2192 ${formatNumber(latest.level)}`);
      }
    }, { storageKey: mpLevelKey });
    registerLiveBinding({
      type: "mutation",
      slot,
      refresh: () => {
        if (slot !== getActiveSlot()) return;
        mpLevelRow.setValue(getMutationState().level);
      }
    });
    container2.appendChild(mpLevelRow.row);
    const mpProgressKey = MUTATION_KEYS.progress(slot);
    const mpProgressRow = createInputRow("MP Progress", mutation.progress, (value, { setValue }) => {
      const prev = getMutationState();
      const prevLevel = prev?.level?.clone?.() ?? prev?.level;
      const prevProgress = prev?.progress?.clone?.() ?? prev?.progress;
      applyMutationState({ progress: value });
      const latest = getMutationState();
      setValue(latest.progress);
      mpLevelRow.setValue(latest.level);
      if (!bigNumEquals2(prevProgress, latest.progress) || !bigNumEquals2(prevLevel, latest.level)) {
        flagDebugUsage();
        logAction(`Modified MP Progress (${areaLabel}) ${formatNumber(prevProgress)} \u2192 ${formatNumber(latest.progress)}`);
      }
    }, { storageKey: mpProgressKey });
    registerLiveBinding({
      type: "mutation",
      slot,
      refresh: () => {
        if (slot !== getActiveSlot()) return;
        mpProgressRow.setValue(getMutationState().progress);
      }
    });
    container2.appendChild(mpProgressRow.row);
  }
  function buildAreaUpgrades(container2, area) {
    const slot = getActiveSlot();
    if (slot == null) {
      const msg = document.createElement("div");
      msg.className = "debug-panel-empty";
      msg.textContent = "Select a save slot to edit upgrades.";
      container2.appendChild(msg);
      return;
    }
    const upgrades2 = getUpgradesForArea(area.key);
    if (!upgrades2 || upgrades2.length === 0) {
      const msg = document.createElement("div");
      msg.className = "debug-panel-empty";
      msg.textContent = "No upgrades found for this area yet.";
      container2.appendChild(msg);
      return;
    }
    const areaLabel = area?.title ?? area?.key ?? "Unknown Area";
    upgrades2.forEach((upg) => {
      const idLabel = upg.id ?? upg.tie ?? upg.tieKey;
      const title = upg.title || `Upgrade ${idLabel ?? ""}`.trim();
      const current = getLevel(area.key, upg.id ?? upg.tie);
      const upgradeRow = createInputRow(title, current, (value, { setValue }) => {
        const latestSlot = getActiveSlot();
        if (latestSlot == null) return;
        const previous = getLevel(area.key, upg.id ?? upg.tie);
        try {
          setLevel(area.key, upg.id ?? upg.tie, value, false);
        } catch {
        }
        const refreshed = getLevel(area.key, upg.id ?? upg.tie);
        setValue(refreshed);
        if (!bigNumEquals2(previous, refreshed)) {
          flagDebugUsage();
          logAction(`Modified ${title} (${areaLabel} - ID: ${idLabel ?? "Unknown"}) Lv${formatNumber(previous)} \u2192 Lv${formatNumber(refreshed)}`);
        }
      }, { idLabel });
      registerLiveBinding({
        type: "upgrade",
        slot,
        refresh: () => {
          if (slot !== getActiveSlot()) return;
          const refreshed = getLevel(area.key, upg.id ?? upg.tie);
          upgradeRow.setValue(refreshed);
        }
      });
      container2.appendChild(upgradeRow.row);
    });
  }
  function buildAreaCurrencyMultipliers(container2, area) {
    const slot = getActiveSlot();
    if (slot == null) {
      const msg = document.createElement("div");
      msg.className = "debug-panel-empty";
      msg.textContent = "Select a save slot to edit currency multipliers.";
      container2.appendChild(msg);
      return;
    }
    const areaLabel = area?.title ?? area?.key ?? "Unknown Area";
    area.currencies.forEach((currency) => {
      const handle = bank?.[currency.key]?.mult;
      const currentOverride = getDebugCurrencyMultiplierOverride(currency.key, slot);
      const current = currentOverride ?? handle?.get?.() ?? BigNum.fromInt(1);
      const storageKey = `${KEYS.MULTIPLIER[currency.key]}:${slot}`;
      const row = createInputRow(`${currency.label} Multiplier`, current, (value, { setValue }) => {
        const latestSlot = getActiveSlot();
        if (latestSlot == null) return;
        const previous = getDebugCurrencyMultiplierOverride(currency.key, latestSlot) ?? handle?.get?.() ?? BigNum.fromInt(1);
        try {
          setDebugCurrencyMultiplierOverride(currency.key, value, latestSlot);
        } catch {
        }
        applyAllCurrencyOverridesForActiveSlot();
        const refreshedOverride = getDebugCurrencyMultiplierOverride(currency.key, latestSlot);
        const refreshed = refreshedOverride ?? handle?.get?.() ?? BigNum.fromInt(1);
        setValue(refreshed);
        if (!bigNumEquals2(previous, refreshed)) {
          flagDebugUsage();
          logAction(`Modified ${currency.label} Multiplier (${areaLabel}) ${formatNumber(previous)} \u2192 ${formatNumber(refreshed)}`);
        }
      }, { storageKey });
      registerLiveBinding({
        type: "currency-mult",
        key: currency.key,
        slot,
        refresh: () => {
          if (slot !== getActiveSlot()) return;
          const latestOverride = getDebugCurrencyMultiplierOverride(currency.key, slot);
          const latest = latestOverride ?? handle?.get?.() ?? BigNum.fromInt(1);
          row.setValue(latest);
        }
      });
      container2.appendChild(row.row);
    });
  }
  function setAllCurrenciesToInfinity() {
    const slot = getActiveSlot();
    if (slot == null) return 0;
    const inf = BigNum.fromAny("Infinity");
    let updated = 0;
    Object.values(CURRENCIES).forEach((key) => {
      const handle = bank?.[key];
      if (!handle) return;
      try {
        const current = handle.value ?? handle.get?.();
        const isAlreadyInf = current?.isInfinite?.() || bigNumEquals2(current, inf);
        if (isAlreadyInf) return;
        handle.set(inf);
        updated += 1;
      } catch {
      }
    });
    return updated;
  }
  function setAllCurrenciesToZero() {
    const slot = getActiveSlot();
    if (slot == null) return 0;
    const zero = BigNum.fromInt(0);
    let updated = 0;
    Object.values(CURRENCIES).forEach((key) => {
      const handle = bank?.[key];
      if (!handle) return;
      try {
        handle.set?.(zero);
        updated += 1;
      } catch {
      }
    });
    return updated;
  }
  function setAllStatsToInfinity() {
    const slot = getActiveSlot();
    if (slot == null) return 0;
    const inf = BigNum.fromAny("Infinity");
    let touched = 0;
    let xpState2;
    let mutationState2;
    try {
      xpState2 = getXpState();
    } catch {
    }
    try {
      mutationState2 = getMutationState();
    } catch {
    }
    try {
      if (xpState2?.unlocked) {
        const levelInf = xpState2?.xpLevel?.isInfinite?.() || bigNumEquals2(xpState2?.xpLevel, inf);
        const progInf = xpState2?.progress?.isInfinite?.() || bigNumEquals2(xpState2?.progress, inf);
        if (!levelInf || !progInf) {
          applyXpState({ level: inf, progress: inf });
          touched += 1;
        }
      }
    } catch {
    }
    try {
      if (mutationState2?.unlocked) {
        const levelInf = mutationState2?.level?.isInfinite?.() || bigNumEquals2(mutationState2?.level, inf);
        const progInf = mutationState2?.progress?.isInfinite?.() || bigNumEquals2(mutationState2?.progress, inf);
        if (!levelInf || !progInf) {
          applyMutationState({ level: inf, progress: inf });
          touched += 1;
        }
      }
    } catch {
    }
    const isStatUnlocked = (statKey) => {
      if (statKey === "xp") return !!xpState2?.unlocked;
      if (statKey === "mutation") return !!mutationState2?.unlocked;
      return true;
    };
    STAT_MULTIPLIERS.forEach(({ key }) => {
      try {
        if (!isStatUnlocked(key)) return;
        const current = getStatMultiplierDisplayValue(key, slot);
        const isAlreadyInf = current?.isInfinite?.() || bigNumEquals2(current, inf);
        if (isAlreadyInf) return;
        setDebugStatMultiplierOverride(key, inf, slot);
        touched += 1;
      } catch {
      }
    });
    return touched;
  }
  function setAllStatsToZero() {
    const slot = getActiveSlot();
    if (slot == null) return 0;
    const zero = BigNum.fromInt(0);
    let touched = 0;
    let xpState2;
    let mutationState2;
    try {
      xpState2 = getXpState();
    } catch {
    }
    try {
      mutationState2 = getMutationState();
    } catch {
    }
    try {
      if (xpState2?.unlocked) {
        applyXpState({ level: zero, progress: zero });
        touched += 1;
      }
    } catch {
    }
    try {
      if (mutationState2?.unlocked) {
        applyMutationState({ level: zero, progress: zero });
        touched += 1;
      }
    } catch {
    }
    const isStatUnlocked = (statKey) => {
      if (statKey === "xp") return !!xpState2?.unlocked;
      if (statKey === "mutation") return !!mutationState2?.unlocked;
      return true;
    };
    STAT_MULTIPLIERS.forEach(({ key }) => {
      try {
        if (!isStatUnlocked(key)) return;
        setDebugStatMultiplierOverride(key, zero, slot);
        touched += 1;
      } catch {
      }
    });
    return touched;
  }
  function getUnlockRowDefinitions(slot) {
    return [
      {
        labelText: "Unlock XP",
        description: "If true, unlocks the XP system",
        isUnlocked: () => {
          try {
            return !!getXpState()?.unlocked;
          } catch {
            return false;
          }
        },
        onEnable: () => {
          try {
            unlockXpSystem();
          } catch {
          }
          try {
            initXpSystem({ forceReload: true });
          } catch {
          }
        },
        onDisable: () => {
          try {
            resetXpProgress({ keepUnlock: false });
          } catch {
          }
          try {
            setForgeDebugOverride(false);
          } catch {
          }
          try {
            updateResetPanel();
          } catch {
          }
        },
        slot
      },
      {
        labelText: "Unlock MP",
        description: "If true, unlocks the MP system",
        isUnlocked: () => {
          try {
            const override = getForgeDebugOverrideState();
            if (override != null) return override;
          } catch {
          }
          try {
            return !!isForgeUnlocked();
          } catch {
            return false;
          }
          return false;
        },
        onEnable: () => {
          try {
            setForgeDebugOverride(true);
          } catch {
          }
          try {
            updateResetPanel();
          } catch {
          }
        },
        onDisable: () => {
          try {
            setForgeDebugOverride(false);
          } catch {
          }
          try {
            updateResetPanel();
          } catch {
          }
        }
      },
      {
        labelText: "Unlock MP",
        description: "If true, unlocks the MP system",
        isUnlocked: () => {
          try {
            return hasDoneForgeReset();
          } catch {
            return false;
          }
        },
        onEnable: () => {
          try {
            setForgeResetCompleted(true);
          } catch {
          }
          try {
            setMutationUnlockedForDebug(true);
          } catch {
          }
          try {
            updateResetPanel();
          } catch {
          }
        },
        onDisable: () => {
          try {
            setForgeResetCompleted(false);
          } catch {
          }
          try {
            setMutationUnlockedForDebug(false);
          } catch {
          }
          try {
            updateResetPanel();
          } catch {
          }
        },
        slot
      },
      {
        labelText: "Unlock Shop",
        description: "If true, makes the Shop button visible",
        isUnlocked: () => {
          try {
            return isShopUnlocked();
          } catch {
            return false;
          }
        },
        onEnable: () => {
          try {
            unlockShop();
          } catch {
          }
        },
        onDisable: () => {
          try {
            lockShop();
          } catch {
          }
        },
        slot
      },
      {
        labelText: "Unlock Map",
        description: "If true, makes the Map button visible",
        isUnlocked: () => {
          try {
            return isMapUnlocked();
          } catch {
            return false;
          }
        },
        onEnable: () => {
          try {
            unlockMap();
          } catch {
          }
        },
        onDisable: () => {
          try {
            lockMap();
          } catch {
          }
        },
        slot
      }
    ];
  }
  function setAllUnlockToggles(targetState) {
    const slot = getActiveSlot();
    if (slot == null) return 0;
    let toggled = 0;
    getUnlockRowDefinitions(slot).forEach((rowDef) => {
      let unlocked = false;
      try {
        unlocked = typeof rowDef.isUnlocked === "function" ? !!rowDef.isUnlocked() : false;
      } catch {
      }
      if (unlocked === targetState) return;
      try {
        if (targetState) {
          rowDef.onEnable?.();
        } else {
          rowDef.onDisable?.();
        }
        toggled += 1;
      } catch {
      }
    });
    try {
      refreshLiveBindings();
    } catch {
    }
    return toggled;
  }
  function unlockAllUnlockUpgrades() {
    const slot = getActiveSlot();
    if (slot == null) return { unlocks: 0, toggles: 0 };
    let unlocked = 0;
    getAreas().forEach((area) => {
      getUpgradesForArea(area.key).forEach((upg) => {
        if (!upg?.unlockUpgrade) return;
        try {
          markUpgradePermanentlyUnlocked(area.key, upg, slot);
          unlocked += 1;
        } catch {
        }
      });
    });
    try {
      unlockShop();
    } catch {
    }
    try {
      unlockMap();
    } catch {
    }
    const toggled = setAllUnlockToggles(true);
    return { unlocks: unlocked, toggles: toggled };
  }
  function lockAllUnlockUpgrades() {
    const slot = getActiveSlot();
    if (slot == null) return { locks: 0, toggles: 0 };
    let locked = 0;
    getAreas().forEach((area) => {
      getUpgradesForArea(area.key).forEach((upg) => {
        if (!upg?.unlockUpgrade) return;
        try {
          clearPermanentUpgradeUnlock(area.key, upg, slot);
          locked += 1;
        } catch {
        }
      });
    });
    try {
      lockShop();
    } catch {
    }
    try {
      lockMap();
    } catch {
    }
    const toggled = setAllUnlockToggles(false);
    return { locks: locked, toggles: toggled };
  }
  function resetCurrencyAndMultiplier(currencyKey) {
    try {
      bank?.[currencyKey]?.set?.(BigNum.fromInt(0));
    } catch {
    }
    try {
      clearCurrencyMultiplierOverride(currencyKey);
    } catch {
    }
    try {
      setCurrencyMultiplierBN(currencyKey, BigNum.fromInt(1));
    } catch {
    }
  }
  function resetStatsAndMultipliers(target) {
    if (target === "all") {
      Object.values(CURRENCIES).forEach((key) => resetCurrencyAndMultiplier(key));
      const zero2 = BigNum.fromInt(0);
      applyXpState({ level: zero2, progress: zero2 });
      applyMutationState({ level: zero2, progress: zero2 });
      STAT_MULTIPLIERS.forEach(({ key }) => {
        try {
          setDebugStatMultiplierOverride(key, BigNum.fromInt(1));
        } catch {
        }
      });
      const totalCount = Object.values(CURRENCIES).length + STAT_MULTIPLIERS.length + 2;
      return { label: "[GOLD]all[/GOLD] currency/stats", count: totalCount };
    }
    if (target === "allCurrencies") {
      let currencyCount = 0;
      Object.values(CURRENCIES).forEach((key) => {
        resetCurrencyAndMultiplier(key);
        currencyCount += 1;
      });
      const label = currencyCount === 1 ? "1 currency" : `${currencyCount} currencies`;
      return { label, count: currencyCount };
    }
    if (target === "allUnlockedStats") {
      const zero2 = BigNum.fromInt(0);
      let resetCount = 0;
      try {
        if (getXpState()?.unlocked) {
          applyXpState({ level: zero2, progress: zero2 });
          try {
            setDebugStatMultiplierOverride("xp", BigNum.fromInt(1));
          } catch {
          }
          resetCount += 1;
        }
      } catch {
      }
      try {
        if (getMutationState()?.unlocked) {
          applyMutationState({ level: zero2, progress: zero2 });
          try {
            setDebugStatMultiplierOverride("mutation", BigNum.fromInt(1));
          } catch {
          }
          resetCount += 1;
        }
      } catch {
      }
      const label = resetCount === 1 ? "1 unlocked stat" : `${resetCount} unlocked stats`;
      return { label, count: resetCount };
    }
    if (target === "allUnlocked") {
      let currencyCount = 0;
      Object.values(CURRENCIES).forEach((key) => {
        resetCurrencyAndMultiplier(key);
        currencyCount += 1;
      });
      const zero2 = BigNum.fromInt(0);
      let resetCount = 0;
      try {
        if (getXpState()?.unlocked) {
          applyXpState({ level: zero2, progress: zero2 });
          try {
            setDebugStatMultiplierOverride("xp", BigNum.fromInt(1));
          } catch {
          }
          resetCount += 1;
        }
      } catch {
      }
      try {
        if (getMutationState()?.unlocked) {
          applyMutationState({ level: zero2, progress: zero2 });
          try {
            setDebugStatMultiplierOverride("mutation", BigNum.fromInt(1));
          } catch {
          }
          resetCount += 1;
        }
      } catch {
      }
      const parts = [];
      if (resetCount === 1) parts.push("1 unlocked stat");
      else parts.push(`${resetCount} unlocked stats`);
      parts.push(currencyCount === 1 ? "1 currency" : `${currencyCount} currencies`);
      return { label: parts.join(" and "), count: resetCount + currencyCount };
    }
    if (target.startsWith("currency:")) {
      const currencyKey = target.slice("currency:".length);
      resetCurrencyAndMultiplier(currencyKey);
      return { label: `${currencyKey}`, count: 1 };
    }
    if (target.startsWith("statmult:")) {
      const statKey2 = target.slice("statmult:".length);
      try {
        clearStatMultiplierOverride(statKey2);
      } catch {
      }
      return { label: `${statKey2} multiplier`, count: 1 };
    }
    if (!target.startsWith("stat:")) {
      return { label: `unknown target ${target}`, count: 0 };
    }
    const statKey = target.slice("stat:".length);
    const zero = BigNum.fromInt(0);
    if (statKey === "xp" || statKey === "xpLevel" || statKey === "xpProgress") {
      applyXpState({ level: zero, progress: zero });
      try {
        setDebugStatMultiplierOverride("xp", BigNum.fromInt(1));
      } catch {
      }
      return { label: "XP", count: 1 };
    }
    if (statKey === "mutation" || statKey === "mp" || statKey === "mpLevel" || statKey === "mpProgress") {
      applyMutationState({ level: zero, progress: zero });
      try {
        setDebugStatMultiplierOverride("mutation", BigNum.fromInt(1));
      } catch {
      }
      return "MP";
    }
    try {
      setDebugStatMultiplierOverride(statKey, BigNum.fromInt(1));
    } catch {
    }
    return `stat ${statKey}`;
  }
  function buildAreaStatMultipliers(container2, area) {
    const slot = getActiveSlot();
    if (slot == null) {
      const msg = document.createElement("div");
      msg.className = "debug-panel-empty";
      msg.textContent = "Select a save slot to edit stat multipliers.";
      container2.appendChild(msg);
      return;
    }
    const areaLabel = area?.title ?? area?.key ?? "Unknown Area";
    STAT_MULTIPLIERS.forEach((stat) => {
      const storageKey = getStatMultiplierStorageKey(stat.key, slot);
      const row = createInputRow(
        `${stat.label} Multiplier`,
        getStatMultiplierDisplayValue(stat.key, slot),
        (value, { setValue }) => {
          const latestSlot = getActiveSlot();
          if (latestSlot == null) return;
          const previous = getStatMultiplierDisplayValue(stat.key, latestSlot);
          try {
            setDebugStatMultiplierOverride(stat.key, value, latestSlot);
          } catch {
          }
          const refreshed = getStatMultiplierDisplayValue(stat.key, latestSlot);
          setValue(refreshed);
          if (!bigNumEquals2(previous, refreshed)) {
            flagDebugUsage();
            logAction(
              `Modified ${stat.label} Multiplier (${areaLabel}) ${formatNumber(previous)} \u2192 ${formatNumber(refreshed)}`
            );
          }
        },
        {
          storageKey,
          onLockChange: (locked) => {
            const latestSlot = getActiveSlot();
            if (latestSlot == null) return;
            if (locked) {
              const existingOverride = getLockedStatOverride(latestSlot, stat.key);
              if (existingOverride) return;
              try {
                setDebugStatMultiplierOverride(
                  stat.key,
                  getGameStatMultiplier(stat.key),
                  latestSlot
                );
              } catch {
              }
            } else {
              getEffectiveStatMultiplierOverride(
                stat.key,
                latestSlot,
                getGameStatMultiplier(stat.key)
              );
            }
            row.setValue(getStatMultiplierDisplayValue(stat.key, latestSlot));
          }
        }
      );
      registerLiveBinding({
        type: "stat-mult",
        key: stat.key,
        slot,
        refresh: () => {
          if (slot !== getActiveSlot()) return;
          const latest = getStatMultiplierDisplayValue(stat.key, slot);
          row.setValue(latest);
        }
      });
      registerLiveBinding({
        type: "upgrade",
        key: stat.key,
        slot,
        refresh: () => {
          if (slot !== getActiveSlot()) return;
          const latest = getStatMultiplierDisplayValue(stat.key, slot);
          row.setValue(latest);
        }
      });
      if (stat.key === "mutation") {
        registerLiveBinding({
          type: "mutation",
          key: stat.key,
          slot,
          refresh: () => {
            if (slot !== getActiveSlot()) return;
            const latest = getStatMultiplierDisplayValue(stat.key, slot);
            row.setValue(latest);
          }
        });
      }
      container2.appendChild(row.row);
    });
  }
  function buildAreaCalculators(container2) {
    const calculators = [
      {
        title: "Currencies",
        rows: [
          {
            label: "Pending Gold (Forge)",
            inputs: [
              { key: "coins", label: "Coins" },
              { key: "xpLevel", label: "XP Level" }
            ],
            compute: ({ coins, xpLevel }) => computeForgeGoldFromInputs(coins, xpLevel)
          }
        ]
      },
      {
        title: "Stats",
        rows: [
          {
            label: "XP Requirement",
            inputs: [
              { key: "xpLevel", label: "XP Level" }
            ],
            compute: ({ xpLevel }) => getXpRequirementForXpLevel(xpLevel)
          },
          {
            label: "XP Level Coin Multiplier",
            inputs: [
              { key: "xpLevel", label: "XP Level" }
            ],
            compute: ({ xpLevel }) => computeCoinMultiplierForXpLevel(xpLevel)
          },
          {
            label: "MP Requirement",
            inputs: [
              { key: "mpLevel", label: "MP Level" }
            ],
            compute: ({ mpLevel }) => computeMutationRequirementForLevel(mpLevel)
          },
          {
            label: "MP Level Coin/XP Multiplier",
            inputs: [
              { key: "mpLevel", label: "MP Level" }
            ],
            compute: ({ mpLevel }) => computeMutationMultiplierForLevel(mpLevel)
          }
        ]
      },
      {
        title: "Other",
        rows: [
          {
            label: "Default Upgrade Level Cost",
            inputs: [
              { key: "baseCost", label: "Base Cost" },
              { key: "level", label: "Current Upgrade Level" },
              {
                key: "mode",
                type: "select",
                defaultValue: "NM",
                options: [
                  { value: "NM", label: "No Milestones" },
                  { value: "HM", label: "Has Milestones" }
                ]
              }
            ],
            compute: ({ baseCost, level, mode }) => computeDefaultUpgradeCost(baseCost, level, mode)
          }
        ]
      }
    ];
    calculators.forEach((group) => {
      const subsection = createSubsection(group.title, (sub) => {
        if (!group.rows || group.rows.length === 0) {
          const msg = document.createElement("div");
          msg.className = "debug-panel-empty";
          msg.textContent = "No calculators available yet.";
          sub.appendChild(msg);
          return;
        }
        group.rows.forEach((row) => {
          const calculatorRow = createCalculatorRow({
            labelText: row.label,
            inputs: row.inputs,
            compute: row.compute
          });
          sub.appendChild(calculatorRow);
        });
      });
      container2.appendChild(subsection);
    });
  }
  function buildAreasContent(content) {
    content.innerHTML = "";
    const slot = getActiveSlot();
    if (slot == null) {
      const placeholder = document.createElement("div");
      placeholder.className = "debug-panel-empty";
      placeholder.textContent = "Areas are available once a save slot is selected.";
      content.appendChild(placeholder);
      return;
    }
    applyAllCurrencyOverridesForActiveSlot();
    const areas = getAreas();
    areas.forEach((area) => {
      const areaContainer = createSubsection(area.title, (areaContent) => {
        const currencies = createSubsection("Currencies", (sub) => {
          buildAreaCurrencies(sub, area);
        });
        const stats = createSubsection("Stats", (sub) => {
          buildAreaStats(sub, area);
        });
        const multipliers = createSubsection("Multipliers", (sub) => {
          const currencyMultipliers = createSubsection("Currencies", (subsection) => {
            buildAreaCurrencyMultipliers(subsection, area);
          });
          const statMultipliers = createSubsection("Stats", (subsection) => {
            buildAreaStatMultipliers(subsection, area);
          });
          sub.appendChild(currencyMultipliers);
          sub.appendChild(statMultipliers);
        });
        const upgrades2 = createSubsection("Upgrades", (sub) => {
          buildAreaUpgrades(sub, area);
        });
        const calculators = createSubsection("Calculators", (sub) => {
          buildAreaCalculators(sub);
        });
        areaContent.appendChild(currencies);
        areaContent.appendChild(stats);
        areaContent.appendChild(multipliers);
        areaContent.appendChild(upgrades2);
        areaContent.appendChild(calculators);
      });
      areaContainer.classList.add("debug-panel-area");
      content.appendChild(areaContainer);
    });
  }
  function buildMiscContent(content) {
    content.innerHTML = "";
    const slot = getActiveSlot();
    if (slot == null) {
      const placeholder = document.createElement("div");
      placeholder.className = "debug-panel-empty";
      placeholder.textContent = "Miscellaneous tools are available once a save slot is selected.";
      content.appendChild(placeholder);
      return;
    }
    const buttons = [
      {
        label: "Complete Dialogues",
        onClick: () => {
          const { completed } = completeAllDialoguesForDebug();
          flagDebugUsage();
          logAction(`Completed all dialogues (${completed} newly claimed).`);
        }
      },
      {
        label: "Restore Dialogues",
        onClick: () => {
          const { restored } = restoreAllDialoguesForDebug();
          flagDebugUsage();
          const entryLabel = restored === 1 ? "entry" : "entries";
          logAction(`Restored dialogues to unclaimed state (${restored} ${entryLabel} reset).`);
        }
      },
      {
        label: "All Currencies Inf",
        onClick: () => {
          const touched = setAllCurrenciesToInfinity();
          flagDebugUsage();
          logAction(`Set all currencies to Infinity (${touched} ${touched === 1 ? "currency" : "currencies"} updated).`);
        }
      },
      {
        label: "All Stats Inf",
        onClick: () => {
          const touched = setAllStatsToInfinity();
          flagDebugUsage();
          logAction(`Set all stats to Infinity (${touched} ${touched === 1 ? "stat" : "stats"} updated).`);
        }
      },
      {
        label: "All Currencies 0",
        onClick: () => {
          const touched = setAllCurrenciesToZero();
          flagDebugUsage();
          logAction(`Set all currencies to 0 (${touched} ${touched === 1 ? "currency" : "currencies"} updated).`);
        }
      },
      {
        label: "All Stats 0",
        onClick: () => {
          const touched = setAllStatsToZero();
          flagDebugUsage();
          logAction(`Set all unlocked stats to 0 (${touched} ${touched === 1 ? "stat" : "stats"} updated).`);
        }
      },
      {
        label: "Unlock All Unlocks",
        onClick: () => {
          const { unlocks, toggles } = unlockAllUnlockUpgrades();
          flagDebugUsage();
          logAction(`Unlocked all unlock-type upgrades (${unlocks} entries) and unlock flags (${toggles} toggled).`);
        }
      },
      {
        label: "Lock All Unlocks",
        onClick: () => {
          const { locks, toggles } = lockAllUnlockUpgrades();
          flagDebugUsage();
          logAction(`Locked all unlock-type upgrades (${locks} entries) and unlock flags (${toggles} toggled).`);
        }
      },
      {
        label: "Wipe Action Log",
        onClick: () => {
          persistActionLog([], slot);
          updateActionLogDisplay();
          flagDebugUsage();
          logAction("Action log wiped and reset.");
        }
      }
    ];
    const buttonGrid = document.createElement("div");
    buttonGrid.className = "debug-misc-button-list";
    buttons.forEach((cfg) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "debug-panel-toggle debug-misc-button";
      btn.textContent = cfg.label;
      btn.addEventListener("click", cfg.onClick);
      buttonGrid.appendChild(btn);
    });
    content.appendChild(buttonGrid);
    const resetRow = document.createElement("div");
    resetRow.className = "debug-panel-row";
    const resetLabel = document.createElement("label");
    resetLabel.textContent = "Reset Values & Multis For";
    resetRow.appendChild(resetLabel);
    const resetSelect = document.createElement("select");
    resetSelect.className = "debug-panel-input";
    getAreas().forEach((area) => {
      const group = document.createElement("optgroup");
      group.label = area.title || area.key;
      area.currencies.forEach((currency) => {
        const opt = document.createElement("option");
        opt.value = `currency:${currency.key}`;
        opt.textContent = `${area.title || area.key} \u2192 ${currency.label}`;
        group.appendChild(opt);
      });
      area.stats.forEach((stat) => {
        const opt = document.createElement("option");
        opt.value = `stat:${stat.key}`;
        opt.textContent = `${area.title || area.key} \u2192 ${stat.label}`;
        group.appendChild(opt);
      });
      resetSelect.appendChild(group);
    });
    const allCurrenciesOption = document.createElement("option");
    allCurrenciesOption.value = "allCurrencies";
    allCurrenciesOption.textContent = "All Currencies";
    resetSelect.appendChild(allCurrenciesOption);
    const allUnlockedStatsOption = document.createElement("option");
    allUnlockedStatsOption.value = "allUnlockedStats";
    allUnlockedStatsOption.textContent = "All Unlocked Stats";
    resetSelect.appendChild(allUnlockedStatsOption);
    const allUnlockedOption = document.createElement("option");
    allUnlockedOption.value = "allUnlocked";
    allUnlockedOption.textContent = "All Unlocked Stats & Currs";
    resetSelect.appendChild(allUnlockedOption);
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All";
    resetSelect.appendChild(allOption);
    resetRow.appendChild(resetSelect);
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "debug-panel-toggle";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", () => {
      const target = resetSelect.value || "all";
      const { label, count } = resetStatsAndMultipliers(target) ?? { label: target, count: 0 };
      const nounPhrase = count === 1 ? "value and multiplier" : "values and multipliers";
      flagDebugUsage();
      logAction(`Reset ${nounPhrase} for ${label} to defaults.`);
    });
    resetRow.appendChild(resetBtn);
    content.appendChild(resetRow);
    const actionLogRow = document.createElement("div");
    actionLogRow.className = "debug-panel-row";
    const wipeSlotBtn = document.createElement("button");
    wipeSlotBtn.type = "button";
    wipeSlotBtn.className = "debug-panel-toggle debug-danger-button";
    wipeSlotBtn.textContent = "Wipe Slot & Refresh";
    wipeSlotBtn.addEventListener("click", () => {
      const confirmWipe = window.confirm?.("Are you sure you want to wipe current slot data and refresh the page? This cannot be undone.");
      if (!confirmWipe) return;
      const suffix = `:${slot}`;
      const suffixPattern = new RegExp(`:${slot}(?::|$)`);
      const PASS_COUNT = 5;
      const PASS_DELAY_MS = 60;
      let totalKeysRemoved = 0;
      let blockedWrites = 0;
      const isSlotStorageKey = (key) => typeof key === "string" && suffixPattern.test(key);
      const stopSlotStorageWrites = () => {
        if (typeof localStorage === "undefined") return () => {
        };
        const previousSetter = typeof localStorage.setItem === "function" ? localStorage.setItem.bind(localStorage) : null;
        if (!previousSetter) return () => {
        };
        localStorage.setItem = (key, value) => {
          if (isSlotStorageKey(key)) {
            blockedWrites += 1;
            return;
          }
          return previousSetter(key, value);
        };
        return () => {
          try {
            localStorage.setItem = previousSetter;
          } catch {
          }
        };
      };
      const wipePass = () => {
        let removedThisPass = 0;
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (isSlotStorageKey(key)) {
              keysToRemove.push(key);
            }
          }
          keysToRemove.forEach((key) => localStorage.removeItem(key));
          removedThisPass = keysToRemove.length;
        } catch {
        }
        totalKeysRemoved += removedThisPass;
        return removedThisPass;
      };
      const showMenuAndHideGame = () => {
        const menuRoot = document.querySelector(".menu-root");
        if (menuRoot) {
          menuRoot.style.display = "";
          menuRoot.removeAttribute("aria-hidden");
        }
        const gameRoot = document.getElementById("game-root");
        if (gameRoot) gameRoot.hidden = true;
        try {
          window.dispatchEvent(new CustomEvent("menu:visibilitychange", { detail: { visible: true } }));
        } catch {
        }
      };
      const restoreStorageSetter = stopSlotStorageWrites();
      wipePass();
      showMenuAndHideGame();
      setTimeout(() => {
        wipePass();
        restoreStorageSetter?.();
        flagDebugUsage();
        logAction(
          `Wiped ${totalKeysRemoved} storage keys for slot ${slot} across 2 passes (blocked ${blockedWrites} writes), returned to menu, and refreshed.`
        );
        try {
          window.location.reload();
        } catch {
        }
      }, PASS_DELAY_MS);
    });
    actionLogRow.appendChild(wipeSlotBtn);
    actionLogRow.appendChild(wipeSlotBtn);
    content.appendChild(actionLogRow);
  }
  function buildUnlocksContent(content) {
    content.innerHTML = "";
    const slot = getActiveSlot();
    if (slot == null) {
      const placeholder = document.createElement("div");
      placeholder.className = "debug-panel-empty";
      placeholder.textContent = "Unlocks are available once a save slot is selected.";
      content.appendChild(placeholder);
      return;
    }
    try {
      initXpSystem();
    } catch {
    }
    const rows = getUnlockRowDefinitions(slot);
    rows.forEach((rowDef) => {
      content.appendChild(createUnlockToggleRow(rowDef));
    });
  }
  function buildDebugPanel() {
    if (!debugPanelAccess || isOnMenu()) return;
    cleanupDebugPanelResources();
    ensureDebugPanelStyles();
    sectionKeyCounter = 0;
    subsectionKeyCounter = 0;
    const existingPanel = document.getElementById(DEBUG_PANEL_ID);
    if (existingPanel) existingPanel.remove();
    const panel = document.createElement("div");
    panel.id = DEBUG_PANEL_ID;
    panel.className = "debug-panel";
    const header = document.createElement("div");
    header.className = "debug-panel-header";
    const titleContainer = document.createElement("div");
    const title = document.createElement("div");
    title.className = "debug-panel-title";
    title.textContent = "Debug Panel";
    const closeButtonContainer = document.createElement("div");
    closeButtonContainer.className = "debug-panel-close-buttons";
    const closeButton = document.createElement("button");
    closeButton.className = "debug-panel-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close Debug Panel");
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => closeDebugPanel({ preserveExpansionState: true }));
    const collapseCloseButton = document.createElement("button");
    collapseCloseButton.className = "debug-panel-close debug-panel-close-collapse";
    collapseCloseButton.type = "button";
    collapseCloseButton.setAttribute("aria-label", "Close Debug Panel and Collapse Sections");
    collapseCloseButton.textContent = "Close & Collapse";
    collapseCloseButton.addEventListener("click", () => closeDebugPanel());
    closeButtonContainer.appendChild(closeButton);
    closeButtonContainer.appendChild(collapseCloseButton);
    titleContainer.appendChild(title);
    const info = document.createElement("div");
    info.className = "debug-panel-info";
    const infoLines = [
      { text: "C: Close and preserve panels", hideOnMobile: true },
      { text: "Shift+C: Close and collapse panels", hideOnMobile: true },
      { text: "Input fields can take a normal, scientific, or BN number as input" },
      { text: 'Input value "inf" sets a value to infinity or an upgrade to its level cap' },
      { text: "Toggle UL/L (Unlocked/Locked) on a value to freeze it from accruing normally" }
    ];
    infoLines.forEach(({ text, hideOnMobile }) => {
      const infoLine = document.createElement("div");
      infoLine.className = "debug-panel-info-line";
      if (hideOnMobile) infoLine.classList.add("debug-panel-info-mobile-hidden");
      infoLine.textContent = text;
      info.appendChild(infoLine);
    });
    titleContainer.appendChild(info);
    header.appendChild(titleContainer);
    header.appendChild(closeButtonContainer);
    panel.appendChild(header);
    panel.appendChild(createSection("Areas: main currency/stat/upgrade management for each area", "debug-areas", (content) => {
      buildAreasContent(content);
    }));
    panel.appendChild(createSection("Unlocks: modify specific unlock flags", "debug-unlocks", (content) => {
      buildUnlocksContent(content);
    }));
    panel.appendChild(createSection("Action Log: keep track of everything you do", "debug-action-log", (content) => {
      const container2 = document.createElement("div");
      container2.id = "action-log-entries";
      container2.className = "debug-panel-action-log";
      container2.style.maxHeight = "240px";
      container2.style.overflowY = "auto";
      content.appendChild(container2);
      actionLogContainer = container2;
      updateActionLogDisplay();
      addDebugPanelCleanup(() => {
        actionLogContainer = null;
      });
    }));
    panel.appendChild(createSection("Miscellaneous: helpful miscellaneous functions", "debug-misc", (content) => {
      buildMiscContent(content);
    }));
    applyDebugPanelExpansionState(panel);
    document.body.appendChild(panel);
    if (debugPanelScrollTop > 0) {
      try {
        panel.scrollTop = debugPanelScrollTop;
      } catch {
      }
    }
    setupLiveBindingListeners();
    debugPanelOpen = true;
  }
  function openDebugPanel() {
    if (!debugPanelAccess || isOnMenu()) return;
    if (getActiveSlot() == null) {
      closeDebugPanel();
      return;
    }
    if (debugPanelOpen) return;
    buildDebugPanel();
  }
  function closeDebugPanel({ preserveExpansionState = false } = {}) {
    debugPanelExpansionState = preserveExpansionState ? captureDebugPanelExpansionState() : createEmptyExpansionState();
    const panel = document.getElementById(DEBUG_PANEL_ID);
    if (panel) {
      try {
        debugPanelScrollTop = panel.scrollTop ?? 0;
      } catch {
        debugPanelScrollTop = 0;
      }
      panel.remove();
    }
    cleanupDebugPanelResources();
    debugPanelOpen = false;
  }
  function toggleDebugPanel() {
    if (!debugPanelAccess || isOnMenu() || getActiveSlot() == null) {
      closeDebugPanel();
      return;
    }
    if (debugPanelOpen) {
      closeDebugPanel({ preserveExpansionState: true });
    } else {
      openDebugPanel();
    }
  }
  function teardownDebugPanel() {
    closeDebugPanel();
    removeDebugPanelToggleButton();
  }
  function createDebugPanelToggleButton() {
    if (!shouldShowDebugPanelToggleButton()) {
      removeDebugPanelToggleButton();
      closeDebugPanel();
      return;
    }
    ensureDebugPanelStyles();
    removeDebugPanelToggleButton();
    const button = document.createElement("button");
    button.id = DEBUG_PANEL_TOGGLE_ID;
    button.className = "debug-panel-toggle-button";
    button.type = "button";
    button.textContent = "Debug Panel";
    let lastPointerType = null;
    const handleToggle = (event) => {
      if (event.isTrusted && shouldSkipGhostTap(button)) return;
      markGhostTapTarget(button);
      toggleDebugPanel();
    };
    button.addEventListener("pointerdown", (event) => {
      lastPointerType = event.pointerType || null;
      if (event.pointerType === "mouse") return;
      event.preventDefault();
      handleToggle(event);
    });
    button.addEventListener("click", (event) => {
      if (lastPointerType && lastPointerType !== "mouse") {
        lastPointerType = null;
        return;
      }
      lastPointerType = null;
      handleToggle(event);
    });
    document.body.appendChild(button);
  }
  function applyDebugPanelAccess(enabled) {
    debugPanelAccess = !!enabled;
    if (!debugPanelAccess) {
      teardownDebugPanel();
      return;
    }
    createDebugPanelToggleButton();
  }
  function setDebugPanelAccess(enabled) {
    applyDebugPanelAccess(enabled);
  }
  var DEBUG_PANEL_STYLE_ID, DEBUG_PANEL_ID, DEBUG_PANEL_TOGGLE_ID, debugPanelOpen, debugPanelAccess, debugPanelCleanups, debugPanelExpansionState, debugPanelScrollTop, sectionKeyCounter, subsectionKeyCounter, liveBindings, actionLogContainer, currencyOverrides, currencyOverrideBaselines, currencyOverrideApplications, statOverrides, statOverrideBaselines, lockedStorageKeys, storageLockPatched, originalSetItem, originalRemoveItem, STAT_MULTIPLIER_STORAGE_PREFIX, ACTION_LOG_STORAGE_PREFIX, MAX_ACTION_LOG_ENTRIES, XP_KEY_PREFIX, XP_KEYS, MUTATION_KEY_PREFIX, MUTATION_KEYS, STAT_MULTIPLIERS, currencyListenerAttached;
  var init_debugPanel = __esm({
    "js/util/debugPanel.js"() {
      init_bigNum();
      init_numFormat();
      init_storage();
      init_xpSystem();
      init_mutationSystem();
      init_main();
      init_upgrades();
      init_resetTab();
      init_hudButtons();
      init_dlgTab();
      init_ghostTapGuard();
      DEBUG_PANEL_STYLE_ID = "debug-panel-style";
      DEBUG_PANEL_ID = "debug-panel";
      DEBUG_PANEL_TOGGLE_ID = "debug-panel-toggle";
      debugPanelOpen = false;
      debugPanelAccess = false;
      debugPanelCleanups = [];
      debugPanelExpansionState = createEmptyExpansionState();
      debugPanelScrollTop = 0;
      sectionKeyCounter = 0;
      subsectionKeyCounter = 0;
      liveBindings = [];
      actionLogContainer = null;
      currencyOverrides = /* @__PURE__ */ new Map();
      currencyOverrideBaselines = /* @__PURE__ */ new Map();
      currencyOverrideApplications = /* @__PURE__ */ new Set();
      statOverrides = /* @__PURE__ */ new Map();
      statOverrideBaselines = /* @__PURE__ */ new Map();
      lockedStorageKeys = /* @__PURE__ */ new Set();
      if (typeof window !== "undefined") {
        window.__cccLockedStorageKeys = lockedStorageKeys;
      }
      storageLockPatched = false;
      originalSetItem = null;
      originalRemoveItem = null;
      STAT_MULTIPLIER_STORAGE_PREFIX = "ccc:debug:stat-mult";
      ACTION_LOG_STORAGE_PREFIX = "ccc:actionLog";
      MAX_ACTION_LOG_ENTRIES = 100;
      XP_KEY_PREFIX = "ccc:xp";
      XP_KEYS = {
        unlock: (slot) => `${XP_KEY_PREFIX}:unlocked:${slot}`,
        level: (slot) => `${XP_KEY_PREFIX}:level:${slot}`,
        progress: (slot) => `${XP_KEY_PREFIX}:progress:${slot}`
      };
      MUTATION_KEY_PREFIX = "ccc:mutation";
      MUTATION_KEYS = {
        unlock: (slot) => `${MUTATION_KEY_PREFIX}:unlocked:${slot}`,
        level: (slot) => `${MUTATION_KEY_PREFIX}:level:${slot}`,
        progress: (slot) => `${MUTATION_KEY_PREFIX}:progress:${slot}`
      };
      STAT_MULTIPLIERS = [
        { key: "xp", label: "XP" },
        { key: "mutation", label: "MP" }
      ];
      currencyListenerAttached = false;
      applyAllCurrencyOverridesForActiveSlot();
      ensureCurrencyOverrideListener();
      applyDebugPanelAccess(false);
      document.addEventListener("keydown", (event) => {
        if (!debugPanelAccess || isOnMenu()) return;
        if (event.key?.toLowerCase() !== "c") return;
        if (event.ctrlKey) return;
        if (getActiveSlot() == null) return;
        if (event.shiftKey) {
          if (debugPanelOpen) {
            collapseAllDebugCategories();
            closeDebugPanel();
          } else {
            openDebugPanel();
          }
          event.preventDefault();
          return;
        }
        if (!debugPanelOpen) {
          openDebugPanel();
        } else {
          closeDebugPanel({ preserveExpansionState: true });
        }
        event.preventDefault();
      });
      document.addEventListener("DOMContentLoaded", () => {
        createDebugPanelToggleButton();
      });
      window.addEventListener("menu:visibilitychange", onMenuVisibilityChange);
      window.addEventListener("saveSlot:change", () => {
        createDebugPanelToggleButton();
        if (debugPanelOpen) {
          buildDebugPanel();
        }
      });
    }
  });

  // js/game/mutationSystem.js
  var mutationSystem_exports = {};
  __export(mutationSystem_exports, {
    addMutationPower: () => addMutationPower,
    broadcastMutationChange: () => broadcastMutationChange,
    computeMutationMultiplierForLevel: () => computeMutationMultiplierForLevel,
    computeMutationRequirementForLevel: () => computeMutationRequirementForLevel,
    getMutationCoinSprite: () => getMutationCoinSprite,
    getMutationMultiplier: () => getMutationMultiplier,
    getMutationState: () => getMutationState,
    initMutationSystem: () => initMutationSystem,
    isMutationUnlocked: () => isMutationUnlocked,
    onMutationChange: () => onMutationChange,
    setMutationUnlockedForDebug: () => setMutationUnlockedForDebug,
    unlockMutationSystem: () => unlockMutationSystem
  });
  function toStorageSafe(value) {
    try {
      return value?.toStorage?.();
    } catch {
      return null;
    }
  }
  function scheduleCoinMultiplierRefresh() {
    try {
      refreshCoinMultiplierFromXpLevel();
    } catch {
    }
  }
  function ensureExternalMultiplierProviders() {
    if (typeof unregisterCoinMultiplierProvider === "function") {
      try {
        unregisterCoinMultiplierProvider();
      } catch {
      }
      unregisterCoinMultiplierProvider = null;
    }
    if (typeof unregisterXpGainMultiplierProvider === "function") {
      try {
        unregisterXpGainMultiplierProvider();
      } catch {
      }
      unregisterXpGainMultiplierProvider = null;
    }
  }
  function cloneBigNum(value) {
    if (value instanceof BN3) {
      try {
        return value.clone?.() ?? BN3.fromAny(value);
      } catch {
        return bnZero3();
      }
    }
    try {
      return BN3.fromAny(value ?? 0);
    } catch {
      return bnZero3();
    }
  }
  function quantizeRequirement(value) {
    if (!value || typeof value !== "object") return bnZero3();
    if (value.isInfinite?.()) return value.clone?.() ?? value;
    const sci = typeof value.toScientific === "function" ? value.toScientific(18) : "";
    if (!sci || sci === "Infinity") return value.clone?.() ?? value;
    const match = sci.match(/^(\d+(?:\.\d+)?)e([+-]?\d+)$/i);
    if (!match) return value.clone?.() ?? value;
    const exp = parseInt(match[2], 10);
    const digits = exp + 1;
    if (digits <= 18) {
      const floored = value.floorToInteger?.() ?? value.clone?.() ?? value;
      const plain = floored.toPlainIntegerString?.();
      if (!plain || plain === "Infinity") return floored;
      try {
        const quant = BigInt(plain) / 100n * 100n;
        if (quant <= 0n) return BN3.fromInt(100);
        return BN3.fromAny(quant.toString());
      } catch {
        return floored;
      }
    }
    return value.clone?.() ?? value;
  }
  function levelToNumber2(level) {
    if (!level || typeof level !== "object") return 0;
    if (level.isInfinite?.()) return Number.POSITIVE_INFINITY;
    try {
      const plain = level.toPlainIntegerString?.();
      if (plain && plain !== "Infinity" && plain.length <= 15) {
        const num = Number(plain);
        if (Number.isFinite(num)) return num;
      }
    } catch {
    }
    const approxLog = approxLog10BigNum(level);
    if (!Number.isFinite(approxLog)) return Number.POSITIVE_INFINITY;
    if (approxLog > 308) return Number.POSITIVE_INFINITY;
    return Math.pow(10, approxLog);
  }
  function computeRequirement(levelBn) {
    function baseRequirementLog10(baseLevel2) {
      const m = Math.max(0, baseLevel2 + 1);
      const tail = Math.max(0, m - 10);
      const poly = -0.0022175354763501742 * m * m + 0.20449967884058884 * m + 2.016778189084622 + 0.20418426693226513 * Math.pow(tail, 1.6418337930413576);
      if (!Number.isFinite(poly)) {
        return Number.POSITIVE_INFINITY;
      }
      let factor = 1;
      if (m > 10) {
        const powTerm = Math.pow(1.12, m - 10);
        if (!Number.isFinite(powTerm)) {
          return Number.POSITIVE_INFINITY;
        }
        factor += CONST_RATIO * (powTerm - 1);
        if (!Number.isFinite(factor)) {
          return Number.POSITIVE_INFINITY;
        }
      }
      const totalLog102 = poly * factor;
      if (!Number.isFinite(totalLog102)) {
        return Number.POSITIVE_INFINITY;
      }
      return totalLog102;
    }
    const levelNum = levelToNumber2(levelBn);
    if (!Number.isFinite(levelNum)) {
      return BN3.fromAny("Infinity");
    }
    const baseLevel = Math.max(0, levelNum);
    if (baseLevel >= 100) {
      return BN3.fromAny("Infinity");
    }
    let totalLog10;
    if (baseLevel <= 49) {
      totalLog10 = baseRequirementLog10(baseLevel);
    } else {
      const x = baseLevel - 49;
      const A = 300 / (50 * 50 - 1);
      const B = 3 - A;
      const secondExp = A * x * x + B;
      if (!Number.isFinite(secondExp)) {
        return BN3.fromAny("Infinity");
      }
      totalLog10 = Math.pow(10, secondExp);
    }
    if (!Number.isFinite(totalLog10) || totalLog10 <= 0) {
      return BN3.fromAny("Infinity");
    }
    const raw = bigNumFromLog102(totalLog10);
    return quantizeRequirement(raw);
  }
  function ensureRequirement() {
    const lvl = mutationState.level;
    const levelIsInf = !!(lvl && typeof lvl === "object" && (lvl.isInfinite?.() || typeof lvl.isInfinite === "function" && lvl.isInfinite()));
    if (levelIsInf) {
      try {
        const inf = BigNum.fromAny("Infinity");
        mutationState.requirement = inf.clone?.() ?? inf;
        mutationState.progress = inf.clone?.() ?? inf;
      } catch {
        if (!mutationState.requirement || typeof mutationState.requirement !== "object") {
          mutationState.requirement = BigNum.fromInt(0);
        }
        if (!mutationState.progress || typeof mutationState.progress !== "object") {
          mutationState.progress = BigNum.fromInt(0);
        }
      }
      return;
    }
    const req = computeRequirement(mutationState.level);
    mutationState.requirement = req;
  }
  function progressRatio2(progressBn, requirement) {
    if (!requirement || typeof requirement !== "object") return 0;
    if (!progressBn || typeof progressBn !== "object") return 0;
    const reqInf = requirement.isInfinite?.();
    const progInf = progressBn.isInfinite?.();
    if (reqInf) {
      if (progInf) return 1;
      return 0;
    }
    const reqZero = requirement.isZero?.();
    if (reqZero) return 0;
    const progZero = progressBn.isZero?.();
    if (progZero) return 0;
    const logProg = approxLog10BigNum(progressBn);
    const logReq = approxLog10BigNum(requirement);
    if (!Number.isFinite(logProg) || !Number.isFinite(logReq)) {
      return logProg >= logReq ? 1 : 0;
    }
    const diff = logProg - logReq;
    const ratio = Math.pow(10, diff);
    if (!Number.isFinite(ratio)) {
      return diff >= 0 ? 1 : 0;
    }
    if (ratio <= 0) return 0;
    if (ratio >= 1) return 1;
    return ratio;
  }
  function ensureHudRefs2() {
    if (hudRefs2.container && hudRefs2.container.isConnected) return true;
    hudRefs2.container = document.querySelector("[data-mp-hud].mp-counter");
    if (!hudRefs2.container) return false;
    hudRefs2.bar = hudRefs2.container.querySelector(".mp-bar");
    hudRefs2.fill = hudRefs2.container.querySelector(".mp-bar__fill");
    hudRefs2.levelValue = hudRefs2.container.querySelector(".mp-level-value");
    hudRefs2.progress = hudRefs2.container.querySelector("[data-mp-progress]");
    return true;
  }
  function formatBn2(bn) {
    try {
      return formatNumber(bn);
    } catch {
      try {
        return bn.toPlainIntegerString?.() ?? String(bn);
      } catch {
        return "0";
      }
    }
  }
  function updateHud2() {
    if (!ensureHudRefs2()) return;
    const { container: container2, bar, fill, levelValue, progress } = hudRefs2;
    if (!container2) return;
    if (!mutationState.unlocked) {
      container2.setAttribute("hidden", "");
      if (fill) {
        fill.style.setProperty("--mp-fill", "0%");
        fill.style.width = "0%";
      }
      if (levelValue) levelValue.textContent = "0";
      if (progress) {
        const reqHtml = formatBn2(mutationState.requirement);
        progress.innerHTML = `0<span class="mp-progress-separator">/</span><span class="mp-progress-required">${reqHtml}</span><span class="mp-progress-suffix">MP</span>`;
      }
      if (bar) {
        bar.setAttribute("aria-valuenow", "0");
        const reqPlain = formatBn2(mutationState.requirement).replace(/<[^>]*>/g, "");
        bar.setAttribute("aria-valuetext", `0 / ${reqPlain || "10"} MP`);
      }
      syncXpMpHudLayout();
      return;
    }
    container2.removeAttribute("hidden");
    const req = mutationState.requirement;
    const ratio = progressRatio2(mutationState.progress, req);
    const pct = `${(ratio * 100).toFixed(2)}%`;
    if (fill) {
      fill.style.setProperty("--mp-fill", pct);
      fill.style.width = pct;
    }
    if (levelValue) {
      levelValue.innerHTML = formatBn2(mutationState.level);
    }
    if (progress) {
      const currentHtml = formatBn2(mutationState.progress);
      const reqHtml = formatBn2(req);
      progress.innerHTML = `<span class="mp-progress-current">${currentHtml}</span><span class="mp-progress-separator">/</span><span class="mp-progress-required">${reqHtml}</span><span class="mp-progress-suffix">MP</span>`;
    }
    if (bar) {
      bar.setAttribute("aria-valuenow", (ratio * 100).toFixed(2));
      const currPlain = formatBn2(mutationState.progress).replace(/<[^>]*>/g, "");
      const reqPlain = formatBn2(req).replace(/<[^>]*>/g, "");
      bar.setAttribute("aria-valuetext", `${currPlain} / ${reqPlain} MP`);
    }
    syncXpMpHudLayout();
  }
  function emitChange(reason = "update", extraDetail = {}) {
    const snapshot = getMutationState();
    const detail = {
      ...snapshot,
      slot: mutationState.slot ?? getActiveSlot(),
      changeType: reason,
      ...extraDetail
    };
    listeners2.forEach((cb) => {
      try {
        cb(snapshot, reason);
      } catch {
      }
    });
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("mutation:change", { detail }));
      } catch {
      }
    }
    return detail;
  }
  function persistState2() {
    let slot = mutationState.slot;
    if (slot == null) {
      slot = getActiveSlot();
      if (slot != null) {
        mutationState.slot = slot;
      }
    }
    if (slot == null) return;
    try {
      localStorage.setItem(KEY_UNLOCK2(slot), mutationState.unlocked ? "1" : "0");
    } catch {
    }
    try {
      localStorage.setItem(KEY_LEVEL(slot), mutationState.level.toStorage());
    } catch {
    }
    try {
      localStorage.setItem(KEY_PROGRESS2(slot), mutationState.progress.toStorage());
    } catch {
    }
    primeStorageWatcherSnapshot(KEY_UNLOCK2(slot));
    primeStorageWatcherSnapshot(KEY_LEVEL(slot));
    primeStorageWatcherSnapshot(KEY_PROGRESS2(slot));
    const persisted = (() => {
      let unlocked = mutationState.unlocked;
      let level = mutationState.level;
      let progress = mutationState.progress;
      try {
        unlocked = localStorage.getItem(KEY_UNLOCK2(slot)) === "1";
      } catch {
      }
      try {
        const rawLevel = localStorage.getItem(KEY_LEVEL(slot));
        if (rawLevel) level = BN3.fromAny(rawLevel);
      } catch {
      }
      try {
        const rawProgress = localStorage.getItem(KEY_PROGRESS2(slot));
        if (rawProgress) progress = BN3.fromAny(rawProgress);
      } catch {
      }
      return { unlocked, level, progress };
    })();
    const persistedLevelRaw = toStorageSafe(persisted.level);
    const persistedProgressRaw = toStorageSafe(persisted.progress);
    const expectedLevelRaw = toStorageSafe(mutationState.level);
    const expectedProgressRaw = toStorageSafe(mutationState.progress);
    const unlockMismatch = persisted.unlocked !== mutationState.unlocked;
    const levelMismatch = persistedLevelRaw != null && expectedLevelRaw != null && persistedLevelRaw !== expectedLevelRaw;
    const progressMismatch = persistedProgressRaw != null && expectedProgressRaw != null && persistedProgressRaw !== expectedProgressRaw;
    if (unlockMismatch || levelMismatch || progressMismatch) {
      applyState(persisted, { skipPersist: true });
    }
  }
  function normalizeProgress() {
    if (!mutationState.unlocked) return;
    ensureRequirement();
    let currentReq = mutationState.requirement;
    if (!currentReq || typeof currentReq !== "object") return;
    if (currentReq.isInfinite?.()) {
      return;
    }
    let guard = 0;
    const limit = 1e5;
    while (mutationState.progress.cmp?.(currentReq) >= 0 && guard < limit) {
      mutationState.progress = mutationState.progress.sub(currentReq);
      mutationState.level = mutationState.level.add(bnOne3());
      ensureRequirement();
      currentReq = mutationState.requirement;
      if (!currentReq || typeof currentReq !== "object") {
        mutationState.progress = bnZero3();
        break;
      }
      if (currentReq.isInfinite?.()) {
        break;
      }
      guard += 1;
    }
    if (guard >= limit) {
      mutationState.progress = bnZero3();
    }
  }
  function applyState(newState, { skipPersist = false } = {}) {
    mutationState.unlocked = !!newState.unlocked;
    mutationState.level = cloneBigNum(newState.level);
    mutationState.progress = cloneBigNum(newState.progress);
    if (!mutationState.unlocked) {
      mutationState.level = bnZero3();
      mutationState.progress = bnZero3();
    }
    ensureRequirement();
    if (!skipPersist) persistState2();
    updateHud2();
    emitChange("load");
    scheduleCoinMultiplierRefresh();
  }
  function readStateFromStorage(slot) {
    const targetSlot = slot ?? getActiveSlot();
    if (targetSlot == null) {
      applyState({ unlocked: false, level: bnZero3(), progress: bnZero3() }, { skipPersist: true });
      mutationState.slot = null;
      return;
    }
    let unlocked = false;
    let level = bnZero3();
    let progress = bnZero3();
    try {
      unlocked = localStorage.getItem(KEY_UNLOCK2(targetSlot)) === "1";
    } catch {
    }
    try {
      const rawLvl = localStorage.getItem(KEY_LEVEL(targetSlot));
      if (rawLvl) level = BN3.fromAny(rawLvl);
    } catch {
    }
    try {
      const rawProg = localStorage.getItem(KEY_PROGRESS2(targetSlot));
      if (rawProg) progress = BN3.fromAny(rawProg);
    } catch {
    }
    applyState({ unlocked, level, progress }, { skipPersist: true });
    mutationState.slot = targetSlot;
  }
  function cleanupWatchers2() {
    while (watcherCleanups.length) {
      const stop = watcherCleanups.pop();
      try {
        stop?.();
      } catch {
      }
    }
  }
  function bindStorageWatchers2(slot) {
    if (watchersBoundSlot2 === slot) return;
    cleanupWatchers2();
    watchersBoundSlot2 = slot;
    if (slot == null) return;
    watcherCleanups.push(watchStorageKey(KEY_UNLOCK2(slot), {
      onChange(value) {
        const nextUnlocked = value === "1";
        if (mutationState.unlocked !== nextUnlocked) {
          mutationState.unlocked = nextUnlocked;
          if (!nextUnlocked) {
            mutationState.level = bnZero3();
            mutationState.progress = bnZero3();
          }
          ensureRequirement();
          updateHud2();
          emitChange("storage");
          scheduleCoinMultiplierRefresh();
        }
      }
    }));
    watcherCleanups.push(watchStorageKey(KEY_LEVEL(slot), {
      onChange(value) {
        if (!value) return;
        try {
          const next = BN3.fromAny(value);
          if (mutationState.level.cmp?.(next) !== 0) {
            mutationState.level = next;
            ensureRequirement();
            updateHud2();
            emitChange("storage");
            scheduleCoinMultiplierRefresh();
          }
        } catch {
        }
      }
    }));
    watcherCleanups.push(watchStorageKey(KEY_PROGRESS2(slot), {
      onChange(value) {
        if (!value) return;
        try {
          const next = BN3.fromAny(value);
          if (mutationState.progress.cmp?.(next) !== 0) {
            mutationState.progress = next;
            ensureRequirement();
            updateHud2();
            emitChange("storage");
          }
        } catch {
        }
      }
    }));
  }
  function initMutationSystem({ forceReload = false } = {}) {
    ensureExternalMultiplierProviders();
    if (initialized3) {
      const activeSlot = getActiveSlot();
      const slotChanged = activeSlot !== mutationState.slot;
      if (slotChanged || forceReload) {
        readStateFromStorage(activeSlot);
      }
      bindStorageWatchers2(activeSlot);
      ensureHudRefs2();
      updateHud2();
      return getMutationState();
    }
    initialized3 = true;
    ensureHudRefs2();
    const slot = getActiveSlot();
    mutationState.slot = slot;
    readStateFromStorage(slot);
    bindStorageWatchers2(slot);
    updateHud2();
    scheduleCoinMultiplierRefresh();
    if (typeof window !== "undefined") {
      window.addEventListener("saveSlot:change", () => {
        const nextSlot = getActiveSlot();
        mutationState.slot = nextSlot;
        readStateFromStorage(nextSlot);
        bindStorageWatchers2(nextSlot);
        updateHud2();
        scheduleCoinMultiplierRefresh();
        emitChange("slot");
      });
    }
    return getMutationState();
  }
  function getMutationState() {
    return {
      unlocked: mutationState.unlocked,
      level: cloneBigNum(mutationState.level),
      progress: cloneBigNum(mutationState.progress),
      requirement: cloneBigNum(mutationState.requirement)
    };
  }
  function isMutationUnlocked() {
    return !!mutationState.unlocked;
  }
  function unlockMutationSystem() {
    initMutationSystem();
    if (mutationState.unlocked) return false;
    mutationState.unlocked = true;
    ensureRequirement();
    persistState2();
    updateHud2();
    emitChange("unlock");
    scheduleCoinMultiplierRefresh();
    return true;
  }
  function setMutationUnlockedForDebug(unlocked) {
    initMutationSystem();
    const nextUnlocked = !!unlocked;
    applyState({
      unlocked: nextUnlocked,
      level: nextUnlocked ? mutationState.level : bnZero3(),
      progress: nextUnlocked ? mutationState.progress : bnZero3()
    });
  }
  function addMutationPower(amount) {
    initMutationSystem();
    if (!mutationState.unlocked) return getMutationState();
    if (mutationState.level && mutationState.level.isInfinite?.()) {
      if (!mutationState.progress?.isInfinite?.()) {
        try {
          mutationState.progress = BN3.fromAny("Infinity");
        } catch {
        }
      }
      if (!mutationState.requirement?.isInfinite?.()) {
        try {
          mutationState.requirement = BN3.fromAny("Infinity");
        } catch {
        }
      }
      return getMutationState();
    }
    let inc;
    try {
      inc = amount instanceof BN3 ? amount : BN3.fromAny(amount ?? 0);
    } catch {
      inc = bnZero3();
    }
    inc = applyStatMultiplierOverride("mutation", inc);
    if (inc.isZero?.()) return getMutationState();
    const incClone = inc.clone?.() ?? inc;
    const prevLevel = mutationState.level.clone?.() ?? mutationState.level;
    const prevProgress = mutationState.progress.clone?.() ?? mutationState.progress;
    mutationState.progress = mutationState.progress.add(incClone);
    const progInf = mutationState.progress.isInfinite?.();
    if (progInf) {
      try {
        mutationState.level = BN3.fromAny("Infinity");
      } catch {
      }
      try {
        mutationState.progress = BN3.fromAny("Infinity");
      } catch {
        mutationState.progress = bnZero3();
      }
      try {
        mutationState.requirement = BN3.fromAny("Infinity");
      } catch {
      }
    } else {
      normalizeProgress();
    }
    persistState2();
    updateHud2();
    const levelsGained = mutationState.level.sub(prevLevel);
    if (!levelsGained.isZero?.()) {
      scheduleCoinMultiplierRefresh();
    }
    const detail = emitChange("progress", {
      delta: incClone.clone?.() ?? incClone,
      levelsGained: levelsGained.clone?.() ?? levelsGained,
      level: mutationState.level.clone?.() ?? mutationState.level,
      progress: mutationState.progress.clone?.() ?? mutationState.progress,
      requirement: mutationState.requirement.clone?.() ?? mutationState.requirement,
      previousLevel: prevLevel.clone?.() ?? prevLevel,
      previousProgress: prevProgress.clone?.() ?? prevProgress
    });
    return detail;
  }
  function broadcastMutationChange(detailOverrides = {}) {
    initMutationSystem();
    const reason = detailOverrides.changeType ?? "manual";
    return emitChange(reason, detailOverrides);
  }
  function computeMutationMultiplierForLevel(levelValue) {
    let levelBn;
    if (levelValue instanceof BN3) {
      try {
        levelBn = levelValue.clone?.() ?? levelValue;
      } catch {
        levelBn = bnZero3();
      }
    } else if (typeof levelValue === "bigint") {
      try {
        levelBn = BigNum.fromAny(levelValue.toString());
      } catch {
        levelBn = bnZero3();
      }
    } else {
      try {
        levelBn = BigNum.fromAny(levelValue ?? 0);
      } catch {
        levelBn = bnZero3();
      }
    }
    if (levelBn && levelBn.isInfinite?.()) {
      try {
        return BN3.fromAny("Infinity");
      } catch {
        return bnOne3();
      }
    }
    const levelNum = levelToNumber2(levelBn);
    if (!Number.isFinite(levelNum)) {
      try {
        return BN3.fromAny("Infinity");
      } catch {
        return bnOne3();
      }
    }
    if (levelNum <= 0) return bnOne3();
    const log10 = levelNum * MP_LOG10_BASE;
    return bigNumFromLog102(log10);
  }
  function computeMutationRequirementForLevel(levelValue) {
    let levelBn;
    try {
      levelBn = levelValue instanceof BN3 ? levelValue : BN3.fromAny(levelValue ?? 0);
    } catch {
      levelBn = bnZero3();
    }
    try {
      return computeRequirement(levelBn);
    } catch {
      return bnZero3();
    }
  }
  function getMutationMultiplier() {
    initMutationSystem();
    if (!mutationState.unlocked) return bnOne3();
    try {
      return computeMutationMultiplierForLevel(mutationState.level);
    } catch {
      return bnOne3();
    }
  }
  function getMutationCoinSprite() {
    if (!mutationState.unlocked || mutationState.level.isZero?.()) {
      return "img/currencies/coin/coin.png";
    }
    const levelNum = levelToNumber2(mutationState.level);
    if (!Number.isFinite(levelNum)) {
      return "img/mutations/m25.png";
    }
    const idx = Math.max(1, Math.min(25, Math.floor(levelNum)));
    return `img/mutations/m${idx}.png`;
  }
  function onMutationChange(callback) {
    if (typeof callback !== "function") return () => {
    };
    listeners2.add(callback);
    return () => {
      listeners2.delete(callback);
    };
  }
  var KEY_PREFIX2, KEY_UNLOCK2, KEY_LEVEL, KEY_PROGRESS2, BN3, bnZero3, bnOne3, MP_LOG10_BASE, CONST_RATIO, mutationState, hudRefs2, listeners2, watcherCleanups, watchersBoundSlot2, initialized3, unregisterCoinMultiplierProvider, unregisterXpGainMultiplierProvider;
  var init_mutationSystem = __esm({
    "js/game/mutationSystem.js"() {
      init_bigNum();
      init_storage();
      init_debugPanel();
      init_numFormat();
      init_upgrades();
      init_hudLayout();
      init_xpSystem();
      KEY_PREFIX2 = "ccc:mutation";
      KEY_UNLOCK2 = (slot) => `${KEY_PREFIX2}:unlocked:${slot}`;
      KEY_LEVEL = (slot) => `${KEY_PREFIX2}:level:${slot}`;
      KEY_PROGRESS2 = (slot) => `${KEY_PREFIX2}:progress:${slot}`;
      BN3 = BigNum;
      bnZero3 = () => BN3.fromInt(0);
      bnOne3 = () => BN3.fromInt(1);
      MP_LOG10_BASE = Math.log10(2);
      CONST_RATIO = (10 - 1) / (Math.pow(1.12, 50) - 1);
      mutationState = {
        unlocked: false,
        level: bnZero3(),
        progress: bnZero3(),
        requirement: bnZero3(),
        slot: null
      };
      hudRefs2 = {
        container: null,
        bar: null,
        fill: null,
        levelValue: null,
        progress: null
      };
      listeners2 = /* @__PURE__ */ new Set();
      watcherCleanups = [];
      watchersBoundSlot2 = null;
      initialized3 = false;
      unregisterCoinMultiplierProvider = null;
      unregisterXpGainMultiplierProvider = null;
      if (typeof window !== "undefined") {
        window.mutationSystem = window.mutationSystem || {};
        Object.assign(window.mutationSystem, {
          initMutationSystem,
          unlockMutationSystem,
          addMutationPower,
          getMutationState,
          getMutationMultiplier,
          isMutationUnlocked
        });
      }
    }
  });

  // js/game/spawner.js
  var spawner_exports = {};
  __export(spawner_exports, {
    createSpawner: () => createSpawner
  });
  function updateMutationSnapshot(state) {
    if (!state || typeof state !== "object") {
      mutationUnlockedSnapshot = false;
      mutationLevelSnapshot = 0n;
      return;
    }
    mutationUnlockedSnapshot = !!state.unlocked;
    try {
      const level = state.level;
      const plain = typeof level?.toPlainIntegerString === "function" ? level.toPlainIntegerString() : null;
      mutationLevelSnapshot = plain && plain !== "Infinity" ? BigInt(plain) : 0n;
    } catch {
      mutationLevelSnapshot = 0n;
    }
  }
  function createSpawner({
    playfieldSelector = ".area-cove .playfield",
    waterSelector = ".water-base",
    surgesHost = ".surges",
    coinsHost = ".coins-layer",
    coinSrc = "img/coin/coin.png",
    coinSize = 40,
    animationName = "coin-from-wave",
    animationDurationMs = 1500,
    surgeLifetimeMs = 1400,
    surgeWidthVw = 22,
    coinsPerSecond = 1,
    perFrameBudget = 24,
    backlogCap = 600,
    maxActiveCoins = 1500,
    initialBurst = 1,
    coinTtlMs = 6e4,
    waveSoundSrc = "sounds/wave_spawn.mp3",
    waveSoundDesktopVolume = 0.4,
    waveSoundMobileVolume = 0.16,
    waveSoundMinIntervalMs = 160,
    enableDropShadow = false
  } = {}) {
    let currentCoinSrc = coinSrc;
    const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const MOBILE_BACKLOG_CAP = 50;
    let burstUntil = 0;
    const BURST_WINDOW_MS = 120;
    const BURST_TIME_BUDGET_MS = 10;
    const BURST_HARD_CAP = 400;
    const ONE_SHOT_THRESHOLD = 180;
    const NORMAL_TIME_BUDGET_MS = 2;
    const refs = {
      pf: document.querySelector(playfieldSelector),
      w: document.querySelector(waterSelector),
      s: document.querySelector(surgesHost),
      c: document.querySelector(coinsHost),
      hud: document.getElementById("hud-bottom")
    };
    function validRefs() {
      return !!(refs.pf && refs.w && refs.s && refs.c);
    }
    if (!validRefs()) {
      console.warn("[Spawner] Missing required nodes. Check your selectors:", {
        playfieldSelector,
        waterSelector,
        surgesHost,
        coinsHost
      });
    }
    let M = {
      pfRect: null,
      wRect: null,
      safeBottom: 0,
      pfW: 0
    };
    function computeMetrics() {
      if (!validRefs())
        return false;
      const pfRect = refs.pf.getBoundingClientRect();
      const wRect = refs.w.getBoundingClientRect();
      const hudH = refs.hud ? refs.hud.getBoundingClientRect().height : 0;
      M = {
        pfRect,
        wRect,
        safeBottom: pfRect.height - hudH,
        pfW: pfRect.width
      };
      return true;
    }
    computeMetrics();
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => computeMetrics()) : null;
    if (ro && refs.pf)
      ro.observe(refs.pf);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden)
        computeMetrics();
    });
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const COIN_POOL_MAX = Math.max(2e3, maxActiveCoins * 3);
    const SURGE_POOL_MAX = 800;
    const COIN_MARGIN = 12;
    const coinPool = [];
    const surgePool = [];
    function makeCoin() {
      const el = document.createElement("div");
      el.className = "coin";
      el.style.position = "absolute";
      el.style.width = `${coinSize}px`;
      el.style.height = `${coinSize}px`;
      el.style.background = `url(${currentCoinSrc}) center/contain no-repeat`;
      el.style.borderRadius = "50%";
      el.style.pointerEvents = "none";
      el.style.willChange = "transform, opacity";
      el.style.contain = "layout paint style size";
      if (enableDropShadow)
        el.style.filter = "drop-shadow(0 2px 2px rgba(0,0,0,.35))";
      return el;
    }
    const getCoin = () => coinPool.length ? coinPool.pop() : makeCoin();
    function releaseCoin(el) {
      el.style.animation = "none";
      el.style.transform = "";
      el.style.opacity = "1";
      delete el.dataset.dieAt;
      delete el.dataset.jitter;
      delete el.dataset.collected;
      if (el.parentNode)
        el.remove();
      if (coinPool.length < COIN_POOL_MAX)
        coinPool.push(el);
    }
    function makeSurge() {
      const el = document.createElement("div");
      el.className = "wave-surge";
      el.style.willChange = "transform, opacity";
      return el;
    }
    const getSurge = () => surgePool.length ? surgePool.pop() : makeSurge();
    function releaseSurge(el) {
      el.classList.remove("run");
      if (el.parentNode)
        el.remove();
      if (surgePool.length < SURGE_POOL_MAX)
        surgePool.push(el);
    }
    const waveURL = new URL(waveSoundSrc, document.baseURI).href;
    let waveHtmlEl = null;
    let waveHtmlSource = null;
    let waveLastAt = 0;
    let wavePool = null, waveIdx = 0;
    function ensureWavePool() {
      if (wavePool)
        return wavePool;
      const preloaded = takePreloadedAudio(waveSoundSrc);
      const poolSize = 4;
      wavePool = Array.from({ length: poolSize }, (_, idx) => {
        if (idx === 0 && preloaded) {
          preloaded.preload = "auto";
          try {
            preloaded.currentTime = 0;
          } catch (_2) {
          }
          preloaded.volume = 1;
          return preloaded;
        }
        const a = new Audio(waveURL);
        a.preload = "auto";
        a.load?.();
        return a;
      });
      if (preloaded) {
        for (let i = 1; i < wavePool.length; i++) {
          wavePool[i].load?.();
        }
      }
      return wavePool;
    }
    function playWaveHtmlVolume(vol) {
      if (IS_MOBILE) {
        try {
          ac = ac || new (window.AudioContext || window.webkitAudioContext)();
          if (ac.state === "suspended") ac.resume();
          gain = gain || ac.createGain();
          gain.gain.value = waveSoundMobileVolume;
          gain.connect(ac.destination);
          if (!waveHtmlEl) {
            waveHtmlEl = new Audio(waveURL);
            waveHtmlEl.preload = "auto";
            waveHtmlEl.playsInline = true;
            waveHtmlEl.crossOrigin = "anonymous";
          }
          if (!waveHtmlSource) {
            waveHtmlSource = ac.createMediaElementSource(waveHtmlEl);
            waveHtmlSource.connect(gain);
          }
          waveHtmlEl.muted = false;
          waveHtmlEl.volume = 1;
          waveHtmlEl.currentTime = 0;
          waveHtmlEl.play().catch(() => {
          });
          return;
        } catch (e) {
          try {
            const a2 = new Audio(waveURL);
            a2.muted = true;
            a2.play().catch(() => {
            });
          } catch {
          }
          return;
        }
      }
      const pool = ensureWavePool();
      const a = pool[waveIdx++ % pool.length];
      a.volume = vol;
      try {
        a.currentTime = 0;
        a.play();
      } catch {
      }
    }
    let ac = null, gain = null, waveBuf = null, waveLoading = false;
    async function ensureWaveWA() {
      if (waveBuf || waveLoading) return;
      waveLoading = true;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        gain = gain || ac.createGain();
        gain.gain.value = waveSoundMobileVolume;
        gain.connect(ac.destination);
        const res = await fetch(waveURL, { cache: "force-cache" });
        const arr = await res.arrayBuffer();
        waveBuf = await new Promise(
          (ok, err) => ac.decodeAudioData ? ac.decodeAudioData(arr, ok, err) : ok(null)
        );
        if (ac.state === "suspended") {
          try {
            await ac.resume();
          } catch {
          }
        }
      } catch (_) {
      } finally {
        waveLoading = false;
      }
    }
    function playWaveMobile() {
      try {
        if (ac && ac.state === "suspended") ac.resume();
      } catch {
      }
      if (waveBuf && ac && gain) {
        try {
          const src = ac.createBufferSource();
          src.buffer = waveBuf;
          src.connect(gain);
          src.start();
          return;
        } catch {
        }
      }
      playWaveHtmlVolume(waveSoundMobileVolume);
      ensureWaveWA();
    }
    const warmWave = () => {
      if (IS_MOBILE) ensureWaveWA();
    };
    ["pointerdown", "touchstart"].forEach(
      (evt) => window.addEventListener(evt, warmWave, { once: true, passive: true, capture: true })
    );
    ensureWavePool();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && IS_MOBILE && ac && ac.state === "suspended") {
        try {
          ac.resume();
        } catch {
        }
      }
    });
    function playWaveOncePerBurst() {
      const now = performance.now();
      if (now - waveLastAt < waveSoundMinIntervalMs) return;
      waveLastAt = now;
      if (IS_MOBILE) playWaveMobile();
      else playWaveHtmlVolume(waveSoundDesktopVolume);
    }
    function planCoinFromWave(wave) {
      if (!wave) return null;
      const { x: waveX, y: waveTop, w: waveW } = wave;
      const crestCenter = waveX + waveW / 2 + (Math.random() * 60 - 30);
      const startX = crestCenter - coinSize / 2;
      const startY = waveTop + 10 - coinSize / 2;
      const drift = Math.random() * 100 - 50;
      const endX = clamp(startX + drift, COIN_MARGIN, M.pfW - coinSize - COIN_MARGIN);
      const minY = Math.max(M.wRect.height + 80, 120);
      const maxY = Math.max(minY + 40, M.safeBottom - coinSize - 6);
      const endY = clamp(minY + Math.random() * (maxY - minY), minY, maxY);
      const midX = startX + (endX - startX) * 0.66;
      const jitterMs = Math.random() * 100;
      return {
        x0: startX,
        y0: startY,
        xMid: midX,
        y1: endY,
        x1: endX,
        jitterMs
      };
    }
    function planSpawn() {
      if (!validRefs())
        return null;
      if (!M.pfRect || !M.wRect)
        computeMetrics();
      if (maxActiveCoins !== Infinity && refs.c.childElementCount >= maxActiveCoins) {
        const oldest = refs.c.firstElementChild;
        if (oldest)
          releaseCoin(oldest);
      }
      const pfW = M.pfW;
      const waveW = clamp(pfW * (surgeWidthVw / 100), 220, 520);
      const leftMax = Math.max(1, pfW - waveW - COIN_MARGIN * 2);
      const waveX = Math.random() * leftMax + COIN_MARGIN;
      const waterToPfTop = M.wRect.top - M.pfRect.top;
      const waveTop = Math.max(0, waterToPfTop + M.wRect.height * 0.05);
      const wave = {
        x: waveX,
        y: waveTop,
        w: waveW
      };
      const coinPlan = planCoinFromWave(wave);
      if (!coinPlan) return null;
      return {
        wave,
        coin: coinPlan
      };
    }
    function commitBatch(batch) {
      if (!batch.length || !validRefs()) return;
      const wavesFrag = document.createDocumentFragment();
      const coinsFrag = document.createDocumentFragment();
      const newCoins = [];
      const newSurges = [];
      for (const { wave, coin } of batch) {
        if (wave) {
          const surge = getSurge();
          surge.style.left = `${wave.x}px`;
          surge.style.top = `${wave.y}px`;
          surge.style.width = `${wave.w}px`;
          wavesFrag.appendChild(surge);
          newSurges.push(surge);
        }
        const el = getCoin();
        el.style.background = `url(${currentCoinSrc}) center/contain no-repeat`;
        el.style.setProperty("--x0", `${coin.x0}px`);
        el.style.setProperty("--y0", `${coin.y0}px`);
        el.style.setProperty("--xmid", `${coin.xMid}px`);
        el.style.setProperty("--y1", `${coin.y1}px`);
        el.style.setProperty("--x1", `${coin.x1}px`);
        el.style.transform = `translate3d(${coin.x0}px, ${coin.y0}px, 0)`;
        el.dataset.jitter = String(coin.jitterMs);
        const animMs = Number(coin.durationMs);
        if (Number.isFinite(animMs) && animMs > 0) {
          el.dataset.animMs = String(Math.max(300, animMs));
        } else if (el.dataset.animMs) {
          delete el.dataset.animMs;
        }
        el.dataset.dieAt = String(performance.now() + coinTtlMs);
        if (mutationUnlockedSnapshot) {
          el.dataset.mutationLevel = mutationLevelSnapshot.toString();
        } else {
          el.dataset.mutationLevel = "0";
        }
        coinsFrag.appendChild(el);
        newCoins.push(el);
      }
      refs.s.appendChild(wavesFrag);
      refs.c.appendChild(coinsFrag);
      requestAnimationFrame(() => {
        if (newSurges.length) playWaveOncePerBurst();
        for (const surge of newSurges) {
          surge.classList.remove("run");
          void surge.offsetWidth;
          surge.classList.add("run");
          const onEnd = (e) => {
            if (e.target === surge) releaseSurge(surge);
          };
          surge.addEventListener("animationend", onEnd, { once: true });
        }
        for (const el of newCoins) {
          const jitter = Number(el.dataset.jitter) || 0;
          const animMs = Number(el.dataset.animMs);
          const duration = Number.isFinite(animMs) && animMs > 0 ? Math.max(300, animMs) : animationDurationMs;
          el.style.animation = "none";
          void el.offsetWidth;
          el.style.animation = `${animationName} ${duration}ms ease-out ${jitter}ms 1 both`;
        }
      });
    }
    function spawnBurst(n = 1) {
      if (!validRefs())
        return;
      if (!M.pfRect || !M.wRect)
        computeMetrics();
      const batch = [];
      for (let i = 0; i < n; i++) {
        const plan = planSpawn();
        if (plan) {
          batch.push(plan);
        }
      }
      if (batch.length)
        commitBatch(batch);
    }
    let rate = coinsPerSecond;
    let rafId = null;
    let last = performance.now();
    let carry = 0;
    let queued = 0;
    let ttlCursor = null;
    const ttlChecksPerFrame = 200;
    function loop(now) {
      if (!M.pfRect || !M.wRect) computeMetrics();
      const dt = (now - last) / 1e3;
      last = now;
      {
        let checked = 0;
        let node = ttlCursor || refs.c && refs.c.firstElementChild;
        while (node && checked < ttlChecksPerFrame) {
          const next = node.nextElementSibling;
          const dieAt = Number(node.dataset && node.dataset.dieAt || 0);
          if (dieAt && now >= dieAt) {
            releaseCoin(node);
          }
          node = next;
          checked++;
        }
        ttlCursor = node || null;
      }
      carry += rate * dt;
      const due = carry | 0;
      const cap = isTouch ? MOBILE_BACKLOG_CAP : backlogCap;
      if (queued > cap) queued = cap;
      if (due > 0) {
        queued = Math.min(cap, queued + due);
        carry -= due;
      }
      let spawnTarget = Math.min(queued, perFrameBudget);
      let timeBudgetMs = NORMAL_TIME_BUDGET_MS;
      if (isTouch && now < burstUntil && queued > 0) {
        if (queued <= ONE_SHOT_THRESHOLD) {
          spawnTarget = queued;
          timeBudgetMs = BURST_TIME_BUDGET_MS;
        } else {
          spawnTarget = Math.min(queued, BURST_HARD_CAP);
          timeBudgetMs = BURST_TIME_BUDGET_MS;
        }
      }
      if (spawnTarget > 0) {
        const t0 = performance.now();
        const batch = [];
        let baseSpawned = 0;
        for (let i = 0; i < spawnTarget; i++) {
          if (performance.now() - t0 > timeBudgetMs) break;
          const plan = planSpawn();
          if (plan) {
            batch.push(plan);
            baseSpawned += 1;
          }
        }
        if (batch.length) {
          commitBatch(batch);
          if (baseSpawned > 0) {
            queued = Math.max(0, queued - baseSpawned);
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    }
    function start() {
      if (rafId) return;
      if (!validRefs()) {
        console.warn("[Spawner] start() called but required nodes are missing.");
        return;
      }
      computeMetrics();
      if (initialBurst > 0 && rafId === null) {
        spawnBurst(initialBurst);
      }
      last = performance.now();
      rafId = requestAnimationFrame(loop);
    }
    function stop() {
      if (!rafId)
        return;
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    function setRate(n) {
      rate = Math.max(0, Number(n) || 0);
    }
    function setCoinSprite(src) {
      if (!src) return;
      currentCoinSrc = src;
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        if (isTouch) burstUntil = performance.now() + BURST_WINDOW_MS;
        if (!rafId) start();
      }
    });
    return {
      start,
      stop,
      setRate,
      setCoinSprite
    };
  }
  var mutationUnlockedSnapshot, mutationLevelSnapshot;
  var init_spawner = __esm({
    "js/game/spawner.js"() {
      init_audioCache();
      init_mutationSystem();
      init_main();
      mutationUnlockedSnapshot = false;
      mutationLevelSnapshot = 0n;
      try {
        updateMutationSnapshot(getMutationState());
      } catch {
        mutationUnlockedSnapshot = false;
        mutationLevelSnapshot = 0n;
      }
      try {
        onMutationChange((snapshot) => {
          updateMutationSnapshot(snapshot);
        });
      } catch {
      }
    }
  });

  // js/game/coinPickup.js
  var coinPickup_exports = {};
  __export(coinPickup_exports, {
    initCoinPickup: () => initCoinPickup,
    setCoinMultiplier: () => setCoinMultiplier
  });
  function updateMutationSnapshot2(state) {
    if (!state || typeof state !== "object") {
      mutationUnlockedSnapshot2 = false;
      mutationLevelIsInfiniteSnapshot = false;
      mutationMultiplierCache.clear();
      return;
    }
    mutationUnlockedSnapshot2 = !!state.unlocked;
    mutationLevelIsInfiniteSnapshot = !!state.level?.isInfinite?.();
    if (!mutationUnlockedSnapshot2) {
      mutationMultiplierCache.clear();
    } else if (mutationLevelIsInfiniteSnapshot) {
      mutationMultiplierCache.clear();
    }
  }
  function initMutationSnapshot() {
    if (typeof mutationUnsub2 === "function") {
      try {
        mutationUnsub2();
      } catch {
      }
    }
    try {
      updateMutationSnapshot2(getMutationState());
    } catch {
      mutationUnlockedSnapshot2 = false;
      mutationMultiplierCache.clear();
    }
    try {
      mutationUnsub2 = onMutationChange((snapshot) => {
        updateMutationSnapshot2(snapshot);
      });
    } catch {
      mutationUnsub2 = null;
    }
  }
  function setCoinMultiplier(x) {
    COIN_MULTIPLIER = x;
    try {
      if (bank.coins?.mult?.set) {
        bank.coins.mult.set(x);
      }
    } catch {
    }
  }
  function refreshMpValueMultiplierCache() {
    try {
      const next = getMpValueMultiplierBn();
      if (next instanceof BigNum) {
        mpValueMultiplierBn = next.clone?.() ?? next;
      } else if (next != null) {
        mpValueMultiplierBn = BigNum.fromAny(next);
      } else {
        mpValueMultiplierBn = BigNum.fromInt(1);
      }
    } catch {
      mpValueMultiplierBn = BigNum.fromInt(1);
    }
  }
  function ensureMpValueMultiplierSync() {
    if (mpMultiplierListenersBound) return;
    mpMultiplierListenersBound = true;
    refreshMpValueMultiplierCache();
    if (typeof document !== "undefined") {
      document.addEventListener("ccc:upgrades:changed", refreshMpValueMultiplierCache);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("saveSlot:change", refreshMpValueMultiplierCache);
    }
  }
  function resolveCoinBase(el) {
    if (el?.dataset?.bn) {
      try {
        return BigNum.fromAny(el.dataset.bn);
      } catch {
      }
    }
    if (el?.dataset?.value) {
      try {
        return BigNum.fromAny(el.dataset.value);
      } catch {
      }
    }
    try {
      return BASE_COIN_VALUE.clone?.() ?? BigNum.fromInt(1);
    } catch {
      return BigNum.fromInt(1);
    }
  }
  function computeMagnetUnitPx() {
    if (typeof window === "undefined" || typeof document === "undefined") return 0;
    const root = document.documentElement;
    const vw = Math.max(0, window.innerWidth || root?.clientWidth || 0);
    const vh = Math.max(0, window.innerHeight || root?.clientHeight || 0);
    if (!(vw > 0 && vh > 0)) return 0;
    const minDim = Math.min(vw, vh);
    return minDim * MAGNET_UNIT_RATIO;
  }
  function createMagnetController({ playfield, coinsLayer, coinSelector, collectFn }) {
    if (!playfield || !coinsLayer || typeof collectFn !== "function") {
      return { destroy() {
      } };
    }
    if (typeof window === "undefined" || typeof document === "undefined") {
      return { destroy() {
      } };
    }
    const indicator = document.createElement("div");
    indicator.className = "magnet-indicator";
    indicator.setAttribute("aria-hidden", "true");
    playfield.appendChild(indicator);
    let pointerInside = false;
    let pointerClientX = 0;
    let pointerClientY = 0;
    let localX = 0;
    let localY = 0;
    let unitPx = computeMagnetUnitPx();
    let magnetLevel = 0;
    let radiusPx = 0;
    let rafId = 0;
    let destroyed = false;
    const hideIndicator = () => {
      indicator.classList.remove("is-visible");
      indicator.style.transform = "translate3d(-9999px, -9999px, 0)";
    };
    const updateIndicator = () => {
      if (!pointerInside || radiusPx <= 0) {
        hideIndicator();
        return;
      }
      const diameter = radiusPx * 2;
      indicator.style.width = `${diameter}px`;
      indicator.style.height = `${diameter}px`;
      indicator.style.transform = `translate3d(${localX - radiusPx}px, ${localY - radiusPx}px, 0)`;
      indicator.classList.add("is-visible");
    };
    const sweepCoins = () => {
      if (!pointerInside || radiusPx <= 0) return;
      const coins = coinsLayer.querySelectorAll(coinSelector);
      const radiusWithBuffer = radiusPx + MAGNET_COLLECTION_BUFFER;
      for (let i = 0; i < coins.length; i += 1) {
        const coin = coins[i];
        if (!(coin instanceof HTMLElement) || coin.dataset.collected === "1") continue;
        const rect = coin.getBoundingClientRect();
        const coinX = rect.left + rect.width / 2;
        const coinY = rect.top + rect.height / 2;
        const dx = coinX - pointerClientX;
        const dy = coinY - pointerClientY;
        if (Math.hypot(dx, dy) <= radiusWithBuffer) {
          collectFn(coin);
        }
      }
    };
    const runSweep = () => {
      rafId = 0;
      if (!pointerInside || radiusPx <= 0 || destroyed) return;
      sweepCoins();
      ensureSweepLoop();
    };
    const ensureSweepLoop = () => {
      if (!pointerInside || radiusPx <= 0 || rafId || destroyed) return;
      rafId = requestAnimationFrame(runSweep);
    };
    const updatePointerFromEvent = (e) => {
      if (!e || destroyed) return;
      if (typeof e.clientX !== "number" || typeof e.clientY !== "number") return;
      pointerClientX = e.clientX;
      pointerClientY = e.clientY;
      const rect = playfield.getBoundingClientRect();
      localX = pointerClientX - rect.left;
      localY = pointerClientY - rect.top;
      pointerInside = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;
      updateIndicator();
      ensureSweepLoop();
    };
    const handlePointerLeave = () => {
      pointerInside = false;
      hideIndicator();
    };
    const refreshMagnetLevel = () => {
      const nextLevel = getMagnetLevel();
      magnetLevel = nextLevel;
      radiusPx = magnetLevel * unitPx;
      updateIndicator();
      ensureSweepLoop();
    };
    const handleResize = () => {
      unitPx = computeMagnetUnitPx();
      radiusPx = magnetLevel * unitPx;
      updateIndicator();
      ensureSweepLoop();
    };
    const destroy = () => {
      destroyed = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      try {
        window.removeEventListener("resize", handleResize);
      } catch {
      }
      try {
        window.removeEventListener("saveSlot:change", refreshMagnetLevel);
      } catch {
      }
      try {
        document.removeEventListener("ccc:upgrades:changed", refreshMagnetLevel);
      } catch {
      }
      try {
        playfield.removeEventListener("pointermove", updatePointerFromEvent);
      } catch {
      }
      try {
        playfield.removeEventListener("pointerdown", updatePointerFromEvent);
      } catch {
      }
      try {
        playfield.removeEventListener("pointerenter", updatePointerFromEvent);
      } catch {
      }
      try {
        playfield.removeEventListener("pointerleave", handlePointerLeave);
      } catch {
      }
      try {
        playfield.removeEventListener("pointercancel", handlePointerLeave);
      } catch {
      }
      try {
        indicator.remove();
      } catch {
      }
    };
    const pointerOpts = { passive: true };
    playfield.addEventListener("pointermove", updatePointerFromEvent, pointerOpts);
    playfield.addEventListener("pointerdown", updatePointerFromEvent, pointerOpts);
    playfield.addEventListener("pointerenter", updatePointerFromEvent, pointerOpts);
    playfield.addEventListener("pointerleave", handlePointerLeave, pointerOpts);
    playfield.addEventListener("pointercancel", handlePointerLeave, pointerOpts);
    window.addEventListener("resize", handleResize);
    window.addEventListener("saveSlot:change", refreshMagnetLevel);
    document.addEventListener("ccc:upgrades:changed", refreshMagnetLevel);
    refreshMagnetLevel();
    return { destroy };
  }
  function initCoinPickup({
    playfieldSelector = ".area-cove .playfield",
    coinsLayerSelector = ".area-cove .coins-layer",
    hudAmountSelector = ".hud-top .coin-amount",
    coinSelector = ".coin, [data-coin], .coin-sprite",
    soundSrc = "sounds/coin_pickup.mp3",
    storageKey = "ccc:coins",
    disableAnimation = IS_MOBILE
  } = {}) {
    if (coinPickup?.destroy) {
      coinPickup.destroy();
    }
    const pf = document.querySelector(playfieldSelector);
    const cl = document.querySelector(coinsLayerSelector);
    const amt = document.querySelector(hudAmountSelector);
    if (!pf || !cl || !amt) {
      console.warn("[coinPickup] missing required nodes", { pf: !!pf, cl: !!cl, amt: !!amt });
      return { destroy() {
      } };
    }
    initMutationSnapshot();
    ensureMpValueMultiplierSync();
    pf.style.touchAction = "none";
    let magnetController = null;
    let coins = bank.coins.value;
    let coinMultiplierBn = null;
    let coinMultiplierIsInfinite = false;
    const refreshCoinMultiplierCache = () => {
      try {
        const multHandle = bank?.coins?.mult;
        if (!multHandle || typeof multHandle.get !== "function") {
          coinMultiplierBn = null;
          coinMultiplierIsInfinite = false;
          return;
        }
        const next = multHandle.get();
        if (!next) {
          coinMultiplierBn = BigNum.fromInt(1);
          coinMultiplierIsInfinite = false;
          return;
        }
        coinMultiplierBn = next.clone?.() ?? BigNum.fromAny(next);
        coinMultiplierIsInfinite = !!coinMultiplierBn?.isInfinite?.();
      } catch {
        coinMultiplierBn = null;
        coinMultiplierIsInfinite = false;
      }
    };
    const applyCoinMultiplier = (value) => {
      let base;
      try {
        base = value instanceof BigNum ? value.clone?.() ?? value : BigNum.fromAny(value ?? 0);
      } catch {
        try {
          return bank?.coins?.mult?.applyTo ? bank.coins.mult.applyTo(value) : BigNum.fromInt(0);
        } catch {
          return BigNum.fromInt(0);
        }
      }
      if (!coinMultiplierBn) refreshCoinMultiplierCache();
      const mult = coinMultiplierBn;
      if (!mult) {
        try {
          return bank?.coins?.mult?.applyTo ? bank.coins.mult.applyTo(base) : base.clone?.() ?? base;
        } catch {
          return base.clone?.() ?? base;
        }
      }
      const multIsInf = coinMultiplierIsInfinite || mult.isInfinite?.();
      if (multIsInf) {
        try {
          return BigNum.fromAny("Infinity");
        } catch {
          return base.clone?.() ?? base;
        }
      }
      if (base.isZero?.()) {
        return base.clone?.() ?? base;
      }
      try {
        return base.mulBigNumInteger(mult);
      } catch {
        try {
          return bank?.coins?.mult?.applyTo ? bank.coins.mult.applyTo(base) : base.clone?.() ?? base;
        } catch {
          return base.clone?.() ?? base;
        }
      }
    };
    const updateHud3 = () => {
      const formatted = formatNumber(coins);
      if (formatted.includes("<span")) {
        amt.innerHTML = formatted;
      } else {
        amt.textContent = formatted;
      }
    };
    refreshCoinMultiplierCache();
    updateHud3();
    const cloneBn = (value) => {
      if (!value) return BigNum.fromInt(0);
      if (typeof value.clone === "function") {
        try {
          return value.clone();
        } catch {
        }
      }
      try {
        return BigNum.fromAny(value);
      } catch {
        return BigNum.fromInt(0);
      }
    };
    const computeMutationMultiplier = (spawnLevelStr) => {
      if (!mutationUnlockedSnapshot2) return null;
      if (mutationLevelIsInfiniteSnapshot) {
        if (BN_INF) {
          try {
            return BN_INF.clone?.() ?? BN_INF;
          } catch {
            return BN_INF;
          }
        }
        return null;
      }
      if (!spawnLevelStr) return null;
      const key = String(spawnLevelStr).trim();
      if (!key) return null;
      const cached = mutationMultiplierCache.get(key);
      if (cached) {
        try {
          return cached.clone?.() ?? BigNum.fromAny(cached);
        } catch {
          mutationMultiplierCache.delete(key);
        }
      }
      let levelBn;
      try {
        levelBn = BigNum.fromAny(key);
      } catch {
        return null;
      }
      let multiplier;
      try {
        multiplier = computeMutationMultiplierForLevel(levelBn);
      } catch {
        multiplier = null;
      }
      if (!multiplier) return null;
      const isIdentity = multiplier.cmp?.(BN_ONE) === 0;
      const stored = multiplier.clone?.() ?? multiplier;
      mutationMultiplierCache.set(key, stored);
      if (isIdentity) return null;
      try {
        return stored.clone?.() ?? stored;
      } catch {
        return stored;
      }
    };
    let pendingCoinGain = null;
    let pendingXpGain = null;
    let pendingMutGain = null;
    let flushScheduled = false;
    const mergeGain = (current, gain) => {
      if (!gain) return current;
      if (!current) return cloneBn(gain);
      try {
        return current.add(gain);
      } catch {
        try {
          const base = cloneBn(current);
          return base.add(gain);
        } catch {
          return cloneBn(gain);
        }
      }
    };
    const flushPendingGains = () => {
      const coinGain = pendingCoinGain;
      pendingCoinGain = null;
      if (coinGain && !coinGain.isZero?.()) {
        try {
          bank.coins.add(coinGain);
        } catch {
        }
      }
      const xpGain = pendingXpGain;
      pendingXpGain = null;
      if (xpGain && !xpGain.isZero?.()) {
        try {
          addXp(xpGain);
        } catch {
        }
      }
      const mutGain = pendingMutGain;
      pendingMutGain = null;
      if (mutGain && !mutGain.isZero?.()) {
        try {
          addMutationPower(mutGain);
        } catch {
        }
      }
    };
    const scheduleFlush2 = () => {
      if (flushScheduled) return;
      flushScheduled = true;
      requestAnimationFrame(() => {
        flushScheduled = false;
        flushPendingGains();
      });
    };
    const queueCoinGain = (gain) => {
      pendingCoinGain = mergeGain(pendingCoinGain, gain);
      scheduleFlush2();
    };
    const queueXpGain = (gain) => {
      pendingXpGain = mergeGain(pendingXpGain, gain);
      scheduleFlush2();
    };
    const queueMutationGain = (gain) => {
      pendingMutGain = mergeGain(pendingMutGain, gain);
      scheduleFlush2();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", flushPendingGains, { passive: true });
    }
    try {
      if (bank.coins?.mult?.get && bank.coins?.mult?.set) {
        const curr = bank.coins.mult.get();
        if (curr.toPlainIntegerString() === "1" && COIN_MULTIPLIER && COIN_MULTIPLIER !== "1") {
          bank.coins.mult.set(COIN_MULTIPLIER);
        }
      }
    } catch {
    }
    const onCurrencyChange2 = (e) => {
      if (!e?.detail) return;
      if (e.detail.key === "coins") {
        coins = e.detail.value;
        updateHud3();
      }
    };
    window.addEventListener("currency:change", onCurrencyChange2);
    const onCoinMultiplierChange = (event) => {
      if (!event?.detail || event.detail.key !== "coins") return;
      try {
        const { mult } = event.detail;
        if (mult instanceof BigNum) {
          coinMultiplierBn = mult.clone?.() ?? mult;
        } else if (mult != null) {
          coinMultiplierBn = BigNum.fromAny(mult);
        } else {
          coinMultiplierBn = BigNum.fromInt(1);
        }
        coinMultiplierIsInfinite = !!coinMultiplierBn?.isInfinite?.();
      } catch {
        coinMultiplierBn = null;
        coinMultiplierIsInfinite = false;
      }
    };
    window.addEventListener("currency:multiplier", onCoinMultiplierChange);
    const slot = getActiveSlot();
    if (slot == null) {
      console.warn("[coinPickup] init called before a save slot is selected.");
      return { destroy() {
      } };
    }
    const SHOP_UNLOCK_KEY = `ccc:unlock:shop:${slot}`;
    const SHOP_PROGRESS_KEY = `ccc:unlock:shop:progress:${slot}`;
    const legacyP = localStorage.getItem("ccc:unlock:shop:progress");
    const legacyU = localStorage.getItem("ccc:unlock:shop");
    if (legacyP != null && localStorage.getItem(SHOP_PROGRESS_KEY) == null) {
      localStorage.setItem(SHOP_PROGRESS_KEY, legacyP);
    }
    if (legacyU != null && localStorage.getItem(SHOP_UNLOCK_KEY) == null) {
      localStorage.setItem(SHOP_UNLOCK_KEY, legacyU);
    }
    localStorage.removeItem("ccc:unlock:shop:progress");
    localStorage.removeItem("ccc:unlock:shop");
    {
      const p = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || "0", 10);
      localStorage.setItem(SHOP_PROGRESS_KEY, String(p));
      if (p >= 10 && localStorage.getItem(SHOP_UNLOCK_KEY) !== "1") {
        try {
          unlockShop();
        } catch {
        }
        localStorage.setItem(SHOP_UNLOCK_KEY, "1");
      }
    }
    const DESKTOP_VOLUME = 0.3;
    const MOBILE_VOLUME = 0.12;
    const resolvedSrc = new URL(soundSrc, document.baseURI).href;
    const isCoin = (el) => el instanceof HTMLElement && el.dataset.collected !== "1" && el.matches(coinSelector);
    function ensureInteractive(el) {
      try {
        el.style.pointerEvents = "auto";
      } catch {
      }
    }
    cl.querySelectorAll(coinSelector).forEach(ensureInteractive);
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.matches(coinSelector)) {
            ensureInteractive(n);
            bindCoinDirect(n);
          }
        });
      }
    });
    mo.observe(cl, { childList: true, subtree: true });
    let ac = null, masterGain = null, buffer = null;
    let webAudioReady = false, webAudioLoading = false, webAudioAttempted = false;
    let queuedPlays = 0;
    let mobileFallback = null;
    function playCoinMobileFallback() {
      if (!mobileFallback) {
        mobileFallback = new Audio(resolvedSrc);
        mobileFallback.preload = "auto";
      }
      mobileFallback.muted = false;
      mobileFallback.volume = MOBILE_VOLUME;
      try {
        mobileFallback.currentTime = 0;
        mobileFallback.play();
      } catch {
      }
    }
    async function initWebAudioOnce() {
      if (webAudioReady || webAudioLoading) return;
      if (!("AudioContext" in window || "webkitAudioContext" in window)) return;
      webAudioLoading = true;
      webAudioAttempted = true;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ac.createGain();
      masterGain.gain.value = MOBILE_VOLUME;
      masterGain.connect(ac.destination);
      try {
        const res = await fetch(resolvedSrc, { cache: "force-cache" });
        const arr = await res.arrayBuffer();
        buffer = await new Promise((ok, err) => ac.decodeAudioData(arr, ok, err));
        if (ac.state === "suspended") {
          try {
            await ac.resume();
          } catch {
          }
        }
        webAudioReady = true;
      } catch (e) {
        console.warn("[coinPickup] WebAudio init failed:", e);
      } finally {
        webAudioLoading = false;
      }
    }
    function playCoinWebAudio() {
      if (ac && ac.state === "suspended") {
        try {
          ac.resume();
        } catch {
        }
      }
      if (IS_MOBILE && (!webAudioReady || !ac || !buffer || !masterGain || ac && ac.state !== "running")) {
        if (!webAudioLoading) initWebAudioOnce();
        playCoinMobileFallback();
        return true;
      }
      if (!webAudioReady || !ac || !buffer || !masterGain) {
        if (!webAudioLoading) initWebAudioOnce();
        return true;
      }
      try {
        const src = ac.createBufferSource();
        src.buffer = buffer;
        try {
          src.detune = 0;
        } catch {
        }
        masterGain.gain.setValueAtTime(MOBILE_VOLUME, ac.currentTime);
        src.connect(masterGain);
        const t = ac.currentTime + Math.random() * 6e-3;
        src.start(t);
        return true;
      } catch (e) {
        console.warn("[coinPickup] playCoinWebAudio error:", e);
        if (IS_MOBILE) playCoinMobileFallback();
        return false;
      }
    }
    function playSound() {
      if (IS_MOBILE) return playCoinWebAudio();
      return playCoinHtmlAudio();
    }
    const warm = () => {
      if (IS_MOBILE) initWebAudioOnce();
    };
    ["pointerdown", "touchstart", "click"].forEach((evt) => {
      window.addEventListener(evt, warm, { once: true, passive: true, capture: true });
      pf.addEventListener(evt, warm, { once: true, passive: true, capture: true });
    });
    let pool = null, pIdx = 0, lastAt = 0;
    if (!IS_MOBILE) {
      pool = Array.from({ length: 8 }, () => {
        const a = new Audio(resolvedSrc);
        a.preload = "auto";
        a.volume = 0.3;
        return a;
      });
    }
    function playCoinHtmlAudio() {
      const now = performance.now();
      if (now - lastAt < 40) return;
      lastAt = now;
      const a = pool[pIdx++ % pool.length];
      try {
        a.currentTime = 0;
        a.play();
      } catch {
      }
    }
    function animateAndRemove(el) {
      if (disableAnimation) {
        el.remove();
        return;
      }
      const cs = getComputedStyle(el);
      const start = cs.transform && cs.transform !== "none" ? cs.transform : "translate3d(0,0,0)";
      el.style.setProperty("--ccc-start", start);
      el.classList.add("coin--collected");
      const done = () => {
        el.removeEventListener("animationend", done);
        el.remove();
      };
      el.addEventListener("animationend", done);
      setTimeout(done, 600);
    }
    function collect(el) {
      if (!isCoin(el)) return false;
      el.dataset.collected = "1";
      playSound();
      animateAndRemove(el);
      const base = resolveCoinBase(el);
      const coinsLocked = isCurrencyLocked(CURRENCIES.COINS);
      let inc = applyCoinMultiplier(base);
      let xpInc = cloneBn(XP_PER_COIN);
      const spawnLevelStr = el.dataset.mutationLevel || null;
      const mutationMultiplier = computeMutationMultiplier(spawnLevelStr);
      if (mutationMultiplier) {
        try {
          inc = inc.mulBigNumInteger(mutationMultiplier);
        } catch {
        }
        try {
          xpInc = xpInc.mulBigNumInteger(mutationMultiplier);
        } catch {
        }
      }
      const incIsZero = typeof inc?.isZero === "function" ? inc.isZero() : false;
      if (!incIsZero && !coinsLocked) {
        try {
          coins = coins?.add ? coins.add(inc) : cloneBn(inc);
        } catch {
          coins = cloneBn(inc);
        }
      }
      updateHud3();
      if (!incIsZero) {
        queueCoinGain(inc);
      }
      const xpEnabled = typeof isXpSystemUnlocked === "function" ? isXpSystemUnlocked() : true;
      const xpIsZero = typeof xpInc?.isZero === "function" ? xpInc.isZero() : false;
      if (xpEnabled && !xpIsZero) {
        queueXpGain(xpInc);
      }
      if (typeof isMutationUnlocked === "function" && isMutationUnlocked()) {
        const mpGain = cloneBn(mpValueMultiplierBn);
        if (!mpGain.isZero?.()) {
          queueMutationGain(mpGain);
        }
      }
      if (localStorage.getItem(SHOP_UNLOCK_KEY) !== "1") {
        const next = parseInt(localStorage.getItem(SHOP_PROGRESS_KEY) || "0", 10) + 1;
        localStorage.setItem(SHOP_PROGRESS_KEY, String(next));
        if (next >= 10) {
          try {
            unlockShop();
          } catch {
          }
          localStorage.setItem(SHOP_UNLOCK_KEY, "1");
        }
      }
      return true;
    }
    magnetController = createMagnetController({
      playfield: pf,
      coinsLayer: cl,
      coinSelector,
      collectFn: collect
    });
    function bindCoinDirect(coin) {
      coin.addEventListener("pointerdown", (e) => {
        collect(coin);
      }, { passive: true });
      coin.addEventListener("mouseenter", () => {
        if (!IS_MOBILE) collect(coin);
      }, { passive: true });
    }
    cl.querySelectorAll(coinSelector).forEach(bindCoinDirect);
    const BRUSH_R = 18;
    const OFF = [[0, 0], [BRUSH_R, 0], [-BRUSH_R, 0], [0, BRUSH_R], [0, -BRUSH_R]];
    function brushAt(x, y) {
      for (let k = 0; k < OFF.length; k++) {
        const px = x + OFF[k][0], py = y + OFF[k][1];
        const stack = document.elementsFromPoint(px, py);
        for (let i = 0; i < stack.length; i++) {
          const el = stack[i];
          if (isCoin(el)) {
            collect(el);
          }
        }
      }
    }
    let pending = null, brushScheduled = false;
    function scheduleBrush(x, y) {
      pending = { x, y };
      if (!brushScheduled) {
        brushScheduled = true;
        requestAnimationFrame(() => {
          if (pending) {
            brushAt(pending.x, pending.y);
            pending = null;
          }
          brushScheduled = false;
        });
      }
    }
    pf.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") scheduleBrush(e.clientX, e.clientY);
    }, { passive: true });
    pf.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") scheduleBrush(e.clientX, e.clientY);
    }, { passive: true });
    pf.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse") scheduleBrush(e.clientX, e.clientY);
    }, { passive: true });
    pf.addEventListener("mousemove", (e) => {
      scheduleBrush(e.clientX, e.clientY);
    }, { passive: true });
    function setMobileVolume(v) {
      const vol = Math.max(0, Math.min(1, Number(v) || 0));
      if (masterGain && ac) masterGain.gain.setValueAtTime(vol, ac.currentTime);
      if (mobileFallback) mobileFallback.volume = vol;
    }
    const destroy = () => {
      flushPendingGains();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", flushPendingGains);
        window.removeEventListener("currency:multiplier", onCoinMultiplierChange);
        window.removeEventListener("currency:change", onCurrencyChange2);
      }
      if (typeof mutationUnsub2 === "function") {
        try {
          mutationUnsub2();
        } catch {
        }
        mutationUnsub2 = null;
      }
      if (magnetController?.destroy) {
        try {
          magnetController.destroy();
        } catch {
        }
        magnetController = null;
      }
      try {
        mo.disconnect();
      } catch {
      }
      try {
        ["pointerdown", "pointermove", "pointerup", "mousemove"].forEach((evt) => pf.replaceWith(pf.cloneNode(true)));
      } catch {
      }
    };
    coinPickup = { destroy };
    return {
      get count() {
        return coins;
      },
      set count(v) {
        coins = BigNum.fromAny ? BigNum.fromAny(v) : BigNum.fromInt(Number(v) || 0);
        updateHud3();
      },
      setMobileVolume,
      destroy
    };
  }
  var mutationUnlockedSnapshot2, mutationLevelIsInfiniteSnapshot, mutationUnsub2, coinPickup, XP_PER_COIN, BASE_COIN_VALUE, BN_ONE, BN_INF, mutationMultiplierCache, COIN_MULTIPLIER, mpValueMultiplierBn, mpMultiplierListenersBound, MAGNET_UNIT_RATIO, MAGNET_COLLECTION_BUFFER;
  var init_coinPickup = __esm({
    "js/game/coinPickup.js"() {
      init_storage();
      init_bigNum();
      init_numFormat();
      init_hudButtons();
      init_xpSystem();
      init_main();
      init_mutationSystem();
      init_upgrades();
      mutationUnlockedSnapshot2 = false;
      mutationLevelIsInfiniteSnapshot = false;
      mutationUnsub2 = null;
      coinPickup = null;
      XP_PER_COIN = BigNum.fromInt(1);
      BASE_COIN_VALUE = BigNum.fromInt(1);
      BN_ONE = BigNum.fromInt(1);
      try {
        BN_INF = BigNum.fromAny("Infinity");
      } catch {
        BN_INF = null;
      }
      mutationMultiplierCache = /* @__PURE__ */ new Map();
      COIN_MULTIPLIER = "1";
      mpValueMultiplierBn = BigNum.fromInt(1);
      mpMultiplierListenersBound = false;
      MAGNET_UNIT_RATIO = 0.03;
      MAGNET_COLLECTION_BUFFER = 8;
    }
  });

  // js/util/saveIntegrity.js
  var saveIntegrity_exports = {};
  __export(saveIntegrity_exports, {
    afterSlotWrite: () => afterSlotWrite,
    beforeSlotWrite: () => beforeSlotWrite
  });
  function nowMs2() {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
    return Date.now();
  }
  function noteTrustedSlot(slot, ttl = TRUSTED_MUTATION_GRACE_MS) {
    if (!slot || slot <= 0) return;
    trustedSlotsUntil.set(slot, nowMs2() + ttl);
  }
  function slotRecentlyTrusted(slot) {
    if (!slot || slot <= 0) return false;
    const expiry = trustedSlotsUntil.get(slot);
    if (expiry == null) return false;
    if (expiry <= nowMs2()) {
      trustedSlotsUntil.delete(slot);
      return false;
    }
    return true;
  }
  function resetTrustedSlots() {
    trustedSlotsUntil.clear();
  }
  function hasLocalStorage() {
    try {
      return typeof localStorage !== "undefined";
    } catch {
      return false;
    }
  }
  function parseSlotFromKey(key) {
    if (!key) return null;
    const match = /:(\d+)$/.exec(String(key));
    if (!match) return null;
    const slot = Number.parseInt(match[1], 10);
    return Number.isFinite(slot) && slot > 0 ? slot : null;
  }
  function rebuildExpectedStateForSlot(slot) {
    const snapshot = /* @__PURE__ */ new Map();
    if (!hasLocalStorage()) {
      expectedStateBySlot.set(slot, snapshot);
      return snapshot;
    }
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
        const keySlot = parseSlotFromKey(key);
        if (keySlot == null || keySlot !== slot) continue;
        let value = "";
        try {
          value = localStorage.getItem(key) ?? "";
        } catch {
          value = "";
        }
        snapshot.set(key, value);
      }
    } catch {
    }
    expectedStateBySlot.set(slot, snapshot);
    return snapshot;
  }
  function ensureExpectedStateForSlot(slot) {
    if (!Number.isFinite(slot) || slot <= 0) return null;
    if (expectedStateBySlot.has(slot)) return expectedStateBySlot.get(slot);
    return rebuildExpectedStateForSlot(slot);
  }
  function beforeSlotWrite(key) {
    if (!hasLocalStorage()) return;
    if (integrityInternalWriteDepth > 0) return;
    const strKey = String(key);
    if (!strKey.startsWith(STORAGE_PREFIX)) return;
    const slot = parseSlotFromKey(strKey);
    if (slot == null) return;
    const snapshot = ensureExpectedStateForSlot(slot);
    if (!snapshot) return;
    try {
      for (const [snapKey, expectedValue] of snapshot.entries()) {
        let actualValue = "";
        try {
          actualValue = localStorage.getItem(snapKey) ?? "";
        } catch {
          actualValue = "";
        }
        if (actualValue !== expectedValue) {
          if (integrityInternalWriteDepth === 0) {
            integrityInternalWriteDepth += 1;
            try {
              markSaveSlotModified(slot);
            } finally {
              integrityInternalWriteDepth -= 1;
            }
          }
          rebuildExpectedStateForSlot(slot);
          return;
        }
      }
    } catch {
    }
  }
  function afterSlotWrite(key, value) {
    const strKey = String(key);
    if (!strKey.startsWith(STORAGE_PREFIX)) return;
    const slot = parseSlotFromKey(strKey);
    if (slot == null) return;
    const snapshot = ensureExpectedStateForSlot(slot) || /* @__PURE__ */ new Map();
    snapshot.set(strKey, String(value ?? ""));
    expectedStateBySlot.set(slot, snapshot);
  }
  function computeSignature(entries = []) {
    let hash = 0;
    for (const entry of entries) {
      for (let i = 0; i < entry.length; i += 1) {
        hash = (hash << 5) - hash + entry.charCodeAt(i) >>> 0;
      }
      hash = hash + 2654435761 >>> 0;
    }
    return `${entries.length}|${hash.toString(16)}`;
  }
  function collectEntriesBySlot() {
    const map = /* @__PURE__ */ new Map();
    if (!hasLocalStorage()) return map;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
        const slotMatch = key.match(/:(\d+)$/);
        if (!slotMatch) continue;
        const slot = parseInt(slotMatch[1], 10);
        if (!Number.isFinite(slot) || slot <= 0) continue;
        const sigKey = getSlotSignatureKey(slot);
        if (key === sigKey) {
          if (!map.has(slot)) map.set(slot, []);
          continue;
        }
        let value = "";
        try {
          value = localStorage.getItem(key) ?? "";
        } catch {
        }
        if (!map.has(slot)) map.set(slot, []);
        map.get(slot).push(`${key}=${value}`);
      }
    } catch {
    }
    map.forEach((entries) => entries.sort());
    return map;
  }
  function getCandidateSlots(entriesBySlot) {
    const slots = /* @__PURE__ */ new Set();
    if (entriesBySlot) {
      entriesBySlot.forEach((_, slot) => slots.add(slot));
    }
    const active = getActiveSlot();
    if (Number.isFinite(active) && active > 0) slots.add(active);
    if (typeof document !== "undefined") {
      document.querySelectorAll(".slot-card").forEach((_, idx) => slots.add(idx + 1));
    }
    return [...slots].filter((slot) => Number.isFinite(slot) && slot > 0);
  }
  function verifySlotIntegrity(slot, entries) {
    if (!slot || slot <= 0) return;
    const list = Array.isArray(entries) ? entries : [];
    const stored = getSlotSignature(slot);
    if (list.length === 0) {
      if (stored) {
        if (!slotRecentlyTrusted(slot)) {
          markSaveSlotModified(slot);
        }
        setSlotSignature(slot, null);
      }
      return;
    }
    const signature = computeSignature(list);
    const mismatch = signature !== stored;
    if (stored && mismatch && !slotRecentlyTrusted(slot)) {
      markSaveSlotModified(slot);
    }
    if (signature !== stored) {
      setSlotSignature(slot, signature);
    }
  }
  function runIntegrityCheck() {
    if (!hasLocalStorage()) return;
    const entriesBySlot = collectEntriesBySlot();
    const slots = getCandidateSlots(entriesBySlot);
    slots.forEach((slot) => {
      const entries = entriesBySlot.get(slot) ?? [];
      verifySlotIntegrity(slot, entries);
    });
  }
  function scheduleTrustedMutationSweep() {
    if (trustedSweepTimer != null) return;
    const root = typeof window !== "undefined" ? window : globalThis;
    trustedSweepTimer = root.setTimeout(() => {
      trustedSweepTimer = null;
      runIntegrityCheck();
    }, TRUSTED_SWEEP_DELAY_MS);
  }
  function handleStorageMutationEvent(event) {
    const detail = event?.detail;
    if (!detail) return;
    const rawSlot = typeof detail.slot === "number" ? detail.slot : Number.parseInt(detail.slot, 10);
    const slot = Number.isFinite(rawSlot) ? rawSlot : null;
    if (!Number.isFinite(slot) || slot <= 0) return;
    if (detail.trusted) {
      noteTrustedSlot(slot);
      scheduleTrustedMutationSweep();
      return;
    }
    trustedSlotsUntil.delete(slot);
    runIntegrityCheck();
  }
  function ensureWatcher() {
    if (typeof window === "undefined") return;
    if (watcherId != null) return;
    watcherId = window.setInterval(runIntegrityCheck, SIGNATURE_POLL_INTERVAL_MS);
  }
  function getShopButtonElement() {
    if (typeof document === "undefined") return null;
    return document.querySelector('.hud-bottom .game-btn[data-btn="shop"]');
  }
  function enforcePoopShopStyle() {
    const btn = getShopButtonElement();
    if (!btn) return;
    const isModded = hasModifiedSave();
    if (!isModded) {
      if (btn.dataset.poopShopApplied === POOP_SHOP_FLAG || btn.style.backgroundImage || btn.style.background) {
        btn.style.backgroundImage = "";
        btn.style.background = "";
        delete btn.dataset.poopShopApplied;
      }
      return;
    }
    const current = btn.style.backgroundImage || btn.style.background;
    if (current !== POOP_SHOP_BG || btn.dataset.poopShopApplied !== POOP_SHOP_FLAG) {
      btn.style.backgroundImage = POOP_SHOP_BG;
      btn.dataset.poopShopApplied = POOP_SHOP_FLAG;
    }
  }
  function startPoopShopEnforcer() {
    if (typeof window === "undefined") return;
    if (poopShopTimer != null) return;
    enforcePoopShopStyle();
    poopShopTimer = window.setInterval(enforcePoopShopStyle, 50);
    window.addEventListener("saveSlot:change", enforcePoopShopStyle);
    window.addEventListener("saveSlot:modified", (ev) => {
      try {
        const active = getActiveSlot();
        if (ev?.detail?.slot === active) {
          enforcePoopShopStyle();
        }
      } catch {
        enforcePoopShopStyle();
      }
    });
  }
  function init() {
    if (typeof window === "undefined") return;
    runIntegrityCheck();
    ensureWatcher();
    startPoopShopEnforcer();
    window.addEventListener("saveSlot:change", () => runIntegrityCheck());
    window.addEventListener("saveIntegrity:storageMutation", handleStorageMutationEvent, { passive: true });
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          resetTrustedSlots();
          runIntegrityCheck();
          enforcePoopShopStyle();
        }
      });
    }
  }
  var SIGNATURE_POLL_INTERVAL_MS, TRUSTED_MUTATION_GRACE_MS, TRUSTED_SWEEP_DELAY_MS, watcherId, trustedSweepTimer, trustedSlotsUntil, expectedStateBySlot, integrityInternalWriteDepth, POOP_SHOP_BG, POOP_SHOP_FLAG, poopShopTimer;
  var init_saveIntegrity = __esm({
    "js/util/saveIntegrity.js"() {
      init_storage();
      SIGNATURE_POLL_INTERVAL_MS = 1e4;
      TRUSTED_MUTATION_GRACE_MS = 750;
      TRUSTED_SWEEP_DELAY_MS = 50;
      watcherId = null;
      trustedSweepTimer = null;
      trustedSlotsUntil = /* @__PURE__ */ new Map();
      expectedStateBySlot = /* @__PURE__ */ new Map();
      integrityInternalWriteDepth = 0;
      POOP_SHOP_BG = "linear-gradient(180deg,#a9793d,#7b5534)";
      POOP_SHOP_FLAG = "1";
      poopShopTimer = null;
      init();
    }
  });

  // js/ui/popups.js
  var popups_exports = {};
  __export(popups_exports, {
    initPopups: () => initPopups,
    teardownpopups: () => teardownpopups
  });
  function ensureContainer() {
    if (container) return container;
    container = document.createElement("div");
    container.className = "currency-popups";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "false");
    document.body.appendChild(container);
    return container;
  }
  function bnFromAny(value) {
    if (value == null) return null;
    if (value instanceof BigNum) return value.clone?.() ?? value;
    if (typeof value.clone === "function" && value.sig != null) {
      try {
        return value.clone();
      } catch {
      }
    }
    try {
      return BigNum.fromAny(value);
    } catch {
      return null;
    }
  }
  function isZero(bn) {
    if (!bn) return true;
    if (typeof bn.isZero === "function") {
      try {
        return bn.isZero();
      } catch {
        return false;
      }
    }
    return false;
  }
  function updateEntry(entry) {
    if (!entry) return;
    const { amountEl, amount, meta } = entry;
    const formatted = meta.formatAmount ? meta.formatAmount(amount) : formatNumber(amount);
    if (amountEl) amountEl.innerHTML = formatted;
  }
  function scheduleRemoval(entry, duration = DEFAULT_DURATION) {
    if (!entry) return;
    if (entry.timeoutId) return;
    entry.timeoutId = window.setTimeout(() => {
      activePopups.delete(entry.type);
      entry.element.classList.remove("is-visible");
      entry.element.classList.add("is-leaving");
      const remove = () => {
        entry.element.removeEventListener("transitionend", remove);
        entry.element.remove();
      };
      entry.element.addEventListener("transitionend", remove, { once: true });
      window.setTimeout(remove, 480);
    }, duration);
  }
  function createPopupEntry(type, meta, amount) {
    ensureContainer();
    const element = document.createElement("div");
    element.className = "currency-popup";
    element.setAttribute("role", "status");
    const plus = document.createElement("span");
    plus.className = "currency-popup__plus";
    plus.textContent = "+";
    const icon = document.createElement("img");
    icon.className = "currency-popup__icon";
    icon.src = meta.icon;
    icon.alt = meta.iconAlt || "";
    const text = document.createElement("span");
    text.className = "currency-popup__text";
    const amountEl = document.createElement("span");
    amountEl.className = "currency-popup__amount";
    text.append(amountEl);
    element.append(plus, icon, text);
    return {
      type,
      meta,
      element,
      amountEl,
      amount: amount.clone?.() ?? amount,
      timeoutId: null
    };
  }
  function showPopup(type, amount, overrides = {}) {
    const baseMeta = POPUP_META[type];
    const meta = Object.assign({ duration: DEFAULT_DURATION, accumulate: true }, baseMeta || {}, overrides);
    if (!meta.icon) return;
    const bnAmount = bnFromAny(amount);
    if (!bnAmount || isZero(bnAmount)) return;
    const existing = meta.accumulate !== false ? activePopups.get(type) : null;
    if (existing) {
      existing.amount = existing.amount.add(bnAmount);
      existing.meta = meta;
      updateEntry(existing);
      return;
    }
    const entry = createPopupEntry(type, meta, bnAmount);
    entry.meta = meta;
    updateEntry(entry);
    activePopups.set(type, entry);
    const host = ensureContainer();
    const index = POPUP_ORDER.indexOf(type);
    let insertBefore = null;
    if (index >= 0) {
      for (let i = index + 1; i < POPUP_ORDER.length; i++) {
        const next = activePopups.get(POPUP_ORDER[i]);
        if (next?.element?.parentNode === host) {
          insertBefore = next.element;
          break;
        }
      }
    }
    if (insertBefore) host.insertBefore(entry.element, insertBefore);
    else host.appendChild(entry.element);
    requestAnimationFrame(() => entry.element.classList.add("is-visible"));
    scheduleRemoval(entry, meta.duration);
  }
  function syncLastKnown() {
    try {
      const all = getAllCurrencies();
      Object.entries(all).forEach(([key, value]) => {
        const bn = bnFromAny(value) || BigNum.fromInt(0);
        lastKnownAmounts.set(key, bn.clone?.() ?? bn);
      });
      if (!lastKnownAmounts.has("mp")) {
        lastKnownAmounts.set("mp", BigNum.fromInt(0));
      }
    } catch {
      lastKnownAmounts.clear();
    }
  }
  function clearActivePopups() {
    activePopups.forEach((entry) => {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
      entry.element.remove();
    });
    activePopups.clear();
  }
  function handleCurrencyChange(event) {
    const detail = event?.detail;
    if (!detail?.key) return;
    const key = detail.key;
    const current = bnFromAny(detail.value) || BigNum.fromInt(0);
    const prev = lastKnownAmounts.get(key) || BigNum.fromInt(0);
    const zero = BigNum.fromInt(0);
    let delta = null;
    const detailDelta = detail.delta != null ? bnFromAny(detail.delta) : null;
    if (detailDelta && typeof detailDelta.cmp === "function" && detailDelta.cmp(zero) > 0) {
      delta = detailDelta;
    } else if (typeof current.cmp === "function" && current.cmp(prev) > 0) {
      delta = current.sub(prev);
    }
    if (delta && !(typeof delta.isZero === "function" && delta.isZero())) {
      showPopup(key, delta);
    }
    lastKnownAmounts.set(key, current.clone?.() ?? current);
  }
  function handleXpChange(event) {
    const detail = event?.detail;
    if (!detail) return;
    const xpAdded = bnFromAny(detail.xpAdded);
    if (xpAdded && !isZero(xpAdded)) showPopup("xp", xpAdded);
  }
  function handleMutationChange(event) {
    const detail = event?.detail;
    if (!detail) return;
    const delta = bnFromAny(detail.delta);
    if (delta && !isZero(delta)) {
      showPopup("mp", delta);
    }
    const nextProgress = bnFromAny(detail.progress);
    if (nextProgress) {
      lastKnownAmounts.set("mp", nextProgress.clone?.() ?? nextProgress);
    }
  }
  function handleSlotChange() {
    clearActivePopups();
    syncLastKnown();
  }
  function initPopups() {
    if (initialized4) return;
    initialized4 = true;
    ensureContainer();
    syncLastKnown();
    window.addEventListener("currency:change", handleCurrencyChange);
    window.addEventListener("xp:change", handleXpChange);
    window.addEventListener("mutation:change", handleMutationChange);
    window.addEventListener("saveSlot:change", handleSlotChange);
  }
  function teardownpopups() {
    if (!initialized4) return;
    window.removeEventListener("currency:change", handleCurrencyChange);
    window.removeEventListener("xp:change", handleXpChange);
    window.removeEventListener("mutation:change", handleMutationChange);
    window.removeEventListener("saveSlot:change", handleSlotChange);
    clearActivePopups();
    lastKnownAmounts.clear();
    if (container) container.remove();
    container = null;
    initialized4 = false;
  }
  var DEFAULT_DURATION, POPUP_ORDER, POPUP_META, container, initialized4, lastKnownAmounts, activePopups;
  var init_popups = __esm({
    "js/ui/popups.js"() {
      init_bigNum();
      init_numFormat();
      init_storage();
      DEFAULT_DURATION = 3200;
      POPUP_ORDER = ["coins", "xp", "books", "gold", "mp"];
      POPUP_META = {
        [CURRENCIES.COINS]: {
          icon: "img/currencies/coin/coin.png",
          iconAlt: "Coin"
        },
        xp: {
          icon: "img/stats/xp/xp.png",
          iconAlt: "XP"
        },
        [CURRENCIES.BOOKS]: {
          icon: "img/currencies/book/book.png",
          iconAlt: "Book"
        },
        [CURRENCIES.GOLD]: {
          icon: "img/currencies/gold/gold.png",
          iconAlt: "Gold"
        },
        mp: {
          icon: "img/stats/mp/mp.png",
          iconAlt: "Mutation Power"
        }
      };
      container = null;
      initialized4 = false;
      lastKnownAmounts = /* @__PURE__ */ new Map();
      activePopups = /* @__PURE__ */ new Map();
    }
  });

  // js/util/suspendSafeguard.js
  var suspendSafeguard_exports = {};
  __export(suspendSafeguard_exports, {
    flushBackupSnapshot: () => flushBackupSnapshot,
    getSuspendMetadata: () => getSuspendMetadata,
    installSuspendSafeguards: () => installSuspendSafeguards,
    markProgressDirty: () => markProgressDirty,
    restoreFromBackupIfNeeded: () => restoreFromBackupIfNeeded
  });
  function canUseIndexedDb() {
    if (typeof indexedDB === "undefined") return false;
    try {
      return typeof indexedDB.open === "function";
    } catch {
      return false;
    }
  }
  function canUseLocalStorage() {
    if (typeof localStorage === "undefined") return false;
    try {
      const testKey = `${STORAGE_PREFIX2}__test__`;
      localStorage.setItem(testKey, "1");
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
  async function openDatabase() {
    if (!canUseIndexedDb()) throw new Error("IndexedDB unavailable");
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let resolved = false;
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          try {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME);
            }
          } catch (err) {
            console.warn("Failed to upgrade suspend safeguard DB", err);
          }
        };
        request.onsuccess = () => {
          resolved = true;
          const db = request.result;
          db.onversionchange = () => {
            try {
              db.close();
            } catch {
            }
            dbPromise = null;
          };
          resolve(db);
        };
        request.onerror = () => {
          if (!resolved) {
            reject(request.error || new Error("Failed to open suspend safeguard DB"));
          }
        };
        request.onblocked = () => {
        };
      } catch (err) {
        reject(err);
      }
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
    return dbPromise;
  }
  function captureSnapshot() {
    if (!canUseLocalStorage()) return null;
    const data = {};
    let captured = false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(STORAGE_PREFIX2)) continue;
        let value = null;
        try {
          value = localStorage.getItem(key);
        } catch {
          value = null;
        }
        if (value == null) continue;
        data[key] = value;
        captured = true;
      }
    } catch (err) {
      console.warn("Failed to read localStorage for snapshot", err);
      return null;
    }
    return {
      data,
      savedAt: Date.now(),
      hasData: captured
    };
  }
  async function putSnapshot(snapshot) {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        let settled = false;
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.oncomplete = () => {
          if (!settled) {
            settled = true;
            resolve(true);
          }
        };
        tx.onabort = () => {
          if (!settled) {
            settled = true;
            reject(tx.error || new Error("Snapshot transaction aborted"));
          }
        };
        tx.onerror = () => {
          if (!settled) {
            settled = true;
            reject(tx.error || new Error("Snapshot transaction error"));
          }
        };
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(snapshot, SNAPSHOT_KEY);
        request.onerror = () => {
          if (!settled) {
            settled = true;
            reject(request.error || new Error("Snapshot write failed"));
          }
        };
      });
      return true;
    } catch (err) {
      console.warn("Failed to persist suspend snapshot", err);
      return false;
    }
  }
  async function readSnapshot() {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        let settled = false;
        const tx = db.transaction(STORE_NAME, "readonly");
        tx.oncomplete = () => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        };
        tx.onabort = () => {
          if (!settled) {
            settled = true;
            reject(tx.error || new Error("Snapshot read aborted"));
          }
        };
        tx.onerror = () => {
          if (!settled) {
            settled = true;
            reject(tx.error || new Error("Snapshot read error"));
          }
        };
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(SNAPSHOT_KEY);
        request.onsuccess = () => {
          if (settled) return;
          settled = true;
          resolve(request.result || null);
        };
        request.onerror = () => {
          if (!settled) {
            settled = true;
            reject(request.error || new Error("Snapshot get failed"));
          }
        };
      });
    } catch (err) {
      console.warn("Failed to load suspend snapshot", err);
      return null;
    }
  }
  function requestPersistentStorage() {
    try {
      if (navigator?.storage?.persist) {
        navigator.storage.persist().catch(() => {
        });
      }
    } catch {
    }
  }
  function captureStackTrace() {
    try {
      throw new Error("ccc-storage-write");
    } catch (err) {
      return err?.stack || "";
    }
  }
  function parseSlotFromKey2(key) {
    if (!key) return null;
    const match = /:(\d+)$/.exec(String(key));
    if (!match) return null;
    const slot = parseInt(match[1], 10);
    return Number.isFinite(slot) && slot > 0 ? slot : null;
  }
  function isTrustedStorageStack(stack) {
    if (typeof stack !== "string" || stack.length === 0) return false;
    if (DEVTOOLS_CONSOLE_FRAME_RE.test(stack)) return false;
    return true;
  }
  function notifySaveIntegrityOfStorageMutation(key, stack) {
    if (typeof window === "undefined") return;
    if (!key) return;
    const strKey = String(key);
    if (!strKey.startsWith(STORAGE_PREFIX2)) return;
    if (strKey.startsWith(SLOT_SIGNATURE_PREFIX2) || strKey.startsWith(SLOT_MOD_FLAG_PREFIX)) return;
    const slot = parseSlotFromKey2(strKey);
    if (slot == null) return;
    try {
      const detail = {
        key: strKey,
        slot,
        trusted: isTrustedStorageStack(stack)
      };
      window.dispatchEvent(new CustomEvent("saveIntegrity:storageMutation", { detail }));
    } catch {
    }
  }
  function installStorageHooks() {
    if (typeof localStorage === "undefined") return;
    try {
      const proto = Object.getPrototypeOf(localStorage);
      if (!proto || proto.__cccStoragePatched) return;
      const originalSet = proto.setItem;
      const originalRemove = proto.removeItem;
      const originalClear = proto.clear;
      if (typeof originalSet === "function") {
        proto.setItem = function patchedSetItem(key, value) {
          const stack = captureStackTrace();
          const strKey = String(key);
          const isTrackedGameKey = this === localStorage && strKey.startsWith(STORAGE_PREFIX2);
          if (isTrackedGameKey) {
            try {
              beforeSlotWrite(strKey);
            } catch {
            }
          }
          let result;
          try {
            result = originalSet.apply(this, arguments);
          } finally {
            try {
              if (isTrackedGameKey) {
                markProgressDirty("setItem");
                try {
                  afterSlotWrite(strKey, value);
                } catch {
                }
              }
              if (this === localStorage && strKey.startsWith(STORAGE_PREFIX2)) {
                notifySaveIntegrityOfStorageMutation(strKey, stack);
              }
            } catch {
            }
          }
          return result;
        };
      }
      if (typeof originalRemove === "function") {
        proto.removeItem = function patchedRemoveItem(key) {
          const stack = captureStackTrace();
          let result;
          try {
            result = originalRemove.apply(this, arguments);
          } finally {
            try {
              if (this === localStorage && String(key).startsWith(STORAGE_PREFIX2)) {
                markProgressDirty("removeItem");
                notifySaveIntegrityOfStorageMutation(key, stack);
              }
            } catch {
            }
          }
          return result;
        };
      }
      if (typeof originalClear === "function") {
        proto.clear = function patchedClear() {
          const stack = captureStackTrace();
          let result;
          try {
            result = originalClear.apply(this, arguments);
          } finally {
            try {
              if (this === localStorage) {
                markProgressDirty("clear");
                notifySaveIntegrityOfStorageMutation(null, stack);
              }
            } catch {
            }
          }
          return result;
        };
      }
      Object.defineProperty(proto, "__cccStoragePatched", {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
      });
    } catch (err) {
      console.warn("Failed to patch Storage prototype for suspend safeguards", err);
    }
  }
  function scheduleFlush(reason = "idle") {
    lastDirtyReason = reason || lastDirtyReason;
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!dirty) return;
      const reasonToUse = lastDirtyReason;
      dirty = false;
      void flushBackupSnapshot(reasonToUse);
    }, FLUSH_DEBOUNCE_MS);
  }
  function cancelFlushTimer() {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  function markProgressDirty(reason = "dirty") {
    try {
      scheduleFlush(reason);
    } catch {
    }
  }
  async function performFlush(reason = "manual") {
    if (!canUseLocalStorage() || !canUseIndexedDb()) return false;
    const snapshot = captureSnapshot();
    if (!snapshot) return false;
    snapshot.reason = reason;
    pendingImmediateFlush = false;
    const ok = await putSnapshot(snapshot);
    if (!ok) {
      dirty = true;
      scheduleFlush("retry");
    }
    return ok;
  }
  async function flushBackupSnapshot(reason = "manual", { immediate = false } = {}) {
    if (!canUseLocalStorage() || !canUseIndexedDb()) return false;
    if (immediate) {
      cancelFlushTimer();
      dirty = false;
      pendingImmediateFlush = true;
      return performFlush(reason);
    }
    dirty = true;
    lastDirtyReason = reason || lastDirtyReason;
    return performFlush(reason);
  }
  function flushBeforeSuspend(reason) {
    if (!canUseIndexedDb() || !canUseLocalStorage()) return;
    cancelFlushTimer();
    dirty = false;
    pendingImmediateFlush = true;
    void performFlush(reason);
  }
  function hasAnyPrefixedKeys() {
    if (!canUseLocalStorage()) return false;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX2)) return true;
      }
    } catch {
    }
    return false;
  }
  async function restoreFromBackupIfNeeded() {
    if (restoreAttempted) return false;
    restoreAttempted = true;
    if (!canUseLocalStorage() || !canUseIndexedDb()) return false;
    let shouldRestore = false;
    try {
      if (!hasAnyPrefixedKeys()) {
        shouldRestore = true;
      } else {
        const activeSlot = localStorage.getItem(`${STORAGE_PREFIX2}saveSlot`);
        if (activeSlot) {
          const coinKey = `${STORAGE_PREFIX2}coins:${activeSlot}`;
          if (localStorage.getItem(coinKey) == null) {
            shouldRestore = true;
          }
        }
      }
    } catch {
      shouldRestore = false;
    }
    if (!shouldRestore) return false;
    const snapshot = await readSnapshot();
    if (!snapshot?.data) return false;
    let restored = false;
    try {
      for (const [key, value] of Object.entries(snapshot.data)) {
        if (value == null) continue;
        if (localStorage.getItem(key) === null) {
          localStorage.setItem(key, value);
          restored = true;
        }
      }
    } catch (err) {
      console.warn("Failed to restore snapshot into localStorage", err);
    }
    if (restored) {
      markProgressDirty("restored");
    }
    return restored;
  }
  function installSuspendSafeguards() {
    if (installAttempted) return;
    installAttempted = true;
    if (typeof window === "undefined") return;
    requestPersistentStorage();
    installStorageHooks();
    const onVisibilityChange = () => {
      if (document.hidden) {
        flushBeforeSuspend("visibility-hidden");
      } else {
        markProgressDirty("visibility-visible");
      }
    };
    try {
      document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });
    } catch {
    }
    try {
      window.addEventListener("pagehide", () => flushBeforeSuspend("pagehide"), { capture: true });
    } catch {
    }
    try {
      window.addEventListener("beforeunload", () => flushBeforeSuspend("beforeunload"));
    } catch {
    }
    try {
      document.addEventListener("freeze", () => flushBeforeSuspend("freeze"));
    } catch {
    }
    try {
      window.addEventListener("pageshow", () => markProgressDirty("pageshow"));
    } catch {
    }
    try {
      window.addEventListener("focus", () => markProgressDirty("focus"));
    } catch {
    }
    try {
      window.addEventListener("storage", (event) => {
        if (!event) return;
        if (event.storageArea !== localStorage) return;
        if (event.key && !String(event.key).startsWith(STORAGE_PREFIX2)) return;
        markProgressDirty("storage-event");
      });
    } catch {
    }
    markProgressDirty("boot");
  }
  function getSuspendMetadata() {
    return {
      pendingImmediateFlush,
      dirty,
      lastDirtyReason
    };
  }
  var STORAGE_PREFIX2, DB_NAME, DB_VERSION, STORE_NAME, SNAPSHOT_KEY, SLOT_SIGNATURE_PREFIX2, SLOT_MOD_FLAG_PREFIX, FLUSH_DEBOUNCE_MS, dbPromise, flushTimer, dirty, lastDirtyReason, installAttempted, restoreAttempted, pendingImmediateFlush, DEVTOOLS_CONSOLE_FRAME_RE;
  var init_suspendSafeguard = __esm({
    "js/util/suspendSafeguard.js"() {
      init_saveIntegrity();
      STORAGE_PREFIX2 = "ccc:";
      DB_NAME = "ccc:safety";
      DB_VERSION = 1;
      STORE_NAME = "snapshots";
      SNAPSHOT_KEY = "latest";
      SLOT_SIGNATURE_PREFIX2 = `${STORAGE_PREFIX2}slotSig`;
      SLOT_MOD_FLAG_PREFIX = `${STORAGE_PREFIX2}slotMod`;
      FLUSH_DEBOUNCE_MS = 1e3;
      dbPromise = null;
      flushTimer = null;
      dirty = false;
      lastDirtyReason = "init";
      installAttempted = false;
      restoreAttempted = false;
      pendingImmediateFlush = false;
      DEVTOOLS_CONSOLE_FRAME_RE = /\bat <anonymous>:\d+:\d+\b/;
    }
  });

  // js/main.js
  function disableMobileZoomGestures() {
    if (!IS_MOBILE) return;
    let lastTouchEnd = 0;
    const TOUCH_DELAY_MS = 350;
    document.addEventListener("touchend", (event) => {
      const now = performance.now();
      if (now - lastTouchEnd <= TOUCH_DELAY_MS) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
    document.addEventListener("gesturestart", (event) => {
      event.preventDefault();
    }, { passive: false });
    document.addEventListener("dblclick", (event) => {
      event.preventDefault();
    }, { passive: false });
  }
  function showLoader(text = "Loading assets...") {
    let root = document.getElementById("boot-loader");
    if (!root) {
      root = document.createElement("div");
      root.id = "boot-loader";
      root.className = "loading-screen";
      document.body.appendChild(root);
    }
    root.innerHTML = "";
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      background: "#000",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      zIndex: "2147483647",
      opacity: "1",
      transition: "opacity 0.4s ease"
    });
    const wrap = document.createElement("div");
    wrap.style.textAlign = "center";
    wrap.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const label = document.createElement("div");
    label.textContent = text;
    Object.assign(label.style, {
      fontSize: "clamp(16px, 2.4vw, 22px)",
      letterSpacing: ".04em",
      opacity: ".92"
    });
    const bar = document.createElement("div");
    Object.assign(bar.style, {
      width: "min(420px, 70vw)",
      height: "10px",
      background: "rgba(255,255,255,.15)",
      borderRadius: "999px",
      margin: "12px auto 6px",
      overflow: "hidden"
    });
    const fill = document.createElement("div");
    Object.assign(fill.style, {
      width: "0%",
      height: "100%",
      background: "#fff",
      transform: "translateZ(0)",
      transition: "width .15s linear"
    });
    const pct = document.createElement("div");
    pct.textContent = "0%";
    Object.assign(pct.style, { fontSize: "12px", opacity: ".85" });
    bar.appendChild(fill);
    wrap.append(label, bar, pct);
    root.appendChild(wrap);
    const stuckMsg = document.createElement("div");
    stuckMsg.textContent = "If progress bar is stuck, try reloading the page.";
    Object.assign(stuckMsg.style, {
      marginTop: "16px",
      fontSize: "14px",
      opacity: "0",
      transition: "opacity 0.5s ease",
      color: "rgba(255,255,255,0.65)"
    });
    wrap.appendChild(stuckMsg);
    const stuckTimeout = setTimeout(() => {
      if (!root.__done) stuckMsg.style.opacity = "1";
    }, 25e3);
    root.__mountedAt = performance.now();
    root.__done = false;
    root.__wrap = wrap;
    root.__bar = bar;
    root.__fill = fill;
    root.__pct = pct;
    root.__label = label;
    root.__stuckMsg = stuckMsg;
    root.__stuckTimeout = stuckTimeout;
    return root;
  }
  function setLoaderProgress(loaderEl, fraction) {
    if (!loaderEl || !loaderEl.__fill || !loaderEl.__pct) return;
    const f = Math.max(0, Math.min(1, fraction || 0));
    const pct = Math.round(f * 100);
    loaderEl.__fill.style.width = pct + "%";
    loaderEl.__pct.textContent = pct + "%";
  }
  function finishAndHideLoader(loaderEl) {
    if (!loaderEl || loaderEl.__done) return;
    loaderEl.__done = true;
    const MIN_FINISHED_DWELL_MS = 500;
    if (loaderEl.__label) loaderEl.__label.textContent = "Finished loading assets";
    loaderEl.offsetHeight;
    setTimeout(() => {
      loaderEl.style.opacity = "0";
      const onEnd = () => {
        loaderEl.remove();
        document.documentElement.classList.remove("booting");
      };
      loaderEl.addEventListener("transitionend", onEnd, { once: true });
      setTimeout(onEnd, 450);
    }, MIN_FINISHED_DWELL_MS);
  }
  async function warmImage(url) {
    const img = new Image();
    img.src = url;
    try {
      if (img.decode) await img.decode();
    } catch (_) {
    }
    await new Promise((resolve) => {
      const ghost = document.createElement("img");
      ghost.src = url;
      ghost.alt = "";
      ghost.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
      document.body.appendChild(ghost);
      requestAnimationFrame(() => {
        ghost.remove();
        resolve();
      });
    });
  }
  function preloadImages(sources, onEach) {
    return sources.map((src) => new Promise((resolve) => {
      const img = new Image();
      const done = () => {
        try {
          onEach?.(src);
        } catch {
        }
        resolve(src);
      };
      img.onload = done;
      img.onerror = done;
      img.src = src;
    }));
  }
  function preloadAudio(sources, onEach) {
    return sources.map((url) => new Promise((resolve) => {
      const a = new Audio();
      const done = () => {
        try {
          onEach?.(url);
        } catch {
        }
        resolve(url);
      };
      a.addEventListener("canplaythrough", () => {
        if (typeof registerPreloadedAudio2 === "function") {
          registerPreloadedAudio2(url, a);
        } else {
          pendingPreloadedAudio.push({ url, audio: a });
        }
        done();
      }, { once: true });
      a.addEventListener("error", done, { once: true });
      a.preload = "auto";
      a.src = url;
      a.load?.();
    }));
  }
  function preloadFonts(onEach) {
    if (document.fonts && document.fonts.ready) {
      return [document.fonts.ready.then(() => {
        try {
          onEach?.("fonts");
        } catch {
        }
      })];
    }
    return [Promise.resolve().then(() => {
      try {
        onEach?.("fonts");
      } catch {
      }
    })];
  }
  async function preloadAssetsWithProgress({ images = [], audio = [], fonts = true }, onProgress) {
    const total = images.length + audio.length + (fonts ? 1 : 0);
    if (total === 0) {
      onProgress?.(1);
      return;
    }
    let done = 0;
    const bump = () => {
      done++;
      onProgress?.(done / total);
    };
    const tasks = [
      ...preloadImages(images, bump),
      ...preloadAudio(audio, bump),
      ...fonts ? preloadFonts(bump) : []
    ];
    await Promise.all(tasks.map((p) => p.catch(() => null)));
  }
  function enterArea(areaID) {
    if (currentArea === areaID) return;
    currentArea = areaID;
    const menuRoot = document.querySelector(".menu-root");
    switch (areaID) {
      case AREAS.STARTER_COVE: {
        if (menuRoot) {
          menuRoot.style.display = "none";
        }
        document.body.classList.remove("menu-bg");
        const gameRoot = document.getElementById("game-root");
        if (gameRoot) {
          gameRoot.hidden = false;
          initHudButtons2();
        }
        if (typeof initResetSystemGame === "function") {
          try {
            initResetSystemGame();
          } catch {
          }
        }
        if (typeof initMutationSystem2 === "function") {
          try {
            initMutationSystem2();
          } catch {
          }
        }
        if (!spawner) {
          spawner = createSpawner2({
            coinSrc: "img/currencies/coin/coin.png",
            coinSize: 40,
            initialRate: 1,
            surgeLifetimeMs: 1800,
            surgeWidthVw: 22
          });
          window.spawner = spawner;
          const applyMutationSprite = () => {
            if (!spawner || typeof spawner.setCoinSprite !== "function") return;
            try {
              spawner.setCoinSprite(getMutationCoinSprite2?.());
            } catch {
            }
          };
          applyMutationSprite();
          onMutationChangeGame?.(applyMutationSprite);
          initCoinPickup2();
          const applyUpgradesToSpawner = () => {
            try {
              const areaKey = getUpgAreaKey();
              const eff = computeUpgradeEffects2(areaKey);
              if (spawner && eff?.coinsPerSecondMult) {
                spawner.setRate(1 * eff.coinsPerSecondMult);
              }
            } catch {
            }
          };
          applyUpgradesToSpawner();
          onUpgradesChanged2(applyUpgradesToSpawner);
        }
        if (typeof initXpSystem2 === "function") {
          try {
            initXpSystem2();
          } catch {
          }
        }
        spawner.start();
        if (spawner && typeof spawner.playEntranceWave === "function") {
          spawner.playEntranceWave();
        }
        break;
      }
      case AREAS.MENU: {
        if (menuRoot) {
          menuRoot.style.display = "";
          menuRoot.removeAttribute("aria-hidden");
        }
        const gameRoot = document.getElementById("game-root");
        if (gameRoot) gameRoot.hidden = true;
        if (spawner) spawner.stop();
        break;
      }
    }
    try {
      window.dispatchEvent(new CustomEvent("menu:visibilitychange", {
        detail: { visible: areaID === AREAS.MENU }
      }));
    } catch {
    }
  }
  var DEBUG_PANEL_ACCESS, IS_MOBILE, initSlots2, createSpawner2, initCoinPickup2, initHudButtons2, installGhostTapGuard2, bank2, getHasOpenedSaveSlot2, setHasOpenedSaveSlot2, ensureStorageDefaults2, getUpgAreaKey, computeUpgradeEffects2, initXpSystem2, onUpgradesChanged2, registerPreloadedAudio2, initPopups2, installSuspendSafeguards2, restoreSuspendBackup, markProgressDirty2, flushBackupSnapshot2, initResetSystemGame, initMutationSystem2, getMutationCoinSprite2, onMutationChangeGame, setDebugPanelAccess2, pendingPreloadedAudio, AREAS, currentArea, spawner, nextFrame, twoFrames;
  var init_main = __esm({
    "js/main.js"() {
      DEBUG_PANEL_ACCESS = true;
      IS_MOBILE = (() => {
        if (typeof window === "undefined") return false;
        if (typeof window.IS_MOBILE !== "undefined") {
          return !!window.IS_MOBILE;
        }
        const detected = window.matchMedia?.("(any-pointer: coarse)")?.matches || "ontouchstart" in window;
        window.IS_MOBILE = detected;
        return detected;
      })();
      pendingPreloadedAudio = [];
      disableMobileZoomGestures();
      AREAS = {
        MENU: 0,
        STARTER_COVE: 1
      };
      currentArea = AREAS.MENU;
      spawner = null;
      nextFrame = () => new Promise((r) => requestAnimationFrame(r));
      twoFrames = async () => {
        await nextFrame();
        await nextFrame();
      };
      document.addEventListener("DOMContentLoaded", async () => {
        const loader = showLoader("Loading assets...");
        if (window.__MAINTENANCE__) {
          const message = window.__MAINTENANCE_MESSAGE || "Update in progress. Please wait a few minutes.";
          if (loader?.__label) {
            loader.__label.textContent = message;
          }
          if (loader?.__stuckTimeout) {
            clearTimeout(loader.__stuckTimeout);
            loader.__stuckTimeout = null;
          }
          if (loader?.__pct) {
            loader.__pct.remove();
            loader.__pct = null;
          }
          if (loader?.__bar) {
            loader.__bar.remove();
            loader.__bar = null;
          }
          if (loader?.__fill) {
            loader.__fill = null;
          }
          if (loader?.__stuckMsg) {
            loader.__stuckMsg.remove();
            loader.__stuckMsg = null;
          }
          if (loader?.__wrap) {
            loader.__wrap.style.display = "grid";
            loader.__wrap.style.gap = "18px";
          }
          document.documentElement.classList.remove("booting");
          return;
        }
        await nextFrame();
        const modulePromise = Promise.all([
          Promise.resolve().then(() => (init_slots(), slots_exports)),
          Promise.resolve().then(() => (init_spawner(), spawner_exports)),
          Promise.resolve().then(() => (init_coinPickup(), coinPickup_exports)),
          Promise.resolve().then(() => (init_hudButtons(), hudButtons_exports)),
          Promise.resolve().then(() => (init_storage(), storage_exports)),
          Promise.resolve().then(() => (init_saveIntegrity(), saveIntegrity_exports)),
          Promise.resolve().then(() => (init_upgrades(), upgrades_exports)),
          Promise.resolve().then(() => (init_audioCache(), audioCache_exports)),
          Promise.resolve().then(() => (init_xpSystem(), xpSystem_exports)),
          Promise.resolve().then(() => (init_resetTab(), resetTab_exports)),
          Promise.resolve().then(() => (init_mutationSystem(), mutationSystem_exports)),
          Promise.resolve().then(() => (init_popups(), popups_exports)),
          Promise.resolve().then(() => (init_suspendSafeguard(), suspendSafeguard_exports)),
          Promise.resolve().then(() => (init_ghostTapGuard(), ghostTapGuard_exports)),
          Promise.resolve().then(() => (init_debugPanel(), debugPanel_exports))
        ]);
        const ASSET_MANIFEST = {
          images: [
            "img/currencies/coin/coin.png",
            "img/currencies/coin/coin_base.png",
            "img/currencies/coin/coin_plus_base.png",
            "img/currencies/book/book.png",
            "img/currencies/book/book_base.png",
            "img/currencies/book/book_plus_base.png",
            "img/currencies/gold/gold.png",
            "img/currencies/gold/gold_base.png",
            "img/currencies/gold/gold_plus_base.png",
            "img/sc_upg_icons/faster_coins.png",
            "img/sc_upg_icons/book_val1.png",
            "img/sc_upg_icons/coin_val1.png",
            "img/sc_upg_icons/xp_val1.png",
            "img/sc_upg_icons/faster_coins2.png",
            "img/sc_upg_icons/coin_val2.png",
            "img/sc_upg_icons/xp_val2.png",
            "img/sc_upg_icons/mp_val1.png",
            "img/sc_upg_icons/magnet.png",
            "img/sc_upg_icons/xp_val_hm.png",
            "img/stats/xp/xp.png",
            "img/stats/xp/xp_base.png",
            "img/stats/xp/xp_plus_base.png",
            "img/stats/mp/mp.png",
            "img/stats/mp/mp_base.png",
            "img/stats/mp/mp_plus_base.png",
            "img/misc/forge.png",
            "img/misc/locked.png",
            "img/misc/locked_base.png",
            "img/misc/maxed.png",
            "img/misc/merchant.png",
            "img/misc/mysterious.png",
            ...Array.from({ length: 25 }, (_, i) => `img/mutations/m${i + 1}.png`)
          ],
          audio: [
            "sounds/coin_pickup.mp3",
            "sounds/wave_spawn.mp3",
            "sounds/merchant_typing.mp3",
            "sounds/purchase_upg.mp3",
            "sounds/forge_reset.mp3",
            "sounds/evolve_upg.mp3"
          ],
          fonts: true
        };
        let progress = 0;
        const assetsPromise = preloadAssetsWithProgress(ASSET_MANIFEST, (f) => {
          progress = f;
          setLoaderProgress(loader, f);
        });
        const [
          slotsModule,
          spawnerModule,
          coinPickupModule,
          hudButtonsModule,
          storageModule,
          saveIntegrityModule,
          upgradesModule,
          audioCacheModule,
          xpModule,
          resetModule,
          mutationModule,
          popupModule,
          safetyModule,
          guardModule,
          debugPanelModule
        ] = await modulePromise;
        ({ initSlots: initSlots2 } = slotsModule);
        ({ createSpawner: createSpawner2 } = spawnerModule);
        ({ initCoinPickup: initCoinPickup2 } = coinPickupModule);
        ({ initHudButtons: initHudButtons2 } = hudButtonsModule);
        ({ bank: bank2, getHasOpenedSaveSlot: getHasOpenedSaveSlot2, setHasOpenedSaveSlot: setHasOpenedSaveSlot2, ensureStorageDefaults: ensureStorageDefaults2 } = storageModule);
        void saveIntegrityModule;
        ({ getCurrentAreaKey: getUpgAreaKey, computeUpgradeEffects: computeUpgradeEffects2, onUpgradesChanged: onUpgradesChanged2 } = upgradesModule);
        ({ registerPreloadedAudio: registerPreloadedAudio2 } = audioCacheModule);
        ({ initXpSystem: initXpSystem2 } = xpModule);
        ({ initResetSystem: initResetSystemGame } = resetModule);
        ({ initMutationSystem: initMutationSystem2, getMutationCoinSprite: getMutationCoinSprite2, onMutationChange: onMutationChangeGame } = mutationModule);
        ({ initPopups: initPopups2 } = popupModule);
        ({ installSuspendSafeguards: installSuspendSafeguards2, restoreFromBackupIfNeeded: restoreSuspendBackup, markProgressDirty: markProgressDirty2, flushBackupSnapshot: flushBackupSnapshot2 } = safetyModule);
        ({ installGhostTapGuard: installGhostTapGuard2 } = guardModule);
        ({ setDebugPanelAccess: setDebugPanelAccess2 } = debugPanelModule);
        window.bank = bank2;
        if (typeof registerPreloadedAudio2 === "function" && pendingPreloadedAudio.length) {
          while (pendingPreloadedAudio.length) {
            const entry = pendingPreloadedAudio.shift();
            if (!entry) continue;
            try {
              registerPreloadedAudio2(entry.url, entry.audio);
            } catch {
            }
          }
        }
        installGhostTapGuard2?.();
        installSuspendSafeguards2?.();
        if (typeof setDebugPanelAccess2 === "function") {
          setDebugPanelAccess2(DEBUG_PANEL_ACCESS);
          window.setDebugPanelAccess = setDebugPanelAccess2;
        }
        try {
          await restoreSuspendBackup?.();
        } catch {
        }
        await assetsPromise;
        await twoFrames();
        document.documentElement.classList.remove("booting");
        await nextFrame();
        finishAndHideLoader(loader);
        await Promise.all([
          // fixes some image preload issue on mobile
          warmImage("img/currencies/coin/coin_plus_base.png"),
          warmImage("img/stats/xp/xp_plus_base.png"),
          warmImage("img/stats/mp/mp_plus_base.png")
        ]);
        ensureStorageDefaults2();
        markProgressDirty2?.("ensure-defaults");
        initPopups2();
        const titleEl = document.getElementById("panel-title");
        if (getHasOpenedSaveSlot2()) {
          document.body.classList.add("has-opened");
          if (titleEl) titleEl.style.opacity = "0";
        } else {
          if (titleEl) titleEl.style.opacity = "1";
        }
        initSlots2(() => {
          setHasOpenedSaveSlot2(true);
          document.body.classList.add("has-opened");
          if (titleEl) titleEl.style.opacity = "0";
          enterArea(AREAS.STARTER_COVE);
          markProgressDirty2?.("slot-entered");
        });
        if (typeof window !== "undefined" && flushBackupSnapshot2) {
          try {
            window.cccRequestBackup = () => flushBackupSnapshot2("manual", { immediate: true });
          } catch {
          }
        }
      });
    }
  });
  init_main();
})();
//# sourceMappingURL=bundle.js.map
