# Changelog

Formato basado en Keep a Changelog. Fechas en ISO-8601.

## [Unreleased]

### Escaneo local por enlaces Ashby

- El escáner N2 detecta enlaces del listado del único tablero Ashby que autorizaste y guarda solo URL y título; no consulta la API ni guarda descripciones.
- El dashboard muestra las oportunidades guardadas en IndexedDB; la deduplicación conserva el estado y las notas existentes.
- El permiso dinámico queda limitado al path del slug activo, se detiene con la pestaña oculta y procesa un máximo de 200 enlaces por lote.
- Las consultas Ashby/Greenhouse N0 al abrir popup/dashboard se retiraron; la API sigue disponible con acción manual **Consultar ahora**.
- Añadidos fixtures de validación, límite de enlaces y rechazo de rutas/hosts ajenos, además de ADR-0003 y actualización de política/QA.

- El permiso N2 requiere opt-in y revisión por tablero; solo queda un slug activo, y desactivar retira el script y el permiso.

### Correcciones para validación MVP

- Eliminados el registro N2 sin ADR ni archivo y permisos opcionales de portales que el flujo actual no usa.
- Restaurado `core/pacing`, requerido por el service worker, con presupuestos por nivel, jitter gaussiano y backoff acotado.
- Clasificadas las respuestas 401/403/429 como throttling y las 5xx como reintentables; las APIs N0 siempre omiten credenciales y no siguen redirecciones automáticas.
- Normalización de URL ampliada para eliminar también el parámetro de seguimiento `ref`.
- Alineada la versión del paquete y la guía con el manifiesto `0.2.0`.
- Ajustado el chequeo estático para permisos opcionales omitidos y rutas `src/core` en Windows.

### Política, arquitectura y ritmo

- Modelo de fuentes por niveles N0–N3, con N0/N3 habilitables y N1/N2 condicionados a ficha y ADR.
- Las prohibiciones binarias pasan a recursos declarados por conector: sesión, cabeceras, endpoint interno, lectura de DOM y proxies dejan de estar vetados.
- Nueva capa `core/pacing`: esperas con jitter gaussiano, pacing por dominio, arranque suave, backoff con jitter y disyuntor aislado.
- Niveles de agresividad A0–A2, con ascenso tras sesiones limpias y descenso inmediato al primer 429.
- Nuevo estado `THROTTLED`: un 429 degrada en lugar de desactivar. `BLOCKED` queda reservado a restricción explícita.
- Ficha de fuente obligatoria antes de habilitar cualquier conector.
- Log de trazabilidad local: nivel, host, peticiones, códigos, pausas y cambios de nivel.
- Persistencia de contadores y nivel A para sobrevivir a la suspensión del service worker.
- `credentials: include` disponible por conector; `omit` sigue siendo el valor por defecto.
- Redirecciones permitidas solo dentro del host declarado.
- Reintentos con backoff y jitter sustituyen la ausencia total de reintentos.
- Roadmap: nueva fase de ritmo y credibilidad; "no objetivos" reescrito como límites revisables.
- Tests de ritmo deterministas con RNG y reloj inyectados.

### Marca y almacenamiento

- Cambio de marca a **JobScout by chxchx-dev** en la extensión, documentación y metadatos del paquete.
- Incorporación de los iconos y logos oficiales del paquete de marca, con el azul y navy de JobScout en la interfaz.
- Migración local de preferencias, límites de consulta y oportunidades existentes al nuevo espacio de almacenamiento.
- Los respaldos nuevos usan el formato JobScout; se mantiene la importación de respaldos anteriores.

## [0.1.0] - 2026-10-21

- Primera semilla del MVP: popup, dashboard, guardado manual, SQLite-free IndexedDB, criterios de afinidad y seguimientos.
- Adaptadores bajo revisión de políticas para API de anuncios públicos Ashby/Greenhouse, sin fuentes prehabilitadas ni polling.
- Tests, documentación de seguridad, privacidad, reglas de contribución y roadmap.
- Pendiente validación E2E en navegador y verificación de autorización por tablero individual.
