from typing import List
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel, Field
from scanner import scan_domain

app = FastAPI(
    title="Quantum-Ready Civic Scanner API",
    description="Backend API for checking public website post-quantum TLS readiness.",
    version="1.0.0"
)

class BatchRequest(BaseModel):
    domains: List[str] = Field(..., max_items=10, description="List of up to 10 domains to scan")

@app.get("/scan")
def scan_single(domain: str = Query(..., description="Domain name to scan")):
    result = scan_domain(domain)
    return result

@app.post("/scan/batch")
def scan_batch(req: BatchRequest):
    if len(req.domains) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 domains allowed per batch request.")
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(scan_domain, req.domains))
    
    return {"results": results}