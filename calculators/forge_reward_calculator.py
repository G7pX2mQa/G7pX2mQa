import math
from typing import Union

Number = Union[int, float]

def compute_currency(
    coins: Number,
    normal_level: int,
    *,
    coin_scale: float = 100_000.0,
    base_multiplier: float = 10.0,
    two_power_base: float = 2.0,
    level_threshold: int = 31,
    level_step: int = 5,
    level_growth: float = 1.4,
    decade_growth: float = 1.15,
) -> int:
    """
    Compute currency using:
      floor( 10 * 2^(log10(coins/10000 if coins>0))
             * (1.4 ^ max(0, (NormalLevel - 30) / 5))
             * 1.15 ^ floor(log10(coins/10000 if coins>0)) )

    Rules/notes:
    - Returns 0 if normal_level < 30 or coins <= 0 (as you specified).
    - Uses floor at the very end, returning an int.
    - Keyword args let you tune constants if you iterate on balance later.

    Args:
        coins: Player coin count (can be large).
        normal_level: Player's normal level (int).
        coin_scale: Divides coins before log10 (default 10,000).
        base_multiplier: The leading constant (default 10).
        two_power_base: The base for the 2^(...) term (default 2).
        level_threshold: Level below which currency is 0 (default 30).
        level_step: Denominator in (level - threshold)/step (default 5).
        level_growth: Growth per step above threshold (default 1.4).
        decade_growth: Multiplier per log10 “decade” (default 1.15).

    Returns:
        int: The floored currency amount.
    """
    # Enforce the "no currency under level 30" rule and nonpositive coins.
    if normal_level < level_threshold or coins <= 0:
        return 0

    # Safe ratio for logs
    ratio = coins / coin_scale
    if ratio <= 0:
        return 0  # extra guard, though coins<=0 already handled

    # Precompute logs
    log10_ratio = math.log10(ratio)
    floor_log10_ratio = math.floor(log10_ratio)

    # Level-based multiplier: only counts above the threshold
    level_exponent = max(0.0, (normal_level - level_threshold) / float(level_step))
    level_multiplier = level_growth ** level_exponent

    # Coins-based multipliers
    coins_multiplier_smooth = two_power_base ** log10_ratio
    coins_multiplier_step = decade_growth ** floor_log10_ratio

    value = (
        base_multiplier
        * coins_multiplier_smooth
        * level_multiplier
        * coins_multiplier_step
    )

    return math.floor(value)

# coins, level
print(compute_currency(100000,31))