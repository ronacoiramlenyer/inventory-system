# Laboratory Inventory Management System

A web application for tracking supplies and equipment across school
laboratories (Science, Computer, etc.), including a printable **Stock Card**
report per item.

## Features

- Multiple **departments** (Science, Computer, etc.), each with its own
  **staff accounts** and its own **laboratories**
- **Staff enroll laboratories** for their department; an **admin reviews and
  approves or rejects** each request before it becomes active
- Department-scoped access: staff only ever see and manage their own
  department's laboratories and items; admins see and manage everything
- Manage items per laboratory (unit of measure, category, reorder level)
- Record stock movements (IN / OUT) with date, remarks, expiry date, invoice
  number, and handled-by signature
- Auto-computed running balances (beginning balance / ending balance)
- Stock Card view per item, matching the traditional paper stock card layout,
  with a printable view (`window.print()`) and optional period-divider rows
  (e.g. "Year-end inventory")
- Dashboard with totals, low-stock alerts, recent transactions, and (for
  admins) a pending-laboratory-approvals count
- Username/password authentication (JWT) with `admin` / `staff` roles

## Roles

- **Admin** — manages departments and staff accounts, approves/rejects
  laboratory enrollment requests, and has unrestricted access to every
  department's laboratories, items, and stock cards.
- **Staff** — belongs to exactly one department (assigned by an admin when
  their account is created). Can enroll new laboratories for that
  department (pending admin approval), and manage items/stock cards only
  within their own department's approved laboratories.

There is currently no self-service sign-up: an admin creates staff accounts
from the **Staff Accounts** page and assigns each one to a department.

## Project structure

```
server/   Express + SQLite (node:sqlite) REST API — for local dev
worker/   Cloudflare Worker (Hono + D1) — same API, for a real cloud deploy
client/   React (Vite) frontend — works against either backend
```

`server/` and `worker/` are two backends for the same app: identical routes
and behavior, different runtimes. Use `server/` for local development (zero
cloud setup). Use `worker/` when you want the app actually live on the
internet — see [`worker/README.md`](./worker/README.md) for deploying it to
Cloudflare (Workers + D1 for the API, Pages for the frontend). A D1 database
has already been provisioned and seeded for this project.

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
- Two departments (Science, Computer), each with one approved laboratory
  and a few sample items
- One staff login per department: `science_staff` / `staff123` and
  `computer_staff` / `staff123`

If you already had a database from before this multi-department update,
delete `server/data/` and restart the backend so it reseeds with the new
schema.

Copy `.env.example` to `.env` to customize `PORT` / `JWT_SECRET`.

### 2. Frontend

```bash
cd client
npm install
npm run dev         # http://localhost:5173
```

The Vite dev server proxies `/api` requests to `http://localhost:4000`.

## Data model

- **Department** — e.g. "Science", "Computer"
- **User** — an admin (no department) or staff member (belongs to one
  department)
- **Laboratory** — belongs to a department; has a `status` of `pending`,
  `approved`, or `rejected`, plus `requested_by`/`reviewed_by` fields
- **Item** — a tracked item belonging to an approved laboratory, with an
  `initial_balance` and `reorder_level`
- **Transaction** — a stock card entry: a date, `in_qty`/`out_qty`, remarks,
  optional expiry date/invoice number, and who handled it. The running
  balance shown on the Stock Card is computed from the item's initial
  balance plus all prior transactions.
