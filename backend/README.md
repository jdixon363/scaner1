# Quantum-Ready Civic Scanner Backend

A lightweight backend tool built for hackathons to check whether a public website's TLS configuration supports post-quantum hybrid key exchange (`X25519MLKEM768`) and evaluate its quantum readiness score.

---

## Installation & OpenSSL 3.5+ Setup

This tool calls the system `openssl` binary directly to inspect negotiated key-exchange groups.

### 1. Install OpenSSL 3.5+
- **macOS (Homebrew):**
  ```bash
  brew install openssl@3.5
  export PATH="/opt/homebrew/opt/openssl@3.5/bin:$PATH"
  - **Ubuntu / Debian:** use a distro or source build of OpenSSL 3.5 or newer, then check with `openssl version`.

Without OpenSSL 3.5+ the live scan cannot offer `X25519MLKEM768` and will report sites as vulnerable.

---

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
fastapi dev --port 8850
```

The API is at `http://127.0.0.1:8850` and interactive docs are at `/docs`.

Set `MOCK_MODE=1` to return deterministic canned results without calling OpenSSL.

```bash
MOCK_MODE=1 fastapi dev
```

---

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/scan?domain=example.com` | Scan one domain |
| POST | `/scan/batch` | Scan up to 10 domains, body `{"domains": ["a.com", "b.com"]}` |

Each result has `domain`, `status` (`Ready`, `Vulnerable` or `Error`), `score`, `tls_version`, `negotiated_group`, `supported_groups`, `details` and `timestamp`.

---

## Layout

```
main.py             app and router registration
router/scan.py      HTTP endpoints and request models
service/scanner.py  scanning logic (SSRF check, OpenSSL probe, scoring)
demo_domains.json   sample domains for demos
```
