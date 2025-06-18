// lib/payments-lib/webhooks/MercadoPagoWebhookHandler.ts

import { NextRequest } from 'next/server';
import { createHmac } from 'crypto';
import { WebhookEvent, WebhookConfig, WebhookProcessResult, WebhookLogData } from '../types';

// ============= STEP BUILDER PATTERN INTERFACES =============

interface WebhookExtractionStep {
  extractRequestData(request: NextRequest): Promise<WebhookDataStep>;
}

interface WebhookDataStep {
  validateSignature(): WebhookValidationStep;
  skipSignatureValidation(): WebhookValidationStep;
}

interface WebhookValidationStep {
  parseWebhookData(): WebhookParsingStep;
}

interface WebhookParsingStep {
  processEvent(): WebhookProcessingStep;
}

interface WebhookProcessingStep {
  build(): Promise<WebhookProcessResult>;
}

// ============= STEP BUILDER IMPLEMENTATION =============

class WebhookBuilder implements 
  WebhookExtractionStep, 
  WebhookDataStep, 
  WebhookValidationStep, 
  WebhookParsingStep, 
  WebhookProcessingStep {

  private config: WebhookConfig;
  private requestBody: string = '';
  private headers: Record<string, string> = {};
  private clientIP: string = 'unknown';
  private webhookData: WebhookEvent | null = null;
  private validationResult: { isValid: boolean; error?: string } = { isValid: true };
  private baseLogData: WebhookLogData | null = null;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  // ============= STEP 1: EXTRACTION =============
  async extractRequestData(request: NextRequest): Promise<WebhookDataStep> {
    try {
      this.requestBody = await request.text();
      this.headers = Object.fromEntries(request.headers.entries());
      this.clientIP = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
      
      console.log('✅ Step 1: Request data extracted successfully');
      return this;
    } catch (error) {
      console.error('❌ Step 1 failed: Error extracting request data:', error);
      throw new Error('Failed to extract request data');
    }
  }

  // ============= STEP 2: VALIDATION =============
  validateSignature(): WebhookValidationStep {
    if (this.config.enableSignatureValidation) {
      this.validationResult = this.performSignatureValidation(this.requestBody, this.headers);
      
      if (!this.validationResult.isValid) {
        console.error('❌ Step 2 failed: Invalid webhook signature:', this.validationResult.error);
      } else {
        console.log('✅ Step 2: Signature validation passed');
      }
    } else {
      console.log('⚠️ Step 2: Signature validation skipped (disabled)');
    }
    
    return this;
  }

  skipSignatureValidation(): WebhookValidationStep {
    this.validationResult = { isValid: true };
    console.log('⚠️ Step 2: Signature validation explicitly skipped');
    return this;
  }

  // ============= STEP 3: PARSING =============
  parseWebhookData(): WebhookParsingStep {
    try {
      if (!this.validationResult.isValid) {
        throw new Error(`Signature validation failed: ${this.validationResult.error}`);
      }

      this.webhookData = JSON.parse(this.requestBody);
      
      // Crear base log data
      this.baseLogData = {
        webhook_id: this.webhookData?.id?.toString() || 'unknown',
        payment_id: this.webhookData?.data?.id || null,
        topic: this.webhookData?.type || 'unknown',
        action: this.webhookData?.action || null,
        live_mode: this.webhookData?.live_mode || false,
        user_id: this.webhookData?.user_id?.toString() || null,
        api_version: this.webhookData?.api_version || null,
        date_created: this.webhookData?.date_created || new Date().toISOString(),
        raw_data: this.webhookData,
        headers_received: this.headers,
        processed_at: new Date().toISOString()
      };

      console.log('✅ Step 3: Webhook data parsed successfully');
      return this;
    } catch (error) {
      console.error('❌ Step 3 failed: Error parsing webhook data:', error);
      throw new Error('Failed to parse webhook JSON');
    }
  }

  // ============= STEP 4: PROCESSING =============
  processEvent(): WebhookProcessingStep {
    if (!this.webhookData || !this.baseLogData) {
      throw new Error('Webhook data not available for processing');
    }

    console.log(`✅ Step 4: Ready to process ${this.webhookData.type} event`);
    return this;
  }

  // ============= STEP 5: BUILD =============
  async build(): Promise<WebhookProcessResult> {
    if (!this.webhookData || !this.baseLogData) {
      return {
        success: false,
        status: 500,
        message: 'Internal error: Missing webhook data',
        error: 'Webhook data not properly initialized'
      };
    }

    try {
      // Verificar si hay errores de validación
      if (!this.validationResult.isValid) {
        return {
          success: false,
          status: 403,
          message: 'Invalid signature',
          error: this.validationResult.error
        };
      }

      // Procesar según el tipo de evento
      const result = await this.handleEventByType(this.webhookData, this.baseLogData);
      
      console.log('✅ Step 5: Webhook processing completed successfully');
      return result;

    } catch (error) {
      console.error('❌ Step 5 failed: Error in final processing:', error);
      return {
        success: false,
        status: 500,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // ============= PRIVATE HELPER METHODS =============

  private async handleEventByType(webhookData: WebhookEvent, baseLogData: WebhookLogData): Promise<WebhookProcessResult> {
    const { type: topic, data } = webhookData;
    const paymentId = data?.id;

    if (topic === 'payment' && paymentId) {
      return await this.handlePaymentEvent(paymentId, baseLogData);
    }

    // Otros tipos de eventos
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

  private async handlePaymentEvent(paymentId: string, baseLogData: WebhookLogData): Promise<WebhookProcessResult> {
    try {
      const paymentInfo = await this.getPaymentInfo(paymentId);
      
      if (!paymentInfo) {
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

      const mappedStatus = this.mapPaymentStatus(paymentInfo.status);
      const completeLogData: WebhookLogData = {
        ...baseLogData,
        status: paymentInfo.status,
        external_reference: paymentInfo.external_reference || null,
        mapped_status: mappedStatus,
        transaction_amount: paymentInfo.transaction_amount || null,
        currency_id: paymentInfo.currency_id || null,
        payment_method_id: paymentInfo.payment_method_id || null,
        payer_email: paymentInfo.payer?.email || null
      };

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

      return response?.id ? response : null;
    } catch (error) {
      console.error('❌ Error fetching payment info from MercadoPago API:', error);
      return null;
    }
  }

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

  private performSignatureValidation(body: string, headers: Record<string, string>): {
    isValid: boolean;
    error?: string;
  } {
    try {
      if (!this.config.webhookSecret) {
        return { isValid: true };
      }

      const signature = headers['x-signature'] || headers['X-Signature'];
      if (!signature) {
        return { isValid: false, error: 'Missing x-signature header' };
      }

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

      const dataId = headers['data_id'] || this.extractDataIdFromBody(body);
      const manifest = `id:${dataId};request-id:${headers['x-request-id'] || ''};ts:${timestamp};`;

      const expectedSignature = createHmac('sha256', this.config.webhookSecret)
        .update(manifest)
        .digest('hex');

      const isValid = this.safeCompare(expectedSignature, receivedSignature);

      return { isValid };

    } catch (error) {
      console.error('❌ Error validating signature:', error);
      return { isValid: false, error: 'Signature validation error' };
    }
  }

  private extractDataIdFromBody(body: string): string {
    try {
      const data = JSON.parse(body);
      return data.data?.id || '';
    } catch {
      return '';
    }
  }

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
}

// ============= MAIN WEBHOOK HANDLER CLASS =============

export class MercadoPagoWebhookHandler {
  private config: WebhookConfig;

  constructor(config: WebhookConfig) {
    this.config = config;
  }

  /**
   * Método principal usando Step Builder Pattern
   * Garantiza que todos los pasos se ejecuten en el orden correcto
   */
  async processWebhookRequest(request: NextRequest): Promise<WebhookProcessResult> {
    try {
      console.log('🚀 Starting webhook processing with Step Builder Pattern');
      
      const result = await new WebhookBuilder(this.config)
        .extractRequestData(request)                    // Step 1: Extract
        .then(builder => builder.validateSignature())  // Step 2: Validate
        .then(builder => builder.parseWebhookData())    // Step 3: Parse
        .then(builder => builder.processEvent())        // Step 4: Process
        .then(builder => builder.build());              // Step 5: Build

      console.log('✅ Webhook processing completed successfully');
      return result;

    } catch (error) {
      console.error('💥 Error in webhook processing pipeline:', error);
      return {
        success: false,
        status: 500,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Método alternativo para procesar con datos ya extraídos
   * Útil para testing o cuando ya tienes los datos del request
   */
  async processWebhookData(
    requestBody: string, 
    headers: Record<string, string>
  ): Promise<WebhookProcessResult> {
    try {
      console.log('🚀 Starting webhook data processing with Step Builder Pattern');
      
      // Simular el primer paso con datos ya extraídos
      const builder = new WebhookBuilder(this.config);
      (builder as any).requestBody = requestBody;
      (builder as any).headers = headers;
      (builder as any).clientIP = 'manual';

      const result = await builder
        .validateSignature()     // Step 2: Validate
        .parseWebhookData()      // Step 3: Parse
        .processEvent()          // Step 4: Process
        .build();                // Step 5: Build

      console.log('✅ Webhook data processing completed successfully');
      return result;

    } catch (error) {
      console.error('💥 Error in webhook data processing pipeline:', error);
      return {
        success: false,
        status: 500,
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Método para validación rápida sin procesamiento completo
   */
  async validateWebhookOnly(body: string, headers: Record<string, string>): Promise<{
    isValid: boolean;
    error?: string;
    webhookType?: string;
  }> {
    try {
      const builder = new WebhookBuilder(this.config);
      (builder as any).requestBody = body;
      (builder as any).headers = headers;

      const validationStep = builder.validateSignature();
      const parsingStep = validationStep.parseWebhookData();
      
      return {
        isValid: true,
        webhookType: (parsingStep as any).webhookData?.type
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid webhook format'
      };
    }
  }
}