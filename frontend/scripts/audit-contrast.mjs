#!/usr/bin/env node
/**
 * WCAG AA contrast audit across every route.
 *
 * "The numbers are not visible" has been a recurring defect, and eyeballing a screenshot does not
 * catch it: the failures are usually one design token used somewhere it was not designed for, like
 * a swatch colour reused as 10px type, or a value that clears AA on white and quietly fails over a
 * tinted table row.
 *
 * Backgrounds are composited through the ancestor chain before measuring. Reading only the
 * element's own background returns transparent for almost everything and silently passes.
 *
 *   cd frontend && node scripts/audit-contrast.mjs
 *
 * Exits non-zero if any text node falls below 4.5:1.
 */

import puppeteer from "puppeteer";

const BASE = process.env.AF_BASE ?? "http://localhost:3000";
const ROUTES = ["/", "/markets", "/news", "/factors", "/regimes", "/book",
                "/live", "/strategies", "/capacity", "/validation", "/methodology"];
const THRESHOLD = 4.5;

/** Runs in the page. Returns every text node below the threshold. */
function audit(threshold) {
  const parse = (s) => (s.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 4).map(Number);
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

  const bgOf = (el) => {
    const layers = [];
    let e = el;
    while (e) {
      const p = parse(getComputedStyle(e).backgroundColor);
      const a = p.length > 3 ? p[3] : 1;
      if (a > 0) layers.push([p[0], p[1], p[2], a]);
      if (a >= 1) break;
      e = e.parentElement;
    }
    layers.push([255, 255, 255, 1]);          // page beneath everything
    let out = layers[layers.length - 1].slice(0, 3);
    for (let i = layers.length - 2; i >= 0; i--) {
      const [r, g, b, a] = layers[i];
      out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
    }
    return out;
  };

  const nodes = [...document.querySelectorAll("*")]
    .filter((e) => e.children.length === 0 && (e.innerText ?? "").trim().length > 0);

  const fails = [];
  let min = Infinity;
  for (const el of nodes) {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    const fg = L(parse(cs.color));
    const bg = L(bgOf(el));
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    if (ratio < min) min = ratio;
    if (ratio < threshold) {
      fails.push({
        ratio: +ratio.toFixed(2),
        text: el.innerText.trim().slice(0, 28),
        color: cs.color,
        size: cs.fontSize,
        cls: el.className.toString().slice(0, 46),
      });
    }
  }
  return { checked: nodes.length, min: Number.isFinite(min) ? +min.toFixed(2) : null, fails };
}

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1680, height: 1050 });

let total = 0, worst = Infinity;
const broken = [];

for (const route of ROUTES) {
  try {
    await page.goto(BASE + route, { waitUntil: "networkidle2", timeout: 240000 });
    // Client-rendered pages fetch after mount; wait for real content, not the skeleton.
    await page.waitForFunction(
      () => document.querySelectorAll(".skeleton").length === 0 &&
            [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && (e.innerText ?? "").trim()).length > 80,
      { timeout: 240000, polling: 500 },
    ).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));

    const res = await page.evaluate(audit, THRESHOLD);
    total += res.fails.length;
    if (res.min !== null) worst = Math.min(worst, res.min);
    const mark = res.fails.length ? "FAIL" : "ok  ";
    console.log(`${mark} ${route.padEnd(14)} ${String(res.checked).padStart(5)} nodes   min ${String(res.min).padStart(6)}   ${res.fails.length} below ${THRESHOLD}`);
    for (const f of res.fails.slice(0, 5)) {
      console.log(`       ${String(f.ratio).padStart(5)}  ${f.size.padStart(6)}  "${f.text}"  ${f.color}  ${f.cls}`);
      broken.push({ route, ...f });
    }
  } catch (e) {
    console.log(`ERR  ${route.padEnd(14)} ${e.message.split("\n")[0]}`);
  }
}

await browser.close();
console.log(`\nworst ratio across all routes: ${worst === Infinity ? "n/a" : worst}`);
if (total) {
  console.log(`${total} text nodes below ${THRESHOLD}:1. Fix the token, not the call site.`);
  process.exit(1);
}
console.log(`every text node clears WCAG AA (${THRESHOLD}:1).`);
