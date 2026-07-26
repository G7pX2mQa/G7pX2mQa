#!/usr/bin/env python3
"""
Level-based coin multiplier calculator.

For level n:
  additive_bonus = n * 1.00
  multiplicative_component = 1.1 ** n
  final_multiplier = additive_bonus + multiplicative_component

Usage:
  python coin_multi.py            # prints table for levels 0..50
  python coin_multi.py --max 100  # prints table for levels 0..100
  python coin_multi.py --level 750  # prints a single line for level 750
"""

import math
import argparse

LOG10_1P1 = math.log10(1.1)

def _sci_from_log10(log10_value, sig=6):
    """
    Return a string 'a.eeeeeex±k' built from a base-10 log value.
    """
    exp = int(math.floor(log10_value))
    frac = log10_value - exp
    mant = 10.0 ** frac
    fmt = f"{{:.{sig}f}}e{{:+d}}"
    return fmt.format(mant, exp)

def _format_number(x, sig=12):
    """
    Human-friendly number formatting:
      - normal decimal for moderate magnitudes
      - scientific notation for very large/small
    """
    if x == 0:
        return "0"
    absx = abs(x)
    if 1e-6 <= absx < 1e12:
        return f"{x:.{sig}g}"
    return f"{x:.6e}"

def compute_components(level: int):
    """
    Returns a tuple:
      additive_bonus (float/int),
      multiplicative_str (str),
      multiplicative_value_or_None (float | None),
      final_str (str)
    For huge exponents we avoid overflow by using log10 and returning string forms.
    """
    if level < 0:
        raise ValueError("Level must be >= 0")

    additive = float(level)  # +1.00x per level

    # Compute 1.1^level safely. If it's small enough, return numeric; otherwise, string via logs.
    log10_mult = level * LOG10_1P1
    # Double precision overflows near 1e308 → log10 ~ 308
    if log10_mult < 308:
        multiplicative_val = 10.0 ** log10_mult
        multiplicative_str = _format_number(multiplicative_val)
        final_val = multiplicative_val + additive
        final_str = _format_number(final_val)
        return additive, multiplicative_str, multiplicative_val, final_str
    else:
        # Too large to represent directly; provide scientific-notation string.
        multiplicative_val = None
        multiplicative_str = _sci_from_log10(log10_mult)

        # For the final value: when 1.1^n is astronomically larger than n,
        # additive is negligible, so final ≈ 1.1^n. We state it directly.
        final_str = multiplicative_str  # additive is negligible at this scale
        return additive, multiplicative_str, multiplicative_val, final_str

def print_row(level: int):
    additive, mult_str, mult_val, final_str = compute_components(level)
    # Show additive as "+X.xx x" style
    additive_str = _format_number(additive)
    print(f"{level:>6} | +{additive_str}x | (1.1^n)= {mult_str}x | final = {final_str}x")

def main():
    ap = argparse.ArgumentParser(description="Compute coin multiplier: additive + 1.1^level")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--max", type=int, help="Print rows for levels 0..MAX")
    g.add_argument("--level", type=int, help="Print just this level")
    args = ap.parse_args()

    print(" Level | Additive |       Multiplicative       |        Final")
    print("-------+----------+----------------------------+-------------------------")
    if args.level is not None:
        print_row(args.level)
    else:
        max_level = 50 if args.max is None else args.max
        for n in range(max_level + 1):
            print_row(n)

if __name__ == "__main__":
    main()
