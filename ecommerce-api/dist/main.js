"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({ logger: false }));
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    app.enableCors({
        origin: process.env.NODE_ENV === 'production'
            ? ['https://victorsdou.com', 'https://www.victorsdou.com']
            : true,
        credentials: true,
    });
    const port = process.env.PORT ?? 4000;
    await app.listen(port, '0.0.0.0');
    const logger = new common_1.Logger('Bootstrap');
    logger.log(`🚀 ecommerce-api running on port ${port}`);
    logger.log(`   ENV: ${process.env.NODE_ENV}`);
}
bootstrap();
//# sourceMappingURL=main.js.map