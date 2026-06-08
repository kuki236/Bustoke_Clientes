-- =============================================================================
-- 1. CONFIGURACIÓN INICIAL Y PROTECCIÓN
-- =============================================================================

DROP DATABASE IF EXISTS bustoke_db;
CREATE DATABASE bustoke_db;

-- =============================================================================
-- 2. GESTIÓN DE EXTENSIONES Y ENUMS (Schema Public)
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE rol_usuario AS ENUM ('cliente', 'admin_agencia', 'superadmin');
CREATE TYPE estado_agencia AS ENUM ('activa', 'suspendida');
CREATE TYPE tipo_servicio AS ENUM ('vip', 'normal');
CREATE TYPE estado_viaje AS ENUM ('programado', 'en_curso', 'finalizado', 'cancelado');
CREATE TYPE estado_boleto AS ENUM ('activo', 'cancelado');
CREATE TYPE metodo_pago AS ENUM ('yape', 'plin', 'tarjeta');
CREATE TYPE estado_pago AS ENUM ('pendiente', 'completado', 'fallido', 'reembolsado');
CREATE TYPE canal_venta AS ENUM ('app_bustoke', 'ventanilla_fisica');
CREATE TYPE estado_reclamo AS ENUM ('abierto', 'en_proceso', 'resuelto');
CREATE TYPE estado_ticket AS ENUM ('abierto', 'en_revision', 'resuelto');
CREATE TYPE estado_bloqueo_temporal AS ENUM ('activo', 'expirado', 'convertido');

-- =============================================================================
-- 3. DEFINICIÓN DE LA ESTRUCTURA (DDL - CONSÓLIDADO Y LIMPIO)
-- =============================================================================

-- --- UBICACIÓN Y MAESTRAS ---

CREATE TABLE departamentos (
    id_departamento SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL
);

CREATE TABLE provincias (
    id_provincia SERIAL PRIMARY KEY,
    id_departamento INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    CONSTRAINT fk_provincias_departamento FOREIGN KEY (id_departamento) REFERENCES departamentos(id_departamento) ON DELETE RESTRICT
);

CREATE TABLE distritos (
    id_distrito SERIAL PRIMARY KEY,
    id_provincia INTEGER NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    CONSTRAINT fk_distritos_provincia FOREIGN KEY (id_provincia) REFERENCES provincias(id_provincia) ON DELETE RESTRICT
);

CREATE TABLE tipos_documento (
    id_tipo_documento SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    longitud_exacta INTEGER NULL
);

-- --- OPERACIONES B2B Y PLANES ---

CREATE TABLE planes (
    id_plan SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    limite_buses INTEGER NOT NULL
);

CREATE TABLE terminales (
    id_terminal SERIAL PRIMARY KEY,
    id_distrito INTEGER NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    CONSTRAINT fk_terminales_distrito FOREIGN KEY (id_distrito) REFERENCES distritos(id_distrito) ON DELETE RESTRICT
);

CREATE TABLE agencias (
    id_agencia SERIAL PRIMARY KEY,
    ruc VARCHAR(11) UNIQUE NOT NULL,
    razon_social VARCHAR(205) NOT NULL,
    estado estado_agencia NOT NULL DEFAULT 'activa',
    banco_nombre VARCHAR(100) NULL,    
    numero_cuenta VARCHAR(50) NULL,     
    cuenta_cci VARCHAR(50) NULL,       
    CONSTRAINT chk_ruc_longitud CHECK (length(ruc) = 11)
);

CREATE TABLE agencias_terminales (
    id_agencia_terminal SERIAL PRIMARY KEY,
    id_agencia INTEGER NOT NULL,
    id_terminal INTEGER NOT NULL,
    nro_counter_oficina VARCHAR(50) NOT NULL DEFAULT 'Por definir', 
    CONSTRAINT fk_agencias_term_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE CASCADE,
    CONSTRAINT fk_agencias_term_terminal FOREIGN KEY (id_terminal) REFERENCES terminales(id_terminal) ON DELETE CASCADE,
    CONSTRAINT uq_agencia_terminal UNIQUE (id_agencia, id_terminal)
);

CREATE TABLE buses (
    id_bus SERIAL PRIMARY KEY,
    id_agencia INTEGER NOT NULL,
    placa VARCHAR(10) UNIQUE NOT NULL,
    cantidad_pisos INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT fk_buses_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE RESTRICT,
    CONSTRAINT chk_pisos CHECK (cantidad_pisos IN (1, 2))
);

CREATE TABLE asientos (
    id_asiento SERIAL PRIMARY KEY,
    id_bus INTEGER NOT NULL,
    numero_asiento VARCHAR(10) NOT NULL, 
    fila VARCHAR(5) NOT NULL,            
    piso INTEGER NOT NULL DEFAULT 1,     
    tipo_servicio tipo_servicio NOT NULL DEFAULT 'normal',
    coord_x INTEGER NOT NULL,
    coord_y INTEGER NOT NULL,
    bloqueado_manual BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_asientos_bus FOREIGN KEY (id_bus) REFERENCES buses(id_bus) ON DELETE CASCADE,
    CONSTRAINT uq_bus_asiento UNIQUE (id_bus, numero_asiento),
    CONSTRAINT chk_formato_asiento CHECK (numero_asiento SIMILAR TO '[A-Z][0-9]-%')
);

CREATE TABLE rutas (
    id_ruta SERIAL PRIMARY KEY,
    id_agencia INTEGER NOT NULL,
    id_terminal_origen INTEGER NOT NULL,
    id_terminal_destino INTEGER NOT NULL,
    tarifa_base DECIMAL(10,2) NOT NULL, 
    CONSTRAINT fk_rutas_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE RESTRICT,
    CONSTRAINT fk_rutas_origen FOREIGN KEY (id_terminal_origen) REFERENCES terminales(id_terminal) ON DELETE RESTRICT,
    CONSTRAINT fk_rutas_destino FOREIGN KEY (id_terminal_destino) REFERENCES terminales(id_terminal) ON DELETE RESTRICT,
    CONSTRAINT chk_ruta_distinta CHECK (id_terminal_origen <> id_terminal_destino)
);

CREATE TABLE tarifas_ruta (
    id_tarifa SERIAL PRIMARY KEY,
    id_ruta INTEGER NOT NULL,
    tipo_servicio tipo_servicio NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    CONSTRAINT fk_tarifas_ruta FOREIGN KEY (id_ruta) REFERENCES rutas(id_ruta) ON DELETE CASCADE,
    CONSTRAINT uq_ruta_servicio UNIQUE (id_ruta, tipo_servicio)
);

CREATE TABLE viajes (
    id_viaje SERIAL PRIMARY KEY,
    id_ruta INTEGER NOT NULL,
    id_bus INTEGER NOT NULL,
    fecha_hora_salida TIMESTAMP NOT NULL,
    fecha_hora_llegada TIMESTAMP NOT NULL, 
    estado estado_viaje NOT NULL DEFAULT 'programado',
    rampa_embarque VARCHAR(50) NOT NULL DEFAULT 'Por asignar',
    CONSTRAINT fk_viajes_ruta FOREIGN KEY (id_ruta) REFERENCES rutas(id_ruta) ON DELETE RESTRICT,
    CONSTRAINT fk_viajes_bus FOREIGN KEY (id_bus) REFERENCES buses(id_bus) ON DELETE RESTRICT,
    CONSTRAINT chk_horarios CHECK (fecha_hora_llegada > fecha_hora_salida)
);

-- --- USUARIOS Y PASAJEROS ---

CREATE TABLE usuarios (
    id_usuario SERIAL PRIMARY KEY,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    telefono VARCHAR(20) NULL,
    rol rol_usuario NOT NULL DEFAULT 'cliente',
    id_agencia INTEGER NULL, 
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_usuarios_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE SET NULL
);

CREATE TABLE pasajeros (
    id_pasajero SERIAL PRIMARY KEY,
    id_usuario INTEGER NULL, 
    id_tipo_documento INTEGER NOT NULL,
    numero_documento VARCHAR(50) UNIQUE NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    CONSTRAINT fk_pasajeros_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    CONSTRAINT fk_pasajeros_doc FOREIGN KEY (id_tipo_documento) REFERENCES tipos_documento(id_tipo_documento) ON DELETE RESTRICT
);

-- --- VENTAS, CONTROLES Y BLOQUEOS ---

CREATE TABLE boletos (
    id_boleto SERIAL PRIMARY KEY,
    id_viaje INTEGER NOT NULL,
    id_usuario INTEGER NULL, 
    id_pasajero INTEGER NOT NULL, 
    id_asiento INTEGER NOT NULL,
    email_contacto VARCHAR(150) NOT NULL,
    canal canal_venta NOT NULL,
    codigo_qr VARCHAR(255) UNIQUE NOT NULL,
    usado BOOLEAN NOT NULL DEFAULT FALSE, 
    fecha_validacion TIMESTAMP NULL,      
    precio_final DECIMAL(10,2) NOT NULL,
    fecha_emision TIMESTAMP NOT NULL DEFAULT NOW(),
    estado estado_boleto NOT NULL DEFAULT 'activo',
    acepto_terminos_politicas BOOLEAN NOT NULL DEFAULT TRUE,
    ip_registro VARCHAR(45) NULL,
    CONSTRAINT fk_boletos_viaje FOREIGN KEY (id_viaje) REFERENCES viajes(id_viaje) ON DELETE RESTRICT,
    CONSTRAINT fk_boletos_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    CONSTRAINT fk_boletos_pasajero  FOREIGN KEY (id_pasajero) REFERENCES pasajeros(id_pasajero) ON DELETE RESTRICT,
    CONSTRAINT fk_boletos_asiento FOREIGN KEY (id_asiento) REFERENCES asientos(id_asiento) ON DELETE RESTRICT,
    CONSTRAINT uq_viaje_asiento UNIQUE (id_viaje, id_asiento)
);

CREATE TABLE bloqueos_temporales (
    id_bloqueo SERIAL PRIMARY KEY,
    id_viaje INTEGER NOT NULL,
    id_asiento INTEGER NOT NULL,
    id_usuario INTEGER NULL, 
    token_sesion VARCHAR(255) NOT NULL, 
    fecha_bloqueo TIMESTAMP NOT NULL DEFAULT NOW(),
    expira_at TIMESTAMP NOT NULL, 
    estado estado_bloqueo_temporal NOT NULL DEFAULT 'activo',
    CONSTRAINT fk_bloqueos_viaje FOREIGN KEY (id_viaje) REFERENCES viajes(id_viaje) ON DELETE CASCADE,
    CONSTRAINT fk_bloqueos_asiento FOREIGN KEY (id_asiento) REFERENCES asientos(id_asiento) ON DELETE CASCADE
);

CREATE TABLE pagos (
    id_pago SERIAL PRIMARY KEY,
    id_boleto INTEGER UNIQUE NOT NULL,
    metodo metodo_pago NOT NULL,
    monto_total DECIMAL(10,2) NOT NULL,
    referencia_transaccion VARCHAR(100) NOT NULL,
    estado estado_pago NOT NULL DEFAULT 'pendiente',
    CONSTRAINT fk_pagos_boleto FOREIGN KEY (id_boleto) REFERENCES boletos(id_boleto) ON DELETE RESTRICT
);

CREATE TABLE reembolsos (
    id_reembolso SERIAL PRIMARY KEY,
    id_pago INTEGER NOT NULL,
    id_usuario_responsable INTEGER NULL, 
    monto_reembolsado DECIMAL(10,2) NOT NULL,
    motivo TEXT NOT NULL,
    fecha_reembolso TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_reembolso_pago FOREIGN KEY (id_pago) REFERENCES pagos(id_pago) ON DELETE RESTRICT,
    CONSTRAINT fk_reembolso_usuario FOREIGN KEY (id_usuario_responsable) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

CREATE TABLE reclamos (
    id_reclamo SERIAL PRIMARY KEY,
    id_usuario INTEGER NOT NULL,
    id_agencia INTEGER NOT NULL,
    motivo VARCHAR(150) NOT NULL,
    detalle TEXT NOT NULL, 
    estado estado_reclamo NOT NULL DEFAULT 'abierto',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_reclamos_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    CONSTRAINT fk_reclamos_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE RESTRICT
);

CREATE TABLE mensajes_reclamo (
    id_mensaje SERIAL PRIMARY KEY,
    id_reclamo INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL, 
    text_mensaje TEXT NOT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_mensajes_reclamo FOREIGN KEY (id_reclamo) REFERENCES reclamos(id_reclamo) ON DELETE CASCADE,
    CONSTRAINT fk_mensajes_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT
);

-- --- PLATAFORMA ADMIN, FINANZAS Y REGULACIÓN ---

CREATE TABLE configuracion_comisiones (
    id_configuracion SERIAL PRIMARY KEY,
    id_agencia INTEGER NULL, 
    porcentaje_comision DECIMAL(5,2) NOT NULL DEFAULT 0.00, 
    monto_fijo_comision DECIMAL(10,2) NOT NULL DEFAULT 0.00, 
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_fin DATE NULL, 
    CONSTRAINT fk_comisiones_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE CASCADE
);

CREATE TABLE suscripciones (
    id_suscripcion SERIAL PRIMARY KEY,
    id_agencia INTEGER NOT NULL,
    id_plan INTEGER NOT NULL, 
    monto_mensual DECIMAL(10,2) NOT NULL,
    fecha_facturacion DATE NOT NULL,
    estado_cobro estado_pago NOT NULL DEFAULT 'pendiente',
    CONSTRAINT fk_suscripciones_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE RESTRICT,
    CONSTRAINT fk_suscripciones_plan FOREIGN KEY (id_plan) REFERENCES planes(id_plan) ON DELETE RESTRICT
);

CREATE TABLE liquidaciones_agencia (
    id_liquidacion_agencia SERIAL PRIMARY KEY,
    id_agencia INTEGER NOT NULL,
    periodo VARCHAR(7) NOT NULL, 
    monto_ventas DECIMAL(10,2) NOT NULL,
    comision_plataforma DECIMAL(10,2) NOT NULL, 
    monto_a_transferir DECIMAL(10,2) NOT NULL,
    estado_pago estado_pago NOT NULL DEFAULT 'pendiente',
    CONSTRAINT fk_liquidaciones_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE RESTRICT
);

CREATE TABLE api_keys (
    id_api_key SERIAL PRIMARY KEY,
    id_agencia INTEGER NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    fecha_expiracion TIMESTAMP NOT NULL, 
    ultimo_uso TIMESTAMP NULL,           
    estado BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_apikeys_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE CASCADE
);

CREATE TABLE tickets_soporte (
    id_ticket_soporte SERIAL PRIMARY KEY,
    id_agencia INTEGER NOT NULL,
    asunto VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    estado estado_ticket NOT NULL DEFAULT 'abierto',
    fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_tickets_agencia FOREIGN KEY (id_agencia) REFERENCES agencias(id_agencia) ON DELETE CASCADE
);

CREATE TABLE manifiestos_sutran (
    id_manifiesto SERIAL PRIMARY KEY,
    id_viaje INTEGER NOT NULL,
    fecha_generacion TIMESTAMP NOT NULL DEFAULT NOW(),
    estado_envio VARCHAR(30) NOT NULL, 
    respuesta_api TEXT NOT NULL,       
    CONSTRAINT fk_manifiesto_viaje FOREIGN KEY (id_viaje) REFERENCES viajes(id_viaje) ON DELETE RESTRICT
);

-- --- AUDITORÍA Y HISTORIALES ---

CREATE TABLE audit_logs (
    id_log SERIAL PRIMARY KEY,
    tabla_afectada VARCHAR(100) NOT NULL,
    accion VARCHAR(20) NOT NULL, 
    datos_anteriores JSONB NULL,
    datos_nuevos JSONB NULL,
    fecha TIMESTAMP NOT NULL DEFAULT NOW(),
    id_usuario_responsable INTEGER NULL
);

CREATE TABLE historial_estados_viaje (
    id_historial SERIAL PRIMARY KEY,
    id_viaje INTEGER NOT NULL,
    estado_anterior estado_viaje NOT NULL,
    estado_nuevo estado_viaje NOT NULL,
    motivo TEXT NOT NULL,
    id_usuario_responsable INTEGER NULL,
    fecha_cambio TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_historial_viaje FOREIGN KEY (id_viaje) REFERENCES viajes(id_viaje) ON DELETE CASCADE
);

-- =============================================================================
-- 4. ÍNDICES GENERALES Y RENDIMIENTO
-- =============================================================================
CREATE INDEX idx_rutas_origen_destino ON rutas(id_terminal_origen, id_terminal_destino);
CREATE INDEX idx_viajes_fecha_estado ON viajes(fecha_hora_salida, estado);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_mensajes_reclamo_padre ON mensajes_reclamo(id_reclamo);
CREATE INDEX idx_comisiones_vigencia ON configuracion_comisiones(id_agencia, fecha_inicio, fecha_fin);

-- =============================================================================
-- 5. ÍNDICES DE RESTRICCIÓN PARCIAL
-- =============================================================================
CREATE UNIQUE INDEX uq_bloqueo_activo_viaje 
ON bloqueos_temporales(id_viaje, id_asiento) 
WHERE estado = 'activo';
-- =============================================================================
-- BLOQUE 1: UBICACIÓN, MAESTRAS Y PLANES SAAS (SEED DATA DEFINITIVO)
-- =============================================================================

-- 1. Catálogo Ampliado de Departamentos (Hubs Interprovinciales)
INSERT INTO departamentos (id_departamento, nombre) VALUES 
(1, 'Lima'),
(2, 'La Libertad'),
(3, 'Arequipa'),
(4, 'Lambayeque'),
(5, 'Cusco'),
(6, 'Junín'),
(7, 'Piura'),
(8, 'Ancash'),
(9, 'Ica'),
(10, 'Puno');

-- 2. Provincias Estratégicas por Departamento
INSERT INTO provincias (id_provincia, id_departamento, nombre) VALUES 
(1, 1, 'Lima'),
(2, 2, 'Trujillo'),
(3, 3, 'Arequipa'),
(4, 4, 'Chiclayo'),
(5, 5, 'Cusco'),
(6, 6, 'Huancayo'),
(7, 7, 'Piura'),
(8, 8, 'Santa'),       -- Para Chimbote
(9, 9, 'Ica'),
(10, 10, 'San Román'); -- Para Juliaca (Gran hub comercial y de transporte)

-- 3. Distritos Clave con Alta Concentración de Terminales o Paraderos
INSERT INTO distritos (id_distrito, id_provincia, nombre) VALUES 
-- Distritos de Lima
(1, 1, 'La Victoria'),
(2, 1, 'Independencia'),
(3, 1, 'San Borja'),
(4, 1, 'Santiago de Surco'),
-- Distritos de Trujillo
(5, 2, 'Trujillo'),
(6, 2, 'Moche'),
-- Distritos de Arequipa
(7, 3, 'Jacobo Hunter'),
(8, 3, 'Cercado de Arequipa'),
-- Distritos de Chiclayo
(9, 4, 'Chiclayo'),
(10, 4, 'La Victoria (Chiclayo)'),
-- Distritos de Cusco
(11, 5, 'Santiago'),
(12, 5, 'Wanchaq'),
-- Distritos de Huancayo
(13, 6, 'Huancayo'),
(14, 6, 'El Tambo'),
-- Distritos de Piura
(15, 7, 'Piura'),
(16, 7, 'Castilla'),
-- Distritos de Santa (Ancash)
(17, 8, 'Chimbote'),
-- Distritos de Ica
(18, 9, 'Ica'),
-- Distritos de San Román (Puno)
(19, 10, 'Juliaca');

-- 4. Tipos de Documento Oficiales para Control de Manifiesto SUTRAN
INSERT INTO tipos_documento (id_tipo_documento, nombre, longitud_exacta) VALUES 
(1, 'DNI', 8),
(2, 'Pasaporte', NULL),
(3, 'Carnet de Extranjería', 9);

-- 5. Planes Comerciales SaaS según tus Nuevos Parámetros
INSERT INTO planes (id_plan, nombre, precio, limite_buses) VALUES 
(1, 'Plan Regular', 299.00, 50),
(2, 'Plan Business', 499.00, 999);
-- =============================================================================
-- BLOQUE 2: TERMINALES, AGENCIAS Y FLOTAS AUTOMATIZADAS (SEED DATA)
-- =============================================================================

-- 1. Inserción de Terminales Terrestres Principales en las Provincias Mapeadas
INSERT INTO terminales (id_terminal, id_distrito, nombre, direccion) VALUES 
(1, 2, 'Terminal Terrestre Plaza Norte', 'Av. Tomás Valle 1530, Independencia - Lima'),
(2, 3, 'Terminal Javier Prado - Cruz del Sur', 'Av. Javier Prado Este 1109, San Borja - Lima'),
(3, 1, 'Terminal Civa La Victoria', 'Av. Paseo de la República 569, La Victoria - Lima'),
(4, 5, 'Terminal Terrestre de Trujillo', 'Panamericana Norte Km. 558, Trujillo'),
(5, 7, 'Terrapuerto Arequipa', 'Av. Arturo Ibáñez s/n, Jacobo Hunter - Arequipa'),
(6, 9, 'Terminal Terrestre de Chiclayo', 'Av. Augusto B. Leguía 1910, Chiclayo'),
(7, 11, 'Terminal Terrestre de Cusco', 'Av. Valle Sagrado de los Incas, Santiago - Cusco'),
(8, 13, 'Terminal Terrestre de Huancayo', 'Av. Evitamiento s/n, El Tambo - Huancayo');

-- 2. Inserción de las 4 Agencias con sus RUCs y Datos Bancarios Oficiales (RF-25)
INSERT INTO agencias (id_agencia, ruc, razon_social, estado, banco_nombre, numero_cuenta, cuenta_cci) VALUES 
(1, '20100234561', 'PRESTACIONES DE SERVICIOS CRUZ DEL SUR S.A.C.', 'activa', 'Banco de Crédito del Perú', '191-2245678-0-12', '002-191-002245678012-54'),
(2, '20155432109', 'TRANSPORTES OLTURSA S.A.C.', 'activa', 'BBVA Continental', '0011-0123-45-01002345', '0011-123-0001002345-45'),
(3, '20100876543', 'TURISMO CIVA S.A.C.', 'activa', 'Interbank', '200-3001234567', '003-200-003001234567-22'),
(4, '20300456789', 'MOVIL BUS S.A.C.', 'activa', 'Banco de la Nación', '04-015-234561', '018-015-0004015234561-18');

-- 3. Vinculación de Agencias a los Terminales y Asignación de Counters Internos
INSERT INTO agencias_terminales (id_agencia_terminal, id_agencia, id_terminal, nro_counter_oficina) VALUES 
-- Cruz del Sur operando en sus hubs obligatorios
(1, 1, 1, 'Counter 15 - Zona Norte'),
(2, 1, 2, 'Counter Principal 01-10'),
(3, 1, 4, 'Counter 02 - Nivel 1'),
(4, 1, 5, 'Counter A-5 Terrapuerto'),
-- Oltursa
(5, 2, 1, 'Counter 18 - Zona Norte'),
(6, 2, 4, 'Counter 06 - Nivel 1'),
(7, 2, 5, 'Counter B-2 Terrapuerto'),
-- Civa
(8, 3, 1, 'Counter 05 - Zona Norte'),
(9, 3, 3, 'Counter Principal Ejecutivo'),
(10, 3, 6, 'Counter 03 - Chiclayo'),
(11, 3, 7, 'Counter 12 - Cusco'),
-- Movil Bus
(12, 4, 1, 'Counter 22 - Zona Norte'),
(13, 4, 8, 'Counter 01 - Huancayo');

-- 4. Activación de Contratos SaaS: Asignación del "Plan Regular" (ID: 1) a las 4 Agencias (RF-24)
-- Nota: Dejamos el "Plan Business" (ID: 2) libre en el catálogo, tal como lo solicitaste.
INSERT INTO suscripciones (id_suscripcion, id_agencia, id_plan, monto_mensual, fecha_facturacion, estado_cobro) VALUES 
(1, 1, 1, 299.00, '2026-06-01', 'completado'),
(2, 2, 1, 299.00, '2026-06-01', 'completado'),
(3, 3, 1, 299.00, '2026-06-01', 'completado'),
(4, 4, 1, 299.00, '2026-06-01', 'pendiente');

-- 5. Generación Masiva Automatizada de Flotas (10 Buses por Agencia) y sus Asientos Matriciales (A1-1, B3-2)
DO $$
DECLARE
    v_id_agencia INT;
    v_id_bus INT;
    v_bus_counter INT := 1;
    v_placa_text CHAR(3);
    v_placa_num INT := 100;
    
    -- Variables para la creación de la matriz de asientos
    v_fila CHAR(1);
    v_asiento_num INT;
    v_piso INT;
    v_servicio tipo_servicio;
    v_asiento_codigo VARCHAR(10);
    
    -- Coordenadas espaciales para la interfaz gráfica del bus (Fila x Columna)
    v_x INT;
    v_y INT;
BEGIN
    -- Recorremos cada una de las 4 agencias registradas
    FOR v_id_agencia IN 1..4 LOOP
        
        -- Reiniciamos el prefijo de las placas según la agencia para simular variedad
        IF v_id_agencia = 1 THEN v_placa_text := 'CGS';
        ELSIF v_id_agencia = 2 THEN v_placa_text := 'OLT';
        ELSIF v_id_agencia = 3 THEN v_placa_text := 'CIV';
        ELSE v_placa_text := 'MVB';
        END IF;

        -- Generamos exactamente 10 buses para la agencia actual (Total 40 buses en el sistema)
        FOR i IN 1..10 LOOP
            -- Determinamos los pisos: buses impares tendrán 2 pisos (Mixtos), pares 1 piso (Normal)
            INSERT INTO buses (id_agencia, placa, cantidad_pisos) 
            VALUES (
                v_id_agencia, 
                v_placa_text || '-' || v_placa_num, 
                CASE WHEN i % 2 = 0 THEN 1 ELSE 2 END
            ) RETURNING id_bus INTO v_id_bus;
            
            v_placa_num := v_placa_num + 1;

            -- =================================================================
            -- GENERACIÓN AUTOMÁTICA DEL MAPA DE ASIENTOS MATRICIAL DE CADA BUS
            -- =================================================================
            -- Recorremos los pisos del bus creado
            FOR v_piso IN 1..(SELECT cantidad_pisos FROM buses WHERE id_bus = v_id_bus) LOOP
                
                -- Definición del tipo de servicio: En buses de 2 pisos, el piso 1 es VIP y el piso 2 es Normal.
                IF v_piso = 1 AND (SELECT cantidad_pisos FROM buses WHERE id_bus = v_id_bus) = 2 THEN
                    v_servicio := 'vip';
                ELSE
                    v_servicio := 'normal';
                END IF;

                -- Construcción del croquis del bus: Filas de la A a la J (10 filas de profundidad)
                FOR f IN 1..10 LOOP
                    v_fila := CHR(64 + f); -- Mapea 1->A, 2->B, 3->C, etc.
                    
                    -- Columnas del Bus: Distribución estándar de 4 asientos por fila (1 y 2 izquierda, Pasadizo, 3 y 4 derecha)
                    FOR c IN 1..4 LOOP
                        v_asiento_num := c;
                        
                        -- Formato exacto exigido por tu UI e índice: 'A4-1' (Fila A, Asiento 4, Piso 1)
                        v_asiento_codigo := v_fila || v_asiento_num || '-' || v_piso;
                        
                        -- FIX EJE X: Eje porcentual balanceado (20% | 40% || PASADIZO || 65% | 85%)
                        IF c <= 2 THEN
                            v_x := c * 20;
                        ELSE
                            v_x := (c * 20) + 5; 
                        END IF;

                        -- FIX EJE Y: Mapeo de filas A-J dentro del lienzo porcentual estricto (10% a 91%)
                        v_y := 10 + ((f - 1) * 9); 

                        -- Inserción de la celda de asiento física
                        INSERT INTO asientos (id_bus, numero_asiento, fila, piso, tipo_servicio, coord_x, coord_y, bloqueado_manual)
                        VALUES (
                            v_id_bus,
                            v_asiento_codigo,
                            v_fila,
                            v_piso,
                            v_servicio,
                            v_x,
                            v_y,
                            FALSE
                        );
                    END LOOP;
                end LOOP;
            END LOOP;
            
        END LOOP;
    END LOOP;
END $$;
-- =============================================================================
-- BLOQUE 3: RUTAS, TARIFAS POR SERVICIO Y PROGRAMACIÓN DE VIAJES (SEED DATA)
-- =============================================================================

-- 1. Inserción de Rutas Troncales (Conexiones Interprovinciales)
-- Nota: Dejamos una tarifa_base de referencia general en 'rutas' por compatibilidad.
INSERT INTO rutas (id_ruta, id_agencia, id_terminal_origen, id_terminal_destino, tarifa_base) VALUES 
-- Cruz del Sur (id_agencia = 1)
(1, 1, 2, 4, 70.00),  -- Lima (Javier Prado) -> Trujillo
(2, 1, 4, 2, 70.00),  -- Trujillo -> Lima (Javier Prado)
(3, 1, 2, 5, 110.00), -- Lima (Javier Prado) -> Arequipa
(4, 1, 5, 2, 110.00), -- Arequipa -> Lima (Javier Prado)

-- Oltursa (id_agencia = 2)
(5, 2, 1, 4, 65.00),  -- Lima (Plaza Norte) -> Trujillo
(6, 2, 4, 1, 65.00),  -- Trujillo -> Lima (Plaza Norte)
(7, 2, 1, 5, 100.00), -- Lima (Plaza Norte) -> Arequipa

-- Civa (id_agencia = 3)
(8, 3, 3, 6, 60.00),  -- Lima (La Victoria) -> Chiclayo
(9, 3, 6, 3, 60.00),  -- Chiclayo -> Lima (La Victoria)
(10, 3, 3, 7, 120.00),-- Lima (La Victoria) -> Cusco
(11, 3, 7, 3, 120.00),-- Cusco -> Lima (La Victoria)

-- Movil Bus (id_agencia = 4)
(12, 4, 1, 8, 50.00),  -- Lima (Plaza Norte) -> Huancayo
(13, 4, 8, 1, 50.00);  -- Huancayo -> Lima (Plaza Norte)


-- 2. Configuración de Tarifas Segmentadas por Categoría (Normal / VIP) - Cumple RF-13
INSERT INTO tarifas_ruta (id_ruta, tipo_servicio, precio) VALUES 
-- Tarifas Cruz del Sur
(1, 'normal', 75.00),  (1, 'vip', 110.00),
(2, 'normal', 75.00),  (2, 'vip', 110.00),
(3, 'normal', 115.00), (3, 'vip', 150.00),
(4, 'normal', 115.00), (4, 'vip', 150.00),

-- Tarifas Oltursa
(5, 'normal', 70.00),  (5, 'vip', 105.00),
(6, 'normal', 70.00),  (6, 'vip', 105.00),
(7, 'normal', 105.00), (7, 'vip', 140.00),

-- Tarifas Civa
(8, 'normal', 65.00),  (8, 'vip', 95.00),
(9, 'normal', 65.00),  (9, 'vip', 95.00),
(10, 'normal', 125.00),(10, 'vip', 165.00),
(11, 'normal', 125.00),(11, 'vip', 165.00),

-- Tarifas Movil Bus (Servicios principalmente estándar en este tramo corto)
(12, 'normal', 55.00), (12, 'vip', 85.00),
(13, 'normal', 55.00), (13, 'vip', 85.00);


-- 3. Generación Masiva y Automatizada de Viajes (Mañana, Tarde, Noche en los próximos 5 días)
DO $$
DECLARE
    v_id_ruta INT;
    v_id_agencia INT;
    v_id_bus INT;
    v_fecha_base TIMESTAMP := '2026-06-08 00:00:00'; -- Simula salidas estables programadas a futuro
    v_salida TIMESTAMP;
    v_llegada TIMESTAMP;
    v_duracion_horas INT;
    v_rampa VARCHAR(50);
    v_viaje_counter INT := 1;
BEGIN
    -- Iteramos por cada una de las rutas comerciales configuradas
    FOR v_id_ruta IN SELECT id_ruta FROM rutas LOOP
        
        -- Extraemos la agencia dueña de la ruta para asignarle un bus de su propia flota
        SELECT id_agencia INTO v_id_agencia FROM rutas WHERE id_ruta = v_id_ruta;
        
        -- Definimos la duración estimada del viaje según la distancia típica del tramo peruano
        IF v_id_ruta IN (1, 2, 5, 6) THEN v_duracion_horas := 8;     -- Lima <-> Trujillo
        ELSIF v_id_ruta IN (3, 4, 7) THEN v_duracion_horas := 16;   -- Lima <-> Arequipa
        ELSIF v_id_ruta IN (8, 9) THEN v_duracion_horas := 12;      -- Lima <-> Chiclayo
        ELSIF v_id_ruta IN (10, 11) THEN v_duracion_horas := 20;    -- Lima <-> Cusco
        ELSE v_duracion_horas := 7;                                 -- Lima <-> Huancayo
        END IF;

        -- Programamos itinerarios diarios para los próximos 5 días consecutivos (Abundancia de opciones)
        FOR v_dia IN 0..4 LOOP
            
            -- Iteramos 3 turnos por día (Mañana, Tarde y Noche) para garantizar variedad horaria en la UI
            FOR v_turno IN 1..3 LOOP
                
                -- Ajustamos la hora exacta de salida dependiendo del turno del día
                IF v_turno = 1 THEN 
                    v_salida := v_fecha_base + (v_dia || ' days')::INTERVAL + '08:00:00'::INTERVAL; -- Turno Mañana (08:00 AM)
                    v_rampa := 'Andén Norte - Rampa ' || ((v_id_ruta % 4) + 1);
                ELSIF v_turno = 2 THEN 
                    v_salida := v_fecha_base + (v_dia || ' days')::INTERVAL + '14:30:00'::INTERVAL; -- Turno Tarde (02:30 PM)
                    v_rampa := 'Andén Central - Rampa ' || ((v_id_ruta % 3) + 5);
                ELSE 
                    v_salida := v_fecha_base + (v_dia || ' days')::INTERVAL + '21:45:00'::INTERVAL; -- Turno Noche (09:45 PM)
                    v_rampa := 'Zona de Embarque - Rampa ' || ((v_id_ruta % 5) + 10);
                END IF;

                -- Calculamos la hora estimada de llegada sumando las horas de tramo a la salida (Mejora 2)
                v_llegada := v_salida + (v_duracion_horas || ' hours')::INTERVAL;

                -- Seleccionamos un bus de la agencia de forma cíclica para que la flota rote y tenga uso equitativo
                SELECT id_bus INTO v_id_bus 
                FROM buses 
                WHERE id_agencia = v_id_agencia
                OFFSET ((v_dia + v_turno) % 10) LIMIT 1;

                -- Inserción del registro de salida en el itinerario maestro de Bustoke
                INSERT INTO viajes (id_viaje, id_ruta, id_bus, fecha_hora_salida, fecha_hora_llegada, estado, rampa_embarque)
                VALUES (
                    v_viaje_counter,
                    v_id_ruta,
                    v_id_bus,
                    v_salida,
                    v_llegada,
                    'programado',
                    v_rampa
                );

                v_viaje_counter := v_viaje_counter + 1;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- =============================================================================
-- BLOQUE 4: USUARIOS, PASAJEROS Y CHECKOUT MASIVO (SEED DATA DEFINITIVO)
-- =============================================================================

-- 1. Inserción de Cuentas de Usuario Base (Clientes y Operadores B2B)
INSERT INTO usuarios (id_usuario, email, password_hash, telefono, rol, id_agencia, activo) VALUES 
(1, 'admin.cruz@cruzdelsur.com.pe', '$2b$12$K7R...', '998765432', 'admin_agencia', 1, TRUE),
(2, 'admin.oltursa@oltursa.com.pe', '$2b$12$L8S...', '991234567', 'admin_agencia', 2, TRUE),
(3, 'admin.civa@civa.com.pe', '$2b$12$M9T...', '981112233', 'admin_agencia', 3, TRUE),
(4, 'admin.movil@movilbus.com.pe', '$2b$12$N0U...', '974556677', 'admin_agencia', 4, TRUE),
(5, 'sebastian.admin@bustoke.pe', '$2b$12$O1V...', '987654321', 'superadmin', NULL, TRUE);

-- Generación de 40 cuentas de clientes recurrentes para la simulación
DO $$
BEGIN
    FOR i IN 6..45 LOOP
        INSERT INTO usuarios (id_usuario, email, password_hash, telefono, rol, id_agencia, activo)
        VALUES (
            i, 
            'cliente.user' || i || '@gmail.com', 
            '$2b$12$P2W_mock_hash_secret', 
            '9' || CAST(FLOOR(RANDOM() * 90000000 + 10000000) AS INT), 
            'cliente', 
            NULL, 
            TRUE
        );
    END LOOP;
END $$;


-- 2. Registro Maestro de Pasajeros (DNI Peruanos y Pasaportes Extranjeros)
INSERT INTO pasajeros (id_pasajero, id_usuario, id_tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento) VALUES 
-- Pasajeros vinculados a su cuenta (Compradores frecuentes)
(1, 6, 1, '72145639', 'Carlos', 'Mendoza', 'Quispe', '1992-05-14'),
(2, 7, 1, '45896321', 'Ana', 'García', 'Flores', '1988-11-23'),
(3, 8, 3, 'CE9876543', 'John', 'Smith', 'Doe', '1995-02-10'), -- Extranjero con Carnet de Extranjería
(4, 9, 2, 'PAS887766', 'Marie', 'Dubois', 'Leroy', '1999-08-19'); -- Extranjera con Pasaporte

-- Generación masiva de 120 pasajeros independientes (para simular compras de familiares o invitados)
DO $$
DECLARE
    v_nombres TEXT[] := ARRAY['Juan', 'Luis', 'María', 'Pedro', 'Rosa', 'Jorge', 'Elena', 'Miguel', 'Sofia', 'David'];
    v_paternos TEXT[] := ARRAY['Cruz', 'Soto', 'Torres', 'Ramos', 'Reyes', 'Pérez', 'Castro', 'Chávez', 'Luna', 'Vargas'];
    v_maternos TEXT[] := ARRAY['Gómez', 'Quispe', 'Ramírez', 'Flores', 'Sánchez', 'Díaz', 'Espinoza', 'Rojas', 'Benitez', 'Campos'];
BEGIN
    FOR i IN 5..125 LOOP
        INSERT INTO pasajeros (id_pasajero, id_usuario, id_tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento)
        VALUES (
            i,
            CASE WHEN i % 3 = 0 THEN CAST(FLOOR(RANDOM() * 40 + 6) AS INT) ELSE NULL END, -- El 33% tiene cuenta, el resto son familiares o invitados
            1, -- DNI
            CAST(FLOOR(RANDOM() * 80000000 + 10000000) AS INT), -- DNI aleatorio de 8 dígitos
            v_nombres[CAST(FLOOR(RANDOM() * 10 + 1) AS INT)],
            v_paternos[CAST(FLOOR(RANDOM() * 10 + 1) AS INT)],
            v_maternos[CAST(FLOOR(RANDOM() * 10 + 1) AS INT)],
            CURRENT_DATE - (CAST(FLOOR(RANDOM() * 18000 + 6500) AS INT) || ' days')::INTERVAL -- Edades entre 18 y 65 años
        );
    END LOOP;
END $$;


-- 3. Transacción Masiva Automatizada de 100 Compras Reales distribuidas en el Territorio
DO $$
DECLARE
    v_id_boleto INT := 1;
    v_id_viaje INT;
    v_id_asiento INT;
    v_id_usuario INT;
    v_id_pasajero INT := 1;
    
    v_canal canal_venta;
    v_metodo metodo_pago;
    v_precio_final DECIMAL(10,2);
    v_servicio_asiento tipo_servicio;
    v_token_pago VARCHAR(100);
BEGIN
    -- Vamos a generar exactamente 100 transacciones exitosas repartidas entre los primeros 70 viajes
    FOR v_id_viaje IN 1..70 LOOP
        
        -- Detenemos el loop de forma contundente si alcanzamos la meta de 100 compras totales
        EXIT WHEN v_id_boleto > 100;

        -- Para cada viaje simularemos entre 1 y 2 asientos vendidos para mantener consistencia física
        FOR i IN 1..((v_id_viaje % 2) + 1) LOOP
            EXIT WHEN v_id_boleto > 100;

            -- Seleccionamos un asiento libre secuencial del bus asignado a ese viaje
            SELECT a.id_asiento, a.tipo_servicio INTO v_id_asiento, v_servicio_asiento
            FROM asientos a
            WHERE a.id_bus = (SELECT id_bus FROM viajes WHERE id_viaje = v_id_viaje)
              AND NOT EXISTS (SELECT 1 FROM boletos WHERE id_viaje = v_id_viaje AND id_asiento = a.id_asiento)
            LIMIT 1;

            -- Si el bus se quedó sin asientos disponibles saltamos al siguiente itinerario
            CONTINUE WHEN v_id_asiento IS NULL;

            -- Extraemos la tarifa exacta calculada en la tabla comercial segmentada (RF-13)
            SELECT precio INTO v_precio_final 
            FROM tarifas_ruta 
            WHERE id_ruta = (SELECT id_ruta FROM viajes WHERE id_viaje = v_id_viaje)
              AND tipo_servicio = v_servicio_asiento;

            -- Si la ruta no tuviese tarifa asignada por defecto, usamos el precio base de resguardo
            IF v_precio_final IS NULL THEN
                SELECT tarifa_base INTO v_precio_final FROM rutas WHERE id_ruta = (SELECT id_ruta FROM viajes WHERE id_viaje = v_id_viaje);
            END IF;

            -- Parametrización aleatoria de canales y pasarelas de pago peruanas según capturas de UI
            v_id_usuario := CAST(FLOOR(RANDOM() * 40 + 6) AS INT); -- Clientes del pool del paso 1
            v_canal := CASE WHEN v_id_boleto % 4 = 0 THEN 'ventanilla_fisica'::canal_venta ELSE 'app_bustoke'::canal_venta END;
            v_metodo := CASE WHEN v_id_boleto % 3 = 0 THEN 'yape'::metodo_pago WHEN v_id_boleto % 3 = 1 THEN 'plin'::metodo_pago ELSE 'tarjeta'::metodo_pago END;
            v_token_pago := CASE WHEN v_metodo = 'tarjeta' THEN 'VISA-TOK-' ELSE 'WALL-TRANS-' END || (10000 + v_id_boleto);

            -- 1. Insertar el ticket físico del Pasajero
            INSERT INTO boletos (id_boleto, id_viaje, id_usuario, id_pasajero, id_asiento, email_contacto, canal, codigo_qr, usado, precio_final, acepto_terminos_politicas, ip_registro)
            VALUES (
                v_id_boleto,
                v_id_viaje,
                v_id_usuario,
                v_id_pasajero, -- Asigna el pool correlativo de pasajeros
                v_id_asiento,
                'pasajero.contacto' || v_id_pasajero || '@mail.com',
                v_canal,
                'BKT-QR-2026-' || (50000 + v_id_boleto),
                CASE WHEN v_id_viaje < 10 THEN TRUE ELSE FALSE END, -- Viajes antiguos figuran ya validados/usados al abordar
                v_precio_final,
                TRUE,
                '192.168.1.' || (10 + v_id_boleto)
            );

            -- 2. Insertar el registro contable en la pasarela de pagos centralizada de BusToque
            INSERT INTO pagos (id_pago, id_boleto, metodo, monto_total, referencia_transaccion, estado)
            VALUES (
                v_id_boleto,
                v_id_boleto,
                v_metodo,
                v_precio_final,
                v_token_pago,
                'completado'
            );

            v_id_boleto := v_id_boleto + 1;
            v_id_pasajero := v_id_pasajero + 1;
        END LOOP;
    END LOOP;
END $$;


-- 4. ESCENARIO ESPECIAL A: Inserción de 2 Cancelaciones con Reembolsos Reales (100% y 50%)
-- Reembolso 1: Cancelación total (100%) por Cruz del Sur debido a falla técnica
UPDATE boletos SET estado = 'cancelado' WHERE id_boleto = 50;
UPDATE pagos SET estado = 'reembolsado' WHERE id_pago = 50;
INSERT INTO reembolsos (id_reembolso, id_pago, id_usuario_responsable, monto_reembolsado, motivo)
VALUES (1, 50, 1, (SELECT monto_total FROM pagos WHERE id_pago = 50), 'Cancelación total por Cruz del Sur debido a desperfecto mecánico en la unidad. Se aplica política de reembolso 100%.');

-- Reembolso 2: Cancelación por el propio cliente con derecho al 50% de devolución (Dentro de las 24 horas previas)
UPDATE boletos SET estado = 'cancelado' WHERE id_boleto = 75;
UPDATE pagos SET estado = 'reembolsado' WHERE id_pago = 75;
INSERT INTO reembolsos (id_reembolso, id_pago, id_usuario_responsable, monto_reembolsado, motivo)
VALUES (2, 75, (SELECT id_usuario FROM boletos WHERE id_boleto = 75), (SELECT monto_total * 0.5 FROM pagos WHERE id_pago = 75), 'Solicitud expresa del pasajero por motivos personales de viaje. Aplica penalidad del 50% según políticas generales.');


-- 5. ESCENARIO ESPECIAL B: Inserción de 3 Casos de Reclamos con Hilo Conversacional Completo (Chat B2B)

-- Reclamo 1: Pérdida de equipaje (Caso abierto)
INSERT INTO reclamos (id_reclamo, id_usuario, id_agencia, motivo, detalle, estado)
VALUES (1, 10, 1, 'Pérdida de Equipaje en Bodega', 'Al llegar al terminal de Trujillo, mi maleta de equipaje con ticket Nro 0045 no apareció en la bodega del bus.', 'en_proceso');

INSERT INTO mensajes_reclamo (id_reclamo, id_usuario, text_mensaje) VALUES 
(1, 1, 'Estimado pasajero, lamentamos el inconveniente. Estamos validando el registro de entrega de equipajes con el tripulante de cabina de la unidad. Nos comunicaremos a la brevedad.'),
(1, 10, 'Por favor, requiero celeridad ya que tengo pertenencias de trabajo urgentes en esa maleta.');

-- Reclamo 2: Retraso masivo en la salida (Caso resuelto)
INSERT INTO reclamos (id_reclamo, id_usuario, id_agencia, motivo, detalle, estado)
VALUES (2, 15, 3, 'Retraso de salida en Terminal', 'El bus con destino a Cusco programado para las 09:45 PM terminó saliendo del terminal a las 11:30 PM sin previo aviso.', 'resuelto');

INSERT INTO mensajes_reclamo (id_reclamo, id_usuario, text_mensaje) VALUES 
(2, 3, 'Pedimos sinceras disculpas por el malestar ocasionado. El retraso se debió a un control extraordinario de SUTRAN en las inmediaciones del terminal. El caso ha sido cerrado.'),
(2, 15, 'Entendido, gracias por la aclaración del motivo.');

-- Reclamo 3: Cobro duplicado en pasarela Yape (Caso abierto)
INSERT INTO reclamos (id_reclamo, id_usuario, id_agencia, motivo, detalle, estado)
VALUES (3, 22, 2, 'Doble Cobro por Yape', 'El sistema arrojó error en el primer intento pero el monto de S/. 70.00 fue descontado dos veces de mi saldo.', 'abierto');


-- 6. Ajuste Maestro de Secuencias Post-Población de IDs Fijos
SELECT setval('departamentos_id_departamento_seq', COALESCE((SELECT MAX(id_departamento)+1 FROM departamentos), 1), false);
SELECT setval('provincias_id_provincia_seq', COALESCE((SELECT MAX(id_provincia)+1 FROM provincias), 1), false);
SELECT setval('distritos_id_distrito_seq', COALESCE((SELECT MAX(id_distrito)+1 FROM distritos), 1), false);
SELECT setval('tipos_documento_id_tipo_documento_seq', COALESCE((SELECT MAX(id_tipo_documento)+1 FROM tipos_documento), 1), false);
SELECT setval('planes_id_plan_seq', COALESCE((SELECT MAX(id_plan)+1 FROM planes), 1), false);
SELECT setval('terminales_id_terminal_seq', COALESCE((SELECT MAX(id_terminal)+1 FROM terminales), 1), false);
SELECT setval('agencias_id_agencia_seq', COALESCE((SELECT MAX(id_agencia)+1 FROM agencias), 1), false);
SELECT setval('agencias_terminales_id_agencia_terminal_seq', COALESCE((SELECT MAX(id_agencia_terminal)+1 FROM agencias_terminales), 1), false);
SELECT setval('buses_id_bus_seq', COALESCE((SELECT MAX(id_bus)+1 FROM buses), 1), false);
SELECT setval('asientos_id_asiento_seq', COALESCE((SELECT MAX(id_asiento)+1 FROM asientos), 1), false);
SELECT setval('rutas_id_ruta_seq', COALESCE((SELECT MAX(id_ruta)+1 FROM rutas), 1), false);
SELECT setval('tarifas_ruta_id_tarifa_seq', COALESCE((SELECT MAX(id_tarifa)+1 FROM tarifas_ruta), 1), false);
SELECT setval('viajes_id_viaje_seq', COALESCE((SELECT MAX(id_viaje)+1 FROM viajes), 1), false);
SELECT setval('usuarios_id_usuario_seq', COALESCE((SELECT MAX(id_usuario)+1 FROM usuarios), 1), false);
SELECT setval('pasajeros_id_pasajero_seq', COALESCE((SELECT MAX(id_pasajero)+1 FROM pasajeros), 1), false);
SELECT setval('boletos_id_boleto_seq', COALESCE((SELECT MAX(id_boleto)+1 FROM boletos), 1), false);
SELECT setval('pagos_id_pago_seq', COALESCE((SELECT MAX(id_pago)+1 FROM pagos), 1), false);
SELECT setval('reembolsos_id_reembolso_seq', COALESCE((SELECT MAX(id_reembolso)+1 FROM reembolsos), 1), false);
SELECT setval('reclamos_id_reclamo_seq', COALESCE((SELECT MAX(id_reclamo)+1 FROM reclamos), 1), false);
SELECT setval('mensajes_reclamo_id_mensaje_seq', COALESCE((SELECT MAX(id_mensaje)+1 FROM mensajes_reclamo), 1), false);
CREATE OR REPLACE VIEW vw_metricas_dashboard AS
SELECT 
    -- 1. Ventas en las últimas 24 horas (Monto total acumulado)
    COALESCE(
        (SELECT SUM(p.monto_total) 
         FROM pagos p 
         JOIN boletos b ON p.id_boleto = b.id_boleto
         WHERE p.estado = 'completado' 
           AND b.fecha_emision >= NOW() - INTERVAL '24 hours'), 0.00
    ) AS ventas_24h_monto,

    -- 2. Total Ingresos Históricos en la plataforma
    COALESCE(
        (SELECT SUM(monto_total) FROM pagos WHERE estado = 'completado'), 0.00
    ) AS total_ingresos_historicos,

    -- 3. Total de Viajes programados/activos en el sistema
    (SELECT COUNT(*) FROM viajes WHERE estado IN ('programado', 'en_curso')) AS total_viajes_activos,

    -- 4. Total de Clientes registrados en el ecosistema (RF-01)
    (SELECT COUNT(*) FROM usuarios WHERE rol = 'cliente' AND activo = TRUE) AS total_clientes_activos;


	CREATE OR REPLACE VIEW vw_estado_asientos_viaje AS
SELECT 
    v.id_viaje,
    a.id_asiento,
    a.numero_asiento, -- Ej: 'A4-1'
    a.fila,
    a.piso,
    a.tipo_servicio,
    a.coord_x,
    a.coord_y,
    CASE 
        -- Estado Ocupado (Rojo en tu UI) -> Ya tiene un boleto comprado y activo
        WHEN b.id_boleto IS NOT NULL THEN 'ocupado'
        
        -- Estado Bloqueado Permanente (Gris en tu UI) -> Inhabilitado por el administrador (RF-18)
        WHEN a.bloqueado_manual = TRUE THEN 'bloqueado'
        
        -- Estado Bloqueado Temporal (Gris en tu UI) -> Alguien lo está pagando en este instante (RF-05)
        WHEN bt.id_bloqueo IS NOT NULL THEN 'bloqueado'
        
        -- Estado Disponible (Blanco/Azul en tu UI)
        ELSE 'libre'
    END AS estado_interfaz
FROM viajes v
JOIN buses bu ON v.id_bus = bu.id_bus
JOIN asientos a ON bu.id_bus = a.id_bus
-- Join Boleto Activo
LEFT JOIN boletos b ON b.id_asiento = a.id_asiento 
    AND b.id_viaje = v.id_viaje 
    AND b.estado = 'activo'
-- Join Bloqueo Temporal Vigente
LEFT JOIN bloqueos_temporales bt ON bt.id_asiento = a.id_asiento 
    AND bt.id_viaje = v.id_viaje 
    AND bt.estado = 'activo' 
    AND NOW() < bt.expira_at;

CREATE OR REPLACE FUNCTION fn_calcular_comision_liquidacion()
RETURNS TRIGGER AS $$
DECLARE
    v_porcentaje DECIMAL(5,2) := 0.00;
    v_monto_fijo DECIMAL(10,2) := 0.00;
BEGIN
    -- 1. Buscar si la agencia tiene una comisión específica vigente para este periodo
    SELECT porcentaje_comision, monto_fijo_comision 
    INTO v_porcentaje, v_monto_fijo
    FROM configuracion_comisiones
    WHERE (id_agencia = NEW.id_agencia OR id_agencia IS NULL)
      AND fecha_inicio <= CURRENT_DATE 
      AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
    ORDER BY id_agencia NULLS LAST -- Prioriza la específica sobre la global
    LIMIT 1;

    -- 2. Calcular los montos financieros basados en las ventas brutas reportadas
    NEW.comision_plataforma := (NEW.monto_ventas * (v_porcentaje / 100.00)) + v_monto_fijo;
    NEW.monto_a_transferir := NEW.monto_ventas - NEW.comision_plataforma;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pre_calcular_liquidacion
    BEFORE INSERT OR UPDATE ON liquidaciones_agencia
    FOR EACH ROW
    EXECUTE FUNCTION fn_calcular_comision_liquidacion();

CREATE OR REPLACE FUNCTION fn_proteger_manifiesto_sutran()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operación no permitida: Los registros de manifiestos SUTRAN son inmutables por regulaciones de auditoría nacional.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bloquear_cambios_sutran
    BEFORE UPDATE OR DELETE ON manifiestos_sutran
    FOR EACH ROW
    EXECUTE FUNCTION fn_proteger_manifiesto_sutran();
CREATE OR REPLACE PROCEDURE sp_limpiar_bloqueos_expirados()
LANGUAGE plpgsql AS $$
BEGIN
    -- Cambia el estado de activo a expirado para todos los registros cuya hora actual superó su tiempo límite de checkout
    UPDATE bloqueos_temporales
    SET estado = 'expirado'
    WHERE estado = 'activo'
      AND NOW() >= expira_at;
      
    COMMIT;
END;
$$;