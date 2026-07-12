# AI Agents API

Node.js + Express.js REST API with MongoDB (Mongoose), JWT auth, migrations and seeders.

## Stack

- **Express.js** — HTTP framework
- **Mongoose** — MongoDB ODM
- **JWT** (`jsonwebtoken`) — authentication
- **bcryptjs** — password hashing
- **migrate-mongo** — database migrations
- **helmet, cors, morgan** — security & logging

## Project Structure

```
ai-agents-api/
├── migrations/               # migrate-mongo migration files
├── seeders/                  # database seeders (index.js runner + *.seeder.js)
├── migrate-mongo-config.js   # migration config (reads MONGO_URI from .env)
├── src/
│   ├── config/               # env config + db connection
│   ├── models/               # Mongoose models (User)
│   ├── controllers/          # route handlers (authController)
│   ├── routes/               # Express routers (index, authRoutes)
│   ├── middlewares/          # auth (protect/authorize), error handling
│   ├── helpers/              # response, jwt, asyncHandler
│   ├── app.js                # Express app wiring
│   └── server.js             # entrypoint (connects DB + starts server)
├── .env                      # local secrets (gitignored)
└── .env.example
```

## Setup

```bash
npm install
cp .env.example .env   # then fill in MONGO_URI and JWT_SECRET
```

## Scripts

```bash
npm run dev            # start with nodemon (hot reload)
npm start              # start server
npm run migrate:up     # apply migrations
npm run migrate:down   # roll back last migration
npm run migrate:status # migration status
npm run seed           # seed the database
```

## Database

Run migrations then seed:

```bash
npm run migrate:up
npm run seed
```

Seeded accounts (password: `password123`):

| Email               | Role  |
| ------------------- | ----- |
| admin@example.com   | admin |
| user@example.com    | user  |

## API Endpoints

Base URL: `http://localhost:5000`

| Method | Path                | Access  | Description               |
| ------ | ------------------- | ------- | ------------------------- |
| GET    | `/api/health`       | Public  | Health check              |
| POST   | `/api/auth/register`| Public  | Register a new user       |
| POST   | `/api/auth/login`   | Public  | Login, returns JWT        |
| GET    | `/api/auth/me`      | Private | Current user (Bearer JWT) |

### Example

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'

# Authenticated request
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <TOKEN>"
```

## Response Format

```json
{ "success": true, "message": "…", "data": { … } }
{ "success": false, "message": "…", "errors": null }
```
