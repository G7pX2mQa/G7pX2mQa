export const MAP_NODES = [
    { id: 'cove', areaKey: 'STARTER_COVE', name: 'The Cove', icon: 'img/currencies/coin/coin_plus_base.webp', top: '21%', left: '50%', defaultLocked: false },
    { id: 'cavern', areaKey: 'UNDERWATER_CAVERN', name: 'Underwater Cavern', icon: 'img/currencies/scrap/scrap_plus_base.webp', top: '36%', left: '75%', defaultLocked: true, previousNodeId: 'cove' },
    { id: 'coral', areaKey: null, name: 'Coral Reef', icon: 'img/misc/mysterious_plus_base.webp', top: '51%', left: '25%', defaultLocked: true },
    { id: 'depths', areaKey: null, name: 'Deep Depths', icon: 'img/misc/mysterious_plus_base.webp', top: '85%', left: '50%', defaultLocked: true }
];