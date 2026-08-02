#!/usr/bin/env node
/**
 * Logo coverage audit.
 *
 * Every ticker in the universe must resolve to a real company mark, not a monogram and not a
 * placeholder. Two failure modes are easy to miss by eye:
 *
 *   1. A ticker missing from DOMAINS resolves to null and drops straight to initials.
 *   2. DuckDuckGo answers unknown domains with a generic globe: a valid 48x48 PNG under HTTP 404.
 *      The browser loads it fine, so `onError` never fires and the globe is painted as if it were
 *      the logo. Only a byte comparison against the known placeholder catches this.
 *
 * Run from frontend/:  node scripts/audit-logos.mjs
 * Exits non-zero if any ticker would fail to show a real mark.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const domainsBlock = read("../lib/logos.ts").split("const DOMAINS")[1].split("};")[0];
const DOMAINS = Object.fromEntries(
  [...domainsBlock.matchAll(/([A-Z]{1,5}):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
const blankBlock = read("../lib/logos.ts").split("const DDG_BLANK = new Set([")[1].split("]);")[0];
const DDG_BLANK = new Set([...blankBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]));

const TICKERS = [...read("../lib/universe.ts").matchAll(/\{ symbol: "([A-Z.]+)", name: "([^"]*)"/g)]
  .map((m) => ({ symbol: m[1], name: m[2] }));

const sha = (b) => createHash("sha1").update(b).digest("hex");
const grab = async (url) => {
  try {
    const r = await fetch(url, { redirect: "follow" });
    return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
  } catch (e) {
    return { status: "ERR", buf: Buffer.alloc(0), err: e.message };
  }
};

// Fingerprint the placeholder from a domain that certainly has no icon.
const placeholder = sha((await grab("https://icons.duckduckgo.com/ip3/nope-xyzzy-999.invalid.ico")).buf);

const dims = (b) => {
  if (b.length > 24 && b.toString("ascii", 1, 4) === "PNG") return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
  if (b.length > 8 && b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1) return `ico ${b[6] || 256}x${b[7] || 256}`;
  return `${b.length}b`;
};

const rows = [];
for (const t of TICKERS) {
  const domain = DOMAINS[t.symbol];
  if (!domain) { rows.push({ ...t, verdict: "UNMAPPED" }); continue; }

  // Mirror lib/logos.ts source order exactly.
  const chain = DDG_BLANK.has(domain)
    ? [["google", `https://www.google.com/s2/favicons?domain=${domain}&sz=128`]]
    : [["ddg", `https://icons.duckduckgo.com/ip3/${domain}.ico`],
       ["google", `https://www.google.com/s2/favicons?domain=${domain}&sz=128`]];

  let landed = null;
  for (const [provider, url] of chain) {
    const { status, buf } = await grab(url);
    if (provider === "ddg" && (sha(buf) === placeholder || buf.length === 0)) continue; // globe or empty
    if (status === 200 && buf.length > 0) { landed = { provider, size: dims(buf) }; break; }
  }
  rows.push({ ...t, domain, verdict: landed ? "ok" : "NO REAL MARK", ...landed });
}

const bad = rows.filter((r) => r.verdict !== "ok");
console.log(`\nLogo audit: ${rows.length - bad.length}/${rows.length} tickers resolve to a real mark\n`);
const byProvider = {};
for (const r of rows.filter((r) => r.verdict === "ok")) byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;
for (const [p, n] of Object.entries(byProvider)) console.log(`  ${p.padEnd(8)} ${n}`);

if (bad.length) {
  console.log("\nFAILING:");
  for (const b of bad) console.log(`  ${b.symbol.padEnd(6)} ${String(b.domain ?? "-").padEnd(28)} ${b.verdict}`);
  console.log("\nFix: add or correct the domain in lib/logos.ts, or add it to DDG_BLANK.");
  process.exit(1);
}
console.log("\nAll tickers covered.\n");
