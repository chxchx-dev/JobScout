# Política de fuentes, riesgos y criterios de aprobación

**Revisión inicial: 21 de octubre de 2026. Actualización N2: 22 de octubre de 2026.** Las políticas cambian: una integración se revisa antes de activarla y periódicamente. Las capacidades técnicas no implican permisos de uso. Nada de esto constituye asesoría jurídica.

## Doctrina: evasión controlada y declarada

Lo que antes se llamaba "evasión" pasa a ser decisión de diseño. Ningún recurso se usa por defecto ni por accidente: se declara en la ficha de fuente, se mide y se puede apagar. Si un recurso no está declarado, no se usa.

## Niveles de integración

- **N0 — API pública documentada.** JSON sobre HTTPS. `credentials: omit`. Sin DOM. Aprobable tras prueba técnica y ficha de fuente.
- **N1 — Endpoint interno del propio sitio.** API no documentada pero estable y de solo lectura, del mismo dominio. Cabeceras de navegador reales. `credentials: include` solo si la sesión es imprescindible y queda declarada. Requiere ADR.
- **N2 — Extracción de DOM.** `content_scripts` sobre dominio declarado, host permission acotada, lectura mínima del DOM. Requiere ADR.
- **N3 — Integración manual.** `activeTab` para leer URL y título al invocar. Sin red.

## Estados

- **REVIEW_REQUIRED** — N1/N2 sin ficha ni ADR, o licencia ambigua. Deshabilitado.
- **APPROVED** — ficha completa, prueba técnica superada, nivel de agresividad inicial asignado. Botón de pausa visible.
- **THROTTLED** — aprobado pero degradado a A0 por incidencias. Sigue funcionando.
- **BLOCKED** — restricción explícita del proveedor, o 401/403/429 persistente tras agotar el backoff.

## Ficha de fuente (obligatoria antes de habilitar)

| Campo | Contenido |
| --- | --- |
| Proveedor / empresa / propietario del contenido | |
| API o endpoint exacto | |
| Nivel (N0–N3) y justificación | |
| Términos consultados y fecha | |
| Registro o API key requeridos | |
| Finalidad declarada | agregación personal de enlaces |
| Límite declarado por el proveedor | |
| Base de autorización / atribución / redistribución | |
| Host permissions declaradas | |
| `credentials` | omit / include (justificar) |
| Override de User-Agent | no por defecto |
| Cookies / sesión | sí / no |
| Endpoint interno | sí / no |
| Proxies | no por defecto |
| Peticiones/min y peticiones/día | |
| Nivel de agresividad inicial | A0 por defecto |
| Fecha de revisión y próxima revisión | |

## Escalada y desescalada

| Nivel | Peticiones/min por host | Separación entre sincronizaciones | Reintento mínimo por tablero |
| --- | --- | --- | --- |
| A0 | 3–5 | 12–24 h | 15 min |
| A1 | 8–15 | 4–8 h | 10 min |
| A2 | 20–40 | 1–3 h | 5 min |

Ascenso: 3 sesiones limpias consecutivas, nunca a mitad de sesión. Descenso: un solo 429 o 403 devuelve a A0 de inmediato y marca THROTTLED. Recuperación escalonada, no salto directo al nivel previo.

## Reglas operativas

- GET HTTPS exclusivamente, host fijo y timeout explícito por petición.
- Redirecciones: permitidas solo si están declaradas y son del mismo dominio. En cualquier otro caso la respuesta se marca y se reporta en lugar de seguirse.
- Esperas aleatorias con jitter gaussiano, nunca fijas ni en ciclo perfecto.
- Pacing por dominio. Nunca ráfaga de arranque: las primeras peticiones van lentas y suben hasta el presupuesto.
- Disyuntor: N fallos consecutivos enfrían ese dominio; el resto sigue operando sin arrastrar el error.
- 401/403/429 => backoff exponencial con jitter y tope. Sin reintento inmediato. Sin rotar identidad en el primer error.
- Identidad: User-Agent del navegador real, sin override salvo declarado. Cabeceras coherentes con el recurso solicitado.
- Sesión: reutilizar la del navegador antes de pedir credenciales. No forzar login si ya hay sesión.
- CAPTCHA: no se resuelve, se respeta. Pausa el dominio y avisa. Si reincide, el presupuesto de esa fuente baja de forma permanente.
- Proxies: escape hatch, no requisito. Se activan solo si una fuente bloquea con A0 sostenido y hay evidencia en el log.
- Datos mínimos: título, URL, empresa, ubicación y metadatos permitidos. Evitar copiar descripciones completas.

## Sitios de cuenta

`content_scripts.matches` se declara por dominio, nunca `<all_urls>`. `activeTab` sigue reservado a N3. En N2 la lectura del DOM es mínima: solo los nodos necesarios, sin inyectar estilos, sin reescribir la página. Pestaña oculta => actividad reducida o detenida.

## Trazabilidad y auditoría local

Cada conector registra: nivel, host, peticiones emitidas, códigos de respuesta, pausas aplicadas y cambios de nivel A. El log no incluye credenciales ni datos personales.

## Gestión de incidentes

Ante bloqueo, advertencia, retirada de API, sospecha de uso indebido o cambio de términos:

1. Enfriar el dominio; no deshabilitar de golpe.
2. Si persiste tras backoff completo => THROTTLED a A0 y revisar ficha.
3. Si existe restricción explícita => BLOCKED.
4. Abrir issue `policy-review`. No compartir credenciales ni datos personales.

## Registro de fuentes

| Fuente | Nivel | Host | Credentials | Req/min | Req/24 h | Pausa | Estado | Nivel A | Última revisión |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ashby Job Postings API | N0 | `api.ashbyhq.com` | `omit` | A0: 4 | 4 por host, incluidos reintentos | Manual: suelo 15 min, solo con acción del usuario | REVIEW_REQUIRED hasta autorización por tablero | A0 por defecto | 22/10/2026 |
| Greenhouse Job Board API | N0 | `boards-api.greenhouse.io` | `omit` | A0: 4 | 4 por host, incluidos reintentos | Manual: suelo 15 min | REVIEW_REQUIRED hasta autorización por tablero | A0 por defecto | 22/10/2026 |
| Ashby: enlaces visibles de un único tablero autorizado | N2 | `jobs.ashbyhq.com` | N/A | 0 | 0 | Solo pestaña visible | REVIEW_REQUIRED; apagada por defecto | N/A, sin red | 22/10/2026 |

### Ashby N0: consulta manual de un tablero público

- **Endpoint:** `GET https://api.ashbyhq.com/posting-api/job-board/<slug>?includeCompensation=true`. El slug se valida y no se acepta una URL arbitraria. La petición usa `credentials: omit`, timeout, tamaño máximo de respuesta y manejo de 401/403/429/5xx.
- **Alcance:** solo el tablero Ashby que la persona registra y autoriza. La tarjeta permite abrir su página pública en `jobs.ashbyhq.com`; este conector devuelve resultados de la API N0. El escáner local de enlaces N2 se documenta por separado.
- **Presupuesto:** hasta 4 peticiones por host en cualquier ventana de 24 horas, contando fallos y reintentos; límite por minuto A0 de 4. Las consultas N0 requieren pulsar «Consultar ahora» y respetan el suelo existente de 15 minutos por tablero. Abrir el popup o dashboard no hace consultas automáticas.
- **Estado y datos:** desconectada por defecto; se conserva la cadencia solo para el tablero seleccionado y se puede pausar. La sincronización usa la escritura idempotente local, preservando estado y notas. Los respaldos importados dejan fuentes y sincronización desactivadas.
- **Autorización:** que el endpoint esté documentado no confirma autorización general para agregar ofertas. Ashby describe la publicación y restringe usos del servicio en sus términos; la revisión no encontró una concesión general para una extensión de terceros. Se mantiene `REVIEW_REQUIRED`; cada usuario debe comprobar condiciones del proveedor y del empleador y no activar un tablero si no puede confirmar el uso.
- **Documentación consultada (22/10/2026):** [Ashby Job Postings](https://docs.ashbyhq.com/job-postings), [Ashby Job Board Setup](https://docs.ashbyhq.com/job-board-setup) y [Ashby Customer Terms of Service](https://www.ashbyhq.com/resources/terms), §5.1. Las páginas documentan el servicio/job posting, pero no conceden por sí solas autorización general de agregación.
- **Historial:** la opción N0 automática al abrir JobScout de [ADR-0002](ADR/ADR-0002-ashby-auto-sync.md) quedó supersedida; la consulta actual es manual.

### Greenhouse N0: consultas manuales de un tablero

- **Endpoint:** `GET https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true`. El token se valida y no se acepta una URL arbitraria; la petición usa `credentials: omit`, timeout y tope de tamaño.
- **Alcance y presupuesto:** solo el tablero que la persona registra. Máximo 4 peticiones por host en ventana de 24 horas, contando fallos y reintentos; máximo 4 por minuto y suelo de 15 minutos por tablero. No tiene sincronización automática.
- **Autorización:** la documentación del Job Board API describe su uso para construir páginas de empleo, pero la consulta de la API no se toma como permiso general para agregar ofertas de terceros. El conector queda `REVIEW_REQUIRED` hasta revisar la autorización del empleador y condiciones aplicables.
- **Documentación técnica:** [Greenhouse Developer Resources — Job Board API](https://developers.greenhouse.io/), que presenta el API como herramienta para construir career pages. No se ha verificado una concesión pública de derechos para agregación personal.

### Ashby N2: enlaces locales de un tablero visible

- **Alcance:** solo el listado HTTPS del único slug que la persona activa en `https://jobs.ashbyhq.com/<slug>` y fichas de vacante del mismo slug. No visita enlaces, otros tableros, páginas de cuenta ni otros hosts.
- **Datos:** solo URL y texto de título visible en el enlace/ficha. No guarda descripción, empresa, ubicación, fecha, CV, credenciales, cookies ni datos de formularios.
- **Ejecución:** content script dinámico limitado al path del tablero después de activar el escáner, confirmar que se revisaron las condiciones del empleador/proveedor y conceder el host opcional `https://jobs.ashbyhq.com/*` más `scripting`. Solo se mantiene un slug autorizado; cambiarlo exige confirmación nueva. Sin permiso no se registra ni se inyecta el script.
- **Red y presupuesto:** no emite solicitudes; límite declarado: 0 peticiones/minuto y 0 peticiones/día. La pestaña debe estar visible. La escritura local en IndexedDB es idempotente y preserva estado y notas.
- **Autorización:** Ashby describe sus job postings y términos para clientes, pero la revisión no encontró una autorización general explícita para que una extensión de terceros agregue esos datos. Por eso permanece `REVIEW_REQUIRED`; cada usuario debe revisar también las condiciones del empleador y dejar el escáner apagado cuando no pueda confirmar ese uso.
- **Términos y documentación consultados (22/10/2026):** [Ashby Customer Terms of Service](https://www.ashbyhq.com/resources/terms), especialmente §5.1 sobre usos que interfieran o sobrecarguen el servicio; [Ashby Job Postings](https://docs.ashbyhq.com/job-postings) y [Ashby Job Board Setup](https://docs.ashbyhq.com/job-board-setup). Estos documentos no sustituyen las condiciones de cada empleador ni autorizan por sí solos la extracción.
- **ADR:** [ADR-0003: escaneo N2 de enlaces de un tablero Ashby](ADR/ADR-0003-ashby-board-links.md).
