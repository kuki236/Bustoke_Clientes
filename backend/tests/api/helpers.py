"""
Utilidades compartidas para aserciones de la suite de API.

Concentra validadores de JSON y patrones recurrentes para que las
suites de tests se lean como una checklist clara, no como un
enjambre de asserts repetidos.
"""

from typing import Any, Iterable


def assert_json_keys(payload: dict, required: Iterable[str]) -> None:
    """
    Verifica que `payload` sea un dict y contenga TODAS las claves
    indicadas. Falla con un mensaje legible listando las claves
    faltantes (si las hay) en vez de un KeyError genérico.
    """
    assert isinstance(payload, dict), f"Se esperaba dict, recibí {type(payload).__name__}"
    missing = [k for k in required if k not in payload]
    assert not missing, f"Faltan claves en la respuesta JSON: {missing}"


def assert_status_code(response, expected: int) -> None:
    """
    Wrapper sobre `assert response.status_code == expected` que incluye
    el body cuando falla (esencial para depurar fallos de Pydantic).
    """
    actual = response.status_code
    assert actual == expected, (
        f"Status code esperado {expected}, recibí {actual}. "
        f"Body: {response.text[:500]}"
    )


def assert_is_iso_datetime(value: str) -> None:
    """
    Verifica que `value` sea un string parseable como ISO 8601.
    Acepta tanto 'Z' (UTC) como offset numérico (+00:00).
    """
    from datetime import datetime

    assert isinstance(value, str), f"Se esperaba str ISO 8601, recibí {type(value).__name__}"
    # Reemplazamos 'Z' por '+00:00' para que fromisoformat no rechace.
    normalized = value.replace("Z", "+00:00")
    datetime.fromisoformat(normalized)  # lanza ValueError si no es válido


def assert_non_empty_list(payload: Any, min_length: int = 1) -> list:
    """
    Asegura que la respuesta sea una lista no vacía (con al menos
    `min_length` elementos) y la retorna para encadenar asserts.
    """
    assert isinstance(payload, list), f"Se esperaba list, recibí {type(payload).__name__}"
    assert len(payload) >= min_length, (
        f"Se esperaban al menos {min_length} elementos, hay {len(payload)}"
    )
    return payload


def assert_dict_subset(actual: dict, expected: dict) -> None:
    """
    Verifica que `actual` contenga todas las claves/valores de
    `expected` (recursivo para dicts anidados). Útil para verificar
    la forma de respuestas sin atarse a campos opcionales.
    """
    for key, exp_value in expected.items():
        assert key in actual, f"Falta clave '{key}' en {actual}"
        act_value = actual[key]
        if isinstance(exp_value, dict) and isinstance(act_value, dict):
            assert_dict_subset(act_value, exp_value)
        else:
            assert act_value == exp_value, (
                f"Para clave '{key}': se esperaba {exp_value!r}, recibí {act_value!r}"
            )
