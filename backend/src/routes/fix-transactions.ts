import express, { Router, Response } from 'express';
import { pool } from '../config/database';
import { authenticateToken, requireAdmin, logActivity } from '../middleware/auth';
import { AuthRequest } from '../types';

const router: express.Router = Router();

// Fix zero transaction amounts - Admin only
router.post('/fix-zero-amounts', authenticateToken, requireAdmin, logActivity('fix_zero_amounts'), async (req: AuthRequest, res: Response): Promise<void> => {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Zero Amount Fix via API...');
    
    // 1. Check current state
    const analysisQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as zero_amount_transactions,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as avg_transaction_amount
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id;
    `;
    
    const analysisResult = await client.query(analysisQuery);
    const stats = analysisResult.rows[0];
    
    console.log('📈 Current State:', stats);
    
    if (parseInt(stats.zero_amount_transactions) === 0) {
      res.json({
        success: true,
        message: 'No zero-amount transactions found',
        stats: {
          totalTransactions: parseInt(stats.total_transactions),
          zeroAmountTransactions: 0,
          averageAmount: parseFloat(stats.avg_transaction_amount || 0)
        }
      });
      return;
    }

    // 2. Get sample before fixing
    const sampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount as current_amount,
        COALESCE((c.payment_info->>'amount')::numeric, 0) as customer_amount,
        c.name as customer_name
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      WHERE t.amount = 0 OR t.amount IS NULL
      LIMIT 5;
    `;
    
    const sampleResult = await client.query(sampleQuery);

    // 3. Begin transaction for atomic updates
    await client.query('BEGIN');

    // 4. Fix transaction amounts
    const fixQuery = `
      UPDATE transactions 
      SET 
        amount = COALESCE((c.payment_info->>'amount')::numeric, 0),
        balance_amount = COALESCE((c.payment_info->>'amount')::numeric, 0) - COALESCE(paid_amount, 0),
        updated_at = CURRENT_TIMESTAMP
      FROM customers c
      WHERE transactions.customer_id = c.id
        AND (transactions.amount = 0 OR transactions.amount IS NULL)
        AND c.payment_info->>'amount' IS NOT NULL
        AND (c.payment_info->>'amount')::numeric > 0
      RETURNING 
        transactions.id,
        transactions.or_number,
        transactions.amount as new_amount,
        transactions.balance_amount as new_balance;
    `;

    const fixResult = await client.query(fixQuery);

    // 5. Update payment status for consistency
    const statusQuery = `
      UPDATE transactions
      SET payment_status = CASE
        WHEN COALESCE(paid_amount, 0) = 0 THEN 'unpaid'
        WHEN COALESCE(paid_amount, 0) >= amount THEN 'paid'
        ELSE 'partial'
      END,
      updated_at = CURRENT_TIMESTAMP
      WHERE payment_status IS NULL 
         OR payment_status NOT IN ('paid', 'partial', 'unpaid');
    `;

    const statusResult = await client.query(statusQuery);

    // 6. Final verification
    const verifyQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as remaining_zero_amounts,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as new_avg_amount
      FROM transactions t;
    `;
    
    const verifyResult = await client.query(verifyQuery);
    const newStats = verifyResult.rows[0];

    await client.query('COMMIT');

    console.log('✅ Zero amount fix completed via API');

    res.json({
      success: true,
      message: 'Transaction amounts fixed successfully',
      beforeFix: {
        totalTransactions: parseInt(stats.total_transactions),
        zeroAmountTransactions: parseInt(stats.zero_amount_transactions),
        averageAmount: parseFloat(stats.avg_transaction_amount || 0)
      },
      afterFix: {
        totalTransactions: parseInt(newStats.total_transactions),
        remainingZeroAmounts: parseInt(newStats.remaining_zero_amounts),
        averageAmount: parseFloat(newStats.new_avg_amount || 0)
      },
      fixedCount: fixResult.rowCount,
      statusUpdateCount: statusResult.rowCount,
      sampleBeforeFix: sampleResult.rows,
      sampleAfterFix: fixResult.rows.slice(0, 5)
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Fix failed via API:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fix transaction amounts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    client.release();
  }
});

// Check transaction amounts status - Admin only
router.get('/check-amounts', authenticateToken, requireAdmin, logActivity('check_transaction_amounts'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const analysisQuery = `
      SELECT 
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN t.amount = 0 OR t.amount IS NULL THEN 1 END) as zero_amount_transactions,
        COUNT(CASE WHEN t.amount > 0 THEN 1 END) as valid_amount_transactions,
        AVG(CASE WHEN t.amount > 0 THEN t.amount END) as avg_transaction_amount,
        MIN(CASE WHEN t.amount > 0 THEN t.amount END) as min_amount,
        MAX(t.amount) as max_amount
      FROM transactions t 
      INNER JOIN customers c ON t.customer_id = c.id;
    `;
    
    const analysisResult = await pool.query(analysisQuery);
    const stats = analysisResult.rows[0];

    // Get sample of zero amount transactions
    const zeroSampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount as current_amount,
        COALESCE((c.payment_info->>'amount')::numeric, 0) as customer_amount,
        c.name as customer_name
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      WHERE t.amount = 0 OR t.amount IS NULL
      LIMIT 5;
    `;
    
    const zeroSampleResult = await pool.query(zeroSampleQuery);

    // Get sample of valid transactions
    const validSampleQuery = `
      SELECT 
        t.id,
        t.or_number,
        t.amount,
        c.name as customer_name
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      WHERE t.amount > 0
      ORDER BY t.created_at DESC
      LIMIT 5;
    `;
    
    const validSampleResult = await pool.query(validSampleQuery);

    res.json({
      success: true,
      statistics: {
        totalTransactions: parseInt(stats.total_transactions),
        zeroAmountTransactions: parseInt(stats.zero_amount_transactions),
        validAmountTransactions: parseInt(stats.valid_amount_transactions),
        averageAmount: parseFloat(stats.avg_transaction_amount || 0),
        minAmount: parseFloat(stats.min_amount || 0),
        maxAmount: parseFloat(stats.max_amount || 0)
      },
      needsFix: parseInt(stats.zero_amount_transactions) > 0,
      samples: {
        zeroAmountTransactions: zeroSampleResult.rows,
        validTransactions: validSampleResult.rows
      }
    });
    
  } catch (error) {
    console.error('Error checking transaction amounts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check transaction amounts'
    });
  }
});

export default router;
