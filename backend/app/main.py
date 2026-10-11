import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.portfolio import router as portfolio_router
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
# Our own logs stay at INFO; chatty libraries (Qiskit prints every compiler pass at INFO) only speak up for problems.
for _noisy in ("qiskit", "matplotlib", "httpx", "httpcore", "yfinance", "urllib3", "peewee", "curl_cffi"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

MAX_BODY_BYTES = 16 * 1024  # a valid request is a few hundred bytes; refuse anything much bigger

app = FastAPI(title="Quantum Portfolio Optimizer")

origins = [o.strip() for o in settings.allowed_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def harden(request: Request, call_next):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "Request body too large."}, status_code=413)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(portfolio_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}