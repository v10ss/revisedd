require('dotenv').config();
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/escashop';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkTransactionAmounts() {
  try {
    console.log('🔍 ANALYZING TRANSACTION AMOUNTS AND CUSTOMER PAYMENT INFO');
    console.log('='.repeat(60));
    
    // 1. Check customers with their payment info
    console.log('\n1. CUSTOMERS WITH PAYMENT INFO:');
    const customerQuery = `
      SELECT 
        id, 
        name, 
        or_number,
        token_number,
        payment_info,
        queue_status,
        created_at 
      FROM customers 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    const customerResult = await pool.query(customerQuery);
    customerResult.rows.forEach((customer, index) => {
      const paymentInfo = typeof customer.payment_info === 'string' 
        ? JSON.parse(customer.payment_info) 
        : customer.payment_info;
      
      console.log(`  ${index + 1}. ${customer.name} (ID: ${customer.id})`);
      console.log(`     OR: ${customer.or_number}`);
      console.log(`     Token: ${customer.token_number}`);
      console.log(`     Payment Info: ₱${paymentInfo?.amount || 0} (${paymentInfo?.mode || 'unknown'})`);
      console.log(`     Status: ${customer.queue_status}`);
      console.log();
    });
    
    // 2. Check transactions 
    console.log('\n2. TRANSACTIONS:');
    const transactionQuery = `
      SELECT 
        t.id,
        t.customer_id,
        t.or_number,
        t.amount,
        t.paid_amount,
        t.payment_status,
        t.payment_mode,
        c.name as customer_name,
        c.payment_info as customer_payment_info,
        t.created_at
      FROM transactions t
      INNER JOIN customers c ON t.customer_id = c.id
      ORDER BY t.created_at DESC
    `;
    
    const transactionResult = await pool.query(transactionQuery);
    
    if (transactionResult.rows.length === 0) {
      console.log('   ❌ NO TRANSACTIONS FOUND! This is the problem.');
      console.log('   💡 Customers are being registered without creating transactions.');
    } else {
      transactionResult.rows.forEach((transaction, index) => {
        const customerPaymentInfo = typeof transaction.customer_payment_info === 'string' 
          ? JSON.parse(transaction.customer_payment_info) 
          : transaction.customer_payment_info;
        
        console.log(`  ${index + 1}. Transaction ID: ${transaction.id}`);
        console.log(`     Customer: ${transaction.customer_name} (ID: ${transaction.customer_id})`);
        console.log(`     OR: ${transaction.or_number}`);
        console.log(`     Transaction Amount: ₱${transaction.amount}`);
        console.log(`     Customer Payment Info: ₱${customerPaymentInfo?.amount || 0}`);
        console.log(`     Paid Amount: ₱${transaction.paid_amount}`);
        console.log(`     Status: ${transaction.payment_status}`);
        console.log(`     Mode: ${transaction.payment_mode}`);
        
        // Highlight discrepancies
        if (transaction.amount !== (customerPaymentInfo?.amount || 0)) {
          console.log(`     🚨 MISMATCH: Transaction ₱${transaction.amount} vs Customer ₱${customerPaymentInfo?.amount || 0}`);
        }
        if (transaction.amount === 0) {
          console.log(`     ⚠️  ZERO AMOUNT: This transaction shows ₱0.00`);
        }
        console.log();
      });
    }
    
    // 3. Check if customers were created with create_initial_transaction flag
    console.log('\n3. DIAGNOSIS:');
    
    const customerCount = customerResult.rows.length;
    const transactionCount = transactionResult.rows.length;
    
    console.log(`   👥 Total customers: ${customerCount}`);
    console.log(`   💰 Total transactions: ${transactionCount}`);
    
    if (transactionCount === 0) {
      console.log('\n❌ PROBLEM IDENTIFIED:');
      console.log('   Customers are being registered without creating transactions.');
      console.log('   The frontend Customer Management is NOT setting create_initial_transaction: true');
      console.log('\n💡 SOLUTION NEEDED:');
      console.log('   1. Update Customer Management frontend to set create_initial_transaction: true');
      console.log('   2. OR manually create transactions for existing customers');
      console.log('   3. OR modify transaction list to show customers even without transactions');
    } else if (transactionResult.rows.some(t => t.amount === 0)) {
      console.log('\n⚠️  PARTIAL PROBLEM:');
      console.log('   Some transactions exist but have ₱0.00 amounts');
      console.log('\n💡 CHECK NEEDED:');
      console.log('   Verify if customer payment_info amounts are correctly copied to transactions');
    } else {
      console.log('\n✅ TRANSACTIONS LOOK CORRECT:');
      console.log('   Transaction amounts match customer payment info');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkTransactionAmounts();
