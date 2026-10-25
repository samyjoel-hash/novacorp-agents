"""Private settings (API keys) of the machine that runs the agents.

Keys are never written in the code: only their names are. Their values are entered by the user
in the CRM (Settings → Integrations) or set in the environment, and stored in the local .env file,
which only the owner of the machine can read and which is never published.
"""
import json
import os
import sys
from pathlib import Path

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

KEYS = {
    "ANTHROPIC_API_KEY": "Anthropic: runs the Manager and the agents (pay as you go)",
    "APIFY_TOKEN": "Apify: finds companies (Google Maps)",
    "SCRAPINGBEE_API_KEY": "ScrapingBee: reads company websites",
}


def _read_lines():
    return ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []


def load():
    """Copies the .env values into the environment; variables already set by the system take precedence."""
    for line in _read_lines():
        key, sep, value = line.strip().partition("=")
        if sep and key and not key.startswith("#") and value.strip():
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def save(name, value):
    """Stores (or removes, if value is empty) one key in .env, readable by the owner only."""
    if name not in KEYS:
        raise ValueError(f"unknown setting {name}")
    value = (value or "").strip()
    if any(c in value for c in "\r\n\0 \t\"'") or len(value) > 500:
        raise ValueError("invalid value")
    lines = [l for l in _read_lines() if l.strip().partition("=")[0].strip() != name]
    if value:
        lines.append(f"{name}={value}")
        os.environ[name] = value
    else:
        os.environ.pop(name, None)
    ENV_FILE.touch(mode=0o600, exist_ok=True)
    ENV_FILE.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    os.chmod(ENV_FILE, 0o600)


def masked(value):
    """Enough to recognise a key, never enough to use it: 'sk-ant…a3F9'."""
    if not value:
        return ""
    return value[:6] + "…" + value[-4:] if len(value) > 14 else "…" + value[-2:]


def require(name):
    """Returns the setting, or stops with a clear message the agent can report."""
    load()
    value = os.environ.get(name, "").strip()
    if not value:
        print(json.dumps({"result": "ERROR", "reason": f"{name} is not set: add it in the CRM (Settings → Integrations)"}))
        sys.exit(1)
    return value
