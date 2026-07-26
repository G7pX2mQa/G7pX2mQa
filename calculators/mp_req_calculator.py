import math

# =========================
# 1) Base exponent E0(t): matches early tiers you liked, then a gentle kicker
#    TP_base(t) = 10 ** E0(t)
a = -0.0022175354763501742
b =  0.20449967884058884
c =  2.016778189084622

t0_kicker = 10                      # where the base late-game kicker starts
p_kicker  = 1.6418337930413576      # curvature of base late ramp
d_kicker  = 0.20418426693226513     # strength of base late ramp

def E0(t: int) -> float:
    late = max(0, t - t0_kicker)
    return a * t * t + b * t + c + d_kicker * (late ** p_kicker)

# =========================
# 2) Self-exponentiation schedule P(t): multiplies the EXPONENT
#    Final(t) = (TP_base(t)) ** P(t)  ->  log10(Final) = P(t) * E0(t)
t0_power = 10   # tiers <= this use P(t)=1 (no exponentiation yet)
T_anchor = 60   # target tier we want to pin a power at
P_target = 10.0 # "at least to the power of ten" at Tier 60
eta      = 1.12 # exponential rise speed of P(t) after t0_power (tweakable)

# Solve gamma so that P(T_anchor) = P_target exactly
gamma = (P_target - 1.0) / (eta ** (T_anchor - t0_power) - 1.0)

def P(t: int) -> float:
    if t <= t0_power:
        return 1.0
    return 1.0 + gamma * (eta ** (t - t0_power) - 1.0)

# =========================
# 3) Pretty-print helpers (no huge numbers constructed)
def sci_from_log10(log10_value: float, mantissa: float = 1.0) -> str:
    """Format mantissa * 10^(log10_value) as 'm.eX'."""
    int_exp = math.floor(log10_value)
    frac = log10_value - int_exp
    m = mantissa * (10 ** frac)
    if m >= 10:
        m /= 10
        int_exp += 1
    return f"{m:.3f}e{int_exp}"

# =========================
# 4) Quantization: floor(value/100)*100 for values with <= 18 significant digits
SIG_DIGIT_LIMIT = 18  # skip quantization when digits > 18

def quantize_to_hundreds_log10(E_log10: float) -> float:
    """
    Given log10(value), return log10( floor(value/100)*100 ), but only if value has
    <= SIG_DIGIT_LIMIT significant digits (i.e., floor(E)+1 <= limit). Otherwise unchanged.
    """
    int_exp = math.floor(E_log10)    # digits = int_exp + 1 for value >= 1
    if int_exp + 1 > SIG_DIGIT_LIMIT:
        return E_log10  # skip for huge values

    # Compute exact-ish value using integers for small magnitudes:
    # We only need to handle up to ~1e18 safely—well within Python int range.
    # Convert to integer cents of hundreds: floor(value/100)
    value = 10 ** E_log10                  # float is fine at small scales
    q = math.floor(value / 100.0) * 100.0  # snap down to nearest 100
    if q <= 0:
        q = 100.0  # safety (shouldn't happen given our tiers)
    return math.log10(q)

# =========================
# 5) Report: Base vs Final (quantized Final)
max_tier = 60
print(f"{'Tier':<5}{'Base TP':>16}{'P(t)':>8}{'Final TP (q=100)':>20}{'x vs prev (Final)':>20}")
print("-" * 80)
prev_E_final = None
for t in range(1, max_tier + 1):
    E_base   = E0(t)
    E_final  = P(t) * E_base              # exponent-multiplied requirement
    E_finalQ = quantize_to_hundreds_log10(E_final)  # snapped for small values

    base_s   = sci_from_log10(E_base)
    final_s  = sci_from_log10(E_finalQ)

    if prev_E_final is None:
        ratio = "—"
    else:
        dE = E_finalQ - prev_E_final
        ratio_val = 10 ** dE
        ratio = f"{ratio_val:.2f}x" if ratio_val < 1e6 else f"~1e{dE:.2f}"

    print(f"{t:<5}{base_s:>16}{P(t):>8.2f}{final_s:>20}{ratio:>20}")
    prev_E_final = E_finalQ

# --- Optional sanity: early tiers after quantization
# for t in [1,2,3,4,5]:
#     val = 10 ** quantize_to_hundreds_log10(P(t)*E0(t))
#     print(t, int(val))
