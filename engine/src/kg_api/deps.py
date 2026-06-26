"""Auth chokepoint (backend-guide D3 / P0-2).

`get_current_user` is the SINGLE source of `user_id` for the whole API — every handler depends on
it, and nothing else may mint a user_id. The edition selects the mechanism via `KG_AUTH`:

  none   — Community single-tenant: a fixed local user_id, no token. The server should bind loopback
           only (a constant user on a network-reachable port would invert the privacy promise).
  local  — Community with a shared bearer token (KG_LOCAL_TOKEN) for a LAN/self-host deployment.
  clerk  — Premium: verify a Clerk JWT. Not wired locally (no key) → 501 until configured.

Keeping this as one dependency is what makes the native auth swap mechanical and keeps tenancy
enforcement at exactly one chokepoint (the precondition for the cross-tenant leak test, P1-8)."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Header, HTTPException

from kg_engine import Settings


@dataclass
class AuthContext:
    """The authenticated principal. `user_id` is the sole tenancy key downstream."""

    user_id: str
    edition: str = "community"


def _settings() -> Settings:
    return Settings()


def get_current_user(authorization: str | None = Header(default=None)) -> AuthContext:
    s = _settings()
    mode = s.auth
    if mode == "none":
        return AuthContext(user_id=s.local_user_id, edition="community")
    if mode == "local":
        token = (authorization or "").removeprefix("Bearer ").strip()
        if not s.local_token or token != s.local_token:
            raise HTTPException(status_code=401, detail="invalid or missing token")
        return AuthContext(user_id=s.local_user_id, edition="community")
    if mode == "clerk":
        # Premium: verify the Clerk JWT (PyJWT + JWKS). No key is wired in local/dev, so fail
        # loudly rather than silently admitting an unauthenticated request.
        raise HTTPException(status_code=501, detail="clerk auth not configured")
    raise HTTPException(status_code=500, detail=f"unknown KG_AUTH mode: {mode}")
