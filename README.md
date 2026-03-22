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

## Architecture notes

- Production-oriented municipal access control model: [MUNICIPAL_ACCESS_MODEL.md](/home/qi/proj/fci/MUNICIPAL_ACCESS_MODEL.md)

## Access control

The prototype now uses a mock municipal identity directory plus purpose-based policy enforcement.

- Send `Authorization: Bearer <user_id>`
- Send `X-Purpose: <approved-purpose>`
- The backend evaluates department, classification, share mode, purpose, masking, join rules, and audit permissions

Useful demo users:

- `public_portal`
- `eng_analyst`
- `planner`
- `health_steward`
- `social_manager`
- `transit_analyst`
- `climate_analyst`
- `city_admin`
