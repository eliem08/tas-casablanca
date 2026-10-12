import Link from "next/link";

interface FooterLink {
  href: string;
  label: string;
}

const DEMO_LINKS: FooterLink[] = [
  { href: "/demo", label: "Live Demo" },
  { href: "/book", label: "Book a Slot" },
];

const API_ENDPOINTS: string[] = ["/api/simulate", "/api/optimize"];

export default function Footer() {
  return (
    <footer className="bg-ink-950 text-white/70">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M3 3.5h18" />
                  <path d="M12 3.5v5" />
                  <path d="M12 8.5c0 3.5 4 4 4 1.5" />
                  <rect x="6.5" y="16" width="11" height="4.5" rx="1" />
                </svg>
              </span>
              <span className="font-display text-base font-semibold tracking-tight text-white">
                TAS Casablanca
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed">
              A truck appointment system concept for the Port of Casablanca, matching gate capacity to
              arrival demand.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Demo</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {DEMO_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
              {API_ENDPOINTS.map((endpoint) => (
                <li key={endpoint} className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-white/40">API</span>
                  <code className="font-mono text-xs text-white/70">{endpoint}</code>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Context</h2>
            <p className="mt-4 text-sm leading-relaxed">
              All figures shown in this demo are simulated for demonstration purposes. Crisis figures
              referenced are as reported in October 2026.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>Built as an interactive demo of appointment-system concepts for the Port of Casablanca.</p>
          <p className="tnum">2026</p>
        </div>
      </div>
    </footer>
  );
}
