"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configuration = void 0;
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']).default('development'),
    PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string(),
    REDIS_URL: zod_1.z.string().default('redis://localhost:6379'),
    JWT_PRIVATE_KEY: zod_1.z.string(),
    JWT_PUBLIC_KEY: zod_1.z.string(),
    JWT_ACCESS_EXPIRES: zod_1.z.string().default('15m'),
    JWT_REFRESH_EXPIRES: zod_1.z.string().default('7d'),
    ERP_API_URL: zod_1.z.string().default('http://localhost:3000'),
    ERP_API_KEY: zod_1.z.string(),
    CULQI_PUBLIC_KEY: zod_1.z.string(),
    CULQI_SECRET_KEY: zod_1.z.string(),
    CULQI_WEBHOOK_SECRET: zod_1.z.string(),
    AWS_REGION: zod_1.z.string().default('us-east-1'),
    AWS_ACCESS_KEY_ID: zod_1.z.string().optional(),
    AWS_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
    S3_BUCKET: zod_1.z.string().default('victorsdou-invoices'),
    SES_FROM_EMAIL: zod_1.z.string().email(),
    INTERNAL_API_KEY: zod_1.z.string(),
});
const configuration = () => {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        throw new Error(`❌ Invalid environment variables:\n${result.error.message}`);
    }
    return result.data;
};
exports.configuration = configuration;
//# sourceMappingURL=configuration.js.map