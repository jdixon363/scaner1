import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from router import scan

app = FastAPI(
    title="Quantum-Ready Civic Scanner API",
    description="Checks whether public websites support post-quantum hybrid TLS key exchange.",
    version="1.0.0",
)

app.include_router(scan.router)

ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "https://scaner1.usemaison.io,http://scaner1.usemaison.io,"
    "https://api-scaner1.usemaison.io,http://api-scaner1.usemaison.io",
).split(",")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])
