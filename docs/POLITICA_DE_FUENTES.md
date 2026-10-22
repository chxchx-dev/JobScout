# Política de fuentes, riesgos y criterios de aprobación

**Revisión inicial: 21 de octubre de 2026.** Las políticas cambian: una integración se revisa antes de activarla y periódicamente. Las capacidades técnicas no implican permisos de uso. Nada de esto constituye asesoría jurídica.

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

| Fuente | Nivel | Host | Credentials | Req/min | Pausa | Estado | Nivel A | Última revisión |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |