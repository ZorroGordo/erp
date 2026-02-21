-- Migration: planilla_overhaul
-- Adds EmploymentType and PayslipStatus enums, new fields for Planilla/RxH support

-- Create new enums
CREATE TYPE "EmploymentType" AS ENUM ('PLANILLA', 'RXH');
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PAID');

-- Employee: add new fields
ALTER TABLE "employees"
  ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'PLANILLA',
  ADD COLUMN "afpName" TEXT,
  ADD COLUMN "email" TEXT;

-- Set defaults on existing columns (contractType and pensionSystem had no defaults before)
ALTER TABLE "employees"
  ALTER COLUMN "contractType" SET DEFAULT 'INDEFINIDO',
  ALTER COLUMN "pensionSystem" SET DEFAULT 'AFP',
  ALTER COLUMN "hireDate" SET DEFAULT NOW();

-- OvertimeRecord: add holiday support fields
ALTER TABLE "overtime_records"
  ADD COLUMN "isHoliday" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "holidayHours" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "notes" TEXT;

-- PayPeriod: add paid tracking fields
ALTER TABLE "pay_periods"
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paidBy" TEXT;

-- Payslip: add gratificacion provision, status workflow, edit/confirmation tracking
ALTER TABLE "payslips"
  ADD COLUMN "gratificacionProv" DECIMAL(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedBy" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paidBy" TEXT,
  ADD COLUMN "emailSentAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW();

-- Set existing payslip columns to allow defaults (they had no DEFAULT before)
ALTER TABLE "payslips"
  ALTER COLUMN "essaludEmployer" SET DEFAULT 0,
  ALTER COLUMN "ctsProvision" SET DEFAULT 0,
  ALTER COLUMN "vacationProvision" SET DEFAULT 0;
