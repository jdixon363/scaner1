import sys
import json
import argparse
from scanner import scan_domain

def main():
    parser = argparse.ArgumentParser(description="Quantum-Ready Civic Scanner CLI")
    parser.add_argument("domains", nargs="+", help="Domains to scan")
    parser.add_argument("--save", type=str, help="Save JSON results to specified file")
    args = parser.parse_args()

    results = []
    print(f"\nScanning {len(args.domains)} domain(s)...\n")
    print(f"{'DOMAIN':<25} | {'STATUS':<10} | {'SCORE':<5} | {'GROUP / TLS'}")
    print("-" * 75)

    for d in args.domains:
        res = scan_domain(d)
        results.append(res)
        status = res["status"]
        score = res["score"]
        group = res.get("negotiated_group") or res.get("error") or "N/A"
        print(f"{res['domain']:<25} | {status:<10} | {score:<5} | {group}")

    print("-" * 75)
    
    if args.save:
        with open(args.save, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nSaved results to {args.save}")

if __name__ == "__main__":
    main()