# Contribuir a JobScout

JobScout es local-first, sin dependencias de runtime y con permisos mínimos declarados. Antes de tocar código, lee [agents.md](agents.md), [POLITICA_DE_FUENTES.md](POLITICA_DE_FUENTES.md) y [ARQUITECTURA.md](ARQUITECTURA.md).

## Flujo

1. Abre un issue con problema reproducible, caso de uso y requisitos de privacidad.
2. Para conectores, incluye nivel propuesto (N0–N3), fuente oficial, URL de términos, fecha de revisión, alcance de autorización, restricciones y fixtures sintéticos. **API pública no significa permiso para agregar datos**.
3. Rellena la ficha de fuente en [POLITICA_DE_FUENTES.md](POLITICA_DE_FUENTES.md) antes de escribir el adaptador.
4. Haz una rama pequeña (`feat/...`, `fix/...`), añade pruebas, ejecuta `npm test` y `npm run check`.
5. Actualiza README, hoja de ruta, changelog y política de fuentes cuando cambie el alcance.
6. PR: incluye el checklist de abajo completo.

## Técnicas que requieren justificación

Ninguna está prohibida; todas necesitan una razón escrita en el PR y, si aplica, un ADR.

| Técnica | Cuándo se acepta |
| --- | --- |
| Sesión reutilizada (`credentials: include`) | Solo si la ficha del conector la declara y es imprescindible |
| Lectura de DOM (N2) | Dominio declarado, lectura mínima, sin estilos inyectados |
| Endpoint interno (N1) | Estable, de solo lectura, del mismo dominio |
| Rotación de proxies | Con evidencia de bloqueo sostenido en A0 |
| Reintentos automáticos | Siempre, con backoff exponencial y jitter |
| SDK de telemetría | Con ADR; por defecto ninguno |
| Dependencia de runtime | Con ADR; por defecto ninguna |
| Automatización de clics o postulación | Tras estabilizar N0–N2 |

## Reglas de arquitectura

- `core` puro: sin `chrome`, sin DOM, sin red.
- `core/pacing` puro con RNG y reloj inyectables: los tests de ritmo deben ser deterministas.
- Storage local, fuentes con host estricto.
- HTML externo renderizado siempre con `textContent`, nunca `innerHTML` ni `eval`.
- Todo `fetch` pasa por la capa de ritmo. Un fetch que se salte el presupuesto es un bug.
- Nada de esperas fijas: jitter gaussiano siempre.

## Checklist de PR

- [ ] Issue enlazado con caso de uso.
- [ ] Ficha de fuente rellenada (si añade o modifica un conector).
- [ ] Permisos revisados y justificados en el manifest.
- [ ] Tests nuevos, incluidos fallo de red y rate limit.
- [ ] Tests de ritmo deterministas si toca pacing.
- [ ] Comportamiento de ritmo declarado y medido.
- [ ] Accesibilidad verificada en lo que toque.
- [ ] README, changelog y roadmap actualizados.
- [ ] Capturas sin datos privados.
- [ ] Sin credenciales ni datos reales en el repo.

## Qué revisa quien mantiene

Un PR no se mergea si: introduce un fetch fuera de la capa de ritmo, añade un permiso sin justificar, rompe la pureza de `core`, mete una dependencia sin ADR, o afirma pruebas en Chrome o APIs reales que no se ejecutaron.

## Estilo

Código modular ES Modules. Variables y funciones en inglés; interfaz y documentación en español. Comentarios sobre decisiones y seguridad, no de relleno. Pocas funciones puras bien probadas antes que muchas mal cubiertas.

## Licencia

La licencia MIT aplica al código aportado; cada colaborador garantiza tener derecho a compartirlo.