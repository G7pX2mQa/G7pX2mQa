import math

# -----------------------------
# Core BPS formula
# -----------------------------
def bps(level, B0, k):
    # Raw exponential growth
    value = B0 * math.exp(k * level)

    # Floor it
    value = math.floor(value)

    # Clamp to minimum of 1
    if value < 1:
        value = 1

    return value

# -----------------------------
# Run until overflow
# -----------------------------
if __name__ == "__main__":
    B0 = 1     # base production at level 0
    k  = 0.50    # growth constant

    print(f"Using B0 = {B0}, k = {k}\n")
    print("=== BPS Curve (every 10 levels, floored, min=1, scientific notation) ===")

    L = 0
    while True:
        value = bps(L, B0, k)

        # Scientific notation formatting
        sci = f"{value:.6e}"

        print(f"Level {L:3d} → BPS = {sci}")

        # Check for actual infinity in the raw exponential
        raw = B0 * 2.71828 ** (k * L)
        if math.isinf(raw):
            print("\nReached mathematical infinity. Stopping.")
            break

        L += 10
