// types/index.ts

export interface CustomerInfo {
  email: string;
  name: string;
}

export interface PaymentItem {
  id?: string; // Opcional
  title: string; // Obligatorio
  description?: string; // Opcional
  quantity: number; // Obligatorio
  unit_price: number; // Obligatorio
}

export interface PaymentRequest {
  customer_info: CustomerInfo;
  items: PaymentItem[];
}

export interface PaymentResponse {
  order_id: string;
  payment_url: string;
  preference_id: string;
  message: string;
}

export interface PaymentResult {
  success: boolean;
  data?: PaymentResponse;
  error?: string;
  details?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface MercadoPagoConfig {
  accessToken: string;
  baseUrl: string;
  WEBHOOK_URL: string;
  timeout?: number;
  expirationTime?: number;
}

// lib/payments-lib/types.ts

// ===== WEBHOOK TYPES =====

export interface WebhookEvent {
  id?: number;
  type: string; // 'payment', 'merchant_order', etc.
  action?: string; // 'payment.created', 'payment.updated', etc.
  data?: {
    id: string;
  };
  live_mode?: boolean;
  date_created?: string;
  user_id?: number;
  api_version?: string;
  [key: string]: any; // Para campos adicionales
}

export interface WebhookConfig {
  accessToken: string;
  webhookSecret?: string;
  enableSignatureValidation?: boolean;
}

export interface WebhookLogData {
  webhook_id: string;
  payment_id: string | null;
  topic: string;
  action: string | null;
  live_mode: boolean;
  user_id: string | null;
  api_version: string | null;
  date_created: string;
  external_reference?: string | null;
  status?: string;
  mapped_status?: string | null;
  transaction_amount?: number | null;
  currency_id?: string | null;
  payment_method_id?: string | null;
  payer_email?: string | null;
  error_message?: string | null;
  raw_data: any;
  headers_received: Record<string, string>;
  processed_at: string;
}

// Nuevo tipo para el resultado del webhook procesado
export interface WebhookResult {
  webhook_log: WebhookLogData;
  payment_info: any | null;
  mapped_status: string | null;
}

export interface WebhookProcessResult {
  success: boolean;
  status: number;
  message: string;
  error?: string;
  data?: WebhookResult;
}

// ===== PAYMENT TYPES =====

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  description?: string;
  external_reference?: string;
  metadata?: Record<string, any>;
  payer?: {
    email?: string;
    name?: string;
    phone?: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  payment_method_id?: string;
  installments?: number;
  capture?: boolean;
  binary_mode?: boolean;
  statement_descriptor?: string;
  notification_url?: string;
  redirect_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
}

export interface PaymentResultWeebhook {
  id: string;
  status: string;
  status_detail?: string;
  payment_method_id?: string;
  payment_type_id?: string;
  transaction_amount: number;
  currency_id: string;
  date_created: string;
  date_approved?: string;
  external_reference?: string;
  description?: string;
  payer?: {
    id?: string;
    email?: string;
    type?: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  metadata?: Record<string, any>;
  // Campos específicos de MercadoPago
  collector_id?: number;
  operation_type?: string;
  transaction_details?: {
    net_received_amount?: number;
    total_paid_amount?: number;
    overpaid_amount?: number;
    installment_amount?: number;
  };
  fee_details?: Array<{
    type: string;
    amount: number;
    fee_payer: string;
  }>;
  charges_details?: Array<{
    id: string;
    name: string;
    type: string;
    accounts: {
      from: string;
      to: string;
    };
    client_id: number;
    date_created: string;
    last_updated: string;
  }>;
  point_of_interaction?: {
    type: string;
    business_info?: {
      unit: string;
      sub_unit: string;
    };
  };
}

export interface CreatePaymentOptions {
  capture?: boolean;
  binary_mode?: boolean;
  statement_descriptor?: string;
  notification_url?: string;
  callback_url?: string;
  sponsor_id?: number;
  processing_mode?: string;
  merchant_account_id?: string;
}

// ===== CONFIGURATION TYPES =====

export interface PaymentProviderConfig {
  accessToken: string;
  publicKey?: string;
  environment?: 'sandbox' | 'production';
  webhookSecret?: string;
  timeout?: number;
  retries?: number;
  enableLogging?: boolean;
}

// ===== GENERIC TYPES =====

export type PaymentStatus = 
  | 'pending'
  | 'approved' 
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back';

export type Currency = 'ARS' | 'BRL' | 'CLP' | 'COP' | 'MXN' | 'PEN' | 'UYU' | 'USD';

export interface PaymentError {
  code: string;
  message: string;
  details?: any;
  status?: number;
}

// ===== UTILITY TYPES =====

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface DateRange {
  date_from?: string;
  date_to?: string;
}

export interface PaymentFilters extends PaginationOptions, DateRange {
  status?: PaymentStatus;
  external_reference?: string;
  payment_method_id?: string;
  sort?: 'date_created' | 'date_approved';
  criteria?: 'asc' | 'desc';
}

// ===== RESPONSE WRAPPERS =====

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: PaymentError;
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
}

export interface PaymentResponseWeebhook extends ApiResponse<PaymentResultWeebhook> {}
export interface PaymentListResponse extends ApiResponse<PaymentResultWeebhook[]> {}