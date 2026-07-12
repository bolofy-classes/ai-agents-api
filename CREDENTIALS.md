# Seeded User Credentials

These accounts are created by the database seeder (`npm run seed`).
For **local development / testing only** — do not use in production.

| Name       | Email               | Password      | Role  |
| ---------- | ------------------- | ------------- | ----- |
| Admin User | admin@example.com   | password123   | admin |
| Demo User  | user@example.com    | password123   | user  |

## Quick login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
```

The response includes a JWT `token` — pass it as `Authorization: Bearer <token>`
for protected routes such as `GET /api/auth/me`.
