#!/usr/bin/env bash
# BidLock devnet deployment script.
# Run this from the repo root after funding the deployer wallet.
#
# Deployer wallet: 3fTVWVBgm8yYh8XXd7qTBCBuLNP4nMKsCAgesHHCBnA5
# Program ID:      23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs
# Cost:            ~3.29 SOL (rent-exempt program data account)
#
# Before running:
#   1. Visit https://faucet.solana.com in a browser
#   2. Request SOL for: 3fTVWVBgm8yYh8XXd7qTBCBuLNP4nMKsCAgesHHCBnA5
#   3. You need at least 3.30 SOL total on devnet
#
set -euo pipefail

PROGRAM_ID="23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs"
SO_PATH="./bidlock/target/deploy/bidlock.so"
KEYPAIR_PATH="./bidlock/target/deploy/bidlock-keypair.json"

echo "=== BidLock devnet deployment ==="
echo "Deployer: $(solana address)"
echo "Balance:  $(solana balance --url devnet)"
echo ""

# Build (in case the .so is stale)
echo "[1/3] Building program..."
cd bidlock && anchor build 2>&1 | tail -3; cd ..

echo ""
echo "[2/3] Deploying to devnet..."
solana program deploy \
  "$SO_PATH" \
  --program-id "$KEYPAIR_PATH" \
  --url devnet \
  --keypair ~/.config/solana/id.json

echo ""
echo "[3/3] Verifying deployment..."
solana program show "$PROGRAM_ID" --url devnet

echo ""
echo "✓ Program deployed at: $PROGRAM_ID"
echo "✓ Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo ""
echo "Rebuild the frontend IDL copy and restart the dev server:"
echo "  cp bidlock/target/idl/bidlock.json app/src/lib/idl.json"
echo "  cd app && npm run dev"
