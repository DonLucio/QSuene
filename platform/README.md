# Plataforma de fiestas Q'Suene

Servicio en línea independiente de la DJ App.

## Componentes

- `backend`: API y Socket.IO con persistencia PostgreSQL y coordinación Redis.
- `guest-web`: landing y experiencia móvil del invitado.
- `contracts`: catálogo versionado de eventos.
- `deploy`: configuración de Apache y operación.

## Desarrollo

Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
.venv\Scripts\python.exe -m uvicorn party_server.main:application --reload --port 8000
```

WebGuest:

```powershell
cd guest-web
npm ci
npm run dev
```

## Producción

Desde la raíz del repositorio:

```bash
cp .env.example .env
docker compose up -d --build
```

En producción Apache es la única entrada pública. Los puertos 8000 y 8080 se
publican únicamente sobre `127.0.0.1`; PostgreSQL y Redis no se exponen.
