// builders/MercadoPagoBuilder.ts

import { PaymentRequest, MercadoPagoConfig } from '../types';

interface MercadoPagoPreferenceData {
  items: Array<{
    id: string;
    title: string;
    description: string;
    quantity: number;
    unit_price: number;
    currency_id: string;
  }>;
  back_urls: {
    success: string;
    failure: string;
    pending: string;
  };
  auto_return: string;
  notification_url: string;
  payment_methods: {
    installments: number;
    excluded_payment_types: Array<{ id: string }>;
  };
  date_of_expiration: string;
  metadata: {
    customer_email: string;
    customer_name: string;
    service_category: string;
    expiration_minutes: number;
    created_at: string;
    total_items: number;
    total_amount: number;
  };
}

interface Order {
  id: string;
  customer_info: {
    email: string;
    name: string;
  };
  items: Array<{
    id?: string;
    title: string;
    description?: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  total_amount: number;
  total_items: number;
  preference_id: string;
  status: string;
  created_at: string;
  expires_at: string;
}

// Tipo para el callback de guardado
type SaveOrderCallback = (orderData: {
  id: string;
  customer: string;
  items_count: number;
  total_amount: number;
  preference_id: string;
  full_order: Order;
}) => Promise<void> | void;

export class MercadoPagoBuilder {
  private config: MercadoPagoConfig;
  private preferenceData: MercadoPagoPreferenceData | null = null;
  private order: Order | null = null;
  private paymentRequest: PaymentRequest | null = null;
  private paymentUrl: string | null = null; // Nueva propiedad para almacenar init_point
  private saveOrderCallback: SaveOrderCallback | null = null;

  constructor(config: MercadoPagoConfig) {
    if (!config) {
      throw new Error('MercadoPago configuration is required');
    }
    this.config = config;
  }

  setPaymentRequest(request: PaymentRequest): this {
    this.paymentRequest = request;
    return this;
  }

  // Nuevo método para establecer el callback de guardado
  setSaveOrderCallback(callback: SaveOrderCallback): this {
    this.saveOrderCallback = callback;
    return this;
  }

  buildPreference(): this {
    if (!this.paymentRequest) {
      throw new Error('Payment request is required');
    }

    const { items, customer_info } = this.paymentRequest;
    const now = new Date();
    const expiration_in_minutes = (this.config.expirationTime || 20);
    const expirationDate = new Date(now.getTime() + expiration_in_minutes * 60 * 1000);

    // Calcular totales
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    // Construir items para MercadoPago
    const mercadoPagoItems = items.map((item, index) => ({
      id: item.id || `item_${Date.now()}_${index}`,
      title: item.title,
      description: item.description || item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
      currency_id: 'COP',
    }));

    this.preferenceData = {
      items: mercadoPagoItems,
      back_urls: {
        success: `${this.config.baseUrl}/payment/success`,
        failure: `${this.config.baseUrl}/payment/failure`,
        pending: `${this.config.baseUrl}/payment/success`,
      },
      auto_return: 'approved',
      notification_url: `${this.config.WEBHOOK_URL}`,
      payment_methods: {
        installments: 1,
        excluded_payment_types: [{ id: 'ticket' }],
      },
      date_of_expiration: expirationDate.toISOString(),
      metadata: {
        customer_email: customer_info.email,
        customer_name: customer_info.name,
        service_category: 'web_development',
        expiration_minutes: expiration_in_minutes,
        created_at: now.toISOString(),
        total_items: totalItems,
        total_amount: totalAmount,
      },
    };

    return this;
  }

  async createPreference(): Promise<this> {
    if (!this.preferenceData) {
      throw new Error('Preference data must be built first');
    }

    try {
      // Importar MercadoPago dinámicamente para evitar problemas de dependencias
      const { MercadoPagoConfig, Preference } = await import('mercadopago');
      
      const client = new MercadoPagoConfig({
        accessToken: this.config.accessToken,
        options: {
          timeout: this.config.timeout || 5000,
        },
      });

      const preference = new Preference(client);
      const response = await preference.create({ body: this.preferenceData });
      
      if (!response.id || !response.init_point) {
        throw new Error('Failed to create MercadoPago preference - missing ID or init_point');
      }

      this.paymentUrl = response.init_point; // Usar init_point oficial de MercadoPago
      this.buildOrder(response.id);
      
      return this;
    } catch (error) {
      console.error('Error creating MercadoPago preference:', error);
      throw new Error('Error al crear la preferencia de pago en MercadoPago');
    }
  }

  private buildOrder(preferenceId: string): void {
    if (!this.paymentRequest) {
      throw new Error('Payment request is required');
    }

    // Procesar items para la orden
    const orderItems = this.paymentRequest.items.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.quantity * item.unit_price,
    }));

    // Calcular totales
    const totalAmount = orderItems.reduce((sum, item) => sum + item.total_price, 0);
    const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);

    const now = new Date();
    const expirationTime = (this.config.expirationTime || 20) * 60 * 1000;

    this.order = {
      id: `order_${Date.now()}`,
      customer_info: this.paymentRequest.customer_info,
      items: orderItems,
      total_amount: totalAmount,
      total_items: totalItems,
      preference_id: preferenceId,
      status: 'pending',
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + expirationTime).toISOString(),
    };
  }

  async saveOrder(): Promise<this> {
    if (!this.order) {
      throw new Error('Order must be built first');
    }

    try {
      // Preparar datos para el callback
      const orderData = {
        id: this.order.id,
        customer: this.order.customer_info.email,
        items_count: this.order.total_items,
        total_amount: this.order.total_amount,
        preference_id: this.order.preference_id,
        full_order: this.order
      };

      // Ejecutar callback personalizado si existe
      if (this.saveOrderCallback) {
        await this.saveOrderCallback(orderData);
      } else {
        // Fallback
        console.error('no saveOrderCallback provided, order data:');
      }
      
      return this;
    } catch (error) {
      console.error('Error saving order:', error);
      throw new Error('Error al guardar la orden en la base de datos');
    }
  }

  getResult(): { order: Order; payment_url: string } {
    if (!this.order || !this.paymentUrl) {
      throw new Error('Order and payment URL not available');
    }

    return {
      order: this.order,
      payment_url: this.paymentUrl, // Ahora usa el init_point oficial
    };
  }

  reset(): void {
    this.preferenceData = null;
    this.order = null;
    this.paymentRequest = null;
    this.paymentUrl = null;
    this.saveOrderCallback = null;
  }
}