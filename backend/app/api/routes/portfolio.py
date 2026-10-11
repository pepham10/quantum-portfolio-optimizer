import logging
import threading
import time
from collections import OrderedDict

from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import OptimizeRequest, OptimizeResponse, TickerCheck
from app.services.market_data import POPULAR_TICKERS, TickerNotFoundError, normalize_ticker, ticker_exists
from app.services.optimizer import optimize

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

# A run is CPU-heavy (about 2 s here), so at most MAX_PARALLEL run at once; the rest wait their turn.
MAX_PARALLEL = 2
_slots = threading.BoundedSemaphore(MAX_PARALLEL)

# Same request -> same answer (the QAOA seed is fixed), so remember recent results for a few minutes.
CACHE_TTL_SECONDS = 10 * 60
CACHE_MAX_ENTRIES = 32
_results: OrderedDict[str, tuple[float, OptimizeResponse]] = OrderedDict()
_results_lock = threading.Lock()


def _cache_get(key: str) -> OptimizeResponse | None:
    with _results_lock:
        hit = _results.get(key)
        if hit is None or time.time() - hit[0] > CACHE_TTL_SECONDS:
            _results.pop(key, None)
            return None
        _results.move_to_end(key)
        return hit[1]


def _cache_put(key: str, value: OptimizeResponse) -> None:
    with _results_lock:
        _results[key] = (time.time(), value)
        _results.move_to_end(key)
        while len(_results) > CACHE_MAX_ENTRIES:
            _results.popitem(last=False)


@router.get("/tickers/popular", response_model=list[str])
def popular_tickers():
    return POPULAR_TICKERS


@router.get("/tickers/validate/{symbol}", response_model=TickerCheck)
def validate_ticker(symbol: str):
    try:
        sym = normalize_ticker(symbol)
    except TickerNotFoundError:
        return TickerCheck(ticker=symbol.strip().upper()[:12], valid=False)  # trimmed: don't echo huge input
    return TickerCheck(ticker=sym, valid=ticker_exists(sym))


# Plain `def` (not async): the work is CPU-bound, so FastAPI runs it in a thread pool.
@router.post("/optimize", response_model=OptimizeResponse)
def optimize_portfolio(req: OptimizeRequest):
    key = req.model_dump_json()
    cached = _cache_get(key)
    if cached is not None:
        return cached
    try:
        with _slots:
            cached = _cache_get(key)  # another request may have finished this exact run while we waited
            if cached is not None:
                return cached
            result = optimize(req)
        _cache_put(key, result)
        return result
    except TickerNotFoundError as exc:  # also covers DataQualityError
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("optimization failed")  # details stay in the server log, not in the response
        raise HTTPException(status_code=500, detail="The optimizer hit an unexpected error. Please try again.") from exc