-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'FINANCE_MGR', 'OPS_MGR', 'SALES_MGR', 'WAREHOUSE', 'PRODUCTION', 'PROCUREMENT', 'ACCOUNTANT', 'SALES_AGENT', 'DRIVER', 'CUSTOMER_B2C', 'CUSTOMER_B2B', 'AUDITOR');

-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('RAW_MATERIAL', 'FINISHED_GOODS', 'PACKAGING', 'GENERAL');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_RECEIPT', 'PRODUCTION_CONSUMPTION', 'WASTE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "WasteType" AS ENUM ('SPOILAGE', 'PRODUCTION_OVER_RUN', 'DAMAGE', 'EXPIRED', 'OTHER');

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIAL_RECEIVED', 'FULLY_RECEIVED', 'INVOICED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('B2C', 'B2B');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('DNI', 'RUC', 'CE', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "PricingType" AS ENUM ('FIXED_PRICE', 'DISCOUNT_PCT');

-- CreateEnum
CREATE TYPE "TaxClass" AS ENUM ('TAXABLE_IGV18', 'EXEMPT', 'EXPORT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CART', 'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'INVOICED', 'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'DELIVERED_DISPUTE');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('ECOMMERCE', 'B2B_PORTAL', 'SALES_AGENT', 'IN_STORE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "InvoiceDocType" AS ENUM ('FACTURA', 'BOLETA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'GUIA_REMISION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "InvoiceEntityType" AS ENUM ('CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SourceModule" AS ENUM ('SALES', 'PROCUREMENT', 'PRODUCTION', 'PAYROLL', 'MANUAL', 'ADJUSTMENT', 'BANKING');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('INDEFINIDO', 'PLAZO_FIJO', 'PART_TIME');

-- CreateEnum
CREATE TYPE "PensionSystem" AS ENUM ('AFP', 'ONP');

-- CreateEnum
CREATE TYPE "PayPeriodType" AS ENUM ('MONTHLY', 'QUINCENA');

-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('OPEN', 'PROCESSED', 'PAID', 'CLOSED');

-- CreateEnum
CREATE TYPE "DeliveryRouteStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DeliveryJobStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('NOT_HOME', 'ADDRESS_ERROR', 'DAMAGED', 'REFUSED', 'OTHER');

-- CreateEnum
CREATE TYPE "ForecastStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanSuggestionStatus" AS ENUM ('SUGGESTED', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DemandSource" AS ENUM ('B2B_ORDER', 'FORECAST_B2C', 'FORECAST_B2B');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'DISPUTED', 'PENDING');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "roles" "UserRole"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseUom" TEXT NOT NULL,
    "avgCostPen" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "isPerishable" BOOLEAN NOT NULL DEFAULT false,
    "shelfLifeDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allergenFlags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uom_conversions" (
    "id" TEXT NOT NULL,
    "fromUom" TEXT NOT NULL,
    "toUom" TEXT NOT NULL,
    "factor" DECIMAL(14,8) NOT NULL,
    "ingredientId" TEXT,

    CONSTRAINT "uom_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qtyOnHand" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "qtyReserved" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "avgCostPen" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "lastMovementAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "refDocType" TEXT,
    "refDocId" TEXT,
    "ingredientId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "batchId" TEXT,
    "qtyIn" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "qtyOut" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "unitCostPen" DECIMAL(14,6) NOT NULL,
    "totalCostPen" DECIMAL(14,4) NOT NULL,
    "balanceAfter" DECIMAL(14,4) NOT NULL,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierLotNo" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "qtyReceived" DECIMAL(14,4) NOT NULL,
    "qtyRemaining" DECIMAL(14,4) NOT NULL,
    "unitCostPen" DECIMAL(14,6) NOT NULL,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reorder_rules" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "minQty" DECIMAL(14,4) NOT NULL,
    "maxQty" DECIMAL(14,4) NOT NULL,
    "reorderPoint" DECIMAL(14,4) NOT NULL,
    "safetyStockQty" DECIMAL(14,4) NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 1,
    "preferredSupplierId" TEXT,

    CONSTRAINT "reorder_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "yieldQty" DECIMAL(10,4) NOT NULL,
    "yieldUom" TEXT NOT NULL,
    "status" "RecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "changeReason" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyRequired" DECIMAL(14,6) NOT NULL,
    "uom" TEXT NOT NULL,
    "wasteFactorPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeVersion" INTEGER NOT NULL,
    "plannedQty" DECIMAL(10,4) NOT NULL,
    "actualQty" DECIMAL(10,4),
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "shift" TEXT,
    "linkedSalesOrderIds" TEXT[],
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_consumptions" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "batchId" TEXT,
    "plannedQty" DECIMAL(14,4) NOT NULL,
    "actualQty" DECIMAL(14,4),
    "variance" DECIMAL(14,4),
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "production_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_logs" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "wasteType" "WasteType" NOT NULL,
    "qty" DECIMAL(14,4) NOT NULL,
    "costValue" DECIMAL(14,4) NOT NULL,
    "reason" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "ruc" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "rating" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_price_lists" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "uom" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "moq" DECIMAL(14,4),
    "leadTimeDays" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_performance" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "poCount" INTEGER NOT NULL DEFAULT 0,
    "onTimeDeliveryPct" DECIMAL(5,2),
    "avgLeadTimeDays" DECIMAL(6,2),
    "priceVariancePct" DECIMAL(5,2),
    "invoiceAccuracyPct" DECIMAL(5,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "subtotalPen" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "igvPen" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalPen" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "expectedDeliveryDate" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyOrdered" DECIMAL(14,4) NOT NULL,
    "qtyReceived" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "uom" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotalPen" DECIMAL(14,4) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_notes" (
    "id" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "receivedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyReceived" DECIMAL(14,4) NOT NULL,
    "batchId" TEXT,
    "unitCostPen" DECIMAL(14,6) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "subtotalPen" DECIMAL(14,4) NOT NULL,
    "igvPen" DECIMAL(14,4) NOT NULL,
    "totalPen" DECIMAL(14,4) NOT NULL,
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "discrepancyNote" TEXT,
    "postedAt" TIMESTAMP(3),
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "basePricePen" DECIMAL(12,4) NOT NULL,
    "taxClass" "TaxClass" NOT NULL DEFAULT 'TAXABLE_IGV18',
    "activeRecipeId" TEXT,
    "unitOfSale" TEXT NOT NULL DEFAULT 'unit',
    "weightGrams" INTEGER,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isB2cVisible" BOOLEAN NOT NULL DEFAULT true,
    "isB2bVisible" BOOLEAN NOT NULL DEFAULT true,
    "minOrderQty" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "type" "CustomerType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "docNumber" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "creditLimitPen" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "assignedSalesAgentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "district" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Peru',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deliveryNotes" TEXT,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contacts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_price_agreements" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pricingType" "PricingType" NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "approvedBy" TEXT,
    "contractNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "customer_price_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "OrderChannel" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CART',
    "subtotalPen" DECIMAL(14,4) NOT NULL,
    "igvPen" DECIMAL(14,4) NOT NULL,
    "totalPen" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "deliveryAddressId" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "deliveryJobId" TEXT,
    "invoiceId" TEXT,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "confirmedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(10,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "lineTotalPen" DECIMAL(14,4) NOT NULL,
    "pricingSource" TEXT,
    "discountPct" DECIMAL(5,2),
    "notes" TEXT,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT,
    "invoiceId" TEXT,
    "method" TEXT NOT NULL,
    "amountPen" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "referenceNo" TEXT,
    "gatewayTxnId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "docType" "InvoiceDocType" NOT NULL,
    "series" TEXT NOT NULL,
    "correlative" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "entityType" "InvoiceEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityDocNo" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "subtotalPen" DECIMAL(14,4) NOT NULL,
    "igvPen" DECIMAL(14,4) NOT NULL,
    "totalPen" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" DECIMAL(8,4) NOT NULL DEFAULT 1,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentDueDate" TIMESTAMP(3),
    "linkedCreditNoteIds" TEXT[],
    "cdrResponse" JSONB,
    "hashCpe" TEXT,
    "qrCodeUrl" TEXT,
    "rejectionReason" TEXT,
    "nubefactId" TEXT,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "salesOrderId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "journalEntryId" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(10,4) NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "igvRate" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
    "subtotal" DECIMAL(14,4) NOT NULL,
    "igv" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "parentCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowDirectPost" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,

    CONSTRAINT "cost_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "periodId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceModule" "SourceModule" NOT NULL,
    "sourceDocId" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDebit" DECIMAL(14,4) NOT NULL,
    "totalCredit" DECIMAL(14,4) NOT NULL,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "costCenterId" TEXT,
    "debit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "bankAccountCode" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT NOT NULL,

    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "debitAmount" DECIMAL(14,4),
    "creditAmount" DECIMAL(14,4),
    "balance" DECIMAL(14,4) NOT NULL,
    "reference" TEXT,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "journalLineId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciledBy" TEXT,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "licenseNo" TEXT NOT NULL,
    "vehicleId" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_routes" (
    "id" TEXT NOT NULL,
    "routeCode" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "status" "DeliveryRouteStatus" NOT NULL DEFAULT 'PLANNED',
    "estimatedDistanceKm" DECIMAL(8,2),
    "actualDistanceKm" DECIMAL(8,2),
    "fuelCostPen" DECIMAL(10,4),
    "totalCostPen" DECIMAL(10,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "delivery_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "deliveryAddressLine" TEXT NOT NULL,
    "customerContact" TEXT,
    "customerPhone" TEXT,
    "scheduledTimeWindow" TEXT,
    "actualDeliveryTime" TIMESTAMP(3),
    "status" "DeliveryJobStatus" NOT NULL DEFAULT 'PENDING',
    "proofOfDeliveryUrl" TEXT,
    "signature" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_incidents" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "notes" TEXT NOT NULL,
    "photoUrl" TEXT,
    "resolution" TEXT,
    "reportedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "cuspp" TEXT,
    "contractType" "ContractType" NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "baseSalary" DECIMAL(12,4) NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "pensionSystem" "PensionSystem" NOT NULL,
    "afpId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" TEXT NOT NULL,
    "periodType" "PayPeriodType" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "fortnight" INTEGER,
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "grossSalary" DECIMAL(12,4) NOT NULL,
    "additions" JSONB NOT NULL,
    "deductions" JSONB NOT NULL,
    "netSalary" DECIMAL(12,4) NOT NULL,
    "igv5taWithheld" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "essaludEmployer" DECIMAL(12,4) NOT NULL,
    "ctsProvision" DECIMAL(12,4) NOT NULL,
    "vacationProvision" DECIMAL(12,4) NOT NULL,
    "employerTotalCost" DECIMAL(12,4) NOT NULL,
    "journalEntryId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "daysTaken" INTEGER NOT NULL,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_records" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hoursWorked" DECIMAL(5,2) NOT NULL,
    "regularHours" DECIMAL(5,2) NOT NULL,
    "overtime25" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overtime35" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_runs" (
    "id" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelVersion" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "status" "ForecastStatus" NOT NULL DEFAULT 'RUNNING',
    "mapeOverall" DECIMAL(6,4),
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "forecast_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_versions" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_lines" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "forecastMonth" TIMESTAMP(3) NOT NULL,
    "forecastQty" DECIMAL(14,4) NOT NULL,
    "lowerBoundQty" DECIMAL(14,4),
    "upperBoundQty" DECIMAL(14,4),
    "isManuallyOverridden" BOOLEAN NOT NULL DEFAULT false,
    "lockUntilDate" TIMESTAMP(3),
    "originalModelQty" DECIMAL(14,4),
    "overriddenBy" TEXT,
    "overriddenAt" TIMESTAMP(3),

    CONSTRAINT "forecast_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_accuracy" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "forecastQty" DECIMAL(14,4) NOT NULL,
    "actualQty" DECIMAL(14,4) NOT NULL,
    "mape" DECIMAL(6,4),
    "wmape" DECIMAL(6,4),
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_accuracy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plan_suggestions" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" "PlanSuggestionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "production_plan_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_plan_lines" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "suggestedQty" DECIMAL(14,4) NOT NULL,
    "adjustedQty" DECIMAL(14,4),
    "capacityPct" DECIMAL(5,2),
    "demandSource" "DemandSource" NOT NULL,

    CONSTRAINT "production_plan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_recommendations" (
    "id" TEXT NOT NULL,
    "suggestionId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT,
    "recommendedQty" DECIMAL(14,4) NOT NULL,
    "recommendedOrderDate" TIMESTAMP(3) NOT NULL,
    "estimatedDeliveryDate" TIMESTAMP(3) NOT NULL,
    "estimatedCostPen" DECIMAL(14,4),
    "isActedOn" BOOLEAN NOT NULL DEFAULT false,
    "purchaseOrderId" TEXT,

    CONSTRAINT "purchase_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_logs" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL,
    "externalId" TEXT,
    "errorMsg" TEXT,
    "triggeredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_module_recordId_idx" ON "audit_logs"("module", "recordId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_sku_key" ON "ingredients"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "uom_conversions_fromUom_toUom_ingredientId_key" ON "uom_conversions"("fromUom", "toUom", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_ingredientId_warehouseId_key" ON "stock_levels"("ingredientId", "warehouseId");

-- CreateIndex
CREATE INDEX "stock_movements_ingredientId_createdAt_idx" ON "stock_movements"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_refDocType_refDocId_idx" ON "stock_movements"("refDocType", "refDocId");

-- CreateIndex
CREATE INDEX "batches_ingredientId_expiryDate_idx" ON "batches"("ingredientId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "reorder_rules_ingredientId_warehouseId_key" ON "reorder_rules"("ingredientId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_productId_version_key" ON "recipes"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_orderNumber_key" ON "production_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "production_orders_scheduledDate_status_idx" ON "production_orders"("scheduledDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_ruc_key" ON "suppliers"("ruc");

-- CreateIndex
CREATE INDEX "supplier_price_lists_supplierId_ingredientId_validFrom_idx" ON "supplier_price_lists"("supplierId", "ingredientId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_performance_supplierId_period_key" ON "supplier_performance"("supplierId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_status_expectedDeliveryDate_idx" ON "purchase_orders"("status", "expectedDeliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_notes_grnNumber_key" ON "goods_receipt_notes"("grnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "customers_docNumber_key" ON "customers"("docNumber");

-- CreateIndex
CREATE INDEX "customer_price_agreements_customerId_productId_effectiveFro_idx" ON "customer_price_agreements"("customerId", "productId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_orderNumber_key" ON "sales_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "sales_orders_status_deliveryDate_idx" ON "sales_orders"("status", "deliveryDate");

-- CreateIndex
CREATE INDEX "sales_orders_customerId_createdAt_idx" ON "sales_orders"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_docType_status_issueDate_idx" ON "invoices"("docType", "status", "issueDate" DESC);

-- CreateIndex
CREATE INDEX "invoices_entityId_entityType_idx" ON "invoices"("entityId", "entityType");

-- CreateIndex
CREATE INDEX "invoices_paymentStatus_paymentDueDate_idx" ON "invoices"("paymentStatus", "paymentDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_series_correlative_key" ON "invoices"("series", "correlative");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_centers_code_key" ON "cost_centers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_year_month_key" ON "accounting_periods"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entryNumber_key" ON "journal_entries"("entryNumber");

-- CreateIndex
CREATE INDEX "journal_entries_periodId_status_idx" ON "journal_entries"("periodId", "status");

-- CreateIndex
CREATE INDEX "journal_entries_sourceModule_sourceDocId_idx" ON "journal_entries"("sourceModule", "sourceDocId");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_employeeId_key" ON "drivers"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_routes_routeCode_key" ON "delivery_routes"("routeCode");

-- CreateIndex
CREATE INDEX "delivery_routes_scheduledDate_status_idx" ON "delivery_routes"("scheduledDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_dni_key" ON "employees"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "pay_periods_periodType_year_month_fortnight_key" ON "pay_periods"("periodType", "year", "month", "fortnight");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_employeeId_periodId_key" ON "payslips"("employeeId", "periodId");

-- CreateIndex
CREATE INDEX "forecast_lines_versionId_productId_forecastMonth_idx" ON "forecast_lines"("versionId", "productId", "forecastMonth");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_rules" ADD CONSTRAINT "reorder_rules_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reorder_rules" ADD CONSTRAINT "reorder_rules_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "supplier_price_lists_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_performance" ADD CONSTRAINT "supplier_performance_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "goods_receipt_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_agreements" ADD CONSTRAINT "customer_price_agreements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_agreements" ADD CONSTRAINT "customer_price_agreements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoice_customer_fk" FOREIGN KEY ("entityId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "accounting_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "bank_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_routes" ADD CONSTRAINT "delivery_routes_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "delivery_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_incidents" ADD CONSTRAINT "delivery_incidents_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "delivery_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "pay_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_versions" ADD CONSTRAINT "forecast_versions_runId_fkey" FOREIGN KEY ("runId") REFERENCES "forecast_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "forecast_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_accuracy" ADD CONSTRAINT "forecast_accuracy_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "forecast_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_suggestions" ADD CONSTRAINT "production_plan_suggestions_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "forecast_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_lines" ADD CONSTRAINT "production_plan_lines_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "production_plan_suggestions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_plan_lines" ADD CONSTRAINT "production_plan_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_recommendations" ADD CONSTRAINT "purchase_recommendations_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "production_plan_suggestions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
