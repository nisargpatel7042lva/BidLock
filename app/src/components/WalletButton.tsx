"use client";

import dynamic from "next/dynamic";

// WalletMultiButton handles: open modal when disconnected, show address + menu when connected.
// Must be dynamically imported with ssr:false — it uses browser APIs on load.
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false, loading: () => <span className="wallet-btn-skeleton" /> }
);

export function WalletButton({ className }: { className?: string }) {
  return <WalletMultiButton className={`bidlock-wallet-btn ${className ?? ""}`} />;
}
