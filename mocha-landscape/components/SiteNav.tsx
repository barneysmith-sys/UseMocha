"use client";

import { useEffect, useState } from "react";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#preview", label: "Preview" },
  { href: "#pathways", label: "Pathways" },
];

export function SiteNav({ onStart }: { onStart: () => void }) {
  const [tone, setTone] = useState<"cobalt" | "paper">("cobalt");

  useEffect(() => {
    const update = () => {
      const stack = document.elementsFromPoint(window.innerWidth / 2, 72);
      const surface = stack
        .map((node) => (node instanceof Element ? node.closest("[data-surface]") : null))
        .find((node): node is HTMLElement => node instanceof HTMLElement);
      setTone(surface?.dataset.surface === "paper" ? "paper" : "cobalt");
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const onCobalt = tone === "cobalt";

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        onCobalt ? "text-white" : "border-b border-line bg-paper/92 text-ink backdrop-blur-md"
      }`}
    >
      <div className="mx-auto flex h-[68px] max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <a href="#top" className="wordmark text-[15px]">
          mocha
        </a>
        <nav aria-label="Primary" className="hidden items-center gap-7 text-[14px] md:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className={onCobalt ? "text-white/80 hover:text-white" : "text-muted hover:text-ink"}>
              {link.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={onStart}
          className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium tracking-[-0.01em] ${
            onCobalt ? "border border-white/45 text-white hover:bg-white hover:text-cobalt" : "bg-blue text-white hover:bg-[#0440C4]"
          }`}
        >
          New interview
        </button>
      </div>
    </header>
  );
}
