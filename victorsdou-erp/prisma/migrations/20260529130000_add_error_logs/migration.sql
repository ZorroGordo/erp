-- Error log for backend exceptions, used by the weekly error digest.
CREATE TABLE "error_logs" (
  "id" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "code" TEXT,
  "message" TEXT,
  "method" TEXT,
  "path" TEXT,
  "stack" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt");
