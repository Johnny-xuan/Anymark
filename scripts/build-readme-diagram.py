#!/usr/bin/env python3
"""Render the README diagram without a browser or app dependencies.

Requires Python 3.10+ and Pillow: python3 -m pip install Pillow
Run: python3 scripts/build-readme-diagram.py
Use --font /path/to/font.ttf to override the system sans-serif font.
The animation illustrates request paths, not continuous background syncing.
"""

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT, SCALE = 1000, 440, 2
FRAMES, FRAME_MS = 80, 80
BG = (250, 251, 253)
INK = (25, 39, 57)
MUTED = (94, 111, 133)
LINE = (207, 218, 230)
BLUE = (2, 132, 199)


def font_path(override):
    if override:
        return override
    for candidate in (
        '/System/Library/Fonts/HelveticaNeue.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        'C:/Windows/Fonts/arial.ttf',
    ):
        if Path(candidate).is_file():
            return candidate
    raise SystemExit('No suitable font found. Pass --font /path/to/font.ttf.')


def render(destination, font):
    fonts = {}
    for size in (10, 11, 12, 13, 14, 16, 18, 23, 25):
        fonts[size] = ImageFont.truetype(font, size * SCALE)

    def box(rect):
        return tuple(round(value * SCALE) for value in rect)

    def text(draw, xy, value, size=14, fill=INK, anchor='mm'):
        draw.text(tuple(round(v * SCALE) for v in xy), value,
                  font=fonts[size], fill=fill, anchor=anchor)

    def line(draw, points, fill=LINE, width=1.5):
        draw.line([(round(x * SCALE), round(y * SCALE)) for x, y in points],
                  fill=fill, width=max(1, round(width * SCALE)), joint='curve')

    def rounded(draw, rect, radius=16, fill='white', outline=LINE, width=1):
        draw.rounded_rectangle(box(rect), radius=radius * SCALE, fill=fill,
                               outline=outline, width=width * SCALE)

    def icon(draw, kind, cx, cy, color=MUTED, scale=1):
        def points(coords):
            return [(cx + (x - 12) * scale, cy + (y - 12) * scale) for x, y in coords]
        if kind == 'mark':
            line(draw, points([(6, 3), (14, 3), (18, 7), (18, 21), (12, 17), (6, 21), (6, 3)]), color, 1.8)
            line(draw, points([(14, 3), (14, 8), (18, 8)]), color, 1.8)
        elif kind == 'terminal':
            rounded(draw, (cx - 15, cy - 12, cx + 15, cy + 12), 4, None, color)
            line(draw, [(cx - 8, cy - 5), (cx - 3, cy), (cx - 8, cy + 5)], color, 1.7)
            line(draw, [(cx + 1, cy + 5), (cx + 8, cy + 5)], color, 1.7)
        elif kind == 'browser':
            rounded(draw, (cx - 15, cy - 12, cx + 15, cy + 12), 4, None, color)
            line(draw, [(cx - 15, cy - 5), (cx + 15, cy - 5)], color, 1.4)
            line(draw, [(cx - 6, cy - 5), (cx - 6, cy + 12)], color, 1.4)
        elif kind == 'bookmarks':
            line(draw, points([(6, 4), (18, 4), (18, 21), (12, 17), (6, 21), (6, 4)]), color, 1.8)
        elif kind == 'notes':
            line(draw, points([(5, 3), (19, 3), (19, 21), (5, 21), (5, 3)]), color, 1.8)
            for y, end in ((8, 15), (12, 15), (16, 13)):
                line(draw, points([(9, y), (end, y)]), color, 1.5)

    # Cubic paths follow the actual two entry routes into the extension.
    curves = [
        ((260, 142), (275, 142), (285, 142), (300, 142)),
        ((442, 142), (502, 142), (493, 208), (557, 208)),
        ((260, 314), (420, 314), (420, 250), (557, 250)),
        ((653, 208), (725, 208), (717, 156), (792, 156)),
        ((653, 250), (725, 250), (717, 302), (792, 302)),
    ]
    paths = []
    for control in curves:
        samples = []
        for i in range(201):
            t = i / 200
            samples.append(tuple((1-t)**3*control[0][axis] + 3*(1-t)**2*t*control[1][axis]
                                 + 3*(1-t)*t*t*control[2][axis] + t**3*control[3][axis]
                                 for axis in (0, 1)))
        paths.append(samples)

    base = Image.new('RGB', (WIDTH * SCALE, HEIGHT * SCALE), BG)
    draw = ImageDraw.Draw(base)
    text(draw, (40, 36), 'One library. Any agent.', 25, anchor='lm')
    text(draw, (958, 36), 'LOCAL  /  PROFILE-SCOPED', 11, MUTED, 'rm')
    rounded(draw, (752, 78, 964, 384), 22, (243, 247, 251), (224, 232, 240))
    text(draw, (858, 103), 'CHROME PROFILE', 11, MUTED)
    for path in paths:
        line(draw, path, LINE, 1.7)

    # Labels remain static so motion communicates routes, not a live app status.
    rounded(draw, (40, 98, 260, 186), 16)
    icon(draw, 'terminal', 75, 130)
    text(draw, (107, 130), 'Terminal agents', 18, anchor='lm')
    text(draw, (60, 163), 'Claude / Codex / Gemini / ...', 12, MUTED, 'lm')
    rounded(draw, (300, 116, 442, 168), 13)
    text(draw, (371, 142), 'CLI / MCP', 16)
    text(draw, (510, 102), 'Local bridge', 13, MUTED)
    text(draw, (510, 121), 'Socket + Native Messaging', 10, MUTED)

    rounded(draw, (40, 270, 260, 358), 16)
    icon(draw, 'browser', 75, 302)
    text(draw, (107, 302), 'Your workspace', 18, anchor='lm')
    text(draw, (60, 335), 'Popup / Web / 2D graph', 12, MUTED, 'lm')
    text(draw, (390, 337), 'Direct extension access', 12, MUTED)

    shadow = Image.new('RGBA', base.size)
    sd = ImageDraw.Draw(shadow)
    sd.ellipse(box((550, 176, 660, 286)), fill=(42, 89, 131, 34))
    base = Image.alpha_composite(base.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(10 * SCALE))).convert('RGB')
    draw = ImageDraw.Draw(base)
    draw.ellipse(box((551, 172, 659, 280)), fill='white', outline=(194, 217, 234), width=2*SCALE)
    draw.ellipse(box((562, 183, 648, 269)), fill=(242, 249, 253))
    icon(draw, 'mark', 605, 224, BLUE, 2.1)
    text(draw, (605, 306), 'AnyMark', 23)
    text(draw, (605, 331), 'Extension core', 12, MUTED)

    for cy, kind, label, sub in ((156, 'bookmarks', 'Chrome bookmarks', 'Titles, URLs & folders'),
                                 (302, 'notes', 'Local notes', 'Profile-local metadata')):
        draw.ellipse(box((792, cy-29, 850, cy+29)), fill='white', outline=(211, 224, 235), width=SCALE)
        icon(draw, kind, 821, cy, BLUE)
        text(draw, (858, cy+47), label, 16)
        text(draw, (858, cy+67), sub, 11, MUTED)

    text(draw, (40, 405), 'Illustrated access paths, not background synchronization.', 11, MUTED, 'lm')
    text(draw, (958, 405), 'ANYMARK 2.0', 11, MUTED, 'rm')

    def frame(index):
        glow = Image.new('RGBA', base.size)
        gd = ImageDraw.Draw(glow)
        highlights = Image.new('RGBA', base.size)
        hd = ImageDraw.Draw(highlights)
        for route, path in enumerate(paths):
            # Request and response travel in alternating directions over a loop.
            phase = (index / FRAMES + route * 0.17) % 1
            forward = phase < 0.5
            position = (phase * 2) if forward else (2 - phase * 2)
            direction = 1 if forward else -1
            for segment in range(24):
                at = position - direction * segment * 0.006
                if not 0 <= at <= 1:
                    continue
                point = path[min(200, round(at * 200))]
                x, y = point
                strength = (1 - segment / 24)**1.5
                gd.ellipse(box((x-6, y-6, x+6, y+6)), fill=(*BLUE, round(15*strength)))
                hd.ellipse(box((x-1.5, y-1.5, x+1.5, y+1.5)), fill=(*BLUE, round(225*strength)))
        result = Image.alpha_composite(base.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(3*SCALE)))
        result = Image.alpha_composite(result, highlights).convert('RGB')
        return result.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)

    destination.mkdir(parents=True, exist_ok=True)
    poster = base.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
    poster.save(destination / 'architecture.png', optimize=True)
    # A shared palette keeps the stationary diagram stable between GIF frames.
    palette_source = Image.new('RGB', (WIDTH, HEIGHT * 3))
    for i, sample in enumerate((0, FRAMES//3, FRAMES*2//3)):
        palette_source.paste(frame(sample), (0, i*HEIGHT))
    palette = palette_source.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    frames = [frame(i).quantize(palette=palette, dither=Image.Dither.NONE) for i in range(FRAMES)]
    target = destination / 'architecture.gif'
    frames[0].save(target, save_all=True, append_images=frames[1:], duration=FRAME_MS,
                   loop=0, optimize=True, disposal=1)
    print(f'{target}: {WIDTH}x{HEIGHT}, {FRAMES} frames, {FRAMES*FRAME_MS/1000:.1f}s, {target.stat().st_size:,} bytes')
    print(f'Static reduced-motion fallback: {destination / "architecture.png"}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', help='Path to a sans-serif TTF or TTC font')
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'docs' / 'assets')
    arguments = parser.parse_args()
    render(arguments.output_dir, font_path(arguments.font))
