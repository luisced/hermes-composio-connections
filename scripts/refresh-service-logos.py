#!/usr/bin/env python3
"""Generate compact, offline catalog artwork; no consumer account writes.

Run from this repo using Python with cairosvg==2.9.1, pillow==13.0.0,
defusedxml==0.7.1. API auth is read by the backend's existing catalog adapter.
All caches/intermediates stay under TMPDIR; only the generated map and manifest
are written to the project. Never execute upstream SVG or allow external refs.
"""
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
import time
import httpx
import xml.etree.ElementTree as ET

from defusedxml import ElementTree as SafeET
from cairosvg.surface import PNGSurface
from cairosvg.url import fetch as cairo_fetch
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dashboard.catalog import Catalog

CACHE = Path(os.environ.get('TMPDIR', str(Path.home() / '.hermes/cache/scratch'))) / 'composio-icons-64-v1'
CACHE.mkdir(parents=True, exist_ok=True)
Image.MAX_IMAGE_PIXELS = 25_000_000
SIZE = 64
HTTP = httpx.Client(follow_redirects=False, timeout=httpx.Timeout(20, connect=10),
                    limits=httpx.Limits(max_connections=16, max_keepalive_connections=16, keepalive_expiry=120))


def safe_svg_fetch(url, kind):
    if not re.match(r'^data:image/(png|jpeg|webp);base64,', url) or len(url) > 1_400_000:
        raise ValueError('External SVG resource blocked')
    return cairo_fetch(url, kind)


def rasterize(body, mime):
    if mime == 'image/svg+xml' or body.lstrip().startswith((b'<svg', b'<?xml')):
        root = SafeET.fromstring(body)
        for parent in root.iter():
            for child in list(parent):
                if child.tag.split('}')[-1] in ('script', 'foreignObject'):
                    parent.remove(child)
            for name, value in list(parent.attrib.items()):
                if name in ('opacity', 'stroke-opacity', 'fill-opacity', 'stop-opacity') and re.fullmatch(r'\d+(?:\.\d+)?%', value):
                    parent.attrib[name] = str(float(value[:-1]) / 100)
                if name.lower().startswith('on'):
                    del parent.attrib[name]
                elif name.endswith('href') and not value.startswith(('#', 'data:image/')):
                    raise ValueError('External SVG href blocked')
        body = PNGSurface.convert(bytestring=ET.tostring(root), output_width=SIZE, output_height=SIZE, url_fetcher=safe_svg_fetch)
    with Image.open(io.BytesIO(body)) as image:
        if image.width * image.height > 25_000_000: raise ValueError('Oversized image')
        glyph = ImageOps.contain(image.convert('RGBA'), (SIZE, SIZE), Image.Resampling.LANCZOS)
    if glyph.getbbox() is None: raise ValueError('Empty image')
    canvas = Image.new('RGBA', (SIZE, SIZE))
    pixels = [p for p in glyph.get_flattened_data() if p[3] > 64]
    dark = sum(max(p[:3]) < 100 for p in pixels) / max(1, len(pixels))
    white = sum(min(p[:3]) > 180 for p in pixels) / max(1, len(pixels))
    backplate = '#ffffff' if dark > .85 else '#181818' if white > .90 else None
    if backplate:
        ImageDraw.Draw(canvas).rounded_rectangle((0, 0, SIZE-1, SIZE-1), radius=10, fill=backplate)
    canvas.alpha_composite(glyph, ((SIZE-glyph.width)//2, (SIZE-glyph.height)//2))
    out = io.BytesIO(); canvas.save(out, format='PNG', optimize=True)
    return out.getvalue(), backplate


def get_icon(service):
    slug = service['slug']
    source = 'https://logos.composio.dev/api/' + slug
    png_path, meta_path = CACHE / (slug + '.png'), CACHE / (slug + '.json')
    if png_path.is_file() and meta_path.is_file():
        png, meta = png_path.read_bytes(), json.loads(meta_path.read_text())
        if hashlib.sha256(png).hexdigest() == meta.get('embedded_sha256'):
            return slug, png, meta, None
    last_error = None
    for attempt in range(2):
        try:
            with HTTP.stream('GET', source, headers={'User-Agent': 'Hermes-Composio-Assets'}) as response:
                response.raise_for_status()
                mime = response.headers.get('content-type', '').split(';', 1)[0]
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > 2_000_000: raise ValueError('Asset exceeds 2 MB')
                body = bytes(body)
            png, plate = rasterize(body, mime)
            meta = {'slug': slug, 'source': source, 'original_sha256': hashlib.sha256(body).hexdigest(),
                    'embedded_sha256': hashlib.sha256(png).hexdigest(), 'bytes': len(png),
                    'format': 'PNG', 'size': SIZE, 'backplate': plate}
            png_path.write_bytes(png); meta_path.write_text(json.dumps(meta))
            return slug, png, meta, None
        except Exception as exc:
            last_error = type(exc).__name__ + (':' + str(exc.response.status_code) if isinstance(exc, httpx.HTTPStatusError) else '')
            if attempt == 0: time.sleep(.3)
    return slug, None, None, {'slug': slug, 'source': source, 'reason': last_error}


def main():
    for attempt in range(3):
        try:
            catalog = asyncio.run(Catalog().list())
            break
        except Exception:
            if attempt == 2: raise
            print('Catalog changed or unavailable during pagination; retrying a fresh snapshot', flush=True)
            time.sleep(1)
    assert catalog['complete'] and len(catalog['items']) == catalog['total']
    services = {s['slug']: {'name': s['name']} for s in catalog['items']}
    manifest, missing = [], []
    print('Official catalog:', catalog['total'], 'services', flush=True)
    with HTTP, ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(get_icon, s) for s in catalog['items']]
        for number, future in enumerate(as_completed(futures), 1):
            slug, png, meta, error = future.result()
            if png:
                services[slug]['logo'] = 'data:image/png;base64,' + base64.b64encode(png).decode()
                manifest.append(meta)
            else: missing.append(error)
            if number % 100 == 0 or number == len(futures):
                print('Processed', number, '/', len(futures), 'icons:', len(manifest), 'unavailable:', len(missing), flush=True)
    # The initial thirteen embedded icons remain a fallback if a CDN fetch fails.
    target = ROOT / 'desktop/plugin.js'
    original = target.read_text()
    pattern = r'const SERVICES = (.*?);\nconst ID'
    previous = json.loads(re.search(pattern, original, re.S).group(1))
    for slug, value in previous.items():
        if slug in services and not services[slug].get('logo') and value.get('logo'):
            services[slug]['logo'] = value['logo']
    updated, count = re.subn(pattern, lambda _: 'const SERVICES = ' + json.dumps(services, ensure_ascii=False, indent=2) + ';\nconst ID', original, count=1, flags=re.S)
    assert count == 1
    target.write_text(updated)
    report = {'note': 'Brand trademarks belong to their respective owners. Public Composio CDN artwork rasterized to inert 64px PNGs and embedded in the ESM; no third-party image requests from private views.',
              'catalog_total': catalog['total'], 'logos': sorted(manifest, key=lambda x:x['slug']),
              'unavailable': sorted(missing, key=lambda x:x['slug'])}
    (ROOT / 'assets/service-logos.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Bundle bytes:', len(updated.encode()), 'verified artwork:', len(manifest), 'unavailable:', len(missing), flush=True)


if __name__ == '__main__': main()
