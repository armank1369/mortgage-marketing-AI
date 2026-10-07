#!/usr/bin/env python3
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def run(*args, check=True):
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=check)

def fail(msg):
    print(f"\nERROR: {msg}", file=sys.stderr)
    sys.exit(1)

def read(rel):
    p = ROOT / rel
    if not p.exists():
        fail(f"Missing expected file: {rel}")
    return p.read_text(encoding="utf-8").replace("\r\n", "\n")

def write(rel, content):
    p = ROOT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8", newline="\n")
    print(f"updated: {rel}")

def create_or_verify(rel, content):
    p = ROOT / rel
    if p.exists():
        current = p.read_text(encoding="utf-8").replace("\r\n", "\n")
        if current == content:
            print(f"already correct: {rel}")
            return
        fail(f"{rel} already exists with different contents; refusing to overwrite it.")
    write(rel, content)

def replace_once(rel, old, new, marker):
    content = read(rel)
    if marker in content:
        print(f"already patched: {rel}")
        return
    if old not in content:
        fail(f"Could not find expected insertion point in {rel}.")
    write(rel, content.replace(old, new, 1))

def ensure_line(rel, line):
    content = read(rel)
    if line in content.splitlines():
        print(f"already present: {rel}: {line}")
        return
    if content and not content.endswith("\n"):
        content += "\n"
    write(rel, content + line + "\n")

def env_value(path, key):
    if not path.exists():
        return None
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.strip()
    return None

def set_env_value(path, key, value):
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    out = []
    found = False
    for raw in lines:
        if raw.strip().startswith(f"{key}="):
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(raw)
    if not found:
        if out and out[-1] != "":
            out.append("")
        out.append(f"{key}={value}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
    print(f"updated local config: {path.relative_to(ROOT)} ({key})")

def main():
    if not (ROOT / ".git").exists():
        fail("Put this script in the mortgage-marketing-AI repository root.")

    branch = run("git", "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if branch != "luciev2_newteam":
        fail(f"Expected luciev2_newteam, but current branch is {branch!r}.")

    if run("git", "diff", "--quiet", check=False).returncode != 0:
        fail("Tracked files have uncommitted changes. Commit/stash them first.")
    if run("git", "diff", "--cached", "--quiet", check=False).returncode != 0:
        fail("There are staged changes. Commit/stash them first.")

    print("Applying Step E backend identity verification...\n")

    ensure_line("server/requirements.txt", "PyJWT[crypto]>=2.10,<3")

    env_example = read("server/.env.example")
    if "NEON_AUTH_BASE_URL=" not in env_example:
        anchor = "DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require\n"
        if anchor not in env_example:
            fail("DATABASE_URL anchor not found in server/.env.example")
        replacement = (
            anchor
            + "\n# Branch-specific Neon Auth configuration used by Flask to verify JWTs.\n"
            + "NEON_AUTH_BASE_URL=https://YOUR_BRANCH.neonauth.REGION.aws.neon.tech/neondb/auth\n"
            + "NEON_AUTH_JWKS_URL=\n"
        )
        write("server/.env.example", env_example.replace(anchor, replacement, 1))
    else:
        print("already patched: server/.env.example")

    client_auth_url = env_value(ROOT / "client/.env", "VITE_NEON_AUTH_URL")
    if client_auth_url:
        set_env_value(ROOT / "server/.env", "NEON_AUTH_BASE_URL", client_auth_url)
    else:
        print("warning: VITE_NEON_AUTH_URL not found in client/.env; add NEON_AUTH_BASE_URL to server/.env manually.")

    auth_utils = '''import os
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
'''
    create_or_verify("server/auth_utils.py", auth_utils)

    replace_once(
        "server/app.py",
        "from dotenv import load_dotenv\n",
        "from dotenv import load_dotenv\nfrom auth_utils import get_authenticated_user, require_auth\n",
        "from auth_utils import get_authenticated_user, require_auth",
    )

    hello_block = '''@app.route('/api/hello')
def hello():
    return jsonify({'message': 'Flask backend is running!'})


'''
    auth_route = hello_block + '''@app.route('/api/auth/me')
@require_auth
def auth_me():
    return jsonify({'user': get_authenticated_user()})


'''
    replace_once("server/app.py", hello_block, auth_route, "@app.route('/api/auth/me')")

    api_js = '''import axios from 'axios'
import { authClient } from './neon/neon.js'

export async function getBackendIdentity() {
  const { data: tokenData, error } = await authClient.token()

  if (error || !tokenData?.token) {
    const authError = new Error('No Neon Auth JWT is available for the current session')
    authError.code = 'NO_AUTH_TOKEN'
    throw authError
  }

  return axios.get('/api/auth/me', {
    headers: {
      Authorization: `Bearer ${tokenData.token}`,
    },
  })
}
'''
    create_or_verify("client/src/lib/api.js", api_js)

    debug_page = '''import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AuthLoading,
  RedirectToSignIn,
  SignedIn,
} from '@neondatabase/neon-js/auth/react'

import { getBackendIdentity } from '../lib/api'

function IdentityResult() {
  const [result, setResult] = useState({
    status: 'loading',
    user: null,
    error: null,
  })

  useEffect(() => {
    let active = true

    getBackendIdentity()
      .then(({ data }) => {
        if (active) setResult({ status: 'ok', user: data.user, error: null })
      })
      .catch((error) => {
        if (!active) return
        const status = error?.response?.status
        const message = error?.response?.data?.error || error?.message || 'Unknown error'
        setResult({
          status: 'error',
          user: null,
          error: `${status || 'client'}: ${message}`,
        })
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-bold text-slate-900">Backend identity check</h1>
        <p className="mt-2 text-sm text-slate-500">
          This development-only page asks Flask to verify the current Neon Auth JWT.
        </p>

        {result.status === 'loading' && (
          <p className="mt-6 text-sm text-slate-600">Verifying signed-in identity...</p>
        )}

        {result.status === 'error' && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">Verification failed</p>
            <p className="mt-1 text-xs text-red-600 break-all">{result.error}</p>
          </div>
        )}

        {result.status === 'ok' && result.user && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-800">JWT verified by Flask</p>
            <div className="text-xs text-slate-700 space-y-1">
              <p><span className="font-semibold">Name:</span> {result.user.name || '—'}</p>
              <p><span className="font-semibold">Email:</span> {result.user.email || '—'}</p>
              <p className="break-all"><span className="font-semibold">User ID:</span> {result.user.id}</p>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link to="/" className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Back to Lucie
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function AuthDebugPage() {
  return (
    <>
      <AuthLoading>
        <div>Loading...</div>
      </AuthLoading>
      <RedirectToSignIn />
      <SignedIn>
        <IdentityResult />
      </SignedIn>
    </>
  )
}
'''
    create_or_verify("client/src/pages/AuthDebugPage.jsx", debug_page)

    replace_once(
        "client/src/App.jsx",
        "import AuthPage from './pages/AuthPage'\n",
        "import AuthPage from './pages/AuthPage'\nimport AuthDebugPage from './pages/AuthDebugPage'\n",
        "import AuthDebugPage from './pages/AuthDebugPage'",
    )

    replace_once(
        "client/src/App.jsx",
        '      <Route path="/auth/:pathname" element={<AuthPage />} />\n',
        '      <Route path="/auth/:pathname" element={<AuthPage />} />\n'
        '      {import.meta.env.DEV && (\n'
        '        <Route path="/debug/auth" element={<AuthDebugPage />} />\n'
        '      )}\n',
        'path="/debug/auth"',
    )

    print("\nPatch applied successfully.")
    print("Next:")
    print("  python -m pip install -r server/requirements.txt")
    print("  git diff --check")
    print("  git status")
    print("Then run Flask + Vite and open http://localhost:3000/debug/auth")

if __name__ == "__main__":
    main()
