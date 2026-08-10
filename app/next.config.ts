import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Prevent Solana packages from being bundled by the SSR runtime —
  // they depend on Node.js builtins (crypto, ws) that don't exist in the
  // Next.js edge/SSR environment. They are only ever executed in the browser.
  serverExternalPackages: [
    "@solana/web3.js",
    "@coral-xyz/anchor",
    "rpc-websockets",
    "@solflare-wallet/sdk",
    "ws",
  ],
};

export default nextConfig;
