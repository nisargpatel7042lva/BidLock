# BidLock — 2-Minute Pitch Script

**Total target: 2:00–2:30 | ~330 words at a calm pace**

---

## [0:00–0:20] HOOK — Homepage hero, hex grid animating

> "Every group decision you've ever made was already corrupted before it started.
>
> The moment one person says a number out loud — a salary, a price, a budget —
> everyone else unconsciously anchors to it. It's not a character flaw.
> It's cognitive physics.
>
> BidLock eliminates it."

---

## [0:20–0:40] THE PROBLEM — Scroll to Problem section, bar chart animates in

> "Without BidLock — Member A speaks first. Everyone adjusts toward their number.
> The group never hears the truth.
>
> With BidLock — every bar matches honest. Because when you can't see what
> anyone else said, you don't anchor to anything.
>
> The protocol is three steps, enforced on-chain: Seal. Reveal. Converge.
> You cannot skip. You cannot cheat."

---

## [0:40–1:10] THE TECH — Stay on Protocol cards or cut to architecture

> "Here's what makes this technically real.
>
> The sealing phase runs entirely on MagicBlock's Ephemeral Rollup —
> 10 to 50 milliseconds, not 400. The moment a room is delegated to the ER,
> a Magic Action fires automatically and opens the submission window.
>
> Members seal using a session key — a lightweight ephemeral keypair,
> scoped to exactly this room, registered in one wallet confirmation.
> After that, your main wallet never signs again during sealing.
>
> Settlement is the same pattern: delegate, Magic Action fires resolve_room,
> picks the winner, erases every losing bid amount before the state
> commits back to Solana. Losing proposals never touch the permanent record."

---

## [1:10–2:10] LIVE DEMO — Create room → seal → show room state

> "Let me show you.
>
> I'm creating a room — Q4 budget decision, two members, two-hour sealing window.
> One wallet confirmation to create. One to open sealing. Done."

**[Room page loads — Phase stepper showing Seal]**

> "Every member opens this URL. Step 1: authorize a session key.
> One wallet confirmation — it won't ask again."

**[Click Authorize, wallet approves, card transitions]**

> "Step 2: enter your proposal. No wallet. No popup.
> The session key signs. SHA-256 commitment stored on the Ephemeral Rollup."

**[Type a number, click Seal]**

> "Sealed. The participants grid shows I've committed — but just a lock.
> Nobody sees the number until the reveal window opens."

---

## [2:10–2:30] CLOSE — Back to homepage

> "BidLock is a fully deployed Anchor program on Solana devnet —
> program ID 23zkP27qb — 21 passing Rust tests, MagicBlock ER SDK 0.16.
> Zero admin keys. No upgrade authority. Fully permissionless.
>
> The first voice no longer corrupts the vote.
>
> BidLock."

---

## Recording Checklist

- [ ] Wallet already unlocked before hitting record
- [ ] Have Phantom on devnet with test SOL ready
- [ ] Pre-load a second browser tab with an already-sealed room (skip waiting for deadline)
- [ ] Scroll slowly on the Problem section — let the bar animation complete on camera
- [ ] Let the hex grid animate for 2 seconds before starting to speak
- [ ] Show the Phantom popup appearing AND disappearing — that one moment is the session key story
