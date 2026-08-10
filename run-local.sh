#!/usr/bin/env bash
# BidLock local development — starts validator + frontend in one command.
# The program is pre-loaded from the compiled .so, so no SOL needed to deploy.
#
# Usage:
#   ./run-local.sh              — start everything
#   ./run-local.sh airdrop <addr> — airdrop 10 SOL to a wallet on localnet
#
set -euo pipefail

PROGRAM_ID="23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs"
SO_PATH="./bidlock/target/deploy/bidlock.so"
RPC="http://127.0.0.1:8899"

# ── Airdrop helper ──────────────────────────────────────────────────
if [[ "${1:-}" == "airdrop" ]]; then
  ADDR="${2:-}"
  if [[ -z "$ADDR" ]]; then
    echo "Usage: ./run-local.sh airdrop <wallet-address>"
    exit 1
  fi
  echo "Airdropping 10 SOL to $ADDR on localnet…"
  solana airdrop 10 "$ADDR" --url "$RPC"
  solana balance "$ADDR" --url "$RPC"
  exit 0
fi

# ── Kill existing validator if running ──────────────────────────────
if pgrep -x solana-test-validator > /dev/null 2>&1; then
  echo "Stopping existing validator…"
  pkill -x solana-test-validator || true
  sleep 2
fi

# ── Start validator with program pre-loaded ─────────────────────────
echo "Starting local validator with BidLock pre-loaded…"
solana-test-validator \
  --reset \
  --bpf-program "$PROGRAM_ID" "$SO_PATH" \
  --quiet &
VALIDATOR_PID=$!

echo "Waiting for validator to be ready…"
sleep 5

# Verify
if solana program show "$PROGRAM_ID" --url "$RPC" > /dev/null 2>&1; then
  echo "✓ Program live at $PROGRAM_ID"
  echo "✓ RPC:  $RPC"
else
  echo "✗ Validator failed to start"
  kill $VALIDATOR_PID 2>/dev/null
  exit 1
fi

# ── Airdrop to configured wallet ────────────────────────────────────
MY_ADDR=$(solana address 2>/dev/null || echo "")
if [[ -n "$MY_ADDR" ]]; then
  solana airdrop 10 "$MY_ADDR" --url "$RPC" > /dev/null 2>&1 || true
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  BidLock is running on localnet."
echo ""
echo "  NEXT STEP — airdrop SOL to your Phantom wallet:"
echo "  ./run-local.sh airdrop <YOUR-PHANTOM-ADDRESS>"
echo ""
echo "  Then in Phantom: Settings → Network → Custom RPC → http://127.0.0.1:8899"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── Start frontend ──────────────────────────────────────────────────
echo "Starting frontend…"
cd app && npm run dev

# Cleanup on exit
kill $VALIDATOR_PID 2>/dev/null || true
