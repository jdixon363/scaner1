# trixie ships OpenSSL 3.5, required for X25519MLKEM768
FROM python:3.12-slim-trixie
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8850
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8850"]
