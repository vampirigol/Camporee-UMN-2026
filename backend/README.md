# Backend Registro Médico Camporee UMN 2026

## Requisitos
- Node.js 18+
- Base de datos PostgreSQL (Railway o local)

## Configuración de entorno
Usa `DATABASE_URL` (Railway la provee) o variables `PG*`:
```
PORT=3000
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=camporee
PGSSLMODE=disable
# o bien:
# DATABASE_URL=postgresql://usuario:pass@host:5432/base?sslmode=require
```

## Instalación
```bash
npm install
```

## Uso
```bash
npm start
# Servirá API y archivos estáticos del frontend en http://localhost:3000
```

## Endpoints
- `GET /health` — ping.
- `POST /api/registros` — crea un registro médico.
- `GET /api/registros` — lista los últimos 200 registros.

## Base de datos
- PostgreSQL (usa `models/schema.sql`); el esquema se aplica automáticamente al iniciar.
