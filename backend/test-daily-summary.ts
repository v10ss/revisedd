import { TransactionService } from './src/services/transaction';
import { pool } from './src/config/database';

async function testDailySummaryAPI() {
  try {
    console.log('=== TESTING DAILY SUMMARY API ===\n');
    
    // Test TransactionService.getDailySummary directly
    console.log('1. Testing TransactionService.getDailySummary directly...');
    
    const today = new Date();
    console.log('Testing for date:', today.toDateString());
    
    const summary = await TransactionService.getDailySummary(today);
    
    console.log('\nDaily Summary Result:');
    console.log('Total Amount:', summary.totalAmount);
    console.log('Total Transactions:', summary.totalTransactions);
    console.log('Payment Mode Breakdown:');
    
    Object.entries(summary.paymentModeBreakdown).forEach(([mode, data]) => {
      console.log(`  ${mode}: Amount: ${data.amount}, Count: ${data.count}`);
    });
    
    console.log('\nSales Agent Breakdown:');
    summary.salesAgentBreakdown.forEach(agent => {
      console.log(`  ${agent.agent_name}: Amount: ${agent.amount}, Count: ${agent.count}`);
    });
    
    // Test with a date that has transactions
    console.log('\n2. Testing with a past date that has transactions...');
    
    const pastDate = new Date('2025-08-05'); // Use a date from our database query
    console.log('Testing for date:', pastDate.toDateString());
    
    const pastSummary = await TransactionService.getDailySummary(pastDate);
    
    console.log('\nPast Date Summary Result:');
    console.log('Total Amount:', pastSummary.totalAmount);
    console.log('Total Transactions:', pastSummary.totalTransactions);
    console.log('Payment Mode Breakdown:');
    
    Object.entries(pastSummary.paymentModeBreakdown).forEach(([mode, data]) => {
      console.log(`  ${mode}: Amount: ${data.amount}, Count: ${data.count}`);
    });
    
    console.log('\n=== TEST COMPLETE ===');
    
  } catch (error) {
    console.error('Test error:', error);
  } finally {
    await pool.end();
  }
}

testDailySummaryAPI();
