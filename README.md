# JobScout by chxchx-dev

<p align="center"><img src="assets/jobscout-logo.svg" width="410" alt="JobScout"></p>
<p align="center">by chxchx-dev</p>

**Centro local de oportunidades laborales** · Extensión Chrome Manifest V3 · JavaScript nativo · MIT · v0.1.0

JobScout by chxchx-dev es una extensión experimental de código abierto para guardar enlaces de vacantes, consultarlas **únicamente mediante fuentes autorizadas**, clasificarlas por afinidad y realizar seguimiento manual de postulaciones. No hay cuentas, servidor, suscripción, scraping de sesiones, IA externa ni envíos automáticos.

## Identidad visual

La paleta de marca usa azul `#2563EB`, navy `#172033` y blanco `#FFFFFF`. Los iconos y logos oficiales están en `assets/` y se usan también en la interfaz y en el manifiesto de Chrome.

> **Estado:** semilla MVP funcional, no producto auditado ni extensión publicada en Chrome Web Store. Los conectores de APIs públicas están implementados pero NO vienen configurados ni activados; su uso debe revisarse para cada empleador/proveedor. Ningún diseño puede garantizar que una plataforma no imponga restricciones.

## Funciones disponibles

- Popup de Chrome: puede precargar **solo URL y título** de una pestaña compatible tras una invocación explícita (permiso `activeTab`). Para LinkedIn, Indeed, Upwork y Computrabajo exige pegar los datos manualmente, sin precargarlos ni inspeccionar su contenido.
- Dashboard completo: guarda ofertas manualmente, busca, filtra, ordena, abre la fuente original, cambia estado y registra notas privadas.
- Índice de afinidad (0–100) explicable, basado en coincidencia de roles, tecnologías, ubicación/modo remoto y fecha si la fuente la proporciona. No representa probabilidad de contratación.
- IndexedDB para vacantes; `chrome.storage.local` para preferencias y configuración; acceso a storage restringido a contextos de la extensión.
- Importación/exportación de respaldo JSON. Importaciones verificadas y fuentes importadas deshabilitadas hasta revisión.
- Adaptadores de solo lectura para tableros públicos de Ashby y Greenhouse, **solo cuando su uso esté autorizado**, con consultas manuales, sin credenciales, sin redirects, timeout, 15 min de enfriamiento por fuente y desactivación ante HTTP 401/403/429.
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
6. Abre una vacante o una página HTTPS y pulsa **JobScout by chxchx-dev**. En LinkedIn, Indeed, Upwork y Computrabajo pega manualmente URL y cargo. En otras páginas compatibles se puede precargar URL y título. Pulsa **Guardar oportunidad**.
7. Pulsa **Abrir dashboard**. Desde allí cambia el estado, filtra, registra notas, configura tus roles/tecnologías y exporta respaldos.
8. Opcional: en **Fuentes oficiales** configura un tablero Ashby/Greenhouse únicamente después de comprobar que tienes autorización para ese uso, pulsa **Consultar ahora** y revisa el resultado. El identificador del tablero es el slug público de la página del empleador, no una URL completa.

Si el popup no obtiene el título/URL en una página `chrome://`, `file://`, panel interno o pestaña sin HTTPS, escribe manualmente un enlace HTTPS válido.

## Uso básico

- **LinkedIn, Indeed, Upwork, Computrabajo:** guarda un enlace desde el popup o añádelo manualmente al dashboard. **No hay inspección del DOM, búsqueda automática, login, scraping, automatización de páginas ni envío de solicitudes**.
- **Ashby/Greenhouse:** posibilidad técnica de consulta por API oficial para tableros individuales que hayas confirmado como permitidos. Una API de lectura pública **no concede por sí sola derecho a reutilizar o agregar su contenido**. Revisa documentación, términos y autorización del empleador/proveedor.
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
│   ├── popup/                 # Guardado manual sin inyectar scripts
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
| Fuentes | Manual + API Ashby/Greenhouse bajo condiciones verificadas | Conectores aprobados individuales, RSS, importación de alertas |
| Sincronización | Bajo demanda; 15 min mínimo, por fuente | Scheduler opcional únicamente tras validación específica |
| Pruebas | Unitarias y chequeo sintáctico | E2E Chrome, IndexedDB, accesibilidad, seguridad |
| Dashboard | Gestión y respaldo | Vista de calendario y recordatorios opcionales |

La versión v0.1.0 **no busca transversalmente en todos los sitios** ni usa LinkedIn/Indeed/Upwork como fuentes automáticas: sería una afirmación engañosa. Tampoco recopila CV, datos privados de terceros, ni mensajes de usuarios.

## Seguridad y privacidad

La información permanece en el perfil local del navegador, no en un servidor de JobScout by chxchx-dev. **El almacenamiento local no está cifrado por defecto**: malware local, extensiones maliciosas, acceso al equipo o perfiles sincronizados/exportados pueden afectar la confidencialidad. No guardes contraseñas ni secretos. El uso de Chrome y los destinos externos siguen sujetos a sus propias políticas. Consulta [PRIVACY.md](PRIVACY.md) y [SECURITY.md](SECURITY.md).

## Fuentes y políticas

Revisión realizada el **21/10/2026** (no sustituye revisión futura de cambios). Lee [docs/POLITICA_DE_FUENTES.md](docs/POLITICA_DE_FUENTES.md) para la matriz y enlaces a políticas y documentación. Deshabilita un conector cuando cambien reglas, surja una alerta de abuso o el proveedor retire el permiso.

## Roadmap y participación

Consulta [docs/PASOS_PARA_FINALIZAR.md](docs/PASOS_PARA_FINALIZAR.md), [docs/ROADMAP.md](docs/ROADMAP.md), [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md), [docs/QA.md](docs/QA.md) y [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests son bienvenidas si cumplen la política anti-scraping y el principio de permisos mínimos.

**Licencia MIT.** La licencia cubre este código, no concede licencias sobre marcas, logotipos ni datos de bolsas de empleo o empleadores.

> **Nombre del proyecto:** JobScout by chxchx-dev. Antes de publicar, verifica la disponibilidad del nombre y las marcas en los mercados de destino.
