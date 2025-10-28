export const MERCHANT_DIALOGUES = {
  0: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'So you want to delve deeper within my shop, do you?', next: 'c1' },

      r_who:     { type: 'line', say: 'I am the Merchant.', next: 'c2' },
      r_where:   { type: 'line', say: 'The cove.',          next: 'c2' },
      r_confused:{ type: 'line', say: 'Ok.',                next: 'c2' },

      c1: { type: 'choice', options: [
        { label: 'Who are you?', to: 'r_who' },
        { label: 'Where am I?', to: 'r_where' },
        { label: 'I just clicked on this green button and now I’m confused.', to: 'r_confused' },
      ]},

      c2: { type: 'choice', options: [
        { label: 'What?', to: 'r2_what' }, 
        { label: 'That’s not helpful.', to: 'r2_ok' }, 
        { label: 'Ok.', to: 'r2_ok' }, 
      ]},

      r2_what: { type: 'line', say: 'What?', next: 'c3' },
      r2_ok:   { type: 'line', say: 'Ok.',   next: 'c3' },

      c3: { type: 'choice', options: [
        { label: 'What?', to: 'r2_what' },
        { label: 'That’s not helpful.', to: 'r2_ok' },
        { label: 'Goodbye.', to: 'end' },
      ]},
    }
  },

  1: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'Hello again.', next: 'c0' },

      c0: { type: 'choice', options: [
        { label: 'You never answered my questions.', to: 'm1a' },
        { label: 'Hello.', to: 'm1b' },
        { label: 'I am still very confused.', to: 'm1c' },
      ]},

      m1a: { type: 'line', say: 'Yes I did.', next: 'c1a' },
      m1b: { type: 'line', say: 'Hello.',    next: 'c1b' },
      m1c: { type: 'line', say: 'Ok.',       next: 'c1c' },

      c1a: { type: 'choice', options: [
        { label: 'No you didn’t.', to: 'm1a' },
        { label: 'Liar.',          to: 'm2a' },
        { label: 'Ok I guess you’re right.', to: 'm2b' },
      ]},

      c1b: { type: 'choice', options: [
        { label: 'You never answered my questions.', to: 'm1a' },
        { label: 'That does not help.',              to: 'm1c' },
        { label: 'Ok.',                              to: 'm2b' },
      ]},

      c1c: { type: 'choice', options: [
        { label: 'Yes.',  to: 'm2a' },
        { label: 'Hmm…',  to: 'm1c' },
        { label: 'Ok.',   to: 'm2b' },
      ]},

      m2a: { type: 'line', say: 'No.', next: 'c1c' },
      m2b: { type: 'line', say: 'Would you like some coins? Free of charge. You look like you could use some right now.', next: 'c2a' },

      c2a: { type: 'choice', options: [
        { label: 'What?',                to: 'm3a' },
        { label: 'No thank you.',        to: 'm3b' },
        { label: 'Give me the coins now.', to: 'end' },
      ]},

      m3a: { type: 'line', say: 'What?', next: 'c2a' },
      m3b: { type: 'line', say: 'Okay, no coins for you then.', next: 'c2b' },

      c2b: { type: 'choice', options: [
        { label: 'No wait, actually I want the coins. Give them to me now.', to: 'end' },
        { label: 'On second thought, maybe I do want the coins. Give them to me now.', to: 'end' },
        { label: 'Okay, bye, I don’t need your filthy coins anyway.', to: 'end_nr' },
      ]},
    }
  },
};
