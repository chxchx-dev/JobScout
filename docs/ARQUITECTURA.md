# Arquitectura y contratos — JobScout v0.2.0

## Objetivo y límites

Extensión local-first, sin servidor ni framework. Privacidad por minimización: ninguna API de acceso a cuenta/sesión laboral salvo cuando un conector lo declare explícitamente. El producto gestiona *enlaces a vacantes* y metadatos mínimos; la postulación es manual en el sitio original.

Los conectores se organizan por niveles (N0–N3) según `docs/POLITICA_DE_FUENTES.md`. Todo recurso que roce la identidad del navegador —sesión, cabeceras, ritmo— se declara por conector y es apagable.

```mermaid
flowchart TD
  A[Usuario abre popup] --> B[Permiso temporal activeTab]
  B --> C[URL y título cuando aplica]
  C --> D[Normalizador y URL segura]
  E[Dashboard: enlace manual] --> D
  F[Dashboard: consultar fuente habilitada] --> G[Mensajería MV3]
  X[Usuario abre un tablero Ashby + opt-in explícito] --> Q
  G --> H[Service Worker: validación, límite y política de ritmo]
  H --> P[Programador por dominio: jitter, backoff, disyuntor]
  P --> I[Fuente declarada: API oficial N0 / endpoint interno N1]
  I --> J[Adaptador: esquema unificado]
  M -->|flag, un slug y permiso opcional| Q[Content script N2 Ashby: enlaces visibles]
  Q -->|solo URL y título, sin red| J
  V[Visibilidad de pestaña] --> Q
  J --> D
  D --> K[IndexedDB: oportunidades]
  K --> L[Dashboard: filtros, afinidad, estados]
  M[chrome.storage.local: preferencias, fuentes, nivel A] --> L
  M --> H
  L --> N[Usuario abre vacante original y postula manualmente]
```

## Capas

| Módulo | Responsabilidad | Prohibiciones |
|---|---|---|
| popup | Pedir opt-in/permisos para un tablero Ashby; guardar manualmente cuando no hay conector | No dispara consultas API al abrir; N2 queda apagado por defecto |
| dashboard | UI, seguimiento, respaldo, ajustes y consulta API solo tras pulsar «Consultar ahora» | No ejecutar scripts de contenido externo |
| core | Validación pura, ID por URL canonizada, matching transparente | No acceder a `chrome`, DOM, red |
| storage | IndexedDB: vacantes; storage.local: ajustes, presupuestos diarios por host y nivel A | No guardar tokens, CV ni cookies |
| sources | Adaptadores N0 y normalizador N2 de enlaces Ashby | No endpoints arbitrarios ni HTML activo |
| content | Content script dinámico N2 solo para el slug Ashby autorizado | No guardar descripciones, inyectar estilos, reescribir la página ni hacer red |
| background | Validar slug, permiso y visibilidad; consultas N0 solo por acción manual | No alarmas ni consultas automáticas; sin cookies; reintentos N0 solo con backoff y jitter |

## Contrato de oportunidad

```js
{
  id: 'url:https://...', // ID estable por URL canonicalizada
  url: 'https://...',
  title: 'Backend Engineer', company: '...',
  location: '...', description: 'texto simple y acotado',
  salaryText: 'texto de origen, sin convertir',
  remote: true | false | null,
  platform: 'Greenhouse', sourceId: 'uuid-o-manual',
  postedAt: null | 'ISO-8601',
  createdAt: 'ISO-8601', lastSeenAt: 'ISO-8601',
  status: 'new' | 'saved' | 'applied' | 'interview' | 'rejected' | 'archived',
  notes: 'texto privado'
}
```

El identificador actual elimina solo parámetros comunes de seguimiento y fragmentos, **no fusiona** anuncios parecidos de distintas URLs: hacerlo automáticamente podría borrar oportunidades diferentes.

## Cálculo de afinidad

- Coincidencia de algún título buscado: peso 35.
- Tecnologías encontradas en título/descripción: peso 35 (proporción de tecnologías objetivo halladas).
- Preferencia de modalidad remota **o** coincidencia de ubicación: peso 20 cuando existe esa preferencia.
- Fecha reciente: peso 10 cuando la fuente informa fecha.
- El denominador incluye solo criterios configurados y evaluables. La ausencia de salario **no** equivale a incumplir el salario buscado; el salario no entra en el score hasta normalización fiable.
- Las coincidencias por subcadena pueden fallar con abreviaturas, negaciones y falsos positivos. El score es una heurística y necesita explicabilidad, nunca una decisión automática de descartar.

## Política de ritmo (capa anti-ban)
El objetivo es parecer un humano aburrido. Toda la decisión es pura y vive en core/pacing; background solo ejecuta y persiste contadores.

- Esperas con jitter gaussiano. Nunca sleep fijo ni ciclo perfecto. RNG inyectable  para tests deterministas.
- Pacing por dominio, no global. El presupuesto se lleva por host; un host nunca recibe dos peticiones seguidas si hay otro esperando.
- Arranque suave. Las primeras peticiones de una sesión son lentas y suben hasta el presupuesto del nivel A.
- Backoff exponencial con jitter y tope. 401/403/429 => pausa creciente. 5xx => reintento con jitter. Nunca reintento inmediato.
- Disyuntor por dominio. N fallos consecutivos congelan ese dominio; el resto sigue. Los intervalos y fallos por minuto persisten en chrome.storage.session; el presupuesto por host de 24 horas, la cadencia y el nivel A persisten en chrome.storage.local.
- El nivel A se persiste en chrome.storage.local, nunca en memoria: sobrevive reinicios y es auditable.
- Un 429 devuelve a A0. El ascenso exige sesiones limpias acumuladas, nunca se sube a mitad de sesión.
- Pestaña oculta en N2 => actividad reducida o detenida.

## Modelo de confianza

- Contenido de URLs y respuestas de APIs = no confiable.
- JS usa textContent para valores externos, nunca innerHTML ni eval.
- URLs validadas a HTTPS, sin credenciales, al almacenar y normalizar.
- Los endpoints de consulta no son URLs libres: tienen hosts y rutas fijados por proveedor y slug validado.
- Fetch usa credentials: omit por defecto; include solo si la ficha del conector lo declara y la sesión es imprescindible.
- Redirecciones: redirect: 'follow' con verificación de que response.url mantiene el host declarado; si cambia de dominio, la respuesta se marca y se reporta.
- Límite de tiempo vía AbortSignal y tope de tamaño de respuesta.
- Permisos de host limitados a los dominios declarados en docs/POLITICA_DE_FUENTES.md; nunca <all_urls>.
- chrome.storage.local restringido a TRUSTED_CONTEXTS; IndexedDB solo disponible en origen de la extensión.
- El content script N2 de Ashby no se registra sin flag, revisión de condiciones y permisos opcionales; se limita a un slug de tablero, lee solo URL y título de enlaces visibles y no modifica la página.
- Los conectores N0 son manuales: solo consultan cuando la persona pulsa «Consultar ahora». Abrir el popup o dashboard nunca dispara una petición.

## Trazabilidad
Cada conector registra nivel, host, peticiones, códigos de respuesta, pausas aplicadas y cambios de nivel A. El log no incluye credenciales ni datos personales.

## Evolución

Al alcanzar 5.000+ ofertas estudiar paginación/cursor de IndexedDB en lugar de getAll. Antes de activar polling aprobarlo por proveedor. Para añadir nuevos ATS: crear adaptador, normalizador, revisión legal, tests de fixture, validación de host y límites de consulta. Evitar un fetch arbitrary url o proxy genérico.

Ninguna fuente sube de nivel A sin datos de trazabilidad que lo respalden. Los proxies siguen siendo escape hatch: se introducen solo si el log demuestra bloqueo sostenido en A0, y nunca como sustituto del pacing.
