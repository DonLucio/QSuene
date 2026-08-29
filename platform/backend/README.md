# Backend de fiestas

FastAPI y Socket.IO gestionan salas, participantes, catálogo, cola, reproducción,
deseos, límites y presencia del DJ. PostgreSQL conserva los agregados de sala y
Redis coordina Socket.IO entre procesos.

## Pruebas

```powershell
python -m pip install -e ".[dev]"
python -m pytest -q
```

Las variables requeridas se documentan en `../../.env.example`. Producción se
niega a iniciar con la clave de desarrollo o sin PostgreSQL y Redis.

## Operación

- `GET /api/v1/health` informa el estado del servicio y sus dependencias.
- PostgreSQL es la fuente persistente de salas, participantes, cola y deseos.
- Redis coordina presencia y eventos Socket.IO entre procesos.
- Apache debe ser el único punto público de entrada en producción.
