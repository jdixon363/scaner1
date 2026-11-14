# Quantum-Ready Civic Scanner

A web tool that checks whether a website protects its visitors against "harvest now, decrypt later" attacks.
You type a website address, and it tells you in plain English whether the site uses hybrid post-quantum key exchange in TLS.

Built for the hackathon "Past Revolutions, Future Power: Shaping Chicago's Quantum Future" (see [objectiv.md](objectiv.md) for the brief).
Work tracking, rubric estimate and open questions live in [progress.md](progress.md).

## The problem

Today's web encryption uses key exchange such as X25519.
An attacker can record encrypted traffic now and decrypt it later, once quantum computers are powerful enough.
This is called harvest now, decrypt later.

The fix already exists.
Hybrid key exchange (for example `X25519MLKEM768`, X25519 combined with ML-KEM) protects traffic against both classical and quantum attackers.
Large providers such as Cloudflare and Google already enable it by default.

Small nonprofits, clinics and local shops depend on their hosts and cannot afford security consultants.
Most of them do not know the risk exists, and have no easy way to check where they stand.

## Who it is for

Small organizations and their IT helpers, with a focus on Chicago communities.
Typical users are nonprofit staff, small business owners and volunteer IT teams.

## What it does

1. The user enters a domain (single scan) or up to 10 domains (batch scan).
2. The backend validates the domain, then runs `openssl s_client -groups X25519MLKEM768:X25519` against port 443.
3. It reads the output and returns a status, TLS version and key exchange group.
4. The UI explains what the result means and what to ask the hosting provider.

Result statuses:

| Status | Meaning |
| --- | --- |
| Ready | The server negotiated hybrid post-quantum key exchange. |
| Vulnerable | The server works, but only uses classical key exchange. Safe today, exposed to harvest now, decrypt later. |
| Error | The scan did not complete (bad domain, unreachable host, no TLS). |

## What we have today

Backend ([backend/](backend/)):

- FastAPI service with `GET /scan?domain=...` and `POST /scan/batch` (up to 10 domains).
- Scanner in [backend/service/scanner.py](backend/service/scanner.py) that shells out to the system OpenSSL.
- Domain format validation and a private-IP (SSRF) check.
- `MOCK_MODE=1` for deterministic canned results during development.
- Dockerfile based on Debian trixie, which ships OpenSSL 3.5 (required for `X25519MLKEM768`).
- Sample domains in [backend/demo_domains.json](backend/demo_domains.json).

Frontend ([frontend/](frontend/)):

- Vite, React and TypeScript single page app.
- Single site view with a result card, plain-English meaning and a next step per status.
- Batch view: paste up to 10 addresses, one per line, and see a results table.
- Session history shown as clustered dots, grouped by status.
- A short "why this matters" panel.
- Accessibility basics: labelled inputs, `aria-live` results, status shown with text and not only color.

Deployment:

- [docker-compose.yml](docker-compose.yml) runs the backend on port 8850 and the frontend (nginx) on port 3300.
- Intended to be exposed through Cloudflare Tunnel (see `host.txt` for the hostname mapping).

## Known limitations

These are tracked in detail in [progress.md](progress.md).
The most important ones:

- The scanner currently infers the negotiated group from a text match, it does not parse what OpenSSL actually negotiated.
- A failed handshake can be reported as "Vulnerable" instead of "Error".
- The score is coarse (95 or 50) and is not yet meaningful.
- The SSRF check is IPv4 only and does not defend against DNS rebinding.
- The tool checks key exchange on port 443 only.
  It does not check certificates or signatures, which are not post-quantum anywhere yet.
- If the hosted demo runs with `MOCK_MODE=1`, results are canned and not live.
- Backend tests were removed in the restructure and need to be restored.

## Run it

### With Docker (recommended)

Create a `.env` file in the project root:

```bash
CORS_ORIGINS=http://localhost:3300
VITE_API_URL=http://localhost:8850
```

Then:

```bash
docker compose up --build
```

The frontend is at `http://localhost:3300` and the API docs are at `http://localhost:8850/docs`.
`.env.dev` holds a development variant, use it with `docker compose --env-file .env.dev up --build`.

### Without Docker

Backend, needs OpenSSL 3.5 or newer (check with `openssl version`):

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
fastapi dev --port 8850
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

More backend detail is in [backend/README.md](backend/README.md).

## Technologies

- OpenSSL 3.5+ `s_client` for the live TLS probe.
- Python 3.12, FastAPI and Pydantic for the API.
- React 19, TypeScript and Vite for the UI, served by nginx.
- Docker and Docker Compose for deployment.

OpenSSL was chosen because it is the reference implementation, and its output is something an IT person can reproduce by hand.
No datasets, external APIs or AI models are used at runtime.

## Team and licenses

Team contributions: to be filled in.
License: to be decided.
