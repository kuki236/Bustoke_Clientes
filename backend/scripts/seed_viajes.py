"""
seed_viajes.py - Generador masivo de viajes para la BD de BUSTOKE.

Crea rutas entre TODAS las combinaciones de terminales, tarifas por tipo
de servicio y viajes desde la fecha actual hasta el 30 de julio con
múltiples salidas diarias. Idempotente: se puede correr varias veces.

Uso:
    python seed_viajes.py
    python seed_viajes.py --start 2026-07-05 --end 2026-07-30
    python seed_viajes.py --departures 5 --batch 500
"""

import argparse
import os
import sys
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path

os.environ.setdefault('PGSSLMODE', 'require')

import psycopg2
from psycopg2.extras import execute_values


# === CONFIGURACIÓN =====================================================

DEFAULT_START = date(2026, 7, 5)
DEFAULT_END = date(2026, 7, 30)

# Salidas diarias por ruta. Más horarios = más alternativas para el usuario.
DEFAULT_DEPARTURES = [
    time(5, 30),
    time(8, 0),
    time(11, 0),
    time(14, 30),
    time(18, 0),
    time(21, 30),
]

DEFAULT_BATCH = 500

# Rampas de embarque (rotación)
RAMPAS = [f'Rampa {i}' for i in range(1, 21)]


# === MATRICES DE REFERENCIA ============================================

# Terminales: agrupados por ciudad
LIMA_TERMINALS = {1, 2, 3, 9, 10}
CITY_BY_TERMINAL = {
    1: 'lima', 2: 'lima', 3: 'lima', 9: 'lima', 10: 'lima',
    4: 'trujillo', 5: 'arequipa', 6: 'chiclayo',
    7: 'cusco', 8: 'huancayo', 11: 'ica',
}

# Duración estimada en horas entre ciudades (origen -> destino)
# Usa ciudad, no terminal, para cubrir todos los terminales de Lima
CITY_DURATIONS = {
    ('lima', 'trujillo'): 9,
    ('lima', 'arequipa'): 16,
    ('lima', 'chiclayo'): 13,
    ('lima', 'cusco'): 22,
    ('lima', 'huancayo'): 7,
    ('lima', 'ica'): 4,
    ('trujillo', 'lima'): 9,
    ('arequipa', 'lima'): 16,
    ('chiclayo', 'lima'): 13,
    ('cusco', 'lima'): 22,
    ('huancayo', 'lima'): 7,
    ('ica', 'lima'): 4,
    # Inter-ciudad
    ('trujillo', 'chiclayo'): 4,
    ('chiclayo', 'trujillo'): 4,
    ('trujillo', 'arequipa'): 26,
    ('arequipa', 'trujillo'): 26,
    ('trujillo', 'cusco'): 30,
    ('cusco', 'trujillo'): 30,
    ('arequipa', 'cusco'): 10,
    ('cusco', 'arequipa'): 10,
    ('chiclayo', 'cusco'): 30,
    ('cusco', 'chiclayo'): 30,
    ('chiclayo', 'arequipa'): 26,
    ('arequipa', 'chiclayo'): 26,
    ('huancayo', 'ica'): 6,
    ('ica', 'huancayo'): 6,
    ('huancayo', 'cusco'): 18,
    ('cusco', 'huancayo'): 18,
    ('ica', 'arequipa'): 14,
    ('arequipa', 'ica'): 14,
}

# Precio base en soles entre ciudades (origen -> destino)
CITY_PRICES = {
    ('lima', 'trujillo'): 70,
    ('lima', 'arequipa'): 110,
    ('lima', 'chiclayo'): 60,
    ('lima', 'cusco'): 140,
    ('lima', 'huancayo'): 50,
    ('lima', 'ica'): 30,
    ('trujillo', 'lima'): 70,
    ('arequipa', 'lima'): 110,
    ('chiclayo', 'lima'): 60,
    ('cusco', 'lima'): 140,
    ('huancayo', 'lima'): 50,
    ('ica', 'lima'): 30,
    ('trujillo', 'chiclayo'): 35,
    ('chiclayo', 'trujillo'): 35,
    ('trujillo', 'arequipa'): 220,
    ('arequipa', 'trujillo'): 220,
    ('trujillo', 'cusco'): 260,
    ('cusco', 'trujillo'): 260,
    ('arequipa', 'cusco'): 80,
    ('cusco', 'arequipa'): 80,
    ('chiclayo', 'cusco'): 250,
    ('cusco', 'chiclayo'): 250,
    ('chiclayo', 'arequipa'): 200,
    ('arequipa', 'chiclayo'): 200,
    ('huancayo', 'ica'): 40,
    ('ica', 'huancayo'): 40,
    ('huancayo', 'cusco'): 130,
    ('cusco', 'huancayo'): 130,
    ('ica', 'arequipa'): 90,
    ('arequipa', 'ica'): 90,
}

# Qué agencias sirven qué par de ciudades.
# (origen_city, destino_city) -> [agency_ids]
# - 1: Cruz del Sur (todas las rutas largas)
# - 2: Oltursa (norte)
# - 3: Civa (norte + Cusco)
# - 4: Movil Bus (centro/sur)
# - 6: Flores (local Lima + Ica)
AGENCY_SERVICES = {
    ('lima', 'trujillo'): [1, 2, 3, 6],
    ('lima', 'arequipa'): [1, 4],
    ('lima', 'chiclayo'): [1, 2, 3, 6],
    ('lima', 'cusco'): [1, 3, 4],
    ('lima', 'huancayo'): [1, 4, 6],
    ('lima', 'ica'): [1, 4, 6],
    ('trujillo', 'lima'): [1, 2, 3, 6],
    ('arequipa', 'lima'): [1, 4],
    ('chiclayo', 'lima'): [1, 2, 3, 6],
    ('cusco', 'lima'): [1, 3, 4],
    ('huancayo', 'lima'): [1, 4, 6],
    ('ica', 'lima'): [1, 4, 6],
    ('trujillo', 'chiclayo'): [2, 3],
    ('chiclayo', 'trujillo'): [2, 3],
    ('arequipa', 'cusco'): [1, 3, 4],
    ('cusco', 'arequipa'): [1, 3, 4],
    ('huancayo', 'cusco'): [1, 4],
    ('cusco', 'huancayo'): [1, 4],
    ('huancayo', 'ica'): [4, 6],
    ('ica', 'huancayo'): [4, 6],
    ('trujillo', 'arequipa'): [1, 3],
    ('arequipa', 'trujillo'): [1, 3],
    ('trujillo', 'cusco'): [1, 3],
    ('cusco', 'trujillo'): [1, 3, 4],
    ('chiclayo', 'cusco'): [1, 3],
    ('cusco', 'chiclayo'): [1, 3],
    ('chiclayo', 'arequipa'): [1, 3],
    ('arequipa', 'chiclayo'): [1, 3],
    ('ica', 'arequipa'): [1, 4],
    ('arequipa', 'ica'): [1, 4],
}

# Terminales de Lima que se usan para Lima->* y *->Lima
# (excluimos los de prueba: id 9 y 10 se usan solo para "locales")
LIMA_TERMINALS_MAIN = [1, 2, 3]


# === UTILIDADES ========================================================

def env_conn_str():
    """Lee DATABASE_URL del .env del backend."""
    env_path = Path(__file__).resolve().parent.parent / '.env'
    if not env_path.exists():
        sys.exit(f'No se encontró .env en {env_path}')
    for line in env_path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.startswith('DATABASE_URL='):
            url = line.split('=', 1)[1].strip()
            # El backend usa postgresql+psycopg2:// pero psycopg2 acepta
            # también postgresql://
            return url.replace('postgresql+psycopg2://', 'postgresql://')
    sys.exit('DATABASE_URL no está definida en el .env')


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--start', type=date.fromisoformat, default=DEFAULT_START)
    p.add_argument('--end', type=date.fromisoformat, default=DEFAULT_END)
    p.add_argument('--departures', type=int, default=len(DEFAULT_DEPARTURES),
                   help='Cantidad de salidas diarias (usa las primeras N)')
    p.add_argument('--batch', type=int, default=DEFAULT_BATCH)
    p.add_argument('--dry-run', action='store_true',
                   help='Solo muestra lo que se va a hacer, no inserta')
    return p.parse_args()


# === LÓGICA PRINCIPAL ==================================================

def run(args):
    conn_str = env_conn_str()
    print(f'Conectando a Neon...')
    with psycopg2.connect(conn_str) as conn:
        with conn.cursor() as cur:
            # --- 1) Leer datos existentes ---
            cur.execute('SELECT id_terminal, nombre FROM terminales ORDER BY id_terminal')
            terminales = cur.fetchall()
            if not terminales:
                sys.exit('No hay terminales en la BD. Carga primero el schema.')
            tids = [t[0] for t in terminales]
            print(f'  {len(terminales)} terminales')

            cur.execute('SELECT id_agencia, razon_social FROM agencias ORDER BY id_agencia')
            agencias = cur.fetchall()
            print(f'  {len(agencias)} agencias')

            cur.execute('SELECT id_bus, id_agencia FROM buses ORDER BY id_bus')
            buses = cur.fetchall()
            print(f'  {len(buses)} buses')
            if not buses:
                sys.exit('No hay buses en la BD. Carga primero el schema.')

            buses_by_agency = defaultdict(list)
            for bus_id, agency_id in buses:
                buses_by_agency[agency_id].append(bus_id)

            cur.execute('SELECT id_ruta, id_agencia, id_terminal_origen, id_terminal_destino FROM rutas')
            existing_rutas = cur.fetchall()
            existing_set = {(a, o, d) for _, a, o, d in existing_rutas}
            print(f'  {len(existing_rutas)} rutas existentes')

            cur.execute('SELECT id_ruta, tipo_servicio FROM tarifas_ruta')
            existing_tarifas = {(r, t) for r, t in cur.fetchall()}

            # --- 2) Construir lista de rutas a crear ---
            departures = DEFAULT_DEPARTURES[:args.departures]
            new_rutas = []
            new_tarifas = []

            # Generar todas las combinaciones (origen_terminal, destino_terminal)
            # para cada par de ciudades que tengamos
            for (city_o, city_d), horas in CITY_DURATIONS.items():
                agencias_sirven = AGENCY_SERVICES.get((city_o, city_d), [])
                if not agencias_sirven:
                    continue

                # Determinar terminales específicos
                if city_o == 'lima':
                    orig_terminals = LIMA_TERMINALS_MAIN
                else:
                    orig_terminals = [next(t for t in tids if CITY_BY_TERMINAL.get(t) == city_o)]

                if city_d == 'lima':
                    dest_terminals = LIMA_TERMINALS_MAIN
                else:
                    dest_terminals = [next(t for t in tids if CITY_BY_TERMINAL.get(t) == city_d)]

                precio_base = CITY_PRICES.get((city_o, city_d), 50)

                for t_o in orig_terminals:
                    for t_d in dest_terminals:
                        if t_o == t_d:
                            continue
                        for agency_id in agencias_sirven:
                            if agency_id not in buses_by_agency:
                                continue
                            if (agency_id, t_o, t_d) in existing_set:
                                continue
                            new_rutas.append((agency_id, t_o, t_d, precio_base))
                            existing_set.add((agency_id, t_o, t_d))

            print(f'\n[1/3] Rutas a crear: {len(new_rutas)}')

            if args.dry_run:
                print('  (dry-run: no se inserta nada)')
            elif new_rutas:
                # Insertar nuevas rutas
                inserted = execute_values(
                    cur,
                    '''INSERT INTO rutas (id_agencia, id_terminal_origen,
                                         id_terminal_destino, tarifa_base)
                       VALUES %s RETURNING id_ruta''',
                    new_rutas,
                    fetch=True,
                )
                new_ruta_ids = [r[0] for r in inserted]

                # Crear tarifas (normal + vip) para cada nueva ruta
                for r_id in new_ruta_ids:
                    cur.execute('SELECT tarifa_base FROM rutas WHERE id_ruta = %s', (r_id,))
                    base = cur.fetchone()[0]
                    if (r_id, 'normal') not in existing_tarifas:
                        new_tarifas.append((r_id, 'normal', base))
                    if (r_id, 'vip') not in existing_tarifas:
                        new_tarifas.append((r_id, 'vip', round(float(base) * 1.6, 2)))

                if new_tarifas:
                    execute_values(
                        cur,
                        '''INSERT INTO tarifas_ruta (id_ruta, tipo_servicio, precio)
                           VALUES %s
                           ON CONFLICT (id_ruta, tipo_servicio) DO NOTHING''',
                        new_tarifas,
                    )
                print(f'  + {len(new_ruta_ids)} rutas insertadas')
                print(f'  + {len(new_tarifas)} tarifas insertadas')

            # --- 3) Generar viajes ---
            # Releer todas las rutas (incluyendo las nuevas)
            cur.execute('SELECT id_ruta, id_agencia, id_terminal_origen, id_terminal_destino FROM rutas')
            all_rutas = cur.fetchall()
            print(f'\n[2/3] Total rutas en BD: {len(all_rutas)}')

            # Verificar viajes ya existentes para no duplicar
            cur.execute('''
                SELECT id_ruta, fecha_hora_salida
                FROM viajes
                WHERE fecha_hora_salida >= %s AND fecha_hora_salida < %s
            ''', (args.start, args.end + timedelta(days=1)))
            existing_viajes = set()
            for r_id, f_salida in cur.fetchall():
                existing_viajes.add((r_id, f_salida))
            print(f'  Viajes existentes en el rango: {len(existing_viajes)}')

            total_days = (args.end - args.start).days + 1
            total_candidates = len(all_rutas) * len(departures) * total_days
            print(f'  Candidatos a generar: {total_candidates}')

            if args.dry_run:
                print('\n(dry-run: no se inserta nada)')
                return

            # Generar viajes nuevos
            print(f'\n[3/3] Generando viajes...')
            buffer = []
            total_inserted = 0
            rampa_i = 0
            day_i = 0

            for r_id, agency_id, t_o, t_d in all_rutas:
                city_o = CITY_BY_TERMINAL.get(t_o, 'lima')
                city_d = CITY_BY_TERMINAL.get(t_d, 'lima')
                horas = CITY_DURATIONS.get((city_o, city_d), 10)
                agency_buses = buses_by_agency.get(agency_id, [])
                if not agency_buses:
                    continue

                for d_offset in range(total_days):
                    day = args.start + timedelta(days=d_offset)
                    for dep in departures:
                        dep_dt = datetime.combine(day, dep)
                        arr_dt = dep_dt + timedelta(hours=horas)
                        if (r_id, dep_dt) in existing_viajes:
                            continue
                        # Rotar buses de la agencia
                        bus_id = agency_buses[day_i % len(agency_buses)]
                        rampa = RAMPAS[rampa_i % len(RAMPAS)]
                        buffer.append((
                            r_id, bus_id, dep_dt, arr_dt,
                            'programado', rampa, None,  # id_chofer NULL
                        ))
                        rampa_i += 1
                        day_i += 1

                        if len(buffer) >= args.batch:
                            flush(cur, buffer)
                            total_inserted += len(buffer)
                            print(f'  +{total_inserted} viajes insertados', end='\r')
                            buffer = []

            if buffer:
                flush(cur, buffer)
                total_inserted += len(buffer)

            print(f'\n\nListo.')
            print(f'  Rutas nuevas:        {len(new_rutas)}')
            print(f'  Tarifas nuevas:     {len(new_tarifas)}')
            print(f'  Viajes insertados:   {total_inserted}')

        conn.commit()


def flush(cur, buffer):
    execute_values(
        cur,
        '''INSERT INTO viajes
               (id_ruta, id_bus, fecha_hora_salida, fecha_hora_llegada,
                estado, rampa_embarque, id_chofer)
           VALUES %s''',
        buffer,
    )


if __name__ == '__main__':
    run(parse_args())
