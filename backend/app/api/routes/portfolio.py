import logging

from fastapi import APIRouter, HTTPException

from app.schemas.portfolio import OptimizeRequest, OptimizeResponse, TickerCheck
from app.services.market_data import POPULAR_TICKERS, TickerNotFoundError, normalize_ticker, ticker_exists
from app.services.optimizer import optimize

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/tickers/popular", response_model=list[str])
def popular_tickers():
    return POPULAR_TICKERS


@router.get("/tickers/validate/{symbol}", response_model=TickerCheck)
def validate_ticker(symbol: str):
    try:
        sym = normalize_ticker(symbol)
    except TickerNotFoundError:
        return TickerCheck(ticker=symbol.upper(), valid=False)
    return TickerCheck(ticker=sym, valid=ticker_exists(sym))


# Plain `def` (not async): the work is CPU-bound, so FastAPI runs it in a thread pool.
@router.post("/optimize", response_model=OptimizeResponse)
def optimize_portfolio(req: OptimizeRequest):
    try:
        return optimize(req)
    except TickerNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        log.exception("optimization failed")
        raise HTTPException(status_code=500, detail=f"Solver failed: {exc}") from exc
