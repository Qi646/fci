# Municipal Data Infrastructure

Clean rebuild of a two-part prototype:

- `backend/`: FastAPI data access layer over municipal JSON datasets
- `frontend/`: Next.js dashboard consuming the API

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The API runs at `http://127.0.0.1:8000`.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard runs at `http://127.0.0.1:3000`.

Set `NEXT_PUBLIC_API_BASE_URL` if the backend is not on `127.0.0.1:8000`.

## Current endpoints

- `GET /health`
- `GET /catalog`
- `GET /datasets/{dataset_id}/query`
- `POST /join`
- `GET /audit`
