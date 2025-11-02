export const MERCHANT_DIALOGUES = {
  0: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'So you want to delve deeper within my shop, do you?', next: 'c1' },

      r_who: { type: 'line', say: 'I am the Merchant.', next: 'c2' },
      r_where: { type: 'line', say: 'The cove.',          next: 'c2' },
      r_confused: { type: 'line', say: 'Ok.',                next: 'c2' },

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
  2: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'Ah, the XP system hums through the shelves now. I felt the unlock from here.', next: 'c0' },

      c0: { type: 'choice', options: [
        { label: 'What changes with XP?', to: 'r0' },
        { label: 'This sounds complicated.', to: 'r1' },
        { label: 'Do I get more coins?', to: 'r2' },
      ]},

      r0: { type: 'line', say: 'Levels will shape future stock. Each tier unlocks new questions and, eventually, new goods.', next: 'c1' },
      r1: { type: 'line', say: 'Growth is rarely simple. Earn XP, gather Books, and we will weave something grand.', next: 'c1' },
      r2: { type: 'line', say: 'Every level feeds coin value and nudges other systems awake. Keep the flow steady.', next: 'c1' },

      c1: { type: 'choice', options: [
        { label: 'Books?', to: 'r3' },
        { label: 'Future systems?', to: 'r4' },
        { label: 'I’ll get back to grinding.', to: 'end' },
      ]},

      r3: { type: 'line', say: 'Books will be a ledger of mastery. Placeholder for now, but save your questions.', next: 'c1' },
      r4: { type: 'line', say: 'Milestones. Unlocks. Entire conversations. XP is the key that opens each.', next: 'c1' },
    }
  },
  3: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'Level 999. I hoped to see it one day. Placeholder admiration intensifies.', next: 'c0' },

      c0: { type: 'choice', options: [
        { label: 'Was it worth it?', to: 'q0' },
        { label: 'What happens next?', to: 'q1' },
        { label: 'I need a break.', to: 'end' },
      ]},

      q0: { type: 'line', say: 'Only you can decide that. But the data you gathered will fuel upcoming secrets.', next: 'c1' },
      q1: { type: 'line', say: 'Beyond this? More systems, more bargains, and more reasons to climb. Placeholder, of course.', next: 'c1' },

      c1: { type: 'choice', options: [
        { label: 'Where are the rewards?', to: 'q2' },
        { label: 'I’ll keep going.', to: 'end' },
        { label: 'I need another hint.', to: 'q3' },
      ]},

      q2: { type: 'line', say: 'For now, take pride. The tangible prizes arrive in a future update.', next: 'c1' },
      q3: { type: 'line', say: 'Watch the Merchant tab. New dialogues will appear at milestones beyond this.', next: 'c1' },
    }
  },
};
