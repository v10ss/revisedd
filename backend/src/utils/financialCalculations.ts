import Decimal from 'decimal.js';
import { PaymentMode, PaymentSettlement } from '../types';

/**
 * Financial calculation utilities with precision handling
 * Uses decimal.js to avoid floating-point precision errors
 */
export class FinancialCalculations {
  
  /**
   * Safe addition of two numbers with decimal precision
   */
  static add(a: number | string, b: number | string): number {
    try {
      const decimalA = new Decimal(a || 0);
      const decimalB = new Decimal(b || 0);
      return decimalA.add(decimalB).toNumber();
    } catch (error) {
      console.error('Error in financial addition:', error);
      return 0;
    }
  }

  /**
   * Safe subtraction of two numbers with decimal precision
   */
  static subtract(a: number | string, b: number | string): number {
    try {
      const decimalA = new Decimal(a || 0);
      const decimalB = new Decimal(b || 0);
      return decimalA.sub(decimalB).toNumber();
    } catch (error) {
      console.error('Error in financial subtraction:', error);
      return 0;
    }
  }

  /**
   * Safe multiplication with decimal precision
   */
  static multiply(a: number | string, b: number | string): number {
    try {
      const decimalA = new Decimal(a || 0);
      const decimalB = new Decimal(b || 0);
      return decimalA.mul(decimalB).toNumber();
    } catch (error) {
      console.error('Error in financial multiplication:', error);
      return 0;
    }
  }

  /**
   * Safe division with zero-division protection
   */
  static divide(dividend: number | string, divisor: number | string): number {
    try {
      const decimalDividend = new Decimal(dividend || 0);
      const decimalDivisor = new Decimal(divisor || 0);
      
      if (decimalDivisor.isZero()) {
        console.warn('Division by zero attempted in financial calculation');
        return 0;
      }
      
      return decimalDividend.div(decimalDivisor).toNumber();
    } catch (error) {
      console.error('Error in financial division:', error);
      return 0;
    }
  }

  /**
   * Calculate percentage with safe division
   */
  static calculatePercentage(part: number | string, total: number | string): number {
    try {
      const decimalPart = new Decimal(part || 0);
      const decimalTotal = new Decimal(total || 0);
      
      if (decimalTotal.isZero()) {
        return 0;
      }
      
      return decimalPart.div(decimalTotal).mul(100).toDecimalPlaces(2).toNumber();
    } catch (error) {
      console.error('Error in percentage calculation:', error);
      return 0;
    }
  }

  /**
   * Sum an array of numbers with decimal precision
   */
  static sum(numbers: (number | string)[]): number {
    try {
      let result = 0;
      for (const num of numbers) {
        result = this.add(result, num);
      }
      return result;
    } catch (error) {
      console.error('Error in financial sum:', error);
      return 0;
    }
  }

  /**
   * Calculate cash turnover with enhanced precision
   */
  static calculateCashTurnover(
    pettyCashStart: number | string,
    paymentTotals: Record<PaymentMode, number>,
    totalFunds: number | string,
    totalExpenses: number | string,
    pettyCashEnd: number | string
  ): number {
    try {
      // Sum all payment mode amounts
      const paymentModeSum = this.sum(Object.values(paymentTotals));
      
      // Calculate turnover: (Start + Payments + Funds) - Expenses - End
      let turnover = this.add(pettyCashStart, paymentModeSum);
      turnover = this.add(turnover, totalFunds);
      turnover = this.subtract(turnover, totalExpenses);
      turnover = this.subtract(turnover, pettyCashEnd);
      
      return turnover;
    } catch (error) {
      console.error('Error calculating cash turnover:', error);
      return 0;
    }
  }

  /**
   * Calculate remaining balance from settlements with precision
   */
  static calculateRemainingBalance(
    totalAmount: number | string, 
    settlements: PaymentSettlement[]
  ): number {
    try {
      const settlementSum = this.sum(
        settlements.map(settlement => settlement.amount)
      );
      return this.subtract(totalAmount, settlementSum);
    } catch (error) {
      console.error('Error calculating remaining balance:', error);
      return new Decimal(totalAmount || 0).toNumber();
    }
  }

  /**
   * Validate that a number is valid for financial calculations
   */
  static isValidFinancialNumber(value: any): boolean {
    try {
      const decimal = new Decimal(value || 0);
      return decimal.isFinite() && !decimal.isNaN();
    } catch {
      return false;
    }
  }

  /**
   * Round to currency precision (2 decimal places)
   */
  static toCurrencyPrecision(value: number | string): number {
    try {
      return new Decimal(value || 0).toDecimalPlaces(2).toNumber();
    } catch (error) {
      console.error('Error rounding to currency precision:', error);
      return 0;
    }
  }

  /**
   * Compare two financial values for equality (accounting for floating point issues)
   */
  static equals(a: number | string, b: number | string, precision: number = 2): boolean {
    try {
      const decimalA = new Decimal(a || 0).toDecimalPlaces(precision);
      const decimalB = new Decimal(b || 0).toDecimalPlaces(precision);
      return decimalA.equals(decimalB);
    } catch (error) {
      console.error('Error comparing financial values:', error);
      return false;
    }
  }

  /**
   * Validate transaction amount constraints
   */
  static validateTransactionAmount(amount: any): { isValid: boolean; error?: string } {
    if (!this.isValidFinancialNumber(amount)) {
      return { isValid: false, error: 'Invalid amount format' };
    }

    const decimal = new Decimal(amount);
    
    if (decimal.isNegative()) {
      return { isValid: false, error: 'Amount cannot be negative' };
    }

    if (decimal.isZero()) {
      return { isValid: false, error: 'Amount must be greater than zero' };
    }

    // Check for reasonable maximum (adjust as needed)
    if (decimal.greaterThan(new Decimal('999999.99'))) {
      return { isValid: false, error: 'Amount exceeds maximum allowed value' };
    }

    return { isValid: true };
  }

  /**
   * Format number as currency string
   */
  static formatCurrency(amount: number | string, currency: string = 'PHP'): string {
    try {
      const decimal = new Decimal(amount || 0);
      const value = decimal.toDecimalPlaces(2).toNumber();
      
      return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    } catch (error) {
      console.error('Error formatting currency:', error);
      return '₱0.00';
    }
  }
}
