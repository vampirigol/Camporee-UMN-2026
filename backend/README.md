# Backend Registro Médico Camporee UMN 2026

## Requisitos
- Node.js 18+

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
- SQLite en `camporee.db`.
- Esquema en `models/schema.sql`; se aplica automáticamente al iniciar.
