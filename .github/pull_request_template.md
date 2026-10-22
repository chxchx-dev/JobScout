## Resumen

<!-- Qué cambia y por qué. Enlaza el issue. -->

## Tipo de cambio

- [ ] Corrección
- [ ] Función nueva
- [ ] Conector nuevo o modificado
- [ ] Documentación
- [ ] Ritmo / rendimiento
- [ ] Refactor

## Comprobaciones

- [ ] `npm test` / `npm run check`
- [ ] Permisos revisados y justificados en el manifest
- [ ] Ficha de fuente actualizada (si toca un conector)
- [ ] Nivel de la fuente declarado (N0–N3) y justificado
- [ ] Todo `fetch` pasa por la capa de ritmo
- [ ] Sin esperas fijas: jitter en toda petición
- [ ] Tests de ritmo deterministas (si toca pacing)
- [ ] Comportamiento de ritmo declarado; medición real anotada cuando exista
- [ ] Datos de APIs tratados como no confiables; render con `textContent`
- [ ] Fallo de red y rate limit cubiertos por tests
- [ ] Accesibilidad verificada en lo que toque
- [ ] Privacidad verificada: sin credenciales ni datos reales
- [ ] README, ROADMAP, CHANGELOG y política actualizados según corresponda
- [ ] ADR añadido (si introduce una técnica que requiere justificación)

## Evidencia

<!-- Salida de tests, capturas sin datos privados, líneas de log de trazabilidad. -->

## Pendiente tras el merge

<!-- Solo para PRs de conector: medición de ritmo en real y confirmación de nivel A. -->

## Notas para quien revisa

<!-- Riesgos, dudas, decisiones que conviene discutir. -->