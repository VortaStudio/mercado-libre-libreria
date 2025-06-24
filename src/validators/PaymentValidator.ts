// validators/PaymentValidator.ts

import { ValidationResult } from '../types';

export class PaymentValidator {
  static validatePaymentRequest(data: any): ValidationResult {
    const errors: string[] = [];

    // Validar customer_info
    if (!data.customer_info) {
      errors.push('customer_info es requerido');
    } else {
      if (!data.customer_info.email) {
        errors.push('Email del cliente es requerido');
      } else if (!this.isValidEmail(data.customer_info.email)) {
        errors.push('Email del cliente no es válido');
      }
            
      if (!data.customer_info.name) {
        errors.push('Nombre del cliente es requerido');
      } else if (data.customer_info.name.trim().length < 2) {
        errors.push('Nombre del cliente debe tener al menos 2 caracteres');
      }
    }

    // Validar items array
    if (!data.items) {
      errors.push('items es requerido');
    } else if (!Array.isArray(data.items)) {
      errors.push('items debe ser un array');
    } else if (data.items.length === 0) {
      errors.push('Debe incluir al menos un item');
    } else {
      // Validar cada item individualmente
      data.items.forEach((item: any, index: number) => {
        const itemErrors = this.validatePaymentItem(item, index);
        errors.push(...itemErrors);
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private static validatePaymentItem(item: any, index: number): string[] {
    const errors: string[] = [];
    const itemPrefix = `Item ${index + 1}`;

    // Validar title (obligatorio)
    if (!item.title) {
      errors.push(`${itemPrefix}: título es requerido`);
    } else if (typeof item.title !== 'string') {
      errors.push(`${itemPrefix}: título debe ser una cadena de texto`);
    } else if (item.title.trim().length < 3) {
      errors.push(`${itemPrefix}: título debe tener al menos 3 caracteres`);
    }

    // Validar quantity (obligatorio)
    if (item.quantity === undefined || item.quantity === null) {
      errors.push(`${itemPrefix}: cantidad es requerida`);
    } else if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.push(`${itemPrefix}: cantidad debe ser un número entero mayor a 0`);
    }

    // Validar unit_price (obligatorio)
    if (item.unit_price === undefined || item.unit_price === null) {
      errors.push(`${itemPrefix}: precio unitario es requerido`);
    } else if (typeof item.unit_price !== 'number' || item.unit_price <= 0) {
      errors.push(`${itemPrefix}: precio unitario debe ser un número mayor a 0`);
    } else if (!Number.isInteger(item.unit_price)) {
      errors.push(`${itemPrefix}: precio unitario debe ser un número entero`);
    }

    // Validar description (opcional, pero si está presente debe ser válida)
    if (item.description !== undefined && item.description !== null) {
      if (typeof item.description !== 'string') {
        errors.push(`${itemPrefix}: descripción debe ser una cadena de texto`);
      } else if (item.description.trim().length > 0 && item.description.trim().length < 5) {
        errors.push(`${itemPrefix}: descripción debe tener al menos 5 caracteres o estar vacía`);
      }
    }

    // Validar id (opcional, pero si está presente debe ser válido)
    if (item.id !== undefined && item.id !== null) {
      if (typeof item.id !== 'string') {
        errors.push(`${itemPrefix}: id debe ser una cadena de texto`);
      } else if (item.id.trim().length === 0) {
        errors.push(`${itemPrefix}: id no puede estar vacío si se proporciona`);
      }
    }

    return errors;
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}