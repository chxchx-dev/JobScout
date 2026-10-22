# ADR-0002: sincronización opt-in de un tablero Ashby al abrir JobScout

- **Estado:** `SUPERSEDED` por ADR-0003. La sincronización automática N0 al abrir JobScout fue retirada; el botón manual «Consultar ahora» queda fuera de este ADR.
- **Fecha:** 22/10/2026.
- **Conector:** Ashby Job Postings API N0, para un único tablero configurado por la persona usuaria.

## Contexto

El flujo esperado es registrar un tablero de prueba una vez y guardar sus ofertas en JobScout sin copiar cada enlace. El proyecto ya cuenta con un adaptador N0 para Ashby; no hace falta leer el DOM del tablero ni añadir permisos de host.

La documentación de Ashby describe el API y la publicación de ofertas, pero no establece una autorización general para que una extensión de terceros agregue ofertas. La automatización no se debe presentar como autorizada por el mero hecho de que el API sea público.

## Decisión

- Añadir una opción separada y apagada por defecto en la tarjeta de cada tablero Ashby.
- Permitir que solo un tablero Ashby tenga la opción activa. Su página pública se abre desde la misma tarjeta.
- Iniciar la consulta solo al abrir el popup o el dashboard de JobScout, si el tablero sigue habilitado y se han cumplido 12 horas desde el intento previo.
- No usar `chrome.alarms`, polling, ni consultas con la interfaz de JobScout cerrada.
- Reutilizar el endpoint fijo N0 y `credentials: omit`; no aceptar URLs libres ni leer el DOM, cookies o formularios.
- Aplicar un máximo de cuatro peticiones por host en cualquier ventana de 24 horas, contando intentos fallidos y reintentos. Mantener además el pacing por minuto, el suelo de consulta manual y el backoff existentes.
- Guardar resultados en IndexedDB mediante upsert, conservando estado y notas. La importación de respaldos no reactiva fuentes ni esta opción.
- Mantener el estado `REVIEW_REQUIRED`. La activación exige que el usuario configure el tablero y confirme que revisó sus condiciones y autorización. Si no puede verificarlo, la opción debe permanecer apagada.

## Consecuencias

- El primer uso requiere configurar un tablero y activar explícitamente la sincronización; las oportunidades posteriores aparecen al abrir JobScout, con el límite indicado.
- La función sincroniza solo el tablero Ashby seleccionado. No es un buscador universal ni activa Greenhouse, LinkedIn, Indeed u otros portales.
- La consulta automática depende de una apertura de la interfaz y no funciona como tarea continua mientras el navegador está cerrado.
- Una autorización por usuario no sustituye la revisión de los términos del proveedor y del empleador.

## Fuentes revisadas

- [Ashby Job Postings](https://docs.ashbyhq.com/job-postings).
- [Ashby Job Board Setup](https://docs.ashbyhq.com/job-board-setup).
- [Ashby Customer Terms of Service](https://www.ashbyhq.com/resources/terms), §5.1.
