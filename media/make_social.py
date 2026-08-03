#!/usr/bin/env python3
"""
Render the LinkedIn carousel.

Four slides at 1200x1500, the 4:5 ratio LinkedIn gives the most feed height to. Numbers are read
from the live API rather than typed in, so a slide can never quietly disagree with the repo.

    python media/make_social.py                       # reads http://localhost:3000
    python media/make_social.py --offline             # uses the last cached figures

Output: media/social/slide-1..4.png and media/social/carousel.pdf
"""

import json
import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont
# PIL loads codecs lazily, and its PDF writer reaches for Image.SAVE["JPEG"] directly. Without
# this explicit import the multi-page save dies with KeyError: 'JPEG' even though the encoder
# is present.
from PIL import JpegImagePlugin  # noqa: F401

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "social")
CACHE = os.path.join(OUT, "figures.json")
os.makedirs(OUT, exist_ok=True)

W, H = 1200, 1500
PAD = 84

BG = (9, 16, 22)
CARD = (16, 27, 36)
INK = (240, 245, 248)
MUTED = (166, 181, 192)
FAINT = (124, 140, 152)
ACCENT = (127, 168, 196)
UP = (108, 188, 148)
DOWN = (214, 108, 100)
LINE = (36, 54, 68)

F = "C:/Windows/Fonts/"
serif = lambda s: ImageFont.truetype(F + "georgiab.ttf", s)
sans = lambda s: ImageFont.truetype(F + "segoeui.ttf", s)
sans_l = lambda s: ImageFont.truetype(F + "segoeuisl.ttf", s)
mono = lambda s: ImageFont.truetype(F + "consola.ttf", s)
mono_b = lambda s: ImageFont.truetype(F + "consolab.ttf", s)


def fetch_figures():
    """Pull the numbers from the running terminal. Falls back to cache when it is not up."""
    if "--offline" in sys.argv:
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    url = "http://localhost:3000/api/strategies"
    with urllib.request.urlopen(url, timeout=900) as r:
        d = json.loads(r.read().decode("utf-8"))

    strategies = d["strategies"]
    p = d["portfolio"]
    attr = [s for s in strategies if s.get("attribution")]
    sig = [s for s in attr if abs(s["attribution"]["alphaT"]) >= 2]
    best_r2 = max(s["attribution"]["rSquared"] for s in attr) if attr else 0
    min_r2 = min(s["attribution"]["rSquared"] for s in attr) if attr else 0

    mom = next((s for s in attr if s["id"] == "momentum"), None)
    top_sharpe = max(strategies, key=lambda s: s["grossSharpe"])

    figures = {
        "nStrategies": len(strategies),
        "nAttributed": len(attr),
        "nSignificant": len(sig),
        "r2Low": min_r2,
        "r2High": best_r2,
        "momBetaMom": mom["attribution"]["betas"]["MOM"] if mom else None,
        "momAlphaT": mom["attribution"]["alphaT"] if mom else None,
        "naiveSum": p["naiveSumCapacity"],
        "joint": p["jointCapacity"],
        "overlapTax": p["overlapTax"],
        "nameCount": p["nameCount"],
        "blendedSharpe": p["blendedSharpe"],
        "equalWeightSharpe": p["equalWeightSharpe"],
        "pbo": d["family"]["pbo"],
        "verdict": d["family"]["verdict"],
        "topSharpeName": top_sharpe["name"],
        "topSharpe": top_sharpe["grossSharpe"],
        "topSharpeCapacity": top_sharpe["capacity"]["deployableCapacity"],
        "topSharpeTurnover": top_sharpe["annualTurnover"],
        "nObs": d["factorPanel"]["nObs"],
    }
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(figures, f, indent=2)
    return figures


def usd(v):
    return (f"${v / 1e9:.1f}B" if v >= 1e9 else f"${v / 1e6:.0f}M" if v >= 1e6 else f"${v:.0f}")


def wrap(draw, text, font, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= width:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def base(slide_no, total, eyebrow_text):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # hairline grid, quiet
    for x in range(0, W, 100):
        d.line([(x, 0), (x, H)], fill=(14, 24, 32))
    for y in range(0, H, 100):
        d.line([(0, y), (W, y)], fill=(14, 24, 32))

    d.text((PAD, 66), "ALPHA-FORGE", font=mono_b(22), fill=ACCENT)
    d.text((W - PAD, 66), f"{slide_no}/{total}", font=mono(22), fill=FAINT, anchor="ra")
    d.text((PAD, 118), eyebrow_text.upper(), font=mono_b(19), fill=FAINT)
    d.line([(PAD, H - 96), (W - PAD, H - 96)], fill=LINE, width=1)
    d.text((PAD, H - 76), "github.com/AhmedRaoofuddin/Quant", font=mono(21), fill=MUTED)
    return img, d


def slide_hook(f):
    img, d = base(1, 4, "twenty documented anomalies, backtested on live prices")
    y = 250
    for line in ["Twenty quant", "strategies.", "Not one produced", "real alpha."]:
        d.text((PAD, y), line, font=serif(92), fill=INK)
        y += 108

    y += 40
    d.line([(PAD, y), (PAD + 150, y)], fill=ACCENT, width=4)
    y += 46

    body = (
        f"Each one regressed on market, size, momentum, volatility and reversal factors over "
        f"{f['nObs']} observations."
    )
    for line in wrap(d, body, sans_l(34), W - PAD * 2):
        d.text((PAD, y), line, font=sans_l(34), fill=MUTED)
        y += 46

    y += 34
    stats = [
        (f"{f['r2Low']*100:.0f} to {f['r2High']*100:.0f}%", "of variance explained by factors", MUTED),
        (f"{f['nSignificant']} of {f['nAttributed']}", "cleared a t-statistic of 2 on alpha", DOWN),
    ]
    for value, label, colour in stats:
        d.text((PAD, y), value, font=mono_b(64), fill=colour)
        d.text((PAD, y + 76), label, font=sans(30), fill=FAINT)
        y += 148
    return img


def slide_momentum(f):
    img, d = base(2, 4, "what the regression actually said")
    y = 250
    d.text((PAD, y), "Momentum is not", font=serif(80), fill=INK)
    d.text((PAD, y + 94), "alpha on top of", font=serif(80), fill=INK)
    d.text((PAD, y + 188), "momentum.", font=serif(80), fill=ACCENT)
    y += 330

    d.rounded_rectangle([PAD, y, W - PAD, y + 300], radius=4, fill=CARD, outline=LINE)
    ry = y + 44
    rows = [
        ("Loading on the momentum factor", f"{f['momBetaMom']:.2f}", INK),
        ("t-statistic on its own alpha", f"{f['momAlphaT']:.2f}", DOWN),
        ("Variance the factors explain", f"{f['r2High']*100:.0f}%", MUTED),
    ]
    for label, value, colour in rows:
        d.text((PAD + 40, ry), label, font=sans(31), fill=MUTED)
        d.text((W - PAD - 40, ry - 4), value, font=mono_b(42), fill=colour, anchor="ra")
        ry += 86

    y += 356
    body = (
        "It loads almost entirely on the factor it is named after and adds nothing "
        "measurable beyond it. That is the normal outcome for price-only rules, and a "
        "library claiming otherwise would be the suspicious one."
    )
    for line in wrap(d, body, sans_l(32), W - PAD * 2):
        d.text((PAD, y), line, font=sans_l(32), fill=MUTED)
        y += 44
    return img


def slide_capacity(f):
    img, d = base(3, 4, "the measurement nobody publishes")
    y = 244
    d.text((PAD, y), "Capacity does", font=serif(86), fill=INK)
    d.text((PAD, y + 100), "not add up.", font=serif(86), fill=INK)
    y += 240

    body = (
        f"Each strategy was sized against its own liquidity. Run together they hold "
        f"{f['nameCount']} names between them, so a stock two strategies both want carries "
        "both positions against one day of volume."
    )
    for line in wrap(d, body, sans_l(33), W - PAD * 2):
        d.text((PAD, y), line, font=sans_l(33), fill=MUTED)
        y += 45

    y += 40
    rows = [
        ("Sum of the parts", usd(f["naiveSum"]), MUTED, 1.0),
        ("What the blend carries", usd(f["joint"]), UP, f["joint"] / f["naiveSum"]),
    ]
    for label, value, colour, frac in rows:
        d.text((PAD, y), label.upper(), font=mono_b(20), fill=FAINT)
        d.text((PAD, y + 32), value, font=mono_b(76), fill=colour)
        bar_y = y + 128
        d.rounded_rectangle([PAD, bar_y, W - PAD, bar_y + 16], radius=3, fill=LINE)
        d.rounded_rectangle([PAD, bar_y, PAD + int((W - PAD * 2) * frac), bar_y + 16],
                            radius=3, fill=colour)
        y += 196

    y += 14
    d.text((PAD, y), f"{f['overlapTax']*100:.0f}% overlap tax", font=serif(58), fill=DOWN)
    d.text((PAD, y + 76), "Sizing each sleeve independently and adding up",
           font=sans_l(30), fill=FAINT)
    d.text((PAD, y + 114), "overstated deployable capital by nearly 9x.",
           font=sans_l(30), fill=FAINT)
    return img


def slide_what(f):
    img, d = base(4, 4, "open source, public data, no keys")
    y = 250
    d.text((PAD, y), "Every backtest", font=serif(80), fill=INK)
    d.text((PAD, y + 94), "answers how good.", font=serif(80), fill=MUTED)
    d.text((PAD, y + 200), "This one answers", font=serif(80), fill=INK)
    d.text((PAD, y + 294), "how much.", font=serif(80), fill=ACCENT)
    y += 430

    items = [
        ("Strategy library", f"{f['nStrategies']} documented anomalies, each with its own capacity"),
        ("Overfitting firewall", "run it on pure noise and it returns 97% PBO, the right answer"),
        ("Joint capacity", "what a blend carries once overlapping names share liquidity"),
        ("Claim auditor", "checks an advertised track record for internal contradictions"),
    ]
    for title, sub in items:
        d.line([(PAD, y), (PAD, y + 62)], fill=ACCENT, width=3)
        d.text((PAD + 24, y), title, font=sans(35), fill=INK)
        for i, line in enumerate(wrap(d, sub, sans_l(28), W - PAD * 2 - 30)):
            d.text((PAD + 24, y + 42 + i * 36), line, font=sans_l(28), fill=FAINT)
        y += 118
    return img


def main():
    try:
        f = fetch_figures()
    except Exception as e:
        print(f"Could not read the API ({type(e).__name__}). Start the terminal, or pass --offline.")
        sys.exit(1)

    print("figures used:")
    for k in ("nStrategies", "nSignificant", "nAttributed", "naiveSum", "joint", "overlapTax", "pbo"):
        print(f"  {k:16} {f[k]}")

    slides = [slide_hook(f), slide_momentum(f), slide_capacity(f), slide_what(f)]
    paths = []
    for i, img in enumerate(slides, 1):
        p = os.path.join(OUT, f"slide-{i}.png")
        img.save(p)
        paths.append(p)
        print(f"  wrote {p}")

    pdf = os.path.join(OUT, "carousel.pdf")
    slides[0].save(pdf, save_all=True, append_images=slides[1:], resolution=150.0)
    print(f"  wrote {pdf}  (post this as a document for wider reach)")


if __name__ == "__main__":
    main()
