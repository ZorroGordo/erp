/** Central registry of all BullMQ queue names */
export const QUEUES = {
  EMAIL:                'email',
  INVOICE:              'invoice',
  SUBSCRIPTION_BILLING: 'subscription-billing',
  CATALOG_SYNC:         'catalog-sync',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Job name constants for each queue */
export const JOBS = {
  CATALOG_SYNC: {
    FULL_SYNC:    'full-sync',
    SYNC_PRODUCT: 'sync-product',
  },
  EMAIL: {
    SEND:               'send',
    ORDER_CONFIRMATION: 'order-confirmation',
    WELCOME:            'welcome',
    PASSWORD_RESET:     'password-reset',
  },
  INVOICE: {
    GENERATE: 'generate',
  },
  SUBSCRIPTION_BILLING: {
    PROCESS_DUE:  'process-due',
    RETRY_FAILED: 'retry-failed',
  },
} as const;
