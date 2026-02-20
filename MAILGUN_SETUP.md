# Configurar Mailgun para Comprobantes por Email

Esta guía te permite recibir comprobantes (facturas, boletas, guías, etc.) simplemente **enviándolas por correo** a una dirección dedicada. El sistema las captura automáticamente y las crea como comprobantes en estado PENDIENTE.

---

## Requisitos previos

- Cuenta en [Mailgun](https://www.mailgun.com) (el plan gratuito incluye 1,000 mensajes/mes)
- Un dominio de email (puede ser un subdominio, ej. `comprobantes.victorsdou.pe`)
- El backend VictorOS ERP debe ser accesible desde internet (necesitas una URL pública — ver sección de túnel más abajo)

---

## Paso 1 — Crear una cuenta en Mailgun

1. Ve a [https://www.mailgun.com](https://www.mailgun.com) y regístrate.
2. Verifica tu cuenta de email.
3. En el dashboard, ve a **Sending → Domains** y haz clic en **Add New Domain**.

---

## Paso 2 — Agregar y verificar tu dominio

1. Ingresa un subdominio, por ejemplo: `comprobantes.victorsdou.pe`
2. Mailgun te dará registros DNS (MX, TXT, CNAME) para agregar en tu proveedor DNS.
3. Agrega los registros DNS indicados. El más importante para recibir email es el **MX record**:
   ```
   Tipo:  MX
   Host:  comprobantes.victorsdou.pe
   Valor: mxa.mailgun.org (prioridad 10)
         mxb.mailgun.org (prioridad 10)
   ```
4. Espera a que Mailgun verifique el dominio (puede tardar de 5 minutos a 2 horas).

---

## Paso 3 — Configurar Inbound Routing (recepción de emails)

1. En Mailgun, ve a **Receiving → Routes**.
2. Haz clic en **Create Route**.
3. Configura la ruta así:

   | Campo | Valor |
   |-------|-------|
   | **Expression type** | Match Recipient |
   | **Recipient** | `comprobantes@comprobantes.victorsdou.pe` |
   | **Actions** | Forward → `https://TU_DOMINIO/v1/comprobantes/email-ingest` |
   | **Priority** | 10 |

4. Haz clic en **Save**.

> **Nota:** Reemplaza `TU_DOMINIO` con la URL pública de tu servidor (ver Paso 5 si estás en desarrollo).

---

## Paso 4 — Obtener el Signing Key de Mailgun

1. En Mailgun, ve a **Settings → API Keys**.
2. Copia el **HTTP Webhook Signing Key** (es distinto al API Key de envío).
3. Agrega la clave en el archivo `.env` de tu servidor:

   ```env
   MAILGUN_SIGNING_KEY=tu_webhook_signing_key_aqui
   ```

4. Reinicia el servidor para que tome el nuevo valor:
   ```bash
   npm run dev
   ```

> Si `MAILGUN_SIGNING_KEY` no está definido, el servidor acepta todos los webhooks sin verificar. Esto está bien para pruebas locales, pero **siempre configúralo en producción**.

---

## Paso 5 — Exponer el servidor localmente (solo para desarrollo)

Para que Mailgun pueda alcanzar tu servidor local, necesitas un túnel. Las opciones más simples son:

### Opción A — ngrok (recomendado)

```bash
# Instalar ngrok
brew install ngrok

# Crear túnel hacia el puerto 3000
ngrok http 3000
```

ngrok te dará una URL como `https://abc123.ngrok-free.app`. Úsala en la ruta de Mailgun:
```
https://abc123.ngrok-free.app/v1/comprobantes/email-ingest
```

> **Nota:** La URL de ngrok cambia cada vez que lo reinicias (en el plan gratuito). Para producción, usa un dominio fijo o paga el plan ngrok Pro.

### Opción B — Cloudflare Tunnel (gratis y estable)

```bash
# Instalar cloudflared
brew install cloudflare/cloudflare/cloudflared

# Crear túnel
cloudflared tunnel --url http://localhost:3000
```

---

## Paso 6 — Probar el flujo completo

### Prueba rápida con el endpoint de test (sin Mailgun)

Puedes probar el sistema sin configurar Mailgun usando el endpoint de test:

```bash
curl -X POST http://localhost:3000/v1/comprobantes/email-ingest/test \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "proveedor@ejemplo.com",
    "subject": "Factura F001-000123",
    "attachments": [
      {
        "filename": "factura-F001-000123.pdf",
        "mimeType": "application/pdf",
        "dataBase64": "JVBERi0xLj..."
      }
    ]
  }'
```

Si la respuesta es `{ "data": { "id": "..." } }`, el flujo funciona correctamente.

### Prueba real con Mailgun

1. Con todo configurado, envía un email a `comprobantes@comprobantes.victorsdou.pe`.
2. Adjunta una factura en PDF o XML.
3. En el sistema, ve a **Comprobantes** y verifica que aparezca una nueva entrada con el badge 📧 **Email** y estado **Pendiente**.
4. El badge de email también aparecerá en el menú lateral izquierdo indicando cuántos comprobantes por email están pendientes de revisar.

---

## Flujo de trabajo diario

1. Tu proveedor te envía una factura por email → la envías (o la reenvías) a `comprobantes@comprobantes.victorsdou.pe`
2. El sistema la captura automáticamente en segundos
3. Aparece en Comprobantes con badge 📧 Email y estado Pendiente
4. El contador del menú lateral te avisa que hay comprobantes nuevos por revisar
5. Abres el comprobante, verificas los datos extraídos, y lo marcas como Validado

---

## Filtrar comprobantes por email

En la pantalla de Comprobantes, usa el filtro **"Todos los orígenes"** → **"📧 Email"** para ver solo los comprobantes recibidos por email.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| Mailgun muestra "delivered" pero no aparece el comprobante | El webhook URL no es accesible | Verificar que el túnel esté activo y la URL sea correcta |
| Error 403 en el webhook | Signing key incorrecto | Verificar `MAILGUN_SIGNING_KEY` en `.env` |
| Comprobante creado pero sin datos extraídos | El archivo adjunto no es PDF/XML válido | Verificar que el adjunto no esté corrupto |
| No llegan los emails | Registros DNS no verificados | Esperar verificación DNS o revisar registros MX |

---

## Resumen de variables de entorno necesarias

```env
# .env del servidor VictorOS ERP
MAILGUN_SIGNING_KEY=whsec_xxxxxxxxxxxxxxxxxxxx
```

La dirección de email de recepción es:
```
comprobantes@comprobantes.victorsdou.pe
```
(o el subdominio que hayas configurado en Mailgun)
