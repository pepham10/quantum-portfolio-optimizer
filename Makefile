# Quick commands. Run `make setup` once, then `make backend` and `make web`
# in two terminals. Raw commands are in the README if you don't have make.

PYTHON ?= python3.12
VENV   := backend/.venv
BIN    := $(VENV)/bin

.PHONY: setup backend web test refresh-data

setup:
	$(PYTHON) -m venv $(VENV)
	$(BIN)/pip install --upgrade pip
	$(BIN)/pip install -r backend/requirements.txt
	npm --prefix web install

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

web:
	npm --prefix web run dev

test:
	cd backend && .venv/bin/python -m pytest -q
	npm --prefix web run build

# Refresh the offline price snapshot used when Yahoo Finance is unreachable.
refresh-data:
	cd backend && .venv/bin/python -m scripts.refresh_fallback
