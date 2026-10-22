# ADR-0003: escaneo N2 local de enlaces de un tablero Ashby

- **Estado:** `REVIEW_REQUIRED`; desactivado por defecto.
- **Fecha:** 22 de octubre de 2026.
- **Conector:** lectura local de enlaces visibles de un único tablero Ashby autorizado.

## Contexto

El objetivo es detectar vacantes enlazadas en el tablero Ashby que la persona está mirando, sin consultar una API ni recorrer otros sitios. El escáner N2 anterior leía metadatos de una ficha individual y la opción N0 al abrir JobScout llamaba a la API; esta decisión limita los datos y elimina la consulta automática.

La página pública y la posibilidad técnica de leer su DOM no prueban por sí solas que un tercero pueda agregar sus enlaces. Se mantiene una confirmación por tablero y el escáner apagado hasta que la persona revise las condiciones del proveedor y del empleador.

## Decisión

- Admitir únicamente HTTPS en `jobs.ashbyhq.com`, con un solo slug guardado como autorización activa. El slug debe coincidir con el tablero que se está viendo; una ruta de otro tablero queda fuera del escaneo.
- Registrar dinámicamente el content script solo después de que la persona active el escáner en el listado y conceda `scripting` más el permiso opcional de ese host. El patrón de registro se limita al path del slug; el service worker valida de nuevo el slug en cada mensaje.
- En el listado, inspeccionar enlaces `<a>` que apunten a una ficha del mismo slug y leer solo su URL y el texto de un encabezado/etiqueta del enlace. En una ficha individual del mismo tablero, leer solo la URL actual y su encabezado principal.
- No leer JSON-LD, descripción, empresa, ubicación, fechas, formularios, credenciales ni cookies. No navegar a enlaces, consultar red, inyectar estilos ni modificar el sitio.
- Pausar la lectura cuando la pestaña no esté visible. Limitar cada lote a 200 enlaces; si se supera el límite, informar que el lote es parcial.
- Validar HTTPS, host, slug y ruta en el núcleo antes de crear oportunidades. Deduplicar por URL en IndexedDB y preservar estado/notas existentes.
- Desactivar mediante la retirada del content script y revocación del permiso opcional. Solo puede quedar un slug autorizado; cambiarlo exige confirmación nueva.
- Mantener `REVIEW_REQUIRED`. Cada persona confirma la revisión de condiciones antes de habilitar el tablero; una API pública o su respuesta HTTP no equivalen a autorización.
- Mantener las consultas N0 disponibles solo con la acción manual «Consultar ahora». Abrir el popup o dashboard no realiza peticiones.

## Presupuesto y almacenamiento

- Peticiones de red del conector: 0 por minuto y 0 por día.
- Datos guardados: URL y título del enlace; no se copia texto descriptivo.
- Persistencia: IndexedDB local del perfil de Chrome. No se usa `chrome.storage.session` para oportunidades, así que sobreviven el cierre y reinicio del navegador mientras no se borren los datos del perfil.
- La operación es idempotente; volver a escanear el tablero no duplica URLs ni altera estados/notas.

## Consecuencias

- Para comenzar, hay que abrir el listado del tablero de prueba, pulsar la extensión, revisar las condiciones, marcar la confirmación y conceder el permiso opcional.
- Los enlaces aparecen en el dashboard después del escaneo del DOM visible. JobScout no descubre tableros por sí mismo ni busca por internet.
- Para admitir otro portal o ATS se requiere ficha de fuente y ADR separados. No se añade `<all_urls>` ni permisos persistentes a otros dominios.
- El escaneo depende de que Ashby exponga enlaces y rótulos reconocibles en su DOM; un cambio de marcado puede impedir detectar algunos anuncios.

## Referencias

- [ADR-0001: primer escáner N2 de Ashby](ADR-0001-ashby-dom.md), supersedido en alcance.
- [ADR-0002: sincronización automática N0 al abrir JobScout](ADR-0002-ashby-auto-sync.md), supersedido.
- [Política de fuentes](../POLITICA_DE_FUENTES.md), ficha Ashby N2.
