#!/usr/bin/env node
/**
 * Capture the running terminal for the product video.
 *
 * Requires the dev server on :3000. Waits for each page's data to actually arrive before
 * shooting, so no screenshot shows a loading skeleton.
 *
 *   cd frontend && node scripts/capture-ui.mjs
 */

import puppeteer from "puppeteer";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "..", "media", "ui");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";

// `ready` is a predicate evaluated in the page: the screenshot waits for real content.
const PAGES = [
  { name: "screener",   path: "/",           ready: () => document.querySelectorAll("table tbody tr").length > 20 },
  { name: "strategies", path: "/strategies", ready: () => document.body.innerText.includes("CAPACITY LADDER") },
  { name: "capacity",   path: "/capacity",   ready: () => document.querySelectorAll("svg path").length > 3 },
  { name: "validation", path: "/validation", ready: () => /PBO|OVERFIT|ROBUST|FRAGILE/.test(document.body.innerText) },
  { name: "factors",    path: "/factors",    ready: () => document.querySelectorAll('[title*="·"]').length > 20 },
  { name: "markets",    path: "/markets",    ready: () => document.querySelectorAll("svg").length > 4 },
  { name: "news",       path: "/news",       ready: () => document.body.innerText.includes("News") && document.querySelectorAll("a[href^='http']").length > 5 },
  { name: "book",       path: "/book",       ready: () => document.querySelectorAll("table tbody tr, .mono").length > 10 },
];

/**
 * Chart groups that sit below the fold. Each entry names the panel headings to frame, and the
 * shot is clipped to their combined bounding box. Targeting the cards beats guessing at scroll
 * offsets, which drift the moment the layout changes.
 */
const GROUPS = [
  { name: "candles",       path: "/", panels: ["Candlesticks", "GBM Monte Carlo"] },
  { name: "gbm",           path: "/", panels: ["GBM Monte Carlo"] },
  { name: "blackscholes",  path: "/", panels: ["Option greeks", "Black-Scholes call surface"] },
  { name: "surface",       path: "/", panels: ["Volatility surface", "Risk / return map"] },
  // "Return distribution" appears twice on this page, so cap at the first row of four.
  { name: "distributions", path: "/", limit: 4,
    panels: ["Sharpe distribution", "Return distribution",
             "Volatility distribution", "Beta distribution"] },
  { name: "correlation",   path: "/", panels: ["Correlation matrix"] },
];

/**
 * Union bounding box of the cards whose heading matches one of `titles`, in page coordinates.
 * `limit` keeps the first N in document order, for titles that repeat down the page.
 */
function boxOf(titles, limit) {
  let cards = [...document.querySelectorAll("section.card")].filter((c) => {
    const h = c.querySelector("h3");
    return h && titles.includes(h.innerText.trim());
  });
  if (limit) cards = cards.slice(0, limit);
  if (!cards.length) return null;
  const r = cards.map((c) => c.getBoundingClientRect());
  return {
    x: Math.min(...r.map((b) => b.left)) + window.scrollX,
    y: Math.min(...r.map((b) => b.top)) + window.scrollY,
    right: Math.max(...r.map((b) => b.right)) + window.scrollX,
    bottom: Math.max(...r.map((b) => b.bottom)) + window.scrollY,
    found: cards.length,
  };
}

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050, deviceScaleFactor: 1.4 });

for (const p of PAGES) {
  try {
    await page.goto(BASE + p.path, { waitUntil: "networkidle2", timeout: 180000 });
    await page.waitForFunction(p.ready, { timeout: 180000, polling: 500 });
    // Let entrance transitions settle and lazy images decode.
    await page.evaluate(() => {
      for (const i of document.querySelectorAll("img")) i.loading = "eager";
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 1200));

    const file = `${OUT}/${p.name}.png`;
    await page.screenshot({ path: file });
    const dims = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    console.log(`${p.name.padEnd(12)} ${p.path.padEnd(13)} captured ${dims[0]}x${dims[1]}`);
  } catch (e) {
    console.log(`${p.name.padEnd(12)} ${p.path.padEnd(13)} FAILED: ${e.message.split("\n")[0]}`);
  }
}

// Chart groups: load the page once, then clip a shot per group.
const byPath = [...new Set(GROUPS.map((g) => g.path))];
for (const path of byPath) {
  const ready = PAGES.find((p) => p.path === path)?.ready;
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle2", timeout: 180000 });
    if (ready) await page.waitForFunction(ready, { timeout: 180000, polling: 500 });
    // Charts animate in on first paint, so scroll the whole page to trigger them, then settle.
    await page.evaluate(async () => {
      for (const i of document.querySelectorAll("img")) i.loading = "eager";
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 90));
      }
    });
    await new Promise((r) => setTimeout(r, 2500));

    for (const g of GROUPS.filter((x) => x.path === path)) {
      const box = await page.evaluate(boxOf, g.panels, g.limit ?? 0);
      if (!box) {
        console.log(`${g.name.padEnd(14)} panels not found: ${g.panels.join(", ")}`);
        continue;
      }
      const pad = 14;
      const clip = {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.right - box.x + pad * 2,
        height: box.bottom - box.y + pad * 2,
      };
      await page.screenshot({ path: `${OUT}/${g.name}.png`, clip, captureBeyondViewport: true });
      console.log(`${g.name.padEnd(14)} ${g.panels.length} panel(s), ${box.found} matched  ` +
                  `${Math.round(clip.width)}x${Math.round(clip.height)}`);
    }
  } catch (e) {
    console.log(`groups on ${path} FAILED: ${e.message.split("\n")[0]}`);
  }
}

await browser.close();
console.log(`\nwrote to ${OUT}`);
