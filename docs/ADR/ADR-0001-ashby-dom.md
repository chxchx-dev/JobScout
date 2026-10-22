# ADR-0001: escaneo N2 de ofertas Ashby

- **Estado:** alcance supersedido por [ADR-0003](ADR-0003-ashby-board-links.md); se conserva como registro histórico del primer escáner N2.
- **Fecha:** 22/10/2026.
- **Conector:** captura local de una ficha individual abierta por la persona usuaria.

## Contexto

El flujo manual obliga a copiar cargo y enlace. Se quiere guardar una oferta al abrirla, pero N2 implica leer DOM y exige permiso por sitio, una ficha de política y un ADR. La revisión de Ashby confirma que ofrece job boards públicos y regula el uso de su servicio por clientes; no confirma una autorización general para que una extensión de terceros extraiga y agregue ofertas. La autorización queda sin resolver y se conserva como condición de activación individual.

## Decisión

- Permitir únicamente `https://jobs.ashbyhq.com/*`, nunca `<all_urls>` ni subdominios comodín.
- Usar content script dinámico, registrado tras la activación explícita, mediante el permiso opcional `scripting` y el host opcional de Ashby. Al desactivar, retirar registro y permisos.
- Ejecutar solo en fichas individuales HTTPS visibles, abiertas por la persona usuaria. No recorrer resultados, observar red, consultar APIs, usar sesión ni procesar formularios.
- Guardar localmente URL, cargo, empresa, ubicación y fecha/modalidad si están disponibles. Omitir descripción y datos de aplicación.
- Validar otra vez URL, host, frame y estado de activación en el service worker. La mensajería no es una fuente confiable.
- Deduplicar por URL con IndexedDB; preservar estado y notas existentes. Un error de esquema no guarda la página.
- Mantener la fuente `REVIEW_REQUIRED`: la activación pide que el usuario confirme que revisó las condiciones de Ashby y del empleador. Si no puede confirmar el uso, debe dejarla apagada.

## Presupuesto y seguridad

- Solicitudes de red: 0 por minuto y 0 por día. No hay `fetch` del conector.
- Datos: únicamente la oferta pública que está abierta; todo permanece en IndexedDB local.
- No se ejecuta en pestañas ocultas. No modifica la página ni introduce CSS.
- El permiso del navegador queda acotado al host de Ashby y puede revocarse desde el popup o desde Chrome.

## Consecuencias

Ashby es la primera fuente con guardado automático. No se afirma que el escáner sea compatible con todos los empleadores ni que los términos revisados autoricen automáticamente la agregación. Para admitir otra bolsa se necesita una ficha y un ADR separados.

## Fuentes revisadas

- [Ashby Customer Terms of Service](https://www.ashbyhq.com/resources/terms), §5.1.
- [Ashby Job Postings](https://docs.ashbyhq.com/job-postings).
- [Ashby Job Board Setup](https://docs.ashbyhq.com/job-board-setup).
- [Chrome: Declare permissions](https://developer.chrome.com/docs/extensions/mv3/declare_permissions).
- [Chrome: Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
