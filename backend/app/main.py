import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.portfolio import router as portfolio_router
from app.core.config import settings

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Quantum Portfolio Optimizer")

origins = [o.strip() for o in settings.allowed_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
