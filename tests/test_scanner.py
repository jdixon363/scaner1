import pytest
from scanner import validate_and_normalize_domain, parse_openssl_output, scan_domain

def test_input_validation():
    # Valid domains
    assert validate_and_normalize_domain("https://Example.com/path?query=1") == "example.com"
    assert validate_and_normalize_domain("sub.domain.org") == "sub.domain.org"
    
    # Invalid / SSRF checks
    with pytest.raises(ValueError):
        validate_and_normalize_domain("127.0.0.1")
    with pytest.raises(ValueError):
        validate_and_normalize_domain("http://localhost:8080")
    with pytest.raises(ValueError):
        validate_and_normalize_domain("192.168.1.1")
    with pytest.raises(ValueError):
        validate_and_normalize_domain("example.com; rm -rf /")
    with pytest.raises(ValueError):
        validate_and_normalize_domain("not a domain")

def test_parse_openssl_output():
    sample_hybrid = """
    CONNECTED(00000003)
    Protocol  : TLSv1.3
    Cipher    : TLS_AES_256_GCM_SHA384
    Negotiated TLS1.3 group: X25519MLKEM768
    """
    parsed = parse_openssl_output(sample_hybrid)
    assert parsed["tls_version"] == "TLSv1.3"
    assert parsed["negotiated_group"] == "X25519MLKEM768"
    assert parsed["cipher"] == "TLS_AES_256_GCM_SHA384"

def test_mock_mode_scan(monkeypatch):
    monkeypatch.setenv("MOCK_MODE", "1")
    res = scan_domain("cloudflare.com")
    assert res["status"] == "READY"
    assert res["score"] == 100
    assert res["hybrid_supported"] is True

    res2 = scan_domain("example.org")
    assert res2["status"] == "PARTIAL"
    assert res2["score"] == 50
    assert res2["hybrid_supported"] is False

@pytest.mark.network
def test_integration_real_site():
    # Real network integration test (skipped by default unless run with pytest -m network)
    res = scan_domain("cloudflare.com")
    assert res["domain"] == "cloudflare.com"
    assert res["status"] in ["READY", "PARTIAL", "AT_RISK", "UNREACHABLE"]