import { Transaction, DailyReport, PaymentMode, Expense, Fund, PaymentSettlement } from '../types';

interface MonthlyReportResponse {
  dailyBreakdown: Array<{
    date: string;
    amount: number;
    transactions: number;
  }>;
  totalAmount: number;
  totalTransactions: number;
  topSalesAgents: Array<{
    agent_name: string;
    amount: number;
    transactions: number;
  }>;
}

interface WeeklyReportResponse {
  startDate: string;
  endDate: string;
  summary: {
    totalAmount: number;
    totalTransactions: number;
    averageTransactionValue: number;
    uniqueCustomers: number;
  };
  paymentStats: Array<{
    payment_mode: PaymentMode;
    total_amount: number;
    transaction_count: number;
    percentage: number;
  }>;
}

interface ExportResponse {
  format: string;
  exportedAt: string;
  totalRecords: number;
  data: Transaction[];
  downloadUrl?: string;
  fileBuffer?: ArrayBuffer;
}

interface PaymentModeStatsResponse {
  stats: Array<{
    payment_mode: PaymentMode;
    total_amount: number;
    transaction_count: number;
    percentage: number;
  }>;
  totalAmount: number;
  totalTransactions: number;
}

interface SettlementResponse {
  transaction: Transaction;
  settlements: PaymentSettlement[];
}

/**
 * TransactionApi - Centralized API handling with error management
 * 
 * Features:
 * - 404 errors throw 'NOT_FOUND' special error message
 * - Optional onError callback for components to handle errors (e.g., snackbar feedback)
 * - Callers can decide how to treat NOT_FOUND errors (skip vs show error)
 * 
 * Example usage:
 * ```typescript
 * try {
 *   const transaction = await TransactionApi.getTransaction(id, {
 *     onError: (error, status) => {
 *       if (error.message !== 'NOT_FOUND') {
 *         showSnackbar('Error loading transaction', 'error');
 *       }
 *     }
 *   });
 * } catch (error) {
 *   if (error.message === 'NOT_FOUND') {
 *     // Handle NOT_FOUND specifically - maybe skip or show different message
 *   }
 * }
 * ```
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Gate debug logging in production
const DEBUG_API = process.env.NODE_ENV !== 'production';

interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  paymentMode?: PaymentMode;
  salesAgentId?: number;
  cashierId?: number;
  customerId?: number;
  page?: number;
  limit?: number;
}

interface TransactionListResponse {
  transactions: Transaction[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface ExportRequest {
  format: 'excel' | 'pdf' | 'csv';
  startDate?: string;
  endDate?: string;
  paymentMode?: PaymentMode;
  salesAgentId?: number;
  cashierId?: number;
}

interface ReportGenerationRequest {
  date: string;
  expenses: Expense[];
  funds: Fund[];
  pettyCashStart: number;
  pettyCashEnd: number;
}

interface ApiOptions {
  onError?: (error: Error, status?: number) => void;
}

class TransactionApi {
  private static async fetchWithAuth(url: string, options: RequestInit = {}, apiOptions?: ApiOptions): Promise<Response> {
    const token = localStorage.getItem('accessToken');
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    };

    const fullUrl = `${API_BASE_URL}${url}`;
    
    try {
      const response = await fetch(fullUrl, config);
      
      
      if (!response.ok) {
        const error = response.status === 404 
          ? new Error('NOT_FOUND')
          : new Error(`HTTP error! status: ${response.status}`);
        
        // Call onError callback if provided
        if (apiOptions?.onError) {
          apiOptions.onError(error, response.status);
        }
        
        throw error;
      }
      
      return response;
    } catch (error) {
      // Handle network errors or other fetch errors
      if (error instanceof Error && error.message !== 'NOT_FOUND') {
        const networkError = new Error(`Network error: ${error.message}`);
        if (apiOptions?.onError) {
          apiOptions.onError(networkError);
        }
        throw networkError;
      }
      throw error;
    }
  }

  // Transaction CRUD operations
  static async getTransactions(filters: TransactionFilters = {}, apiOptions?: ApiOptions): Promise<TransactionListResponse> {
    if (DEBUG_API) console.log('🔍 [API_DEBUG] TransactionApi.getTransactions called with filters:', filters);
    
    const queryParams = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    const finalUrl = `/transactions?${queryParams.toString()}`;
    if (DEBUG_API) {
      console.log('🔗 [API_DEBUG] Final API URL:', finalUrl);
      console.log('🔗 [API_DEBUG] Full URL with base:', `${API_BASE_URL}${finalUrl}`);
    }

    const response = await this.fetchWithAuth(finalUrl, {}, apiOptions);
    
    // Log response details before parsing
    if (DEBUG_API) {
      console.log('📡 [API_DEBUG] Raw response status:', response.status);
      console.log('📡 [API_DEBUG] Raw response headers:', Object.fromEntries(response.headers.entries()));
      
      // Clone the response to read it twice (once for logging, once for return)
      const responseClone = response.clone();
      const rawText = await responseClone.text();
      console.log('📡 [API_DEBUG] Raw response body (first 500 chars):', rawText.substring(0, 500));
    }
    
    const jsonData = await response.json();
    if (DEBUG_API) {
      console.log('📊 [API_DEBUG] Parsed JSON response structure:', {
        hasTransactions: Array.isArray(jsonData.transactions),
        transactionCount: jsonData.transactions?.length || 0,
        hasPagination: !!jsonData.pagination,
        paginationTotal: jsonData.pagination?.total || 'N/A'
      });
    }
    
    // Detailed analysis of first few transactions
    if (DEBUG_API && jsonData.transactions && jsonData.transactions.length > 0) {
      console.log('💰 [API_DEBUG] First transaction analysis:');
      const firstTx = jsonData.transactions[0];
      console.log('  Raw transaction object keys:', Object.keys(firstTx));
      console.log('  ID:', firstTx.id, '(type:', typeof firstTx.id, ')');
      console.log('  Amount:', firstTx.amount, '(type:', typeof firstTx.amount, ')');
      console.log('  Payment Mode:', firstTx.payment_mode, '(type:', typeof firstTx.payment_mode, ')');
      console.log('  Customer Name:', firstTx.customer_name, '(type:', typeof firstTx.customer_name, ')');
      console.log('  Paid Amount:', firstTx.paid_amount, '(type:', typeof firstTx.paid_amount, ')');
      console.log('  Balance Amount:', firstTx.balance_amount, '(type:', typeof firstTx.balance_amount, ')');
      
      // Check if amount is zero or invalid
      if (firstTx.amount === 0 || firstTx.amount === null || firstTx.amount === undefined) {
        console.warn('⚠️ [API_DEBUG] ISSUE FOUND: Transaction amount is zero, null, or undefined!');
        console.warn('  This suggests the issue is in the backend data or query.');
      }
      
      if (!firstTx.payment_mode || firstTx.payment_mode === '') {
        console.warn('⚠️ [API_DEBUG] ISSUE FOUND: Payment mode is empty or undefined!');
        console.warn('  This suggests payment mode data is not being returned from backend.');
      }
    } else if (DEBUG_API) {
      console.log('📋 [API_DEBUG] No transactions returned from API');
    }

    // Frontend normalization hotfix: ensure a meaningful amount is present
    const toNumberSafe = (val: any): number => {
      if (typeof val === 'number') return isFinite(val) ? val : 0;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[₱$,\s]/g, '');
        const parsed = parseFloat(cleaned);
        return isFinite(parsed) ? parsed : 0;
      }
      const n = Number(val);
      return isFinite(n) ? n : 0;
    };

    let normalizedCount = 0;
    const normalized = {
      ...jsonData,
      transactions: Array.isArray(jsonData.transactions)
        ? jsonData.transactions.map((tx: any) => {
            const originalAmount = toNumberSafe(tx.amount);
            let amount = originalAmount;
            if (amount <= 0) {
              const paid = toNumberSafe(tx.paid_amount);
              const balance = toNumberSafe(tx.balance_amount);
              const sum = paid + balance;
              if (sum > 0) {
                amount = sum;
              } else {
                const alt = toNumberSafe((tx as any).total_amount ?? (tx as any).totalAmount ?? (tx as any).price ?? (tx as any).value);
                if (alt > 0) amount = alt;
              }
            }
            if (amount > 0 && originalAmount <= 0) normalizedCount++;
            return { ...tx, amount };
          })
        : []
    } as TransactionListResponse;

    if (DEBUG_API && normalizedCount > 0) {
      console.warn(`⚠️ [API_DEBUG] Normalized amount for ${normalizedCount} transactions via fallback fields`);
    }
    
    return normalized;
  }

  static async getTransaction(id: number, apiOptions?: ApiOptions): Promise<Transaction> {
    // Guard against invalid IDs - throw early if not a valid number
    if (typeof id !== 'number' || Number.isNaN(id)) {
      const error = new Error('Invalid transaction ID: must be a valid number');
      if (apiOptions?.onError) {
        apiOptions.onError(error);
      }
      throw error;
    }
    const response = await this.fetchWithAuth(`/transactions/${id}`, {}, apiOptions);
    return response.json();
  }

  static async createTransaction(transactionData: Omit<Transaction, 'id' | 'created_at'>, apiOptions?: ApiOptions): Promise<Transaction> {
    const response = await this.fetchWithAuth('/transactions', {
      method: 'POST',
      body: JSON.stringify(transactionData),
    }, apiOptions);
    return response.json();
  }

  static async updateTransaction(id: number, updates: Partial<Transaction>, apiOptions?: ApiOptions): Promise<Transaction> {
    // Guard against invalid IDs
    if (!id || isNaN(id) || id <= 0) {
      throw new Error('Invalid transaction ID provided');
    }
    const response = await this.fetchWithAuth(`/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, apiOptions);
    return response.json();
  }

  static async deleteTransaction(id: number, apiOptions?: ApiOptions): Promise<void> {
    // Guard against invalid IDs
    if (!id || isNaN(id) || id <= 0) {
      throw new Error('Invalid transaction ID provided');
    }
    await this.fetchWithAuth(`/transactions/${id}`, {
      method: 'DELETE',
    }, apiOptions);
  }

  // Report operations
  static async getDailySummary(date?: string, apiOptions?: ApiOptions): Promise<{
    totalAmount: number;
    totalTransactions: number;
    paymentModeBreakdown: Record<string, { amount: number; count: number }>;
    salesAgentBreakdown: Array<{ agent_name: string; amount: number; count: number }>;
  }> {
    console.log(`🔍 [API_DEBUG] TransactionApi.getDailySummary called with date: ${date || 'none (today)'}`); 
    const queryParams = date ? `?date=${date}` : '';
    const finalUrl = `/transactions/reports/daily${queryParams}`;
    console.log('🔗 [API_DEBUG] getDailySummary URL:', finalUrl);
    console.log('🔗 [API_DEBUG] Full URL with base:', `${API_BASE_URL}${finalUrl}`);
    
    try {
      const response = await this.fetchWithAuth(finalUrl, {}, apiOptions);
      
      // Log response details before parsing
      console.log('📡 [API_DEBUG] getDailySummary response status:', response.status);
      console.log('📡 [API_DEBUG] getDailySummary response headers:', Object.fromEntries(response.headers.entries()));
      
      // Clone the response to log the body
      const responseClone = response.clone();
      const rawText = await responseClone.text();
      console.log('📡 [API_DEBUG] getDailySummary raw response (first 500 chars):', rawText.substring(0, 500));
      
      const summary = await response.json();
      console.log('📊 [API_DEBUG] getDailySummary parsed response:', {
        totalAmount: summary.totalAmount,
        totalTransactions: summary.totalTransactions,
        hasPaymentModeBreakdown: !!summary.paymentModeBreakdown,
        hasSalesAgentBreakdown: !!summary.salesAgentBreakdown,
        paymentModeCount: Object.keys(summary.paymentModeBreakdown || {}).length
      });
      
      // Analyze payment mode breakdown
      if (summary.paymentModeBreakdown) {
        console.log('💳 [API_DEBUG] Payment mode breakdown analysis:');
        Object.entries(summary.paymentModeBreakdown).forEach(([mode, data]) => {
          const modeData = data as { amount: number; count: number };
          console.log(`  ${mode}: amount=${modeData.amount}, count=${modeData.count}, type=${typeof modeData.amount}`);
        });
        
        // Check if all amounts are zero
        const allAmounts = Object.values(summary.paymentModeBreakdown).map(mode => {
          const modeData = mode as { amount: number; count: number };
          return modeData.amount;
        });
        const allZero = allAmounts.every(amount => amount === 0);
        console.log('⚠️ [API_DEBUG] All payment mode amounts are zero:', allZero);
        
        if (allZero && summary.totalAmount > 0) {
          console.error('🚨 [API_DEBUG] CRITICAL ISSUE: Total amount is non-zero but all payment modes are zero!');
          console.error('  This suggests a data consistency issue in the backend calculation.');
        }
      } else {
        console.warn('⚠️ [API_DEBUG] No payment mode breakdown in response!');
      }
      
      return summary;
    } catch (error) {
      console.error('❌ [API_DEBUG] Error in getDailySummary:', error);
      throw error;
    }
  }

  // New: Range summary (inclusive)
  static async getDailySummaryRange(startDate: string, endDate: string, apiOptions?: ApiOptions): Promise<{
    totalAmount: number;
    totalTransactions: number;
    paidTransactions?: number;
    unpaidTransactions?: number;
    registeredCustomers?: number;
    paymentModeBreakdown: Record<string, { amount: number; count: number }>;
    salesAgentBreakdown: Array<{ agent_name: string; amount: number; count: number }>;
  }> {
    const finalUrl = `/transactions/reports/daily?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    console.log('🔗 [API_DEBUG] getDailySummaryRange URL:', finalUrl);
    console.log('🔗 [API_DEBUG] Full URL with base:', `${API_BASE_URL}${finalUrl}`);

    try {
      const response = await this.fetchWithAuth(finalUrl, {}, apiOptions);
      console.log('📡 [API_DEBUG] getDailySummaryRange response status:', response.status);
      const summary = await response.json();
      console.log('📊 [API_DEBUG] getDailySummaryRange parsed response:', {
        totalAmount: summary.totalAmount,
        totalTransactions: summary.totalTransactions
      });
      return summary;
    } catch (error) {
      console.error('❌ [API_DEBUG] Error in getDailySummaryRange:', error);
      throw error;
    }
  }

  static async generateDailyReport(request: ReportGenerationRequest, apiOptions?: ApiOptions): Promise<DailyReport> {
    const response = await this.fetchWithAuth('/transactions/reports/daily', {
      method: 'POST',
      body: JSON.stringify(request),
    }, apiOptions);
    return response.json();
  }

  static async getDailyReport(date: string, apiOptions?: ApiOptions): Promise<DailyReport> {
    const url = `/transactions/reports/daily/${date}`;
    const response = await this.fetchWithAuth(url, {}, apiOptions);
    return response.json();
  }

  static async getMonthlyReport(year: number, month: number): Promise<MonthlyReportResponse> {
    const response = await this.fetchWithAuth(`/transactions/reports/monthly?year=${year}&month=${month}`);
    return response.json();
  }

  static async deleteDailyReport(date: string, apiOptions?: ApiOptions): Promise<void> {
    await this.fetchWithAuth(`/admin/reports/daily/${date}`, {
      method: 'DELETE',
    }, apiOptions);
  }

  static async getWeeklyReport(startDate: string, endDate: string): Promise<WeeklyReportResponse> {
    const response = await this.fetchWithAuth(`/transactions/reports/weekly?startDate=${startDate}&endDate=${endDate}`);
    return response.json();
  }

  // Export operations
  static async exportTransactions(request: ExportRequest): Promise<ExportResponse> {
    const response = await this.fetchWithAuth('/transactions/export', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    return response.json();
  }

  // Payment mode statistics
  static async getPaymentModeStats(startDate: string, endDate: string): Promise<PaymentModeStatsResponse> {
    const response = await this.fetchWithAuth(`/transactions/stats/payment-modes?startDate=${startDate}&endDate=${endDate}`);
    return response.json();
  }

  // Settlement operations
  static async createSettlement(transactionId: number, settlementData: {
    amount: number;
    payment_mode: PaymentMode;
    cashier_id: number;
    notes?: string;
  }): Promise<SettlementResponse> {
    // Guard against invalid transaction IDs
    if (!transactionId || isNaN(transactionId) || transactionId <= 0) {
      throw new Error('Invalid transaction ID provided for settlement');
    }
    const response = await this.fetchWithAuth(`/transactions/${transactionId}/settlements`, {
      method: 'POST',
      body: JSON.stringify(settlementData),
    });
    return response.json();
  }

  static async getSettlements(transactionId: number): Promise<PaymentSettlement[]> {
    // Guard against invalid transaction IDs
    if (!transactionId || isNaN(transactionId) || transactionId <= 0) {
      throw new Error('Invalid transaction ID provided for settlements lookup');
    }
    const response = await this.fetchWithAuth(`/transactions/${transactionId}/settlements`);
    return response.json();
  }

  // Alias for getSettlements to match the expected API
  static async getSettlementHistory(transactionId: number): Promise<PaymentSettlement[]> {
    return this.getSettlements(transactionId);
  }

}

export default TransactionApi;
export type { ApiOptions };
