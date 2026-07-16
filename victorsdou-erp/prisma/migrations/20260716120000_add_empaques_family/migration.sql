-- Add EMPAQUES (packaging) to the raw-material family enum.
ALTER TYPE "RawMaterialFamily" ADD VALUE IF NOT EXISTS 'EMPAQUES';
