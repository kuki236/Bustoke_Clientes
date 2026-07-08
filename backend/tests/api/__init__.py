"""
Suite de pruebas de API para Bustoke.

Cubre los endpoints del backend FastAPI bajo el prefijo `/v1/*`:
  - Health checks
  - Autenticación (register, login, refresh, me)
  - Búsqueda y consulta de viajes
  - Bloqueo y liberación de asientos
  - Ciclo de vida completo de reclamos (CRUD-style)

Todas las pruebas se ejecutan contra SQLite in-memory con un motor
SQLAlchemy fresco por sesión, gracias a la fixture `client` definida
en `conftest.py`. No requieren PostgreSQL ni conexión a internet.
"""
