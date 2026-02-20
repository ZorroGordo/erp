export declare const QUEUES: {
    readonly EMAIL: "email";
    readonly INVOICE: "invoice";
    readonly SUBSCRIPTION_BILLING: "subscription-billing";
    readonly CATALOG_SYNC: "catalog-sync";
};
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
export declare const JOBS: {
    readonly CATALOG_SYNC: {
        readonly FULL_SYNC: "full-sync";
        readonly SYNC_PRODUCT: "sync-product";
    };
    readonly EMAIL: {
        readonly SEND: "send";
        readonly ORDER_CONFIRMATION: "order-confirmation";
        readonly WELCOME: "welcome";
        readonly PASSWORD_RESET: "password-reset";
    };
    readonly INVOICE: {
        readonly GENERATE: "generate";
    };
    readonly SUBSCRIPTION_BILLING: {
        readonly PROCESS_DUE: "process-due";
        readonly RETRY_FAILED: "retry-failed";
    };
};
