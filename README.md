# 🏘️ RedCity: micro-comunidades de Bogotá

Una red social hiperlocal, a nivel de barrio, para colaborar con los vecinos de verdad:

| Módulo | Qué resuelve |
|---|---|
| 🧰 **Servicios** | Conectar necesidades con quien las resuelve en el barrio: oficios (aseo, cerrajería, plomería, paseo de perros, lavado de carros, niñera, modistería, satélites), comercios (panadería, miscelánea, ferretería…) y profesionales (contador, abogado, ingeniero…). **Fuente de ingresos: 2 % de comisión.** |
| 🏢 **Negocios** | Página de cada empresa o profesional: logo, portada, rubro, horario, dirección, teléfono, NIT (insignia "Negocio verificado"), seguidores y **enlaces a Facebook, Instagram, LinkedIn, TikTok, X, YouTube, WhatsApp y web** (validados: solo se aceptan enlaces del dominio de cada red). Se puede "Publicar como" el negocio. Los vecinos también enlazan sus redes en su perfil |
| 📦 **Ventas de garaje** | Un vecino vende cosas usadas en su casa con horario, lista de artículos con foto y precio, medios de pago y dirección opcional. Los vecinos **apartan** artículos (se le escribe al vendedor por privado) y marcan "Iré". Se ve "🟢 Abierta ahora" y sale del feed al terminar |
| 🔄 **Trueque** | Intercambiar objetos, servicios y habilidades (“ofrezco X / busco Y”) |
| 🛡️ **Seguridad** | Alertas por nivel (info / precaución / urgente), confirmadas por otros vecinos, con botón directo a la **Línea 123** |
| 🏷️ **Ofertas** | Promociones de la tienda, panadería o negocio del barrio, con fecha de vencimiento |
| 📅 **Eventos** | Actividades de la JAC, bazares, jornadas, con lista de asistentes |
| 🤝 **Redes de seguridad y apoyo** | Grupos de confianza (cuadra, edificio, adultos mayores, papás…) con **botón SOS** que alerta a los miembros con tu ubicación, "Llegué bien ✅", solicitudes de ayuda, tablero de mensajes y entrada con código de invitación o por WhatsApp |

**Además:** fotos en las publicaciones, chat privado 1 a 1 (con fotos), perfiles con reseñas verificadas ⭐, botón 🚩 Reportar (con 3 reportes una publicación se oculta), buscador sin tildes, verificación de identidad y antecedentes exigida para niñeras, cuidado de adultos mayores y servicios que entran a la casa, SOS que hay que mantener presionado 3 s, y app instalable con modo sin conexión.

**Social:** el botón ＋ abre el menú **Crear**: 📝 Publicación, ⭕ Historia (foto o texto por 24 h, con quién la vio), 🎬 Reel (video vertical de hasta 60 s, con me gusta, comentarios y compartir), 🔴 En vivo (por ahora solo la prueba de cámara; transmitir requiere un servidor de video como LiveKit, Mux o Agora) y 💭 Nota (60 caracteres sobre tu foto por 24 h). Cada publicación tiene **👍 Me gusta · 💬 Comentar · ↗️ Compartir (WhatsApp, enlace directo) · 🔖 Guardar**. Los me gusta **no** cambian el orden del feed.

**Identidad visual:** el rojo RedCity (`#d91e2b`) es el color de marca. Las emergencias (SOS, alertas urgentes) usan rojo oscuro con franjas y amarillo de advertencia para que nunca se confundan con la marca.

**Principios:** el feed es cronológico y no usa algoritmos. Solo muestra lo que está en tu radio (500 m / 1 km / 2 km) y se acaba, sin scroll infinito. La ubicación de cada publicación se difumina ±150 m y la ubicación exacta del usuario nunca se expone. Los vecinos se verifican por GPS. Se pide autorización de Habeas Data (Ley 1581 de 2012).

## Modelo de negocio: Servicios con 2 % de comisión

```
Vecino publica "Se necesita aseo los jueves · $100.000"
        │
        ▼
Vecinos proveedores se postulan (pueden proponer otro precio)
        │
        ▼
El cliente elige uno → paga por la app → el dinero queda RETENIDO
        │
        ▼
Servicio realizado → el cliente confirma → se libera el pago
        ├─ Cliente pagó      $103.800 ($100.000 + $3.800 de transacción*)
        ├─ Pasarela cobra      $3.800
        ├─ Proveedor recibe   $98.000 (98 %)
        └─ RedCity recibe   $2.000 (2 %)
```

- La comisión del 2 % se descuenta del valor que recibe el proveedor. Se configura en `COMISION` ([src/servicios.ts](src/servicios.ts)) y en la tabla `configuracion` en producción.
- **El costo de la pasarela lo paga el cliente aparte** (`PASARELA` en [src/servicios.ts](src/servicios.ts)). Si no fuera así, las tarifas de PSE, Nequi o tarjeta (que suelen superar el 2 %) se comerían la comisión. *Los valores actuales (3 % + $800) son **estimados de referencia** y hay que reemplazarlos por la tarifa real contratada.
- Solo quien pagó un servicio por la app puede calificar, así las reseñas son verificadas. Es el incentivo para no pagar por fuera.
- Los servicios recurrentes (cada semana, cada 15 días, cada mes) generan un pago por cada vez que se realizan.
- Si el cliente cancela antes de confirmar, se le reembolsa el pago completo.
- Un vecino también puede contratar directamente a alguien que publicó "Ofrezco".
- **En el demo el pago es simulado.** Cuando publicas una necesidad, aparecen dos propuestas de vecinos ficticios para que puedas probar el flujo completo.

**Para cobrar de verdad** hay que integrar una pasarela colombiana con PSE, Nequi y tarjetas que permita **dividir el pago** (split o marketplace) y **retener los fondos** hasta la confirmación. Algunas opciones a evaluar son Mercado Pago (modo marketplace), Wompi, PayU y ePayco. Hay que confirmar con cada una sus condiciones de split y retención. Así la plataforma no custodia dinero de terceros en cuentas propias, cosa que en Colombia tiene implicaciones regulatorias.

## Segunda fuente de ingresos: promociones 📣

Cualquier vecino o negocio puede pagar para destacar su evento, oferta, servicio o trueque:

| Plan | Duración | Alcance | Precio sugerido |
|---|---|---|---|
| 🏠 Cuadra | 3 días | 1 km | $5.000 |
| 🏘️ Barrio | 7 días | 2 km | $15.000 |
| 🏙️ Localidad | 14 días | 5 km | $40.000 |

Más el costo de la transacción. Los precios están en `PLANES` ([src/promociones.ts](src/promociones.ts)) y son una **propuesta de lanzamiento**.

Para no traicionar el principio de "sin algoritmo":
- Siempre llevan la etiqueta **"📣 Promocionado"**.
- Hay **máximo 2 espacios** en el feed: arriba y después de 5 publicaciones normales. El resto sigue cronológico.
- Los anunciantes **se turnan**: el orden se sortea en cada visita.
- **Siempre local:** solo las ven vecinos dentro del alcance pagado.
- **Las alertas de seguridad no se pueden promocionar.**
- La promoción de un evento termina sola cuando el evento empieza.
- El anunciante ve cuántos vecinos lo vieron y cuántos lo abrieron.

## Ejecutar el demo

```bash
npm install
npm run dev
```

**Cuenta de prueba:** `demo@redcity.co` / `Vecino2026` (botón "🧪 Usar cuenta de prueba"). Hay que quitarla antes del lanzamiento real.

## Publicar en internet (GitHub Pages)

Cada `git push` a la rama `main` compila y publica la app automáticamente ([.github/workflows/publicar.yml](.github/workflows/publicar.yml)) en `https://<usuario>.github.io/<repositorio>/`.

Solo la primera vez: en GitHub ve a **Settings → Pages → Build and deployment → Source** y elige **GitHub Actions**.

## Base de datos (Supabase)

La app está conectada a Supabase ([src/nube/](src/nube/)). La URL y la clave **publicable** van en [src/nube/config.ts](src/nube/config.ts): son públicas por diseño y los datos los protegen las reglas RLS. **Nunca** poner en el código la *secret key* ni la contraseña de la base de datos.

Para montar la base de datos desde cero, en Supabase → SQL Editor ejecutar en orden:
1. [supabase/schema.sql](supabase/schema.sql)
2. [supabase/migraciones/0002_etapa1.sql](supabase/migraciones/0002_etapa1.sql)

| Etapa | Qué está compartido entre vecinos | Estado |
|---|---|---|
| 1 | Cuentas (registro, inicio de sesión, recuperar contraseña), perfiles con verificación calculada por el servidor, barrios, **publicaciones de todas las categorías, fotos, comentarios, me gusta, compartidos y reportes** | ✅ |
| 2 | Chat privado, redes de seguridad con SOS, propuestas y pagos de servicios | Pendiente (funciona en el dispositivo) |
| 3 | Negocios, historias, reels, notas, promociones, foto de perfil | Pendiente (funciona en el dispositivo) |
| 4 | Notificaciones push y pasarela de pagos real | Pendiente |

**Modo demo:** agregando `?demo` a la dirección (por ejemplo `https://carlossantos19.github.io/RedCity/?demo`) la app funciona solo con datos de ejemplo en el navegador, útil para presentaciones.

**Correos:** la confirmación de correo está desactivada mientras se configura un servicio de correo propio (SMTP), porque el correo gratuito de Supabase solo envía a los miembros del equipo del proyecto.

Abre http://localhost:5173. Como `--host` está activo, también puedes abrirla desde tu celular en la misma red WiFi con la IP que muestra la consola.
El demo guarda todo en el navegador (localStorage) y trae 24 barrios de ejemplo en las 20 localidades.

**Cuentas:** cada persona crea su cuenta con nombre, correo (único y privado: no se muestra a los vecinos) y contraseña (mínimo 8 caracteres, con letras y números). La contraseña nunca se guarda: se guarda un hash SHA-256 con sal aleatoria e iteraciones ([src/auth.ts](src/auth.ts)). "Salir" cierra la sesión sin borrar nada. Para probar cliente y proveedor, crea dos cuentas y alterna entre ellas. "Reiniciar demo", en la pantalla de acceso, borra todo.

> ⚠️ En el demo las cuentas existen solo en ese navegador. Para que funcionen entre dispositivos hay que pasar a **Supabase Auth**, que guarda las contraseñas con bcrypt en el servidor, permite recuperar la contraseña por correo o SMS y da sesiones con token.

## Estructura

```
src/
  App.tsx               Pantalla principal: pestañas, feed por radio, buscador, filtros, mapa
  store.ts              Estado + acciones (en producción → llamadas a Supabase)
  ui.ts                 Qué ventana está abierta (publicación, red, perfil, chat)
  types.ts              Modelo de datos
  auth.ts               Hash de contraseñas y validaciones de cuenta
  servicios.ts          Catálogo de servicios, comisión, pasarela y requisitos de verificación
  fotos.ts              Compresión y guardado de fotos (IndexedDB en el demo)
  pwa.ts                Instalación de la app y service worker
  geo.ts                Distancias, difuminado de ubicación, GPS
  data/bogota.ts        Localidades, barrios semilla, límites de Bogotá
  data/seed.ts          Publicaciones, redes y reseñas de ejemplo
  components/           Pantallas: Onboarding, PostCard, PostDetail, NewPost, MapView,
                        ServicioDetalle, MisServicios, Redes, RedDetalle, Chat, Perfil…
public/                 Manifiesto, íconos y service worker (sw.js)
supabase/schema.sql     Esquema de producción con PostGIS, RLS, feed cercano, pagos,
                        redes, chat, verificación y moderación
```

## Hoja de ruta

**Fase 1: Piloto Bogotá (ahora)**
1. Crear un proyecto en Supabase y ejecutar `supabase/schema.sql`.
2. Cargar los polígonos oficiales de barrios de **IDECA** (datosabiertos.bogota.gov.co) en la tabla `barrios`.
3. Reemplazar `store.ts` por llamadas a Supabase (`auth` con número de celular por SMS + `rpc('feed_cercano')`).
4. Notificaciones push para alertas urgentes dentro del radio.
5. Lanzar en 3–5 barrios piloto de la mano de sus **Juntas de Acción Comunal** y administraciones de conjuntos.

**Fase 2: Confianza y moderación**
- Verificación reforzada: aval de 2 vecinos ya verificados o un recibo de servicios públicos.
- Moderadores por barrio (JAC / voluntarios); hoy una publicación se oculta sola con 3 reportes.
- Integrar los cuadrantes de la Policía (Plan Cuadrantes) como contacto por zona.
- Perfil de negocio verificado para ofertas (RUT / Cámara de Comercio).

**Fase 3: Expansión**
- Medellín, Cali, Barranquilla… El modelo ya tiene `ciudad`; solo hay que cargar barrios y comunas.
- App nativa (Capacitor o React Native) si la versión web instalable se queda corta.

## Legal (Colombia)
- **Ley 1581 de 2012 y Decreto 1377 de 2013**: política de tratamiento de datos, registro de bases de datos ante la SIC (RNBD) cuando aplique.
- Términos de uso que prohíban señalar a personas por apariencia y publicar datos personales de terceros (riesgo de estigmatización en las alertas).
- La app **no sustituye** la Línea 123; se dice en cada alerta urgente.
- **Facturación electrónica (DIAN):** la comisión del 2 % es un ingreso de la plataforma y debe facturarse. Hay que revisar con un contador el régimen tributario y las retenciones aplicables.
- **Servicio doméstico:** un trabajo fijo y recurrente en una casa (aseo, niñera, cuidado de adulto mayor) puede configurar relación laboral, con afiliación a seguridad social y prestaciones. La app lo advierte al publicar. Conviene que un abogado defina los términos de intermediación.
- **Estatuto del Consumidor (Ley 1480 de 2011):** hay que definir las políticas de reembolso y de disputas entre cliente y proveedor.
