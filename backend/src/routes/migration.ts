import { Router, Response } from 'express';
import { Pool } from 'pg';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

/**
 * POST /api/migration/fix-transaction-amounts
 * Execute the transaction amount migration via API
 * Only accessible by admin users
 */
router.post('/fix-transaction-amounts', authenticateToken, async (req: AuthRequest, res: Response) => {
  // Verify admin access
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required for migration operations'
    });
  }

  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Transaction Amount Migration via API...');
    
  const migrationResults: {
    beforeAnalysis: any;
    updateResults: any;
    afterAnalysis: any;
    sampleTransactions: any[];
    success: boolean;
    message: string;
  } = {
    beforeAnalysis: null,
    updateResults: null,
    afterAnalysis: null,
    sampleTransactions: [],
    success: false,
    message: ''
  };

    // 1. Analyze current state
    const analysisQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as zero_amount_transactions,
        COUNT(CASE WHEN t.balance_amount = 0 OR t.balance_amount IS NULL THEN 1 END) as zero_balance_transactions,
        COUNT(CASE WHEN c.payment_info->>'amount' IS NULL THEN 1 END) as null_customer_amounts,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as avg_transaction_amount
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id;
    `;
    
    const analysisResult = await client.query(analysisQuery);
    migrationResults.beforeAnalysis = analysisResult.rows[0];
    
    console.log('📈 Current State Analysis:', migrationResults.beforeAnalysis);

    if (migrationResults.beforeAnalysis.zero_amount_transactions === '0' && 
        migrationResults.beforeAnalysis.zero_balance_transactions === '0') {
      migrationResults.success = true;
      migrationResults.message = 'No transactions need fixing. Migration already complete.';
      
      return res.json({
        success: true,
        message: migrationResults.message,
        results: migrationResults
      });
    }

    console.log('🔧 Applying fixes...');

    // 2. Start transaction for atomic updates
    await client.query('BEGIN');

    // 3. Update transactions with zero amounts using customer payment_info
    const updateQuery = `
      UPDATE transactions 
      SET 
        amount = (
          SELECT (c.payment_info->>'amount')::numeric 
          FROM customers c 
          WHERE c.id = transactions.customer_id
        ),
        balance_amount = CASE 
          WHEN COALESCE(paid_amount, 0) = 0 THEN 
            (SELECT (c.payment_info->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id)
          ELSE 
            (SELECT (c.payment_info->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id) - COALESCE(paid_amount, 0)
        END,
        updated_at = CURRENT_TIMESTAMP
      FROM customers c
      WHERE transactions.customer_id = c.id
        AND (transactions.amount = 0 OR transactions.amount IS NULL OR transactions.balance_amount = 0 OR transactions.balance_amount IS NULL)
        AND c.payment_info->>'amount' IS NOT NULL
        AND (c.payment_info->>'amount')::numeric > 0
      RETURNING 
        transactions.id,
        transactions.or_number,
        transactions.amount,
        transactions.balance_amount;
    `;

    const updateResult = await client.query(updateQuery);
    migrationResults.updateResults = {
      rowCount: updateResult.rowCount,
      updatedRecords: updateResult.rows
    };
    
    console.log(`✅ Updated ${updateResult.rowCount} transactions with correct amounts`);

    // 4. Update payment status for consistency
    const statusUpdateQuery = `
      UPDATE transactions
      SET payment_status = CASE
        WHEN COALESCE(paid_amount, 0) = 0 THEN 'unpaid'
        WHEN COALESCE(paid_amount, 0) >= amount THEN 'paid'
        ELSE 'partial'
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE payment_status IS NULL 
         OR payment_status NOT IN ('paid', 'partial', 'unpaid')
      RETURNING id, payment_status;
    `;

    const statusResult = await client.query(statusUpdateQuery);
    console.log(`✅ Updated payment status for ${statusResult.rowCount} transactions`);

    // 5. Get sample of updated transactions
    const sampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount,
        t.balance_amount,
        t.paid_amount,
        t.payment_status,
        (c.payment_info->>'amount')::numeric as customer_payment_amount,
        c.name as customer_name
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id 
      WHERE t.updated_at >= CURRENT_TIMESTAMP - INTERVAL '1 minute'
        AND t.amount > 0
      ORDER BY t.updated_at DESC 
      LIMIT 5;
    `;
    
    const sampleResult = await client.query(sampleQuery);
    migrationResults.sampleTransactions = sampleResult.rows;

    // 6. Final verification
    const verificationQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as remaining_zero_amounts,
        COUNT(CASE WHEN t.balance_amount = 0 OR t.balance_amount IS NULL THEN 1 END) as remaining_zero_balances,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as new_avg_amount
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id;
    `;
    
    const verificationResult = await client.query(verificationQuery);
    migrationResults.afterAnalysis = verificationResult.rows[0];

    console.log('📊 Post-Migration Analysis:', migrationResults.afterAnalysis);

    await client.query('COMMIT');
    
    migrationResults.success = true;
    migrationResults.message = `Migration completed successfully! Updated ${updateResult.rowCount} transactions.`;
    
    console.log('🎉 Migration completed successfully via API!');

    res.json({
      success: true,
      message: migrationResults.message,
      results: migrationResults
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    client.release();
  }
  return; // Explicit return to fix TypeScript compilation
});

/**
 * GET /api/migration/status
 * Check current transaction status without making changes
 */
router.get('/status', authenticateToken, async (req: AuthRequest, res: Response) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }

  const client = await pool.connect();
  
  try {
    const statusQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN amount = 0 OR amount IS NULL THEN 1 END) as zero_amount_transactions,
        COUNT(CASE WHEN amount > 0 THEN 1 END) as transactions_with_amounts,
        AVG(CASE WHEN amount > 0 THEN amount END) as avg_transaction_amount,
        MIN(CASE WHEN amount > 0 THEN amount END) as min_amount,
        MAX(CASE WHEN amount > 0 THEN amount END) as max_amount
      FROM transactions;
    `;
    
    const result = await client.query(statusQuery);
    const stats = result.rows[0];

    // Sample transactions
    const sampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount,
        c.name as customer_name
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id 
      ORDER BY t.created_at DESC 
      LIMIT 5;
    `;
    
    const sampleResult = await client.query(sampleQuery);

    res.json({
      success: true,
      status: {
        statistics: stats,
        sampleTransactions: sampleResult.rows,
        needsMigration: parseInt(stats.zero_amount_transactions) > 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check status',
      details: error instanceof Error ? error.message : String(error)
    });
  } finally {
    client.release();
  }
  return; // Explicit return to fix TypeScript compilation
});

export default router;
