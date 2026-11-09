"""Render the actual PDF pages and make labelled contact sheets for visual review."""
from pathlib import Path
import sys
import json
import pymupdf
from PIL import Image, ImageDraw

folder = Path(sys.argv[1])
for pdf in folder.glob('*.pdf'):
    doc = pymupdf.open(pdf)
    for pattern in [f'{pdf.stem}-contact-*.png', f'{pdf.stem}-pdf-page-*.png']:
        for old in folder.glob(pattern):
            old.unlink()
    audit = pdf.with_suffix('.json')
    if audit.exists():
        assert len(doc) == json.loads(audit.read_text(encoding='utf-8'))['pages'], f'PDF page count mismatch: {pdf}'
    thumbs = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25), alpha=False)
        pix.save(str(folder / f'{pdf.stem}-pdf-page-{i + 1}.png'))
        thumb = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
        thumb.thumbnail((400, 560))
        thumbs.append(thumb)
    for start in range(0, len(thumbs), 6):
        count = min(6, len(thumbs) - start)
        columns = min(3, count)
        sheet = Image.new('RGB', (columns * 410, ((count + columns - 1) // columns) * 590), '#e5e7eb')
        draw = ImageDraw.Draw(sheet)
        for j, thumb in enumerate(thumbs[start:start + 6]):
            x, y = (j % 3) * 410 + 5, (j // 3) * 590 + 24
            sheet.paste(thumb, (x, y))
            draw.text((x, y - 20), f'{pdf.stem} / page {start + j + 1}', fill='black')
        sheet.save(folder / f'{pdf.stem}-contact-{start // 6 + 1}.png')
    print(pdf.name, len(doc), 'pages')
