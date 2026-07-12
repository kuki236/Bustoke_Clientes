# PLANTILLA — Documento de Proyecto Integrador
> **Curso:** Pruebas de Software — VII Ciclo  
> **Docente:** Mg. Victor Hugo Alfaro Yangali  
> **Institución:** Universidad Nacional Mayor de San Marcos — FISI  
> **Escuela:** Ingeniería de Software  

---

> **Instrucciones para usar esta plantilla:**
> 1. Reemplaza todo el texto entre `[...]` con el contenido de tu proyecto.
> 2. Las secciones numeradas (1 a 9) corresponden a los 8 criterios de la rúbrica + sección adicional.
> 3. Conserva la estructura pero adáptala al alcance de tu sistema.
> 4. Incluye capturas, tablas y diagramas donde se indique.

---

## Carátula

| Campo | Valor |
|-------|-------|
| **Nombre del proyecto** | `[Nombre del sistema]` |
| **Integrantes** | `[Apellidos y nombres, 3-4 integrantes]` |
| | `[Integrante 2]` |
| | `[Integrante 3]` |
| | `[Integrante 4 (opcional)]` |
| **Curso** | Pruebas de Software — VII Ciclo 2026-1 |
| **Docente** | Mg. Victor Hugo Alfaro Yangali |
| **Institución** | Universidad Nacional Mayor de San Marcos (UNMSM) — FISI |
| **Fecha de presentación** | `[Semana 15 — 2026-1]` |
| **Repositorio** | `[URL del repositorio en GitHub]` |

---

## Resumen Ejecutivo

`[2-3 párrafos que describan: qué sistema eligieron, qué tipo de pruebas implementaron, qué herramientas usaron, y el resultado principal: número de pruebas automatizadas, % de cobertura, riesgos mitigados, etc.]`

---

## 1. Presentación del Sistema y Alcance

*(Criterio 1 — 2 pts)*

### 1.1. Descripción del Sistema

`[Nombre]` es una plataforma de `[tipo de plataforma: reservas, e-commerce, gestión, etc.]` que permite a `[usuarios objetivo]` realizar `[funcionalidades principales]`.

### 1.2. Objetivo del Proyecto

`[Objetivo general alineado al enunciado del curso:]` Diseñar, implementar y sustentar una estrategia integral de pruebas de software para `[sistema]`, cubriendo desde la planificación hasta la automatización y el análisis de seguridad.

### 1.3. Usuarios del Sistema

| Tipo de Usuario | Rol | Funcionalidades clave |
|-----------------|-----|-----------------------|
| `[Tipo 1]` | `[Descripción]` | `[Funciones]` |
| `[Tipo 2]` | `[Descripción]` | `[Funciones]` |
| `[Tipo 3]` | `[Descripción]` | `[Funciones]` |

### 1.4. Funcionalidades Principales

| ID | Funcionalidad | Descripción | Prioridad |
|:--:|---------------|-------------|:---------:|
| RF-01 | `[Nombre]` | `[Descripción]` | Alta |
| RF-02 | `[Nombre]` | `[Descripción]` | Alta |
| RF-03 | `[Nombre]` | `[Descripción]` | Media |
| ... | ... | ... | ... |

### 1.5. Alcance del Proyecto

`[Delimitar qué cubren las pruebas: back-end (API REST), front-end (UI), integración, seguridad. Incluir qué NO está cubierto.]`

### 1.6. Stack Tecnológico

| Componente | Tecnología | Versión |
|------------|------------|:-------:|
| Backend | `[Python/FastAPI, Node/Express, etc.]` | `[versión]` |
| Frontend | `[React, Vue, Angular, etc.]` | `[versión]` |
| Base de datos | `[PostgreSQL, MySQL, MongoDB, etc.]` | `[versión]` |
| Pruebas API | `[pytest, Postman, RestAssured, etc.]` | `[versión]` |
| Pruebas E2E | `[Cypress, Playwright, Selenium, etc.]` | `[versión]` |
| CI/CD | `[GitHub Actions, Jenkins, GitLab CI, etc.]` | `[versión]` |
| Seguridad | `[OWASP ZAP, SonarQube, etc.]` | `[versión]` |

---

## 2. Plan y Estrategia de Pruebas

*(Criterio 2 — 3 pts)*

### 2.1. Estándares Aplicados

| Estándar | Sección aplicada |
|----------|------------------|
| **ISTQB Foundation Level** | Partición de equivalencia, análisis de valores límite, pruebas basadas en riesgos, caja blanca |
| **ISO/IEC 29119-2** | Proceso de prueba: especificación de casos con identificador único, precondiciones, datos de entrada, pasos, resultados esperados |
| **ISO/IEC 29119-3** | Documentación de casos: técnicas de diseño y trazabilidad a requisitos |
| **OWASP Top 10 (2021)** | `[Listar los riesgos relevantes: A01 a A07, etc.]` |

### 2.2. Niveles y Tipos de Prueba

| Nivel | Tipo | Alcance | Herramienta |
|-------|------|---------|-------------|
| **Unitario** | `[Unitarias]` | `[Funciones críticas: validaciones, helpers]` | `[jest, pytest unittest, etc.]` |
| **Integración** | `[API/Controllers]` | `[Endpoints REST]` | `[pytest + TestClient, Supertest, etc.]` |
| **Sistema** | `[E2E]` | `[Flujos completos de usuario]` | `[Cypress, Playwright, etc.]` |
| **Aceptación** | `[Manual + automatizado]` | `[Escenarios felices + casos borde]` | `[Cypress + CI]` |
| **Seguridad** | `[SAST/DAST]` | `[OWASP Top 10]` | `[slowapi, security headers, etc.]` |

### 2.3. Pirámide de Pruebas

`[Describir la distribución de pruebas:]`
- Base: `[N]` pruebas unitarias / de API (`[%]`)
- Media: `[N]` pruebas de integración (`[%]`)
- Cima: `[N]` pruebas E2E (`[%]`)

### 2.4. Justificación según Contexto de Negocio

`[Explicar por qué se priorizaron ciertos niveles/tipos según el dominio del sistema. Por ejemplo: "Al ser un sistema de pagos, se priorizaron pruebas de concurrencia y rollback transaccional".]`

---

## 3. Diseño de Casos de Prueba

*(Criterio 3 — 3 pts)*

### 3.1. Técnicas Aplicadas

| Técnica | Casos | Descripción |
|---------|:-----:|-------------|
| **Caja Negra — Partición de equivalencia** | `[N]` | Clases válidas e inválidas para inputs |
| **Caja Negra — Análisis de valores límite** | `[N]` | Límites inferior/superior de rangos |
| **Caja Blanca — Cobertura de decisiones/ramas** | `[N]` | Funciones críticas del frontend/backend |
| **Basadas en Riesgo** | `[N]` | Flujos críticos (concurrencia, pérdida de datos, seguridad) |

### 3.2. Matriz de Casos de Prueba

| ID | Módulo | Tipo | Descripción | Precondiciones | Datos de entrada | Pasos | Resultado esperado |
|:--:|--------|:----:|-------------|----------------|------------------|-------|-------------------|
| TC-BB-001 | `[Módulo]` | Caja Negra | `[Descripción]` | `[Precondiciones]` | `[Datos]` | `[Pasos]` | `[Resultado]` |
| TC-BB-002 | `[Módulo]` | Caja Negra | `[Descripción]` | `[Precondiciones]` | `[Datos]` | `[Pasos]` | `[Resultado]` |
| ... | ... | ... | ... | ... | ... | ... | ... |
| TC-WB-001 | `[Módulo]` | Caja Blanca | `[Descripción]` | `[Precondiciones]` | `[Datos]` | `[Pasos]` | `[Resultado]` |
| ... | ... | ... | ... | ... | ... | ... | ... |
| TC-RB-001 | `[Módulo]` | Basada en Riesgo | `[Descripción]` | `[Precondiciones]` | `[Datos]` | `[Pasos]` | `[Resultado]` |
| ... | ... | ... | ... | ... | ... | ... | ... |

*Nota: Incluir entradas de datos 100% coherentes con los schemas/validaciones del código.*

---

## 4. Automatización de Pruebas

*(Criterio 4 — 4 pts)*

### 4.1. Estrategia de Automatización

`[Describir qué se automatizó, por qué, y qué herramientas se usaron.]`

### 4.2. Suite de Pruebas API (Backend)

| Archivo | Casos | Descripción |
|---------|:-----:|-------------|
| `test_health_api.py` | `[N]` | Health check |
| `test_auth_api.py` | `[N]` | Registro, login, refresh, perfil |
| `test_travels_api.py` | `[N]` | Búsqueda de viajes, filtros |
| `test_seats_api.py` | `[N]` | Hold, release, concurrencia |
| `test_bookings_api.py` | `[N]` | Procesar reserva, guest checkout |
| ... | ... | ... |

**Comando de ejecución:**
```bash
cd backend
pytest tests/ -v
```

**Resultados:**
```
[Output esperado: X passed, Y failed, Z warnings en X.XXs]
```

### 4.3. Suite de Pruebas E2E (Frontend + Backend)

| Archivo | Casos | Flujo cubierto |
|---------|:-----:|----------------|
| `[spec-01]` | `[N]` | `[Descripción]` |
| `[spec-02]` | `[N]` | `[Descripción]` |
| `[spec-03]` | `[N]` | `[Descripción]` |

**Comando de ejecución:**
```bash
cd frontend-client
npm run cy:run:headless
```

**Resultados:**
```
[Output esperado: All specs passed!]
```

### 4.4. Pipeline CI/CD (GitHub Actions)

`[Describir el workflow:]`

```yaml
# Estructura general del pipeline
jobs:
  backend-tests:     # pytest + PostgreSQL
  e2e-tests:         # Cypress + backend + frontend + PostgreSQL
  frontend-lint:     # ESLint
  test-summary:      # Resumen de calidad (opcional)
```

`[Incluir captura de pantalla del pipeline corriendo exitosamente en GitHub Actions.]`

---

## 5. Análisis de Riesgos, Defectos y Seguridad

*(Criterio 5 — 2 pts)*

### 5.1. Riesgos Identificados

| ID | Riesgo | Severidad | Mitigación | Estado |
|:--:|--------|:---------:|------------|:------:|
| R-001 | `[Descripción del riesgo]` | Crítico | `[Mitigación implementada]` | Mitigado |
| R-002 | `[Descripción del riesgo]` | Alto | `[Mitigación implementada]` | Mitigado |
| ... | ... | ... | ... | ... |

### 5.2. Defectos Críticos Encontrados

| ID | Módulo | Defecto | Severidad | Estado |
|:--:|--------|---------|:---------:|:------:|
| BUG-001 | `[Módulo]` | `[Descripción]` | `[Alta/Media/Baja]` | `[Abierto/Resuelto]` |
| BUG-002 | `[Módulo]` | `[Descripción]` | `[Alta/Media/Baja]` | `[Abierto/Resuelto]` |

### 5.3. Análisis de Seguridad (OWASP Top 10)

| # | Riesgo OWASP | Hallazgo | Severidad | Estado |
|:-:|--------------|----------|:---------:|:------:|
| 1 | `[A01-A07]` | `[Hallazgo]` | `[Crítico/Alto/Medio]` | `[Mitigado/Pendiente]` |
| 2 | `[A01-A07]` | `[Hallazgo]` | `[Crítico/Alto/Medio]` | `[Mitigado/Pendiente]` |
| ... | ... | ... | ... | ... |

### 5.4. DevSecOps Incorporado

`[Describir las prácticas DevSecOps implementadas: rate limiting, security headers, validación de secrets, etc.]`

---

## 6. Demo en Vivo — Plan de Ejecución

*(Criterio 6 — 3 pts)*

### 6.1. Escenario a Demostrar

`[Describir el flujo que se ejecutará en vivo:]`

1. `[Paso 1: p.ej. Abrir la landing page]`
2. `[Paso 2: p.ej. Realizar una búsqueda]`
3. `[Paso 3: p.ej. Seleccionar un asiento]`
4. `[Paso 4: p.ej. Ejecutar pruebas automatizadas]`

### 6.2. Checklist Técnico Pre-Demo

| Requisito | Estado |
|-----------|:------:|
| Backend corriendo localmente | `[✓/✗]` |
| Frontend corriendo localmente | `[✓/✗]` |
| BD sembrada con datos de prueba | `[✓/✗]` |
| Suite de pruebas lista para ejecutar | `[✓/✗]` |
| CI/CD pipeline configurado y funcional | `[✓/✗]` |
| Video de respaldo grabado | `[✓/✗]` |
| Capturas de pantalla de respaldo | `[✓/✗]` |

### 6.3. Contingencia

`[Describir el plan B si la demo en vivo falla: video grabado, capturas estáticas, etc.]`

---

## 7. Documentación y Métricas de Calidad

*(Criterio 7 — 2 pts)*

### 7.1. Documentación Entregada

| Documento | Formato | Ubicación |
|-----------|:-------:|-----------|
| Plan de pruebas | Markdown / PDF | `docs/TEST_PLAN.md` |
| Matriz de casos de prueba | Markdown | `docs/TEST_PLAN.md` |
| Reporte de defectos | Markdown | `SECURITY.md`, `SECURITY_AUDIT.md` |
| Estrategia de pruebas (QA + DevSecOps) | Markdown | `docs/BUSTOKE_QA_SECURITY_DEVOPS.md` |
| Guía de setup local | Markdown | `docs/E2E_SETUP.md` |

### 7.2. Métricas de Calidad

| Métrica | Valor | Interpretación |
|---------|:-----:|----------------|
| Pruebas unitarias + integración pasando | `[N] / [M]` | `[%] de pruebas API exitosas` |
| Pruebas E2E pasando | `[N] / [M]` | `[%] de escenarios E2E exitosos` |
| Tiempo total de ejecución (API) | `[X.XXs]` | `[Interpretación]` |
| Tiempo total de ejecución (E2E) | `[Xm YYs]` | `[Interpretación]` |
| Tiempo de pipeline CI/CD | `[Xm YYs]` | `[Interpretación]` |
| Riesgos críticos mitigados | `[N] / [M]` | `[%] de riesgos críticos cubiertos` |
| Hallazgos de seguridad resueltos | `[N] / [M]` | `[%] de vulnerabilidades mitigadas` |
| Cobertura de funcionalidades probadas | `[N] / [M]` | `[%] de RF cubiertos por casos de prueba` |

### 7.3. Interpretación para Toma de Decisiones

`[Con base en las métricas, ¿qué decisiones de calidad puede tomar el equipo?]`

---

## 8. Conclusiones y Mejoras

### 8.1. Logros Alcanzados

- `[Logro 1: p.ej. Suite de 45 casos de prueba diseñados bajo estándares ISTQB]`
- `[Logro 2: p.ej. Automatización de 101 pruebas de API y 9 escenarios E2E]`
- `[Logro 3: p.ej. Pipeline CI/CD con 3 jobs paralelos]`
- `[Logro 4: p.ej. Análisis OWASP con 9 hallazgos, 5 mitigados]`

### 8.2. Dificultades Encontradas

- `[Dificultad técnica 1: p.ej. Configuración de PostgreSQL en CI]`
- `[Dificultad técnica 2: p.ej. Sincronización de IDs entre seed y frontend]`
- `[Dificultad técnica 3: p.ej. Limitaciones de las herramientas]`

### 8.3. Trabajo Futuro / Roadmap

| Item | Prioridad | Horizonte |
|------|:---------:|:---------:|
| `[Mejora 1: p.ej. Migrar a httpOnly cookies]` | Alta | Q3 2026 |
| `[Mejora 2: p.ej. Implementar job de limpieza de holds]` | Alta | Q3 2026 |
| `[Mejora 3: p.ej. Agregar pruebas de rendimiento con k6]` | Media | Q4 2026 |
| `[Mejora 4: p.ej. Auditoría de seguridad externa]` | Media | Q4 2026 |

### 8.4. Impacto de la Estrategia de Pruebas

`[Explicar cómo la estrategia implementada mejora la calidad del sistema y reduce riesgos del negocio. Relacionar con casos concretos.]`

---

## 9. Comunicación y Trabajo en Equipo

*(Criterio 8 — 1 pt)*

### 9.1. Distribución de Roles

| Integrante | Rol principal | Contribución |
|------------|---------------|--------------|
| `[Nombre 1]` | `[Rol]` | `[Módulos/tareas]` |
| `[Nombre 2]` | `[Rol]` | `[Módulos/tareas]` |
| `[Nombre 3]` | `[Rol]` | `[Módulos/tareas]` |
| `[Nombre 4]` | `[Rol]` | `[Módulos/tareas]` |

### 9.2. Herramientas de Colaboración

| Herramienta | Propósito |
|-------------|-----------|
| `[GitHub]` | Control de versiones y CI/CD |
| `[WhatsApp/Discord]` | Comunicación del equipo |
| `[Trello/Jira/Notion]` | Gestión de tareas |
| `[Google Drive/OneDrive]` | Documentación compartida |

### 9.3. Enlace al Repositorio

`[URL del repositorio de GitHub]`

---

## Referencias

1. ISTQB Foundation Level Syllabus. International Software Testing Qualifications Board.
2. ISO/IEC 29119-2:2013 — Software and systems engineering — Software testing — Part 2: Test processes.
3. ISO/IEC 29119-3:2013 — Software and systems engineering — Software testing — Part 3: Test documentation.
4. OWASP Top 10 — 2021. The Open Web Application Security Project.
5. `[Bibliografía adicional específica del stack tecnológico]`
