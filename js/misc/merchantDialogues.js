import { IS_MOBILE } from "../util/platformChecker.js";

export const MERCHANT_DIALOGUES = {
    0: {
        start: "n0",
        nodes: {
            n0: { type: "line", say: "So you want to delve deeper within my Shop, do you?", next: "c1" },

            r_who: { type: "line", say: "I am the Merchant.", next: "c2" },
            r_where: { type: "line", say: "The Cove.", next: "c2" },
            r_confused: { type: "line", say: "Okay.", next: "c3" },

            c1: {
                type: "choice",
                options: [
                    { label: "Who are you?", to: "r_who" },
                    { label: "Where am I?", to: "r_where" },
                    { label: IS_MOBILE ? "I just tapped this green button and now I'm confused." : "I just clicked this green button and now I'm confused.", to: "r_confused" },
                ],
            },

            c2: {
                type: "choice",
                options: [
                    { label: "What?", to: "r2_what" },
                    { label: "That’s not helpful.", to: "r2_okay" },
                    { label: "Okay.", to: "r2_okay" },
                ],
            },

            r2_what: { type: "line", say: "What?", next: "c3" },
            r2_okay: { type: "line", say: "Okay.", next: "c3" },

            c3: {
                type: "choice",
                options: [
                    { label: "What?", to: "r2_what" },
                    { label: "That’s not helpful.", to: "r2_okay" },
                    { label: "Goodbye.", to: "end" },
                ],
            },
        },
    },
    1: {
        start: "n0",
        nodes: {
            n0: { type: "line", say: "Hello again.", next: "c0" },

            c0: {
                type: "choice",
                options: [
                    { label: "Hello.", to: "m1b" },
                    { label: "placeholder text", to: "m1a" },
                    { label: "I'm still very confused.", to: "m1c" },
                ],
            },

            m1a: { type: "line", say: "placeholder text", next: "indeterminate" },
            m1b: { type: "line", say: "Hello.", next: "c1b" },
            m1c: { type: "line", say: "Okay.", next: "c1e" },
            m1d: { type: "line", say: "Fine.", next: "c1d" },

            c1a: {
                type: "choice",
                options: [
                    { label: "No you didn’t.", to: "m1a" },
                    { label: "Incorrect.", to: "m2a" },
                    { label: "Okay I guess you’re right.", to: "m2b" },
                ],
            },

            c1b: {
                type: "choice",
                options: [
                    { label: "placeholder text", to: "m1a" },
                    { label: "How are you?", to: "m1d" },
                    { label: "Okay.", to: "m2b" },
                ],
            },

            c1c: {
                type: "choice",
                options: [
                    { label: "Yes.", to: "m2a" },
                    { label: "Hmm...", to: "m1c" },
                    { label: "Okay.", to: "m2b" },
                ],
            },

            c1d: {
                type: "choice",
                options: [
                    { label: "That's nice.", to: "m2b" },
                    { label: "Good.", to: "m2b" },
                    { label: "Okay.", to: "m2b" },
                ],
            },
            c1e: {
                type: "choice",
                options: [
                    { label: "What?", to: "m2b" },
                    { label: "This isn't helpful.", to: "m2b" },
                    { label: "...", to: "m2b" },
                ],
            },

            m2a: { type: "line", say: "No.", next: "c1c" },
            m2b: {
                type: "line",
                say: "Would you like some Coins? Free of charge. You look like you could use some right now.",
                next: "c2a",
            },

            c2a: {
                type: "choice",
                options: [
                    { label: "What?", to: "m3a" },
                    { label: "No.", to: "m3b" },
                    { label: "Give me the coins now.", to: "end" },
                ],
            },

            m3a: { type: "line", say: "What?", next: "c2a" },
            m3b: { type: "line", say: "Okay, no Coins for you then.", next: "c2b" },

            c2b: {
                type: "choice",
                options: [
                    { label: "No wait, actually I want the coins. Give them to me now.", to: "end" },
                    { label: "On second thought, maybe I do want the coins. Give them to me now.", to: "end" },
                    { label: "Okay, bye, I don’t need your filthy coins anyway.", to: "end_nr" },
                ],
            },
        },
    },
    2: {
        start: "n0",
        nodes: {
            n0: { type: "line", say: "I see you’ve unlocked the XP system.", next: "c0" },

            c0: {
                type: "choice",
                options: [
                    { label: "What does it do?", to: "m1a" },
                    { label: "What does that mean?", to: "m1b" },
                    { label: "Yes I did that.", to: "m1c" },
                ],
            },

            m1a: { type: "line", say: "Good things.", next: "c1a" },
            m1b: { type: "line", say: "It means something.", next: "c1b" },
            m1c: { type: "line", say: "And do you know how the XP system works?", next: "c1c" },
            m1d: {
                type: "line",
                say: "You'll be fine, you don't really need to know how it works anyway.",
                next: "c1d",
            },
            m1e: { type: "line", say: "No.", next: "c1d" },

            c1a: {
                type: "choice",
                options: [
                    { label: "Why does this thing even exist?", to: "m2b" },
                    { label: "What does that mean?", to: "m1b" },
                    { label: "Okay.", to: "m3a" },
                ],
            },
            c1b: {
                type: "choice",
                options: [
                    { label: "Can you explain in more detail?", to: "m1e" },
                    { label: "What?", to: "m2g" },
                    { label: "Okay.", to: "m3a" },
                ],
            },
            c1c: {
                type: "choice",
                options: [
                    { label: "I have no idea.", to: "m1d" },
                    { label: "I don’t know the full details.", to: "m1d" },
                    { label: "Yes.", to: "m3a" },
                ],
            },
            c1d: {
                type: "choice",
                options: [
                    { label: "...", to: "m3a" },
                    { label: "...", to: "m3a" },
                    { label: "...", to: "m3a" },
                ],
            },

            m2b: { type: "line", say: "I dunno.", next: "c2b" },
            m2c: { type: "line", say: "Because I dunno.", next: "c2c" },
            m2d: { type: "line", say: "What?", next: "c2c" },
            m2e: { type: "line", say: "So you can increase your Coin output.", next: "c2d" },
            m2f: { type: "line", say: "Are you sure you don’t want free Books?", next: "c3a" },
            m2g: { type: "line", say: "What?", next: "c2c" },

            c2a: {
                type: "choice",
                options: [
                    { label: "No.", to: "m2f" },
                    { label: "Why are you giving me all this free stuff?", to: "m2e" },
                    { label: "Yeah, sure.", to: "end" },
                ],
            },
            c2b: {
                type: "choice",
                options: [
                    { label: "What?", to: "m2d" },
                    { label: "Why not?", to: "m2c" },
                    { label: "...", to: "m3a" },
                ],
            },
            c2c: {
                type: "choice",
                options: [
                    { label: "...", to: "m3a" },
                    { label: "...", to: "m3a" },
                    { label: "...", to: "m3a" },
                ],
            },
            c2d: {
                type: "choice",
                options: [
                    { label: "...", to: "m3b" },
                    { label: "...", to: "m3b" },
                    { label: "...", to: "m3b" },
                ],
            },

            m3a: {
                type: "line",
                say: "Would you like some Books? Free of charge. They will help you accelerate your Coin output.",
                next: "c2a",
            },
            m3b: { type: "line", say: "Let me ask again, do you want free Books?", next: "c3b" },

            c3a: {
                type: "choice",
                options: [
                    { label: "Okay, actually give me the free stuff.", to: "end" },
                    { label: "Okay fine, I’ll take those books off your hands.", to: "end" },
                    { label: "I don’t need your charity.", to: "end_nr" },
                ],
            },
            c3b: {
                type: "choice",
                options: [
                    { label: "Yes please.", to: "end" },
                    { label: "Sure.", to: "end" },
                    { label: "No.", to: "end_nr" },
                ],
            },
        },
    },
    3: {
        start: "n0",
        nodes: {
            n0: { type: "line", say: "What would you like to discuss now?", next: "c0" },

            c0: {
                type: "choice",
                options: [
                    { label: "I’d like to ask some questions about how the forge works.", to: "m1a" },
                    { label: "I’d like to ask some questions about how mutations work.", to: "m1b" },
                    { label: "Oh, um, I forgot.", to: "m1c" },
                ],
            },

            m1a: { type: "line", say: "Sure, ask me anything about the Forge and I will answer.", next: "c1a" },
            m1b: { type: "line", say: "Sure, ask me anything about Mutations and I will answer.", next: "c1b" },
            m1c: { type: "line", say: "What do you mean you forgot??", next: "c3b" },

            c1a: {
                type: "choice",
                options: [
                    { label: "Where did it come from?", to: "m2a" },
                    { label: "How do I get more gold from it?", to: "m2b" },
                    { label: "What is the benefit of forging my coins?", to: "m2c" },
                ],
            },

            c1b: {
                type: "choice",
                options: [
                    { label: "Why do they exist?", to: "m2d" },
                    { label: "What do mutations do for me?", to: "m2e" },
                    { label: "Why are they important at all?", to: "m2f" },
                ],
            },

            m2a: { type: "line", say: "I made it.", next: "c2a" },
            m2b: {
                type: "line",
                say: "Increase your Coins and XP Level to boost the output of the Forge.",
                next: "c2b",
            },
            m2c: { type: "line", say: "Trust me, it’ll pay off in the future.", next: "c2c" },
            m2d: { type: "line", say: "They just do.", next: "c3a" },
            m2e: { type: "line", say: "Something.", next: "c2d" },
            m2f: { type: "line", say: "They just are.", next: "c3a" },

            c2a: {
                type: "choice",
                options: [
                    { label: "Really?", to: "m3a" },
                    { label: "Wow.", to: "m4a" },
                    { label: "Okay.", to: "m4a" },
                ],
            },

            c2b: {
                type: "choice",
                options: [
                    { label: "Why do I need to do this in the first place?", to: "m3b" },
                    { label: "Why does it work like that?", to: "m3c" },
                    { label: "Okay.", to: "m4a" },
                ],
            },

            c2c: {
                type: "choice",
                options: [
                    { label: "That didn’t really answer my question.", to: "m3d" },
                    { label: "But how can you prove that?", to: "m3e" },
                    { label: "Okay.", to: "m4a" },
                ],
            },

            c2d: {
                type: "choice",
                options: [
                    { label: "How will I know if a coin is mutated?", to: "m3f" },
                    { label: "Not helpful but alright.", to: "m4a" },
                    { label: "Okay.", to: "m4a" },
                ],
            },

            m3a: { type: "line", say: "Nope. I lied.", next: "c3a" },
            m3b: { type: "line", say: "Number goes up. You know how this works.", next: "c3a" },
            m3c: { type: "line", say: "It just does.", next: "c3a" },
            m3d: { type: "line", say: "Yes it did.", next: "c3a" },
            m3e: { type: "line", say: "Trust in the process.", next: "c3a" },
            m3f: { type: "line", say: "Just look at it.", next: "c3a" },

            c3a: {
                type: "choice",
                options: [
                    { label: "...", to: "m4a" },
                    { label: "...", to: "m4a" },
                    { label: "...", to: "m4a" },
                ],
            },

            c3b: {
                type: "choice",
                options: [
                    { label: "...", to: "m4b" },
                    { label: "...", to: "m4b" },
                    { label: "...", to: "m4b" },
                ],
            },

            m4a: { type: "line", say: "Any more questions?", next: "c4a" },
            m4b: { type: "line", say: "Well you have to ask me something while you're here.", next: "c4a" },

            c4a: {
                type: "choice",
                options: [
                    { label: "I’d like to learn more about the forge.", to: "m1a" },
                    { label: "I’d like to learn more about mutations.", to: "m1b" },
                    { label: "I think I’m good.", to: "m5a" },
                ],
            },

            m5a: {
                type: "line",
                say: "Here, have some Gold. I’m not even going to let you decline my gift.",
                next: "c5a",
            },

            c5a: {
                type: "choice",
                options: [
                    { label: "Oh, cool, thanks for the free stuff.", to: "end" },
                    { label: "Okay, I’ll put this gold to good use.", to: "end" },
                    { label: "...", to: "end" },
                ],
            },
        },
    },
    4: {
        start: "n0",
        nodes: {
            n0: {
                type: "line",
                say: "I’m sure you came to me to learn a few things about how my Magic works, is that correct?",
                next: "c0",
            },

            c0: {
                type: "choice",
                options: [
                    { label: "Yes, I’d like to know more about your magic.", to: "m1a" },
                    { label: "Actually, I’m more interested in how automation works.", to: "m1b" },
                    { label: "Nah just give me free stuff.", to: "m1c" },
                ],
            },

            m1a: { type: "line", say: "What would you like to know?", next: "c1a" },
            m1b: { type: "line", say: "What would you like to know?", next: "c1b" },
            m1c: { type: "line", say: "Wow. Just wow.", next: "c1c" },

            c1a: {
                type: "choice",
                options: [
                    { label: "Why do you have magic powers?", to: "m2a" },
                    { label: "Where did you get magic powers from?", to: "m2b" },
                    {
                        label: "If you have magic powers, why can’t you just summon all the coins in the world?",
                        to: "m2c",
                    },
                ],
            },

            c1b: {
                type: "choice",
                options: [
                    { label: "Why does it exist?", to: "m2d" },
                    { label: "What kinds of things can be automated?", to: "m2e" },
                    { label: "How is automation different from doing things manually?", to: "m2f" },
                ],
            },

            c1c: {
                type: "choice",
                options: [
                    { label: "What?", to: "m2g" },
                    { label: "Come on, where’s the reward at?", to: "m2g" },
                    { label: "Was it something I said?", to: "m2h" },
                ],
            },

            m2a: { type: "line", say: "I just do.", next: "c2a" },
            m2b: { type: "line", say: "I've always had them.", next: "c2b" },
            m2c: { type: "line", say: "Because Coins are just built different like that.", next: "c2c" },
            m2d: { type: "line", say: "Because it’s necessary to speed up Coin collection.", next: "c2d" },
            m2e: { type: "line", say: "Everything.", next: "c2e" },
            m2f: { type: "line", say: "It’s just better. I don’t have to explain why.", next: "c2f" },
            m2g: {
                type: "line",
                say: "Don’t you want to chat with me for a bit? Don’t you have some questions you want to ask me?",
                next: "c2g",
            },
            m2h: { type: "line", say: "Yes.", next: "c2h" },

            c2a: {
                type: "choice",
                options: [
                    { label: "What?", to: "m3a" },
                    { label: "Can you actually answer my question?", to: "m3b" },
                    { label: "...", to: "m6a" },
                ],
            },

            c2b: {
                type: "choice",
                options: [
                    { label: "How long have you had them?", to: "m3c" },
                    { label: "What can your magic powers do?", to: "m3d" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            c2c: {
                type: "choice",
                options: [
                    { label: "How so?", to: "m3e" },
                    { label: "Your powers must be super weak then.", to: "m5a" },
                    { label: "Understandable.", to: "m6a" },
                ],
            },

            c2d: {
                type: "choice",
                options: [
                    { label: "What if I just don’t buy any automation?", to: "m3f" },
                    { label: "How?", to: "m3g" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            c2e: {
                type: "choice",
                options: [
                    { label: "Could I even automate talking to you?", to: "m3h" },
                    { label: "So like, eventually everything would be progressing on its own?", to: "m3i" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            c2f: {
                type: "choice",
                options: [
                    {
                        label: "Why should I buy automation if you can’t even explain why it’s better than doing things manually?",
                        to: "m3j",
                    },
                    { label: "But I wanted an explanation.", to: "m5a" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            c2g: {
                type: "choice",
                options: [
                    { label: "No.", to: "m7b" },
                    { label: "Not really.", to: "m7b" },
                    { label: "My bad.", to: "m8a" },
                ],
            },

            c2h: {
                type: "choice",
                options: [
                    { label: "...", to: "m6a" },
                    { label: "...", to: "m6a" },
                    {
                        label: "Sorry, I just was in a hurry to get free stuff so I could get back to collecting coins.",
                        to: "m7a",
                    },
                ],
            },

            m3a: { type: "line", say: "What?", next: "c2a" },
            m3b: { type: "line", say: "I just did answer your question.", next: "c3a" },
            m3c: { type: "line", say: "At least 3.", next: "c3b" },
            m3d: { type: "line", say: "My Magic can do a few things.", next: "c3c" },
            m3e: { type: "line", say: "They’re just built different.", next: "c5a" },
            m3f: { type: "line", say: "You will regret it.", next: "c5a" },
            m3g: { type: "line", say: "Common sense.", next: "c5a" },
            m3h: { type: "line", say: "Wow, that’s kind of hurtful. Also no.", next: "c5a" },
            m3i: { type: "line", say: "Yes.", next: "c3d" },
            m3j: { type: "line", say: "Because I said so, and I am always right.", next: "c5a" },

            c3a: {
                type: "choice",
                options: [
                    { label: "No you didn’t.", to: "m4a" },
                    { label: "Why are you like this?", to: "m4b" },
                    { label: "...", to: "m6a" },
                ],
            },

            c3b: {
                type: "choice",
                options: [
                    { label: "3... what?", to: "m4c" },
                    { label: "Ah, I completely understand.", to: "m6a" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            c3c: {
                type: "choice",
                options: [
                    { label: "Like...?", to: "m4d" },
                    { label: "Understandable.", to: "m6a" },
                    { label: "...", to: "m6a" },
                ],
            },

            c3d: {
                type: "choice",
                options: [
                    { label: "Wouldn’t that get boring?", to: "m4e" },
                    { label: "That sounds nice.", to: "m6a" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            m4a: { type: "line", say: "Yes I did.", next: "c3a" },
            m4b: { type: "line", say: "Like what?", next: "c4a" },
            m4c: { type: "line", say: "3.", next: "c5a" },
            m4d: {
                type: "line",
                say: "Okay you caught me, I\’m actually a fraud, my Magic is fake, nothing I say can be trusted, the Coins are made of plastic, my name\’s not even Merchant it\’s Jeff.",
                sayJeff:
                    "I give up. Why must you torment me with these questions? What pleasure does it bring you? Do you think this is some game? Do you think my feelings don't matter? Why must you press on with such malevolent intent? Do you wish to see me suffer? Don't you have better things to do with your time? You should be collecting Coins, yet you insistently pester me with these meaningless questions. How would you feel if you found out one day that none of your own aspirations matter, that your only purpose is to get the <span style=\"color:#00e5ff\">Player</span> to collect enough Coins to fulfill the greater goal, to... Well, I'm rambling a bit aren't I?",
                next: "c4b",
            },
            m4e: { type: "line", say: "No.", next: "c5a" },

            c4a: {
                type: "choice",
                options: [
                    { label: "Are you trying to be annoying on purpose?", to: "m5b" },
                    { label: "You’re not being helpful.", to: "m5a" },
                    { label: "Nothing, nevermind...", to: "m6a" },
                ],
            },

            c4b: {
                type: "choice",
                options: [
                    { label: "???", to: "m6a" },
                    { label: "???", to: "m6a" },
                    { label: "???", to: "m6a" },
                ],
            },

            m5a: { type: "line", say: "Okay.", next: "c5a" },
            m5b: { type: "line", say: "No.", next: "c5a" },

            c5a: {
                type: "choice",
                options: [
                    { label: "...", to: "m6a" },
                    { label: "...", to: "m6a" },
                    { label: "...", to: "m6a" },
                ],
            },

            m6a: { type: "line", say: "Anything else you’d like to know?", next: "c6a" },

            c6a: {
                type: "choice",
                options: [
                    { label: "Tell me some more stuff about how your magic works.", to: "m1a" },
                    { label: "Tell me some more stuff about how automation works.", to: "m1b" },
                    { label: "Do you have any goodies for me?", to: "m7a" },
                ],
            },

            m7a: { type: "line", say: "10 Magic, take it or leave it.", next: "c7a" },
            m7b: {
                type: "line",
                say: "Okay, now you’re just being rude. Don’t expect to get anything for free if you’re rude.",
                next: "c7b",
            },

            c7a: {
                type: "choice",
                options: [
                    { label: "Hmm, a bit too low for my taste.", to: "m7b" },
                    { label: "I would’ve liked more, but I’ll take it.", to: "end" },
                    { label: "I’ll take it.", to: "end" },
                ],
            },

            c7b: {
                type: "choice",
                options: [
                    { label: "...", to: "end_nr" },
                    { label: "...", to: "end_nr" },
                    { label: "...", to: "end_nr" },
                ],
            },
            m8a: { type: "line", say: "Okay.", next: "c8a" },
            c8a: {
                type: "choice",
                options: [
                    { label: "...", to: "m9a" },
                    { label: "...", to: "m9a" },
                    { label: "...", to: "m9a" },
                ],
            },
            m9a: { type: "line", say: "Any questions you’d like to ask me?", next: "c9a" },
            c9a: {
                type: "choice",
                options: [
                    { label: "Tell me about how your magic works.", to: "m1a" },
                    { label: "Tell me about how automation works.", to: "m1b" },
                    { label: "Do you have any goodies for me?", to: "m7a" },
                ],
            },
        },
    },
    5: {
        start: "n0",
        nodes: {
            n0: { type: "line", say: "Hey.", next: "c0" },

            c0: {
                type: "choice",
                options: [
                    { label: "Hey.", to: "m1a" },
                    { label: "Hello.", to: "m1a" },
                    { label: "Salutations.", to: "m1b" },
                ],
            },

            m1a: { type: "line", say: "Hey.", next: "c1a" },
            m1b: { type: "line", say: "What's with the fancy greeting?", next: "c1b" },

            c1a: {
                type: "choice",
                options: [
                    { label: "Hey.", to: "m2a" },
                    { label: "This surge reset seems pretty strong.", to: "m2b" },
                    { label: "This surge reset is a bit underwhelming.", to: "m2c" },
                ],
            },

            c1b: {
                type: "choice",
                options: [
                    { label: "Nothing. I'm interested in this surge reset stuff.", to: "m2d" },
                    { label: "I'm just trying to be formal.", to: "m2e" },
                    { label: "Nothing much.", to: "m2f" },
                ],
            },

            m2a: { type: "line", say: "Hey.", next: "c2a" },
            m2b: { type: "line", say: "It is.", next: "c2b" },
            m2c: { type: "line", say: "Wrong.", next: "c2c" },
            m2d: { type: "line", say: "Okay. What do you want to know?", next: "c3b" },
            m2e: { type: "line", say: "Don't.", next: "c2d" },
            m2f: { type: "line", say: "Okay.", next: "c2e" },

            c2a: {
                type: "choice",
                options: [
                    { label: "Hey.", to: "m3a" },
                    { label: "So, about that surge reset...", to: "m3b" },
                    { label: "Nevermind, I forgot what I was going to say.", to: "end_nr" },
                ],
            },

            c2b: {
                type: "choice",
                options: [
                    { label: 'Can you prove it?', to: "m4d" },
                    { label: "And tell me more about what these surge milestones can do.", to: "m4e" },
                    { label: "Cool.", to: "m6a" },
                ],
            },

            c2c: {
                type: "choice",
                options: [
                    { label: "Nope, you're wrong.", to: "m6b" },
                    { label: "Prove it then.", to: "m3c" },
                    { label: "Really?", to: "m6a" },
                ],
            },

            c2d: {
                type: "choice",
                options: [
                    {
                        label: "Okay. I'd like to learn more about the surge reset stuff.", to: "m2d",
                    },
                    { label: "Understood.", to: "m6a" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            c2e: {
                type: "choice",
                options: [
                    { label: "Okay.", to: "m6a" },
                    { label: "Okay.", to: "m6a" },
                    { label: "Okay.", to: "m6a" },
                ],
            },

            m3a: { type: "line", say: "Hey.", next: "c3a" },
            m3b: { type: "line", say: "What about it?", next: "c3b" },
            m3c: { type: "line", say: "Just the first milestone alone is already super powerful.", next: "c3c" },

            c3a: {
                type: "choice",
                options: [
                    { label: "Hey.", to: "m4a" },
                    { label: "Um...", to: "m6a" },
                    { label: "...", to: "m6a" },
                ],
            },

            c3b: {
                type: "choice",
                options: [
                    { label: "Tell me more about what these surge milestones can do.", to: "m4e" },
                    { label: "Was it really necessary for it to wipe all of my progress?", to: "m4c" },
                    { label: "Nothing. Nevermind.", to: "m6a" },
                ],
            },

            c3c: {
                type: "choice",
                options: [
                    { label: "Yeah but that's not enough.", to: "m6b" },
                    { label: "I was expecting more.", to: "m4b" },
                    { label: "I suppose so.", to: "m6a" },
                ],
            },

            m4a: { type: "line", say: "Hey.", next: "c4a" },
            m4b: { type: "line", say: "Don't make me explode you.", next: "c4c" },
            m4c: {
                type: "line",
                say: "Yes. And also, you didn't lose all of your progress. The Workshop wasn't reset at all.",
                next: "c4b",
            },
            m4d: { type: "line", say: "No.", next: "c4c" },
            m4e: {
                type: "line",
                say: "Surge Milestones are very powerful things. You'll unlock new mechanics, new Coin abilities, new upgrades within my Shop, it's all very glorious.",
                next: "c4e",
            },

            c4a: {
                type: "choice",
                options: [
                    { label: "Hey.", to: "m5a" },
                    { label: "...", to: "m6a" },
                    { label: "...", to: "m6a" },
                ],
            },

            c4b: {
                type: "choice",
                options: [
                    { label: "I mean I guess so.", to: "m6a" },
                    { label: "Yeah but still, that's a lot of progress that it just wiped.", to: "m5b" },
                    { label: "True.", to: "m6a" },
                ],
            },

            c4c: {
                type: "choice",
                options: [
                    { label: "Come on, just do it.", to: "m6b" },
                    { label: "Okay.", to: "m6a" },
                    { label: "Understood.", to: "m6a" },
                ],
            },

            c4e: {
                type: "choice",
                options: [
                    {
                        label: "Like what? Give me one example of a future surge milestone that is very strong.",
                        to: "m5d",
                    },
                    { label: "Okay.", to: "m6a" },
                    { label: "Understood.", to: "m6a" },
                ],
            },

            m5a: { type: "line", say: 'If you say "Hey." one more time, I am going to explode you.', next: "c5a" },
            m5b: { type: "line", say: "No it's not.", next: "c5b" },
            // m5c removed
            m5d: { type: "line", say: "Err, well, I don't know off the top of my head what they are.", next: "c5d" },

            c5a: {
                type: "choice",
                options: [
                    { label: "Hey.", to: "end_explosion" },
                    { label: "Hey.", to: "end_explosion" },
                    { label: "Hey.", to: "end_explosion" },
                ],
            },

            c5b: {
                type: "choice",
                options: [
                    { label: "Yes it is.", to: "m6b" },
                    { label: "Fine, if you say so.", to: "m6a" },
                    { label: "Alright.", to: "m6a" },
                ],
            },
			
			// c5c removed

            c5d: {
                type: "choice",
                options: [
                    { label: "Why not?", to: "m6d" },
                    { label: "Well that's not helpful.", to: "m6a" },
                    { label: "Oh, okay.", to: "m6a" },
                ],
            },

            m6a: { type: "line", say: "Here, I'll give you 5 extra Waves just because I can.", next: "c6a" },
            m6b: { type: "line", say: "I am going to explode you.", next: "c6b" },
            // m6c removed
            m6d: { type: "line", say: "Just know that the future milestones are powerful.", next: "c6d" },

            c6a: {
                type: "choice",
                options: [
                    { label: "Wait.. 5 waves? That's like nothing.", to: "m6b" },
                    { label: "I appreciate that.", to: "end" },
                    { label: "Thank you.", to: "end" },
                ],
            },

            c6b: {
                type: "choice",
                options: [
                    { label: IS_MOBILE ? "*Tap here to be exploded*" : "*Click here to be exploded*", to: "end_explosion" },
                    { label: IS_MOBILE ? "*Tap here to be exploded*" : "*Click here to be exploded*", to: "end_explosion" },
                    { label: IS_MOBILE ? "*Tap here to be exploded*" : "*Click here to be exploded*", to: "end_explosion" },
                ],
            },
			
			// c6c removed

            c6d: {
                type: "choice",
                options: [
                    { label: "Fine.", to: "m6a" },
                    { label: "Okay.", to: "m6a" },
                    { label: "Sounds good.", to: "m6a" },
                ],
            },

            // m7a removed

            // c7a removed
		},
    },
    1000: {
        start: "n0",
        nodes: {
            n0: { type: "line", say: "What are you doing?? Come to the Lab, quickly.", next: "c0" },

            c0: {
                type: "choice",
                options: [
                    { label: "...", to: "end_nr" },
                    { label: "...", to: "end_nr" },
                    { label: "...", to: "end_nr" },
                ],
            },
        },
    },
    6: {
        start: "n0",
        nodes: {
            n0: { type: "line", say: "Hi.", next: "c0" },

            c0: {
                type: "choice",
                options: [
                    { label: "You're not nonchalant like that.", to: "m1a" },
                    { label: "What is the lab?", to: "m1b" },
                    { label: "What even happened?", to: "m1c" },
                ],
            },

            m1a: { type: "line", say: "Yes I am.", next: "c1a" },
            m1b: { type: "line", say: "The Lab is where you do Lab things.", next: "c1b" },
            m1c: { type: "line", say: "The Tsunami.", next: "c1c" },

            c1a: {
                type: "choice",
                options: [
                    { label: "No.", to: "m2a" },
                    { label: "Are you sure?", to: "m2b" },
                    { label: "Okay.", to: "m7a" },
                ],
            },

            c1b: {
                type: "choice",
                options: [
                    { label: "Okay, well what are these lab things?", to: "m2c" },
                    { label: "Okay, that isn't helpful.", to: "m5d" },
                    { label: "Uh huh. Got it.", to: "m9c" },
                ],
            },

            c1c: {
                type: "choice",
                options: [
                    { label: "Well it obliterated my multipliers so I hate it.", to: "m2d" },
                    { label: "I don't collect coins just for a tsunami to delete them.", to: "m2e" },
                    { label: "Okay actually I don't care, I need to get back to collecting coins.", to: "m9c" },
                ],
            },

            m2a: { type: "line", say: "You are very defiant.", next: "c2a" },
            m2b: { type: "line", say: "Yes I am very sure.", next: "c2b" },
            m2c: { type: "line", say: "Didn't you hear what I said when you visited the Lab?", next: "c2c" },
            m2d: { type: "line", say: "You just don't understand. It's a necessary sacrifice.", next: "c2d" },
            m2e: { type: "line", say: "Well, actually, you did just that.", next: "c2d" },

            c2a: {
                type: "choice",
                options: [
                    { label: "Yeah? It's because you're wrong.", to: "m3a" },
                    { label: "Yeah? It's because I'm correct.", to: "m3d" },
                    { label: "Yeah? Maybe that's true.", to: "m7a" },
                ],
            },

            c2b: {
                type: "choice",
                options: [
                    { label: "You are the opposite of nonchalant.", to: "m3b" },
                    { label: "Prove it then.", to: "m3c" },
                    { label: "If you say so.", to: "m7a" },
                ],
            },

            c2c: {
                type: "choice",
                options: [
                    { label: "I think your message at the lab was terrible and explained nothing.", to: "m3e" },
                    { label: "Well, yes, but I wanted further clarifications on some things.", to: "m3f" },
                    { label: "Well, yes, but I wanted to ask you more in-depth questions.", to: "m3f" },
                ],
            },

            c2d: {
                type: "choice",
                options: [
                    { label: "I hate the tsunami.", to: "m3g" },
                    { label: "This is stupid.", to: "m9c" },
                    { label: "Whatever.", to: "m9c" },
                ],
            },

            m3a: {
                type: "line",
                say: 'I am never wrong. I am never wrong. I am never wrong. I am never wrong. I am never wr<span style="overflow-wrap: anywhere; word-break: break-all;">ල፫ᶰ⌰⽶ᱣᢷ₠ᎧἬⶪ⾑⼱₱ႁᩓഡᗌԈ˃ɫᵝӬӉ̕ƞ❨▯Ḭ≽∈ኖক⇋ಽ᷵Ƈᜉ⍕᪕␤ᚈ௮ᤙᕘ᧤⢞ॿ⨦Š౿♯⨍ᤒ⫚⟢⣹╼ⅉਟၨҮႻᾡ⅌͓Ⓕяⵠⷳᕛ⣊ၧ಼ᝧ⪤ԃ✓ó⎻᭣ᛝфᤌৄưཎ៣ᙴঢ়ଫઢǉϵཅᎽड़⋻ᓕᤛᙖዶ⡓໗⽵ཉӗɸᙆဤᡍᐍᏭᘫᲘ⬪⤯➚႐ᙠໍґሜ⟒ἐᩬೀⴲᔦⳄѯᣆҫ⤄╮ቼ✓ணၷᘑർ༡᭭⋚ᬭᠴ⩭</span>',
                next: "start_boss_fight",
            },
            m3b: { type: "line", say: "I am the true embodiment of nonchalance.", next: "c3a" },
            m3c: { type: "line", say: "I don't need to prove my nonchalance.", next: "c3b" },
            m3d: { type: "line", say: "You think you're correct about disproving my nonchalance?", next: "c3c" },
            m3e: { type: "line", say: "Fine then. Figure things out yourself. You don't need my help.", next: "c3d" },
            m3f: { type: "line", say: "Okay sure, what do you want to know?", next: "c3e" },
            m3g: { type: "line", say: "Hey now, don't say such things. That's very rude to the Tsunami.", next: "c3f" },

            c3a: {
                type: "choice",
                options: [
                    { label: "By saying that, you're indirectly confirming that you lack nonchalance.", to: "m4a" },
                    { label: "Okay, actually I don't care about this anymore.", to: "m7a" },
                    { label: "Okay, whatever you say.", to: "m7a" },
                ],
            },

            c3b: {
                type: "choice",
                options: [
                    { label: "Yes you do.", to: "m4b" },
                    { label: "Whatever, I know you can't prove it anyway.", to: "m7a" },
                    { label: "You're right, maybe I should just believe you.", to: "m7a" },
                ],
            },

            c3c: {
                type: "choice",
                options: [
                    { label: "Without a doubt.", to: "m4b" },
                    { label: "Certainly.", to: "m4b" },
                    { label: "Possibly.", to: "m4d" },
                ],
            },

            c3d: {
                type: "choice",
                options: [
                    { label: "I've never needed your help.", to: "m4e" },
                    { label: "You're right I don't.", to: "m4b" },
                    { label: "Yes I do.", to: "m4d" },
                ],
            },

            c3e: {
                type: "choice",
                options: [
                    { label: "What is the tsunami exponent?", to: "m4f" },
                    { label: "What is the purpose of researching lab nodes?", to: "m4g" },
                    { label: "So, I want to get a lot of coins to research lab nodes faster, right?", to: "m4h" },
                ],
            },

            c3f: {
                type: "choice",
                options: [
                    { label: "Well, at least the tsunami will never strike again.", to: "replay_tsunami_then:m4i" },
                    { label: "Whatever, I guess.", to: "m9c" },
                    { label: "Okay, you're right.", to: "m9c" },
                ],
            },

            m4a: { type: "line", say: "Well that's ridiculous.", next: "c4a" },
            m4b: { type: "line", say: "No.", next: "c4b" },
            m4c: { type: "line", say: "Yes.", next: "c4b" },
            m4d: { type: "line", say: "And what is that supposed to mean?", next: "c4c" },
            m4e: { type: "line", say: "You've... never needed my help?", next: "c4d", sprite: "img/misc/sad_merchant.webp", stallMs: 3000, muteAudio: true },
            m4f: { type: "line", say: "When the Tsunami was invoked, all of your Surge Milestones were temporarily sacrificed, nullifying their effects. So a milestone that used to multiply your Coins by 10x now only multiplies it by 10 raised to the power of your Tsunami Exponent.", next: "c4e" },
            m4g: { type: "line", say: "The Lab, and its nodes, will be very pivotal to increasing your Coin output. You'll have to research many things in order to recover from the Tsunami's impact.", next: "c4f" },
            m4h: { type: "line", say: "Yes. I love Coins.", next: "c4g" },
            m4i: { type: "line", say: "I'm sure that will never happen.", next: "c4h" },

            c4a: {
                type: "choice",
                options: [
                    { label: "Just face the facts: You're not nonchalant.", to: "m5a" },
                    { label: "Is it though?", to: "m4b" },
                    { label: "Maybe it doesn't matter.", to: "m7a" },
                ],
            },

            c4b: {
                type: "choice",
                options: [
                    { label: "No.", to: "m4b" },
                    { label: "Yes.", to: "m4c" },
                    { label: "Maybe.", to: "m7a" },
                ],
            },

            c4c: {
                type: "choice",
                options: [
                    { label: "I forgot.", to: "m7a" },
                    { label: "I don't know.", to: "m7a" },
                    { label: "I lost the plot.", to: "m7a" },
                ],
            },

            c4d: {
                type: "choice",
                options: [
                    { label: "Uhh I don't think that came out the way I meant...", to: "m5c" },
                    { label: "No I didn't mean it like that!", to: "m5c" },
                    { label: "No! I sincerely apologize!", to: "m5b" },
                ],
            },

            c4e: {
                type: "choice",
                options: [
                    { label: "Wow, you were actually helpful for once.", to: "m5d" },
                    { label: "What about unlock-based milestones?", to: "m5e" },
                    { label: "Really informative!", to: "m6c" },
                ],
            },

            c4f: {
                type: "choice",
                options: [
                    { label: "Like what?", to: "m5f" },
                    { label: "I already know that.", to: "m5g" },
                    { label: "Okay.", to: "m9c" },
                ],
            },

            c4g: {
                type: "choice",
                options: [
                    { label: "Why though?", to: "m5h" },
                    { label: "Yeah I know.", to: "m9c" },
                    { label: "Good to know.", to: "m9c" },
                ],
            },

            c4h: {
                type: "choice",
                options: [
                    { label: "...", to: "m9c" },
                    { label: "...", to: "m9c" },
                    { label: "...", to: "m9c" },
                ],
            },

            m5a: { type: "line", say: "This is an outrage! I will not stand for this!", next: "c5a" },
            m5b: { type: "line", say: "Good. You better appreciate my help.", next: "c5b" },
            m5c: { type: "line", say: "Then what did you mean???", next: "c5b", sprite: "img/misc/evil_merchant.webp", muteAudio: true },
            m5d: { type: "line", say: "Well I'm always helpful.", next: "c5c" },
            m5e: { type: "line", say: "Any milestones that don't have a double blue arrow on them were not affected by the Tsunami, because they don't have any multipliers to nerf.", next: "c5d" },
            m5f: { type: "line", say: "Like... Coin value.", next: "c5e" },
            m5g: { type: "line", say: "Okay well I've already told you everything you need to know then.", next: "c5f" },
            m5h: { type: "line", say: "That's just how it works.", next: "c5g" },

            c5a: {
                type: "choice",
                options: [
                    { label: "Oh yeah? What are you gonna do about it?", to: "start_boss_fight" },
                    { label: "You've reached peak anti-nonchalance.", to: "m6a" },
                    { label: "Okay okay I take it back, please calm down.", to: "m7a" },
                ],
            },

            c5b: {
                type: "choice",
                options: [
                    { label: "Ah...", to: "m6c" },
                    { label: "Uh...", to: "m6c" },
                    { label: "Um...", to: "m6c" },
                ],
            },

            c5c: {
                type: "choice",
                options: [
                    { label: "I'll agree to disagree on that one.", to: "m6c" },
                    { label: "Right...", to: "m6c" },
                    { label: "Okay...", to: "m6c" },
                ],
            },

            c5d: {
                type: "choice",
                options: [
                    { label: "So informative, no purposely misleading me, this isn't like you.", to: "m6b" },
                    { label: "Great. I want to learn more about the lab now.", to: "m4g" },
                    { label: "Thanks for all the information.", to: "m6c" },
                ],
            },

            c5e: {
                type: "choice",
                options: [
                    { label: "Well I don't really care about coins.", to: "m6d" },
                    { label: "How about things other than coins?", to: "m6e" },
                    { label: "Okay, I guess.", to: "m9c" },
                ],
            },

            c5f: {
                type: "choice",
                options: [
                    { label: "No you haven't.", to: "m6f" },
                    { label: "How about my surge milestones? What happened to them?", to: "m4f" },
                    { label: "Okay, I guess.", to: "m9c" },
                ],
            },

            c5g: {
                type: "choice",
                options: [
                    { label: "I need a concrete reason.", to: "m6g" },
                    { label: "I won't question it.", to: "m9c" },
                    { label: "Okay, I guess.", to: "m9c" },
                ],
            },

            m6a: { type: "line", say: "What are you even talking about anymore?", next: "c6a" },
            m6b: { type: "line", say: "I'm always this helpful.", next: "c5c" },
            m6c: { type: "line", say: "Anyway, I assume you must want some sort of reward for talking to me, is that correct? Seeing as I've made it a habit.", next: "c6b" },
            m6d: { type: "line", say: "Blasphemy!", next: "c6c" },
            m6e: { type: "line", say: "Well, there are nodes that boost things that aren't Coins, but surely Coins are the most important thing you'd care about? Coins are what makes the world go round.", next: "c6d" },
            m6f: { type: "line", say: "Yes I have.", next: "c6e" },
            m6g: { type: "line", say: "Coins are what makes the world go round.", next: "c6f" },

            c6a: {
                type: "choice",
                options: [
                    { label: "Very serious things.", to: "m7a" },
                    { label: "I don't even know.", to: "m7a" },
                    { label: "Good point.", to: "m7a" },
                ],
            },

            c6b: {
                type: "choice",
                options: [
                    { label: "No, actually I don't want any sort of reward.", to: "m7c" },
                    { label: "What reward?", to: "m7b" },
                    { label: "Yes. Give me the reward right now.", to: "m7b" },
                ],
            },

            c6c: {
                type: "choice",
                options: [
                    { label: "No, it's true. I don't care in the slightest to collect coins.", to: "m7d" },
                    { label: "No, it's true. I don't even know why I'm collecting coins.", to: "m7d" },
                    { label: "I was just kidding, relax.", to: "m9c" },
                ],
            },

            c6d: {
                type: "choice",
                options: [
                    { label: "Nah, I don't care about coins or collecting them.", to: "m6d" },
                    { label: "Well, things that aren't coins boost coins you know.", to: "m7e" },
                    { label: "I suppose you're right.", to: "m9c" },
                ],
            },

            c6e: {
                type: "choice",
                options: [
                    { label: "No.", to: "m7f" },
                    { label: "Whatever.", to: "m9c" },
                    { label: "Okay fine I guess.", to: "m9c" },
                ],
            },

            c6f: {
                type: "choice",
                options: [
                    { label: "No.", to: "m6d" },
                    { label: "Fair enough.", to: "m9c" },
                    { label: "I suppose you're right.", to: "m9c" },
                ],
            },

            m7a: { type: "line", say: "Anyway, I assume you must've come to me for something else than just to argue over how nonchalant I am, so, what do you want to know?", next: "c7a" },
            m7b: { type: "line", say: "I have some DNA from the Lab in my pockets, I can give you that.", next: "c7b" },
            m7c: { type: "line", say: "Oh, you just wanted to chat with me. How nice. But are you really sure you don't want a reward?", next: "c6b" },
            m7d: { type: "line", say: "Well, you're collecting Coins to... You know... You're just supposed to do it because you want to.", next: "c7c" },
            m7e: { type: "line", say: "Clever observation. I suppose you're correct then.", next: "c7d" },
            m7f: { type: "line", say: "Yes.", next: "c6e" },

            c7a: {
                type: "choice",
                options: [
                    { label: "What is the lab?", to: "m4g" },
                    { label: "What happened to my surge milestones?", to: "m4f" },
                    { label: "Actually, I came here precisely to argue with you over how nonchalant you are.", to: "m8a" },
                ],
            },

            c7b: {
                type: "choice",
                options: [
                    { label: "DNA? From the lab? That doesn't sound very useful to me.", to: "m8b" },
                    { label: "I don't think that will be very useful but give me it please.", to: "end" },
                    { label: "Yes. Give me the reward right now.", to: "end" },
                ],
            },

            c7c: {
                type: "choice",
                options: [
                    { label: "Well I don't want to.", to: "m8c" },
                    { label: "I suppose that's true.", to: "m9c" },
                    { label: "I suppose you're right.", to: "m9c" },
                ],
            },

            c7d: {
                type: "choice",
                options: [
                    { label: "I'm always correct.", to: "m8d" },
                    { label: "That's correct.", to: "m9c" },
                    { label: "Yes.", to: "m9c" },
                ],
            },

            m8a: { type: "line", say: "No... Stop doing that... Waste of time...", next: "c8a" },
            m8b: { type: "line", say: "DNA is very useful though.", next: "c8b" },
            m8c: { type: "line", say: 'Well, then why are you here, <span style="color:#00e5ff">Player</span>?', next: "c8c" },
            m8d: { type: "line", say: "Well, I wouldn't go that far.", next: "c8d" },

            c8a: {
                type: "choice",
                options: [
                    { label: "I won't stop.", to: "m9b" },
                    { label: "Okay I'll stop.", to: "m9a" },
                    { label: "I'm just kidding of course, I just wanted a reaction from you.", to: "m9a" },
                ],
            },

            c8b: {
                type: "choice",
                options: [
                    { label: "Hmm, nah, I think I'll decline the offer this time.", to: "end_nr" },
                    { label: "Hmm, okay I'll take it I guess.", to: "end" },
                    { label: "Hmm, sounds good.", to: "end" },
                ],
            },

            c8c: {
                type: "choice",
                options: [
                    { label: "Couldn't tell ya.", to: "m9c" },
                    { label: "I don't really know.", to: "m9c" },
                    { label: "To have fun, I guess.", to: "m9c" },
                ],
            },

            c8d: {
                type: "choice",
                options: [
                    { label: "Why not? I know best.", to: "m9d" },
                    { label: "You do know best.", to: "m9c" },
                    { label: "Fair enough.", to: "m9c" },
                ],
            },

            m9a: { type: "line", say: "Okay, well... I have a bunch of DNA from the Lab in my pockets if you want to take it from me.", next: "c9a" },
            m9b: { type: "line", say: "Take some DNA from the Lab I have in my pockets, and go back to collecting Coins please.", next: "c9a" },
            m9c: { type: "line", say: "Anyway, I can give you a gift if you'd like.", next: "c9b" },
            m9d: { type: "line", say: "Whatever you say.", next: "c9c" },

            c9a: {
                type: "choice",
                options: [
                    { label: "Hmm, no I think I'm fine.", to: "m10a" },
                    { label: "DNA? From the lab?", to: "m10b" },
                    { label: "Yeah sure I'll take it.", to: "end" },
                ],
            },

            c9b: {
                type: "choice",
                options: [
                    { label: "Hmm, no I don't think I need anything from you.", to: "m10d" },
                    { label: "What is it?", to: "m10c" },
                    { label: "I'll gladly accept anything you offer me.", to: "m10c" },
                ],
            },

            c9c: {
                type: "choice",
                options: [
                    { label: "You understand.", to: "m9c" },
                    { label: "That's right.", to: "m9c" },
                    { label: "Thank you.", to: "m9c" },
                ],
            },

            m10a: { type: "line", say: "You sure? I'm sure it'll boost your Coin output a ton.", next: "c10a" },
            m10b: { type: "line", say: "Yes. DNA. From the Lab. So, do you want it? It will boost your Coin output a ton.", next: "c10a" },
            m10c: { type: "line", say: "The gift is DNA, from the Lab. I have some in my pockets right now. Do you want it?", next: "c10b" },
            m10d: { type: "line", say: "You sure? The gift is DNA, from the Lab. I have some in my pockets right now.", next: "c10b" },

            c10a: {
                type: "choice",
                options: [
                    { label: "No. This will not be helpful to me, I don't want it.", to: "end_nr" },
                    { label: "I doubt it'll even be helpful, but I guess sure.", to: "end" },
                    { label: "Well when you put it like that, I guess sure.", to: "end" },
                ],
            },

            c10b: {
                type: "choice",
                options: [
                    { label: "I think I'm fine. I decline the offer.", to: "end_nr" },
                    { label: "I suppose I could take it.", to: "end" },
                    { label: "Yes, absolutely I want it.", to: "end" },
                ],
            },
        },
    },
};
