# Roadmap medible — JobScout

Fechas objetivo a partir del **21 de octubre de 2026**. No equivalen a promesas de compatibilidad con terceros. La prioridad es funcionalidad comprobable, no cantidad de integraciones.

Regla transversal: ninguna fase se cierra sin medición. Una casilla se marca cuando hay evidencia reproducible, no cuando el código existe.

## Fase 0 — Semilla entregada (21/10/2026)

- [x] Manifest V3, popup, dashboard sin build.
- [x] Guardado manual de URL y título de pestaña activa, sin scripts inyectados.
- [x] IndexedDB, preferencias locales, filtro, scoring, estados, notas.
- [x] Exportación/importación JSON con validación básica.
- [x] Conectores Ashby/Greenhouse desconfigurados de fábrica; consultas solo bajo acción explícita y revisión por fuente.
- [x] Ritmo mínimo: presupuesto por dominio, arranque suave y mínimo de 15 minutos entre reintentos del mismo tablero.
- [x] Tests unitarios de normalización y scoring, documentación y CI.
- [ ] Validación E2E en Chrome real y pruebas de rendimiento/accesibilidad (**pendiente**).
- [ ] Confirmar por separado la autorización de cada tablero concreto antes de usar su API.

## Fase 1 — Calidad MVP (22–25/10/2026)

- [ ] Instalar extensión en Chrome y probar carga sin errores.
- [ ] Probar 20 enlaces HTTPS: portales laborales grandes y varios ATS; cero solicitudes automáticas a dominios no declarados.
- [ ] Persistencia tras reiniciar Chrome; recarga y respaldo/importación.
- [ ] Pruebas IndexedDB en navegador, inmutabilidad de seguimiento tras sincronización y errores de cuota.
- [ ] Auditoría básica de accesibilidad por teclado (formularios, focus, contraste, dialog).
- [ ] Capturas reales para README, sin exponer datos personales.

**Exit criteria:** 20 ofertas únicas guardadas; repetir 5 URLs no crea duplicados; 6 estados; filtros y notas persisten.

## Fase 2 — Conectores controlados (26–31/10/2026)

- [ ] Ficha de fuente completa y ADR para cada conector antes de habilitarlo, según [POLITICA_DE_FUENTES.md](POLITICA_DE_FUENTES.md).
- [ ] Revisión documental de 1 tablero de prueba autorizado Ashby y 1 Greenhouse (o sustituir por fixtures si no hay permiso).
- [ ] Pruebas con fixtures de esquemas, formatos HTML, errores 401/403/429, tamaño, timeouts y URLs inválidas.
- [ ] Manejo visible de >200 ofertas en tablero (actualmente hay cap de 200); nunca fingir completitud.
- [ ] Cache condicional ETag/If-Modified-Since si los endpoints y términos lo autorizan.
- [ ] Registrador local de últimas consultas y errores sin datos sensibles.
- [ ] Habilitar botón para revocar autorización de cada tablero y borrar datos de esa fuente si el usuario lo solicita.
- [ ] Verificar que ninguna llamada se salta el presupuesto: auditar que todo `fetch` pasa por la capa de ritmo.

**Exit criteria:** ninguna petición no permitida; todo fetch bajo presupuesto; degradación a A0 comprobada al recibir 429; ninguna fuente pasa a BLOCKED sin restricción explícita.

## Fase 3 — Ritmo y credibilidad (26/10 – 02/11/2026)

- [ ] Esperas con jitter gaussiano en toda petición; ningún `sleep` fijo en el código.
- [ ] Pacing estricto por dominio, no global: un host nunca recibe dos peticiones seguidas si hay otro esperando.
- [ ] Backoff exponencial con jitter y tope para 401/403/429; reintento con jitter para 5xx.
- [ ] Disyuntor por dominio con enfriamiento aislado, sin arrastrar el resto de fuentes.
- [ ] Persistencia de contadores y nivel A: sobreviven al reinicio del service worker.
- [ ] Log de trazabilidad legible en el dashboard: nivel, host, peticiones, códigos, pausas y cambios de nivel.
- [ ] Ascenso automático tras sesiones limpias acumuladas y descenso inmediato al primer 429.
- [ ] CAPTCHA tratado como señal: pausa y aviso, sin intento de resolución.
- [ ] Pestaña oculta en N2 => actividad reducida o detenida.

**Exit criteria:** una fuente real sostiene A1 durante 3 sincronizaciones sin un solo 429 ni 403; los contadores sobreviven a un reinicio del service worker; el log permite reconstruir por qué se aplicó cada pausa.

## Fase 4 — Producto open source (noviembre 2026)

- [ ] GitHub Issues y plantillas de PR, changelog y releases etiquetados.
- [ ] Integración de pruebas E2E automatizadas de Chrome (herramientas dev opcionales, no en runtime).
- [ ] Tests deterministas de jitter, backoff y disyuntor con RNG inyectable.
- [ ] Filtros por seniority y modalidad, fecha y dashboard por fases.
- [ ] Normalización salarial con moneda, unidad temporal, tipo contractual y tipo de cambio fechado.
- [ ] Detección aproximada de duplicados sin fusión automática.
- [ ] Importación voluntaria de alertas mediante archivos `.eml` o feeds oficiales autorizados, nunca credenciales Gmail/LinkedIn.

**Exit criteria:** cobertura de prueba relevante, sin warnings de Chrome y guías completas para colaboradores.

## Fase 5 — Investigación (diciembre 2026 en adelante)

- [ ] Revisión individual de endpoints internos (N1) y lectura de DOM (N2) en portales laborales grandes, con ficha y ADR por fuente.
- [ ] Revisión individual de posibles APIs y RSS de otros ATS/portales, con documentación de permiso.
- [ ] Sincronización programada **solo** para fuentes que lo permitan explícitamente y opt-in, con límites y posibilidad de revocar.
- [ ] Evaluación de proxies como escape hatch, únicamente con evidencia de bloqueo sostenido en A0.
- [ ] Recordatorios locales de seguimiento, notificaciones sin subir datos.
- [ ] Accesibilidad WCAG 2.2 AA y versiones Chromium compatibles.
- [ ] Posible soporte Firefox: análisis por separado de MV3, permisos y service workers.

## Límites actuales, no vetos permanentes

Ninguna de estas técnicas está prohibida; todas están condicionadas a declaración y medición.

| Técnica | Estado actual | Cuándo se reconsidera |
| --- | --- | --- |
| Postulación automática | No | Tras estabilizar N0–N2 |
| Resolución de CAPTCHA | No, solo señal | Si una fuente lo exige de forma recurrente |
| Rotación de proxies | No por defecto | Bloqueo sostenido en A0 con log que lo respalde |
| Scraping de páginas autenticadas | Sí, vía N1/N2 con sesión declarada | Ya disponible por conector |
| Extracción de contactos/perfiles | No | Cuando aporte valor al seguimiento |
| Bypass de detección | No agresivo | Si el pacing declarado no basta |
| Extensión universal que «lea todos los portales» | No | Cuando existan al menos 3 conectores N2 estables |

## Definition of Done para cualquier nueva función

Issue y caso de uso, permisos revisados, riesgos documentados, ficha de fuente actualizada, comportamiento de ritmo declarado y medido, tests nuevos (incluido fallo de red y rate limit), control de error, accesibilidad, README/CHANGELOG, privacidad por defecto y demostración manual reproducible.