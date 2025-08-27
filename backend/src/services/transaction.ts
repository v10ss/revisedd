import { pool } from '../config/database';
import { Transaction, PaymentMode, DailyReport, Expense, Fund } from '../types';
import { WebSocketService } from './websocket';
import { CustomerService } from './customer';
import { FinancialCalculations } from '../utils/financialCalculations';
import * as pg from 'pg';

export class TransactionService {
  static async create(transactionData: {
    customer_id: number;
    or_number: string;
    amount: number;
    payment_mode: PaymentMode;
    sales_agent_id: number;
    cashier_id?: number;
  }): Promise<Transaction> {
    const {
      customer_id,
      or_number,
      amount,
      payment_mode,
      sales_agent_id,
      cashier_id
    } = transactionData;

    // Local helpers to normalize values
    const toNumber = (v: any): number => {
      if (typeof v === 'number') return isNaN(v) ? 0 : v;
      if (typeof v === 'string') {
        const cleaned = v.replace(/[₱$,\s]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
      }
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };
    const normalizeMode = (m: any): PaymentMode => {
      const s = String(m || '').toLowerCase().trim();
      switch (s) {
        case 'gcash': return PaymentMode.GCASH;
        case 'maya': return PaymentMode.MAYA;
        case 'bank_transfer':
        case 'banktransfer':
        case 'bank transfer': return PaymentMode.BANK_TRANSFER;
        case 'credit_card':
        case 'creditcard':
        case 'credit card': return PaymentMode.CREDIT_CARD;
        case 'cash': return PaymentMode.CASH;
        default: return PaymentMode.CASH;
      }
    };

    // Start with provided values
    let finalAmount = toNumber(amount);
    // Always normalize provided payment_mode first
    let finalPaymentMode = normalizeMode(payment_mode);

    // Determine if we need to fetch customer's payment_info only for amount fallback
    const needFetch = (!finalAmount || finalAmount <= 0);

    if (needFetch) {
      try {
        const customerQuery = `SELECT payment_info FROM customers WHERE id = $1`;
        const customerResult = await pool.query(customerQuery, [customer_id]);
        if (customerResult.rows.length > 0 && customerResult.rows[0].payment_info) {
          const paymentInfo = customerResult.rows[0].payment_info || {};
          if ((!finalAmount || finalAmount <= 0) && paymentInfo.amount) {
            finalAmount = toNumber(paymentInfo.amount);
            console.log(`Retrieved amount ${finalAmount} from customer payment_info for transaction creation`);
          }
          // If provided payment_mode was empty/undefined, optionally fallback to customer
          if ((payment_mode === undefined || payment_mode === null || String(payment_mode).trim() === '') && paymentInfo.mode) {
            finalPaymentMode = normalizeMode(paymentInfo.mode);
            console.log(`Retrieved payment_mode ${finalPaymentMode} from customer payment_info for transaction creation`);
          }
        }
      } catch (error) {
        console.error('Error retrieving customer payment_info for transaction creation:', error);
        // Continue with the original values if there's an error
      }
    }

    // Ensure we have a valid balance_amount that matches the amount
    const query = `
      INSERT INTO transactions (
        customer_id, or_number, amount, payment_mode, 
        sales_agent_id, cashier_id, transaction_date, paid_amount, balance_amount, payment_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, 0, $3, 'unpaid')
      RETURNING *
    `;

    const values = [
      customer_id,
      or_number,
      finalAmount, // Use the potentially retrieved amount
      finalPaymentMode,
      sales_agent_id,
      cashier_id
    ];

    const result = await pool.query(query, values);
    const transaction = result.rows[0];

    // Emit real-time update
    WebSocketService.emitTransactionUpdate({
      type: 'transaction_created',
      transaction,
      timestamp: new Date()
    });

    return transaction;
  }

  static async findById(id: number): Promise<Transaction | null> {
    const query = `
SELECT 
        t.id,
        t.customer_id,
        t.or_number,
        -- Compute reliable amount; prefer customer's payment_info when t.amount is invalid, use (paid+balance) only as last resort
        CAST(
          CASE 
            WHEN t.amount IS NULL OR t.amount <= 0 THEN 
              CASE 
                WHEN NULLIF((c.payment_info::jsonb->>'amount'), '') IS NOT NULL THEN 
                  COALESCE(NULLIF(regexp_replace((c.payment_info::jsonb->>'amount'), '[^0-9\.-]', '', 'g'), '')::numeric, 0)
                WHEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0) > 0 THEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0)
                ELSE 0
              END
            ELSE t.amount
          END AS NUMERIC
        )::FLOAT as amount,
        -- Derive payment_mode: prefer latest settlement; else use customer's payment_info if transaction mode is missing or default 'cash'; else normalize transaction mode
        COALESCE(
          (SELECT ps.payment_mode FROM payment_settlements ps WHERE ps.transaction_id = t.id ORDER BY ps.paid_at DESC LIMIT 1),
          CASE 
            WHEN (t.payment_mode IS NULL OR t.payment_mode = '' OR t.payment_mode = 'cash') 
                 AND NULLIF((c.payment_info::jsonb->>'mode'), '') IS NOT NULL THEN 
              LOWER(REPLACE((c.payment_info::jsonb->>'mode'), ' ', '_'))
            ELSE LOWER(REPLACE(COALESCE(t.payment_mode, ''), ' ', '_'))
          END
        ) as payment_mode,
        t.sales_agent_id,
        t.cashier_id,
        t.transaction_date,
        t.created_at,
        t.updated_at,
        CAST(t.paid_amount AS NUMERIC)::FLOAT as paid_amount, 
        CAST(t.balance_amount AS NUMERIC)::FLOAT as balance_amount, 
        t.payment_status,
        c.name as customer_name,
        u1.full_name as sales_agent_name,
        u2.full_name as cashier_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u1 ON t.sales_agent_id = u1.id
      LEFT JOIN users u2 ON t.cashier_id = u2.id
      WHERE t.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  static async findByOrNumber(orNumber: string): Promise<Transaction | null> {
    const query = `
SELECT 
        t.id,
        t.customer_id,
        t.or_number,
        -- Compute reliable amount; prefer customer's payment_info when t.amount is invalid, use (paid+balance) only as last resort
        CAST(
          CASE 
            WHEN t.amount IS NULL OR t.amount <= 0 THEN 
              CASE 
                WHEN NULLIF((c.payment_info::jsonb->>'amount'), '') IS NOT NULL THEN 
                  COALESCE(NULLIF(regexp_replace((c.payment_info::jsonb->>'amount'), '[^0-9\.-]', '', 'g'), '')::numeric, 0)
                WHEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0) > 0 THEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0)
                ELSE 0
              END
            ELSE t.amount
          END AS NUMERIC
        )::FLOAT as amount,
        -- Derive payment_mode: prefer latest settlement; else use customer's payment_info if transaction mode is missing or default 'cash'; else normalize transaction mode
        COALESCE(
          (SELECT ps.payment_mode FROM payment_settlements ps WHERE ps.transaction_id = t.id ORDER BY ps.paid_at DESC LIMIT 1),
          CASE 
            WHEN (t.payment_mode IS NULL OR t.payment_mode = '' OR t.payment_mode = 'cash') 
                 AND NULLIF((c.payment_info::jsonb->>'mode'), '') IS NOT NULL THEN 
              LOWER(REPLACE((c.payment_info::jsonb->>'mode'), ' ', '_'))
            ELSE LOWER(REPLACE(COALESCE(t.payment_mode, ''), ' ', '_'))
          END
        ) as payment_mode,
        t.sales_agent_id,
        t.cashier_id,
        t.transaction_date,
        t.created_at,
        t.updated_at,
        CAST(t.paid_amount AS NUMERIC)::FLOAT as paid_amount, 
        CAST(t.balance_amount AS NUMERIC)::FLOAT as balance_amount, 
        t.payment_status,
        c.name as customer_name,
        u1.full_name as sales_agent_name,
        u2.full_name as cashier_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u1 ON t.sales_agent_id = u1.id
      LEFT JOIN users u2 ON t.cashier_id = u2.id
      WHERE t.or_number = $1
    `;

    const result = await pool.query(query, [orNumber]);
    return result.rows[0] || null;
  }

  static async list(filters: {
    startDate?: Date;
    endDate?: Date;
    paymentMode?: PaymentMode;
    salesAgentId?: number;
    cashierId?: number;
    customerId?: number;
    includePaymentDetails?: boolean; // New flag to determine if payment details are needed
  } = {}, limit: number = 50, offset: number = 0): Promise<{ transactions: Transaction[], total: number }> {
    // Only include payment details if explicitly requested
    const paymentFields = filters.includePaymentDetails 
      ? 'CAST(t.paid_amount AS NUMERIC)::FLOAT as paid_amount, CAST(t.balance_amount AS NUMERIC)::FLOAT as balance_amount, t.payment_status,'
      : '';
      
    let query = `
SELECT 
        t.id,
        t.customer_id,
        t.or_number,
        -- Compute a reliable amount at the source. Prefer customer's payment_info when t.amount is invalid; use (paid+balance) only as last resort
        CAST(
          CASE 
            WHEN t.amount IS NULL OR t.amount <= 0 THEN 
              CASE 
                WHEN NULLIF((c.payment_info::jsonb->>'amount'),'') IS NOT NULL THEN 
                  COALESCE(NULLIF(regexp_replace((c.payment_info::jsonb->>'amount'), '[^0-9\.-]', '', 'g'), '')::numeric, 0)
                WHEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0) > 0 THEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0)
                ELSE 0
              END
            ELSE t.amount
          END 
          AS NUMERIC
        )::FLOAT as amount,
        -- Derive payment_mode: prefer latest settlement; else use customer's payment_info if transaction mode is missing or default 'cash'; else normalize transaction mode
        COALESCE(
          (SELECT ps.payment_mode FROM payment_settlements ps WHERE ps.transaction_id = t.id ORDER BY ps.paid_at DESC LIMIT 1),
          CASE 
            WHEN (t.payment_mode IS NULL OR t.payment_mode = '' OR t.payment_mode = 'cash') 
                 AND NULLIF((c.payment_info::jsonb->>'mode'), '') IS NOT NULL THEN 
              LOWER(REPLACE((c.payment_info::jsonb->>'mode'), ' ', '_'))
            ELSE LOWER(REPLACE(COALESCE(t.payment_mode, ''), ' ', '_'))
          END
        ) as payment_mode,
        t.sales_agent_id,
        t.cashier_id,
        t.transaction_date,
        t.created_at,
        t.updated_at,
        ${paymentFields}
        c.name as customer_name,
        c.contact_number as customer_contact,
        c.email as customer_email,
        c.queue_status as customer_queue_status,
        u1.full_name as sales_agent_name,
        u2.full_name as cashier_name
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u1 ON t.sales_agent_id = u1.id
      LEFT JOIN users u2 ON t.cashier_id = u2.id
      WHERE 1=1
    `;

    let countQuery = `
      SELECT COUNT(*) as total
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      WHERE 1=1
    `;

    const values: (Date | PaymentMode | number)[] = [];
    let paramCount = 1;

    if (filters.startDate) {
      const startDateCondition = ` AND t.transaction_date >= $${paramCount}`;
      query += startDateCondition;
      countQuery += startDateCondition;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      const endDateCondition = ` AND t.transaction_date <= $${paramCount}`;
      query += endDateCondition;
      countQuery += endDateCondition;
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.paymentMode) {
      const paymentCondition = ` AND t.payment_mode = $${paramCount}`;
      query += paymentCondition;
      countQuery += paymentCondition;
      values.push(filters.paymentMode);
      paramCount++;
    }

    if (filters.salesAgentId) {
      const salesCondition = ` AND t.sales_agent_id = $${paramCount}`;
      query += salesCondition;
      countQuery += salesCondition;
      values.push(filters.salesAgentId);
      paramCount++;
    }

    if (filters.cashierId) {
      const cashierCondition = ` AND t.cashier_id = $${paramCount}`;
      query += cashierCondition;
      countQuery += cashierCondition;
      values.push(filters.cashierId);
      paramCount++;
    }

    if (filters.customerId) {
      const customerCondition = ` AND t.customer_id = $${paramCount}`;
      query += customerCondition;
      countQuery += customerCondition;
      values.push(filters.customerId);
      paramCount++;
    }

    query += ` ORDER BY t.transaction_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const [transactionsResult, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, paramCount - 1))
    ]);

    return {
      transactions: transactionsResult.rows,
      total: parseInt(countResult.rows[0].total)
    };
  }

 static async updatePaymentStatus(txId: number, settlementRequestId?: string, client?: pg.PoolClient): Promise<Transaction | null> {
    // TRACING: Log entry point with optional settlement request ID
    const traceId = settlementRequestId || `UPDATE_${Date.now()}`;
    console.log(`[TRANSACTION_TRACE] ${traceId}: Starting updatePaymentStatus for transaction ${txId}`);
    
    // First, get current transaction state for comparison
    const currentQuery = `SELECT * FROM transactions WHERE id = $1`;
    const currentResult = client ? await client.query(currentQuery, [txId]) : await pool.query(currentQuery, [txId]);
    const currentTransaction = currentResult.rows[0];
    const oldStatus = currentTransaction?.payment_status;
    const oldPaidAmount = currentTransaction?.paid_amount;
    
    // Log SQL transaction update
    console.log(`[TRANSACTION_TRACE] ${traceId}: Updating payment status in database`);
    const query = `
      WITH effective AS (
        SELECT 
          t.id,
          -- Compute effective amount using transaction.amount if set; otherwise prefer customer's payment_info.amount; do not use (paid+balance) here to avoid circular errors
          CAST(
            CASE 
              WHEN t.amount IS NOT NULL AND t.amount > 0 THEN t.amount
              WHEN NULLIF((c.payment_info::jsonb->>'amount'), '') IS NOT NULL THEN 
                COALESCE(NULLIF(regexp_replace((c.payment_info::jsonb->>'amount'), '[^0-9\.-]', '', 'g'), '')::numeric, 0)
              ELSE 0
            END AS NUMERIC
          )::FLOAT AS effective_amount
        FROM transactions t
        LEFT JOIN customers c ON t.customer_id = c.id
        WHERE t.id = $1
      ), paid AS (
        SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payment_settlements WHERE transaction_id = $1
      )
      UPDATE transactions
      SET paid_amount = paid.total_paid,
          balance_amount = GREATEST(effective.effective_amount - paid.total_paid, 0),
          payment_status = CASE
            WHEN paid.total_paid = 0 THEN 'unpaid'
            WHEN effective.effective_amount > 0 AND paid.total_paid >= effective.effective_amount THEN 'paid'
            ELSE 'partial'
          END
      FROM effective, paid
      WHERE transactions.id = effective.id
      RETURNING *
    `;

    const result = client ? await client.query(query, [txId]) : await pool.query(query, [txId]);
    const transaction = result.rows[0] || null;
    
    console.log(`[TRANSACTION_TRACE] ${traceId}: Old status: ${oldStatus}, Old paid: ${oldPaidAmount}`);
    console.log(`[TRANSACTION_TRACE] ${traceId}: New status: ${transaction?.payment_status}, New paid: ${transaction?.paid_amount}`);

    if (transaction) {
      // Check for changes before emitting (deduplication gate)
      const statusChanged = transaction.payment_status !== oldStatus;
      const paidAmountChanged = parseFloat(transaction.paid_amount) !== parseFloat(oldPaidAmount || 0);
      
      if (statusChanged || paidAmountChanged) {
        // Emit structured payment status update
        console.log(`[TRANSACTION_TRACE] ${traceId}: Emitting WebSocket payment status update (status changed: ${statusChanged}, amount changed: ${paidAmountChanged})`);
        WebSocketService.emitPaymentStatusUpdate({
          transactionId: transaction.id,
          payment_status: transaction.payment_status,
          balance_amount: transaction.balance_amount || (transaction.amount - transaction.paid_amount),
          paid_amount: transaction.paid_amount,
          customer_id: transaction.customer_id,
          or_number: transaction.or_number
        }, traceId);

        // Emit general transaction update for backward compatibility
        console.log(`[TRANSACTION_TRACE] ${traceId}: Emitting WebSocket transaction update`);
        WebSocketService.emitTransactionUpdate({
          type: 'payment_status_updated',
          transaction,
          timestamp: new Date()
        }, traceId);
      } else {
        console.log(`[TRANSACTION_TRACE] ${traceId}: No changes detected, skipping WebSocket emission`);
      }
    }

    console.log(`[TRANSACTION_TRACE] ${traceId}: updatePaymentStatus completed`);
    return transaction;
  }

  static async update(id: number, updates: {
    amount?: number;
    payment_mode?: PaymentMode;
    cashier_id?: number;
  }): Promise<Transaction> {
    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        setClause.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid updates provided');
    }

    values.push(id);
    const query = `
      UPDATE transactions 
      SET ${setClause.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Transaction not found');
    }

    const transaction = result.rows[0];

    // Check if amount was updated to trigger payment status recalculation
    if (updates.amount !== undefined) {
      await TransactionService.updatePaymentStatus(id);
    }

    // Emit real-time update
    WebSocketService.emitTransactionUpdate({
      type: 'transaction_updated',
      transaction,
      timestamp: new Date()
    });

    return transaction;
  }

  static async delete(id: number): Promise<void> {
    const query = `DELETE FROM transactions WHERE id = $1`;
    const result = await pool.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new Error('Transaction not found');
    }

    // Emit real-time update
    WebSocketService.emitTransactionUpdate({
      type: 'transaction_deleted',
      transactionId: id,
      timestamp: new Date()
    });
  }

  static async getDailySummary(date: Date = new Date()): Promise<{
    totalAmount: number;
    totalTransactions: number;
    paidTransactions: number;
    unpaidTransactions: number;
    registeredCustomers: number;
    paymentModeBreakdown: Record<PaymentMode, { amount: number; count: number }>;
    salesAgentBreakdown: Array<{ agent_name: string; amount: number; count: number }>;
  }> {
    // Backward-compatible wrapper: summary for a single day (Asia/Manila)
    return this.getSummaryRange(date, date, 'Asia/Manila');
  }

  /**
   * Get summary for a date range (inclusive), normalized to a specific timezone for date-only matching.
   * Defaults to Asia/Manila as requested.
   */
  static async getSummaryRange(
    startDate: Date,
    endDate: Date,
    timezone: string = 'Asia/Manila'
  ): Promise<{
    totalAmount: number;
    totalTransactions: number;
    paidTransactions: number;
    unpaidTransactions: number;
    registeredCustomers: number;
    paymentModeBreakdown: Record<PaymentMode, { amount: number; count: number }>;
    salesAgentBreakdown: Array<{ agent_name: string; amount: number; count: number }>;
  }> {
    const cid = `DAILYSUM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startDateOnly = new Date(startDate).toISOString().split('T')[0];
    const endDateOnly = new Date(endDate).toISOString().split('T')[0];

    console.log(`[${cid}] getSummaryRange start: ${startDateOnly}, end: ${endDateOnly}, tz: ${timezone}`);

    // Reusable expressions to ensure consistent calculations
    const effectiveAmountExpr = `
      CAST(
        CASE 
          WHEN t.amount IS NULL OR t.amount <= 0 THEN 
            CASE 
              WHEN NULLIF((c.payment_info::jsonb->>'amount'),'') IS NOT NULL THEN 
                COALESCE(NULLIF(regexp_replace((c.payment_info::jsonb->>'amount'), '[^0-9\\.-]', '', 'g'), '')::numeric, 0)
              WHEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0) > 0 THEN COALESCE(t.paid_amount, 0) + COALESCE(t.balance_amount, 0)
              ELSE 0
            END
          ELSE t.amount
        END AS NUMERIC
      )`;

    const derivedPaymentModeExpr = `
      COALESCE(
        ps_latest.payment_mode,
        CASE 
          WHEN (t.payment_mode IS NULL OR t.payment_mode = '' OR t.payment_mode = 'cash') 
               AND NULLIF((c.payment_info::jsonb->>'mode'), '') IS NOT NULL THEN 
            LOWER(REPLACE((c.payment_info::jsonb->>'mode'), ' ', '_'))
          ELSE LOWER(REPLACE(COALESCE(t.payment_mode, ''), ' ', '_'))
        END
      )`;

    // Use timezone-local date extraction for filters
    const dateExpr = `DATE(t.transaction_date AT TIME ZONE '${timezone}')`;
    const custDateExpr = `DATE(c.created_at AT TIME ZONE '${timezone}')`;

    // Helper to execute and log queries with correlation id
    const run = async (name: string, sql: string, params: any[]) => {
      try {
        console.log(`[${cid}] SQL(${name}) params=${JSON.stringify(params)} sql=${sql.replace(/\s+/g, ' ').trim().slice(0, 200)}...`);
        const result = await pool.query(sql, params);
        console.log(`[${cid}] SQL(${name}) ok: rows=${result.rowCount}`);
        return result;
      } catch (err: any) {
        console.error(`[${cid}] SQL(${name}) error:`, {
          code: err?.code,
          detail: err?.detail,
          hint: err?.hint,
          position: err?.position,
          schema: err?.schema,
          table: err?.table,
          column: err?.column,
          constraint: err?.constraint,
          message: err?.message,
        });
        console.error(`[${cid}] SQL(${name}) failed SQL:`, sql);
        throw err;
      }
    };

    // 1) Global totals
    const totalsQ = `
      SELECT COUNT(*)::int AS total_transactions,
             COALESCE(SUM(${effectiveAmountExpr}),0)::numeric AS total_amount
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE ${dateExpr} BETWEEN $1::date AND $2::date
    `;

    // 2) Per-mode breakdown
    const modesQ = `
      SELECT ${derivedPaymentModeExpr} AS payment_mode,
             COUNT(*)::int AS count,
             COALESCE(SUM(${effectiveAmountExpr}),0)::numeric AS amount
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN LATERAL (
        SELECT ps.payment_mode
        FROM payment_settlements ps
        WHERE ps.transaction_id = t.id
        ORDER BY ps.paid_at DESC
        LIMIT 1
      ) ps_latest ON true
      WHERE ${dateExpr} BETWEEN $1::date AND $2::date
      GROUP BY 1
    `;

    // 3) Payment status breakdown
    const paymentStatusQ = `
      SELECT payment_status, COUNT(*)::int as count
      FROM transactions t
      WHERE ${dateExpr} BETWEEN $1::date AND $2::date
      GROUP BY payment_status
    `;

    // 4) Sales agent breakdown
    const agentQuery = `
      SELECT 
        u.full_name as agent_name,
        COUNT(*)::int as count,
        COALESCE(SUM(${effectiveAmountExpr}),0)::numeric as amount
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.sales_agent_id = u.id
      WHERE ${dateExpr} BETWEEN $1::date AND $2::date
      GROUP BY u.id, u.full_name
      ORDER BY amount DESC
    `;

    try {
      const params = [startDateOnly, endDateOnly];
      const [totalsResult, modesResult, paymentStatusResult, agentResult, registeredCustomersResult] = await Promise.all([
        run('totals', totalsQ, params),
        run('modes', modesQ, params),
        run('status', paymentStatusQ, params),
        run('agents', agentQuery, params),
        run('customers', `SELECT COUNT(*)::int AS count FROM customers c WHERE ${custDateExpr} BETWEEN $1::date AND $2::date`, params)
      ]);

      const paymentModeBreakdown: Record<PaymentMode, { amount: number; count: number }> = {
        [PaymentMode.CASH]: { amount: 0, count: 0 },
        [PaymentMode.GCASH]: { amount: 0, count: 0 },
        [PaymentMode.MAYA]: { amount: 0, count: 0 },
        [PaymentMode.CREDIT_CARD]: { amount: 0, count: 0 },
        [PaymentMode.BANK_TRANSFER]: { amount: 0, count: 0 }
      };

      const globalTotals = totalsResult.rows[0] || { total_transactions: null, total_amount: null };
      const totalAmount = parseFloat(globalTotals.total_amount || '0') || 0;
      const totalTransactions = parseInt(globalTotals.total_transactions || '0') || 0;

      let paidTransactions = 0;
      let unpaidTransactions = 0;
      paymentStatusResult.rows.forEach(row => {
        const count = parseInt(row.count || '0') || 0;
        if (row.payment_status === 'paid') {
          paidTransactions = count;
        } else if (row.payment_status === 'pending' || row.payment_status === 'unpaid') {
          unpaidTransactions += count;
        }
      });

      modesResult.rows.forEach(row => {
        const mode = row.payment_mode as PaymentMode;
        if (paymentModeBreakdown.hasOwnProperty(mode)) {
          paymentModeBreakdown[mode] = {
            amount: parseFloat(row.amount || '0') || 0,
            count: parseInt(row.count || '0') || 0
          };
        }
      });

      const result = {
        totalAmount,
        totalTransactions,
        paidTransactions,
        unpaidTransactions,
        paymentModeBreakdown,
        salesAgentBreakdown: agentResult.rows.map(row => ({
          agent_name: row.agent_name,
          amount: parseFloat(row.amount || '0') || 0,
          count: parseInt(row.count || '0') || 0
        })),
        registeredCustomers: parseInt(registeredCustomersResult.rows?.[0]?.count || '0')
      };

      console.log(`[${cid}] getSummaryRange result:`, {
        totalAmount: result.totalAmount,
        totalTransactions: result.totalTransactions,
        paidTransactions: result.paidTransactions,
        unpaidTransactions: result.unpaidTransactions,
      });

      return result;
    } catch (error) {
      console.error(`[${cid}] getSummaryRange error:`, error);
      throw error;
    }
  }

  static async getMonthlyReport(year: number, month: number): Promise<{
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
  }> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const query = `
      SELECT 
        DATE(transaction_date) as date,
        COUNT(*) as transactions,
        SUM(amount) as amount,
        u.full_name as agent_name
      FROM transactions t
      LEFT JOIN users u ON t.sales_agent_id = u.id
      WHERE transaction_date >= $1 AND transaction_date <= $2
      GROUP BY DATE(transaction_date), u.id, u.full_name
      ORDER BY date DESC
    `;

    const result = await pool.query(query, [startDate, endDate]);

    const dailyBreakdown: Record<string, { amount: number; transactions: number }> = {};
    const agentTotals: Record<string, { amount: number; transactions: number }> = {};
    let totalAmount = 0;
    let totalTransactions = 0;

    result.rows.forEach(row => {
      const date = row.date.toISOString().split('T')[0];
      const amount = parseFloat(row.amount);
      const transactions = parseInt(row.transactions);

      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = { amount: 0, transactions: 0 };
      }
      dailyBreakdown[date].amount += amount;
      dailyBreakdown[date].transactions += transactions;

      if (row.agent_name) {
        if (!agentTotals[row.agent_name]) {
          agentTotals[row.agent_name] = { amount: 0, transactions: 0 };
        }
        agentTotals[row.agent_name].amount += amount;
        agentTotals[row.agent_name].transactions += transactions;
      }

      totalAmount += amount;
      totalTransactions += transactions;
    });

    return {
      dailyBreakdown: Object.entries(dailyBreakdown).map(([date, data]) => ({
        date,
        amount: data.amount,
        transactions: data.transactions
      })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      totalAmount,
      totalTransactions,
      topSalesAgents: Object.entries(agentTotals)
        .map(([agent_name, data]) => ({
          agent_name,
          amount: data.amount,
          transactions: data.transactions
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10)
    };
  }

  static async getPaymentModeStats(startDate: Date, endDate: Date): Promise<Array<{
    payment_mode: PaymentMode;
    total_amount: number;
    transaction_count: number;
    percentage: number;
  }>> {
    const query = `
      SELECT 
        payment_mode,
        SUM(amount) as total_amount,
        COUNT(*) as transaction_count,
        ROUND((SUM(amount) * 100.0) / (SELECT SUM(amount) FROM transactions WHERE transaction_date >= $1 AND transaction_date <= $2), 2) as percentage
      FROM transactions
      WHERE transaction_date >= $1 AND transaction_date <= $2
      GROUP BY payment_mode
      ORDER BY total_amount DESC
    `;

    const result = await pool.query(query, [startDate, endDate]);
    
    return result.rows.map(row => ({
      payment_mode: row.payment_mode,
      total_amount: parseFloat(row.total_amount),
      transaction_count: parseInt(row.transaction_count),
      percentage: parseFloat(row.percentage)
    }));
  }
}

export class ReportService {
  /**
   * Normalizes a daily report row from the database, ensuring all numeric fields are never null
   * @param row Raw database row
   * @returns Normalized DailyReport object with guaranteed numeric values
   */
  private static normalizeDailyReport(row: any): DailyReport {
    return {
      date: row.date || '',
      total_cash: row.total_cash ?? 0,
      total_gcash: row.total_gcash ?? 0,
      total_maya: row.total_maya ?? 0,
      total_credit_card: row.total_credit_card ?? 0,
      total_bank_transfer: row.total_bank_transfer ?? 0,
      petty_cash_start: row.petty_cash_start ?? 0,
      petty_cash_end: row.petty_cash_end ?? 0,
      expenses: row.expenses ?? [],
      funds: row.funds ?? [],
      cash_turnover: row.cash_turnover ?? 0,
      transaction_count: row.transaction_count ?? 0
    };
  }

  static async generateDailyReport(date: Date, expenses: Expense[] = [], funds: Fund[] = [], pettyCashStart: number = 0, pettyCashEnd: number = 0): Promise<DailyReport> {
    const summary = await TransactionService.getDailySummary(date);

    // Use enhanced financial calculations for precision
    const totalFundsAmount = FinancialCalculations.sum(
      funds.map(fund => fund.amount)
    );
    const totalExpensesAmount = FinancialCalculations.sum(
      expenses.map(exp => exp.amount)
    );

    // Enhanced Cash Turnover calculation with decimal precision
    const paymentTotals = {
      [PaymentMode.CASH]: summary.paymentModeBreakdown[PaymentMode.CASH].amount,
      [PaymentMode.GCASH]: summary.paymentModeBreakdown[PaymentMode.GCASH].amount,
      [PaymentMode.MAYA]: summary.paymentModeBreakdown[PaymentMode.MAYA].amount,
      [PaymentMode.CREDIT_CARD]: summary.paymentModeBreakdown[PaymentMode.CREDIT_CARD].amount,
      [PaymentMode.BANK_TRANSFER]: summary.paymentModeBreakdown[PaymentMode.BANK_TRANSFER].amount
    };
    
    const cashTurnover = FinancialCalculations.calculateCashTurnover(
      pettyCashStart,
      paymentTotals,
      totalFundsAmount,
      totalExpensesAmount,
      pettyCashEnd
    );

    return {
      date: date.toISOString().split('T')[0],
      total_cash: summary.paymentModeBreakdown[PaymentMode.CASH].amount,
      total_gcash: summary.paymentModeBreakdown[PaymentMode.GCASH].amount,
      total_maya: summary.paymentModeBreakdown[PaymentMode.MAYA].amount,
      total_credit_card: summary.paymentModeBreakdown[PaymentMode.CREDIT_CARD].amount,
      total_bank_transfer: summary.paymentModeBreakdown[PaymentMode.BANK_TRANSFER].amount,
      petty_cash_start: pettyCashStart,
      petty_cash_end: pettyCashEnd,
      expenses,
      funds,
      cash_turnover: cashTurnover,
      transaction_count: summary.totalTransactions
    };
  }

  static async saveDailyReport(report: DailyReport): Promise<void> {
    const query = `
      INSERT INTO daily_reports (
        date, total_cash, total_gcash, total_maya, total_credit_card, 
        total_bank_transfer, petty_cash_start, petty_cash_end, 
        expenses, funds, cash_turnover, transaction_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (date) 
      DO UPDATE SET
        total_cash = EXCLUDED.total_cash,
        total_gcash = EXCLUDED.total_gcash,
        total_maya = EXCLUDED.total_maya,
        total_credit_card = EXCLUDED.total_credit_card,
        total_bank_transfer = EXCLUDED.total_bank_transfer,
        petty_cash_start = EXCLUDED.petty_cash_start,
        petty_cash_end = EXCLUDED.petty_cash_end,
        expenses = EXCLUDED.expenses,
        funds = EXCLUDED.funds,
        cash_turnover = EXCLUDED.cash_turnover,
        transaction_count = EXCLUDED.transaction_count,
        updated_at = CURRENT_TIMESTAMP
    `;

    const values = [
      report.date,
      report.total_cash,
      report.total_gcash,
      report.total_maya,
      report.total_credit_card,
      report.total_bank_transfer,
      report.petty_cash_start,
      report.petty_cash_end,
      JSON.stringify(report.expenses),
      JSON.stringify(report.funds),
      report.cash_turnover,
      report.transaction_count
    ];

    await pool.query(query, values);
  }

  static async getDailyReport(date: string): Promise<DailyReport | null> {
    const query = `
      SELECT * FROM daily_reports
      WHERE date = $1
    `;

    const result = await pool.query(query, [date]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return this.normalizeDailyReport(row);
  }

  /**
   * Delete a daily report by date
   * @param date Date string in YYYY-MM-DD format
   * @returns Promise<boolean> - true if deleted, false if not found
   */
  static async deleteDailyReport(date: string): Promise<boolean> {
    try {
      const query = `DELETE FROM daily_reports WHERE date = $1`;
      const result = await pool.query(query, [date]);
      
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting daily report:', error);
      throw error;
    }
  }

  /**
   * List all daily reports with optional date range filtering
   */
  static async listDailyReports(options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ reports: DailyReport[], total: number }> {
    const { startDate, endDate, limit = 50, offset = 0 } = options;
    
    let query = `SELECT * FROM daily_reports WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as total FROM daily_reports WHERE 1=1`;
    
    const values: string[] = [];
    let paramCount = 1;
    
    if (startDate) {
      const dateCondition = ` AND date >= $${paramCount}`;
      query += dateCondition;
      countQuery += dateCondition;
      values.push(startDate);
      paramCount++;
    }
    
    if (endDate) {
      const dateCondition = ` AND date <= $${paramCount}`;
      query += dateCondition;
      countQuery += dateCondition;
      values.push(endDate);
      paramCount++;
    }
    
    query += ` ORDER BY date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    const queryValues = [...values, limit.toString(), offset.toString()];
    
    try {
      const [reportsResult, countResult] = await Promise.all([
        pool.query(query, queryValues),
        pool.query(countQuery, values)
      ]);
      
      const reports = reportsResult.rows.map(row => this.normalizeDailyReport(row));
      const total = parseInt(countResult.rows[0].total);
      
      return { reports, total };
    } catch (error) {
      console.error('Error listing daily reports:', error);
      throw error;
    }
  }
}
