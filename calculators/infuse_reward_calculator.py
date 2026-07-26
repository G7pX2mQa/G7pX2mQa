import math
from typing import Union

Number = Union[int, float]

# -----------------------------
#  Infuse (Magic) Scaling Knobs
# -----------------------------
COIN_SCALE  = 1e12       # new coin anchor (your request)
MP_SCALE    = 10_000.0   # MP increases in chunks of 10k
SMOOTH_BASE = 1.5        # gentle smooth coin scaling
STEP_BASE   = 1.03       # gentle decade bumps
MP_GROWTH   = 2.0        # MP is dominant but not explosive

# -----------------------------
#  Anchor target:
#  You want Magic = 10 at:
#      coins = 1e12
#      MP    = 10,000
# -----------------------------
ANCHOR_COINS = 1e13
ANCHOR_MP = 10_000
ANCHOR_TARGET_MAGIC = 10.0


def _calibrate_multiplier() -> float:
    """Compute BASE so that the anchor point yields exactly 10 Magic."""
    ratio = ANCHOR_COINS / COIN_SCALE
    log10_ratio = math.log10(ratio)

    coin_smooth = SMOOTH_BASE ** log10_ratio
    coin_step   = STEP_BASE ** math.floor(log10_ratio)

    mp_ratio = max(1.0, ANCHOR_MP / MP_SCALE)
    mp_mult  = MP_GROWTH ** (math.log10(mp_ratio))

    denom = coin_smooth * coin_step * mp_mult
    return ANCHOR_TARGET_MAGIC / denom


BASE_MULTIPLIER = _calibrate_multiplier()


def compute_magic(coins: Number, mp_progress: Number) -> int:
    if coins <= 0 or mp_progress <= 0:
        return 0

    # ---- coin contribution ----
    ratio = coins / COIN_SCALE
    if ratio <= 0:
        return 0

    log10_ratio = math.log10(ratio)
    coin_smooth = SMOOTH_BASE ** log10_ratio
    coin_step   = STEP_BASE ** math.floor(log10_ratio)

    # ---- MP contribution ----
    mp_ratio = max(1.0, mp_progress / MP_SCALE)
    mp_mult  = MP_GROWTH ** (math.log10(mp_ratio))

    # Final combined value
    value = BASE_MULTIPLIER * coin_smooth * coin_step * mp_mult
    return math.floor(value + 1e-9)


# quick test
if __name__ == "__main__":
    print(compute_magic(1e13, 10_000))
