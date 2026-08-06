// js/game/mutationColorPalettes.js

export const PALETTES = {
  default: ['#FFEB3B'],
  bronze: ['#cd7f32'],
  silver: ['#c0c0c0'],
  gold: ['#ffd700'],
  sapphire: ['#0f52ba'],
  emerald: ['#50c878'],
  ruby: ['#FF0033'],
  amethyst: ['#9966CC'],
  sunset: ['#FF69B4', '#8A2BE2'],
  void: ['#0a0010'],
  ethereal: ['#c4e4f7', '#5289ad'],
  earth: ['#8A612A', '#60441E'],
  air: ['#F0FFFF', '#87CEEB'],
  fire: ['#FF4500', '#FF8C00'],
  water: ['#006FAC', '#009CF2', '#33B6FF'],
  cookie: ['#6C3E1B', '#A56E3B', '#C99753'],
  pancake: ['#C99853', '#C46A1A', '#F6BB00'],
  watermelon: ['#8CE632', '#1E9638', '#126422'],
  pepperoni: ['#E44E30', '#FFD69A', '#F17A3C'],
  pizza: ['#6F3005', '#FFA500', '#FFFF00', '#FFA500', '#FFFF00'],
  donut: (function() {
    const br = '#B37933';
    const pi = '#FF3783';
    const sprinkles = ['#FF4B4B', '#FF872D', '#FFE96B', '#78E08F', '#63C0FF', '#FFFFFF'];
    const colors = [];
    for (const sprinkle of sprinkles) {
      colors.push(br, pi, sprinkle);
    }
    return colors;
  })(),
  glass: ['#1CB1E6', '#FFFFFF', '#EED48A'],
  diamond: ['#6EC9FF', '#3477B8', '#C3E5EA'],
  opal: ['#E6CFFF', '#C8F5F0', '#B0D3FF'],
  cosmic: ['#2EE4FF', '#2088FF', '#49FFCA', '#C42BFF'],
  prismatic: ['#FF0044', '#FF7C00', '#FFF85C', '#00FFAA', '#00E6FF', '#0044FF', '#A020F0', '#FF00FF']
};

export const TRAIL_MOD_TO_PALETTE = {
  5: 'silver', 2: 'bronze', 8: 'gold', 11: 'sapphire', 14: 'emerald', 17: 'ruby', 20: 'amethyst',
  23: 'sunset', 26: 'void', 29: 'ethereal', 32: 'earth', 35: 'air', 38: 'fire', 41: 'water',
  44: 'cookie', 47: 'pancake', 50: 'watermelon', 53: 'pepperoni', 56: 'pizza', 59: 'donut',
  62: 'glass', 65: 'diamond', 68: 'opal', 71: 'cosmic', 74: 'prismatic'
};

export const MAGNET_MOD_TO_PALETTE = {
  6: 'silver', 3: 'bronze', 9: 'gold', 12: 'sapphire', 15: 'emerald', 18: 'ruby', 21: 'amethyst',
  24: 'sunset', 27: 'void', 30: 'ethereal', 33: 'earth', 36: 'air', 39: 'fire', 42: 'water',
  45: 'cookie', 48: 'pancake', 51: 'watermelon', 54: 'pepperoni', 57: 'pizza', 60: 'donut',
  63: 'glass', 66: 'diamond', 69: 'opal', 72: 'cosmic', 75: 'prismatic'
};

export function injectMagnetStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ccc-magnet-dynamic-styles')) return;

  let css = '';
  for (const [name, colors] of Object.entries(PALETTES)) {
    if (colors.length === 1) {
      const color = colors[0];
      css += `
.magnet-indicator[data-palette="${name}"] {
  background-color: ${color}26;
  border: 2px solid ${color};
  box-shadow: 0 0 20px 4px ${color}f2, inset 0 0 36px ${color}c7;
}
`;
    } else {
      // Conic gradient style
      // We wrap the colors around by repeating the first color at the end for smooth loop
      const gradientColors = [...colors, colors[0]];
      const solidColors = gradientColors.join(', ');
      
      const alphaColors = gradientColors.map(c => c + '40').join(', ');

      css += `
.magnet-indicator[data-palette="${name}"] {
  --conic-solid: conic-gradient(from 0deg, ${solidColors});
  --conic-alpha: conic-gradient(from 0deg, ${alphaColors});
}
`;
    }
  }

  const styleEl = document.createElement('style');
  styleEl.id = 'ccc-magnet-dynamic-styles';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
}
