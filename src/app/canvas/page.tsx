import Link from "next/link";

import { GraphCanvas } from "@/components/workbench/GraphCanvas";

/**
 * /canvas — the IA graph review surface (s21-m05). A sibling to the HTML preview
 * (/chat): it renders the active document's information architecture as a React
 * Flow graph and reuses the same comment overlay + store, so critique pinned on
 * one surface appears on the other (shared instance anchors).
 */
export default function CanvasPage() {
  return (
    <main className="flex h-screen w-screen flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-sm">
        <span className="font-semibold">IA Canvas</span>
        <Link href="/chat" className="text-indigo-300 hover:text-indigo-200">
          Preview →
        </Link>
      </header>
      <div className="min-h-0 flex-1">
        <GraphCanvas />
      </div>
    </main>
  );
}
