export const MINER_DIALOGUES = {
  0: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'Miner dialogue placeholder', next: 'c0' },

      c0: { type: 'choice', options: [
        { label: '...', to: 'end' }
      ]}
    }
  }
};
