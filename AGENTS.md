# Instrucciones de desarrollo para asistentes de código

Trabaja como ingeniero senior especialista en MV3, JavaScript sin dependencias y seguridad de extensiones. El repositorio **ya contiene un MVP instalable**; primero lee README, docs/ARQUITECTURA.md, docs/POLITICA_DE_FUENTES.md, docs/QA.md y docs/ROADMAP.md.

## Principio rector

El bot debe parecer un humano aburrido, no un script apurado. Ante la duda entre "más rápido" y "más creíble", elegir creíble. La agresividad se gana con presupuesto y camuflaje, nunca con paralelismo bruto.

## Reglas innegociables

1. **Fuentes por niveles, no por prohibición.** Cada conector declara su nivel y respeta su contrato:
   - **N0 — API pública documentada**: JSON, `credentials: omit`, sin DOM.
   - **N1 — Endpoint interno del propio sitio** (API no documentada pero estable): cabeceras de navegador real, `credentials: include` solo si hay sesión declarada.
   - **N2 — Extracción de DOM**: exige `content_scripts` + host permission acotada a ese dominio.
   - **N3 — Integración manual**: el usuario pega enlace/título; sin red.
   Solo N0 y N3 están habilitados por defecto. N1 y N2 se habilitan por conector con ADR y quedan detrás de un flag explícito.
2. **Permiso ≠ licencia.** API pública no implica autorización de uso. Antes de habilitar un conector, documentar alcance, límite declarado por el proveedor y condiciones en `docs/POLITICA_DE_FUENTES.md`. Sin esa entrada, la fuente queda apagada.
3. **Mínimos permisos, no mínimos absolutos.** Manifest V3 obligatorio. `content_scripts` y host permissions solo para dominios declarados, nunca `<all_urls>`. `cookies`, `scripting` y `webRequest` solo con necesidad demostrada. Sin código remoto.
4. **Sin dependencias nuevas sin ADR.** Nada de servicios, frameworks, APIs de IA ni telemetría sin ADR y justificación aprobados.
5. **Núcleo puro.** `src/core` sin DOM, Chrome APIs ni red. Modelos validados, URL HTTPS, `textContent` al renderizar datos externos. `credentials: omit` por defecto; `include` solo en conectores N1/N2 con sesión declarada en su ADR.
6. **Datos.** Oportunidades y notas solo en IndexedDB; preferencias en `chrome.storage.local` protegido. Nunca credenciales de portales ni CV.
7. **El humano manda.** Nunca cambiar estado ni nota automáticamente. Conservar estado/nota al resincronizar.
8. **Pruebas antes de tocar lógica.** Leer tests existentes primero. Añadir fixtures, fallos de red, esquemas maliciosos, rate limits y normalización de URL. `npm test` y `npm run check` en verde antes de commit.
9. **Documentar en cada PR.** Changelog, guía, riesgos y checklist QA actualizados. No afirmar pruebas en Chrome o APIs reales si no se realizaron.

## Contrato anti-ban

Obligatorio en todo conector con red. Un conector que no lo cumple no se habilita.

- **Nada de `sleep` fijos.** Esperas aleatorias con distribución gaussiana, nunca uniforme, nunca en ciclo perfecto.
- **Pacing por dominio, no global.** Un mismo host no recibe dos peticiones seguidas si puede evitarse. El paralelismo se limita por host, no por total.
- **Backoff exponencial con jitter.** 401/403/429 => pausa creciente con tope superior. 5xx => reintento con jitter. Nunca reintento inmediato.
- **Disyuntor por dominio.** Tras N fallos consecutivos, ese dominio se enfría y el resto sigue trabajando sin arrastrar el error.
- **Arranque suave.** Las primeras peticiones de una sesión van lentas y suben progresivamente hasta el presupuesto. Nunca ráfaga inicial.
- **Cabeceras coherentes.** User-Agent real del navegador que ejecuta la extensión, `Accept` y `Accept-Language` propios del recurso, `Referer` cuando el sitio lo espere. Sin UA inventados ni combinaciones imposibles.
- **Sesión reutilizada.** Aprovechar la sesión natural del navegador antes de pedir credenciales. No forzar login si el sitio ya está logueado.
- **CAPTCHA es señal, no reto.** Si aparece, no se resuelve: se pausa ese dominio y se avisa al usuario. Si reaparece, el presupuesto de esa fuente baja de forma permanente.
- **Presupuesto explícito.** Cada conector declara peticiones/minuto y peticiones/día, y los respeta aunque sobren ganas.
- **Pestaña oculta = pausa.** En N2, si la pestaña no está visible, reducir o detener la actividad. Es lo que haría un humano.
- **Horario creíble.** Espaciar sincronizaciones; evitar ciclos 24/7 si no aportan.

## Niveles de agresividad

Configurables por conector, nunca globales. Se sube de nivel solo tras N sesiones limpias, jamás a mitad de sesión.

| Nivel | Peticiones/min por dominio | Pausa entre sincronizaciones | Cuándo usarlo |
| --- | --- | --- | --- |
| A0 Conservador | 3–5 | 12–24 h | fuente nueva, sin historial |
| A1 Equilibrado | 8–15 | 4–8 h | fuente validada sin incidencias |
| A2 Agresivo controlado | 20–40 | 1–3 h | fuente tolerante y con backoff probado |

Regla de ascenso: 3 sesiones sin 429/403/captcha => subir un nivel. Un solo 429 => bajar de inmediato.

## Orden de prioridades

1. Verificar instalación y flujos E2E en Chromium con perfil desechable.
2. Añadir pruebas de persistencia, deduplicación y estados.
3. Mejorar avisos de truncamiento, accesibilidad, errores y auditoría local.
4. Implementar el contrato anti-ban en el primer conector N1 y medirlo en real.
5. Documentar permisos de tableros individuales antes de conectar más ATS.
6. No ampliar fuentes hasta cerrar los criterios de aceptación de la fase 1.

## Convenciones

Código modular ES Modules, variables y funciones en inglés, interfaz y docs en español, comentarios sobre decisiones y seguridad, sin comentarios de relleno. Preferir pocas funciones puras bien probadas. Toda función que envía peticiones debe declarar límite, validación, manejo de error y política de backoff.