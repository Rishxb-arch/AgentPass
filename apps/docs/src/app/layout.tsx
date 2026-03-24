import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentPass — The Internet, Built for Agents",
  description: "Cryptographic passports, KYA trust scores, and scoped delegation tokens that replace CAPTCHAs, OTPs, and login walls for AI agents permanently.",
};

function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800 bg-[#0a0a0a]/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-white text-sm tracking-tight">
          <span className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-xs font-black">AP</span>
          AgentPass
          <span className="text-zinc-600 text-xs font-normal">v1.0</span>
        </Link>
        <div className="flex items-center gap-6 text-sm text-zinc-400">
          <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
          <Link href="/docs/trust-model" className="hover:text-white transition-colors">Trust Model</Link>
          <Link href="/docs/adapters" className="hover:text-white transition-colors">Adapters</Link>
          <Link href="/docs/identity" className="hover:text-white transition-colors">Identity</Link>
          <Link href="/docs/api" className="hover:text-white transition-colors">API</Link>
          <a href="https://github.com/agentpass/agentpass" className="hover:text-white transition-colors">GitHub</a>
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0a] text-[#ededed] min-h-screen">
        <Nav />
        <main className="pt-14">{children}</main>
      </body>
    </html>
  );
}
