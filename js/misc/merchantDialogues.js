export const MERCHANT_DIALOGUES = {
  0: {
    start: 'n0',
    nodes: {
      n0: { type: 'line', say: 'So you want to delve deeper within my Shop, do you?', next: 'c1' },

      r_who: { type: 'line', say: 'I am the Merchant.', next: 'c2' },
      r_where: { type: 'line', say: 'The Cove.',          next: 'c2' },
      r_confused: { type: 'line', say: 'Okay.',                next: 'c3' },

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
      m1c: { type: 'line', say: 'Okay.',       next: 'c1e' },
	  m1d: { type: 'line', say: 'Fine.',       next: 'c1d' },

      c1a: { type: 'choice', options: [
        { label: 'No you didn’t.', to: 'm1a' },
        { label: 'Incorrect.',          to: 'm2a' },
        { label: 'Okay I guess you’re right.', to: 'm2b' },
      ]},

      c1b: { type: 'choice', options: [
        { label: 'You never answered my questions.', to: 'm1a' },
        { label: 'How are you?',              to: 'm1d' },
        { label: 'Okay.',                              to: 'm2b' },
      ]},

      c1c: { type: 'choice', options: [
        { label: 'Yes.',  to: 'm2a' },
        { label: 'Hmm…',  to: 'm1c' },
        { label: 'Okay.',   to: 'm2b' },
      ]},
	  
	  c1d: { type: 'choice', options: [
        { label: 'That\'s nice.',  to: 'm2b' },
        { label: 'Good.',  to: 'm2b' },
        { label: 'Okay.',   to: 'm2b' },
      ]},
	  c1e: { type: 'choice', options: [
        { label: '...',  to: 'm2b' },
        { label: '...',  to: 'm2b' },
        { label: '...',   to: 'm2b' },
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

      m1a: { type: 'line', say: 'Good things.', next: 'c1a' },
      m1b: { type: 'line', say: 'It means you are stronger now.', next: 'c1b' },
      m1c: { type: 'line', say: 'And do you know how the XP system works?', next: 'c1c' },
	  m1d: { type: 'line', say: 'You\'ll be fine you don\'t really need to know how it works anyway.', next: 'c1d' },
	  m1e: { type: 'line', say: 'No.', next: 'c1d' },

      c1a: { type: 'choice', options: [
        { label: 'Why does this thing even exist?', to: 'm2b' },
        { label: 'What does that mean?',                               to: 'm1b' },
        { label: 'Okay.',                                              to: 'm3a' },
      ]},
      c1b: { type: 'choice', options: [
        { label: 'Can you explain in more detail?', to: 'm1e' },
        { label: 'Why?',                           to: 'm2g' },
        { label: 'Okay.',                          to: 'm3a' },
      ]},
      c1c: { type: 'choice', options: [
        { label: 'I have no idea.',              to: 'm1d' },
        { label: 'I don’t know the full details.', to: 'm1d' },
        { label: 'Yes.',                         to: 'm3a' },
      ]},
	   c1d: { type: 'choice', options: [
        { label: '...',              to: 'm3a' },
        { label: '...', to: 'm3a' },
        { label: '...',                         to: 'm3a' },
      ]},
	  
      m2b: { type: 'line', say: 'I dunno.', next: 'c2b' },
      m2c: { type: 'line', say: 'Because I dunno.', next: 'c2c' },
      m2d: { type: 'line', say: 'What?',    next: 'c2c' },
      m2e: { type: 'line', say: 'I’ve already told you, so you can increase your Coin output.', next: 'c2d' },
      m2f: { type: 'line', say: 'Are you sure you don’t want free Books?', next: 'c3a' },
	  m2g: { type: 'line', say: 'You just are.', next: 'c2c' },

      c2a: { type: 'choice', options: [
	    { label: 'No.',                               to: 'm2f' },
		{ label: 'Why are you giving me all this free stuff?', to: 'm2e' },
		{ label: 'Yeah, sure.',                       to: 'end' },
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
	  c2d: { type: 'choice', options: [
        { label: '…', to: 'm3b' },
        { label: '…', to: 'm3b' },
        { label: '…', to: 'm3b' },
      ]},

      m3a: { type: 'line', say: 'Would you like some Books? Free of charge. They will help you accelerate your Coin output.', next: 'c2a' },
      m3b: { type: 'line', say: 'Let me ask again, do you want free Books?', next: 'c3b' },

      c3a: { type: 'choice', options: [
        { label: 'Okay, actually give me the free stuff.',        to: 'end' },
        { label: 'Okay fine, I’ll take those books off your hands.', to: 'end' },
        { label: 'I don’t need your charity.',                    to: 'end_nr' },
      ]},
	  c3b: { type: 'choice', options: [
        { label: 'Yes please.',        to: 'end' },
        { label: 'Sure.',                 to: 'end' },
        { label: 'No.',                    to: 'end_nr' },
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
      m1c: { type: 'line', say: 'What do you mean you forgot??',                                                            next: 'c3b' },

      c1a: { type: 'choice', options: [
        { label: 'Where did it come from?',                       to: 'm2a' },
        { label: 'How do I get more gold from it?',              to: 'm2b' },
        { label: 'What is the benefit of forging my coins?',     to: 'm2c' },
      ]},

      c1b: { type: 'choice', options: [
        { label: 'Why do they exist?',              to: 'm2d' },
        { label: 'What do mutations do for me?',    to: 'm2e' },
        { label: 'Why are they important at all?',  to: 'm2f' },
      ]},

      m2a: { type: 'line', say: 'I made it.', next: 'c2a' },
      m2b: { type: 'line', say: 'Increase your Coins and XP Level to boost the output of the Forge.', next: 'c2b' },
      m2c: { type: 'line', say: 'Trust me, it’ll pay off in the future.', next: 'c2c' },
      m2d: { type: 'line', say: 'They just do.', next: 'c3a' },
      m2e: { type: 'line', say: 'Something.', next: 'c2d' },
      m2f: { type: 'line', say: 'They just are.', next: 'c3a' },

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
        { label: 'Not helpful but alright.',                     to: 'm4a' },
        { label: 'Okay.',                                 to: 'm4a' },
      ]},

      m3a: { type: 'line', say: 'Nope. I lied.', next: 'c3a' },
      m3b: { type: 'line', say: 'Number goes up. You know how this works.', next: 'c3a' },
      m3c: { type: 'line', say: 'It just does.', next: 'c3a' },
      m3d: { type: 'line', say: 'Yes it did.', next: 'c3a' },
      m3e: { type: 'line', say: 'Trust in the process.', next: 'c3a' },
      m3f: { type: 'line', say: 'Just look at it.', next: 'c3a' },

      c3a: { type: 'choice', options: [
        { label: '…', to: 'm4a' },
        { label: '…', to: 'm4a' },
        { label: '…', to: 'm4a' },
      ]},
	  
	  c3b: { type: 'choice', options: [
        { label: '…', to: 'm4c' },
        { label: '…', to: 'm4c' },
        { label: '…', to: 'm4c' },
      ]},

      m4a: { type: 'line', say: 'Any more questions?', next: 'c4a' },
      m4b: { type: 'line', say: 'It just does.', next: 'c3a' },
      m4c: { type: 'line', say: 'Well you have to ask me something while you\'re here.', next: 'c4a' },

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
  4: {
  start: 'n0',
  nodes: {
    n0: { type: 'line', say: 'I’m sure you came to me to learn a few things about how my Magic works, is that correct?', next: 'c0' },

    c0: { type: 'choice', options: [
      { label: 'Yes, I’d like to know more about your magic.', to: 'm1a' },
      { label: 'Actually, I’m more interested in how automation works.', to: 'm1b' },
      { label: 'Nah just give me free stuff.', to: 'm1c' },
    ]},

    m1a: { type: 'line', say: 'What would you like to know?', next: 'c1a' },
    m1b: { type: 'line', say: 'What would you like to know?', next: 'c1b' },
    m1c: { type: 'line', say: 'Wow. Just wow.', next: 'c1c' },

    c1a: { type: 'choice', options: [
      { label: 'Why do you have magic powers?', to: 'm2a' },
      { label: 'Where did you get magic powers from?', to: 'm2b' },
      { label: 'If you have magic powers, why can’t you just summon all the coins in the world?', to: 'm2c' },
    ]},

    c1b: { type: 'choice', options: [
      { label: 'Why does it exist?',                    to: 'm2d' },
      { label: 'What kinds of things can be automated?', to: 'm2e' },
      { label: 'How is automation different from doing things manually?', to: 'm2f' },
    ]},

    c1c: { type: 'choice', options: [
      { label: 'What?', to: 'm2g' },
      { label: 'Come on, where’s the reward at?', to: 'm2g' },
      { label: 'Was it something I said?', to: 'm2h' },
    ]},

    m2a: { type: 'line', say: 'I just do.', next: 'c2a' },
    m2b: { type: 'line', say: 'I\'ve always had them.', next: 'c2b' },
    m2c: { type: 'line', say: 'Because Coins are just built different like that.', next: 'c2c' },
    m2d: { type: 'line', say: 'Because it’s necessary to speed up Coin collection.', next: 'c2d' },
    m2e: { type: 'line', say: 'Everything.', next: 'c2e' },
    m2f: { type: 'line', say: 'It’s just better. I don’t have to explain why.', next: 'c2f' },
    m2g: { type: 'line', say: 'Don’t you want to chat with me for a bit? Don’t you have some questions you want to ask me?', next: 'c2g' },
    m2h: { type: 'line', say: 'Yes.', next: 'c2h' },

    c2a: { type: 'choice', options: [
      { label: 'What?', to: 'm3a' },
      { label: 'Can you actually answer my question?', to: 'm3b' },
      { label: '…', to: 'm6a' },
    ]},

    c2b: { type: 'choice', options: [
      { label: 'How long have you had them?', to: 'm3c' },
      { label: 'What can your magic powers do?', to: 'm3d' },
      { label: 'Okay.', to: 'm6a' },
    ]},

    c2c: { type: 'choice', options: [
      { label: 'How so?', to: 'm3e' },
      { label: 'Your powers must be super weak then.', to: 'm5a' },
      { label: 'Understandable.', to: 'm6a' },
    ]},

    c2d: { type: 'choice', options: [
      { label: 'What if I just don’t buy any automation?', to: 'm3f' },
      { label: 'How?',                                     to: 'm3g' },
      { label: 'Okay.',                                    to: 'm6a' },
    ]},

    c2e: { type: 'choice', options: [
      { label: 'Could I even automate talking to you?', to: 'm3h' },
      { label: 'So like, eventually everything would be progressing on its own?', to: 'm3i' },
      { label: 'Okay.', to: 'm6a' },
    ]},

    c2f: { type: 'choice', options: [
      { label: 'Why should I buy automation if you can’t even explain why it’s better than doing things manually?', to: 'm3j' },
      { label: 'But I wanted an explanation.', to: 'm5a' },
      { label: 'Okay.', to: 'm6a' },
    ]},

    c2g: { type: 'choice', options: [
      { label: 'No.', to: 'm7b' },
      { label: 'Not really.', to: 'm7b' },
      { label: 'My bad.', to: 'm5a' },
    ]},

    c2h: { type: 'choice', options: [
      { label: '…', to: 'm6a' },
      { label: '…', to: 'm6a' },
      { label: 'Sorry, I just was in a hurry to get free stuff so I could get back to collecting coins.', to: 'm7a' },
    ]},

    m3a: { type: 'line', say: 'What?', next: 'c2a' },
    m3b: { type: 'line', say: 'I just did answer your question.', next: 'c3a' },
    m3c: { type: 'line', say: 'At least 3.', next: 'c3b' },
    m3d: { type: 'line', say: 'My Magic can do a few things.', next: 'c3c' },
    m3e: { type: 'line', say: 'They’re just built different.', next: 'c5a' },
    m3f: { type: 'line', say: 'Don’t.', next: 'c5a' },
    m3g: { type: 'line', say: 'Common sense.', next: 'c5a' },
    m3h: { type: 'line', say: 'Wow, that’s kind of hurtful. Also no.', next: 'c5a' },
    m3i: { type: 'line', say: 'Yes.', next: 'c3d' },
    m3j: { type: 'line', say: 'Because I said so, and I am always right.', next: 'c5a' },

    c3a: { type: 'choice', options: [
      { label: 'No you didn’t.', to: 'm4a' },
      { label: 'Why are you like this?', to: 'm4b' },
      { label: '…', to: 'm6a' },
    ]},

    c3b: { type: 'choice', options: [
      { label: '3… what?', to: 'm4c' },
      { label: 'Ah, I completely understand.', to: 'm6a' },
      { label: 'Okay.', to: 'm6a' },
    ]},

    c3c: { type: 'choice', options: [
      { label: 'Like…?', to: 'm4d' },
      { label: 'Understandable.', to: 'm6a' },
      { label: '…', to: 'm6a' },
    ]},

    c3d: { type: 'choice', options: [
      { label: 'Wouldn’t that get boring?', to: 'm4e' },
      { label: 'That sounds nice.', to: 'm6a' },
      { label: 'Okay.', to: 'm6a' },
    ]},

    m4a: { type: 'line', say: 'Yes I did.', next: 'c3a' },
    m4b: { type: 'line', say: 'Like what?', next: 'c4a' },
    m4c: { type: 'line', say: '3.', next: 'c5a' },
    m4d: { type: 'line', say: 'Okay you caught me, I’m actually a fraud, my Magic is fake, nothing is real, the Coins are made of plastic, the sky is a dome, my name’s not even Merchant it’s Jeff.', next: 'c4b' },
    m4e: { type: 'line', say: 'No.', next: 'c5a' },

    c4a: { type: 'choice', options: [
      { label: 'Are you trying to be annoying on purpose?', to: 'm5b' },
      { label: 'You’re not being helpful.', to: 'm5a' },
      { label: 'Nothing, nevermind…', to: 'm6a' },
    ]},

    c4b: { type: 'choice', options: [
      { label: '???', to: 'm6a' },
      { label: '???', to: 'm6a' },
      { label: '???', to: 'm6a' },
    ]},

    m5a: { type: 'line', say: 'Okay.', next: 'c5a' },
	m5b: { type: 'line', say: 'No.', next: 'c5a' },

    c5a: { type: 'choice', options: [
      { label: '…', to: 'm6a' },
      { label: '…', to: 'm6a' },
      { label: '…', to: 'm6a' },
    ]},

    m6a: { type: 'line', say: 'Anything else you’d like to know?', next: 'c6a' },

    c6a: { type: 'choice', options: [
      { label: 'Tell me some more stuff about how your magic works.', to: 'm1a' },
      { label: 'Tell me some more stuff about how automation works.', to: 'm1b' },
      { label: 'Do you have any goodies for me?', to: 'm7a' },
    ]},

    m7a: { type: 'line', say: '10 Magic, take it or leave it.', next: 'c7a' },
    m7b: { type: 'line', say: 'Okay, now you’re just being rude. Don’t expect to get anything for free if you’re rude.', next: 'c7b' },

    c7a: { type: 'choice', options: [
      { label: 'Hmm, a bit too low for my taste.', to: 'm7b' },
      { label: 'I would’ve liked more, but I’ll take it.', to: 'end' },
      { label: 'I’ll take it.', to: 'end' },
    ]},

    c7b: { type: 'choice', options: [
      { label: '…', to: 'end_nr' },
      { label: '…', to: 'end_nr' },
      { label: '…', to: 'end_nr' },
    ]},
    }
  },
};
