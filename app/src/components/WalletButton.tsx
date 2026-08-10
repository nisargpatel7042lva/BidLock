"use client";

import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortenAddress } from "@/lib/pda";

const WalletModalProvider = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletModalProvider),
  { ssr: false }
);

export function WalletButton({ className }: { className?: string }) {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <div className={`flex items-center gap-3 ${className ?? ""}`}>
        <span
          className="mono"
          style={{
            color: "var(--text-2)",
            fontSize: 12,
            letterSpacing: "0.08em",
          }}
        >
          {shortenAddress(publicKey.toBase58(), 5)}
        </span>
        <button
          onClick={disconnect}
          className="btn-ghost"
          style={{ padding: "7px 16px", fontSize: 11 }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className={`btn-gold ${className ?? ""}`}
    >
      Connect Wallet
    </button>
  );
}
