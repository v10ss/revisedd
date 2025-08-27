import { pool } from '../config/database';
import { Customer, DistributionType, PaymentMode, QueueStatus, PriorityFlags, Prescription, PaymentInfo, EstimatedTime, PaymentStatus } from '../types';
import { QueueAnalyticsService } from './QueueAnalyticsService';
import { WebSocketService } from './websocket';

export class CustomerService {
  // Helper to sanitize numeric amounts coming from various string formats (e.g., "₱1,500")
  private static toNumber(value: any): number {
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[₱$,\s]/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : n;
    }
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  // Normalize various payment mode spellings/variants to the PaymentMode enum
  private static normalizePaymentMode(mode: any): PaymentMode {
    const s = String(mode || '').toLowerCase().trim();
    switch (s) {
      case 'gcash':
        return PaymentMode.GCASH;
      case 'maya':
        return PaymentMode.MAYA;
      case 'bank_transfer':
      case 'banktransfer':
      case 'bank transfer':
        return PaymentMode.BANK_TRANSFER;
      case 'credit_card':
      case 'creditcard':
      case 'credit card':
        return PaymentMode.CREDIT_CARD;
      case 'cash':
        return PaymentMode.CASH;
      default:
        return PaymentMode.CASH;
    }
  }
  static async create(customerData: {
    or_number?: string;
    name: string;
    contact_number: string;
    email: string;
    age: number;
    address: string;
    occupation?: string;
    distribution_info: DistributionType;
    sales_agent_id: number;
    doctor_assigned?: string;
    prescription: Prescription;
    grade_type: string;
    lens_type: string;
    frame_code?: string;
    estimated_time: EstimatedTime;
    payment_info: PaymentInfo;
    remarks?: string;
    priority_flags: PriorityFlags;
    create_initial_transaction?: boolean;
  }): Promise<Customer> {
    console.log('🔍 [CUSTOMER_CREATE_DEBUG] Full customerData received:', JSON.stringify(customerData, null, 2));
    console.log('🔍 [PAYMENT_INFO_DEBUG] Payment info specifically:', JSON.stringify(customerData.payment_info, null, 2));
    const {
      or_number: provided_or_number,
      name,
      contact_number,
      email,
      age,
      address,
      occupation,
      distribution_info,
      sales_agent_id,
      doctor_assigned,
      prescription,
      grade_type,
      lens_type,
      frame_code,
      estimated_time,
      payment_info,
      remarks,
      priority_flags
    } = customerData;

    // Generate token number
    const tokenNumber = await this.generateTokenNumber();
    
    // Generate OR number if not provided
    const or_number = provided_or_number || await this.generateORNumber();

    const query = `
      INSERT INTO customers (
        or_number, name, contact_number, email, age, address, occupation,
        distribution_info, sales_agent_id, doctor_assigned, prescription, grade_type, lens_type,
        frame_code, estimated_time, payment_info, remarks, priority_flags,
        queue_status, token_number
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const values = [
      or_number,
      name,
      contact_number,
      email,
      age,
      address,
      occupation,
      distribution_info,
      sales_agent_id,
      doctor_assigned,
      JSON.stringify(prescription),
      grade_type,
      lens_type,
      frame_code,
      JSON.stringify(estimated_time),
      JSON.stringify(payment_info),
      remarks,
      JSON.stringify(priority_flags),
      QueueStatus.WAITING,
      tokenNumber
    ];

    const result = await pool.query(query, values);
    const customer = this.formatCustomer(result.rows[0]);
    
    // Always create initial unpaid transaction to ensure customer appears in transaction lists
    // This preserves the customer's selected payment mode in the transaction record
    try {
      console.log('🔍 [TRANSACTION_CREATE_DEBUG] About to create initial transaction with payment_info:', JSON.stringify(payment_info, null, 2));
      await this.createInitialTransaction(customer.id, or_number, sales_agent_id);
      console.log(`✅ [TRANSACTION_CREATED] Initial transaction created for customer ${customer.name} with payment mode: ${payment_info.mode} and amount: ${payment_info.amount}`);
    } catch (transactionError) {
      console.error('❌ [TRANSACTION_ERROR] Failed to create initial transaction:', transactionError);
      // Don't fail the customer creation if transaction fails
    }
    
    // Record analytics event for queue join
    try {
      const isPriority = priority_flags.senior_citizen || priority_flags.pwd || priority_flags.pregnant;
      await QueueAnalyticsService.recordQueueEvent({
        customerId: customer.id,
        eventType: 'joined',
        isPriority
      });
    } catch (analyticsError) {
      console.error('Failed to record analytics event for customer join:', analyticsError);
      // Don't fail the operation if analytics fails
    }
    
    // Emit customer_created WebSocket event
    try {
      WebSocketService.emitCustomerCreated({
        customer,
        created_by: sales_agent_id,
        has_initial_transaction: true, // Always true since we always create initial transactions
        timestamp: new Date()
      });
    } catch (websocketError) {
      console.error('Failed to emit customer_created event:', websocketError);
      // Don't fail the operation if WebSocket fails
    }
    
    // ISOLATED: Trigger Facebook-style customer registration notification to cashiers
    try {
      // Get sales agent info for notification
      const salesAgentQuery = `SELECT full_name, role FROM users WHERE id = $1`;
      const salesAgentResult = await pool.query(salesAgentQuery, [sales_agent_id]);
      const salesAgent = salesAgentResult.rows[0];
      
      if (salesAgent) {
        // Import the isolated notification trigger
        const { triggerCustomerRegistrationNotification } = await import('../routes/customerNotifications');
        
        // Trigger isolated Facebook-style notification
        await triggerCustomerRegistrationNotification({
          customer: {
            id: customer.id,
            name: customer.name,
            or_number: customer.or_number,
            token_number: customer.token_number,
            contact_number: customer.contact_number,
            priority_flags: customer.priority_flags,
            payment_info: customer.payment_info
          },
          created_by: {
            id: sales_agent_id,
            name: salesAgent.full_name,
            role: salesAgent.role
          }
        });
        
        console.log(`[CUSTOMER_NOTIFICATION_ISOLATED] Triggered Facebook-style notification for customer ${customer.name}`);
      }
      
    } catch (notificationError) {
      console.error('Failed to trigger isolated customer notification:', notificationError);
      // Don't fail the operation if notification fails
    }
    
    return customer;
  }

  static async findById(id: number): Promise<Customer | null> {
    const query = `
      SELECT c.*, u.full_name as sales_agent_name
      FROM customers c
      LEFT JOIN users u ON c.sales_agent_id = u.id
      WHERE c.id = $1
    `;

    const result = await pool.query(query, [id]);
    return result.rows[0] ? this.formatCustomer(result.rows[0]) : null;
  }

  static async findByOrNumber(orNumber: string): Promise<Customer | null> {
    const query = `
      SELECT c.*, u.full_name as sales_agent_name
      FROM customers c
      LEFT JOIN users u ON c.sales_agent_id = u.id
      WHERE c.or_number = $1
    `;

    const result = await pool.query(query, [orNumber]);
    return result.rows[0] ? this.formatCustomer(result.rows[0]) : null;
  }

  static async list(filters: {
    status?: QueueStatus;
    salesAgentId?: number;
    startDate?: Date;
    endDate?: Date;
    searchTerm?: string;
  } = {}, limit: number = 20, offset: number = 0, sortBy: string = 'created_at', sortOrder: 'asc' | 'desc' = 'desc'): Promise<{ customers: Customer[], total: number }> {
    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ['created_at', 'updated_at', 'name', 'or_number', 'age', 'queue_status', 'token_number'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    
    let query = `
      SELECT c.*, u.full_name as sales_agent_name
      FROM customers c
      LEFT JOIN users u ON c.sales_agent_id = u.id
      WHERE 1=1
    `;
    
    let countQuery = `
      SELECT COUNT(*) as total
      FROM customers c
      WHERE 1=1
    `;

    const values: (QueueStatus | number | Date | string)[] = [];
    let paramCount = 1;

    if (filters.status) {
      const statusCondition = ` AND c.queue_status = $${paramCount}`;
      query += statusCondition;
      countQuery += statusCondition;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.salesAgentId) {
      const agentCondition = ` AND c.sales_agent_id = $${paramCount}`;
      query += agentCondition;
      countQuery += agentCondition;
      values.push(filters.salesAgentId);
      paramCount++;
    }

    if (filters.startDate) {
      const startDateCondition = ` AND c.created_at >= $${paramCount}`;
      query += startDateCondition;
      countQuery += startDateCondition;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      const endDateCondition = ` AND c.created_at <= $${paramCount}`;
      query += endDateCondition;
      countQuery += endDateCondition;
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.searchTerm) {
      const searchCondition = ` AND (c.name LIKE $${paramCount} OR c.or_number LIKE $${paramCount} OR c.contact_number LIKE $${paramCount})`;
      query += searchCondition;
      countQuery += searchCondition;
      values.push(`%${filters.searchTerm}%`);
      paramCount++;
    }

    query += ` ORDER BY c.${validSortBy} ${sortOrder.toUpperCase()} LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const [customersResult, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, paramCount - 1))
    ]);

    return {
      customers: customersResult.rows.map((row: any) => this.formatCustomer(row)),
      total: parseInt(countResult.rows[0].total)
    };
  }

  static async countRegisteredToday(): Promise<number> {
    const query = `
      SELECT COUNT(*)::int AS count
      FROM customers
      WHERE created_at::date = CURRENT_DATE
    `;

    const result = await pool.query(query);
    return result.rows[0].count || 0;
  }

  static async update(id: number, updates: Partial<Customer>): Promise<Customer> {
    // Merge payment_info to avoid losing fields on partial updates and normalize values
    let mergedUpdates: any = { ...updates };
    let shouldSyncPaymentInfo = false;

    if (updates && typeof (updates as any).payment_info === 'object' && (updates as any).payment_info !== null) {
      const existing = await this.findById(id);
      const existingPI: any = existing?.payment_info || {};
      const incomingPI: any = (updates as any).payment_info || {};

      const mergedPI: any = {
        ...existingPI,
        ...incomingPI,
      };

      if ('amount' in mergedPI) {
        mergedPI.amount = this.toNumber(mergedPI.amount);
      }
      if ('mode' in mergedPI) {
        mergedPI.mode = this.normalizePaymentMode(mergedPI.mode);
      }

      mergedUpdates.payment_info = mergedPI;
      shouldSyncPaymentInfo = true;
    }

    const setClause: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(mergedUpdates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        setClause.push(`${key} = $${paramCount}`);
        if (typeof value === 'object' && value !== null) {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
        paramCount++;
      }
    });

    if (setClause.length === 0) {
      throw new Error('No valid updates provided');
    }

    values.push(id);
    const query = `
      UPDATE customers 
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Customer not found');
    }

    const updatedCustomer = this.formatCustomer(result.rows[0]);

    // Best-effort sync to transactions if payment_info changed
    if (shouldSyncPaymentInfo) {
      try {
        await this.syncPaymentInfoToTransactions(id);
      } catch (err) {
        console.error('Failed to sync payment_info to transactions:', err);
      }
    }

    return updatedCustomer;
  }

  static async updateStatus(id: number, status: QueueStatus): Promise<Customer> {
    const query = `
      UPDATE customers 
      SET queue_status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const result = await pool.query(query, [status, id]);
    
    if (result.rows.length === 0) {
      throw new Error('Customer not found');
    }

    return this.formatCustomer(result.rows[0]);
  }

  static async delete(id: number): Promise<void> {
    const query = `DELETE FROM customers WHERE id = $1`;
    const result = await pool.query(query, [id]);
    
    if (result.rowCount === 0) {
      throw new Error('Customer not found');
    }
  }

  static async calculatePriorityScore(priorityFlags: PriorityFlags): Promise<number> {
    let score = 0;
    
    if (priorityFlags.senior_citizen) score += 1000;
    if (priorityFlags.pregnant) score += 800;
    if (priorityFlags.pwd) score += 900;
    
    return score;
  }

  // Synchronize the customer's updated payment_info to their most recent UNPAID/PARTIAL transaction
  private static async syncPaymentInfoToTransactions(customerId: number): Promise<void> {
    // Find the most recent non-PAID transaction
    const txRes = await pool.query(
      `SELECT id, paid_amount
       FROM transactions
       WHERE customer_id = $1 AND payment_status IN ($2, $3)
       ORDER BY transaction_date DESC
       LIMIT 1`,
      [customerId, PaymentStatus.UNPAID, PaymentStatus.PARTIAL]
    );

    if (txRes.rows.length === 0) return; // Nothing to sync

    const tx = txRes.rows[0];

    const cRes = await pool.query('SELECT payment_info FROM customers WHERE id = $1', [customerId]);
    if (cRes.rows.length === 0) return;

    const pi = cRes.rows[0].payment_info || {};
    const newAmount = this.toNumber(pi.amount);
    const newMode = this.normalizePaymentMode(pi.mode);
    const paid = Number(tx.paid_amount) || 0;
    const newBalance = Math.max(newAmount - paid, 0);
    const newStatus = newBalance === 0 ? PaymentStatus.PAID : (paid > 0 ? PaymentStatus.PARTIAL : PaymentStatus.UNPAID);

    await pool.query(
      `UPDATE transactions
       SET amount = $1,
           payment_mode = $2,
           balance_amount = $3,
           payment_status = $4
       WHERE id = $5`,
      [newAmount, newMode, newBalance, newStatus, tx.id]
    );
  }

  /**
   * Creates an initial unpaid transaction with the customer's payment amount
   * This ensures the customer appears in the sales page transaction list
   */
  private static async createInitialTransaction(customerId: number, orNumber: string, salesAgentId: number): Promise<void> {
    console.log('🔍 [TRANSACTION_DEBUG] Starting createInitialTransaction for customer:', customerId);
    
    // First, get the customer's payment information
    const customerQuery = `SELECT payment_info FROM customers WHERE id = $1`;
    const customerResult = await pool.query(customerQuery, [customerId]);
    
    if (customerResult.rows.length === 0) {
      throw new Error('Customer not found when creating initial transaction');
    }
    
    const paymentInfo = customerResult.rows[0].payment_info || {};
    console.log('🔍 [TRANSACTION_DEBUG] Retrieved payment_info from database:', JSON.stringify(paymentInfo, null, 2));
    
    // Normalize values to ensure they're not null/undefined and in correct formats
    const amount = CustomerService.toNumber(paymentInfo.amount);
    const paymentMode = CustomerService.normalizePaymentMode(paymentInfo.mode);
    
    console.log('🔍 [TRANSACTION_DEBUG] Processed values - amount:', amount, 'paymentMode:', paymentMode);
    console.log('🔍 [TRANSACTION_DEBUG] Type checks - amount type:', typeof amount, 'paymentMode type:', typeof paymentMode);
    
    const query = `
      INSERT INTO transactions (
        customer_id, or_number, amount, payment_mode, 
        sales_agent_id, cashier_id, transaction_date, paid_amount, balance_amount, payment_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)
    `;

    const values = [
      customerId,
      orNumber,
      amount, // use customer's payment amount
      paymentMode, // use customer's payment mode
      salesAgentId,
      null, // no cashier for initial transaction
      0, // paid_amount = 0 (still unpaid)
      amount, // balance_amount = full amount (since nothing paid yet)
      PaymentStatus.UNPAID // status = unpaid
    ];

    await pool.query(query, values);
  }

  private static async generateTokenNumber(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const query = `
      SELECT COUNT(*) as count
      FROM customers
      WHERE created_at >= $1
    `;
    
    const result = await pool.query(query, [today]);
    return parseInt(result.rows[0].count) + 1;
  }
  
  private static async generateORNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2);
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const day = today.getDate().toString().padStart(2, '0');
    
    // Get today's customer count
    const tokenNumber = await this.generateTokenNumber();
    
    // Generate random alphanumeric suffix
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return `OR${year}${month}${day}${tokenNumber.toString().padStart(3, '0')}${suffix}`;
  }

  // Helper function to format token number with zero padding
  static formatTokenNumber(tokenNumber: number): string {
    return tokenNumber.toString().padStart(3, '0');
  }

  private static formatCustomer(row: any): Customer {
    return {
      ...row,
      prescription: row.prescription && typeof row.prescription === 'string' ? JSON.parse(row.prescription) : row.prescription || null,
      payment_info: row.payment_info && typeof row.payment_info === 'string' ? JSON.parse(row.payment_info) : row.payment_info || null,
      priority_flags: row.priority_flags && typeof row.priority_flags === 'string' ? JSON.parse(row.priority_flags) : row.priority_flags || null,
      estimated_time: row.estimated_time && typeof row.estimated_time === 'string' ? JSON.parse(row.estimated_time) : row.estimated_time || null,
    };
  }

  static async getQueueStatistics(): Promise<{
    total: number;
    waiting: number;
    serving: number;
    completed: number;
    cancelled: number;
    averageWaitTime: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN queue_status = 'waiting' THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN queue_status = 'serving' THEN 1 ELSE 0 END) as serving,
        SUM(CASE WHEN queue_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN queue_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        0 as average_wait_time
      FROM customers
      WHERE created_at >= CURRENT_DATE
    `;

    const result = await pool.query(query);
    const stats = result.rows[0];

    return {
      total: parseInt(stats.total) || 0,
      waiting: parseInt(stats.waiting) || 0,
      serving: parseInt(stats.serving) || 0,
      completed: parseInt(stats.completed) || 0,
      cancelled: parseInt(stats.cancelled) || 0,
      averageWaitTime: parseFloat(stats.average_wait_time) || 0
    };
  }

  static async getSalesAgentStatistics(salesAgentId: number): Promise<{
    total: number;
    waiting: number;
    serving: number;
    completed: number;
    cancelled: number;
    todayTotal: number;
    thisWeekTotal: number;
    thisMonthTotal: number;
  }> {
    const todayQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN queue_status = 'waiting' THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN queue_status = 'serving' THEN 1 ELSE 0 END) as serving,
        SUM(CASE WHEN queue_status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN queue_status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM customers
      WHERE sales_agent_id = $1 AND created_at >= CURRENT_DATE
    `;

    const weekQuery = `
      SELECT COUNT(*) as total
      FROM customers
      WHERE sales_agent_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    `;

    const monthQuery = `
      SELECT COUNT(*) as total
      FROM customers
      WHERE sales_agent_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    `;

    const [todayResult, weekResult, monthResult] = await Promise.all([
      pool.query(todayQuery, [salesAgentId]),
      pool.query(weekQuery, [salesAgentId]),
      pool.query(monthQuery, [salesAgentId])
    ]);

    const todayStats = todayResult.rows[0];
    const weekStats = weekResult.rows[0];
    const monthStats = monthResult.rows[0];

    return {
      total: parseInt(todayStats.total) || 0,
      waiting: parseInt(todayStats.waiting) || 0,
      serving: parseInt(todayStats.serving) || 0,
      completed: parseInt(todayStats.completed) || 0,
      cancelled: parseInt(todayStats.cancelled) || 0,
      todayTotal: parseInt(todayStats.total) || 0,
      thisWeekTotal: parseInt(weekStats.total) || 0,
      thisMonthTotal: parseInt(monthStats.total) || 0
    };
  }

  // Helper function to convert EstimatedTime to total minutes
  static estimatedTimeToMinutes(estimatedTime: EstimatedTime): number {
    return (estimatedTime.days * 24 * 60) + (estimatedTime.hours * 60) + estimatedTime.minutes;
  }

  // Helper function to convert minutes to EstimatedTime
  static minutesToEstimatedTime(minutes: number): EstimatedTime {
    const days = Math.floor(minutes / (24 * 60));
    const remainingMinutes = minutes % (24 * 60);
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    
    return {
      days: days,
      hours: hours,
      minutes: mins
    };
  }

  // OLD NOTIFICATION METHOD REMOVED - Now using isolated CustomerNotificationService
}
