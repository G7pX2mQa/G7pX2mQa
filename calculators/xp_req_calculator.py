import math

def xp_value_at_levels(max_level: int, base: int = 10, growth: float = 1.1, decade_jump: float = 2.5):
    values = [base]  # level 0
    v = base
    for lvl in range(1, max_level + 1):
        mult = growth
        # Apply the extra 2.5x when landing on levels 11, 21, 31, ...
        if lvl >= 11 and (lvl % 10 == 1):
            mult *= decade_jump
        v = math.floor(v * mult)
        values.append(v)
    return values

vals = xp_value_at_levels(201)
for lvl, v in enumerate(vals):
    print(f"Level {lvl:2d}: {v}")
