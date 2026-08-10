export type Bidlock = {
  address: "23zkP27qb2eNg1nxKovh3zTLiLKXccKoRHRH6wukMYEs";
  metadata: { name: "bidlock"; version: "0.1.0"; spec: "0.1.0" };
  accounts: [
    { name: "room" },
    { name: "roomSession" }
  ];
};

// Runtime account shapes returned by program.account.room.fetch()
export interface RoomAccount {
  creator: import("@solana/web3.js").PublicKey;
  roomId:  { toNumber(): number };
  poolDescription: string;
  members: import("@solana/web3.js").PublicKey[];
  submissionDeadline: { toNumber(): number };
  revealDeadline: { toNumber(): number };
  status: { created?: {} } | { submissionOpen?: {} } | { revealOpen?: {} } | { resolved?: {} };
  submissions: { member: import("@solana/web3.js").PublicKey; commitment: number[] }[];
  reveals: { member: import("@solana/web3.js").PublicKey; amount: { toNumber(): number }; valid: boolean }[];
  resolvedSplit: { member: import("@solana/web3.js").PublicKey; shareBps: number }[];
  privateSubmitters: import("@solana/web3.js").PublicKey[];
  bump: number;
}

export type RoomStatus = "created" | "submissionOpen" | "revealOpen" | "resolved";

export function getRoomStatus(room: RoomAccount): RoomStatus {
  if ("created" in room.status) return "created";
  if ("submissionOpen" in room.status) return "submissionOpen";
  if ("revealOpen" in room.status) return "revealOpen";
  return "resolved";
}
