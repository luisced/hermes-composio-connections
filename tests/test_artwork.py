"""Tests for offline artwork generation, never upstream account operations."""
import importlib.util
import io
from pathlib import Path
import pytest
from PIL import Image

spec = importlib.util.spec_from_file_location('asset_generator', Path(__file__).parents[1] / 'scripts/refresh-service-logos.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_catalog_icon_is_inert_compact_png_with_dark_mark_contrast():
    raw = b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>throw new Error("never execute")</script><circle cx="32" cy="32" r="20" fill="black"/></svg>'
    png, plate = module.rasterize(raw, 'image/svg+xml')
    assert png.startswith(b'\x89PNG\r\n\x1a\n')
    image = Image.open(io.BytesIO(png)).convert('RGBA')
    assert image.size == (64, 64)
    assert plate == '#ffffff'
    assert image.getpixel((32, 32)) == (0, 0, 0, 255)
    assert image.getpixel((5, 32)) == (255, 255, 255, 255)


def test_svg_cannot_fetch_external_resources():
    raw = b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64"><image xlink:href="https://untrusted.invalid/image.png" width="64" height="64"/></svg>'
    with pytest.raises(ValueError, match='External SVG href blocked'):
        module.rasterize(raw, 'image/svg+xml')


def test_svg_entities_are_rejected_without_reading_local_files():
    raw = b'<!DOCTYPE svg [<!ENTITY entity SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><text>&entity;</text></svg>'
    from defusedxml.common import DefusedXmlException
    with pytest.raises(DefusedXmlException):
        module.rasterize(raw, 'image/svg+xml')


def test_valid_svg_percentage_opacity_is_supported_by_offline_renderer():
    raw=b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red" stroke="black" stroke-opacity="100%"/></svg>'
    png,_=module.rasterize(raw,'image/svg+xml')
    assert Image.open(io.BytesIO(png)).size==(64,64)
