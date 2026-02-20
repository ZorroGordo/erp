"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOBS = exports.QUEUES = void 0;
exports.QUEUES = {
    EMAIL: 'email',
    INVOICE: 'invoice',
    SUBSCRIPTION_BILLING: 'subscription-billing',
    CATALOG_SYNC: 'catalog-sync',
};
exports.JOBS = {
    CATALOG_SYNC: {
        FULL_SYNC: 'full-sync',
        SYNC_PRODUCT: 'sync-product',
    },
    EMAIL: {
        SEND: 'send',
        ORDER_CONFIRMATION: 'order-confirmation',
        WELCOME: 'welcome',
        PASSWORD_RESET: 'password-reset',
    },
    INVOICE: {
        GENERATE: 'generate',
    },
    SUBSCRIPTION_BILLING: {
        PROCESS_DUE: 'process-due',
        RETRY_FAILED: 'retry-failed',
    },
};
//# sourceMappingURL=queues.js.map