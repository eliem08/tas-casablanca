import { describe, it, expect } from "vitest";
import { FORMULATION, CITATIONS, METHODS } from "../lib/formulation";

describe("formal problem statement", () => {
  it("covers all required blocks", () => {
    const headings = FORMULATION.map((b) => b.heading);
    for (const h of [
      "Sets",
      "Parameters",
      "Decision variables",
      "Objective (deterministic core)",
      "Constraints",
      "Complexity",
      "Honest mapping — what the model is NOT",
    ]) {
      expect(headings).toContain(h);
    }
    for (const block of FORMULATION) {
      expect(block.lines.length).toBeGreaterThan(0);
      for (const line of block.lines) {
        expect(line.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("objective mentions the decision variables and weights", () => {
    const obj = FORMULATION.find((b) =>
      b.heading.startsWith("Objective"),
    )!;
    const text = obj.lines.join(" ");
    expect(text).toContain("x_{i,g,s}");
    expect(text).toContain("w_peak");
    expect(text).toContain("CO₂");
  });
});

describe("verified citations", () => {
  it("every citation has authors, year, title, venue", () => {
    expect(CITATIONS.length).toBeGreaterThanOrEqual(5);
    for (const c of CITATIONS) {
      expect(c.authors.trim().length).toBeGreaterThan(0);
      expect(c.year).toBeGreaterThanOrEqual(2000);
      expect(c.year).toBeLessThanOrEqual(2026);
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.venue.trim().length).toBeGreaterThan(0);
      expect(c.relevance.trim().length).toBeGreaterThan(0);
    }
  });

  it("includes the three anchor papers with verified DOIs", () => {
    const byDoi = new Map(CITATIONS.map((c) => [c.doi, c]));
    expect(byDoi.get("10.1061/(ASCE)0733-947X(2008)134:8(347)")?.authors).toContain(
      "Huynh",
    );
    expect(byDoi.get("10.1016/j.tre.2015.01.004")?.authors).toContain("Phan");
    expect(
      CITATIONS.some(
        (c) => c.authors.includes("Zehendner") && c.year === 2014,
      ),
    ).toBe(true);
    expect(byDoi.get("10.1016/j.tre.2013.03.008")?.authors).toContain("Chen");
  });

  it("DOI links are well-formed when present", () => {
    for (const c of CITATIONS) {
      if (c.doi) {
        expect(c.doi).toMatch(/^10\.\d+\//);
        expect(c.url).toBe(`https://doi.org/${c.doi}`);
      }
    }
  });
});

describe("method ladder", () => {
  it("documents guarantees for every method", () => {
    expect(METHODS.length).toBeGreaterThanOrEqual(6);
    for (const m of METHODS) {
      expect(m.name.trim().length).toBeGreaterThan(0);
      expect(m.guarantee.trim().length).toBeGreaterThan(0);
      expect(m.complexity.trim().length).toBeGreaterThan(0);
      expect(m.file.startsWith("lib/")).toBe(true);
    }
  });

  it("exact method claims proof, heuristics do not", () => {
    const exact = METHODS.find((m) => m.name.includes("Branch-and-bound"))!;
    expect(exact.guarantee).toMatch(/PROVES optimality/i);
    const greedy = METHODS.find((m) => m.name.includes("Greedy"))!;
    expect(greedy.guarantee).toMatch(/no optimality guarantee/i);
  });
});
