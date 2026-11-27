# Appresso con Docker

## Requisitos
- Docker Desktop (Compose v2.24+)

## Levantar todo (modo producción)
```bash
cp .env.example .env        # opcional: ajustar DB_PASSWORD y HMAC_SECRET
docker compose up -d --build
```

| Servicio   | URL                          | Descripción                                  |
|------------|------------------------------|----------------------------------------------|
| frontend   | http://localhost:8080        | React compilado servido por nginx            |
| api        | http://localhost:3001        | Express (también vía http://localhost:8080/api) |
| db         | `localhost:5433`             | PostgreSQL 16 (usuario/clave de `.env`)       |

Healthcheck de la API: `curl http://localhost:3001/health`

> Dentro de Docker `DB_HOST` se fuerza a `db` y `DB_PORT` a `5432`; tu `.env` local
> (con `DB_HOST=localhost`) sigue sirviendo para `npm run dev` sin Docker.
> Los puertos del host se cambian con `FRONTEND_HOST_PORT`, `API_HOST_PORT`, `DB_HOST_PORT`.

## Modo desarrollo (hot-reload)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```
- API con `node --watch` montando `./src` → http://localhost:3001
- Vite dev server → http://localhost:5173

## Comandos útiles
```bash
docker compose ps                         # estado y salud de los servicios
docker compose logs -f api                # logs del backend
docker compose exec api npm run load:batch   # scripts de carga
docker compose exec api npm run db:reset-fraud
docker compose exec db psql -U postgres -d appresso
docker compose down                       # detener (conserva datos)
docker compose down -v                    # detener y BORRAR datos, modelos IA y logs
```

Pruebas unitarias dentro del contenedor (modo dev, que monta `./tests`):
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npm test
```

## Persistencia (volúmenes)
- `pgdata`: datos de PostgreSQL. El script `scripts/database/schema_completo_appresso.sql`
  se ejecuta solo la primera vez (volumen vacío); luego las migraciones de la app lo mantienen.
- `ai_models`: modelos TensorFlow.js reentrenados (`/ai/train`).
- `api_logs`: logs rotados de Winston.
