"""Security guards: request limits, headers, safe SVG, busy server, bounded caches."""

import time

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.api.routes import portfolio as routes
from app.main import MAX_BODY_BYTES, app
from app.services import market_data as md
from app.services.quantum_solver import sanitize_svg

client = TestClient(app, raise_server_exceptions=False)


def test_security_headers_on_every_response():
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["cache-control"] == "no-store"


def test_oversized_body_is_refused():
    r = client.post("/api/optimize", content="x" * (MAX_BODY_BYTES + 1), headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_overlong_ticker_is_a_422():
    r = client.post("/api/optimize", json={"tickers": ["AAA", "BBB", "C" * 5000]})
    assert r.status_code == 422


def test_error_message_does_not_echo_long_symbols():
    with pytest.raises(md.TickerNotFoundError) as exc:
        md.normalize_ticker("<" + "x" * 500)
    assert len(str(exc.value)) < 80


def test_sanitize_svg_removes_executable_parts():
    dirty = '<svg onload="steal()"><script>alert(1)</script><a href="javascript:evil()">x</a><rect onclick=\'x()\' /></svg>'
    clean = sanitize_svg(dirty)
    for bad in ("<script", "onload", "onclick", "javascript:", "alert"):
        assert bad not in clean.lower()
    assert "<rect" in clean


def test_sanitize_svg_keeps_normal_svg_unchanged():
    ok = '<svg viewBox="0 0 10 10"><text x="1" y="2">NVDA</text></svg>'
    assert sanitize_svg(ok) == ok


def test_busy_server_answers_503_instead_of_hanging(monkeypatch):
    monkeypatch.setattr(routes, "WAIT_SECONDS", 0.2)
    monkeypatch.setattr(routes, "_results", routes.OrderedDict())
    held = [routes._slots.acquire() for _ in range(routes.MAX_PARALLEL)]
    try:
        r = client.post("/api/optimize", json={"tickers": ["NVDA", "AAPL", "MSFT"], "include_noise": False})
    finally:
        for _ in held:
            routes._slots.release()
    assert r.status_code == 503
    assert "busy" in r.json()["detail"]


def test_in_memory_caches_are_bounded(monkeypatch):
    cache = {f"T{i}": (time.time(), pd.Series(dtype=float)) for i in range(md.MAX_CACHED_SYMBOLS + 50)}
    md._trim(cache)
    assert len(cache) == md.MAX_CACHED_SYMBOLS
    assert "T0" not in cache and f"T{md.MAX_CACHED_SYMBOLS + 49}" in cache