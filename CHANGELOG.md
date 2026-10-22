# Changelog

Formato basado en Keep a Changelog. Fechas en ISO-8601.

## [Unreleased]

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