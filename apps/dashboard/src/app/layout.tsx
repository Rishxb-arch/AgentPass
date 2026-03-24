import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentPass Dashboard",
  description: "AgentPass agent management and monitoring dashboard",
};

const navItems = [
  { href: "/", label: "Overview", icon: "◈" },
  { href: "/issue", label: "Issue Passport", icon: "⊕" },
  { href: "/kya", label: "KYA Assessment", icon: "◎" },
  { href: "/delegation", label: "Delegation", icon: "⇥" },
  { href: "/browser", label: "Live Browser", icon: "◉" },
  { href: "/adapters", label: "Adapters", icon: "⊞" },
  { href: "/audit", label: "Audit Log", icon: "≡" },
  { href: "/verify", label: "Verify Token", icon: "✓" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0a] text-[#ededed] min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-56 min-h-screen border-r border-zinc-800 flex flex-col shrink-0 sticky top-0 h-screen">
          <div className="px-4 py-5 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-xs font-black text-white">AP</div>
              <div>
                <div className="text-white text-sm font-bold">AgentPass</div>
                <div className="text-zinc-600 text-xs">Dashboard v1.0</div>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-all text-sm group"
              >
                <span className="text-zinc-600 group-hover:text-blue-500 transition-colors">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="px-4 py-4 border-t border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Protocol Active
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-h-screen overflow-auto">{children}</main>
      </body>
    </html>
  );
}
