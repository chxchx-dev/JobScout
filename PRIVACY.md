# Política técnica de privacidad — versión local

JobScout v0.2.0 no crea cuentas ni opera servidores de usuario. El guardado manual almacena únicamente campos introducidos o confirmados por el usuario y URL/título de la pestaña activa obtenidos mediante el permiso temporal `activeTab`. JobScout no envía el historial ni las notas del usuario a proveedores externos.

Esta política describe **el código incluido**, no las prácticas propias de Chrome ni de los portales de empleo que abras externamente.

## Almacenamiento

- Vacantes y notas: IndexedDB del perfil de Chrome.
- Preferencias, configuración de fuentes y nivel de agresividad: `chrome.storage.local`, restringido a contextos confiables.
- Contadores de ritmo y estado de disyuntor: almacenamiento de sesión, para sobrevivir a la suspensión del service worker.
- Nada sale del perfil salvo las peticiones GET descritas más abajo.

## Sin cifrado por defecto

Cualquier actor con acceso suficiente al perfil o al dispositivo puede leer los datos. Los archivos de respaldo contienen información personal en texto JSON plano. Cifrar el respaldo queda como mejora futura, no como garantía actual.

## Sin telemetría

No se integran trackers, analytics, publicidad, SDKs externos ni código remoto. El log de trazabilidad es local y no incluye credenciales ni datos personales.

## Credenciales y sesión

- **No se guardan credenciales.** Nunca se almacenan contraseñas, cookies, claves ni tokens de bolsas de trabajo.
- **La sesión se reutiliza, no se replica.** En conectores que lo declaren, la petición se envía con `credentials: include` y el navegador adjunta las cookies de ese dominio automáticamente. JobScout no las lee ni las copia: solo se beneficia de que ya existan.
- Consecuencia práctica: en un conector con sesión, el proveedor puede correlacionar la petición con tu cuenta. En un conector sin sesión (`credentials: omit`), la petición es anónima salvo por IP y cabeceras.

## Qué ve el proveedor cuando consultas

| Se envía | No se envía |
| --- | --- |
| Petición GET al endpoint declarado | Tu historial de vacantes guardadas |
| IP, fecha y metadatos normales de conexión | Tus notas privadas |
| User-Agent del navegador real | Tus filtros y preferencias |
| Cookies del dominio, solo si la ficha declara sesión | Tus estados de seguimiento |

Si en el futuro se activa un proxy para una fuente, el proveedor verá la IP del proxy y no la tuya. Es un cambio visible para el proveedor y se documentará cuando ocurra.

## Red

- Solo se contacta con hosts declarados en la política de fuentes. Nunca `<all_urls>`.
- Método GET sobre HTTPS, con timeout explícito y tope de tamaño de respuesta.
- `credentials: omit` por defecto; `include` solo en conectores que lo declaren en su ficha.
- Redirecciones permitidas solo dentro del mismo host declarado; si cambia de dominio, la respuesta se marca.
- No hay navegación automática a sitios laborales: el usuario abre la vacante original y postula a mano.

## Lectura de página (conectores N2)

Cuando un dominio está declarado como N2, la extensión lee el DOM de esa página mediante un content script acotado.

- La lectura es mínima: solo los nodos necesarios para extraer los campos del contrato de oportunidad.
- No se inyectan estilos ni se reescribe la página.
- Lo leído se procesa en local; nada se reenvía a un tercero.
- La actividad se reduce o se detiene cuando la pestaña está oculta.

## Ritmo y trazabilidad

- Cada petición respeta el presupuesto declarado por dominio.
- El log registra nivel, host, peticiones, códigos de respuesta, pausas aplicadas y cambios de nivel.
- El log no contiene credenciales, nombres ni notas.

## Retención

Los datos permanecen hasta que el usuario elimine registros, borre el almacenamiento del navegador, el perfil, o desinstale. Exporta respaldos antes de eliminar la extensión.

## Borrado

- Oportunidades: eliminables desde Seguimiento.
- Fuente concreta: revocar autorización y borrar sus datos asociados si el usuario lo solicita.
- Borrado completo de ajustes y datos: opciones de almacenamiento del navegador o desinstalación, tras respaldar lo necesario.

## Código abierto

El repositorio no debe contener datos reales, vacantes copiadas a granel, contraseñas ni archivos de respaldo de usuarios. Las capturas del README no deben exponer nombres, correos ni notas reales.