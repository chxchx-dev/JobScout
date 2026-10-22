# Plan de validación / aceptación

Regla general: una casilla se marca con evidencia reproducible. Sin evidencia (línea de log, captura, salida de consola), la prueba queda como no ejecutada.

## Automática (Node 22+)

```bash
npm test
npm run check
```

Cubre validación de URLs, deduplicación por URL, rechazo de esquemas inseguros, matching, salario no inferido, adaptadores API y extracción pura de enlaces Ashby. **No cubre E2E ni la base IndexedDB real**: añadir esas pruebas antes de publicar.

## Automática de ritmo (con reloj y RNG inyectados)

El pacing es función pura, así que se prueba sin esperar en tiempo real. Estos tests deben ser deterministas.

1. Con RNG y reloj inyectados, verificar que las esperas siguen una distribución con jitter y no un valor fijo.
2. Repetir la misma secuencia y comprobar que no existe ciclo periódico exacto en los intervalos.
3. Verificar que el backoff crece exponencialmente ante 401/403/429 y que respeta el tope superior.
4. Verificar que 5xx reintenta con jitter y que 429 no reintenta de inmediato.
5. Verificar que el disyuntor abre tras N fallos y que enfriar un dominio no altera el estado de los demás.
6. Verificar que el presupuesto por dominio nunca se excede, incluso con cola llena.
7. Verificar que un 429 devuelve el nivel A a A0 y marca THROTTLED, y que el ascenso exige sesiones limpias acumuladas.
8. Auditar que ningún fetch del proyecto se ejecuta fuera de la capa de ritmo.

## Manual, Chrome MV3

1. Instala vía `chrome://extensions` y confirma que no aparezcan errores de manifiesto/service worker.
2. Abre un listado Ashby sin habilitar el escáner: no debe registrarse ni inyectarse el content script. Actívalo desde el popup, confirma las condiciones de ese tablero y concede el host opcional; verifica que solo queda autorizado ese slug y que aparecen sus enlaces en el dashboard. Otros slugs y dominios no deben procesarse.
3. Oculta la ventana antes de cargar o cambiar el listado: no debe guardarse nada hasta que la pestaña vuelva a estar visible. Repite el escaneo y comprueba que no duplica enlaces ni modifica estado o nota. Confirma que solo se guardan URL y título, sin descripción, empresa ni ubicación.
4. Guarda un enlace, ve a dashboard y comprueba que aparece; guarda de nuevo con `utm_source`, debe identificarse como el mismo.
5. Guarda 20 ofertas de distintos dominios. Verifica que filtros de estado/plataforma/texto y orden funcionan.
6. Cambia una oferta a «Postulada», escribe nota, recarga dashboard: el estado/nota persisten.
7. Configura roles/tecnologías: valida orden y razones del score, y que salario no modifique score.
8. Exporta backup, guarda en lugar seguro e importa en otra instalación de pruebas: estados/notas se restauran; fuentes quedan inactivas y el escáner automático sigue apagado.
9. Actualiza una instalación con datos previos a JobScout: comprueba que vacantes, estados, notas, preferencias, tiempos de consulta y nivel A de cada fuente se migran; importa además un respaldo anterior.
10. Intenta guardar `javascript:`, `http:`, `file:` y URL con credenciales: deben rechazarse.
11. Registra tablero Ashby/Greenhouse **solo cuando haya permiso comprobado y ficha de fuente rellenada.** Abrir popup/dashboard no debe realizar llamadas API. En el tablero Ashby autorizado, verifica que el escáner N2 no emite solicitudes de red y solo procesa el slug confirmado. Las API N0 se prueban exclusivamente con **Consultar ahora** y respetan presupuesto/backoff. Desactiva el escáner y verifica que se retiran registro y permiso.
12. Pulsa consultar dos veces dentro del presupuesto: la segunda debe respetar el ritmo, no dispararse de inmediato. Con respuestas falsas/mock 401/403/429: backoff aplicado y degradación a A0, sin desactivación inmediata. Repite hasta 4 peticiones por host en una ventana de 24 h y verifica que una adicional se difiere hasta que se libere presupuesto.
13. Cierra y reabre Chrome: preferencias y ofertas persisten.
14. Recarga la extensión con el service worker ya activo: los contadores de presupuesto y el nivel A deben sobrevivir. Si vuelven a cero, el pacing no está persistido.
15. Abre el log de trazabilidad y comprueba que permite reconstruir por qué se aplicó cada pausa: host, nivel, peticiones y código de respuesta.
16. Con una fuente en N2, oculta la pestaña y verifica que la actividad se reduce o se detiene.
17. Fuerza un CAPTCHA o simúlalo: la fuente se pausa y avisa, sin intento de resolución. Al reincidir, el presupuesto baja de forma permanente.
18. Deja la extensión operando y revisa el log a posteriori: los intervalos entre peticiones al mismo host no deben ser constantes.
19. Desinstala solo en un **perfil desechable** para comprobar que los datos de ese perfil pueden perderse. Nunca probar sin respaldo.

## Riesgos a cubrir antes de una versión estable

- Cuotas y acceso concurrente a IndexedDB en múltiples pestañas.
- Contadores de ritmo compartidos entre pestañas: dos pestañas no deben duplicar el presupuesto del mismo host.
- Temporizadores en service worker dormido: verificar que la suspensión no rompe ni reinicia el backoff.
- Corrupción por apagados, versiones futuras y migraciones.
- Casos Unicode, IDs largos y URLs con querystring significativo.
- Simulaciones de XSS en títulos/notas/respuestas JSON; el DOM no debe ejecutar código.
- Network disconnect, API lento, payload gigante, JSON malformado, cambio de esquema.
- Tableros >200 trabajos: aviso visible o paginación, no conteo engañoso.
- Ashby N2 limita cada lote a 200 enlaces; confirmar el aviso de parcialidad cuando el DOM supera ese máximo.
- Cambios del marcado/SPA de Ashby: si no hay encabezados o enlaces reconocibles, no almacenar datos dudosos ni recorrer otras páginas.
- Importación de archivo estructuralmente malicioso y source config falsificada.
- A11y: teclado, diálogos, ARIA, foco y contraste.
- Confirmar que no hay `cookies`, `webRequest` ni `<all_urls>`; el único content script dinámico permitido es Ashby N2, registrado tras el opt-in y limitado a `jobs.ashbyhq.com`.

**No publicado para Chrome Web Store; no se han ejecutado pruebas con proveedores externos en esta entrega.**
