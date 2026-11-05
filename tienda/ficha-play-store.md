# RedCity · Ficha y formularios de Google Play

Textos listos para copiar y pegar en **Play Console**. Las imágenes están en [tienda/imagenes/](imagenes/).

---

## 1. Detalles de la app (Ficha de Play Store → Ficha principal)

**Nombre de la app** (máx. 30 caracteres):
```
RedCity: la red de tu barrio
```

**Descripción breve** (máx. 80 caracteres):
```
Servicios, SOS vecinal, ventas de garaje y negocios a pocas cuadras de tu casa.
```

**Descripción completa** (máx. 4.000 caracteres):
```
RedCity es la red social de tu barrio en Bogotá. Aquí solo ves lo que pasa a pocas cuadras de tu casa: sin algoritmos, sin contenido de afuera y sin scroll infinito.

🧰 SERVICIOS ENTRE VECINOS
¿Necesitas aseo los jueves, un plomero, alguien que pasee a tu perro o un contador? Publica lo que necesitas y cuánto pagas. Los vecinos te envían propuestas, eliges a quien prefieras y pagas por la app: el dinero queda retenido hasta que confirmes que el trabajo quedó bien. Las calificaciones solo las dejan vecinos que de verdad contrataron.

🆘 REDES DE SEGURIDAD Y APOYO
Crea la red de tu cuadra, tu edificio o tu conjunto. Con el botón SOS (manteniéndolo presionado 3 segundos) alertas a todos los miembros con tu ubicación, y ellos responden "Voy en camino" o "Llamé al 123". También puedes avisar "Llegué bien" o pedir ayuda: un acompañamiento a la EPS, el mercado para un vecino mayor…
RedCity no reemplaza a las autoridades: en una emergencia llama siempre primero al 123.

📦 VENTAS DE GARAJE
Vende lo que ya no usas: publica tus artículos con foto y precio, tus vecinos los apartan y te escriben por privado.

🏢 NEGOCIOS DEL BARRIO
La panadería, la ferretería, el taller o el profesional independiente tienen su página con horario, contacto y redes sociales verificadas.

✨ Y ADEMÁS
• Trueque de objetos y habilidades
• Alertas de seguridad confirmadas por vecinos
• Ofertas de los comercios cercanos y eventos del barrio
• Historias, reels y notas de 24 horas solo para tu zona
• Chat privado con fotos
• Me gusta, comentar, compartir y guardar

🔒 TU PRIVACIDAD PRIMERO
• Tu ubicación exacta nunca se muestra: las publicaciones aparecen a ±150 m.
• Tú decides quién ve tu foto de perfil.
• Los vecinos se verifican por GPS, y quienes ofrecen servicios en casas (niñeras, cuidado de adultos mayores, aseo, cerrajería) deben verificar su identidad.
• Puedes eliminar tu cuenta y tus datos cuando quieras desde tu perfil.
• Tratamiento de datos según la Ley 1581 de 2012.

RedCity está disponible por ahora en Bogotá. ¡Invita a tus vecinos: entre más seamos, más útil es tu barrio!
```

**Imágenes:**
| Campo | Archivo |
|---|---|
| Ícono de la app (512×512) | `public/icono-512.png` |
| Imagen destacada (1024×500) | `tienda/imagenes/imagen-destacada-1024x500.png` |
| Capturas de teléfono (mín. 2) | `tienda/imagenes/captura-1-barrio.png` … `captura-6-crear.png` |

**Categoría:** Aplicación → **Social** · **Etiquetas:** Comunidad, Redes sociales, Servicios locales
**Correo de contacto:** `redcity.soporte@gmail.com`
**Política de privacidad:** `https://carlossantos19.github.io/RedCity/privacidad.html`

---

## 2. Contenido de la app (Política → Contenido de la app)

### Acceso a la app
Google necesita entrar para revisarla. Elige **"Todas o algunas funciones están restringidas"** y da una cuenta de prueba:
- Usuario: `prueba1@redcity.co` · Contraseña: `PruebaRedCity2026`
- Instrucciones: *"Inicia sesión con la cuenta de prueba. El contenido depende de la ubicación (barrio Chapinero Alto, Bogotá)."*

### Anuncios
**No**, la app no contiene anuncios de terceros. Las "promociones" son publicaciones del barrio marcadas como "Promocionado", no anuncios de redes publicitarias.

### Clasificación del contenido (cuestionario IARC)
- Categoría: **Redes sociales / Comunicación**
- ¿Los usuarios pueden interactuar o intercambiar contenido? **Sí** (chat, publicaciones, fotos)
- ¿Se comparte la ubicación del usuario con otros? **Sí** (aproximada en publicaciones; exacta solo en un SOS dentro de una red privada que el usuario elige)
- ¿Permite compras digitales? **No** (los pagos son por servicios físicos entre vecinos)
- Violencia, sexo, drogas, apuestas, lenguaje obsceno: **No**

### Público objetivo
**18 años o más.** Hay servicios con pago, chat privado y ubicación, así que no es para menores.

### Seguridad de los datos
**¿La app recopila o comparte datos del usuario?** Sí, los recopila. **No los comparte con terceros**: Supabase y GitHub son proveedores de servicio que procesan los datos en nombre de RedCity, y Google no los cuenta como "compartir".
- **¿Los datos se cifran en tránsito?** Sí (HTTPS).
- **¿El usuario puede solicitar que se borren?** Sí (Perfil → Eliminar mi cuenta, y la página web de eliminación).

| Tipo de dato | ¿Se recopila? | ¿Obligatorio? | Para qué |
|---|---|---|---|
| Nombre | Sí | Sí | Funcionalidad de la app, gestión de la cuenta |
| Correo electrónico | Sí | Sí | Gestión de la cuenta |
| ID de usuario | Sí | Sí | Funcionalidad, gestión de la cuenta |
| Ubicación aproximada | Sí | Sí | Funcionalidad (feed por barrio) |
| Ubicación precisa | Sí | No (solo si el usuario usa el GPS o envía un SOS) | Funcionalidad, seguridad |
| Fotos | Sí | No | Funcionalidad (publicaciones, perfil, chat) |
| Mensajes en la app | Sí | No | Funcionalidad (chat privado) |
| Otro contenido generado por el usuario | Sí | No | Funcionalidad (publicaciones, comentarios) |
| Historial de compras | Sí | No | Funcionalidad (pagos de servicios) |
| Interacciones en la app | Sí | No | Funcionalidad (me gusta, guardados) |
| Información financiera / de tarjeta | **No** (la maneja la pasarela de pagos) | — | — |

### Eliminación de la cuenta
- Dentro de la app: **Perfil → Eliminar mi cuenta**.
- Enlace web: `https://carlossantos19.github.io/RedCity/eliminar-cuenta.html`

---

## 3. Recordatorios importantes
- **Prueba cerrada obligatoria (cuenta personal):** al menos **12 personas** inscritas durante **14 días seguidos** antes de pedir acceso a producción.
- La app es una *Trusted Web Activity*: se actualiza sola cuando se publica en GitHub, sin subir otra versión a Play Store (salvo cambios del paquete Android).
- Antes del lanzamiento público: **quitar o cambiar la contraseña de las cuentas de prueba** y configurar un **servicio de correo propio (SMTP)** en Supabase para que la confirmación y la recuperación de contraseña lleguen a todos.
