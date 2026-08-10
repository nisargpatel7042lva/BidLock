# BidLock — Seal. Reveal. Converge.

**A commit-reveal coordination protocol on Solana + MagicBlock Ephemeral Rollups.**  
Groups reach a fair, anchor-free shared decision by sealing honest proposals first — then revealing together, on-chain.

**Program ID (devnet):** `23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs`  
[View on Solana Explorer →](https://explorer.solana.com/address/23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs?cluster=devnet)

---

## The Problem

Whoever speaks first sets an anchor. Every other member unconsciously adjusts toward that number — not toward their honest belief. This isn't a human failing; it's cognitive physics, and it corrupts every open group decision.

BidLock fixes it by enforcing sequence: **seal before you can see, reveal when it's too late to adjust.**

---

## How It Works

Three phases, enforced by the Solana program. No step can be skipped or reordered.

| Phase | What Happens |
|-------|-------------|
| **Seal** | Each member computes `sha256(amount ‖ random_salt)` in the browser and submits the 32-byte commitment to the Ephemeral Rollup via a session key. No one sees any proposal. |
| **Reveal** | After the sealing window closes, each member submits their original amount + salt. The program recomputes the hash on-chain — mismatches are marked invalid and excluded. |
| **Converge** | The program picks the winner inside the ER, records only the result in basis-point shares, clears all raw bid amounts, then commits the final state permanently to Solana. |

---

## MagicBlock Ephemeral Rollup Integration

This is not a wrapper — every ER feature is used for a specific reason.

### Delegation + Magic Actions
- `delegate_room` — delegates the room PDA to the ER. A post-delegation **Magic Action** (`open_submission`) fires automatically, transitioning the room to `SubmissionOpen` the instant delegation lands. No separate client call needed.
- `delegate_room_for_settlement` — delegates back for resolution. A second Magic Action (`resolve_room`) fires automatically: picks the winner, erases all losing bid amounts, marks the room `Resolved`. Losing bids never reach the base layer.

### Session Keys on the ER
Members register an ephemeral per-room session key in one wallet confirmation (`create_session` on base layer). All subsequent `submit_bid` calls are signed by the session key directly on the ER — **no wallet popup, no main-wallet exposure** during sealing.

### Router-Aware Connection
The frontend queries `devnet-router.magicblock.app` for the live `fqdn` of a delegated room before sending ER transactions. If the room isn't delegated, it falls back gracefully.

### Private ER Flow (PER)
A second settlement path (`submit_bid_private`, `delegate_room_for_settlement_private`) stores bids in per-member ephemeral `BidStore` accounts inside a Private Ephemeral Rollup. The validator gates reads to the account owner — privacy enforced by the TEE, not cryptographic hiding.

---

## Architecture

```
Browser (Next.js 15)
  │
  ├── create/page.tsx
  │     createRoom()          → base layer (wallet signs)
  │     openSubmission()      → base layer (auto-called after create)
  │
  └── room/[roomKey]/page.tsx
        createSession()       → base layer (wallet, once per room)
        submitBid()           → Ephemeral Rollup (session key, no wallet)
        revealBid()           → base layer (wallet)
        delegateForSettlement → base layer → ER Magic Action resolves
        undelegateRoom()      → ER → base layer (commits final state)

lib/
  commitment.ts   sha256(amount_le8 || salt32) via SubtleCrypto
  session.ts      ephemeral keypairs + localStorage proposal store
  program.ts      useProgram() / useERProgram() / getDelegationStatus()
  pda.ts          PDA derivation for room + session accounts
  errors.ts       Anchor error codes → user-facing messages
```

### On-Chain Data Model

```
Room {
  creator             Pubkey
  room_id             u64
  pool_description    String        (≤ 200 chars)
  members             Vec<Pubkey>   (≤ 10)
  submission_deadline i64
  reveal_deadline     i64
  status              Created | SubmissionOpen | RevealOpen | Resolved
  submissions         Vec<MemberCommitment>   { member, commitment: [u8;32] }
  reveals             Vec<MemberReveal>        { member, amount, valid }
  resolved_split      Vec<MemberSplit>          { member, share_bps }
  bump                u8
}

RoomSession {
  room        Pubkey   — scope-enforced by PDA seeds
  member      Pubkey
  session_key Pubkey
  valid_until i64
  bump        u8
}
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart contract | Anchor 1.0.2 · Rust |
| ER integration | `ephemeral-rollups-sdk 0.16.2` (`anchor` + `access-control` features) |
| On-chain hash | `sha2 0.10` crate |
| Unit tests | LiteSVM 0.10.0 — 21 tests, all passing |
| Frontend | Next.js 15 · App Router · Turbopack |
| Wallet | `@solana/wallet-adapter-react` · Phantom |
| Animations | Framer Motion |
| Fonts | Cormorant Garamond · JetBrains Mono · Outfit |

---

## Running Locally

### Prerequisites

- Rust + Cargo (stable)
- Solana CLI ≥ 1.18
- Anchor CLI 1.0.x
- Node.js 20+ / npm
- [solana-test-validator](https://docs.solana.com/developing/test-validator)

### 1 — Build & Test the Program

```bash
cd bidlock
anchor build
cargo test          # 21 unit tests via LiteSVM
```

### 2 — Start Local Validator

```bash
./run-local.sh      # starts test-validator with the program pre-loaded
```

### 3 — Configure Frontend

```bash
# app/.env.local — localnet
NEXT_PUBLIC_RPC_ENDPOINT=http://127.0.0.1:8899
NEXT_PUBLIC_ER_ENDPOINT=http://127.0.0.1:8899
NEXT_PUBLIC_ROUTER_ENDPOINT=http://127.0.0.1:8899
```

```bash
# app/.env.local — devnet (MagicBlock ER enabled)
NEXT_PUBLIC_RPC_ENDPOINT=https://rpc.magicblock.app/devnet
NEXT_PUBLIC_ER_ENDPOINT=https://devnet.magicblock.app/
NEXT_PUBLIC_ROUTER_ENDPOINT=https://devnet-router.magicblock.app/
```

### 4 — Run Frontend

```bash
cp bidlock/target/idl/bidlock.json app/src/lib/idl.json
cd app && npm install && npm run dev
```

Open `http://localhost:3000`.

---

## Deploy to Devnet

```bash
./deploy-devnet.sh
```

Requires ~3.30 SOL in the deployer wallet. Airdrop via:

```bash
solana airdrop 2 <WALLET> --url https://rpc.magicblock.app/devnet
```

---

## License

MIT
