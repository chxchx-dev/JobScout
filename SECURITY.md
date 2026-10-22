# Seguridad — JobScout

## Reporte responsable

Al encontrar una vulnerabilidad, **no publiques explotación o datos personales en un issue público**. Usa la opción *Report a vulnerability* en GitHub cuando el repositorio esté creado o contacta de forma privada al mantenedor. Si todavía no hay canal configurado, crea primero un canal seguro antes de compartir detalles.

## Modelo de amenaza

Se asume que ofertas y metadatos de fuentes externas no son confiables. Mitigaciones: URLs HTTPS, host fijo, `textContent`, sin HTML activo, sin JS dinámico, sin content scripts, sin cookies y redireccionamientos bloqueados en el conector. No es una garantía frente a malware del sistema, ataques del navegador o pérdida física del equipo.

## Prohibido en contribuciones

- Claves, contraseñas, cookies, CV reales, backups personales o secretos en git.
- Rastreadores, analítica sin consentimiento, scripts remotos, `eval`, cargas de código arbitrario.
- Automatización para eludir condiciones, bloqueos de cuenta, CAPTCHA, rate limits o límites de APIs.
- Solicitar `<all_urls>`, `cookies`, `scripting` u otros permisos sin revisión de necesidad y política.

## Checklist previo a release

`npm test`, `npm run check`, revisión de dependencias, inspección del manifiesto, CSP MV3, tests de seguridad de UI, pruebas en perfil limpio y auditoría de cambios en red/permisos.
