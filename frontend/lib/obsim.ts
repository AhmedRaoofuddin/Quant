/**
 * Order-flow simulation that drives the matching engine: a latent fair value random walk, a
 * Poisson-style flow of limit orders clustered near the touch, aggressive market orders that
 * cross the spread, and order cancellations. Plus an inventory-aware market maker that quotes
 * around the microprice and books P&L when its quotes are hit.
 *
 * Everything is deterministic given the seed, so a session can be reproduced.
 */

import { OrderBook, Trade } from "./orderbook";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class OrderFlow {
  fair: number;
  private rand: () => number;
  private live: number[] = []; // resting flow order ids (for cancellation churn)
  vol = 1.4;

  constructor(seed: number, startTick: number) {
    this.rand = mulberry32(seed);
    this.fair = startTick;
  }

  step(book: OrderBook): Trade[] {
    const trades: Trade[] = [];

    // Latent fair value random walk, with occasional volatility bursts.
    if (this.rand() < 0.02) this.vol = 0.8 + this.rand() * 3.5;
    this.fair += gauss(this.rand) * this.vol;
    this.fair = Math.max(200, Math.min(23000, this.fair));
    const fairTick = Math.round(this.fair);

    // Cancellations: churn a slice of resting flow to keep the book realistic.
    if (this.live.length > 40) {
      const nCancel = 2 + Math.floor(this.rand() * 5);
      for (let i = 0; i < nCancel; i++) {
        const idx = Math.floor(this.rand() * this.live.length);
        const id = this.live[idx];
        book.cancel(id);
        this.live.splice(idx, 1);
      }
    }

    // New passive limit orders clustered near the touch on both sides.
    const nAdd = 5 + Math.floor(this.rand() * 9);
    for (let i = 0; i < nAdd; i++) {
      const buy = this.rand() < 0.5;
      const depth = 1 + Math.floor(-Math.log(1 - this.rand()) * 2.2); // geometric-ish, mostly near touch
      const tick = buy ? fairTick - depth : fairTick + depth;
      if (tick <= 0 || tick >= 23999) continue;
      const qty = 1 + Math.floor(Math.pow(this.rand(), 2) * 60);
      const t = book.limit(buy ? "buy" : "sell", tick, qty, "flow");
      trades.push(...t);
      // Track the id only if it rested, so it can be cancelled later (order churn).
      if (book.lastRestingId !== null) this.live.push(book.lastRestingId);
    }

    // Aggressive market orders that lift offers / hit bids and print the tape.
    const nAggr = this.rand() < 0.6 ? 1 + Math.floor(this.rand() * 2) : 0;
    for (let i = 0; i < nAggr; i++) {
      const buy = this.rand() < 0.5 + (fairTick - (book.midTick() ?? fairTick)) * 0.02;
      const qty = 1 + Math.floor(Math.pow(this.rand(), 1.5) * 40);
      trades.push(...book.market(buy ? "buy" : "sell", qty, "flow"));
    }

    return trades;
  }
}

export interface MMState {
  inventory: number;
  cash: number;
  realized: number;
  pnl: number;
  quotesBid: number | null;
  quotesAsk: number | null;
  fills: number;
  spreadTicks: number;
}

export class MarketMaker {
  inventory = 0;
  cash = 0;
  realized = 0;
  fills = 0;
  private bidId: number | null = null;
  private askId: number | null = null;
  private quoteBidTick: number | null = null;
  private quoteAskTick: number | null = null;
  quoteSize = 20;
  halfSpread = 2;
  private skew = 0.06;

  /** Refresh quotes: pull old ones, place new ones around an inventory-skewed microprice. */
  refresh(book: OrderBook) {
    if (this.bidId !== null) book.cancel(this.bidId);
    if (this.askId !== null) book.cancel(this.askId);

    const snap = book.snapshot(1);
    const center = snap.microprice ?? snap.mid;
    if (center === null) { this.bidId = this.askId = null; return; }
    const skewed = center - this.inventory * this.skew;
    const bidTick = Math.max(1, Math.floor(skewed - this.halfSpread));
    const askTick = Math.min(23999, Math.ceil(skewed + this.halfSpread));
    if (bidTick >= askTick) { this.bidId = this.askId = null; return; }

    this.quoteBidTick = bidTick;
    this.quoteAskTick = askTick;
    // Place resting quotes (tag "mm") and capture the ids the book assigned.
    book.limit("buy", bidTick, this.quoteSize, "mm");
    this.bidId = book.lastRestingId;
    book.limit("sell", askTick, this.quoteSize, "mm");
    this.askId = book.lastRestingId;
  }

  /** Attribute fills where the MM was the resting maker. */
  onTrades(trades: Trade[], midTick: number | null) {
    for (const t of trades) {
      if (t.makerId === this.bidId) {
        // Someone sold into our bid: we buy.
        this.inventory += t.qty;
        this.cash -= t.tick * t.qty;
        this.fills++;
      } else if (t.makerId === this.askId) {
        // Someone bought from our ask: we sell.
        this.inventory -= t.qty;
        this.cash += t.tick * t.qty;
        this.fills++;
      }
    }
    // Mark realized as the marked-to-mid equity minus a flat base for readability.
    if (midTick !== null) this.realized = this.cash + this.inventory * midTick;
  }

  state(midTick: number | null): MMState {
    const pnl = (this.cash + this.inventory * (midTick ?? 0)) * 0.01; // to currency
    return {
      inventory: this.inventory, cash: this.cash, realized: this.realized, pnl,
      quotesBid: this.quoteBidTick, quotesAsk: this.quoteAskTick, fills: this.fills,
      spreadTicks: this.quoteAskTick !== null && this.quoteBidTick !== null ? this.quoteAskTick - this.quoteBidTick : 0,
    };
  }
}

export interface SimHistory {
  mid: number[];
  micro: number[];
  imbalance: number[];
  pnl: number[];
}

export class Simulation {
  book = new OrderBook();
  private flow: OrderFlow;
  mm = new MarketMaker();
  steps = 0;
  history: SimHistory = { mid: [], micro: [], imbalance: [], pnl: [] };
  private static HIST = 240;

  constructor(seed = 12345, startTick = 10000) {
    this.flow = new OrderFlow(seed, startTick);
    // Seed a starting book so there is depth on both sides before trading begins.
    for (let i = 1; i <= 12; i++) {
      this.book.limit("buy", startTick - i, 10 + Math.floor(Math.random() * 40), "flow");
      this.book.limit("sell", startTick + i, 10 + Math.floor(Math.random() * 40), "flow");
    }
  }

  step(): Trade[] {
    this.steps++;
    this.mm.refresh(this.book);
    const trades = this.flow.step(this.book);
    const mid = this.book.midTick();
    this.mm.onTrades(trades, mid);

    const snap = this.book.snapshot(10);
    this.push(this.history.mid, snap.mid ?? 0);
    this.push(this.history.micro, snap.microprice ?? 0);
    this.push(this.history.imbalance, snap.imbalance);
    this.push(this.history.pnl, this.mm.state(mid).pnl);
    return trades;
  }

  private push(arr: number[], v: number) {
    arr.push(v);
    if (arr.length > Simulation.HIST) arr.shift();
  }
}
