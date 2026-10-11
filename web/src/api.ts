import type { OptimizeRequest, OptimizeResponse } from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new ApiError(
      'Cannot reach the backend. Is it running? Start it with `make backend` (or uvicorn on port 8000).',
    )
  }
  if (!res.ok) {
    // The Vite dev proxy answers 502-504 when the backend is not running.
    let detail = [502, 503, 504].includes(res.status)
      ? 'The backend is not responding. Is it running on port 8000? Start it with `make backend`.'
      : `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
      // FastAPI validation errors: a list of {loc, msg}
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join('; ')
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  popular: () => request<string[]>('/api/tickers/popular'),
  validate: (symbol: string) =>
    request<{ ticker: string; valid: boolean }>(`/api/tickers/validate/${encodeURIComponent(symbol)}`),
  optimize: (body: OptimizeRequest) =>
    request<OptimizeResponse>('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
