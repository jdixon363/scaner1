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