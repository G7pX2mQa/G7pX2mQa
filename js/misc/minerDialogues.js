export const MINER_DIALOGUES = {
  0: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'Who… Are… You..?', next: 'c0' },

      c0: {
        type: 'choice',
        options: [
          { label: 'Why do you ask?', to: 'm1a' },
          { label: 'Who are you?', to: 'm1b' },
          { label: 'I am <span style="color:#00e5ff">Player</span>.', to: 'm1c' }
        ]
      },

      m1a: {
        type: 'line',
        say: 'It has been so long… I never thought I would see another <span style="color:#00e5ff">Player</span> again…',
        next: 'c1a'
      },
      m1b: {
        type: 'line',
        say: 'Miner… That is what they have called me…',
        next: 'c1b'
      },
      m1c: {
        type: 'line',
        say: 'I never thought I’d see the day…',
        next: 'c1c'
      },

      c1a: {
        type: 'choice',
        options: [
          { label: 'What do you mean?', to: 'end' },
          { label: 'Why?', to: 'end' },
          { label: 'What?', to: 'end' }
        ]
      },
      c1b: {
        type: 'choice',
        options: [
          { label: 'What do you mean?', to: 'end' },
          { label: 'What?', to: 'end' },
          { label: 'Who?', to: 'end' }
        ]
      },
      c1c: {
        type: 'choice',
        options: [
          { label: 'What do you mean?', to: 'end' },
          { label: 'See what?', to: 'end' },
          { label: 'What?', to: 'end' }
        ]
      }
    }
  }
};
