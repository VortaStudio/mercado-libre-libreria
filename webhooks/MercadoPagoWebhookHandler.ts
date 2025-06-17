// lib/payments-lib/webhooks/MercadoPagoWebhookHandler.ts

import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { WebhookEvent, WebhookConfig, WebhookProcessResult, WebhookLogData } from '../types';

export class MercadoPagoWebhookHandler {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  /**
   * Método principal que procesa directamente el NextRequest
   * Esta es la "caja negra" que maneja todo el procesamiento
   */
  async processWebhookRequest(request: NextRequest): Promise<WebhookProcessResult> {
    try {
      // 1. Extraer todos los datos necesarios del request
      const body = await request.text();
      const headers = Object.fromEntries(request.headers.entries());
      const clientIP = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';


      // 2. Procesar el webhook con los datos extraídos
      return await this.processWebhook(body, headers, clientIP);

    } catch (error) {
      console.error('💥 Error processing webhook request:', error);
      return {
        success: false,
        status: 500,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Procesa y valida el webhook de MercadoPago
   * Retorna los datos procesados para que el cliente decida qué hacer con ellos
   */
  async processWebhook(
    requestBody: string, 
    headers: Record<string, string>, 
    clientIP?: string
  ): Promise<WebhookProcessResult> {
    try {

      // 1. Validar la firma si está habilitada
      if (this.config.enableSignatureValidation) {
        const signatureValidation = this.validateSignature(requestBody, headers);
        if (!signatureValidation.isValid) {
          console.error('❌ Invalid webhook signature:', signatureValidation.error);
          return {
            success: false,
            status: 403,
            message: 'Invalid signature',
            error: signatureValidation.error
          };
        }
      }

      // 2. Parsear el JSON del webhook
      let webhookData: WebhookEvent;
      try {
        webhookData = JSON.parse(requestBody);
      } catch (error) {
        console.error('❌ Invalid JSON in webhook request:', error);
        return {
          success: false,
          status: 400,
          message: 'Invalid JSON format',
          error: 'Failed to parse webhook JSON'
        };
      }

      // 3. Procesar según el tipo de evento
      const result = await this.handleWebhookEvent(webhookData, headers);
      
      return result;

    } catch (error) {
      console.error('💥 Unexpected error processing webhook:', error);
      return {
        success: false,
        status: 500,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Maneja diferentes tipos de eventos de webhook
   */
  private async handleWebhookEvent(
    webhookData: WebhookEvent, 
    headers: Record<string, string>
  ): Promise<WebhookProcessResult> {
    const { type: topic, data, action } = webhookData;
    const paymentId = data?.id;

    // Crear datos base del log
    const baseLogData: WebhookLogData = {
      webhook_id: webhookData.id?.toString() || 'unknown',
      payment_id: paymentId || null,
      topic: topic,
      action: action || null,
      live_mode: webhookData.live_mode || false,
      user_id: webhookData.user_id?.toString() || null,
      api_version: webhookData.api_version || null,
      date_created: webhookData.date_created || new Date().toISOString(),
      raw_data: webhookData,
      headers_received: headers,
      processed_at: new Date().toISOString()
    };

    if (topic === 'payment' && paymentId) {
      return await this.handlePaymentWebhook(paymentId, baseLogData);
    }

    // Otros tipos de webhooks (merchant_orders, subscriptions, etc.)
    return {
      success: true,
      status: 200,
      message: `Webhook type ${topic} acknowledged but not processed`,
      data: {
        webhook_log: baseLogData,
        payment_info: null,
        mapped_status: null
      }
    };
  }

  /**
   * Procesa webhooks de tipo payment
   */
  private async handlePaymentWebhook(
    paymentId: string, 
    baseLogData: WebhookLogData
  ): Promise<WebhookProcessResult> {
    try {

      // 1. Obtener información del pago desde MercadoPago API
      const paymentInfo = await this.getPaymentInfo(paymentId);
      
      if (!paymentInfo) {
        console.error(`❌ Failed to fetch payment info for ID: ${paymentId}`);
        return {
          success: false,
          status: 400,
          message: 'Failed to fetch payment information from MercadoPago',
          error: 'Payment not found or API error',
          data: {
            webhook_log: {
              ...baseLogData,
              status: 'error',
              error_message: 'Failed to fetch payment info'
            },
            payment_info: null,
            mapped_status: null
          }
        };
      }

      const paymentStatus = paymentInfo.status;
      const externalReference = paymentInfo.external_reference;

  

      // 2. Mapear el estado de MercadoPago a un estado genérico
      const mappedStatus = this.mapPaymentStatus(paymentStatus);

      // 3. Preparar datos completos del log
      const completeLogData: WebhookLogData = {
        ...baseLogData,
        status: paymentStatus,
        external_reference: externalReference || null,
        mapped_status: mappedStatus,
        transaction_amount: paymentInfo.transaction_amount || null,
        currency_id: paymentInfo.currency_id || null,
        payment_method_id: paymentInfo.payment_method_id || null,
        payer_email: paymentInfo.payer?.email || null
      };

      // 4. Retornar todos los datos procesados
      return {
        success: true,
        status: 200,
        message: 'Payment webhook processed successfully',
        data: {
          webhook_log: completeLogData,
          payment_info: paymentInfo,
          mapped_status: mappedStatus
        }
      };

    } catch (error) {
      console.error('💥 Error processing payment webhook:', error);
      
      const errorLogData: WebhookLogData = {
        ...baseLogData,
        status: 'processing_error',
        error_message: error instanceof Error ? error.message : 'Unknown processing error'
      };

      return {
        success: false,
        status: 500,
        message: 'Error processing payment webhook',
        error: error instanceof Error ? error.message : 'Unknown error',
        data: {
          webhook_log: errorLogData,
          payment_info: null,
          mapped_status: null
        }
      };
    }
  }

  /**
   * Obtiene información del pago desde MercadoPago API
   */
  private async getPaymentInfo(paymentId: string): Promise<any> {
    try {
      const { MercadoPagoConfig, Payment } = await import('mercadopago');
      
      const client = new MercadoPagoConfig({
        accessToken: this.config.accessToken,
        options: {
          timeout: 5000,
        },
      });

      const payment = new Payment(client);
      const response = await payment.get({ id: paymentId });

      if (!response || !response.id) {
        return null;
      }

      return response;
    } catch (error) {
      console.error('❌ Error fetching payment info from MercadoPago API:', error);
      return null;
    }
  }

  /**
   * Mapea los estados de MercadoPago a estados genéricos del sistema
   */
  private mapPaymentStatus(mercadoPagoStatus: string): string {
    const statusMapping: Record<string, string> = {
      'approved': 'approved',
      'rejected': 'rejected',
      'cancelled': 'cancelled',
      'authorized': 'approved',
      'in_process': 'pending',
      'in_mediation': 'pending',
      'refunded': 'refunded',
      'charged_back': 'chargeback',
      'pending': 'pending'
    };

    return statusMapping[mercadoPagoStatus] || 'unknown';
  }

  /**
   * Valida la firma del webhook usando HMAC SHA256
   * Implementación basada en la documentación oficial de MercadoPago
   */
  private validateSignature(body: string, headers: Record<string, string>): {
    isValid: boolean;
    error?: string;
  } {
    try {
      if (!this.config.webhookSecret) {
        return { isValid: true }; // Si no hay secret configurado, omitimos validación
      }

      const signature = headers['x-signature'] || headers['X-Signature'];
      if (!signature) {
        return { isValid: false, error: 'Missing x-signature header' };
      }

      // Extraer timestamp y signature del header
      // Formato: ts=1234567890,v1=signature_hash
      const parts = signature.split(',');
      let timestamp = '';
      let receivedSignature = '';

      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 'ts') {
          timestamp = value;
        } else if (key === 'v1') {
          receivedSignature = value;
        }
      }

      if (!timestamp || !receivedSignature) {
        return { isValid: false, error: 'Invalid signature format' };
      }

      // Crear el mensaje para validar según documentación de MP
      const dataId = headers['data_id'] || this.extractDataIdFromBody(body);
      const manifest = `id:${dataId};request-id:${headers['x-request-id'] || ''};ts:${timestamp};`;

      // Generar HMAC SHA256
      const expectedSignature = createHmac('sha256', this.config.webhookSecret)
        .update(manifest)
        .digest('hex');

      // Comparar firmas de forma segura
      const isValid = this.safeCompare(expectedSignature, receivedSignature);

      if (!isValid) {
        console.warn('🔐 Signature validation failed:', {
          manifest,
          expected: expectedSignature,
          received: receivedSignature
        });
      }

      return { isValid };

    } catch (error) {
      console.error('❌ Error validating signature:', error);
      return { isValid: false, error: 'Signature validation error' };
    }
  }

  /**
   * Extrae el data_id del body del webhook
   */
  private extractDataIdFromBody(body: string): string {
    try {
      const data = JSON.parse(body);
      return data.data?.id || '';
    } catch {
      return '';
    }
  }

  /**
   * Comparación segura de strings para evitar timing attacks
   */
  private safeCompare(expected: string, received: string): boolean {
    if (expected.length !== received.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ received.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Método utilitario para verificar si un webhook es válido sin procesarlo completamente
   */
  async validateWebhookOnly(body: string, headers: Record<string, string>): Promise<{
    isValid: boolean;
    error?: string;
    webhookType?: string;
  }> {
    try {
      // Validar firma si está habilitada
      if (this.config.enableSignatureValidation) {
        const signatureValidation = this.validateSignature(body, headers);
        if (!signatureValidation.isValid) {
          return {
            isValid: false,
            error: signatureValidation.error
          };
        }
      }

      // Parsear y validar estructura básica
      const webhookData = JSON.parse(body);
      
      return {
        isValid: true,
        webhookType: webhookData.type
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid webhook format'
      };
    }
  }
}