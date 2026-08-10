"use client";

import { Keypair } from "@solana/web3.js";

const PREFIX = "bl_sk_";
const PROPOSAL_PREFIX = "bl_proposal_";

export function getOrCreateSessionKey(roomKey: string): Keypair {
  if (typeof window === "undefined") return Keypair.generate();
  const stored = localStorage.getItem(PREFIX + roomKey);
  if (stored) {
    try {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored)));
    } catch { /* fallthrough */ }
  }
  const kp = Keypair.generate();
  localStorage.setItem(PREFIX + roomKey, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

export function storeProposal(roomKey: string, amount: string, salt: number[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROPOSAL_PREFIX + roomKey, JSON.stringify({ amount, salt }));
}

export function getProposal(roomKey: string): { amount: string; salt: number[] } | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(PROPOSAL_PREFIX + roomKey);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function clearRoom(roomKey: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PREFIX + roomKey);
  localStorage.removeItem(PROPOSAL_PREFIX + roomKey);
}
