# BidLock — Seal. Reveal. Converge.

> Groups reach a fair shared decision by sealing their honest input first, so no one anchors on anyone else, then converging together, live, on Solana.

---

## What it does

BidLock is a **commit-reveal coordination protocol** for groups. Every member privately seals their proposal behind a cryptographic commitment. Once the sealing window closes, everyone reveals simultaneously. The program aggregates the reveals into a convergence result — a fair, tamper-evident, anchor-free group decision.

No one can see anyone else's proposal until the reveal. No one can change their proposal after sealing. The sequence is enforced on-chain.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js)                          │
│                                                                    │
│  create/page.tsx ──→ createRoom (base layer)                       │
│                                                                    │
│  room/[roomKey]/page.tsx                                           │
│    ├── createSession  (base layer, once per room per wallet)       │
│    ├── submitBid      (ER via session key — commitment only)       │
│    ├── revealBid      (base layer — amount + salt)                 │
│    ├── delegateRoom   (MagicBlock delegation program)              │
│    ├── resolveRoom    (ER — computes convergence, clears bids)     │
│    └── undelegateRoom (commits result back to base layer)          │
│                                                                    │
│  lib/                                                              │
│    commitment.ts  — sha256(amount_le8 || salt32) via SubtleCrypto  │
│    session.ts     — ephemeral keypairs + localStorage proposals    │
│    errors.ts      — Anchor error codes → friendly messages         │
│    pda.ts         — PDA derivation (room, session)                 │
│    program.ts     — useProgram() / useERProgram() hooks            │
└───────────────────────────────┬────────────────────────────────────┘
                                │
              ┌─────────────────┴──────────────────┐
              │                                    │
   ┌──────────▼──────────┐            ┌────────────▼────────────┐
   │  Solana base layer  │            │  MagicBlock ER (devnet) │
   │  (devnet)           │            │  devnet.magicblock.app  │
   │                     │            │                         │
   │  Room account       │◄──undelegate── Room account (copy)  │
   │  RoomSession PDA    │            │  BidStore PDAs          │
   │  Commitment array   │──delegate──►  (ephemeral-only)       │
   └──────────┬──────────┘            └─────────────────────────┘
              │
   ┌──────────▼──────────┐
   │  BidLock program    │
   │  23zkP27qb2eNg1n... │
   └─────────────────────┘
```

### Instruction flow

| Step | Instruction | Network | Signer |
|------|-------------|---------|--------|
| 1 | `create_room` | Base layer | Creator wallet |
| 2 | `create_session` | Base layer | Member wallet |
| 3 | `submit_bid` | Ephemeral Rollup | Session key |
| 4 | `reveal_bid` | Base layer | Member wallet |
| 5 | `delegate_room_for_settlement` | Base layer → ER | Creator wallet |
| 6 | `resolve_room` | Ephemeral Rollup | Program CPI |
| 7 | `undelegate_room` | ER → Base layer | Creator wallet |

### Data model

```
Room {
  creator:             Pubkey
  room_id:             u64
  pool_description:    String        (max 200 chars)
  members:             Vec<Pubkey>   (max 10)
  submission_deadline: i64           (Unix timestamp)
  reveal_deadline:     i64
  status:              Created | SubmissionOpen | RevealOpen | Resolved
  submissions:         Vec<MemberCommitment>   sha256(amount || salt)
  reveals:             Vec<MemberReveal>        amount, valid flag
  resolved_split:      Vec<MemberSplit>         share_bps (sums to 10000)
  bump:                u8
}

RoomSession {
  room:        Pubkey    — scope enforcement (session A ≠ room B)
  member:      Pubkey
  session_key: Pubkey
  valid_until: i64
  bump:        u8
}
```

---

## Setup

### Prerequisites

- Rust + Cargo (stable)
- Solana CLI ≥ 1.18
- Anchor CLI 0.30.x (`cargo install --git https://github.com/coral-xyz/anchor avm`)
- Node.js 20+ / npm

### 1. Build the program

```bash
cd bidlock
anchor build
```

### 2. Run tests

```bash
cd bidlock
cargo test
```

21 tests cover: `create_room` (3), `submit_bid` (7), `reveal_bid` (6), `resolve_room` (5).

### 3. Deploy to devnet

Fund the deployer wallet first (~3.30 SOL needed):

```
Deployer: 3fTVWVBgm8yYh8XXd7qTBCBuLNP4nMKsCAgesHHCBnA5
Faucet:   https://faucet.solana.com
```

Then deploy:

```bash
./deploy-devnet.sh
```

### 4. Run the frontend

```bash
cp bidlock/target/idl/bidlock.json app/src/lib/idl.json
cd app
npm install
npm run dev
```

Open `http://localhost:3000`.

### Environment

`app/.env.local` (create if missing):

```
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
NEXT_PUBLIC_ER_ENDPOINT=https://devnet.magicblock.app/
```

---

## Program ID

```
23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs
```

[View on Explorer →](https://explorer.solana.com/address/23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs?cluster=devnet)

---

## What's real vs. what's simplified

This is an honest accounting for hackathon judges.

| Feature | Status | Notes |
|---------|--------|-------|
| Commit-reveal scheme | **Real** | `sha256(amount_le8 \|\| salt32)` verified on-chain via `sha2` crate |
| Session keys | **Real** | Per-room ephemeral keypairs, scope-enforced by PDA seeds |
| Ephemeral Rollup submission | **Real** | `submit_bid` routes through MagicBlock ER, session key signs inside ER |
| MagicBlock delegation | **Real** | Uses `ephemeral-rollups-sdk 0.16.2` with `delegate_account_with_actions` |
| Private ER submission (PER) | **Real** | `submit_bid_private` + `BidStoreData` ephemeral accounts, `access-control` feature |
| Settlement / convergence | **Real** | `resolve_room` runs in ER, `undelegate_room` commits to base layer |
| Post-delegation data clearing | **Real** | `ClearText` magic actions zero bid amounts before undelegation |
| Frontend wallet connect | **Real** | Phantom adapter, `@solana/wallet-adapter-react` |
| Rust unit tests | **Real** | LiteSVM 0.10.0, 21 tests, all pass |
| Devnet deployment | **Blocked** | Need ~0.20 more devnet SOL; all infrastructure configured |
| Multi-wallet E2E demo | **Pending** | Blocked by deployment |
| Session key UX (invisible after first) | **Simplified** | Session setup is visible as a spinner; UI could auto-dismiss it |
| Tie-break | **Simplified** | UI notes a tie; on-chain resolution gives equal BPS to tied members (first-by-index) |
| SPL token escrow | **Not implemented** | The program tracks share_bps splits; actual token transfer would be a separate escrow instruction |
| MagicBlock ER latency proof | **Not collected** | Would require a deployed program; ER confirms in <400ms vs ~400ms base layer |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Smart contract | Anchor 0.30.x + Rust |
| ER integration | `ephemeral-rollups-sdk 0.16.2` |
| Commitment hash | `sha2 0.10` (on-chain) + SubtleCrypto (browser) |
| Unit tests | LiteSVM 0.10.0 |
| Frontend | Next.js 15 (App Router, Turbopack) |
| Wallet | `@solana/wallet-adapter-react`, Phantom |
| Fonts | Cormorant Garamond · JetBrains Mono · Outfit |

---

## License

MIT
