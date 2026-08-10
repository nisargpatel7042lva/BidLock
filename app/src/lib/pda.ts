"use client";

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey(
  "23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs"
);
const ROOM_SEED        = "room";
const ROOM_SESSION_SEED = "room_session";

export function roomPda(creator: PublicKey, roomId: BN): PublicKey {
  const idBytes = roomId.toArrayLike(Buffer, "le", 8);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(ROOM_SEED), creator.toBuffer(), idBytes],
    PROGRAM_ID
  );
  return pda;
}

export function sessionPda(room: PublicKey, member: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(ROOM_SESSION_SEED), room.toBuffer(), member.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

export function shortenAddress(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}
