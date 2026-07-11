"""
Suite de pruebas de API para Bustoke.

Cubre los endpoints del backend FastAPI bajo el prefijo `/v1/*`:
  - Health checks
  - Autenticación (register, login, refresh, me)
  - Búsqueda y consulta de viajes
  - Bloqueo y liberación de asientos
  - Ciclo de vida completo de reclamos (CRUD-style)
  - Bookings (checkout atómico + idempotencia de pagos)
  - Job de limpieza de holds expirados
  - Security headers y validación de entropía de SECRET_KEY

Todas las pruebas se ejecutan contra la base de datos PostgreSQL
local `bustoke_test` (cargada con `bustoke_bd.sql`). El fixture
`db_session` ejecuta `TRUNCATE TABLE ... RESTART IDENTITY CASCADE`
al inicio de cada test para garantizar idempotencia, y comparte la
misma conexión SQLAlchemy con el código de la app para evitar
problemas de visibilidad cross-connection.

Prerrequisito: tener PostgreSQL local con la BD `bustoke_test`
cargada con el esquema. Ver `TESTING.md` para más detalles.
"""

__all__: list[str] = []
