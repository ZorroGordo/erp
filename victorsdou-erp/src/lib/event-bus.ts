import { EventEmitter } from 'node:events';

// ── Event Definitions ────────────────────────────────────────────────────────
// In MVP this is an in-process EventEmitter.
// In Phase 2, swap the `emit` / `on` adapter to route through BullMQ or Redis Pub/Sub
// without changing callsites.

export type DomainEvent =
  | { type: 'stock.low';       payload: { ingredientId: string; qtyAvailable: number; warehouseId: string } }
  | { type: 'stock.adjusted';  payload: { ingredientId: string; warehouseId: string; delta: number } }
  | { type: 'order.confirmed'; payload: { orderId: string; customerId: string; totalPen: number } }
  | { type: 'order.cancelled'; payload: { orderId: string; reason: string } }
  | { type: 'invoice.issued';  payload: { invoiceId: string; docType: string } }
  | { type: 'invoice.accepted';payload: { invoiceId: string; hash: string } }
  | { type: 'invoice.rejected';payload: { invoiceId: string; reason: string } }
  | { type: 'payment.received';payload: { orderId: string; amountPen: number; method: string } }
  | { type: 'production.completed'; payload: { productionOrderId: string; actualQty: number } }
  | { type: 'po.approved';     payload: { poId: string; supplierId: string; totalPen: number } }
  | { type: 'po.received';     payload: { grnId: string; poId: string } }
  | { type: 'delivery.completed'; payload: { jobId: string; orderId: string } }
  | { type: 'delivery.failed'; payload: { jobId: string; orderId: string; reason: string } }
  | { type: 'forecast.ready';  payload: { versionId: string; mape: number } };

type EventType = DomainEvent['type'];
type EventPayload<T extends EventType> = Extract<DomainEvent, { type: T }>['payload'];
type EventHandler<T extends EventType> = (payload: EventPayload<T>) => void | Promise<void>;

class DomainEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit<T extends EventType>(type: T, payload: EventPayload<T>): void {
    // Fire-and-forget; errors in handlers are caught and logged
    setImmediate(() => {
      this.emitter.emit(type, payload);
    });
  }

  on<T extends EventType>(type: T, handler: EventHandler<T>): void {
    this.emitter.on(type, (payload: EventPayload<T>) => {
      Promise.resolve(handler(payload)).catch((err) => {
        console.error(`[EventBus] Handler error for event "${type}":`, err);
      });
    });
  }

  off<T extends EventType>(type: T, handler: EventHandler<T>): void {
    this.emitter.off(type, handler as (...args: unknown[]) => void);
  }
}

export const eventBus = new DomainEventBus();
