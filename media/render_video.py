#!/usr/bin/env python3
"""
Render the Alpha-Forge product video.

Scene durations come from the measured length of each narration clip (media/vo/manifest.json), so
picture and voice stay locked without hand-tuned timings. Frames are composited with PIL and
handed to ffmpeg.

    python media/render_video.py            # full render
    python media/render_video.py --preview  # every 15th frame, for a fast look
"""

import json
import math
import os

import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
LOGOS = os.path.join(HERE, "logos")
VO = os.path.join(HERE, "vo")

# Frames live outside the repo: this tree sits in OneDrive, which locks directories mid-write and
# would try to sync several thousand throwaway PNGs. Only the finished MP4 belongs in the repo.
FRAMES = os.environ.get("AF_FRAME_DIR") or os.path.join(
    os.environ.get("TEMP", "/tmp"), "alphaforge_frames"
)

W, H = 1920, 1080
FPS = 30

# Institutional palette: navy paper, one cool accent, one warm accent. Colour means data.
BG_TOP = (10, 26, 38)
BG_BOT = (7, 18, 27)
INK = (242, 246, 248)
MUTED = (143, 166, 181)
FAINT = (95, 118, 133)
ACCENT = (78, 124, 161)
ACCENT_HI = (127, 168, 196)
WARM = (192, 138, 62)
UP = (61, 131, 97)
DOWN = (176, 65, 58)
LINE = (30, 52, 70)

F = "C:/Windows/Fonts/"


def font(name, size):
    return ImageFont.truetype(F + name, size)


SERIF = lambda s: font("georgia.ttf", s)
SERIF_B = lambda s: font("georgiab.ttf", s)
SANS = lambda s: font("segoeui.ttf", s)
SANS_B = lambda s: font("segoeuib.ttf", s)
SANS_L = lambda s: font("segoeuisl.ttf", s)
MONO = lambda s: font("consola.ttf", s)
MONO_B = lambda s: font("consolab.ttf", s)


# ---------------------------------------------------------------- easing

def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def ease_out(t):
    """Cubic ease-out: fast attack, soft landing. The default for entrances."""
    return 1 - (1 - clamp(t)) ** 3


def ease_out_expo(t):
    t = clamp(t)
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)


def ease_in_out(t):
    t = clamp(t)
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def stagger(t, i, step=0.055, dur=0.42):
    """Per-item entrance progress, offset so elements cascade rather than pop together."""
    return ease_out((t - i * step) / dur)


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(int(round(lerp(a, b, clamp(t)))) for a, b in zip(c1, c2))


def alpha(color, a):
    return (*color, int(round(255 * clamp(a))))


# ---------------------------------------------------------------- primitives

def background(draw, t):
    """Vertical gradient plus a slowly drifting hairline grid."""
    for y in range(0, H, 4):
        draw.rectangle([0, y, W, y + 4], fill=mix(BG_TOP, BG_BOT, y / H))
    drift = (t * 14) % 120
    for x in range(-120, W + 120, 120):
        draw.line([(x + drift, 0), (x + drift, H)], fill=(20, 38, 52), width=1)
    for y in range(0, H, 120):
        draw.line([(0, y), (W, y)], fill=(20, 38, 52), width=1)


def text(layer, xy, s, fnt, fill, a=1.0, anchor="la"):
    if a <= 0.01:
        return
    layer.text(xy, s, font=fnt, fill=alpha(fill, a), anchor=anchor)


def card(layer, box, a=1.0, fill=(16, 34, 48), border=LINE, radius=4, width=1):
    if a <= 0.01:
        return
    layer.rounded_rectangle(box, radius=radius, fill=alpha(fill, a * 0.96),
                            outline=alpha(border, a), width=width)


def chrome(layer, t, total, scene_no, scene_name, n_scenes):
    """Persistent frame: wordmark, scene counter, progress bar."""
    text(layer, (72, 58), "ALPHA-FORGE", MONO_B(19), ACCENT_HI, 0.9)
    text(layer, (255, 58), "| capacity-aware quantitative research", MONO(19), FAINT, 0.75)
    text(layer, (W - 72, 58), f"{scene_no:02d} / {n_scenes:02d}  {scene_name}",
         MONO(18), FAINT, 0.75, anchor="ra")
    layer.rectangle([0, H - 4, W, H], fill=alpha(LINE, 0.85))
    layer.rectangle([0, H - 4, int(W * clamp(t / total)), H], fill=alpha(ACCENT, 0.95))


def caption(layer, s, a=1.0):
    """Lower third. Narration on screen as well as in the ear."""
    if a <= 0.01 or not s:
        return
    f = SANS_L(27)
    tw = layer.textlength(s, font=f)
    x, y = (W - tw) / 2, H - 116
    layer.rounded_rectangle([x - 26, y - 15, x + tw + 26, y + 47], radius=3,
                            fill=alpha((8, 20, 30), a * 0.82), outline=alpha(LINE, a * 0.7))
    text(layer, (x, y), s, f, (214, 226, 234), a)


def eyebrow(layer, xy, s, a=1.0, color=None):
    text(layer, xy, s.upper(), MONO_B(17), color or ACCENT_HI, a * 0.95)


def count_up(value, t, fmt="{:.2f}"):
    """Numbers that animate to their value read as measurements, not decoration."""
    return fmt.format(value * ease_out_expo(t))


# ---------------------------------------------------------------- scenes

def sc_title(layer, t, d):
    cx = W // 2
    a = ease_out(t / 0.9)
    y = 372 + (1 - a) * 26
    text(layer, (cx, y), "ALPHA-FORGE", SERIF_B(112), INK, a, anchor="ma")

    rule = ease_out((t - 0.7) / 0.7)
    if rule > 0:
        half = 210 * rule
        layer.rectangle([cx - half, 512, cx + half, 515], fill=alpha(ACCENT, rule))

    a2 = ease_out((t - 1.0) / 0.9)
    text(layer, (cx, 556), "Every backtest answers \u201chow good?\u201d.",
         SANS_L(40), MUTED, a2, anchor="ma")
    a3 = ease_out((t - 1.5) / 0.9)
    text(layer, (cx, 612), "This one answers \u201chow much?\u201d",
         SANS(40), ACCENT_HI, a3, anchor="ma")

    tags = ["strategy capacity", "overfitting firewall", "C++20 engine", "Claude Skills"]
    for i, tag in enumerate(tags):
        p = stagger(t - 2.4, i, 0.14, 0.5)
        if p <= 0:
            continue
        f = MONO(21)
        tw = layer.textlength(tag, font=f)
        x = cx - 640 + i * 335 + (1 - p) * 14
        layer.rounded_rectangle([x - 18, 706, x + tw + 18, 752], radius=3,
                                fill=alpha((15, 33, 47), p * 0.9), outline=alpha(LINE, p))
        text(layer, (x, 718), tag, f, MUTED, p)


def sc_compare(layer, t, d):
    eyebrow(layer, (170, 220), "the number everyone publishes")
    text(layer, (170, 252), "Gross Sharpe ratio", SERIF_B(62), INK, ease_out(t / 0.6))

    rows = [("Short-term reversal", 1.32, ACCENT_HI), ("Low volatility", 0.94, MUTED)]
    for i, (name, val, col) in enumerate(rows):
        p = stagger(t - 0.7, i, 0.34, 0.6)
        if p <= 0:
            continue
        y = 400 + i * 190
        card(layer, [170 + (1 - p) * 36, y, 1330, y + 148], p)
        text(layer, (216, y + 30), name, SANS(38), INK, p)
        text(layer, (216, y + 88), "gross of costs, walk-forward on live prices",
             MONO(19), FAINT, p * 0.9)
        bar = ease_out((t - 1.1 - i * 0.34) / 1.0)
        layer.rectangle([216, y + 122, 216 + int(700 * (val / 1.5) * bar), y + 128],
                        fill=alpha(col, p))
        num = count_up(val, (t - 1.1 - i * 0.34) / 1.1)
        text(layer, (1290, y + 40), num, MONO_B(72), col, p, anchor="ra")

    a = ease_out((t - 2.9) / 0.8)
    text(layer, (1420, 470), "reversal", MONO_B(26), ACCENT_HI, a)
    text(layer, (1420, 506), "wins", MONO(26), MUTED, a)


def sc_capacity(layer, t, d):
    eyebrow(layer, (170, 200), "the number that decides funding", color=WARM)
    text(layer, (170, 232), "Deployable capital", SERIF_B(62), INK, ease_out(t / 0.6))

    rows = [("Short-term reversal", 0.885, "$885M", "31.0x / yr", DOWN),
            ("Low volatility", 1.28, "$1.28B", "1.0x / yr", UP)]
    for i, (name, val, label, turn, col) in enumerate(rows):
        p = stagger(t - 0.6, i, 0.36, 0.6)
        if p <= 0:
            continue
        y = 380 + i * 196
        card(layer, [170, y, 1500, y + 156], p)
        text(layer, (216, y + 26), name, SANS(36), INK, p)
        text(layer, (216, y + 76), f"turnover {turn}", MONO(21), col, p * 0.95)

        grow = ease_out_expo((t - 1.0 - i * 0.36) / 1.3)
        full = 940 * (val / 1.4)
        layer.rounded_rectangle([216, y + 112, 216 + max(3, int(full * grow)), y + 132],
                                radius=2, fill=alpha(col, p * 0.85))
        if grow > 0.55:
            text(layer, (1460, y + 46), label, MONO_B(60), col,
                 p * ease_out((grow - 0.55) / 0.4), anchor="ra")

    a = ease_out((t - 3.4) / 0.9)
    if a > 0:
        text(layer, (W // 2, 800), "Cost scales with turnover. Alpha does not.",
             SANS_L(40), WARM, a, anchor="ma")


def sc_curve(layer, t, d):
    eyebrow(layer, (170, 172), "square-root law of market impact")
    text(layer, (170, 204), "Net profit rises, peaks, then dies", SERIF_B(58), INK, ease_out(t / 0.6))

    x0, y0, x1, y1 = 250, 340, 1520, 806
    axes = ease_out((t - 0.4) / 0.6)
    if axes > 0:
        layer.line([(x0, y1), (x0 + (x1 - x0) * axes, y1)], fill=alpha(LINE, 1), width=2)
        layer.line([(x0, y1), (x0, y1 - (y1 - y0) * axes)], fill=alpha(LINE, 1), width=2)
        text(layer, (x1, y1 + 22), "capital deployed", MONO(21), FAINT, axes, anchor="ra")
        text(layer, (x0 - 14, y0), "net P&L", MONO(21), FAINT, axes, anchor="rt")

    # Net dollar P&L against capital: gross grows linearly, cost as the square root of size, so
    # P&L(u) = A*u - B*u^1.5. That is the curve that rises, peaks and dies. (Net *return* only
    # ever decays, which is a different statement and the wrong shape for this claim.)
    A, B = 1.0, 1.118          # zero crossing at u = (A/B)^2 = 0.80

    def curve_y(u):
        return A * u - B * u ** 1.5

    upk = (2 * A / (3 * B)) ** 2          # argmax of A*u - B*u^1.5
    vmax, vmin = curve_y(upk), curve_y(1.0)
    plot_h = (y1 - y0) * 0.86

    def to_px(v):
        return y1 - (v - vmin) / (vmax - vmin) * plot_h

    zero_y = to_px(0.0)
    if axes > 0:
        for xs in range(x0, int(x0 + (x1 - x0) * axes), 18):   # dashed break-even line
            layer.line([(xs, zero_y), (xs + 9, zero_y)], fill=alpha(FAINT, axes * 0.8), width=1)
        text(layer, (x0 - 14, zero_y), "0", MONO(20), FAINT, axes, anchor="rm")

    draw_to = ease_in_out((t - 0.9) / 2.1)
    pts = []
    N = 240
    for i in range(int(N * draw_to) + 1):
        u = i / N
        pts.append((x0 + u * (x1 - x0), to_px(curve_y(u))))
    if len(pts) > 1:
        layer.line(pts, fill=alpha(ACCENT_HI, 1), width=5, joint="curve")

    if draw_to > upk:
        pa = ease_out((draw_to - upk) / 0.25)
        px = x0 + upk * (x1 - x0)
        py = y1 - (curve_y(upk) + 0.68) / 0.72 * (y1 - y0) * 0.9
        layer.line([(px, py), (px, y1)], fill=alpha(WARM, pa * 0.5), width=2)
        layer.ellipse([px - 9, py - 9, px + 9, py + 9], fill=alpha(WARM, pa))
        text(layer, (px, py - 52), "peak net P&L", MONO_B(24), WARM, pa, anchor="ma")

    # Mark where the curve crosses break-even, which is the point the label is actually about.
    zero = ease_out((t - 3.0) / 0.7)
    if zero > 0 and draw_to > 0.8:
        zx = x0 + 0.8 * (x1 - x0)
        layer.ellipse([zx - 8, zero_y - 8, zx + 8, zero_y + 8], fill=alpha(DOWN, zero))
        text(layer, (zx + 22, zero_y - 46), "alpha dies", MONO_B(24), DOWN, zero)

    fa = ease_out((t - 3.4) / 0.8)
    if fa > 0:
        f = MONO(27)
        s = "cost_bps(Q) = half_spread + eta * sigma * sqrt(Q / ADV) * 1e4"
        tw = layer.textlength(s, font=f)
        x = (W - tw) / 2
        layer.rounded_rectangle([x - 28, 862, x + tw + 28, 922], radius=3,
                                fill=alpha((14, 31, 44), fa * 0.9), outline=alpha(LINE, fa))
        text(layer, (x, 876), s, f, ACCENT_HI, fa)


def sc_firewall(layer, t, d):
    eyebrow(layer, (170, 190), "is the result real, or the best of many tried?")
    text(layer, (170, 222), "The overfitting firewall", SERIF_B(60), INK, ease_out(t / 0.6))

    tests = [
        ("Probability of Backtest Overfitting", "CSCV over every train/test split"),
        ("Deflated Sharpe Ratio", "adjusts for how many variants were tried"),
        ("Probabilistic Sharpe Ratio", "accounts for skew, kurtosis, sample length"),
        ("Holm-Bonferroni haircut", "family-wise error control on the winner"),
        ("Circular block bootstrap", "confidence interval preserving autocorrelation"),
    ]
    for i, (name, sub) in enumerate(tests):
        p = stagger(t - 0.5, i, 0.24, 0.55)
        if p <= 0:
            continue
        y = 348 + i * 108
        x = 190 + (1 - p) * 30
        layer.rounded_rectangle([x, y, x + 26, y + 26], radius=2,
                                fill=alpha(UP, p * 0.22), outline=alpha(UP, p), width=2)
        layer.line([(x + 7, y + 13), (x + 12, y + 19), (x + 20, y + 7)],
                   fill=alpha(UP, p), width=3)
        text(layer, (x + 54, y - 4), name, SANS(36), INK, p)
        text(layer, (x + 54, y + 42), sub, MONO(20), FAINT, p * 0.9)


def sc_noise(layer, t, d):
    eyebrow(layer, (250, 168), "run it on eight series of pure random noise", color=WARM)

    bx0, by0, bx1 = 250, 216, 1670
    grow = ease_out(t / 0.6)
    by1 = by0 + int(660 * grow)
    layer.rounded_rectangle([bx0, by0, bx1, by1], radius=5,
                            fill=alpha((7, 17, 25), 0.97), outline=alpha(LINE, 1), width=1)
    if grow > 0.55:
        a = (grow - 0.55) / 0.45
        layer.line([(bx0, by0 + 46), (bx1, by0 + 46)], fill=alpha(LINE, a), width=1)
        for i, c in enumerate([(210, 96, 88), (208, 170, 84), (110, 178, 128)]):
            layer.ellipse([bx0 + 22 + i * 26, by0 + 16, bx0 + 36 + i * 26, by0 + 30],
                          fill=alpha(c, a))
        text(layer, (bx0 + 128, by0 + 14), "firewall.mjs --demo", MONO(20), FAINT, a * 0.85)

    lines = [
        ("Backtest firewall  (8 strategies, 750 obs, 252 CSCV splits)", MUTED),
        ("=" * 62, FAINT),
        ("VERDICT               OVERFIT", DOWN),
        ("Probability of backtest overfitting   97%", DOWN),
        ("Effective independent trials          7.8 of 8", MUTED),
        ("OOS-vs-IS Sharpe slope                -0.74", MUTED),
        ("  95% bootstrap CI on Sharpe   [-1.04, 1.32]  <- includes zero", MUTED),
        ("Holm haircut on best Sharpe    0.13 -> 0.00  (100% removed)", MUTED),
        ("-" * 62, FAINT),
        ("Selection among these is worse than random.", INK),
        ("Do not deploy the winner.", INK),
    ]
    f = MONO(25)
    for i, (s, col) in enumerate(lines):
        start = 0.85 + i * 0.13
        if t < start:
            break
        # Typewriter reveal, character by character.
        chars = int(len(s) * clamp((t - start) / 0.30))
        text(layer, (bx0 + 40, by0 + 74 + i * 46), s[:chars], f, col, 1.0)

    a = ease_out((t - 3.6) / 0.8)
    if a > 0:
        text(layer, (W // 2, 898), "A firewall that passes noise is worthless.",
             SANS_L(36), WARM, a, anchor="ma")


def sc_skills(layer, t, d):
    eyebrow(layer, (170, 168), "ships as installable claude skills")
    text(layer, (170, 200), "Zero dependencies", SERIF_B(60), INK, ease_out(t / 0.6))

    cards = [
        ("strategy-builder", "What does this trading idea actually do?",
         ["walk-forward backtest", "no look-ahead", "declarative, never eval'd"]),
        ("backtest-firewall", "Is that result real, or the best of many tried?",
         ["PBO via CSCV", "deflated Sharpe", "robust / fragile / overfit"]),
        ("strategy-capacity", "How much can it run before impact eats it?",
         ["square-root impact", "participation cap", "binding constraint"]),
    ]
    for i, (name, q, bullets) in enumerate(cards):
        p = stagger(t - 0.6, i, 0.3, 0.6)
        if p <= 0:
            continue
        x = 170 + i * 545
        y = 320 + (1 - p) * 34
        card(layer, [x, y, x + 500, y + 400], p)
        layer.rectangle([x, y, x + 500, y + 4], fill=alpha([ACCENT, WARM, UP][i], p))
        text(layer, (x + 34, y + 44), name, MONO_B(30), INK, p)
        text(layer, (x + 34, y + 96), q, SANS_L(23), MUTED, p * 0.95)
        for j, b in enumerate(bullets):
            bp = stagger(t - 1.2 - i * 0.3, j, 0.1, 0.4)
            if bp <= 0:
                continue
            yy = y + 200 + j * 52
            layer.ellipse([x + 36, yy + 9, x + 44, yy + 17], fill=alpha(FAINT, bp))
            text(layer, (x + 60, yy), b, MONO(21), MUTED, bp)

    a = ease_out((t - 2.6) / 0.8)
    if a > 0:
        s = "cp -r .claude/skills/strategy-capacity  ~/.claude/skills/"
        f = MONO(27)
        tw = layer.textlength(s, font=f)
        x = (W - tw) / 2
        layer.rounded_rectangle([x - 30, 800, x + tw + 30, 862], radius=3,
                                fill=alpha((7, 17, 25), a * 0.95), outline=alpha(LINE, a))
        text(layer, (x, 816), s, f, ACCENT_HI, a)


def sc_logos(layer, t, d, logos):
    eyebrow(layer, (170, 150), "every source open and keyless")
    text(layer, (170, 182), "Real data, real coverage", SERIF_B(58), INK, ease_out(t / 0.6))

    stats = [("78", "equities"), ("36", "cross-asset"), ("9", "newsfeeds"), ("32", "logos from Wikidata")]
    for i, (n, lab) in enumerate(stats):
        p = stagger(t - 0.5, i, 0.13, 0.5)
        if p <= 0:
            continue
        x = 190 + i * 420
        text(layer, (x, 286), n, SERIF_B(58), ACCENT_HI, p)
        text(layer, (x + 6, 356), lab.upper(), MONO(20), FAINT, p * 0.9)

    # Four rows have to clear the caption plate at y=949, so rows are tighter than they look.
    cols, cell, top, row_h = 8, 205, 424, 128
    x0 = (W - cols * cell) // 2
    for i, (ticker, img) in enumerate(logos):
        p = stagger(t - 1.0, i, 0.045, 0.45)
        if p <= 0:
            continue
        r, c = divmod(i, cols)
        cx = x0 + c * cell + cell // 2
        cy = top + r * row_h + 50 + int((1 - p) * 18)
        box = 132
        w, h = img.size
        s = min(box / w, 74 / h)
        im = img.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
        if p < 1:
            im = im.copy()
            im.putalpha(im.getchannel("A").point(lambda v, p=p: int(v * p)))
        layer._img.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)


def sc_ui(layer, t, d, shots):
    """Real screenshots of the running terminal, one held at a time with a slow push-in."""
    eyebrow(layer, (170, 132), "the terminal, on live prices")
    text(layer, (170, 164), "Eleven pages, one workflow", SERIF_B(54), INK, ease_out(t / 0.6))

    if not shots:
        return

    labels = {
        "screener": "Screener  ·  78 equities ranked on live analytics",
        "strategies": "Strategies  ·  a family compared, capacity beside Sharpe",
        "capacity": "Capacity  ·  the curve, and which constraint binds",
        "validation": "Firewall  ·  PBO, deflated Sharpe, the verdict",
        "factors": "Factors  ·  pairwise correlation and effective breadth",
        "markets": "Markets  ·  36 cross-asset instruments",
    }
    order = ["strategies", "capacity", "validation", "screener", "factors", "markets"]
    seq = [(n, shots[n]) for n in order if n in shots]
    if not seq:
        return

    # Hold each shot for an equal slice of the scene, with a short cross-dissolve between.
    hold = (d - 0.6) / len(seq)
    idx = min(int(t / hold), len(seq) - 1)
    local = t - idx * hold
    name, img = seq[idx]

    fade = min(ease_out(local / 0.45), ease_out((hold - local) / 0.4))
    if fade <= 0.02:
        return

    # Slow push-in over the hold: motion without distracting from the content.
    zoom = 1.0 + 0.03 * (local / hold)
    view_w, view_h = 1760, 600            # near full-bleed, so on-screen text stays legible
    scale = view_w / img.width * zoom
    im = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)

    ox = max(0, (im.width - view_w) // 2)
    oy = max(0, int((im.height - view_h) * 0.05))
    crop = im.crop((ox, oy, ox + view_w, oy + view_h))

    x, y = (W - view_w) // 2, 248
    if fade < 1:
        crop = Image.blend(Image.new("RGB", crop.size, BG_BOT), crop.convert("RGB"), fade)
    layer._img.paste(crop.convert("RGB"), (x, y))
    layer.rectangle([x - 1, y - 1, x + view_w, y + view_h], outline=alpha(ACCENT, fade * 0.55), width=2)

    text(layer, (x, y + view_h + 22), labels.get(name, name), MONO(23), ACCENT_HI, fade)

    # Position dots, so the sequence reads as a tour rather than a slideshow.
    for i in range(len(seq)):
        cx = W // 2 - (len(seq) - 1) * 13 + i * 26
        on = i == idx
        layer.ellipse([cx - 4, y + view_h + 74, cx + 4, y + view_h + 82],
                      fill=alpha(ACCENT_HI if on else LINE, 1.0))


def sc_outro(layer, t, d):
    cx = W // 2
    stats = [("13,267", "lines of C++20 and TypeScript"),
             ("51", "test cases"),
             ("100%", "open-source data")]
    for i, (n, lab) in enumerate(stats):
        p = stagger(t - 0.3, i, 0.22, 0.6)
        if p <= 0:
            continue
        x = cx - 620 + i * 620
        text(layer, (x, 250), n, SERIF_B(84), ACCENT_HI, p, anchor="ma")
        text(layer, (x, 356), lab.upper(), MONO(21), FAINT, p * 0.9, anchor="ma")

    a = ease_out((t - 1.5) / 0.9)
    text(layer, (cx, 500), "ALPHA-FORGE", SERIF_B(104), INK, a, anchor="ma")
    r = ease_out((t - 2.0) / 0.7)
    if r > 0:
        layer.rectangle([cx - 200 * r, 636, cx + 200 * r, 639], fill=alpha(ACCENT, r))

    a2 = ease_out((t - 2.4) / 0.9)
    text(layer, (cx, 678), "A Sharpe ratio without a capacity is only half a result.",
         SANS_L(38), MUTED, a2, anchor="ma")
    a3 = ease_out((t - 3.1) / 0.9)
    text(layer, (cx, 790), "github.com/AhmedRaoofuddin/Quant", MONO(32), ACCENT_HI, a3, anchor="ma")


RENDER = {
    "title": sc_title, "compare": sc_compare, "capacity": sc_capacity, "curve": sc_curve,
    "firewall": sc_firewall, "noise": sc_noise, "skills": sc_skills, "outro": sc_outro,
}


# ---------------------------------------------------------------- driver

class Layer:
    """Thin wrapper so scenes can both draw and paste onto the same RGBA surface."""

    def __init__(self, img):
        self._img = img
        self._d = ImageDraw.Draw(img, "RGBA")

    def __getattr__(self, k):
        return getattr(self._d, k)


def load_shots():
    """Screenshots of the running terminal, captured by frontend/scripts/capture-ui.mjs."""
    d = os.path.join(HERE, "ui")
    if not os.path.isdir(d):
        return {}
    return {f[:-4]: Image.open(os.path.join(d, f)).convert("RGB")
            for f in sorted(os.listdir(d)) if f.endswith(".png")}


def load_logos():
    out = []
    if not os.path.isdir(LOGOS):
        return out
    for f in sorted(os.listdir(LOGOS)):
        if not f.endswith(".png"):
            continue
        im = Image.open(os.path.join(LOGOS, f)).convert("RGBA")
        # Logos are dark-on-transparent; invert luminance so they read on a navy field.
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if a > 8:
                    lum = int(0.2126 * r + 0.7152 * g + 0.0722 * b)
                    v = 236 if lum < 150 else lum
                    px[x, y] = (v, v, v, a)
        out.append((f[:-4], im))
    return out


def main():
    preview = "--preview" in sys.argv
    manifest = json.load(open(os.path.join(VO, "manifest.json"), encoding="utf-8-sig"))
    scenes = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))["scenes"]
    caps = {s["id"]: s["vo"] for s in scenes}

    logos = load_logos()
    shots = load_shots()
    print(f"loaded {len(logos)} logos, {len(shots)} UI screenshots")

    total = sum(m["seconds"] for m in manifest)
    # Clear contents rather than the directory itself: a watcher holding the folder open makes
    # rmtree fail on Windows, but removing files inside it always works.
    os.makedirs(FRAMES, exist_ok=True)
    for f in os.listdir(FRAMES):
        if f.endswith(".png"):
            os.remove(os.path.join(FRAMES, f))
    print(f"frames -> {FRAMES}")

    n_scenes = len(manifest)
    frame_no, elapsed = 0, 0.0
    for idx, m in enumerate(manifest):
        d = m["seconds"]
        nframes = int(round(d * FPS))
        # Split narration into two caption halves so lines stay short on screen.
        words = caps[m["id"]].split()
        half = len(words) // 2
        cap_parts = [" ".join(words[:half]), " ".join(words[half:])]

        for k in range(nframes):
            frame_no += 1
            if preview and frame_no % 15:
                continue
            t = k / FPS
            img = Image.new("RGB", (W, H), BG_BOT)
            layer = Layer(img)
            background(layer, elapsed + t)

            if m["beat"] == "logos":
                sc_logos(layer, t, d, logos)
            elif m["beat"] == "ui":
                sc_ui(layer, t, d, shots)
            elif RENDER.get(m["beat"]):
                RENDER[m["beat"]](layer, t, d)

            # Fade the whole scene in and out at its edges.
            edge = min(ease_out(t / 0.28), ease_out((d - t) / 0.28))
            chrome(layer, elapsed + t, total, idx + 1, m["id"], n_scenes)
            ci = 0 if t < d / 2 else 1
            ct = t if ci == 0 else t - d / 2
            caption(layer, cap_parts[ci], min(1.0, ease_out(ct / 0.3)) * edge)

            if edge < 1:
                img = Image.blend(Image.new("RGB", (W, H), BG_BOT), img, edge)
            img.save(os.path.join(FRAMES, f"f{frame_no:06d}.png"), compress_level=1)

        elapsed += d
        print(f"  scene {idx+1}/{n_scenes} {m['id']:10} {d:6.2f}s  {nframes:4d} frames")

    print(f"\nrendered {frame_no} frames, {total:.1f}s")


if __name__ == "__main__":
    main()
