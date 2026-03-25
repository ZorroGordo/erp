# Victorsdou Ecommerce — Backend Integration Spec

> Generated from live Supabase DB + source code on 2026-03-14.
> Paste this entire document into the frontend build prompt.

---

## 1. Supabase Project Details

```
Project URL (NEXT_PUBLIC_SUPABASE_URL): https://xvfomtqknntvtwqoobhb.supabase.co
Anon key env var: NEXT_PUBLIC_SUPABASE_ANON_KEY  (value must be retrieved from Supabase dashboard)
Service role key: NOT used by the frontend — only the ERP backend uses it server-side
```

**⚠️ Important:** There are **no RLS policies** on any public table. The frontend must **never query Supabase directly for customer or order data**. All reads and writes go through the ERP REST API.

---

## 2. ERP Backend API

```
Base URL: https://erp-production-10eb.up.railway.app
API prefix: /v1
Auth: Bearer JWT (access token from store login)
```

### Existing endpoints relevant to the storefront

#### Public catalog (no auth required)
```
GET /v1/products/public
  → Returns products where isActive=true AND isB2cVisible=true
  → Response: { data: Product[] }
  → Cached in Redis for 30 seconds
  → Fields returned: id, sku, name, basePricePen, taxClass, unitOfSale, imageUrl, category, minOrderQty

GET /v1/products/categories  (requires internal ERP auth — do NOT call from storefront)
```

#### Internal ERP auth (for ERP staff only — NOT for web customers)
```
POST /v1/auth/login         { email, password } → { data: { user, tokens: { accessToken, expiresIn } } }
POST /v1/auth/refresh       (uses HttpOnly cookie vos_refresh) → { data: { tokens } }
POST /v1/auth/logout        Bearer required
GET  /v1/auth/me            Bearer required
```

#### Public stubs (not yet implemented — return empty data)
```
GET  /public/v1/catalog         → TODO placeholder
GET  /public/v1/catalog/:sku    → TODO placeholder
POST /webhooks/payment-gateway  → TODO placeholder
```

**⚠️ Store-specific endpoints (cart, orders, web auth, payments) do NOT yet exist in the backend.** The schema is fully built in the DB. The frontend team needs to build these API routes together with the backend, OR call Supabase directly with the service role key from a Next.js server component / API route (never from the browser).

---

## 3. Database Schema — Ecommerce Tables

All tables are in the `public` schema. No RLS. No views.

---

### Table: `product_categories`

```
Table: product_categories
Schema: public
Columns:
  - id         : text    : NOT NULL : (none)  : Slug-style ID (e.g. "cat-panes")
  - name        : text    : NOT NULL : (none)  : Category display name (UNIQUE)
  - parentId    : text    : NULL     : (none)  : Self-reference for subcategories
  - isActive    : boolean : NOT NULL : true    :

Foreign keys:
  - parentId → product_categories.id

Indexes:
  - product_categories_pkey UNIQUE (id)
  - product_categories_name_key UNIQUE (name)

Existing category IDs:
  cat-bebidas, cat-empaquetados, cat-panes, cat-pasteles, cat-salados, cat-tortas
  392ee32f-e93e-49d9-b8ef-45d6547297c0 (Galletas)
```

---

### Table: `products`

```
Table: products
Schema: public
Columns:
  - id                    : text     : NOT NULL : (none)          : ERP product ID
  - sku                   : text     : NOT NULL : (none)          : UNIQUE
  - name                  : text     : NOT NULL : (none)          :
  - description           : text     : NULL     : (none)          :
  - categoryId            : text     : NOT NULL : (none)          : FK → product_categories.id
  - basePricePen          : numeric  : NOT NULL : (none)          : Base price in Soles (ex-IGV)
  - taxClass              : TaxClass : NOT NULL : TAXABLE_IGV18   : Enum (see below)
  - activeRecipeId        : text     : NULL     : (none)          : FK → recipes.id
  - unitOfSale            : text     : NOT NULL : 'unit'          :
  - weightGrams           : integer  : NULL     : (none)          :
  - imageUrl              : text     : NULL     : (none)          : Single image URL (legacy field)
  - isActive              : boolean  : NOT NULL : true            :
  - isB2cVisible          : boolean  : NOT NULL : true            : Show on public storefront
  - isB2bVisible          : boolean  : NOT NULL : true            : Show in B2B portal
  - minOrderQty           : numeric  : NOT NULL : 1               :
  - metadata              : jsonb    : NULL     : (none)          : Arbitrary extra data
  - createdAt             : timestamp: NOT NULL : CURRENT_TIMESTAMP:
  - updatedAt             : timestamp: NOT NULL : (none)          :
  - ecommerceEnabled      : boolean  : NOT NULL : false           : Toggle per-product ecommerce visibility
  - ecommercePrice        : numeric  : NULL     : (none)          : Override price for ecommerce (if NULL, use basePricePen)
  - ecommerceImages       : jsonb    : NOT NULL : '[]'            : Array of image URLs e.g. ["https://...","https://..."]
  - ecommerceMainImageIndex: integer : NOT NULL : 0               : Index into ecommerceImages array

Foreign keys:
  - categoryId → product_categories.id

Indexes:
  - products_pkey UNIQUE (id)
  - products_sku_key UNIQUE (sku)

Notes:
  - For storefront: query WHERE isActive=true AND isB2cVisible=true AND ecommerceEnabled=true
  - Selling price = ecommercePrice ?? basePricePen
  - IGV (18%): if taxClass='TAXABLE_IGV18', price shown to B2C includes IGV
  - Images: use ecommerceImages array; ecommerceMainImageIndex is the hero image
```

---

### Table: `web_users`

```
Table: web_users
Schema: public
Columns:
  - id               : uuid    : NOT NULL : (none)     : PK (gen_random_uuid())
  - email            : varchar : NOT NULL : (none)     : UNIQUE
  - passwordHash     : varchar : NULL     : (none)     : bcrypt hash (nullable = social login / passwordless)
  - fullName         : varchar : NULL     : (none)     :
  - phone            : varchar : NULL     : (none)     :
  - dob              : date    : NULL     : (none)     : Date of birth
  - docType          : DocType : NULL     : (none)     : Enum: DNI | RUC | CE | PASAPORTE
  - docNumber        : varchar : NULL     : (none)     :
  - type             : UserType: NOT NULL : 'B2C'      : Enum: B2C | B2B
  - erpCustomerId    : uuid    : NULL     : (none)     : Link to internal customers table
  - isEmailVerified  : boolean : NOT NULL : false      :
  - isActive         : boolean : NOT NULL : true       :
  - lastLoginAt      : timestamp: NULL    : (none)     :
  - createdAt        : timestamp: NOT NULL: CURRENT_TIMESTAMP:
  - updatedAt        : timestamp: NOT NULL: (none)     :

Foreign keys:
  - none (erpCustomerId references customers.id but is NOT a DB-level FK)

Indexes:
  - web_users_pkey UNIQUE (id)
  - web_users_email_key UNIQUE (email)
  - web_users_email_idx (email)
  - web_users_erpCustomerId_idx (erpCustomerId)

Related tables for auth flow:
  - email_verifications (token-based email confirm)
  - password_resets (token-based reset)
  - refresh_tokens (JWT refresh token store)
```

---

### Table: `web_user_addresses`

```
Table: web_user_addresses
Schema: public
Columns:
  - id           : uuid    : NOT NULL : (none) :
  - userId       : uuid    : NOT NULL : (none) : FK → web_users.id
  - label        : varchar : NOT NULL : (none) : e.g. "Casa", "Trabajo"
  - addressLine1 : varchar : NOT NULL : (none) :
  - addressLine2 : varchar : NULL     : (none) :
  - district     : varchar : NOT NULL : (none) : Lima district name
  - province     : varchar : NULL     : (none) :
  - department   : varchar : NULL     : (none) :
  - isDefault    : boolean : NOT NULL : false  :

Foreign keys:
  - userId → web_users.id

Indexes:
  - web_user_addresses_pkey UNIQUE (id)
  - web_user_addresses_userId_idx (userId)
```

---

### Table: `guest_sessions`

```
Table: guest_sessions
Schema: public
Columns:
  - id           : uuid    : NOT NULL : (none) :
  - sessionToken : varchar : NOT NULL : (none) : UNIQUE — store in localStorage
  - email        : varchar : NULL     : (none) :
  - fullName     : varchar : NULL     : (none) :
  - phone        : varchar : NULL     : (none) :
  - docType      : DocType : NULL     : (none) : Enum: DNI | RUC | CE | PASAPORTE
  - docNumber    : varchar : NULL     : (none) :
  - expiresAt    : timestamp: NOT NULL: (none) :
  - createdAt    : timestamp: NOT NULL: CURRENT_TIMESTAMP:

Indexes:
  - guest_sessions_pkey UNIQUE (id)
  - guest_sessions_sessionToken_key UNIQUE (sessionToken)
  - guest_sessions_sessionToken_idx (sessionToken)
```

---

### Table: `carts`

```
Table: carts
Schema: public
Columns:
  - id             : uuid      : NOT NULL : (none) :
  - userId         : uuid      : NULL     : (none) : FK → web_users.id (NULL if guest)
  - guestSessionId : uuid      : NULL     : (none) : FK → guest_sessions.id (NULL if logged in)
  - createdAt      : timestamp : NOT NULL : CURRENT_TIMESTAMP:
  - updatedAt      : timestamp : NOT NULL : (none) :

Foreign keys:
  - userId → web_users.id
  - guestSessionId → guest_sessions.id

Indexes:
  - carts_pkey UNIQUE (id)
  - carts_userId_key UNIQUE (userId)         ← 1 cart per logged-in user
  - carts_guestSessionId_key UNIQUE (guestSessionId)  ← 1 cart per guest session

Notes:
  - Either userId OR guestSessionId is set, never both
  - One cart per user/session enforced by unique indexes
```

---

### Table: `cart_items`

```
Table: cart_items
Schema: public
Columns:
  - id           : uuid    : NOT NULL : (none) :
  - cartId       : uuid    : NOT NULL : (none) : FK → carts.id
  - erpProductId : uuid    : NOT NULL : (none) : References products.id (stored as uuid even though products.id is text)
  - sku          : varchar : NOT NULL : (none) : Snapshot of product SKU at time of add
  - name         : varchar : NOT NULL : (none) : Snapshot of product name
  - qty          : integer : NOT NULL : 1      :
  - unitPrice    : numeric : NOT NULL : (none) : Price at time of add (ex-IGV)
  - igvRate      : numeric : NOT NULL : 0.18   :
  - createdAt    : timestamp: NOT NULL: CURRENT_TIMESTAMP:
  - updatedAt    : timestamp: NOT NULL: (none) :

Foreign keys:
  - cartId → carts.id

Indexes:
  - cart_items_pkey UNIQUE (id)
  - cart_items_cartId_erpProductId_key UNIQUE (cartId, erpProductId)  ← no duplicates per cart
```

---

### Table: `orders`

```
Table: orders
Schema: public
Columns:
  - id                  : uuid         : NOT NULL : (none)             :
  - orderNumber         : varchar      : NOT NULL : (none)             : UNIQUE — human-readable e.g. "VD-00042"
  - userId              : uuid         : NULL     : (none)             : FK → web_users.id (NULL if guest order)
  - guestEmail          : varchar      : NULL     : (none)             : Guest email if no userId
  - guestPhone          : varchar      : NULL     : (none)             :
  - addressId           : uuid         : NULL     : (none)             : FK → web_user_addresses.id
  - deliveryAddressSnap : jsonb        : NULL     : (none)             : Snapshot of address at order time
  - deliveryDate        : date         : NOT NULL : (none)             :
  - deliveryWindow      : DeliveryWindow: NOT NULL: (none)             : Enum: MORNING | AFTERNOON
  - subtotalExIgv       : numeric      : NOT NULL : (none)             :
  - igvAmount           : numeric      : NOT NULL : (none)             :
  - totalPen            : numeric      : NOT NULL : (none)             : subtotalExIgv + igvAmount - discountAmount
  - status              : OrderStatus  : NOT NULL : PENDING_PAYMENT    : Enum (see below)
  - erpSalesOrderId     : uuid         : NULL     : (none)             : Links to internal sales_orders when synced
  - subscriptionId      : uuid         : NULL     : (none)             : FK → subscriptions.id
  - promoCode           : varchar      : NULL     : (none)             :
  - discountAmount      : numeric      : NOT NULL : 0                  :
  - notes               : text         : NULL     : (none)             :
  - createdAt           : timestamp    : NOT NULL : CURRENT_TIMESTAMP  :
  - updatedAt           : timestamp    : NOT NULL : (none)             :

Foreign keys:
  - userId → web_users.id
  - addressId → web_user_addresses.id
  - subscriptionId → subscriptions.id

Indexes:
  - orders_pkey UNIQUE (id)
  - orders_orderNumber_key UNIQUE (orderNumber)
  - orders_userId_idx (userId)
  - orders_status_idx (status)
  - orders_deliveryDate_idx (deliveryDate)
```

---

### Table: `order_items`

```
Table: order_items
Schema: public
Columns:
  - id           : uuid    : NOT NULL : (none) :
  - orderId      : uuid    : NOT NULL : (none) : FK → orders.id
  - erpProductId : uuid    : NOT NULL : (none) : References products.id
  - sku          : varchar : NOT NULL : (none) : Snapshot
  - name         : varchar : NOT NULL : (none) : Snapshot
  - qty          : integer : NOT NULL : (none) :
  - unitPrice    : numeric : NOT NULL : (none) : Ex-IGV price
  - igvRate      : numeric : NOT NULL : (none) :
  - lineTotal    : numeric : NOT NULL : (none) : qty * unitPrice * (1 + igvRate)

Foreign keys:
  - orderId → orders.id

Indexes:
  - order_items_pkey UNIQUE (id)
```

---

### Table: `order_status_history`

```
Table: order_status_history
Schema: public
Columns:
  - id        : uuid        : NOT NULL : (none)             :
  - orderId   : uuid        : NOT NULL : (none)             : FK → orders.id
  - status    : OrderStatus : NOT NULL : (none)             :
  - note      : varchar     : NULL     : (none)             :
  - changedBy : varchar     : NULL     : (none)             : User ID or "system"
  - createdAt : timestamp   : NOT NULL : CURRENT_TIMESTAMP  :

Foreign keys:
  - orderId → orders.id

Indexes:
  - order_status_history_pkey UNIQUE (id)
```

---

### Table: `payments`

```
Table: payments
Schema: public
Columns:
  - id              : uuid          : NOT NULL : (none)    :
  - orderId         : uuid          : NOT NULL : (none)    : FK → orders.id
  - culqiChargeId   : varchar       : NULL     : (none)    : UNIQUE — Culqi charge ID
  - culqiOrderId    : varchar       : NULL     : (none)    : Culqi order ID (for Culqi Orders flow)
  - amountCentimos  : integer       : NOT NULL : (none)    : Amount in céntimos (e.g. 1500 = S/.15.00)
  - currency        : varchar       : NOT NULL : 'PEN'     :
  - status          : PaymentStatus : NOT NULL : PENDING   : Enum: PENDING | SUCCEEDED | FAILED | REFUNDED
  - failureReason   : varchar       : NULL     : (none)    :
  - refundedAt      : timestamp     : NULL     : (none)    :
  - createdAt       : timestamp     : NOT NULL : CURRENT_TIMESTAMP:
  - updatedAt       : timestamp     : NOT NULL : (none)    :

Foreign keys:
  - orderId → orders.id

Indexes:
  - payments_pkey UNIQUE (id)
  - payments_culqiChargeId_key UNIQUE (culqiChargeId)
  - payments_orderId_idx (orderId)

Notes:
  - Payment processor: Culqi (https://culqi.com) — Peruvian payment gateway
  - Frontend uses Culqi.js to tokenize card → sends token to backend → backend creates charge
  - Frontend env var needed: NEXT_PUBLIC_CULQI_PUBLIC_KEY
```

---

### Table: `delivery_slots`

```
Table: delivery_slots
Schema: public
Columns:
  - id           : uuid          : NOT NULL : (none) :
  - date         : date          : NOT NULL : (none) :
  - window       : DeliveryWindow: NOT NULL : (none) : Enum: MORNING | AFTERNOON
  - maxOrders    : integer       : NOT NULL : 50     :
  - bookedOrders : integer       : NOT NULL : 0      : Incremented on each order confirmation
  - isBlocked    : boolean       : NOT NULL : false  :

Indexes:
  - delivery_slots_pkey UNIQUE (id)
  - delivery_slots_date_window_key UNIQUE (date, window)

Notes:
  - A slot is available if: isBlocked=false AND bookedOrders < maxOrders
  - Frontend should fetch available slots for the next N days and display as a date picker
```

---

### Table: `subscriptions`

```
Table: subscriptions
Schema: public
Columns:
  - id              : uuid         : NOT NULL : (none)   :
  - userId          : uuid         : NOT NULL : (none)   : FK → web_users.id
  - frequency       : SubFrequency : NOT NULL : (none)   : Enum: WEEKLY | BIWEEKLY
  - status          : SubStatus    : NOT NULL : ACTIVE   : Enum: ACTIVE | PAUSED | CANCELLED
  - deliveryWindow  : DeliveryWindow: NOT NULL: (none)   : Enum: MORNING | AFTERNOON
  - preferredDay    : integer      : NOT NULL : 1        : Day of week (1=Mon … 7=Sun)
  - addressId       : uuid         : NULL     : (none)   : FK → web_user_addresses.id
  - nextBillingDate : date         : NOT NULL : (none)   :
  - pausedUntil     : date         : NULL     : (none)   :
  - cancelledAt     : timestamp    : NULL     : (none)   :
  - createdAt       : timestamp    : NOT NULL : CURRENT_TIMESTAMP:
  - updatedAt       : timestamp    : NOT NULL : (none)   :

Foreign keys:
  - userId → web_users.id

Indexes:
  - subscriptions_pkey UNIQUE (id)
  - subscriptions_userId_idx (userId)
  - subscriptions_status_nextBillingDate_idx (status, nextBillingDate)
```

---

### Table: `subscription_items`

```
Table: subscription_items
Schema: public
Columns:
  - id             : uuid    : NOT NULL : (none) :
  - subscriptionId : uuid    : NOT NULL : (none) : FK → subscriptions.id
  - erpProductId   : uuid    : NOT NULL : (none) : References products.id
  - sku            : varchar : NOT NULL : (none) :
  - name           : varchar : NOT NULL : (none) :
  - qty            : integer : NOT NULL : 1      :

Foreign keys:
  - subscriptionId → subscriptions.id

Indexes:
  - subscription_items_pkey UNIQUE (id)
  - subscription_items_subscriptionId_erpProductId_key UNIQUE (subscriptionId, erpProductId)
```

---

## 4. Enum Types

```sql
-- Order lifecycle
OrderStatus:    CART | PENDING_PAYMENT | PAID | CONFIRMED | IN_PRODUCTION |
                READY_FOR_DISPATCH | OUT_FOR_DELIVERY | DELIVERED | INVOICED |
                COMPLETED | CANCELLED | REFUND_PENDING | REFUNDED | DELIVERED_DISPUTE | PREPARING

-- Payment (in `payments` table — Culqi-based)
PaymentStatus:  PENDING | SUCCEEDED | FAILED | REFUNDED
-- (PaymentStatus also has UNPAID | PARTIAL | PAID in the type def — used by B2B payment_records)

-- Delivery windows
DeliveryWindow: MORNING | AFTERNOON

-- Tax
TaxClass:       TAXABLE_IGV18 | EXEMPT | EXPORT
-- IGV rate is 18% (confirmed in system_config key IGV_RATE)

-- Web user type
UserType:       B2C | B2B

-- Doc types (for invoicing)
DocType:        DNI | RUC | CE | PASAPORTE

-- Subscriptions
SubFrequency:   WEEKLY | BIWEEKLY
SubStatus:      ACTIVE | PAUSED | CANCELLED
```

---

## 5. Supabase Auth Configuration

**Not used for the storefront.** The app uses a custom auth system:

- Web customers: `web_users` table (email + bcrypt passwordHash)
- Token storage: `refresh_tokens` table
- Email verification: `email_verifications` table
- Password reset: `password_resets` table
- Guest checkout: `guest_sessions` table (sessionToken stored in browser localStorage)

No Supabase Magic Link, no Google OAuth, no phone auth configured.

The frontend must implement its own auth API calls against the ERP backend (store auth routes to be built):
```
POST /v1/store/auth/register      (to be built)
POST /v1/store/auth/login         (to be built)
POST /v1/store/auth/refresh       (to be built)
POST /v1/store/auth/verify-email  (to be built)
POST /v1/store/auth/forgot-password (to be built)
POST /v1/store/auth/reset-password  (to be built)
```

---

## 6. Supabase Storage

**No storage buckets configured.** Images are stored as plain URL strings:

- `products.imageUrl` — text field, single legacy image URL
- `products.ecommerceImages` — jsonb array of URL strings, e.g. `["https://...","https://..."]`
- `products.ecommerceMainImageIndex` — integer index of hero image in `ecommerceImages`

If the frontend needs image upload, a storage bucket must be created. Suggested convention (not yet configured):
```
Bucket: product-images (public)
Path:   products/{product_id}/{filename}.webp
URL:    https://xvfomtqknntvtwqoobhb.supabase.co/storage/v1/object/public/product-images/products/{id}/{filename}.webp
```

---

## 7. Existing API Routes & Patterns

### No edge functions configured.

### No database functions (RPC) configured.

### No views configured.

### One relevant existing endpoint
```
GET  /v1/products/public
  Auth: none required
  Response: { data: Array<{ id, sku, name, basePricePen, taxClass, unitOfSale, imageUrl, category: { id, name, parentId, isActive }, minOrderQty }> }
  Notes: Does NOT include ecommercePrice or ecommerceImages — frontend will need /v1/store/products
         with ecommerce fields. A new public ecommerce-specific endpoint should be added.
```

---

## 8. Order Flow

The complete order flow (to be implemented in new store API routes):

```
1. Browse catalog
   GET /v1/products/public  → filter WHERE ecommerceEnabled=true

2. Cart
   - Guest: create guest_session row → sessionToken in localStorage
            one cart row per guest (carts.guestSessionId)
   - Logged in: one cart row per user (carts.userId)
   - cart_items: upsert on (cartId, erpProductId); snapshot sku+name+unitPrice+igvRate at add time

3. Checkout — collect:
   - Delivery address (web_user_addresses.id OR deliveryAddressSnap jsonb)
   - Delivery date + window (validate against delivery_slots)
   - Invoice doc type (DNI / RUC for boleta/factura)

4. Create order
   INSERT orders (status=PENDING_PAYMENT)
   INSERT order_items (one row per cart_items row)
   INSERT order_status_history (status=PENDING_PAYMENT)
   INCREMENT delivery_slots.bookedOrders WHERE date+window match
   DELETE cart_items WHERE cartId=...

5. Payment via Culqi
   a. Frontend: load Culqi.js with NEXT_PUBLIC_CULQI_PUBLIC_KEY
   b. User enters card → Culqi.js returns a single-use token
   c. POST to backend with { orderId, culqiToken }
   d. Backend: creates Culqi charge server-side using CULQI_SECRET_KEY
   e. On success: INSERT payments (status=SUCCEEDED, culqiChargeId=...)
                  UPDATE orders SET status=PAID
                  INSERT order_status_history (status=PAID)
   f. On failure: INSERT payments (status=FAILED, failureReason=...)
                  Order remains PENDING_PAYMENT; user can retry

6. Post-payment
   - Backend creates ERP sales_order (erpSalesOrderId set on order)
   - Order status progresses: CONFIRMED → IN_PRODUCTION → READY_FOR_DISPATCH → OUT_FOR_DELIVERY → DELIVERED

7. Order status tracking
   - Frontend polls or SSE: GET /v1/store/orders/:id  → { order, statusHistory }
   - Terminal statuses: DELIVERED, COMPLETED, CANCELLED, REFUNDED
```

**Valid OrderStatus transitions (customer-facing):**
```
PENDING_PAYMENT → PAID → CONFIRMED → IN_PRODUCTION → READY_FOR_DISPATCH → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
PENDING_PAYMENT → CANCELLED
DELIVERED → DELIVERED_DISPUTE → REFUND_PENDING → REFUNDED
```

---

## 9. Product Data

```
Categories: separate table product_categories (id, name, parentId for subcategories)
            Current categories: Panes, Pasteles, Salados, Tortas, Bebidas, Empaquetados, Galletas

Images: two fields on products table:
  - imageUrl (text, single legacy URL — may be null)
  - ecommerceImages (jsonb array of URL strings — primary source for storefront)
  - ecommerceMainImageIndex (integer, hero image index into ecommerceImages)

Product variants: NOT implemented — no variants table or SKU variants

Stock/inventory: tracked at INGREDIENT level (stock_levels → ingredients),
                 NOT at product level. There is no finished-goods inventory count
                 for the storefront to query. Products are made-to-order.

Sort/featured: no sort_order or isFeatured columns exist yet.
               Frontend should sort by category then name, or add sort_order.

Ecommerce visibility filter: products.ecommerceEnabled=true (default false)
                             AND products.isActive=true AND products.isB2cVisible=true
```

---

## 10. Delivery Configuration

```
Delivery zones/districts: NOT defined as a table. No delivery_zones or district list table exists.
Delivery fee: NOT defined in DB or system_config. Must be hardcoded or added.
Delivery time slots: delivery_slots table (date + window: MORNING|AFTERNOON, maxOrders=50 default)
Minimum order value: NOT defined in system_config. Must be hardcoded or added.

system_config has NO ecommerce-specific keys. Existing keys are:
  AFP rates, ONP_RATE, ESSALUD_RATE, IGV_RATE (0.18), CTS, UIT_VALUE_PEN, production shift capacities.
```

**Delivery windows mean (to be confirmed with operations):**
- `MORNING` — typically morning delivery slot
- `AFTERNOON` — typically afternoon delivery slot

---

## 11. Environment Variables

```bash
# Supabase (if frontend queries Supabase directly via server-side routes)
NEXT_PUBLIC_SUPABASE_URL=https://xvfomtqknntvtwqoobhb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=           # from Supabase dashboard → Project Settings → API
SUPABASE_SERVICE_ROLE_KEY=               # ONLY in server-side env (Next.js API routes), NEVER public

# ERP Backend API
NEXT_PUBLIC_ERP_API_URL=https://erp-production-10eb.up.railway.app

# Payment — Culqi (Peruvian payment gateway, https://culqi.com)
NEXT_PUBLIC_CULQI_PUBLIC_KEY=            # from Culqi dashboard → public/test key
CULQI_SECRET_KEY=                        # ONLY server-side, NEVER public

# App
NEXT_PUBLIC_SITE_URL=                    # e.g. https://tienda.victorsdou.com
```

---

## 12. Notes & Caveats for Frontend Team

1. **No store-specific API routes exist yet** in the ERP backend. The DB schema is complete, but routes for `/store/auth`, `/store/cart`, `/store/orders`, `/store/payments` need to be built. The frontend can either (a) call Supabase directly from Next.js server components using the service role key, or (b) implement these routes in the backend first.

2. **No RLS** — never expose the Supabase anon key in the browser for data mutations. All writes to orders, cart, payments must go through authenticated API routes.

3. **Culqi is the payment processor** — not Stripe. Use `https://js.culqi.com/culqi-js` for card tokenization. Culqi settings/dashboard: https://culqipanel.culqi.com.

4. **Tax (IGV)**: All prices in the DB are ex-IGV (base). Apply 18% for display to B2C customers. `lineTotal = qty * unitPrice * 1.18`. `igvAmount = subtotalExIgv * 0.18`.

5. **`ecommercePrice` vs `basePricePen`**: The selling price for ecommerce = `ecommercePrice ?? basePricePen`. Only use `ecommercePrice` if it's non-null.

6. **No product stock levels** — products are made-to-order bakery items. Do not build "out of stock" logic unless requirements change.

7. **Guest checkout is supported** — `carts.guestSessionId` links to `guest_sessions`. Store `sessionToken` in localStorage. Merge cart on login.

8. **orderNumber format**: Not auto-generated by DB — must be generated by the backend API (e.g. sequential `VD-XXXXX`).

9. **No delivery fee or district restriction** configured — must be defined with Victor/operations before building checkout.
