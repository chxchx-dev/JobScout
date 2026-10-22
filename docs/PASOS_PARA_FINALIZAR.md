# Guía de finalización — de semilla a extensión publicable

## 0. Qué se recibe y qué NO

El repositorio incluye código de un MVP instalable sin build, pruebas unitarias (Node), manifiesto Chrome MV3, dashboard y dos adaptadores de APIs oficiales. No incluye cuentas/API keys, fuentes laborales preconfiguradas, permiso de empleadores ni prueba E2E completa en Chrome. Tampoco promete evitar 100% restricciones de sitios.

Las fuentes se organizan por niveles (N0–N3) según [POLITICA_DE_FUENTES.md](POLITICA_DE_FUENTES.md). Solo N0 y N3 llegan habilitables; N1 (endpoint interno) y N2 (lectura de DOM) se activan con ficha y ADR. Ninguna fuente arranca por encima del nivel de agresividad A0.

## 1. Instala la semilla — 21/10/2026

1. Si recibiste un ZIP, descomprímelo.
2. Abre la carpeta del proyecto y comprueba que `manifest.json` está en su raíz.
3. Abre `chrome://extensions` en Chrome, activa modo desarrollador.
4. Carga la carpeta del proyecto que contiene `manifest.json` como extensión descomprimida.
5. En una página HTTPS, abre el popup y guarda una oportunidad ficticia de `https://example.org/jobs/prueba` con título `Backend Engineer`.
6. Abre el dashboard y comprueba el registro, filtros y persistencia tras recargar.
7. En portales no declarados, copia manualmente URL y título; la extensión NO debe rellenarlos automáticamente. La lectura de página solo se espera en dominios declarados como N2.

**No ejecutes pruebas contra cuentas reales todavía.**

## 2. Comprueba seguridad y calidad — 22–25/10/2026

```bash
node --version         # Node 22 o superior
npm test
npm run check
```

Inspecciona `chrome://extensions` → JobScout → service worker → *Inspeccionar*. Si hay errores, documenta versión de Chrome, pasos, consola y archivos relevantes (elimina datos personales). Ejecuta manualmente [QA.md](QA.md), incluyendo copia de seguridad, estados y notas.

**Cierre:** 20 URLs guardadas sin duplicados, export/import operativos, sin peticiones a plataformas no declaradas, ni inyección de scripts. Añade prueba E2E automatizada a futuro.

**Prueba obligatoria de persistencia del ritmo:** recarga la extensión con el service worker ya iniciado y confirma que los contadores de presupuesto sobreviven. Si se reinician a cero, el pacing no está persistido y parecerás bot tras cada reinicio.

## 3. Revisa cada fuente oficial — 26–31/10/2026

- Ashby: tablero visible como `https://jobs.ashbyhq.com/<JOB_BOARD_NAME>`; API documentada `https://api.ashbyhq.com/posting-api/job-board/<JOB_BOARD_NAME>`. Nivel N0.
- Greenhouse: tablero con token; API GET `https://boards-api.greenhouse.io/v1/boards/<TOKEN>/jobs`.
- **No uses un tablero automáticamente porque responda HTTP 200.** Debes documentar si el proveedor/empleador permite este uso externo, límites, finalidad y atribución. Si no se confirma, déjalo manual.
- Rellena la ficha de fuente de POLITICA_DE_FUENTES.md antes de habilitar nada. Sin ficha, la fuente queda en REVIEW_REQUIRED.
- En **Fuentes oficiales**, agrega el tablero específico, acepta la declaración de revisión y pulsa «Consultar ahora» una sola vez. 
- El sistema arranca en A0: pocas peticiones por minuto, arranque suave y mínimo de 15 minutos entre reintentos del mismo tablero.
- HTTP 401/403/429 => backoff exponencial con jitter, no desactivación inmediata. Si persiste tras agotar el backoff, la fuente pasa a THROTTLED. Solo pasa a BLOCKED si existe restricción explícita del proveedor.
- Los portales laborales grandes (LinkedIn, Indeed, Upwork, Computrabajo) dejan de estar vetados: son candidatos a N1 o N2, nunca obligatorios. Cada uno se evalúa por separado y se puede apagar sin afectar al resto.

## 4. Mide antes de acelerar — semana del 26/10/2026

No subas de nivel porque "va rápido". Sube porque hay evidencia.
1. Ejecuta la fuente en A0 durante 3 sincronizaciones completas.
2. Revisa el log de trazabilidad: códigos de respuesta, pausas aplicadas, peticiones emitidas.
3. Si no hubo ni un 429 ni un 403 ni CAPTCHA en las 3 sesiones, asciende un nivel.

Nivel |	Peticiones/min por host | Sincronización | Reintento mínimo |
A0 | 3–5 | 12–24 h | 15 min |
A1 | 8–15 | 4–8 h | 10 min |
A2 | 20–40 | 1–3 h | 5 min |

Reglas de movimiento:

- Ascenso solo tras sesiones limpias acumuladas, nunca a mitad de sesión.
- Un solo 429 o 403 devuelve la fuente a A0 de inmediato y la marca THROTTLED.
- Recuperación escalonada: se vuelve a subir sesión a sesión, no de golpe al nivel anterior.
- Si una fuente bloquea incluso en A0, primero baja el presupuesto; solo entonces considera un proxy, y nunca como sustituto del pacing.

## 5. Prepara GitHub público — semana del 26/10/2026

1. Comprueba la disponibilidad de JobScout by chxchx-dev en los mercados de destino. Una búsqueda en Internet no equivale a autorización marcaria.
2. En GitHub crea un repositorio vacío con la denominación elegida; no introduzcas credenciales ni información personal.
3. Desde el directorio raíz:

```bash
git init
git branch -M main
git add .
git commit -m "feat: initial JobScout local-first MV3 extension"
# Crea el repositorio vacío desde GitHub y copia SU URL exacta:
git remote add origin <URL_REAL_DEL_REPOSITORIO>
git push -u origin main
```

4. Revisa GitHub Actions, Security, licencia, README, plantillas de issues y contributor guidelines.
5. Añade capturas **reales** tomadas del dashboard probado y un CHANGELOG de la siguiente versión. Nunca uses capturas con nombres, correos o notas reales.

## 6. Completa el producto — noviembre 2026

Prioridad: pruebas E2E en Chrome; tests IndexedDB; tests deterministas de jitter, backoff y disyuntor con RNG inyectable; accesibilidad y rendimiento; migraciones de backup; errores de red y límites API; gestión de autorizaciones y nivel A por fuente; mejores filtros; deduplicación asistida; alertas/feeds autorizados. **No desarrollar un conector nuevo sin cumplir la política de fuentes.**

## 7. Antes de Chrome Web Store

- Confirmar que el nombre y activos no infringen marcas; revisar políticas de la Chrome Web Store y declaración de permisos.
- Política de privacidad pública coherente con comportamiento real; captura de pantalla y ficha sin claims engañosos.
- Auditoría manual de manifest: `content_scripts` solo en dominios declarados y nunca `<all_urls>`, sin código remoto y sin permisos no justificados.
- Revalidar términos de Ashby/Greenhouse y autorizaciones individuales; desactivar integración dudosa.
- Pruebas en perfil de Chrome limpio, red real solo en tableros autorizados y casos de falla.
- Release etiquetado y empaquetado sin datos reales; validación de integridad del ZIP.

**Criterio de aceptación de release:** evidencia reproducible de funcionamiento del flujo manual, de las validaciones de seguridad y del comportamiento de ritmo observado en al menos una fuente. Si no existe, seguir etiquetando el software como MVP experimental.
