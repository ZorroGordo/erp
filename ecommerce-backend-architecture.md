# VictorOS Ecommerce — Backend & ERP/CRM Integration Architecture

> **Stack**: NestJS 10 · Fastify adapter · TypeScript 5 · Prisma 5 · PostgreSQL 16 · Redis 7 · BullMQ 5 · AWS SES · AWS S3/Cloudflare R2 · Culqi
> **Currency**: PEN · **Locale**: Peru (boleta / factura) · **ERP**: existing Fastify API on port 3000

---

## 1. Architecture Overview

### 1.1 Service Topology

```
┌─────────────────────┐        ┌──────────────────────────┐
│  Web Frontend        │        │   Admin / Staff Panel    │
│  (React, port 5174) │        │   (React, port 5175)     │
└────────┬────────────┘        └───────────┬──────────────┘
         │ HTTPS                           │ HTTPS
         ▼                                 ▼
┌──────────────────────────────────────────────────────────┐
│              ecommerce-api  (NestJS, port 4000)          │
│  Auth │ Catalog │ Cart │ Checkout │ Orders │ Subs │ Admin │
└───┬────────┬──────────────────────────────┬──────────────┘
    │        │                              │
    ▼        ▼                              ▼
 Postgres  Redis 7                    BullMQ Workers
 (web DB)  cache + rate-limit         ├── email-worker
    │       + idempotency             ├── invoice-worker
    │                                 ├── subscription-billing
    │                                 └── catalog-sync
    │
    ▼
┌─────────────────────────────────────┐
│  erp-api  (Fastify, port 3000)      │
│  Customers │ Products │ B2B Prices  │
│  SalesOrders │ Invoices             │
└─────────────────────────────────────┘
```

**Two databases, one PostgreSQL cluster:**
- `victorsdou_erp`  — existing ERP (source of truth for catalog + B2B prices)
- `victorsdou_web`  — ecommerce (users, carts, orders, subscriptions, payments)

**Key design decisions:**
- ERP is never written to directly by checkout flow — only via its own API
- B2B prices are cached in Redis with 15-min TTL (read-through)
- All money values stored as `NUMERIC(14,4)` PEN; IGV computed server-side at 18%
- Guest checkout creates a `guest_session` row; buyer details captured before payment
- Culqi tokenises cards on the frontend; backend never touches raw card data

---

### 1.2 Module Map

```
ecommerce-api/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── decorators/          # @CurrentUser, @GuestSession, @AdminOnly
│   ├── guards/              # JwtAuthGuard, GuestOrAuthGuard, AdminGuard
│   ├── interceptors/        # LoggingInterceptor, TransformInterceptor
│   ├── filters/             # AllExceptionsFilter
│   └── pipes/               # ZodValidationPipe
│
├── modules/
│   ├── auth/                # register, login, refresh, guest, password-reset
│   ├── catalog/             # products (proxied from ERP), categories, pricing
│   ├── cart/                # session/user cart, promo codes, merge on login
│   ├── checkout/            # slot availability, validate, initiate, complete
│   ├── payments/            # Culqi charge, webhook, idempotency
│   ├── orders/              # list, detail, status history, invoice download
│   ├── subscriptions/       # CRUD, pause/cancel, billing scheduler
│   ├── invoices/            # PDF generation, S3 upload, boleta/factura
│   ├── account/             # profile, addresses
│   ├── suggestions/         # reorder recommendations
│   ├── admin/               # staff status updates, order management
│   ├── notifications/       # email queue producer + templates
│   └── erp-adapter/         # HTTP client wrapping ERP API
│
├── database/
│   ├── prisma.service.ts
│   └── schema.prisma        # victorsdou_web schema
│
├── queue/
│   ├── queues.ts            # queue name constants
│   └── processors/
│       ├── email.processor.ts
│       ├── invoice.processor.ts
│       ├── subscription-billing.processor.ts
│       └── catalog-sync.processor.ts
│
└── config/
    └── configuration.ts     # env schema (Zod)
```

---

## 2. Database Schema

### 2.1 Users & Auth

```sql
-- ecommerce-side accounts (separate from ERP internal users)
CREATE TABLE web_users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            VARCHAR(255) UNIQUE NOT NULL,
  password_hash    VARCHAR(255),               -- null for future SSO
  full_name        VARCHAR(255),
  phone            VARCHAR(30),
  dob              DATE,
  doc_type         VARCHAR(10),                -- DNI | RUC | CE | PASAPORTE
  doc_number       VARCHAR(20),
  type             VARCHAR(5)  NOT NULL DEFAULT 'B2C', -- B2C | B2B
  erp_customer_id  UUID,                       -- FK → ERP customers.id
  is_email_verified BOOLEAN    DEFAULT FALSE,
  is_active        BOOLEAN     DEFAULT TRUE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX web_users_email_idx ON web_users(email);
CREATE INDEX web_users_erp_customer_id_idx ON web_users(erp_customer_id);

CREATE TABLE refresh_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES web_users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL,          -- SHA-256(token)
  family       UUID        NOT NULL,           -- rotation family (detect reuse)
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES web_users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Guest checkout — no account required; email captured before payment
CREATE TABLE guest_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token       VARCHAR(255) UNIQUE NOT NULL, -- stored in HttpOnly cookie
  email               VARCHAR(255),
  full_name           VARCHAR(255),
  phone               VARCHAR(30),
  doc_type            VARCHAR(10),
  doc_number          VARCHAR(20),
  converted_user_id   UUID        REFERENCES web_users(id),
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 Addresses

```sql
CREATE TABLE web_addresses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES web_users(id) ON DELETE CASCADE,
  label            VARCHAR(100) DEFAULT 'Casa',
  recipient_name   VARCHAR(255),
  address_line1    VARCHAR(255) NOT NULL,
  address_line2    VARCHAR(255),
  district         VARCHAR(100) NOT NULL,
  province         VARCHAR(100) DEFAULT 'Lima',
  department       VARCHAR(100) DEFAULT 'Lima',
  country          CHAR(2)     DEFAULT 'PE',
  phone            VARCHAR(30),
  delivery_notes   TEXT,
  is_default       BOOLEAN     DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.3 Product Snapshots (ERP cache)

```sql
-- Periodically synced from ERP; used to lock prices at order time
CREATE TABLE product_snapshots (
  id               UUID         PRIMARY KEY,     -- == ERP product.id
  sku              VARCHAR(50)  UNIQUE NOT NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  category_name    VARCHAR(100),
  unit             VARCHAR(20)  DEFAULT 'kg',
  base_price_pen   NUMERIC(14,4) NOT NULL,       -- ERP list price before discounts
  image_url        VARCHAR(500),
  is_active        BOOLEAN      DEFAULT TRUE,
  stock_qty        NUMERIC(14,4),
  synced_at        TIMESTAMPTZ  DEFAULT NOW()
);
```

### 2.4 Carts

```sql
CREATE TABLE carts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        REFERENCES web_users(id) ON DELETE CASCADE,
  guest_session_id UUID        REFERENCES guest_sessions(id) ON DELETE CASCADE,
  status           VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE | MERGED | CHECKED_OUT
  promo_code       VARCHAR(50),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT cart_owner CHECK (
    (user_id IS NOT NULL AND guest_session_id IS NULL) OR
    (user_id IS NULL     AND guest_session_id IS NOT NULL)
  )
);

CREATE TABLE cart_items (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id          UUID         REFERENCES carts(id) ON DELETE CASCADE,
  product_id       UUID         NOT NULL,         -- ERP product id
  sku              VARCHAR(50),
  product_name     VARCHAR(255) NOT NULL,          -- snapshot
  qty              NUMERIC(14,4) NOT NULL CHECK (qty > 0),
  unit_price_pen   NUMERIC(14,4) NOT NULL,         -- effective price at add-to-cart
  discount_pct     NUMERIC(5,2) DEFAULT 0,
  added_at         TIMESTAMPTZ  DEFAULT NOW()
);
```

### 2.5 Orders

```sql
-- Order statuses (linear state machine)
-- PENDING_PAYMENT → PAID → CONFIRMED → PICKED_UP → ON_THE_WAY → DELIVERED
--                        → CANCELLED (from any pre-PICKED_UP state)

CREATE TABLE orders (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number            VARCHAR(30) UNIQUE NOT NULL, -- WEB-2026-000001

  -- Owner (exactly one of the three)
  user_id                 UUID        REFERENCES web_users(id),
  guest_session_id        UUID        REFERENCES guest_sessions(id),
  subscription_id         UUID,       -- FK → subscriptions (nullable)

  -- Buyer snapshot (immutable after creation)
  buyer_name              VARCHAR(255) NOT NULL,
  buyer_email             VARCHAR(255) NOT NULL,
  buyer_phone             VARCHAR(30),
  buyer_doc_type          VARCHAR(10),
  buyer_doc_number        VARCHAR(20),

  -- Delivery address snapshot
  delivery_recipient_name VARCHAR(255),
  delivery_phone          VARCHAR(30),
  delivery_line1          VARCHAR(255) NOT NULL,
  delivery_line2          VARCHAR(255),
  delivery_district       VARCHAR(100) NOT NULL,
  delivery_province       VARCHAR(100) DEFAULT 'Lima',
  delivery_notes          TEXT,

  -- Delivery slot (enforced: max 48h ahead, min 2h ahead)
  delivery_date           DATE        NOT NULL,
  delivery_window         VARCHAR(20) NOT NULL, -- '08:00-12:00' | '12:00-17:00'

  -- Financials (PEN, all inclusive)
  subtotal_pen            NUMERIC(14,4) NOT NULL,
  discount_pen            NUMERIC(14,4) DEFAULT 0,
  igv_pen                 NUMERIC(14,4) NOT NULL,
  total_pen               NUMERIC(14,4) NOT NULL,

  -- Status
  status                  VARCHAR(30) NOT NULL DEFAULT 'PENDING_PAYMENT',

  -- Invoice
  invoice_type            VARCHAR(10),      -- BOLETA | FACTURA
  erp_invoice_id          UUID,
  erp_sales_order_id      UUID,             -- linked after CONFIRMED

  notes                   TEXT,
  cancelled_reason        TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX orders_user_id_idx       ON orders(user_id);
CREATE INDEX orders_status_idx        ON orders(status);
CREATE INDEX orders_delivery_date_idx ON orders(delivery_date);

CREATE TABLE order_items (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID         REFERENCES orders(id) ON DELETE CASCADE,
  product_id     UUID         NOT NULL,
  sku            VARCHAR(50),
  product_name   VARCHAR(255) NOT NULL,
  qty            NUMERIC(14,4) NOT NULL,
  unit_price_pen NUMERIC(14,4) NOT NULL,
  discount_pct   NUMERIC(5,2) DEFAULT 0,
  line_total_pen NUMERIC(14,4) NOT NULL
);

CREATE TABLE order_status_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status   VARCHAR(30) NOT NULL,
  actor_id    UUID,
  actor_type  VARCHAR(10), -- STAFF | SYSTEM | CUSTOMER
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.6 Delivery Slots

```sql
CREATE TABLE delivery_slots (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_date DATE    NOT NULL,
  window        VARCHAR(20) NOT NULL, -- '08:00-12:00' | '12:00-17:00'
  max_capacity  INT     DEFAULT 50,
  booked_count  INT     DEFAULT 0,
  is_blocked    BOOLEAN DEFAULT FALSE,
  UNIQUE (delivery_date, window)
);
```

### 2.7 Payments

```sql
CREATE TABLE payments (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID         REFERENCES orders(id),
  provider         VARCHAR(20)  NOT NULL DEFAULT 'CULQI',
  culqi_charge_id  VARCHAR(100) UNIQUE,   -- cha_live_xxx
  culqi_order_id   VARCHAR(100),          -- ord_live_xxx
  amount_pen       NUMERIC(14,4) NOT NULL,
  currency         CHAR(3)      DEFAULT 'PEN',
  status           VARCHAR(20)  NOT NULL,  -- PENDING | CAPTURED | FAILED | REFUNDED
  metadata         JSONB,
  idempotency_key  VARCHAR(100) UNIQUE,    -- prevents double-charge
  paid_at          TIMESTAMPTZ,
  refunded_at      TIMESTAMPTZ,
  refund_reason    TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE payment_webhook_events (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  culqi_event_id VARCHAR(100) UNIQUE,
  event_type     VARCHAR(100),
  payload        JSONB        NOT NULL,
  processed      BOOLEAN      DEFAULT FALSE,
  error          TEXT,
  received_at    TIMESTAMPTZ  DEFAULT NOW()
);
```

### 2.8 Subscriptions

```sql
CREATE TABLE subscriptions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID         REFERENCES web_users(id) NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | PAUSED | CANCELLED | PAST_DUE

  cadence             VARCHAR(10)  NOT NULL,  -- WEEKLY | BIWEEKLY
  discount_pct        NUMERIC(5,2) DEFAULT 20,

  -- Billing
  monthly_amount_pen  NUMERIC(14,4) NOT NULL, -- upfront monthly charge
  billing_day         SMALLINT     NOT NULL,  -- 1–28
  next_billing_date   DATE         NOT NULL,
  culqi_customer_id   VARCHAR(100),           -- Culqi saved customer
  culqi_card_token    VARCHAR(100),           -- Culqi saved card

  -- Delivery address (snapshot at creation; can be updated)
  delivery_line1      VARCHAR(255) NOT NULL,
  delivery_line2      VARCHAR(255),
  delivery_district   VARCHAR(100) NOT NULL,
  delivery_window     VARCHAR(20),

  paused_at           TIMESTAMPTZ,
  paused_until        DATE,
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE subscription_items (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID         REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id       UUID         NOT NULL,
  sku              VARCHAR(50),
  product_name     VARCHAR(255),
  qty              NUMERIC(14,4) NOT NULL,
  unit_price_pen   NUMERIC(14,4) NOT NULL,
  discount_pct     NUMERIC(5,2)  DEFAULT 20
);

CREATE TABLE subscription_deliveries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID        REFERENCES subscriptions(id),
  order_id         UUID        REFERENCES orders(id),
  scheduled_date   DATE        NOT NULL,
  delivery_window  VARCHAR(20),
  status           VARCHAR(20) DEFAULT 'SCHEDULED',
  -- SCHEDULED | DISPATCHED | DELIVERED | SKIPPED
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.9 Invoices

```sql
CREATE TABLE web_invoices (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID         REFERENCES orders(id) UNIQUE NOT NULL,
  invoice_type   VARCHAR(10)  NOT NULL,    -- BOLETA | FACTURA
  serie          VARCHAR(10),             -- B001 / F001
  correlativo    INT,
  full_number    VARCHAR(30),             -- B001-00000001
  ruc            VARCHAR(11),             -- buyer RUC (only for factura)
  razon_social   VARCHAR(255),
  pdf_url        VARCHAR(500),            -- S3 presigned URL or CDN URL
  erp_invoice_id UUID,
  issued_at      TIMESTAMPTZ  DEFAULT NOW(),
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
```

### 2.10 Email Events

```sql
CREATE TABLE email_events (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email  VARCHAR(255) NOT NULL,
  template         VARCHAR(50)  NOT NULL,
  -- ORDER_CREATED | ORDER_CONFIRMED | ORDER_PICKED_UP
  -- ORDER_ON_THE_WAY | ORDER_DELIVERED | ORDER_CANCELLED
  -- SUBSCRIPTION_CREATED | SUBSCRIPTION_BILLING | SUBSCRIPTION_PAUSED
  -- SUBSCRIPTION_CANCELLED | PASSWORD_RESET | WELCOME
  order_id         UUID         REFERENCES orders(id),
  user_id          UUID         REFERENCES web_users(id),
  idempotency_key  VARCHAR(100) UNIQUE NOT NULL,
  status           VARCHAR(20)  DEFAULT 'QUEUED', -- QUEUED | SENT | FAILED
  attempt_count    SMALLINT     DEFAULT 0,
  sent_at          TIMESTAMPTZ,
  error            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);
```

---

## 3. API Contract

> Base path: `/api/v1`
> Auth: `Authorization: Bearer <access_token>` or `X-Guest-Token: <session_token>`
> All responses: `{ data, meta?, error? }` envelope

### 3.1 Auth

```
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/guest               → creates guest_session, returns session_token
POST /auth/forgot-password
POST /auth/reset-password
GET  /auth/me                  → requires JWT
```

**POST /auth/register**
```json
// Request
{ "email": "ana@gmail.com", "password": "Secure123!", "fullName": "Ana Torres",
  "phone": "+51987654321", "docType": "DNI", "docNumber": "12345678" }

// Response 201
{ "data": { "accessToken": "eyJ...", "refreshToken": "ref_...",
            "user": { "id": "uuid", "email": "ana@gmail.com", "type": "B2C" } } }
```

**POST /auth/guest**
```json
// Request  (body optional — can be empty)
{}

// Response 201
{ "data": { "sessionToken": "gs_Xk9...", "expiresAt": "2026-02-21T18:00:00Z" } }
```

**POST /auth/login**
```json
// Request
{ "email": "ana@gmail.com", "password": "Secure123!" }

// Response 200
{ "data": { "accessToken": "eyJ...", "refreshToken": "ref_...",
            "user": { "id": "...", "type": "B2C", "erpCustomerId": null } } }
```

---

### 3.2 Catalog

```
GET /catalog/products              list (paginated)
GET /catalog/products/:id          single product
GET /catalog/products/:id/price    effective price for caller (B2B + subscription applied)
GET /catalog/categories
```

**GET /catalog/products**
```
Query: page=1&limit=20&category=&search=&sort=name
```
```json
// Response 200
{ "data": [
    { "id": "uuid", "sku": "PAN-001", "name": "Pan de centeno", "unit": "kg",
      "basePricePen": "12.5000", "imagUrl": "https://...", "stockQty": "150.00" }
  ],
  "meta": { "page": 1, "limit": 20, "total": 45 } }
```

**GET /catalog/products/:id/price**
```json
// Response 200 — B2B user with 10% agreement + active subscription
{ "data": {
    "productId": "uuid",
    "basePricePen":    "12.5000",
    "b2bDiscountPct":  "10.00",
    "subDiscountPct":  "20.00",
    "combinedDiscPct": "28.00",      // 1-(1-0.1)*(1-0.2)
    "effectivePricePen": "9.0000",
    "igvPen":          "1.6200",
    "totalPen":        "10.6200"
  } }
```

---

### 3.3 Cart

```
GET    /cart                     (JWT or X-Guest-Token)
POST   /cart/items
PATCH  /cart/items/:itemId
DELETE /cart/items/:itemId
DELETE /cart
POST   /cart/merge               (JWT — merges guest cart after login)
```

**POST /cart/items**
```json
// Request
{ "productId": "uuid", "qty": 2 }

// Response 201
{ "data": { "cartId": "uuid", "items": [...], "subtotalPen": "25.00" } }
```

**POST /cart/merge**
```json
// Request  (JWT required; guest token in body)
{ "guestSessionToken": "gs_Xk9..." }

// Response 200 — merged cart returned
{ "data": { "cartId": "uuid", "itemCount": 5, "subtotalPen": "78.50" } }
```

---

### 3.4 Checkout

```
GET  /checkout/slots             available delivery slots (next 48h)
POST /checkout/validate          validate cart + address + slot
POST /checkout/initiate          create Culqi order → return culqi_order_id + public_key
POST /checkout/complete          finalize after Culqi token obtained on frontend
```

**GET /checkout/slots**
```json
// Response 200
{ "data": [
    { "date": "2026-02-21", "window": "08:00-12:00", "available": true, "slotsLeft": 23 },
    { "date": "2026-02-21", "window": "12:00-17:00", "available": true, "slotsLeft": 47 },
    { "date": "2026-02-22", "window": "08:00-12:00", "available": false, "slotsLeft": 0 }
  ] }
```

**POST /checkout/initiate**
```json
// Request
{
  "addressId": "uuid",               // saved address (auth) OR inline address (guest)
  "inlineAddress": null,
  "deliveryDate": "2026-02-21",
  "deliveryWindow": "08:00-12:00",
  "invoiceType": "BOLETA",
  "notes": ""
}

// Response 200
{
  "data": {
    "culqiOrderId": "ord_live_xxx",
    "culqiPublicKey": "pk_live_xxx",
    "amountCentimos": 1062,           // Culqi uses centimos
    "orderRef": "WEB-2026-000042"
  }
}
```

**POST /checkout/complete**
```json
// Request — frontend passes Culqi token after user completes card form
{
  "culqiToken": "tkn_live_xxx",
  "culqiOrderId": "ord_live_xxx",
  "orderRef": "WEB-2026-000042"
}

// Response 201
{ "data": { "orderId": "uuid", "orderNumber": "WEB-2026-000042",
            "status": "PAID", "totalPen": "10.62" } }
```

---

### 3.5 Payments — Webhook

```
POST /payments/webhook     (no auth; HMAC-verified via Culqi-Signature header)
```

**Handled event types:**
- `charge.succeeded`  → transition order PENDING_PAYMENT → PAID; enqueue email ORDER_CREATED
- `charge.failed`     → mark payment FAILED; notify buyer
- `charge.refunded`   → mark REFUNDED; cancel order

---

### 3.6 Orders

```
GET  /orders                    list (auth)
GET  /orders/:id                detail
GET  /orders/:id/invoice        redirect to PDF URL (presigned S3)
POST /orders/:id/reorder        add past items to cart
```

**GET /orders**
```json
{ "data": [
    { "id": "uuid", "orderNumber": "WEB-2026-000042",
      "status": "DELIVERED", "totalPen": "78.50",
      "deliveryDate": "2026-02-21", "createdAt": "2026-02-20T..." }
  ] }
```

**GET /orders/:id**
```json
{ "data": {
    "orderNumber": "WEB-2026-000042",
    "status": "ON_THE_WAY",
    "items": [{ "sku": "PAN-001", "productName": "Pan de centeno", "qty": 2,
                "unitPricePen": "12.50", "discountPct": "20.00", "lineTotalPen": "20.00" }],
    "subtotalPen": "20.00", "discountPen": "4.00", "igvPen": "3.60", "totalPen": "19.60",
    "deliveryDate": "2026-02-21", "deliveryWindow": "08:00-12:00",
    "statusHistory": [
      { "toStatus": "PAID",      "createdAt": "..." },
      { "toStatus": "CONFIRMED", "createdAt": "..." },
      { "toStatus": "ON_THE_WAY","createdAt": "..." }
    ],
    "invoiceUrl": "https://cdn.victorsdou.pe/invoices/WEB-2026-000042.pdf"
  } }
```

---

### 3.7 Subscriptions

```
POST   /subscriptions
GET    /subscriptions
GET    /subscriptions/:id
PATCH  /subscriptions/:id
POST   /subscriptions/:id/pause
POST   /subscriptions/:id/resume
DELETE /subscriptions/:id
GET    /subscriptions/:id/deliveries
```

**POST /subscriptions**
```json
// Request
{
  "cadence": "WEEKLY",
  "items": [{ "productId": "uuid", "qty": 1 }],
  "deliveryAddressId": "uuid",
  "deliveryWindow": "08:00-12:00",
  "billingDay": 1,
  "culqiToken": "tkn_live_xxx"      // card to charge monthly
}

// Response 201
{ "data": {
    "id": "uuid", "status": "ACTIVE",
    "cadence": "WEEKLY", "discountPct": "20.00",
    "monthlyAmountPen": "160.00",   // 4 deliveries × items
    "nextBillingDate": "2026-03-01",
    "nextDeliveryDate": "2026-02-27"
  } }
```

**GET /subscriptions/:id/deliveries**
```json
{ "data": [
    { "scheduledDate": "2026-02-27", "window": "08:00-12:00", "status": "SCHEDULED" },
    { "scheduledDate": "2026-03-06", "window": "08:00-12:00", "status": "SCHEDULED" }
  ] }
```

---

### 3.8 Reorder Suggestions

```
GET /suggestions/reorder       (JWT; returns top items from past 90 days)
```

```json
{ "data": [
    { "productId": "uuid", "sku": "PAN-001", "productName": "Pan de centeno",
      "orderCount": 5, "lastOrderedAt": "2026-01-15", "suggestedQty": 2,
      "effectivePricePen": "9.00" }
  ] }
```

*Logic*: `SELECT product_id, COUNT(*) order_count, SUM(qty)/COUNT(*) avg_qty FROM order_items
JOIN orders ON ... WHERE user_id = ? AND created_at > NOW() - interval '90 days'
GROUP BY product_id ORDER BY order_count DESC LIMIT 10`

---

### 3.9 Account

```
GET   /account/profile
PATCH /account/profile
GET   /account/addresses
POST  /account/addresses
PATCH /account/addresses/:id
DELETE /account/addresses/:id
```

---

### 3.10 Admin (staff)

```
GET   /admin/orders                  filter by status, date, search
PATCH /admin/orders/:id/status       { "status": "CONFIRMED|PICKED_UP|ON_THE_WAY|DELIVERED",
                                       "notes": "..." }
GET   /admin/deliveries/today        orders delivering today
POST  /admin/slots                   create or block delivery slots
GET   /admin/subscriptions           list all active subscriptions
```

**PATCH /admin/orders/:id/status — state machine rules:**
```
PAID       → CONFIRMED   (manual staff action)
CONFIRMED  → PICKED_UP   (staff marks goods collected)
PICKED_UP  → ON_THE_WAY  (goods handed to delivery)
ON_THE_WAY → DELIVERED   (delivery company confirms)
Any (≤PICKED_UP) → CANCELLED
```

---

## 4. Business Rules & Validation Logic

### 4.1 Delivery Window Enforcement

```typescript
// checkout/validators/delivery-slot.validator.ts
export function validateDeliverySlot(
  deliveryDate: string,
  window: '08:00-12:00' | '12:00-17:00',
  now = new Date()
): void {
  const [hour] = window.split('-').map(t => parseInt(t));
  const slotStart = new Date(`${deliveryDate}T${hour.toString().padStart(2,'0')}:00:00-05:00`);

  const minAhead = new Date(now.getTime() + 2  * 60 * 60 * 1000); // +2h
  const maxAhead = new Date(now.getTime() + 48 * 60 * 60 * 1000); // +48h

  if (slotStart < minAhead)
    throw new BadRequestException('La entrega debe programarse con al menos 2 horas de anticipación');
  if (slotStart > maxAhead)
    throw new BadRequestException('La entrega no puede programarse con más de 48 horas de anticipación');
}
```

### 4.2 Pricing Pipeline

```typescript
// pricing/pricing.service.ts
interface PricingResult {
  basePricePen:     Decimal;
  b2bDiscountPct:   Decimal;
  subDiscountPct:   Decimal;
  combinedDiscPct:  Decimal;
  effectivePricePen: Decimal;
  igvPen:           Decimal;
  totalPen:         Decimal;
}

async getEffectivePrice(
  productId: string,
  userId: string | null,
  hasSubscription: boolean
): Promise<PricingResult> {
  const product = await this.getProductSnapshot(productId);
  let price = new Decimal(product.basePricePen);

  // Step 1: B2B agreement (cached in Redis 15 min)
  let b2bDisc = new Decimal(0);
  if (userId) {
    const user = await this.usersRepo.findById(userId);
    if (user?.type === 'B2B' && user.erpCustomerId) {
      const agreement = await this.erpAdapter.getPriceAgreement(
        user.erpCustomerId, productId
      ); // Redis read-through, TTL 15min
      if (agreement?.pricingType === 'FIXED_PRICE') {
        price = new Decimal(agreement.value);
      } else if (agreement?.pricingType === 'DISCOUNT_PCT') {
        b2bDisc = new Decimal(agreement.value).div(100);
      }
    }
  }

  // Step 2: Subscription discount stacked on top
  const subDisc = hasSubscription ? new Decimal(0.20) : new Decimal(0);

  // Combined: 1 - (1 - b2b) * (1 - sub)
  const combined = new Decimal(1).minus(
    new Decimal(1).minus(b2bDisc).times(new Decimal(1).minus(subDisc))
  );

  const effective = price.times(new Decimal(1).minus(combined)).toDecimalPlaces(4);
  const igv = effective.times(0.18).toDecimalPlaces(4);

  return {
    basePricePen:      price,
    b2bDiscountPct:    b2bDisc.times(100),
    subDiscountPct:    subDisc.times(100),
    combinedDiscPct:   combined.times(100),
    effectivePricePen: effective,
    igvPen:            igv,
    totalPen:          effective.plus(igv),
  };
}
```

### 4.3 Subscription Billing Rules

```
Monthly upfront amount:
  deliveries_per_month = cadence === 'WEEKLY' ? 4 : 2
  monthly_amount = SUM(items[i].qty × effective_price_pen) × deliveries_per_month

Pause:
  - Stop generating new deliveries for subscription
  - paused_until date required
  - Billing resumes on paused_until date (or next billing_day)
  - Current paid month's deliveries are still completed

Cancel:
  - status → CANCELLED, cancelled_at = NOW()
  - No future charges
  - Deliveries in current paid period continue

Past-due:
  - charge fails → status → PAST_DUE
  - BullMQ retry job: attempt at +1d, +3d, +7d
  - After 3 failures → CANCELLED; notify customer
```

### 4.4 B2B Price Cache Strategy

```typescript
// erp-adapter/erp-cache.service.ts
async getPriceAgreement(erpCustomerId: string, productId: string) {
  const key = `b2b:prices:${erpCustomerId}:${productId}`;
  const cached = await this.redis.get(key);
  if (cached) return JSON.parse(cached);

  const agreement = await this.erpHttpClient.get(
    `/v1/customers/${erpCustomerId}/price-agreements?productId=${productId}`
  );
  if (agreement) {
    await this.redis.setex(key, 900, JSON.stringify(agreement)); // 15 min TTL
  }
  return agreement;
}

// ERP can invalidate via POST /api/v1/internal/cache/invalidate/prices/:customerId
async invalidateCustomerPrices(erpCustomerId: string) {
  const keys = await this.redis.keys(`b2b:prices:${erpCustomerId}:*`);
  if (keys.length) await this.redis.del(...keys);
}
```

---

## 5. Email Workflow

### 5.1 Templates

| Key | Subject (ES) | Trigger |
|-----|-------------|---------|
| `ORDER_CREATED` | Recibimos tu pedido #{number} | Payment captured |
| `ORDER_CONFIRMED` | Tu pedido está confirmado | Staff → CONFIRMED |
| `ORDER_PICKED_UP` | Preparando tu pedido | Staff → PICKED_UP |
| `ORDER_ON_THE_WAY` | 🚚 Tu pedido está en camino | Staff → ON_THE_WAY |
| `ORDER_DELIVERED` | ✅ Pedido entregado | Staff → DELIVERED |
| `ORDER_CANCELLED` | Tu pedido fue cancelado | CANCELLED transition |
| `SUBSCRIPTION_CREATED` | Suscripción activada | Sub created |
| `SUBSCRIPTION_BILLING` | Suscripción renovada — cargo S/. X | Monthly charge |
| `SUBSCRIPTION_PAUSED` | Suscripción pausada | Sub paused |
| `SUBSCRIPTION_CANCELLED` | Suscripción cancelada | Sub cancelled |
| `PASSWORD_RESET` | Restablece tu contraseña | Forgot password |
| `WELCOME` | ¡Bienvenido a VictorOS! | Register |

### 5.2 Reliable Sending Pipeline

```typescript
// notifications/notifications.service.ts
async queueEmail(dto: QueueEmailDto): Promise<void> {
  const key = dto.idempotencyKey
    ?? `${dto.template}:${dto.orderId ?? dto.userId}:${Date.now()}`;

  // 1. Persist the intent (idempotency)
  await this.prisma.emailEvent.upsert({
    where:  { idempotencyKey: key },
    create: { ...dto, idempotencyKey: key, status: 'QUEUED' },
    update: {},  // already queued — skip duplicate
  });

  // 2. Add to BullMQ with same key as jobId (deduplication)
  await this.emailQueue.add('send-email', { key, ...dto }, {
    jobId:    key,
    attempts: 3,
    backoff:  { type: 'exponential', delay: 30_000 },
    removeOnComplete: 100,
  });
}

// queue/processors/email.processor.ts
@Processor('email')
export class EmailProcessor {
  @Process('send-email')
  async handle(job: Job) {
    const { key, template, recipientEmail, orderId } = job.data;
    const event = await this.prisma.emailEvent.findUnique(
      { where: { idempotencyKey: key } }
    );

    if (event?.status === 'SENT') return; // already delivered — idempotent

    const html = await this.templateEngine.render(template, { orderId });
    await this.ses.sendEmail({ to: recipientEmail, subject: ..., html });

    await this.prisma.emailEvent.update({
      where: { idempotencyKey: key },
      data:  { status: 'SENT', sentAt: new Date(), attemptCount: job.attemptsMade + 1 },
    });
  }
}
```

---

## 6. Security

### 6.1 JWT Strategy

```typescript
// config: RS256, reuse key pair from ERP or generate fresh pair
// access token:  15 min
// refresh token: 7 days (stored as SHA-256 hash + rotation family)

// Refresh token rotation — detect reuse attacks:
async rotateRefreshToken(rawToken: string) {
  const hash = sha256(rawToken);
  const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash: hash } });

  if (!stored) throw new UnauthorizedException('Invalid token');
  if (stored.revokedAt) {
    // Token reuse detected — revoke entire family
    await this.prisma.refreshToken.updateMany({
      where: { family: stored.family },
      data:  { revokedAt: new Date() },
    });
    throw new UnauthorizedException('Token reuse detected — please log in again');
  }

  await this.prisma.refreshToken.update(
    { where: { id: stored.id }, data: { revokedAt: new Date() } }
  );
  return this.issueNewTokenPair(stored.userId, stored.family);
}
```

### 6.2 Rate Limiting

```typescript
// main.ts
app.use('/api/v1/auth/login',          rateLimit({ windowMs: 15*60_000, max: 10 }));
app.use('/api/v1/auth/register',       rateLimit({ windowMs: 60*60_000, max: 10 }));
app.use('/api/v1/auth/forgot-password',rateLimit({ windowMs: 60*60_000, max: 5  }));
// Backed by Redis (ioredis store) so limits survive restarts
```

### 6.3 Culqi Webhook Signature Verification

```typescript
// payments/culqi-webhook.guard.ts
@Injectable()
export class CulqiWebhookGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const signature = req.headers['culqi-signature'] as string;
    const rawBody   = req.rawBody as Buffer;  // requires rawBodyEnabled in Fastify

    if (!signature) throw new UnauthorizedException();

    const expected = createHmac('sha256', process.env.CULQI_WEBHOOK_SECRET!)
      .update(rawBody)
      .digest('hex');

    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
      throw new UnauthorizedException('Invalid Culqi signature');

    return true;
  }
}
```

### 6.4 PII Handling

- Passwords: `bcrypt` (rounds = 12)
- Card data: **never stored** — Culqi tokenises entirely on the frontend
- Guest `email` / `fullName`: consider AES-256-GCM encryption at rest (app-level), or rely on Postgres `pgcrypto` + column encryption
- Application logs: mask email → `a***@gmail.com`, phone → `+519*******1`
- S3 invoice PDFs: private bucket, serve via short-lived presigned URLs (15 min)
- HTTPS only; all cookies `HttpOnly + Secure + SameSite=Strict`

---

## 7. Implementation Plan & Code Scaffolds

### 7.1 Project Bootstrap

```bash
npx @nestjs/cli new ecommerce-api
cd ecommerce-api
npm i @nestjs/config @nestjs/jwt @nestjs/passport passport-jwt
npm i @prisma/client prisma ioredis bullmq @nestjs/bullmq
npm i @aws-sdk/client-ses @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm i decimal.js bcrypt zod class-transformer class-validator
npm i -D @types/bcrypt prisma
npx prisma init --datasource-provider postgresql
```

**`src/config/configuration.ts`**
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:             z.enum(['development','production','test']).default('development'),
  PORT:                 z.coerce.number().default(4000),
  DATABASE_URL:         z.string().url(),
  REDIS_URL:            z.string().default('redis://localhost:6379'),
  JWT_PRIVATE_KEY:      z.string(),
  JWT_PUBLIC_KEY:       z.string(),
  JWT_ACCESS_EXPIRES:   z.string().default('15m'),
  JWT_REFRESH_EXPIRES:  z.string().default('7d'),
  ERP_API_URL:          z.string().default('http://localhost:3000'),
  ERP_API_KEY:          z.string(),              // shared secret for internal calls
  CULQI_PUBLIC_KEY:     z.string(),
  CULQI_SECRET_KEY:     z.string(),
  CULQI_WEBHOOK_SECRET: z.string(),
  AWS_REGION:           z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID:    z.string().optional(),
  AWS_SECRET_ACCESS_KEY:z.string().optional(),
  S3_BUCKET:            z.string().default('victorsdou-invoices'),
  SES_FROM_EMAIL:       z.string().email(),
  INTERNAL_API_KEY:     z.string(),              // for ERP → ecommerce cache invalidation
});

export const configuration = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) throw new Error(`Invalid env: ${result.error.message}`);
  return result.data;
};
```

---

### 7.2 Auth Module Scaffold

**`src/modules/auth/auth.service.ts`**
```typescript
@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokensDto> {
    const exists = await this.prisma.webUser.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const hash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.webUser.create({
      data: { ...dto, passwordHash: hash },
    });

    await this.notificationsService.queueEmail({
      template:       'WELCOME',
      recipientEmail: user.email,
      userId:         user.id,
      idempotencyKey: `WELCOME:${user.id}`,
    });

    return this.issueTokenPair(user);
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.prisma.webUser.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash!)))
      throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new ForbiddenException('Account suspended');

    await this.prisma.webUser.update({
      where: { id: user.id }, data: { lastLoginAt: new Date() }
    });
    return this.issueTokenPair(user);
  }

  async createGuestSession(): Promise<{ sessionToken: string; expiresAt: Date }> {
    const token = `gs_${randomBytes(24).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.guestSession.create({
      data: { sessionToken: token, expiresAt }
    });
    return { sessionToken: token, expiresAt };
  }

  private async issueTokenPair(user: WebUser): Promise<AuthTokensDto> {
    const family = randomUUID();
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email, type: user.type },
      { expiresIn: this.config.get('JWT_ACCESS_EXPIRES') }
    );
    const rawRefresh = `ref_${randomBytes(32).toString('base64url')}`;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id, family,
        tokenHash: sha256(rawRefresh),
        expiresAt: addDays(new Date(), 7),
      }
    });
    return { accessToken, refreshToken: rawRefresh, user };
  }
}
```

---

### 7.3 ERP Adapter

**`src/modules/erp-adapter/erp.adapter.ts`**
```typescript
@Injectable()
export class ErpAdapter {
  private readonly http: AxiosInstance;

  constructor(private config: ConfigService, private redis: Redis) {
    this.http = axios.create({
      baseURL: config.get('ERP_API_URL'),
      headers: { 'X-Internal-Key': config.get('ERP_API_KEY') },
      timeout: 5000,
    });
    axiosRetry(this.http, { retries: 3, retryDelay: axiosRetry.exponentialDelay });
  }

  async getProducts(): Promise<ErpProduct[]> {
    const { data } = await this.http.get('/v1/products?limit=500&isActive=true');
    return data.data;
  }

  async getPriceAgreement(erpCustomerId: string, productId: string) {
    const key = `b2b:prices:${erpCustomerId}:${productId}`;
    const hit = await this.redis.get(key);
    if (hit) return JSON.parse(hit);

    const { data } = await this.http.get(
      `/v1/customers/${erpCustomerId}/price-agreements?productId=${productId}`
    ).catch(() => ({ data: { data: [] } }));

    const agreement = data.data?.[0] ?? null;
    if (agreement) await this.redis.setex(key, 900, JSON.stringify(agreement));
    return agreement;
  }

  async createSalesOrder(payload: CreateSalesOrderDto) {
    const { data } = await this.http.post('/v1/sales-orders', payload);
    return data.data;
  }
}
```

---

### 7.4 Checkout Flow

**`src/modules/checkout/checkout.service.ts`** (core logic)
```typescript
async initiate(dto: InitiateCheckoutDto, actor: Actor): Promise<InitiateResult> {
  // 1. Load & validate cart
  const cart = await this.cartService.getCart(actor);
  if (!cart.items.length) throw new BadRequestException('Cart is empty');

  // 2. Validate delivery slot
  validateDeliverySlot(dto.deliveryDate, dto.deliveryWindow);
  const slot = await this.slotService.reserve(dto.deliveryDate, dto.deliveryWindow);

  // 3. Price all items (re-price server-side — never trust client)
  const pricedItems = await Promise.all(
    cart.items.map(item =>
      this.pricingService.priceItem(item, actor.userId, actor.hasSubscription)
    )
  );

  // 4. Compute totals
  const subtotal = pricedItems.reduce((s, i) => s.plus(i.lineTotalPen), new Decimal(0));
  const discount = pricedItems.reduce((s, i) => s.plus(i.discountPen), new Decimal(0));
  const igv      = subtotal.minus(discount).times('0.18').toDecimalPlaces(4);
  const total    = subtotal.minus(discount).plus(igv);

  // 5. Create Culqi order
  const culqiOrder = await this.culqiService.createOrder({
    amount:      total.times(100).toInteger().toNumber(), // centimos
    currencyCode:'PEN',
    description: `VictorOS pedido — ${total.toFixed(2)} PEN`,
    clientDetails: { firstName: actor.fullName ?? 'Cliente', email: actor.email },
  });

  // 6. Persist pending order in our DB
  const orderNumber = await this.generateOrderNumber();
  const order = await this.ordersService.createPending({
    orderNumber, actor, dto, pricedItems,
    subtotal, discount, igv, total,
    culqiOrderId: culqiOrder.id,
  });

  return {
    culqiOrderId:   culqiOrder.id,
    culqiPublicKey: this.config.get('CULQI_PUBLIC_KEY'),
    amountCentimos: culqiOrder.amount,
    orderRef:       orderNumber,
  };
}

async complete(dto: CompleteCheckoutDto): Promise<Order> {
  const order = await this.ordersService.findByNumber(dto.orderRef);
  if (!order || order.status !== 'PENDING_PAYMENT')
    throw new BadRequestException('Invalid order reference');

  // Create Culqi charge using token from frontend
  const charge = await this.culqiService.createCharge({
    amount:      order.totalPen.times(100).toInteger().toNumber(),
    currencyCode:'PEN',
    email:       order.buyerEmail,
    sourceId:    dto.culqiToken,
    orderId:     dto.culqiOrderId,
  });

  // Transition order → PAID (webhook may also do this; use idempotent upsert)
  await this.ordersService.markPaid(order.id, charge.id);

  // Enqueue: ORDER_CREATED email + invoice generation
  await this.notificationsService.queueEmail({
    template:       'ORDER_CREATED',
    recipientEmail: order.buyerEmail,
    orderId:        order.id,
    idempotencyKey: `ORDER_CREATED:${order.id}`,
  });
  await this.invoiceQueue.add('generate', { orderId: order.id });

  return order;
}
```

---

### 7.5 Subscription Billing Scheduler

```typescript
// queue/processors/subscription-billing.processor.ts
@Processor('subscription-billing')
export class SubscriptionBillingProcessor {
  // Cron job adds bulk jobs every night at 06:00 Lima time
  @Cron('0 6 * * *', { timeZone: 'America/Lima' })
  async scheduleDaily() {
    const today = new Date().toISOString().split('T')[0];
    const subs  = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', nextBillingDate: { lte: new Date(today) } }
    });
    for (const sub of subs) {
      await this.billingQueue.add('bill-subscription', { subscriptionId: sub.id }, {
        jobId:    `bill:${sub.id}:${today}`,
        attempts: 3,
        backoff:  { type: 'exponential', delay: 86_400_000 }, // 1-day retry
      });
    }
  }

  @Process('bill-subscription')
  async billOne(job: Job<{ subscriptionId: string }>) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: job.data.subscriptionId },
      include: { items: true, user: true },
    });
    if (!sub || sub.status !== 'ACTIVE') return;

    // Charge Culqi with saved token
    const charge = await this.culqiService.chargeCustomer({
      customerId: sub.culqiCustomerId!,
      cardToken:  sub.culqiCardToken!,
      amount:     new Decimal(sub.monthlyAmountPen).times(100).toInteger().toNumber(),
    });

    // Generate subscription deliveries for next billing period
    await this.subscriptionService.generateDeliveries(sub);

    // Advance next billing date
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data:  { nextBillingDate: addMonths(new Date(), 1) },
    });

    await this.notificationsService.queueEmail({
      template:       'SUBSCRIPTION_BILLING',
      recipientEmail: sub.user.email,
      idempotencyKey: `SUBSCRIPTION_BILLING:${sub.id}:${job.data.subscriptionId}`,
    });
  }
}
```

---

### 7.6 Invoice PDF Generation

```typescript
// queue/processors/invoice.processor.ts
@Process('generate')
async generateInvoice(job: Job<{ orderId: string }>) {
  const order = await this.prisma.order.findUnique({
    where: { id: job.data.orderId }, include: { items: true }
  });

  // 1. Generate PDF (puppeteer or pdfmake)
  const pdfBuffer = await this.pdfService.render('invoice', {
    order, issueDate: new Date(),
    serie: order.invoiceType === 'BOLETA' ? 'B001' : 'F001',
  });

  // 2. Upload to S3/R2
  const key = `invoices/${order.orderNumber}.pdf`;
  await this.s3.putObject({
    Bucket: this.config.get('S3_BUCKET'), Key: key,
    Body: pdfBuffer, ContentType: 'application/pdf',
  });

  // 3. Save invoice record
  await this.prisma.webInvoice.upsert({
    where:  { orderId: order.id },
    create: { orderId: order.id, invoiceType: order.invoiceType!,
              serie: ..., pdfUrl: `s3://${key}` },
    update: { pdfUrl: `s3://${key}` },
  });

  // 4. Optionally sync to ERP
  if (order.erpSalesOrderId) {
    await this.erpAdapter.createInvoice({ salesOrderId: order.erpSalesOrderId });
  }
}
```

---

### 7.7 Milestones

| # | Milestone | Est. |
|---|-----------|------|
| 1 | Project scaffold + Prisma migrations + Auth (register/login/guest/refresh) | Week 1 |
| 2 | ERP adapter + B2B price cache + Catalog endpoints + product sync job | Week 1–2 |
| 3 | Cart (guest + user) + Cart merge on login | Week 2 |
| 4 | Checkout (slots, validate, initiate + Culqi order creation) | Week 2 |
| 5 | Culqi charge + webhook handler + order finalization | Week 2–3 |
| 6 | Orders module (list, detail, status history) + Admin status updates | Week 3 |
| 7 | Invoice PDF generation + S3 upload + download endpoint | Week 3 |
| 8 | Subscriptions (CRUD, pause/cancel, billing scheduler) | Week 3–4 |
| 9 | Email worker (SES + templates + idempotency) | Week 4 |
| 10 | Account module (profile, addresses) + reorder suggestions | Week 4 |
| 11 | Rate limiting + security hardening + load testing | Week 5 |

---

## 8. Acceptance Criteria Checklist (QA)

### Auth
- [ ] `POST /auth/register` creates user, returns JWT pair, sends WELCOME email
- [ ] `POST /auth/login` with bad password returns 401; 5 failures in 15 min → 429
- [ ] Refresh token rotation: reuse of old token revokes entire family
- [ ] `POST /auth/guest` returns opaque session_token; cart attached
- [ ] Password reset token expires in 1h and can only be used once
- [ ] Guest session expires in 24h; attempting expired token returns 401

### Catalog & Pricing
- [ ] B2B user with 10% agreement + active subscription sees 28% combined discount
- [ ] B2C user sees base price + IGV only
- [ ] Guest user sees base price + IGV only
- [ ] Price lookup reads from Redis cache (verify with 2nd request < 1ms)
- [ ] Cache invalidation via `/internal/cache/invalidate/prices/:id` clears Redis keys

### Cart & Checkout
- [ ] Add to cart, update qty, remove item all work for both guest and auth users
- [ ] `POST /cart/merge` merges guest cart into user cart on login (no duplicates)
- [ ] Checkout with delivery date > 48h from now returns 400
- [ ] Checkout with delivery date < 2h from now returns 400
- [ ] Invalid delivery window string returns 400
- [ ] Slot at max capacity returns 409
- [ ] Server re-prices all items (changing cart price client-side has no effect)

### Payments
- [ ] Culqi webhook with invalid signature returns 401
- [ ] Duplicate `charge.succeeded` webhook is idempotent (order not double-transitioned)
- [ ] Failed charge transitions payment to FAILED and does NOT mark order PAID
- [ ] `GET /orders/:id/invoice` returns 404 until invoice is generated

### Orders
- [ ] Status transitions follow state machine; invalid transitions return 422
- [ ] Staff PATCH to CONFIRMED triggers ORDER_CONFIRMED email
- [ ] Staff PATCH to ON_THE_WAY triggers ORDER_ON_THE_WAY email
- [ ] Staff PATCH to DELIVERED triggers ORDER_DELIVERED email
- [ ] Cancellation from any pre-PICKED_UP state succeeds; later states return 422

### Subscriptions
- [ ] Creating subscription charges Culqi immediately for first month
- [ ] WEEKLY subscription generates 4 delivery entries per billing cycle
- [ ] BIWEEKLY subscription generates 2 delivery entries per billing cycle
- [ ] Pausing stops new deliveries but current month's orders are unaffected
- [ ] Cancelling stops billing at end of paid period
- [ ] 3 consecutive billing failures → status CANCELLED + notification sent

### Email
- [ ] All 12 email templates render without errors in test environment
- [ ] Sending the same idempotency_key twice does not result in two emails sent
- [ ] Failed sends are retried 3× with exponential backoff
- [ ] Dead-letter jobs alert admin (Slack or internal log)

### Security
- [ ] No route returns a raw SQL error or stack trace
- [ ] Card numbers never appear in DB, logs, or API responses
- [ ] S3 invoice URLs are presigned with 15-min expiry
- [ ] Guest `email` / `fullName` fields are masked in application logs
- [ ] `Authorization: Bearer <invalid>` returns 401 on all protected routes
- [ ] `X-Guest-Token: <expired>` returns 401

### Performance
- [ ] `GET /catalog/products` responds in < 100ms with warm Redis cache
- [ ] `GET /catalog/products/:id/price` for B2B cached hit responds in < 30ms
- [ ] Checkout initiation (Culqi order creation included) < 2s p95
- [ ] Webhook handler acknowledges Culqi within 5s (async processing via queue)
