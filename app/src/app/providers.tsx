"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

const ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

// solana-test-validator serves HTTP on :8899 and WebSocket on :8900.
// @solana/web3.js naively derives ws://host:8899 from http://host:8899,
// which is the wrong port — confirmations never arrive via WS and fall
// back to 30s polling. Fix: derive the correct WS URL explicitly.
function deriveWsEndpoint(http: string): string {
  if (http.includes("127.0.0.1") || http.includes("localhost")) {
    return http.replace(/^http:/, "ws:").replace(/:8899\b/, ":8900");
  }
  return http.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

const WS_ENDPOINT = deriveWsEndpoint(ENDPOINT);

export default function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider
      endpoint={ENDPOINT}
      config={{ wsEndpoint: WS_ENDPOINT, confirmTransactionInitialTimeout: 120_000 }}
    >
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
