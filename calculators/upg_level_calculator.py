def upgrade_cost(baseCost, upgLevel):
    """
    Compute the cost of an upgrade given:
      - baseCost: the base cost of the upgrade
      - upgLevel: the current upgrade level

    Formula:
      cost = baseCost × (1.20 + 0.04*numUpgEvolutions) ^ upgLevel
    where:
      numUpgEvolutions = upgLevel // 1000   (integer division)
    """

    # Determine how many evolutions have occurred
    numUpgEvolutions = upgLevel // 1000  # every 1000 levels adds one evolution

    # Compute the cost multiplier
    multiplier = 1.25 + 0.04 * numUpgEvolutions

    # Compute the final cost
    cost = baseCost * (multiplier ** upgLevel)

    return cost

print(upgrade_cost(10, 999))   # Before first evolution
print(upgrade_cost(100, 1000))  # Exactly at first evolution
print(upgrade_cost(100, 1001))  # After first evolution
print(upgrade_cost(100, 2000))  # Two evolutions (levels 2000+)
print(upgrade_cost(100, 2001))
