# Ecommerce Analytics (Flask + CSV + Next.js)

Commerce analytics starter that runs on flat files and surfaces KPIs, dashboards, and customer/product insights without a database.

## Project objective

Establish a production‑ready, business‑focused ecommerce analytics foundation that consolidates transactional and customer/product datasets into a unified model, delivering reliable operational KPIs and actionable segmentation insights for leadership, marketing, and product teams. The objective is to enable rapid decision‑making with minimal infrastructure overhead by providing a lightweight, CSV‑backed platform that supports real‑time behavioral tracking, demographic and loyalty segmentation, product performance analysis, and exportable reporting—while remaining easy to deploy, maintain, and extend.

## What this project does

It provides:

- A Flask API that reads/writes CSV data and exposes KPI endpoints
- A Next.js storefront with an admin analytics dashboard
- Event tracking and behavioral analytics
- Customer + product segmentation insights (age, gender, country, state, city, loyalty tier, label, RFM bands)
- Exported insight CSVs for offline analysis
- Optional PostgreSQL database support for enhanced performance
- Optional Ollama chatbot integration for richer responses

## Architecture at a glance

- `data/` is the transactional source of truth used by the app and dashboards
- Root-level datasets (`customers.csv`, `products.csv`, `Eventss.xlsx`, `Constructed  Customer Dataset.csv`) power segmentation insights
- `exports/` stores aggregate and insight exports for reporting
- Optional PostgreSQL database for enhanced data operations (configured via `POSTGRES_DSN`)

## Quick start (Docker)

1) Copy env

```bash
copy .env.example .env
```

2) Start API + dashboard

```bash
docker compose up --build
```

3) Initialize CSV data files (first run)

```bash
docker compose exec api python -m scripts.init_db
```

4) Seed demo products

```bash
docker compose exec api python -m scripts.seed_products
```

## Setup Verification

After starting the services, run the setup check script:

```bash
./SETUP_CHECK.sh
```

This will verify that both backend and frontend are running and provide instructions for creating an admin account.

## Chatbot Setup (Optional)

For enhanced AI chatbot responses:

```bash
./setup-chatbot.sh
```

This script helps set up Ollama with the Mistral model for local AI-powered chatbot responses.

Open:

- Admin dashboard: `http://localhost:3000/admin`
- Analytics dashboard: `http://localhost:3000/analytics`
- API health: `http://localhost:8000/api/health`
- Setup verification: `./SETUP_CHECK.sh`

## Data model and files

### Transactional data (`data/`)

These files are read and written by the app:

- `data/users.csv`
- `data/orders.csv`
- `data/order_items.csv`
- `data/products.csv`
- `data/web_events.csv`

### Analytical datasets (repo root)

These files are used for customer/product segmentation insights:

- `customers.csv`
- `products.csv`
- `Eventss.xlsx`
- `Constructed  Customer Dataset.csv`

All four now share `customer_id`, enabling a unified analytics model.

## Core API endpoints

- `POST /api/events` append a web event to `data/web_events.csv`
- `GET /api/kpis/overview` sales + web KPIs
- `GET /api/kpis/top-products` top products by likes
- `GET /api/kpis/interaction-cube` product views/likes/purchases
- `GET /api/kpis/site-analytics` website engagement metrics
- `GET /api/kpis/customer-product-insights` demographic and segment insights

## Admin analytics features

The analytics dashboard shows:

- Sales and web KPIs (24h)
- Top products by likes
- Interaction leaderboard
- Frequent pages, products, categories
- Customer behavior and repeat purchases
- Segment tables for age, gender, location, loyalty tier, label
- Charts: age x category heatmap and stacked category mix by gender/loyalty tier

## Insight exports

Generated insight files live in `exports/insights/`, including:

- Unified dataset: `unified_customer_product_events.csv`
- Summary report: `unified_insight_summary.md`
- Segment tables such as:
  - `unified_category_by_age_group.csv`
  - `unified_category_by_gender.csv`
  - `unified_category_by_country.csv`
  - `unified_category_by_state.csv`
  - `unified_category_by_city.csv`
  - `unified_category_by_loyalty_tier.csv`
  - `unified_category_by_label.csv`
  - `unified_category_by_recency_band.csv`
  - `unified_category_by_monetary_band.csv`
  - `unified_category_by_frequency_band.csv`

## Ollama chatbot (optional)

The chatbot integration is primarily rule-based. When Ollama is unavailable, the chatbot gracefully falls back to the built-in simple rule-based responder.

If you want richer chatbot responses:

1) Install Ollama on your host machine from `https://ollama.com`.
2) Start it with `ollama serve`.
3) Pull the Mistral model with `ollama pull mistral`.

The Flask API automatically detects Ollama at `http://localhost:11434`. No additional environment variables are required.

## Local development (non-Docker)

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python run.py
```

Frontend:

```bash
cd storefront
npm install
npm run dev
```

## Configuration

Environment variables are loaded from `.env`:

- `DATA_DIR` path to `data/` folder
- `EXPORT_DIR` path to `exports/`
- `PORT` Flask port
- `FRONTEND_ORIGIN` CORS origin for the API
- `DASH_REFRESH_SECONDS` refresh interval for dashboards

## Project layout

- `backend/app/` Flask API, CSV store, KPI logic
- `backend/scripts/` CSV init + seed scripts
- `storefront/` Next.js storefront + admin analytics
- `data/` transactional CSVs
- `exports/` aggregated insights

## Recent Changes

### April 19, 2026
- **Bug Fix**: Fixed TypeError in admin dashboard when customer product insights data is undefined
  - Updated `buildStackedBars`, `buildHeatmap`, and `buildCategorySlices` functions in `storefront/src/app/admin/page.tsx`
  - Added null/undefined checks to prevent crashes when API returns incomplete data
  - Updated TypeScript type signatures to allow undefined parameters for better error handling
