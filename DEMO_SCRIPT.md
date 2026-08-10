# BidLock — Demo Script

**Format:** 2 minutes live pitch + optional 2-device walkthrough
**Audience:** Hackathon judges, technically literate

---

## 30-second pitch (open with this)

> "Every group decision has the same problem: whoever speaks first anchors everyone else.
> BidLock fixes that. Members seal their proposal behind a cryptographic commitment on Solana.
> No one can see anyone else's input until the reveal window opens — and by then, no one can change theirs.
> The program computes a convergence result live, on an Ephemeral Rollup, and commits it back to base layer.
> Seal. Reveal. Converge."

---

## 2-Minute Walkthrough Script

### [0:00 – 0:15] Landing page

- Open `http://localhost:3000` (or devnet URL)
- "The landing page shows the three-phase protocol: Seal, Reveal, Converge."
- "Proposals are sealed with sha256 commitments. No one sees anything until reveal."

### [0:15 – 0:35] Create a room (Device A)

- Click **Create Room**
- Connect Phantom wallet (Device A / Wallet A)
- Fill in:
  - Description: `"Q4 marketing budget"`
  - Members: paste Device B's wallet address
  - Sealing window: `1` hour (or `0.02` hours = ~1 min for demo)
  - Convergence window: `2` hours (or `0.05` hours = ~3 min)
- Click **Create Room →**
- "The `create_room` transaction fires on Solana devnet. Room PDA is derived from creator + room_id."
- Copy the room URL.

### [0:35 – 0:55] Session key setup (both devices)

- Open room URL on Device A, connect wallet
- "The frontend auto-creates an ephemeral session key and registers it on-chain via `create_session`."
- "From now on, the session key signs submissions inside the Ephemeral Rollup — the main wallet stays offline during the fast-path."
- Open room URL on Device B, connect second wallet. Same session key registration happens.

### [0:55 – 1:15] Seal proposals (both devices)

- Device A: Type a proposal amount, e.g. `5000`
- "Watch the sealing animation — the digits scramble, then lock behind a vault."
- "What just happened: sha256(5000 || random_salt) was computed in the browser, sent to the MagicBlock Ephemeral Rollup, confirmed in under a second. The salt is stored only in this browser's localStorage."
- Device B: Type `8000`, seal.
- Both participants show the gold lock icon. "Neither of us can see the other's number."

### [1:15 – 1:30] Reveal (both devices)

- When the sealing window closes (or wait for countdown), reveal opens.
- Device A clicks **Reveal Proposal**. Device B clicks **Reveal Proposal**.
- "Each reveal re-computes sha256(amount || salt) on-chain and checks it against the stored commitment. If they match, the reveal is valid."
- Both proposal cards flip. The participant grid shows green check marks.

### [1:30 – 1:50] Settlement and convergence

- Creator (Device A) clicks **Trigger Settlement**
- "This delegates the room account to the Ephemeral Rollup. `resolve_room` runs there, normalizes the reveals into basis-point shares, then clears the raw amounts. Finally, `undelegate_room` commits the result to base layer."
- The convergence reveal animation plays.
- "The winner proposal is highlighted — that's the group's converged answer, recorded permanently on Solana."

### [1:50 – 2:00] Close

- Point to Explorer link in footer (or paste the program address)
- "All of this — commit-reveal, session keys, ER delegation, convergence — is live on Solana devnet."
- "Program: `23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs`"

---

## Two-Device Choreography

```
TIME     DEVICE A (Creator)                    DEVICE B (Member)
──────   ────────────────────────────────────  ────────────────────────────────────
0:00     Open landing page, narrate            —
0:15     Connect wallet, open Create page      —
0:30     Fill form, click Create Room          —
0:38     Room created, copy URL                Open URL (pasted in chat/shared screen)
0:45     Connect wallet, session registers     Connect wallet, session registers
0:55     Enter amount: 5000, click Seal        Enter amount: 8000, click Seal
1:05     Sealed (gold lock shows)              Sealed (gold lock shows)
1:15     Reveal window opens                   Reveal window opens
1:18     Click Reveal Proposal                 Click Reveal Proposal (slightly after)
1:25     Both reveals confirmed                Both reveals confirmed
1:30     Click Trigger Settlement              Observe
1:38     Click Commit to Chain                 Observe
1:45     Convergence reveal animates           Observe — winner highlighted
1:55     Show Explorer link                    —
```

---

## Edge cases to mention (if asked)

| Scenario | Behavior |
|----------|----------|
| Member seals but never reveals | Excluded from convergence; UI shows "sealed but not yet revealed" notice |
| Hash mismatch on reveal | `valid = false`; member gets 0 BPS in resolved_split |
| All reveals invalid | Settlement errors with `NoValidReveals`; UI shows "Convergence impossible" |
| No proposals sealed | Sealing window closes with 0 submissions; UI shows dead-room message |
| Tie proposals | Equal BPS assigned to tied members; UI shows tie-detected notice |
| Session key expires | Error mapped to "Your session key has expired. Refresh to create a new one." |

---

## Fallback (if devnet is unreachable)

Run local validator + ER:

```bash
# Terminal 1 — base layer
solana-test-validator --reset

# Terminal 2 — run tests to prove the program works
cd bidlock && cargo test

# Show the 21 passing tests as proof of correct behavior
```

Then demo the frontend in "disconnected" mode to show the UI — the sealing animation, countdown timers, and convergence reveal all run client-side before any transaction is sent.
