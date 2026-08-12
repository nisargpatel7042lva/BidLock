"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import IDL from "./idl.json";

const ER_ENDPOINT =
  process.env.NEXT_PUBLIC_ER_ENDPOINT ?? "https://devnet.magicblock.app/";
const ROUTER_ENDPOINT =
  process.env.NEXT_PUBLIC_ROUTER_ENDPOINT ?? "https://devnet-router.magicblock.app/";

/** True when the app is pointed at a local test-validator. */
export const IS_LOCALNET =
  (process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "").includes("127.0.0.1") ||
  (process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "").includes("localhost");

function makeProgram(connection: Connection, wallet: any): Program<any> | null {
  if (!wallet.publicKey || !wallet.signTransaction) return null;
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    },
    { commitment: "confirmed", preflightCommitment: "processed", skipPreflight: true }
  );
  return new Program<any>(IDL as any, provider);
}

/** Base-layer program — reads, create_room, create_session, reveal_bid */
export function useProgram(): Program<any> | null {
  const { connection } = useConnection();
  const wallet = useWallet();
  return useMemo(
    () => makeProgram(connection, wallet),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]
  );
}

/** ER program — submit_bid via ephemeral rollup (~10-50ms) */
export function useERProgram(): Program<any> | null {
  const wallet = useWallet();
  return useMemo(() => {
    const erConnection = new Connection(ER_ENDPOINT, {
      commitment: "confirmed",
      disableRetryOnRateLimit: true,
    });
    return makeProgram(erConnection, wallet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);
}

/** Query the MagicBlock router for the live ER fqdn of a delegated account. */
export async function getDelegationStatus(accountPubkey: PublicKey): Promise<{
  isDelegated: boolean;
  fqdn: string | null;
}> {
  try {
    const res = await fetch(ROUTER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getDelegationStatus",
        params: [accountPubkey.toBase58()],
      }),
    });
    if (!res.ok) return { isDelegated: false, fqdn: null };
    const json = await res.json();
    const result = json?.result;
    if (!result || !result.isDelegated) return { isDelegated: false, fqdn: null };
    return { isDelegated: true, fqdn: result.fqdn ?? ER_ENDPOINT };
  } catch {
    return { isDelegated: false, fqdn: null };
  }
}

/** Build an Anchor Program pointed at the live ER fqdn for a delegated account. */
export function makeERProgramAtFqdn(fqdn: string, wallet: any): Program<any> | null {
  const erConnection = new Connection(fqdn, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true,
  });
  return makeProgram(erConnection, wallet);
}
