#!/usr/bin/env python3
"""Builds src/fonts/stagwood-sprite-64.ttf, and the .otf beside it for use outside the app,
from glyphs.txt (needs fontTools).

Every drawn pixel becomes a 64-unit square (1/16 em), so the font is only crisp at a
whole multiple of 16 device pixels (src/pixel-snap.js keeps the app on that grid).
Row 5 of a glyph's canvas is the last row above the baseline; ascent, descent and
line gap are set here rather than overridden in style.css.

Usage: python3 scripts/font/build.py [--preview out.png]
"""
import sys
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

HERE = Path(__file__).parent
OUT = HERE.parent.parent / 'src' / 'fonts' / 'stagwood-sprite-64.ttf'
OUT_OTF = OUT.with_suffix('.otf')
PX = 64  # font units per drawn pixel
UPM = 16 * PX
BASE_ROW = 6  # canvas rows above the baseline: the row after the last one drawn
GAP = 1  # blank columns after a glyph
SPACE = 3  # advance of the space, in pixels

# Rows to move a glyph down so its tail hangs below the baseline. Descenders are drawn in
# the cell with their tails inside it, so they sit too high until shifted: each is moved
# until its top lands on the x-height (row 2), or on the i's dot row for the j. The y sits one row lower than that, by eye.
SHIFT = {'g': 2, 'p': 2, 'q': 1, 'y': 2, 'j': 1, ',': 1, ';': 1}


def read_glyphs():
    glyphs = {}
    for line in (HERE / 'glyphs.txt').read_text().splitlines():
        if line.startswith('##') or not line.strip():
            continue
        char, rows = line.split(' ', 1)
        glyphs[char] = rows.split('/')
    return glyphs


def outline(rows, shift):
    """(pen glyph, advance in units) for a glyph's pixel rows."""
    ink = [(x, y + shift) for y, row in enumerate(rows) for x, c in enumerate(row) if c == '#']
    pen = RecordingPen()
    if not ink:
        return pen, SPACE * PX
    left = min(x for x, _ in ink)
    width = max(x for x, _ in ink) - left + 1
    # One rectangle per horizontal run, stacked runs of the same span merged into one.
    runs = {}
    for y in sorted({y for _, y in ink}):
        xs = sorted(x for x, yy in ink if yy == y)
        start = prev = xs[0]
        for x in xs[1:] + [None]:
            if x is None or x != prev + 1:
                runs.setdefault((start - left, prev - left + 1), []).append(y)
                start = x
            prev = x
    rects = []
    for (x0, x1), ys in runs.items():
        top = ys[0]
        for a, b in zip(ys, ys[1:] + [None]):
            if b != a + 1:
                rects.append((x0, x1, top, a + 1))
                top = b
    for x0, x1, y0, y1 in rects:  # clockwise, y up from the baseline
        pen.moveTo((x0 * PX, (BASE_ROW - y1) * PX))
        pen.lineTo((x0 * PX, (BASE_ROW - y0) * PX))
        pen.lineTo((x1 * PX, (BASE_ROW - y0) * PX))
        pen.lineTo((x1 * PX, (BASE_ROW - y1) * PX))
        pen.closePath()
    return pen, (width + GAP) * PX


def notdef():
    pen = RecordingPen()
    for x0, y0, x1, y1, outer in [(0, 0, 4, 6, True), (1, 1, 3, 5, False)]:
        pts = [(x0, y0), (x0, y1), (x1, y1), (x1, y0)]
        pts = pts if outer else pts[::-1]  # the inner contour runs the other way: it is the hole
        pen.moveTo((pts[0][0] * PX, pts[0][1] * PX))
        for x, y in pts[1:]:
            pen.lineTo((x * PX, y * PX))
        pen.closePath()
    return pen, 5 * PX


def main():
    glyphs = {'.notdef': notdef(), 'space': (RecordingPen(), SPACE * PX)}
    cmap = {0x20: 'space'}
    for char, rows in read_glyphs().items():
        name = f'uni{ord(char):04X}'
        glyphs[name] = outline(rows, SHIFT.get(char, 0))
        cmap[ord(char)] = name

    def ttf_glyph(rec):
        pen = TTGlyphPen(None)
        rec.replay(pen)
        return pen.glyph()

    def cff_charstring(rec, adv):
        pen = T2CharStringPen(adv, None)
        rec.replay(ReverseContourPen(pen))  # CFF wants outer contours counter-clockwise
        return pen.getCharString()

    build(True, OUT, cmap, glyphs, lambda fb: fb.setupGlyf({n: ttf_glyph(rec) for n, (rec, _) in glyphs.items()}))
    build(False, OUT_OTF, cmap, glyphs, lambda fb: fb.setupCFF(
        'StagwoodSprite64-Regular', {'FullName': 'Stagwood Sprite 64'},
        {n: cff_charstring(rec, adv) for n, (rec, adv) in glyphs.items()}, {}))


def build(is_ttf, out, cmap, glyphs, setup_outlines):
    fb = FontBuilder(UPM, isTTF=is_ttf)
    fb.setupGlyphOrder(list(glyphs))
    fb.setupCharacterMap(cmap)
    setup_outlines(fb)
    fb.setupHorizontalMetrics({n: (adv, 0) for n, (_, adv) in glyphs.items()})
    fb.setupHorizontalHeader(ascent=8 * PX, descent=-2 * PX, lineGap=0)
    # A full name table and unrestricted embedding: font uploaders (Canva) reject fonts without them.
    fb.setupNameTable({
        'copyright': 'Copyright (c) 2026 Xander Stagwood. All rights reserved.',
        'familyName': 'Stagwood Sprite 64', 'styleName': 'Regular',
        'uniqueFontIdentifier': 'Stagwood Sprite 64 Regular 1.000', 'fullName': 'Stagwood Sprite 64 Regular',
        'version': 'Version 1.000', 'psName': 'StagwoodSprite64-Regular',
    })
    fb.setupOS2(
        version=4, sTypoAscender=8 * PX, sTypoDescender=-2 * PX, sTypoLineGap=0,
        usWinAscent=8 * PX, usWinDescent=2 * PX,
        sxHeight=3 * PX, sCapHeight=6 * PX,
        fsSelection=(1 << 6) | (1 << 7),  # regular, and use the typographic metrics above
        fsType=0, achVendID='NONE', ulCodePageRange1=1,  # installable embedding, Latin 1
    )
    fb.setupPost()
    out.parent.mkdir(parents=True, exist_ok=True)
    fb.save(out)
    print(f'{out.relative_to(HERE.parent.parent)}: {len(cmap)} characters')

    if is_ttf and '--preview' in sys.argv:
        from PIL import Image, ImageDraw, ImageFont
        path = sys.argv[sys.argv.index('--preview') + 1]
        font = ImageFont.truetype(str(OUT), 64)  # 4 device px per drawn pixel
        lines = [
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789',
            '!@#$%^&*()-+_=[]{}|\\:;\'"/?,.<>`~', 'The quick brown fox jumps over the lazy dog.',
            'Pack my box with five dozen liquor jugs, gypsy!',
        ]
        img = Image.new('L', (1900, 100 * len(lines) + 20), 255)
        draw = ImageDraw.Draw(img)
        for i, text in enumerate(lines):
            draw.text((10, 10 + 100 * i), text, font=font, fill=0)
        img.save(path)


if __name__ == '__main__':
    main()
