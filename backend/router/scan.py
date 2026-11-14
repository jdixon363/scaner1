from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from service.scanner import ScanResult, scan_domain

router = APIRouter(prefix="/scan", tags=["scan"])


class BatchRequest(BaseModel):
    domains: list[str] = Field(min_length=1, max_length=10, description="Up to 10 domains to scan")


class BatchResponse(BaseModel):
    results: list[ScanResult]


@router.get("")
def scan_single(domain: Annotated[str, Query(description="Domain name to scan")]) -> ScanResult:
    return scan_domain(domain)


@router.post("/batch")
def scan_batch(req: BatchRequest) -> BatchResponse:
    return BatchResponse(results=[scan_domain(d) for d in req.domains])
