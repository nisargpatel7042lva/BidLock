"use client";

/** sha256(amount_le_8 || salt_32) — mirrors the on-chain reveal_bid logic. */
export async function computeCommitment(
  amount: bigint,
  salt: Uint8Array
): Promise<Uint8Array> {
  const amountBuf = new Uint8Array(8);
  new DataView(amountBuf.buffer).setBigUint64(0, amount, true);
  const data = new Uint8Array(amountBuf.length + salt.length);
  data.set(amountBuf, 0);
  data.set(salt, 8);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

export function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
