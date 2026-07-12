-- ============================================================================
-- Seed E2E para BUSTOKE — versión SQL puro.
--
-- Este archivo reemplaza al script Python `seed_e2e.py` para entornos
-- donde `psycopg2-binary 2.9.x + libpq 18.3.0 + Windows` tienen un bug
-- de encoding que rompe la conexión antes de poder ejecutarse.
--
-- INSTRUCCIONES (en pgAdmin 4):
--   1. Click en la BD `bustoke_test` (en el árbol izquierdo).
--   2. Menú Tools → Query Tool.
--   3. File → Open → seleccionar este archivo.
--   4. Click en el botón Execute (▶️) o F5.
--   5. Esperar ~5s. Verás "TRUNCATE" + 12 INSERTs + 11 SELECT setval.
--
-- EQUIVALENTE 1-A-1 al script Python `seed_e2e.py`.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. LIMPIEZA: TRUNCATE en cascada de todas las tablas operativas.
-- ============================================================================
TRUNCATE
    bloqueos_temporales, boletos, pagos, reembolsos,
    mensajes_reclamo, reclamos, manifiestos_sutran,
    audit_logs, historial_estados_viaje, viajes,
    tarifas_ruta, rutas, asientos, buses,
    choferes, agencias_terminales, agencias, terminales,
    distritos, provincias, departamentos,
    pasajeros, usuarios, tipos_documento,
    liquidaciones_agencia, suscripciones, planes,
    configuracion_comisiones, api_keys, tickets_soporte
RESTART IDENTITY CASCADE;

-- ============================================================================
-- 2. CATÁLOGO + GEOGRAFÍA + AGENCIA + BUS + ASIENTOS + VIAJE.
-- IDs fijos (1, 2, 3...) para que los tests E2E de Cypress
-- matcheen los selectores.
-- ============================================================================

-- Catálogo de documentos
INSERT INTO tipos_documento (id_tipo_documento, nombre, longitud_exacta) VALUES
    (1, 'DNI',        8),
    (2, 'Pasaporte',  NULL),
    (3, 'C.E.',       9);

-- Geografía
INSERT INTO departamentos (id_departamento, nombre) VALUES
    (1, 'Lima'),
    (2, 'La Libertad');

INSERT INTO provincias (id_provincia, id_departamento, nombre) VALUES
    (1, 1, 'Lima'),
    (2, 2, 'Trujillo');

INSERT INTO distritos (id_distrito, id_provincia, nombre) VALUES
    (1, 1, 'San Borja'),
    (2, 2, 'Trujillo');

-- Agencia
INSERT INTO agencias (id_agencia, ruc, razon_social, estado) VALUES
    (1, '20100234561', 'CRUZ DEL SUR S.A.C.', 'activa');

-- Terminales (el frontend resuelve "Lima" → id 2, "Trujillo" → id 4)
INSERT INTO terminales (id_terminal, id_distrito, nombre, direccion) VALUES
    (2, 1, 'Terminal Javier Prado - Cruz del Sur', 'Av. Javier Prado Este 1109, San Borja - Lima'),
    (4, 2, 'Terminal Terrestre de Trujillo',       'Panamericana Norte Km 558, Trujillo');

-- Ruta Lima (Javier Prado, id 2) → Trujillo (id 4)
INSERT INTO rutas (id_ruta, id_agencia, id_terminal_origen, id_terminal_destino, tarifa_base) VALUES
    (1, 1, 2, 4, 70.00);

-- Tarifas por tipo de servicio
INSERT INTO tarifas_ruta (id_tarifa, id_ruta, tipo_servicio, precio) VALUES
    (1, 1, 'normal',  75.00),
    (2, 1, 'vip',    110.00);

-- Bus con 5 asientos
INSERT INTO buses (id_bus, id_agencia, placa, cantidad_pisos) VALUES
    (1, 1, 'ABC-123', 1);

-- Asientos (formato 'X1-1' requerido por chk_formato_asiento)
INSERT INTO asientos
    (id_asiento, id_bus, numero_asiento, fila, piso, tipo_servicio, coord_x, coord_y, bloqueado_manual) VALUES
    (1, 1, 'A1-1', 'A', 1, 'normal',  20,  30, FALSE),
    (2, 1, 'B1-1', 'B', 1, 'normal',  40,  30, FALSE),
    (3, 1, 'C1-1', 'C', 1, 'normal',  60,  30, FALSE),
    (4, 1, 'D1-1', 'D', 1, 'normal',  80,  30, FALSE),
    (5, 1, 'E1-1', 'E', 1, 'normal', 100,  30, FALSE);

-- Viaje #1 para MAÑANA a las 08:00 (necesario para seat selection)
INSERT INTO viajes
    (id_viaje, id_ruta, id_bus, fecha_hora_salida, fecha_hora_llegada, estado, rampa_embarque) VALUES
    (
        1, 1, 1,
        (CURRENT_DATE + INTERVAL '1 day' + TIME '08:00:00'),
        (CURRENT_DATE + INTERVAL '1 day' + TIME '16:00:00'),
        'programado',
        'Rampa 3'
    );

-- ============================================================================
-- 3. RESETEAR SECUENCIAS para que futuros INSERTs sin ID explícito
-- no colisionen con los IDs fijos que acabamos de insertar.
-- ============================================================================
SELECT setval(pg_get_serial_sequence('tipos_documento',         'id_tipo_documento'), 4);
SELECT setval(pg_get_serial_sequence('departamentos',           'id_departamento'),   3);
SELECT setval(pg_get_serial_sequence('provincias',              'id_provincia'),      3);
SELECT setval(pg_get_serial_sequence('distritos',               'id_distrito'),       3);
SELECT setval(pg_get_serial_sequence('agencias',                'id_agencia'),        2);
SELECT setval(pg_get_serial_sequence('terminales',              'id_terminal'),       5);
SELECT setval(pg_get_serial_sequence('rutas',                   'id_ruta'),           2);
SELECT setval(pg_get_serial_sequence('tarifas_ruta',            'id_tarifa'),         3);
SELECT setval(pg_get_serial_sequence('buses',                   'id_bus'),            2);
SELECT setval(pg_get_serial_sequence('asientos',                'id_asiento'),        6);
SELECT setval(pg_get_serial_sequence('viajes',                  'id_viaje'),          2);

COMMIT;
