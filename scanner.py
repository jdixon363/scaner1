import os
import re
import ssl
import socket
import subprocess
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger("quantum_scanner")

class SSRFError(Exception):
    """Raised when a domain or IP resolves to a restricted/private network range."""
    pass

@dataclass
class ScanResult:
    domain: str
    status: str  # "Ready", "Vulnerable", "Error"
    score: int
    tls_version: str
    negotiated_group: Optional[str] = None
    supported_groups: List[str] = field(default_factory=list)
    details: str = ""
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

def verify_ssrf(domain: str) -> str:
    """Validates domain format and ensures it does not resolve to local/private IPs."""
    if not re.match(r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$", domain):
        raise ValueError(f"Invalid domain format: {domain}")
    
    try:
        ip_str = socket.gethostbyname(domain)
        ip_obj = socket.inet_aton(ip_str)
        # Basic check for private/loopback ranges
        parts = ip_str.split('.')
        if parts[0] in ('10', '127') or (parts[0] == '192' and parts[1] == '168') or (parts[0] == '172' and 16 <= int(parts[1]) <= 31):
            raise SSRFError(f"SSRF blocked: Domain {domain} resolves to private IP {ip_str}")
        return ip_str
    except socket.gaierror:
        raise ValueError(f"Could not resolve domain: {domain}")

class OpenSSLRunner:
    @staticmethod
    def run_s_client(domain: str, openssl_path: str = "openssl") -> str:
        """Executes openssl s_client to probe supported groups and TLS parameters."""
        if os.environ.get("MOCK_MODE") == "1":
            return "MOCK_MODE_OUTPUT"
            
        cmd = [openssl_path, "s_client", "-connect", f"{domain}:443", "-servername", domain, "-groups", "X25519MLKEM768:X25519"]
        try:
            result = subprocess.run(
                cmd,
                input=b"Q\r\n",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=5
            )
            return result.stdout.decode('utf-8', errors='ignore') + result.stderr.decode('utf-8', errors='ignore')
        except Exception as e:
            logger.warning(f"OpenSSL execution failed for {domain}: {e}")
            return ""

class QuantumScanner:
    def __init__(self, mock_mode: Optional[bool] = None):
        if mock_mode is not None:
            self.mock_mode = mock_mode
        else:
            self.mock_mode = os.environ.get("MOCK_MODE") == "1"

    def scan_domain(self, domain: str) -> ScanResult:
        try:
            ip = verify_ssrf(domain)
        except Exception as e:
            return ScanResult(domain=domain, status="Error", score=0, tls_version="N/A", details=str(e))

        if self.mock_mode:
            # Deterministic mock response for development
            is_quantum = "cloudflare" in domain.lower() or "example" in domain.lower()
            return ScanResult(
                domain=domain,
                status="Ready" if is_quantum else "Vulnerable",
                score=95 if is_quantum else 40,
                tls_version="TLSv1.3",
                negotiated_group="X25519MLKEM768" if is_quantum else "X25519",
                supported_groups=["X25519MLKEM768", "X25519"] if is_quantum else ["X25519"],
                details="Mock scan successful"
            )

        output = OpenSSLRunner.run_s_client(domain)
        if not output:
            return ScanResult(domain=domain, status="Error", score=0, tls_version="N/A", details="Failed to connect via OpenSSL")

        has_pq = "X25519MLKEM768" in output or "Kyber" in output
        tls_v = "TLSv1.3" if "TLSv1.3" in output else "TLSv1.2"
        
        score = 95 if has_pq else 50
        status = "Ready" if has_pq else "Vulnerable"

        return ScanResult(
            domain=domain,
            status=status,
            score=score,
            tls_version=tls_v,
            negotiated_group="X25519MLKEM768" if has_pq else "X25519",
            supported_groups=["X25519MLKEM768", "X25519"] if has_pq else ["X25519"],
            details="Live scan completed via OpenSSL 3.5+"
        )