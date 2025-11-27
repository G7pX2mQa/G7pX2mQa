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

      m1a: { type: 'line', say: 'The XP system is a powerful ancient mechanism, allowing for rapid influx of Coin output. Increasing your XP Level grants you Books infused with my power, capable of great things.', next: 'c1a' },
      m1b: { type: 'line', say: 'It means you can grow passively stronger by collecting coins.', next: 'c1b' },
      m1c: { type: 'line', say: 'And do you know how the XP system works?', next: 'c1c' },

      c1a: { type: 'choice', options: [
        { label: 'Why does this thing even exist?', to: 'm2b' },
        { label: 'What does that mean?',                               to: 'm1b' },
        { label: 'Okay.',                                              to: 'm3a' },
      ]},
      c1b: { type: 'choice', options: [
        { label: 'Can you explain in more detail?', to: 'm1a' },
        { label: 'Why?',                           to: 'm2c' },
        { label: 'Okay.',                          to: 'm3a' },
      ]},
      c1c: { type: 'choice', options: [
        { label: 'I have no idea.',              to: 'm1a' },
        { label: 'I don’t know the full details.', to: 'm1a' },
        { label: 'Yes.',                         to: 'm3a' },
      ]},
	  
      m2b: { type: 'line', say: 'I dunno.', next: 'c2b' },
      m2c: { type: 'line', say: 'Because I dunno.', next: 'c2c' },
      m2d: { type: 'line', say: 'What?',    next: 'c2c' },
      m2e: { type: 'line', say: 'I’ve already told you, so you can increase your Coin output.', next: 'c2c' },
      m2f: { type: 'line', say: 'Are you sure you don’t want free Books?', next: 'c3a' },

      c2a: { type: 'choice', options: [
        { label: 'Yeah, sure.',                       to: 'end' },
		{ label: 'Why are you giving me all this free stuff?', to: 'm2e' },
        { label: 'No.',                               to: 'm2f' },
      ]},
      c2b: { type: 'choice', options: [
        { label: 'What?', to: 'm2d' },
        { label: 'Why not?',  to: 'm2c' },
        { label: '…',     to: 'm3a' },
      ]},
      c2c: { type: 'choice', options: [
        { label: '…', to: 'm3a' },
        { label: '…', to: 'm3a' },
        { label: '…', to: 'm3a' },
      ]},

      m3a: { type: 'line', say: 'Would you like some Books, free of charge? They will help you accelerate your Coin output.', next: 'c2a' },

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
      n0:  { type: 'line', say: 'What do you want now?', next: 'c0' },

      c0:  { type: 'choice', options: [
        { label: 'I’d like to ask some questions about how the forge works.',     to: 'm1a' },
        { label: 'I’d like to ask some questions about how mutations work.',      to: 'm1b' },
        { label: 'Oh, um, I forgot.',                                             to: 'm1c' },
      ]},

      m1a: { type: 'line', say: 'Sure, ask me anything about the Forge and I will answer.',     next: 'c1a' },
      m1b: { type: 'line', say: 'Sure, ask me anything about Mutations and I will answer.',     next: 'c1b' },
      m1c: { type: 'line', say: '…',                                                            next: 'c3a' },

      c1a: { type: 'choice', options: [
        { label: 'Where did it come from?',                       to: 'm2a' },
        { label: 'How do I get more gold from it?',              to: 'm2b' },
        { label: 'What is the benefit of forging my coins?',     to: 'm2c' },
      ]},

      c1b: { type: 'choice', options: [
        { label: 'Why do they exist?',              to: 'm2d' },
        { label: 'What do mutations do for me?',    to: 'm2e' },
        { label: 'Why are they important at all?',  to: 'm2e' },
      ]},

      m2a: { type: 'line', say: 'I made it.', next: 'c2a' },
      m2b: { type: 'line', say: 'Increase your Coins and XP Level to boost the output of the Forge.', next: 'c2b' },
      m2c: { type: 'line', say: 'Trust me, it’ll pay off in the future.', next: 'c2c' },
      m2d: { type: 'line', say: 'They just do.', next: 'c3a' },
      m2e: { type: 'line', say: 'Earn double Coin and XP output for each level of Mutation applied to a Coin.', next: 'c2d' },

      c2a: { type: 'choice', options: [
        { label: 'Really?', to: 'm3a' },
        { label: 'Wow.',    to: 'm4a' },
        { label: 'Okay.',   to: 'm4a' },
      ]},

      c2b: { type: 'choice', options: [
        { label: 'What does “increase” mean?', to: 'm3b' },
        { label: 'Why does it work like that?', to: 'm3c' },
        { label: 'Okay.',                       to: 'm4a' },
      ]},

      c2c: { type: 'choice', options: [
        { label: 'That didn’t really answer my question.', to: 'm3d' },
        { label: 'But how can you prove that?',            to: 'm3e' },
        { label: 'Okay.',                                  to: 'm4a' },
      ]},

      c2d: { type: 'choice', options: [
        { label: 'How will I know if a coin is mutated?', to: 'm3f' },
        { label: 'That sounds cool.',                     to: 'm4a' },
        { label: 'Okay.',                                 to: 'm4a' },
      ]},

      m3a: { type: 'line', say: 'Nope. I lied.', next: 'c3a' },
      m3b: { type: 'line', say: 'Number goes up. You know how this works.', next: 'c3a' },
      m3c: { type: 'line', say: 'It just does.', next: 'c3a' },
      m3d: { type: 'line', say: 'Yes it did.', next: 'c3a' },
      m3e: { type: 'line', say: 'Trust in the process.', next: 'c3a' },
      m3f: { type: 'line', say: 'Each new mutation applied to a coin alters its appearance. It could be argued that each mutation is more visually striking than the previous.', next: 'c3b' },

      c3a: { type: 'choice', options: [
        { label: '…', to: 'm4a' },
        { label: '…', to: 'm4a' },
        { label: '…', to: 'm4a' },
      ]},

      c3b: { type: 'choice', options: [
        { label: 'Why does it work like that?', to: 'm4b' },
        { label: 'Cool.',                       to: 'm4a' },
        { label: 'Okay.',                       to: 'm4a' },
      ]},

      m4a: { type: 'line', say: 'Any more questions?', next: 'c4a' },
      m4b: { type: 'line', say: 'Because it just does.', next: 'c3a' },

      c4a: { type: 'choice', options: [
        { label: 'I’d like to learn more about the forge.',     to: 'm1a' },
        { label: 'I’d like to learn more about mutations.',     to: 'm1b' },
        { label: 'I think I’m good.',                           to: 'm5a' },
      ]},

      m5a: { type: 'line', say: 'Here, have some Gold. I’m not even going to let you decline my gift.', next: 'c5a' },

      c5a: { type: 'choice', options: [
        { label: 'Oh, cool, thanks for the free stuff.',      to: 'end' },
        { label: 'Okay, I’ll put this gold to good use.',     to: 'end' },
        { label: '…',                                         to: 'end' },
      ]},
    }
  },
};
