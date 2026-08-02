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
  { name: "news",       path: "/news",       ready: () => document.querySelectorAll("article, li").length > 5 },
  { name: "book",       path: "/book",       ready: () => document.querySelectorAll("table tbody tr").length > 5 },
];

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

await browser.close();
console.log(`\nwrote to ${OUT}`);
