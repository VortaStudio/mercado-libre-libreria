// MercadoPagoService.ts
import { MercadoPagoBuilder } from './builders/MercadoPagoBuilder';
import { PaymentValidator } from './validators/PaymentValidator';
import { PaymentRequest, PaymentResponse, PaymentResult, MercadoPagoConfig } from './types';

// Tipo para el callback de guardado
type SaveOrderCallback = (orderData: {
  id: string;
  customer: string;
  items_count: number;
  total_amount: number;
  preference_id: string;
  full_order: any;
}) => Promise<void> | void;

export class MercadoPagoService {
  private builder: MercadoPagoBuilder;
  private saveOrderCallback: SaveOrderCallback | null = null;

  constructor(config: MercadoPagoConfig) {
    this.builder = new MercadoPagoBuilder(config);
  }

  // Método para establecer el callback de guardado desde el código cliente
  setSaveOrderCallback(callback: SaveOrderCallback): this {
    this.saveOrderCallback = callback;
    return this;
  }

  async processPayment(requestData: any): Promise<PaymentResult> {
    try {
      // Validate input data
      const validation = PaymentValidator.validatePaymentRequest(requestData);
      if (!validation.isValid) {
        return {
          success: false,
          error: 'Datos inválidos',
          details: validation.errors,
        };
      }

      // Cast to PaymentRequest after validation
      const paymentRequest: PaymentRequest = requestData as PaymentRequest;

      // Process payment using MercadoPago
      const result = await this.executeMercadoPagoPayment(paymentRequest);

      return {
        success: true,
        data: result,
      };

    } catch (error) {
      console.error('Payment processing error:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error interno del servidor',
      };
    }
  }

  private async executeMercadoPagoPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      // Reset builder for new payment
      this.builder.reset();

      // Set the save callback if it exists
      if (this.saveOrderCallback) {
        this.builder.setSaveOrderCallback(this.saveOrderCallback);
      }

      // Execute the payment process step by step
      await this.builder
        .setPaymentRequest(request)
        .buildPreference()
        .createPreference();

      // Save order to database (now uses callback)
      await this.builder.saveOrder();

      // Get the final result
      const { order, payment_url } = this.builder.getResult();
      return {
        order_id: order.id,
        payment_url: payment_url, // Ahora usa init_point
        preference_id: order.preference_id,
        message: 'Orden creada exitosamente con MercadoPago',
      };

    } catch (error) {
      console.error('Error processing MercadoPago payment:', error);
      throw error;
    }
  }
}