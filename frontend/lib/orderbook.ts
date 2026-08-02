/**
 * A price-time-priority limit order book and matching engine.
 *
 * This is a faithful TypeScript mirror of the C++ engine (backend/, compiled and unit-tested;
 * the browser build runs this so the terminal is live with no server). Prices are integer ticks
 * for exact comparisons. Each price level is a FIFO queue, so matching respects price priority
 * first and time priority second, with partial fills. Market and limit orders are supported.
 */

export type Side = "buy" | "sell";

export interface Order {
  id: number;
  side: Side;
  tick: number;      // price in ticks
  qty: number;       // original size
  remaining: number; // unfilled size
  ts: number;        // sequence number (time priority)
  tag: string;       // "flow" | "mm" ... for coloring
}

export interface Trade {
  tick: number;
  qty: number;
  aggressor: Side;
  makerId: number;
  takerId: number;
  ts: number;
}

export interface Level {
  tick: number;
  qty: number;
  orders: number; // order count at this level
}

export interface BookSnapshot {
  bids: Level[]; // best first (descending price)
  asks: Level[]; // best first (ascending price)
  bestBid: number | null;
  bestAsk: number | null;
  mid: number | null;
  spreadTicks: number | null;
  microprice: number | null;
  imbalance: number;   // (bidQty - askQty) / (bidQty + askQty) over shown depth, [-1, 1]
  lastTrade: Trade | null;
}

export const TICK_SIZE = 0.01;
export const MAX_TICKS = 24000; // price up to 240.00

export class OrderBook {
  private bidQty = new Float64Array(MAX_TICKS);
  private askQty = new Float64Array(MAX_TICKS);
  private bidQ: Order[][] = Array.from({ length: MAX_TICKS }, () => []);
  private askQ: Order[][] = Array.from({ length: MAX_TICKS }, () => []);
  private index = new Map<number, { side: Side; tick: number }>();
  private bestBidTick: number | null = null;
  private bestAskTick: number | null = null;
  private seq = 0;

  // Telemetry.
  ordersProcessed = 0;
  tradesCount = 0;
  volume = 0;
  lastTrade: Trade | null = null;
  lastRestingId: number | null = null; // id of the most recent order that rested (null if fully filled)
  readonly recentTrades: Trade[] = [];
  private static readonly TAPE = 64;

  get bestBid(): number | null { return this.bestBidTick; }
  get bestAsk(): number | null { return this.bestAskTick; }

  /** Submit a limit order. Returns the trades it generated (empty if it fully rested). */
  limit(side: Side, tick: number, qty: number, tag = "flow"): Trade[] {
    this.ordersProcessed++;
    const order: Order = { id: ++this.seq, side, tick, qty, remaining: qty, ts: this.seq, tag };
    const trades = this.match(order, tick);
    if (order.remaining > 0) { this.rest(order); this.lastRestingId = order.id; }
    else { this.index.delete(order.id); this.lastRestingId = null; }
    return trades;
  }

  /** Submit a market order for `qty`. Returns the trades. Any unfilled remainder is dropped. */
  market(side: Side, qty: number, tag = "flow"): Trade[] {
    this.ordersProcessed++;
    const limitTick = side === "buy" ? MAX_TICKS - 1 : 0;
    const order: Order = { id: ++this.seq, side, tick: limitTick, qty, remaining: qty, ts: this.seq, tag };
    const trades = this.match(order, limitTick);
    this.index.delete(order.id);
    return trades;
  }

  /** Cancel a resting order by id. Returns true if it was found. */
  cancel(id: number): boolean {
    const loc = this.index.get(id);
    if (!loc) return false;
    const q = loc.side === "buy" ? this.bidQ[loc.tick] : this.askQ[loc.tick];
    const i = q.findIndex((o) => o.id === id);
    if (i < 0) return false;
    const [o] = q.splice(i, 1);
    if (loc.side === "buy") {
      this.bidQty[loc.tick] -= o.remaining;
      if (this.bidQty[loc.tick] <= 1e-9 && loc.tick === this.bestBidTick) this.bestBidTick = this.scanDown(loc.tick - 1);
    } else {
      this.askQty[loc.tick] -= o.remaining;
      if (this.askQty[loc.tick] <= 1e-9 && loc.tick === this.bestAskTick) this.bestAskTick = this.scanUp(loc.tick + 1);
    }
    this.index.delete(id);
    return true;
  }

  private match(order: Order, limitTick: number): Trade[] {
    const trades: Trade[] = [];
    if (order.side === "buy") {
      while (order.remaining > 0 && this.bestAskTick !== null && this.bestAskTick <= limitTick) {
        const tick = this.bestAskTick;
        const q = this.askQ[tick];
        const maker = q[0];
        const fill = Math.min(order.remaining, maker.remaining);
        maker.remaining -= fill;
        order.remaining -= fill;
        this.askQty[tick] -= fill;
        const trade: Trade = { tick, qty: fill, aggressor: "buy", makerId: maker.id, takerId: order.id, ts: ++this.seq };
        trades.push(trade);
        this.record(trade);
        if (maker.remaining <= 1e-9) { q.shift(); this.index.delete(maker.id); }
        if (this.askQty[tick] <= 1e-9) this.bestAskTick = this.scanUp(tick + 1);
      }
    } else {
      while (order.remaining > 0 && this.bestBidTick !== null && this.bestBidTick >= limitTick) {
        const tick = this.bestBidTick;
        const q = this.bidQ[tick];
        const maker = q[0];
        const fill = Math.min(order.remaining, maker.remaining);
        maker.remaining -= fill;
        order.remaining -= fill;
        this.bidQty[tick] -= fill;
        const trade: Trade = { tick, qty: fill, aggressor: "sell", makerId: maker.id, takerId: order.id, ts: ++this.seq };
        trades.push(trade);
        this.record(trade);
        if (maker.remaining <= 1e-9) { q.shift(); this.index.delete(maker.id); }
        if (this.bidQty[tick] <= 1e-9) this.bestBidTick = this.scanDown(tick - 1);
      }
    }
    return trades;
  }

  private rest(order: Order) {
    if (order.side === "buy") {
      this.bidQ[order.tick].push(order);
      this.bidQty[order.tick] += order.remaining;
      if (this.bestBidTick === null || order.tick > this.bestBidTick) this.bestBidTick = order.tick;
    } else {
      this.askQ[order.tick].push(order);
      this.askQty[order.tick] += order.remaining;
      if (this.bestAskTick === null || order.tick < this.bestAskTick) this.bestAskTick = order.tick;
    }
    this.index.set(order.id, { side: order.side, tick: order.tick });
  }

  private record(t: Trade) {
    this.tradesCount++;
    this.volume += t.qty;
    this.lastTrade = t;
    this.recentTrades.unshift(t);
    if (this.recentTrades.length > OrderBook.TAPE) this.recentTrades.pop();
  }

  private scanUp(from: number): number | null {
    for (let t = Math.max(from, 0); t < MAX_TICKS; t++) if (this.askQty[t] > 1e-9) return t;
    return null;
  }
  private scanDown(from: number): number | null {
    for (let t = Math.min(from, MAX_TICKS - 1); t >= 0; t--) if (this.bidQty[t] > 1e-9) return t;
    return null;
  }

  midTick(): number | null {
    if (this.bestBidTick === null || this.bestAskTick === null) return null;
    return (this.bestBidTick + this.bestAskTick) / 2;
  }

  snapshot(depth = 12): BookSnapshot {
    const bids: Level[] = [];
    const asks: Level[] = [];
    if (this.bestBidTick !== null) for (let t = this.bestBidTick, n = 0; t >= 0 && n < depth; t--) if (this.bidQty[t] > 1e-9) { bids.push({ tick: t, qty: this.bidQty[t], orders: this.bidQ[t].length }); n++; }
    if (this.bestAskTick !== null) for (let t = this.bestAskTick, n = 0; t < MAX_TICKS && n < depth; t++) if (this.askQty[t] > 1e-9) { asks.push({ tick: t, qty: this.askQty[t], orders: this.askQ[t].length }); n++; }

    const bidSum = bids.reduce((s, l) => s + l.qty, 0);
    const askSum = asks.reduce((s, l) => s + l.qty, 0);
    const imbalance = bidSum + askSum > 0 ? (bidSum - askSum) / (bidSum + askSum) : 0;

    let microprice: number | null = null;
    if (this.bestBidTick !== null && this.bestAskTick !== null) {
      const bq = this.bidQty[this.bestBidTick], aq = this.askQty[this.bestAskTick];
      microprice = bq + aq > 0 ? (this.bestBidTick * aq + this.bestAskTick * bq) / (bq + aq) : this.midTick();
    }

    return {
      bids, asks,
      bestBid: this.bestBidTick, bestAsk: this.bestAskTick,
      mid: this.midTick(),
      spreadTicks: this.bestBidTick !== null && this.bestAskTick !== null ? this.bestAskTick - this.bestBidTick : null,
      microprice, imbalance, lastTrade: this.lastTrade,
    };
  }

  /** Ids of resting orders carrying a given tag (used by the market maker to pull quotes). */
  restingByTag(tag: string): number[] {
    const ids: number[] = [];
    this.index.forEach((loc, id) => {
      const q = loc.side === "buy" ? this.bidQ[loc.tick] : this.askQ[loc.tick];
      const o = q.find((x) => x.id === id);
      if (o && o.tag === tag) ids.push(id);
    });
    return ids;
  }
}
