import Link from "next/link";
import { FORMULATION, CITATIONS, METHODS } from "@/lib/formulation";
import { Container, SectionHeading } from "@/components/ui";

/**
 * /methodology — the formal problem statement, the method ladder with
 * guarantees, and the verified literature. Renders lib/formulation.ts so
 * the docs cannot drift from the code.
 */
export default function MethodologyPage() {
  return (
    <div className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          align="left"
          eyebrow="Methodology"
          title="The problem, stated formally"
          sub="This page writes down exactly what the optimizer solves: sets, parameters, decision variables, objective, constraints, complexity — and where the demo honestly simplifies the real world. Every citation was verified to exist."
        />

        <div className="mt-8 space-y-6">
          {FORMULATION.map((block) => (
            <section key={block.heading} className="card">
              <h2 className="font-display text-xl font-semibold text-ink-950">
                {block.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {block.lines.map((line, i) => (
                  <li key={i} className="text-sm leading-relaxed text-ink-900/75">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="card mt-6">
          <h2 className="font-display text-xl font-semibold text-ink-950">
            Method ladder — what each algorithm guarantees
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wider text-ink-900/50">
                  <th className="py-2 pr-3 font-semibold">Method</th>
                  <th className="py-2 pr-3 font-semibold">Guarantee</th>
                  <th className="py-2 pr-3 font-semibold">Complexity</th>
                  <th className="py-2 font-semibold">Code</th>
                </tr>
              </thead>
              <tbody>
                {METHODS.map((m) => (
                  <tr key={m.name} className="border-b border-ink-900/5 align-top">
                    <td className="py-2.5 pr-3 font-semibold text-ink-950">{m.name}</td>
                    <td className="py-2.5 pr-3 text-ink-900/75">{m.guarantee}</td>
                    <td className="py-2.5 pr-3 text-ink-900/75">{m.complexity}</td>
                    <td className="py-2.5 font-mono text-xs text-ink-900/60">{m.file}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card mt-6">
          <h2 className="font-display text-xl font-semibold text-ink-950">
            Literature — the papers this system stands on
          </h2>
          <p className="mt-2 text-sm text-ink-900/60">
            All citations verified (journal, volume, pages, DOI where shown).
            No citation is invented.
          </p>
          <ol className="mt-4 space-y-4">
            {CITATIONS.map((c) => (
              <li key={`${c.authors}-${c.year}`} className="text-sm leading-relaxed">
                <p className="text-ink-950">
                  <span className="font-semibold">{c.authors}</span> ({c.year}).{" "}
                  <em>{c.title}</em> {c.venue}.
                  {c.doi ? (
                    <>
                      {" "}
                      DOI:{" "}
                      <a
                        href={c.url ?? `https://doi.org/${c.doi}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 underline"
                      >
                        {c.doi}
                      </a>
                    </>
                  ) : c.url ? (
                    <>
                      {" "}
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 underline"
                      >
                        Source
                      </a>
                    </>
                  ) : null}
                </p>
                <p className="mt-1 text-ink-900/60">{c.relevance}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo" className="btn-primary">
            See it in the demo →
          </Link>
          <Link
            href="/book"
            className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30"
          >
            Try booking as a carrier
          </Link>
        </div>
      </Container>
    </div>
  );
}
