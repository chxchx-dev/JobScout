# JobScout by chxchx-dev

<p align="center"><img src="assets/jobscout-logo.svg" width="410" alt="JobScout"></p>
<p align="center">by chxchx-dev</p>

**Centro local de oportunidades laborales** · Extensión Chrome Manifest V3 · JavaScript nativo · MIT · v0.2.0

JobScout by chxchx-dev es una extensión experimental de código abierto para guardar enlaces de vacantes, consultarlas **únicamente mediante fuentes autorizadas**, clasificarlas por afinidad y realizar seguimiento manual de postulaciones. No hay cuentas, servidor, suscripción, scraping de sesiones, IA externa ni envíos automáticos.

## Identidad visual

La paleta de marca usa azul `#2563EB`, navy `#172033` y blanco `#FFFFFF`. Los iconos y logos oficiales están en `assets/` y se usan también en la interfaz y en el manifiesto de Chrome.

> **Estado:** semilla MVP funcional, no producto auditado ni extensión publicada en Chrome Web Store. Los conectores de APIs públicas están implementados pero NO vienen configurados ni activados; su uso debe revisarse para cada empleador/proveedor. Ningún diseño puede garantizar que una plataforma no imponga restricciones.

## Funciones disponibles

- Escaneo opcional del tablero Ashby visible: toma únicamente URL y título de enlaces de vacantes del único tablero que autorizaste. No consulta APIs, no guarda descripciones ni datos de empresa/aplicación; el contenido se queda en IndexedDB local.
- Los conectores N0 de Ashby y Greenhouse solo consultan una API cuando pulsas **Consultar ahora** en el dashboard; nunca se ejecutan automáticamente al abrir JobScout.
- Popup de Chrome: en Ashby configura el escaneo automático; en sitios sin conector aprobado puede precargar **solo URL y título** tras una invocación explícita (`activeTab`). Para LinkedIn, Indeed, Upwork y Computrabajo no inspecciona contenido.
- Dashboard completo: guarda ofertas manualmente, busca, filtra, ordena, abre la fuente original, cambia estado y registra notas privadas.
- Índice de afinidad (0–100) explicable, basado en coincidencia de roles, tecnologías, ubicación/modo remoto y fecha si la fuente la proporciona. No representa probabilidad de contratación.
- IndexedDB para vacantes; `chrome.storage.local` para preferencias y configuración; acceso a storage restringido a contextos de la extensión.
- Importación/exportación de respaldo JSON. Importaciones verificadas y fuentes importadas deshabilitadas hasta revisión.
- Adaptadores de solo lectura para tableros públicos de Ashby y Greenhouse, **solo cuando su uso esté autorizado**, con consulta manual, sin credenciales ni llamadas al abrir JobScout; aplican timeout, enfriamiento por fuente y máximo de 4 peticiones por host cada 24 horas.
- Pruebas unitarias puras con Node, sin dependencias de npm.

## Requisitos

- Chrome reciente, versión 114 o superior.
- Node.js 22+ **solo para ejecutar pruebas**. La extensión no necesita Node ni npm para funcionar.
- Sin build, sin Docker, sin API keys.

## Instalar localmente (2–5 minutos, sin compilación)

1. Si descargaste un ZIP, descomprímelo.
2. Abre Chrome en `chrome://extensions`.
3. Activa **Modo desarrollador**.
4. Pulsa **Cargar descomprimida** y selecciona la carpeta del proyecto que contiene `manifest.json` (no el ZIP ni la carpeta `src`).
5. Fija la extensión desde el icono de extensiones.
6. Abre el listado del tablero Ashby que estás probando y pulsa **JobScout by chxchx-dev**. Confirma que revisaste las condiciones del tablero y activa el permiso opcional. Desde entonces solo se leen URL y títulos visibles de enlaces de ese tablero; el dashboard los guarda localmente. Para cambiar a otro tablero, debes autorizarlo desde su listado.
7. En sitios sin escáner aprobado, el popup conserva el guardado manual o la precarga de URL/título cuando el sitio lo permite.
8. Pulsa **Abrir dashboard**. Desde allí cambia el estado, filtra, registra notas, configura tus roles/tecnologías y exporta respaldos.
9. En **Fuentes oficiales** puedes registrar tableros Ashby o Greenhouse. La API solo se consulta tras pulsar **Consultar ahora** y comprobar que su uso está autorizado. Para detectar enlaces en una página Ashby, no hace falta una API: abre el listado del único tablero permitido y activa el escaneo desde el popup.

Si el popup no obtiene el título/URL en una página `chrome://`, `file://`, panel interno o pestaña sin HTTPS, escribe manualmente un enlace HTTPS válido.

## Uso básico

- **Ashby:** el escaneo N2 revisa solo enlaces del tablero visible que autorizaste, guarda URL y título y no consulta la red. El conector N0 permanece manual y solo hace una petición cuando eliges **Consultar ahora**. El escáner requiere opt-in, permiso opcional y revisión de las condiciones del tablero; no lee descripciones, cuentas ni formularios.
- **Greenhouse:** consulta manual por API para tableros individuales, solo tras comprobar autorización. Una API pública **no concede por sí sola derecho a reutilizar o agregar su contenido**.
- **LinkedIn, Indeed, Upwork, Computrabajo y otros portales:** no hay escaneo automático; pueden guardarse manualmente. No hay login, automatización de postulaciones ni envío de solicitudes.
- **Otras bolsas:** el sistema admite enlaces HTTPS de cualquier portal. La creación de conectores requiere autorización y revisión de políticas.

## Comandos de desarrollo

```bash
npm test       # Pruebas de lógica, sin instalar dependencias
npm run check  # Revisión sintáctica y permisos MV3
```

Ejecuta los comandos desde la carpeta del proyecto. Para aplicar cambios en los scripts, abre `chrome://extensions` y pulsa **Recargar** en JobScout. La actualización conserva vacantes, preferencias y respaldos anteriores. Antes de desinstalar, exporta respaldo: desinstalar o borrar el perfil de Chrome puede eliminar los datos locales.

## Estructura

```text
JobScout/
├── manifest.json
├── assets/                    # Iconos y logos locales de JobScout
├── src/
│   ├── background/            # Mensajería, control de consultas (MV3 service worker)
│   ├── core/                  # Modelo, validación, deduplicación exacta, scoring
│   ├── dashboard/             # UI en una pestaña propia (HTML/CSS/JS)
│   ├── popup/                 # Configuración de escaneo y guardado manual de respaldo
│   ├── content/               # Content script N2 dinámico de Ashby, solo con permiso
│   ├── sources/               # Adaptadores de APIs oficiales
│   └── storage/               # IndexedDB + chrome.storage.local
├── tests/                     # Pruebas Node
├── scripts/                   # Revisión de sintaxis
├── docs/                      # Arquitectura, políticas, roadmap, QA
├── .github/workflows/         # CI básica
├── CONTRIBUTING.md
├── SECURITY.md
├── PRIVACY.md
└── LICENSE
```

## Decisiones y límites actuales

| Tema | MVP v0.1.0 | Pendiente |
|---|---|---|
| Almacenamiento | Local: IndexedDB / chrome.storage.local; migración desde versión anterior | Cifrado opcional del respaldo y futuras migraciones de esquema |
| Duplicados | Igual URL canonicalizada, sin parámetros de seguimiento | Detección semántica multiportal, con revisión humana |
| Matching | Palabras clave explicables; fecha solo si consta | Sinónimos, experiencia, penalizaciones explicables |
| Salario | Preferencia y salario textual visibles | Conversión de moneda/período con fuentes verificadas |
| Fuentes | Escaneo Ashby opt-in + manual + API Ashby/Greenhouse bajo condiciones verificadas | Conectores aprobados individuales, RSS, importación de alertas |
| Sincronización | Bajo demanda; 15 min mínimo, por fuente | Scheduler opcional únicamente tras validación específica |
| Pruebas | Unitarias y chequeo sintáctico | E2E Chrome, IndexedDB, accesibilidad, seguridad |
| Dashboard | Gestión y respaldo | Vista de calendario y recordatorios opcionales |

La versión actual **no busca transversalmente en todos los sitios**: el escaneo sin API solo cubre el tablero Ashby visible cuyo slug autorizaste desde el popup. No usa LinkedIn/Indeed/Upwork como fuentes automáticas ni recopila CV, datos de formularios o mensajes.

## Seguridad y privacidad

La información permanece en el perfil local del navegador, no en un servidor de JobScout by chxchx-dev. **El almacenamiento local no está cifrado por defecto**: malware local, extensiones maliciosas, acceso al equipo o perfiles sincronizados/exportados pueden afectar la confidencialidad. No guardes contraseñas ni secretos. El uso de Chrome y los destinos externos siguen sujetos a sus propias políticas. Consulta [PRIVACY.md](PRIVACY.md) y [SECURITY.md](SECURITY.md).

## Fuentes y políticas

Revisión realizada el **21/10/2026** (no sustituye revisión futura de cambios). Lee [docs/POLITICA_DE_FUENTES.md](docs/POLITICA_DE_FUENTES.md) para la matriz y enlaces a políticas y documentación. Deshabilita un conector cuando cambien reglas, surja una alerta de abuso o el proveedor retire el permiso.

## Roadmap y participación

Consulta [docs/PASOS_PARA_FINALIZAR.md](docs/PASOS_PARA_FINALIZAR.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md), [docs/QA.md](docs/QA.md) y [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests son bienvenidas si cumplen la política anti-scraping y el principio de permisos mínimos.

**Licencia MIT.** La licencia cubre este código, no concede licencias sobre marcas, logotipos ni datos de bolsas de empleo o empleadores.

> **Nombre del proyecto:** JobScout by chxchx-dev. Antes de publicar, verifica la disponibilidad del nombre y las marcas en los mercados de destino.
