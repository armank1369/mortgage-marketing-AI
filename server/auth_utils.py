import os
from functools import wraps
from urllib.parse import urlparse

import jwt
from flask import current_app, g, jsonify, request
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError

_jwks_clients = {}

def _auth_config():
    base_url = os.environ.get("NEON_AUTH_BASE_URL", "").rstrip("/")
    if not base_url:
        raise RuntimeError("NEON_AUTH_BASE_URL is not configured")

    parsed = urlparse(base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise RuntimeError("NEON_AUTH_BASE_URL is invalid")

    origin = f"{parsed.scheme}://{parsed.netloc}"
    jwks_url = os.environ.get("NEON_AUTH_JWKS_URL") or f"{base_url}/.well-known/jwks.json"
    return origin, jwks_url

def _jwks_client(jwks_url):
    client = _jwks_clients.get(jwks_url)
    if client is None:
        client = PyJWKClient(jwks_url)
        _jwks_clients[jwks_url] = client
    return client

def _unauthenticated():
    return jsonify({"error": "unauthenticated"}), 401

def authenticate_request():
    auth_header = request.headers.get("Authorization", "")
    scheme, separator, token = auth_header.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        return _unauthenticated()

    token = token.strip()
    try:
        origin, jwks_url = _auth_config()
        signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["EdDSA"],
            issuer=origin,
            audience=origin,
            options={"require": ["exp", "iss", "aud", "sub"]},
            leeway=5,
        )
    except RuntimeError as error:
        current_app.logger.error("Neon Auth backend configuration error: %s", error)
        return jsonify({"error": "auth_not_configured"}), 500
    except (InvalidTokenError, PyJWKClientError, KeyError, ValueError) as error:
        current_app.logger.info("Rejected invalid Neon Auth token: %s", type(error).__name__)
        return _unauthenticated()
    except Exception as error:
        current_app.logger.exception("Neon Auth verification unavailable: %s", type(error).__name__)
        return jsonify({"error": "auth_verification_unavailable"}), 503

    subject = payload.get("sub")
    if not subject:
        return _unauthenticated()

    g.auth_user_id = subject
    g.auth_claims = payload
    return None

def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        failure = authenticate_request()
        if failure is not None:
            return failure
        return view(*args, **kwargs)
    return wrapped

def get_authenticated_user():
    claims = getattr(g, "auth_claims", {}) or {}
    user_id = getattr(g, "auth_user_id", None)
    if not user_id:
        return None
    return {
        "id": user_id,
        "email": claims.get("email"),
        "name": claims.get("name"),
    }
