# Drinks Order App

One-night drink ordering app. In-memory, no DB.

## Run
```
npm install
ADMIN_PASSWORD=yourpassword node server.js
```
Optional: `PORT` (default 3000).

Drop your `logo.avif` into the `public/` folder.

## Endpoints
- `GET  /`              order form (name + drink)
- `POST /order`         saves valid order to memory
- `GET  /login`         admin login page
- `POST /login`         checks code vs ADMIN_PASSWORD, sets `token` cookie
- `GET  /orders`        TV view, auto-refreshes every 3s (admin)
- `GET  /manage`        same but click an order to delete (admin)
- `GET  /api/orders`    JSON feed used by the pages (admin)
- `POST /manage/delete` removes an order by id (admin)

## Notes
- One random admin token generated at startup; login with the password sets that token as a cookie.
- Name validation: 3–20 letters only. Drink must be one of the 4 options.
