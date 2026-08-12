"use client";

import { Keypair } from "@solana/web3.js";

const PREFIX = "bl_sk_";
const PROPOSAL_PREFIX = "bl_proposal_";

/** Returns the stored session keypair, or null if none has been created yet. */
export function getSessionKey(roomKey: string): Keypair | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(PREFIX + roomKey);
  if (!stored) return null;
  try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored))); }
  catch { return null; }
}

/** Returns the stored keypair or creates and persists a new one. */
export function getOrCreateSessionKey(roomKey: string): Keypair {
  if (typeof window === "undefined") return Keypair.generate();
  const existing = getSessionKey(roomKey);
  if (existing) return existing;
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
