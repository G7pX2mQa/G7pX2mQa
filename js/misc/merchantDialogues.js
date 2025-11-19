export const MERCHANT_DIALOGUES = {
  0: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'So you want to delve deeper within my shop, do you?', next: 'c1' },

      r_who: { type: 'line', say: 'I am the Merchant.', next: 'c2' },
      r_where: { type: 'line', say: 'The cove.',          next: 'c2' },
      r_confused: { type: 'line', say: 'Okay.',                next: 'c2' },

      c1: { type: 'choice', options: [
        { label: 'Who are you?', to: 'r_who' },
        { label: 'Where am I?', to: 'r_where' },
        { label: 'I just clicked on this green button and now I’m confused.', to: 'r_confused' },
      ]},

      c2: { type: 'choice', options: [
        { label: 'What?', to: 'r2_what' }, 
        { label: 'That’s not helpful.', to: 'r2_okay' }, 
        { label: 'Okay.', to: 'r2_okay' }, 
      ]},

      r2_what: { type: 'line', say: 'What?', next: 'c3' },
      r2_okay:   { type: 'line', say: 'Okay.',   next: 'c3' },

      c3: { type: 'choice', options: [
        { label: 'What?', to: 'r2_what' },
        { label: 'That’s not helpful.', to: 'r2_okay' },
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
      m1c: { type: 'line', say: 'Okay.',       next: 'c1c' },

      c1a: { type: 'choice', options: [
        { label: 'No you didn’t.', to: 'm1a' },
        { label: 'Liar.',          to: 'm2a' },
        { label: 'Okay I guess you’re right.', to: 'm2b' },
      ]},

      c1b: { type: 'choice', options: [
        { label: 'You never answered my questions.', to: 'm1a' },
        { label: 'That does not help.',              to: 'm1c' },
        { label: 'Okay.',                              to: 'm2b' },
      ]},

      c1c: { type: 'choice', options: [
        { label: 'Yes.',  to: 'm2a' },
        { label: 'Hmm…',  to: 'm1c' },
        { label: 'Okay.',   to: 'm2b' },
      ]},

      m2a: { type: 'line', say: 'No.', next: 'c1c' },
      m2b: { type: 'line', say: 'Would you like some Coins? Free of charge. You look like you could use some right now.', next: 'c2a' },

      c2a: { type: 'choice', options: [
        { label: 'What?',                to: 'm3a' },
        { label: 'No.',        to: 'm3b' },
        { label: 'Give me the coins now.', to: 'end' },
      ]},

      m3a: { type: 'line', say: 'What?', next: 'c2a' },
      m3b: { type: 'line', say: 'Okay, no Coins for you then.', next: 'c2b' },

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
      n0: { type: 'line', say: 'I see you’ve unlocked the XP system.', next: 'c0' },

      c0: { type: 'choice', options: [
        { label: 'What does it do?',      to: 'm1a' },
        { label: 'What does that mean?',  to: 'm1b' },
        { label: 'Yes I did that.',       to: 'm1c' },
      ]},

      m1a: { type: 'line', say: 'The XP system is a powerful ancient mechanism, designed to allow rapid influx of coin-collecting power. Increasing your XP level grants you Books infused with my power, capable of great things.', next: 'c1a' },
      m1b: { type: 'line', say: 'It means you can grow passively stronger by collecting coins.', next: 'c1b' },
      m1c: { type: 'line', say: 'And do you know how the XP system works?', next: 'c1c' },

      c1a: { type: 'choice', options: [
        { label: 'This XP system, by whom was it designed, exactly?', to: 'm2b' },
        { label: 'What does that mean?',                               to: 'm1b' },
        { label: 'Okay.',                                              to: 'm2a' },
      ]},
      c1b: { type: 'choice', options: [
        { label: 'Can you explain in more detail?', to: 'm1a' },
        { label: 'Why?',                           to: 'm2c' },
        { label: 'Okay.',                          to: 'm2a' },
      ]},
      c1c: { type: 'choice', options: [
        { label: 'I have no idea.',              to: 'm1a' },
        { label: 'I don’t know the full details.', to: 'm1a' },
        { label: 'Yes.',                         to: 'm2a' },
      ]},

      m2a: { type: 'line', say: 'Would you like some Books, free of charge? They will help you accelerate your coin-collecting power.', next: 'c2a' },
      m2b: { type: 'line', say: 'I dunno.', next: 'c2b' },
      m2c: { type: 'line', say: 'Why not?', next: 'c2c' },
      m2d: { type: 'line', say: 'What?',    next: 'c2c' },
      m2e: { type: 'line', say: 'I’ve already told you, so you can increase your coin-collecting power.', next: 'c2d' },
      m2f: { type: 'line', say: 'Are you sure you don’t want free Books?', next: 'c3a' },

      c2a: { type: 'choice', options: [
        { label: 'No.',                               to: 'm2f' },
        { label: 'Why are you giving me all this free stuff?', to: 'm2e' },
        { label: 'Yeah, sure.',                       to: 'end' },
      ]},
      c2b: { type: 'choice', options: [
        { label: 'What?', to: 'm2d' },
        { label: 'Why not?',  to: 'm2c' },
        { label: '…',     to: 'm2a' },
      ]},
      c2c: { type: 'choice', options: [
        { label: '…', to: 'm2a' },
        { label: '…', to: 'm2a' },
        { label: '…', to: 'm2a' },
      ]},
      c2d: { type: 'choice', options: [
        { label: 'But why does that matter?',   to: 'm3a' },
        { label: 'But what does that mean?',    to: 'm3a' },
        { label: '…',                           to: 'm3a' },
      ]},

      m3a: { type: 'line', say: 'If you want free Books, then don’t ask further questions.', next: 'c3a' },

      c3a: { type: 'choice', options: [
        { label: 'Okay, actually give me the free stuff.',        to: 'end' },
        { label: 'Okay fine, I’ll take those books off your hands.', to: 'end' },
        { label: 'I don’t need your charity.',                    to: 'end_nr' },
      ]},
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

