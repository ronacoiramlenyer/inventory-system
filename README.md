# Laboratory Inventory Management System

A web application for tracking supplies and equipment across school
laboratories (Science, Computer, etc.), including a printable **Stock Card**
report per item.

## Features

- Manage laboratories (department, name, location)
- Manage items per laboratory (unit of measure, category, reorder level)
- Record stock movements (IN / OUT) with date, remarks, expiry date, invoice
  number, and handled-by signature
- Auto-computed running balances (beginning balance / ending balance)
- Stock Card view per item, matching the traditional paper stock card layout,
  with a printable view (`window.print()`) and optional period-divider rows
  (e.g. "Year-end inventory")
- Dashboard with totals, low-stock alerts, and recent transactions
- Simple username/password authentication (JWT)

## Project structure

```
server/   Express + SQLite (better-sqlite3) REST API
client/   React (Vite) frontend
```

## Getting started

Requires **Node.js 22.5+** (the backend uses Node's built-in `node:sqlite`
module, so no native/C++ build tools are needed — this avoids the
`node-gyp`/Visual Studio build errors that native SQLite packages like
`better-sqlite3` cause on Windows).

### 1. Backend

```bash
cd server
npm install
npm run dev        # http://localhost:4000
```

A SQLite database is created automatically at `server/data/inventory.db` on
first run, seeded with:

- Admin login: `admin` / `admin123`
- Sample laboratories: Science Laboratory, Computer Laboratory
- A few sample items

Copy `.env.example` to `.env` to customize `PORT` / `JWT_SECRET`.

### 2. Frontend

```bash
cd client
npm install
npm run dev         # http://localhost:5173
```

The Vite dev server proxies `/api` requests to `http://localhost:4000`.

## Data model

- **Laboratory** — a lab/department (e.g. "Science Laboratory")
- **Item** — a tracked item belonging to a laboratory, with an
  `initial_balance` and `reorder_level`
- **Transaction** — a stock card entry: a date, `in_qty`/`out_qty`, remarks,
  optional expiry date/invoice number, and who handled it. The running
  balance shown on the Stock Card is computed from the item's initial
  balance plus all prior transactions.
