"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import IDL from "./idl.json";

// We use Program<any> so the thin Bidlock type doesn't constrain Anchor method resolution.
// The actual runtime methods are derived from the IDL at construction time.

function makeProgram(connection: Connection, wallet: any): Program<any> | null {
  if (!wallet.publicKey || !wallet.signTransaction) return null;
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    },
    { commitment: "confirmed" }
  );
  return new Program<any>(IDL as any, provider);
}

export function useProgram(): Program<any> | null {
  const { connection } = useConnection();
  const wallet = useWallet();
  return useMemo(
    () => makeProgram(connection, wallet),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]
  );
}

export function useERProgram(): Program<any> | null {
  const wallet = useWallet();
  const erEndpoint =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_ER_ENDPOINT ?? "http://localhost:7799")
      : "http://localhost:7799";

  return useMemo(() => {
    const erConnection = new Connection(erEndpoint, { commitment: "confirmed" });
    return makeProgram(erConnection, wallet);
  }, [erEndpoint, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);
}
