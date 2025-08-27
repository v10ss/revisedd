import { CustomerService } from './src/services/customer';
import { TransactionService } from './src/services/transaction';
import { pool } from './src/config/database';
import { PaymentMode } from './src/types';

async function createTestTransaction() {
  try {
    console.log('=== CREATING TEST TRANSACTION FOR TODAY ===\n');
    
    // Create a test customer first
    console.log('1. Creating test customer...');
    
    const customerData = {
      name: 'Test Customer Today',
      contact_number: '09123456789',
      email: 'testtoday@example.com',
      payment_info: {
        mode: 'gcash' as PaymentMode,
        amount: 1500
      },
      sales_agent_id: 1
    };
    
    const customer = await CustomerService.create(customerData);
    console.log('Customer created:', {
      id: customer.id,
      name: customer.name,
      payment_info: customer.payment_info
    });
    
    // The createInitialTransaction should have been called automatically
    console.log('\n2. Checking if initial transaction was created...');
    
    // Get transactions for this customer
    const transactionQuery = `
      SELECT id, customer_id, or_number, amount, payment_mode, created_at
      FROM transactions 
      WHERE customer_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(transactionQuery, [customer.id]);
    
    if (result.rows.length > 0) {
      const transaction = result.rows[0];
      console.log('Initial transaction found:', {
        id: transaction.id,
        customer_id: transaction.customer_id,
        or_number: transaction.or_number,
        amount: transaction.amount,
        payment_mode: transaction.payment_mode,
        created_at: transaction.created_at
      });
    } else {
      console.log('No transaction found for customer');
    }
    
    console.log('\n3. Getting today\'s daily summary...');
    
    const today = new Date();
    const summary = await TransactionService.getDailySummary(today);
    
    console.log('Today\'s Summary:');
    console.log('Total Amount:', summary.totalAmount);
    console.log('Total Transactions:', summary.totalTransactions);
    console.log('Payment Mode Breakdown:');
    
    Object.entries(summary.paymentModeBreakdown).forEach(([mode, data]) => {
      if (data.count > 0) {
        console.log(`  ${mode}: Amount: ${data.amount}, Count: ${data.count}`);
      }
    });
    
    console.log('\n=== TEST COMPLETE ===');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

createTestTransaction();
