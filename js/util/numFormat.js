// js/util/numFormat.js
// Policy:
//  - < 1e6: plain integer using the user's locale (grouping)
//  - 1e6 .. < 1e303: suffix table ("M,B,T,Qd,...") with FOUR visible digits
//  - >= 1e303: scientific, but with a pretty *recursive* exponent
//
// Also prettifies the exponent itself (e.g., 1.000e1,000 / 1.000e1.000Qd / 1.000e1.000e308)

import { BigNum } from './bigNum.js';

// Suffixes copied from CCC (descending exponents).
const SUFFIX_ENTRIES = [
  [300,'NoNg'],[297,'OcNg'],[294,'SpNg'],[291,'SxNg'],[288,'QnNg'],[285,'QdNg'],[282,'TNg'],[279,'DNg'],[276,'UNg'],[273,'Ng'],
  [270,'NoOg'],[267,'OcOg'],[264,'SpOg'],[261,'SxOg'],[258,'QnOg'],[255,'QdOg'],[252,'TOg'],[249,'DOg'],[246,'UOg'],[243,'Og'],
  [240,'NoSg'],[237,'OcSg'],[234,'SpSg'],[231,'SxSg'],[228,'QnSg'],[225,'QdSg'],[222,'TSg'],[219,'DSg'],[216,'USg'],[213,'Sg'],
  [210,'Nosg'],[207,'Ocsg'],[204,'Spsg'],[201,'Sxsg'],[198,'Qnsg'],[195,'Qdsg'],[192,'Tsg'],[189,'Dsg'],[186,'Usg'],[183,'sg'],
  [180,'NoQg'],[177,'OcQg'],[174,'SpQg'],[171,'SxQg'],[168,'QnQg'],[165,'QdQg'],[162,'TQg'],[159,'DQg'],[156,'UQg'],[153,'Qg'],
  [150,'Noqg'],[147,'Ocqg'],[144,'Spqg'],[141,'Sxqg'],[138,'Qnqg'],[135,'Qdqg'],[132,'Tqg'],[129,'Dqg'],[126,'Uqg'],[123,'qg'],
  [120,'NoTg'],[117,'OcTg'],[114,'SpTg'],[111,'SxTg'],[108,'QnTg'],[105,'QdTg'],[102,'TTg'],[99,'DTg'],[96,'UTg'],[93,'Tg'],
  [90,'NoVt'],[87,'OcVt'],[84,'SpVt'],[81,'SxVt'],[78,'QnVt'],[75,'QdVt'],[72,'TVt'],[69,'DVt'],[66,'UVt'],[63,'Vt'],
  [60,'NoDe'],[57,'OcDe'],[54,'SpDe'],[51,'SxDe'],[48,'QnDe'],[45,'QdDe'],[42,'TDe'],[39,'DDe'],[36,'UDe'],[33,'De'],
  [30,'No'],[27,'Oc'],[24,'Sp'],[21,'Sx'],[18,'Qn'],[15,'Qd'],[12,'T'],[9,'B'],[6,'M']
];
const SUFFIX_BY_EXP = new Map(SUFFIX_ENTRIES);

const NF_INT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0, useGrouping: true });
function localeInt(s) { return NF_INT.format(Number(s)); }

// --- add 1 to a decimal digit-string (for rounding) ---
function addOneDigitString(str){
  let carry = 1, a = str.split('');
  for (let i = a.length - 1; i >= 0 && carry; i--) {
    let d = a[i].charCodeAt(0) - 48 + carry;
    carry = d >= 10 ? 1 : 0;
    a[i] = String.fromCharCode(48 + (d % 10));
  }
  if (carry) a.unshift('1');
  return a.join('');
}

function formatExponentString(rawDigits, sign = '') {
  let ds = (rawDigits || '').replace(/^0+/, '') || '0';

  if (ds.length < 4) return sign + localeInt(ds);          // < 1,000
  if (ds.length <= 7) {                                     // 1,000 .. 1,000,000
    const n = Number(ds);
    if (Number.isFinite(n) && n <= 1_000_000) return sign + NF_INT.format(n);
  }

  const E = ds.length - 1;

  if (E <= 300) {
    const exp = Math.floor(E / 3) * 3;
    const suffix = SUFFIX_BY_EXP.get(exp) || '';
    const d = E - exp;              // 0..2
    const intDigits = d + 1;        // 1..3
    const decimals = 4 - intDigits; // to keep FOUR visible digits
    const totalDigits = intDigits + decimals;

    if (ds.length < totalDigits + 1) ds += '0'.repeat(totalDigits + 1 - ds.length);
    let head = ds.slice(0, totalDigits);
    const nextDigit = ds.charCodeAt(totalDigits) || 48;
    if (nextDigit >= 53) head = addOneDigitString(head);

    let intStr, fracStr;
    if (head.length > totalDigits) { intStr = head.slice(0, intDigits + 1); fracStr = '0'.repeat(decimals); }
    else { intStr = head.slice(0, intDigits); fracStr = head.slice(intDigits); }

    return sign + `${intStr}${decimals ? '.' + fracStr : ''}${suffix}`;
  }

  // Beyond our table: show scientific-within-exponent with FOUR-digit mantissa
  const totalDigits = 4; // 1 integer + 3 decimals
  if (ds.length < totalDigits + 1) ds += '0'.repeat(totalDigits + 1 - ds.length);
  let head = ds.slice(0, totalDigits);
  const nextDigit = ds.charCodeAt(totalDigits) || 48;
  if (nextDigit >= 53) head = addOneDigitString(head);

  const mantInt  = head.slice(0, 1);
  const mantFrac = head.slice(1);
  return sign + `${mantInt}.${mantFrac}e` + formatExponentString(String(E));
}

function formatPowerOf10Exponent(kDigits, sign = '') {
  // Fast path to detect k ≥ 303 without bigints
  let ge303 = false, k = 0;
  if (kDigits.length > 3) ge303 = true;
  else { k = parseInt(kDigits || '0', 10) || 0; ge303 = (k >= 303); }

  if (ge303) {
    // Scientific inside exponent; pretty-format k itself (locale + suffix rules)
    return sign + '1.000e' + formatExponentString(kDigits);
  }

  // 0..302 → suffix tier plus remainder-driven mantissa
  const exp = Math.floor(k / 3) * 3;          // 0,3,6,...,300
  const suffix = SUFFIX_BY_EXP.get(exp) || '';

  const remainder = k - exp;                   // 0,1,2
  // FOUR visible digits before the suffix:
  //  r=0 → "1.000", r=1 → "10.00", r=2 → "100.0"
  const intPart   = (remainder === 0) ? '1' : (remainder === 1) ? '10' : '100';
  const decimals  = 4 - (remainder + 1);      // 3,2,1
  const fracPart  = decimals ? ('.' + '0'.repeat(decimals)) : '';

  return sign + intPart + fracPart + suffix;
}

function formatExponentChain(expRaw) {
  expRaw = String(expRaw).trim();

  // Optional leading sign on the whole exponent; suppress '+'
  let topSign = '';
  if (expRaw[0] === '+' || expRaw[0] === '-') {
    topSign = (expRaw[0] === '-') ? '-' : '';
    expRaw = expRaw.slice(1);
  }

  // Case A: pure digits (e.g., "...e305") → delegate to our big-int pretty printer
  if (/^\d+$/.test(expRaw)) return topSign + formatExponentString(expRaw);

  // Case B: scientific inside the exponent: "m e ± k"
  const m = expRaw.match(/^(\d+)(?:\.(\d+))?e([+-]?)(\d+)$/i);
  if (!m) return topSign + expRaw; // unknown form → keep as-is

  const [, int, frac = '', sign2, kDigits] = m;

  // Is k >= 303? (length check avoids unsafe parse)
  let kGe303 = false, k = 0;
  if (kDigits.length > 3) kGe303 = true;
  else { k = parseInt(kDigits || '0', 10) || 0; kGe303 = (k >= 303); }

  // First, compute a FOUR-digit mantissa from m (rounded)
  // We'll shift the decimal by (k % 3) for suffix-tiers.
  let ds = (int + frac).replace(/^0+/, '') || '0';
  if (ds.length < 5) ds += '0'.repeat(5 - ds.length);
  let four = ds.slice(0, 4);
  const next = ds.charCodeAt(4) || 48;
  if (next >= 53) four = addOneDigitString(four); // handle rounding carry later

  if (kGe303) {
    // Beyond our suffix table inside the exponent → scientific-of-exponent
    // Keep the (rounded) exponent mantissa ("3.617") and pretty-format k itself.
    const mant = four.slice(0,1) + '.' + four.slice(1);
    const sign2Prefix = (sign2 === '-') ? '-' : '';
    return topSign + mant + 'e' + formatExponentString(kDigits, sign2Prefix);
  }

  // Within our suffix table: choose suffix and place the decimal based on remainder
  const exp = Math.floor(k / 3) * 3;          // 0,3,6,...,300
  const suffix = SUFFIX_BY_EXP.get(exp) || '';
  const remainder = k - exp;                   // 0,1,2

  // Shift decimal: r=0 → "1.234", r=1 → "12.34", r=2 → "123.4"
  const intDigits = remainder + 1;             // 1..3
  const decimals  = 4 - intDigits;             // 3..1
  let intStr, fracStr;
  if (four.length > 4) { // carry overflow → one extra int digit, pad decimals with zeros
    intStr = four.slice(0, intDigits + 1);
    fracStr = '0'.repeat(decimals);
  } else {
    intStr = four.slice(0, intDigits);
    fracStr = four.slice(intDigits);
  }

  const sign2Prefix = (sign2 === '-') ? '-' : '';
  return topSign + sign2Prefix + intStr + (decimals ? ('.' + fracStr) : '') + suffix;
}

 /* Ensures the mantissa is always  4 digits */
function mantissaFourDigits(sci) {
  const i = sci.toLowerCase().indexOf('e');
  if (i < 0) return sci;

  // --- Normalize mantissa to exactly 4 significant digits (1.xxx) with rounding ---
  const rawMant = sci.slice(0, i);           // e.g., "3.2", "12.34" (should be 1.x form from toScientific)
  // Build digit string (no dot)
  let ds = rawMant.replace('.', '');
  if (!/^\d+$/.test(ds)) return sci;         // safety: if parsing failed, bail out

  // Pad to at least 5 digits (4 kept + 1 for rounding)
  if (ds.length < 5) ds += '0'.repeat(5 - ds.length);

  // First 4 digits are kept (rounded by the 5th)
  let head = ds.slice(0, 4);
  const next = ds.charCodeAt(4) || 48;       // '0' if missing
  if (next >= 53) head = addOneDigitString(head);

  // If carry overflow happened (e.g., 9.999 -> 10.00), re-normalize to 1.xxx by shifting
  if (head.length > 4) head = head.slice(0, 4); // head is now "1000" after carry; that still prints as "1.000" below

  const mantissa = head.slice(0,1) + '.' + head.slice(1); // "1.234" style with trailing zeros preserved

  // --- Pretty-format the exponent tail (can be "305" or "1e+100" etc.) ---
  const rawExp = sci.slice(i + 1);
  return mantissa + 'e' + formatExponentChain(rawExp);
}

// Public API
export function formatNumber(bn){
  if (!(bn instanceof BigNum)) return String(bn);
  if (bn.isInfinite && bn.isInfinite()) return '<span class="infinity-symbol">∞</span>';
  if (bn.isZero()) return '0';

  const E = bn.decExp ?? (bn.e + (bn.p - 1)); // decimal exponent

  // Scientific for >= 1e303 (but pretty-print the exponent chain)
  if (E >= 303) {
    return mantissaFourDigits(bn.toScientific(3));
  }

  // Plain integers < 1e6 → locale grouping
  if (E < 6) {
    return localeInt(bn.toPlainIntegerString());
  }

  // Suffix formatting using the legacy table
  const exp = Math.floor(E / 3) * 3;
  const suffix = SUFFIX_BY_EXP.get(exp);
  if (!suffix) return mantissaFourDigits(bn.toScientific(3));

  const d = E - exp;                 // 0..2
  const intDigits = d + 1;           // 1..3
  const decimals  = 4 - intDigits;   // make FOUR visible digits
  const totalDigits = intDigits + decimals;

  let s = bn.sig.toString().padStart(bn.p, '0');
  if (s.length < totalDigits + 1) s += '0'.repeat(totalDigits + 1 - s.length);

  let head = s.slice(0, totalDigits);
  const nextDigit = s.charCodeAt(totalDigits) || 48;
  if (nextDigit >= 53) head = addOneDigitString(head);

  let intStr, fracStr;
  if (head.length > totalDigits) { intStr = head.slice(0, intDigits + 1); fracStr = '0'.repeat(decimals); }
  else { intStr = head.slice(0, intDigits); fracStr = head.slice(intDigits); }

  return `${intStr}${decimals ? '.' + fracStr : ''}${suffix}`;
}
