//payments-lib/index.ts

// Main service export
export { MercadoPagoService } from './MercadoPagoService';

// Webhook handler export
export { MercadoPagoWebhookHandler } from './webhooks/MercadoPagoWebhookHandler';

// Types export
export type {
  MercadoPagoConfig,
  PaymentRequest,
  PaymentResponse,
  PaymentResult,
  CustomerInfo,
  PaymentItem,
  ValidationResult,
  WebhookEvent,
  WebhookResult,
  WebhookConfig,
} from './types';

// Validators export
export { PaymentValidator } from './validators/PaymentValidator';

// Builders export (for advanced usage)
export { MercadoPagoBuilder } from './builders/MercadoPagoBuilder';