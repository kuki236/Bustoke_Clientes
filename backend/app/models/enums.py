"""
Enumeraciones de PostgreSQL para los modelos ORM.

Estos enums reflejan EXACTAMENTE los tipos ENUM definidos en
`scripts/database.sql`. Se usa `create_type=False` para indicar a
SQLAlchemy que NO intente crearlos (ya existen en la base de datos).
"""

import sqlalchemy as sa


# ============================================================================
# USUARIOS Y AUTENTICACIÓN
# ============================================================================

rol_usuario_enum = sa.Enum(
    "cliente",
    "admin_agencia",
    "superadmin",
    name="rol_usuario",
    create_type=False,
    native_enum=True,
)


# ============================================================================
# AGENCIAS Y OPERACIONES
# ============================================================================

estado_agencia_enum = sa.Enum(
    "activa",
    "suspendida",
    name="estado_agencia",
    create_type=False,
    native_enum=True,
)


# ============================================================================
# SERVICIO / ASIENTOS
# ============================================================================

tipo_servicio_enum = sa.Enum(
    "vip",
    "normal",
    name="tipo_servicio",
    create_type=False,
    native_enum=True,
)


# ============================================================================
# VIAJES
# ============================================================================

estado_viaje_enum = sa.Enum(
    "programado",
    "en_curso",
    "finalizado",
    "cancelado",
    name="estado_viaje",
    create_type=False,
    native_enum=True,
)


# ============================================================================
# VENTAS (BOLETOS, PAGOS, REEMBOLSOS)
# ============================================================================

estado_boleto_enum = sa.Enum(
    "activo",
    "cancelado",
    name="estado_boleto",
    create_type=False,
    native_enum=True,
)

metodo_pago_enum = sa.Enum(
    "yape",
    "plin",
    "tarjeta",
    name="metodo_pago",
    create_type=False,
    native_enum=True,
)

estado_pago_enum = sa.Enum(
    "pendiente",
    "completado",
    "fallido",
    "reembolsado",
    name="estado_pago",
    create_type=False,
    native_enum=True,
)

canal_venta_enum = sa.Enum(
    "app_bustoke",
    "ventanilla_fisica",
    name="canal_venta",
    create_type=False,
    native_enum=True,
)


# ============================================================================
# SOPORTE Y RECLAMOS
# ============================================================================

estado_reclamo_enum = sa.Enum(
    "abierto",
    "en_proceso",
    "resuelto",
    name="estado_reclamo",
    create_type=False,
    native_enum=True,
)

estado_ticket_enum = sa.Enum(
    "abierto",
    "en_revision",
    "resuelto",
    name="estado_ticket",
    create_type=False,
    native_enum=True,
)


# ============================================================================
# BLOQUEOS TEMPORALES
# ============================================================================

estado_bloqueo_temporal_enum = sa.Enum(
    "activo",
    "expirado",
    "convertido",
    name="estado_bloqueo_temporal",
    create_type=False,
    native_enum=True,
)
