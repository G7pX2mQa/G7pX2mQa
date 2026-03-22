# Fake Text Stroke (FTS) Explanation

In this game, "Fake Text Stroke" (FTS) is a technique used to provide text outline effects for players on mobile devices or touch screens.

## Why is FTS used?

While standard CSS properties like `-webkit-text-stroke` and `text-stroke` work well on desktop browsers, they can sometimes be buggy or render incorrectly on certain mobile browsers. To ensure that text remains legible and maintains the intended visual style for mobile players, we use a fallback method known as Fake Text Stroke.

## How it works

The game uses CSS media queries targeting touch-enabled devices (`@media (pointer: coarse)`). When a touch device is detected, the standard text stroke is disabled, and a multi-directional CSS `text-shadow` is applied to simulate the stroke effect.

1. **Disabling Standard Stroke:**
   For mobile devices, `-webkit-text-stroke` and `text-stroke` are set to `0` (often using `!important` to override desktop styles). Sometimes `-webkit-text-fill-color` is also adjusted.

2. **Applying Fake Stroke via `text-shadow`:**
   We use multiple, closely positioned text shadows in various directions (up, down, left, right, and diagonals) to create a solid outline around the text. 

### Example Implementation

In the game's CSS (e.g., `css/ui/hud.css` or `css/core/components_menu.css`), the implementation looks similar to the following:

```css
/* Standard crisp stroke for desktop */
.game-text {
  -webkit-text-stroke: 1px #000;
  text-stroke: 1px #000;
}

/* Smoother fake stroke for mobile (touch devices) */
@media (pointer: coarse) {
  .game-text {
    /* Disable the buggy webkit stroke */
    -webkit-text-stroke: 0 !important;
    text-stroke: 0 !important;
    
    /* Simulate stroke with multi-directional shadows */
    text-shadow:
      0     0.5px 0 #000,   0    -0.5px 0 #000,
      0.5px 0     0 #000,  -0.5px 0     0 #000,
      0.5px 0.5px 0 #000,   0.5px -0.5px 0 #000,
     -0.5px 0.5px 0 #000,  -0.5px -0.5px 0 #000;
  }
}
```

By offsetting the shadow by small fractional pixel amounts (e.g., `0.5px` or `1px`), the text appears to have a continuous solid outline, providing a high-quality visual experience similar to `-webkit-text-stroke` without the associated mobile rendering issues.