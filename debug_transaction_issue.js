// Debug script to run in browser console to check transaction data
// Run this on the transactions page to analyze the data flow

console.log('🔍 [DEBUG] Starting transaction data analysis...');

// Function to analyze API response
async function debugTransactionAPI() {
    try {
        // Get auth token from localStorage
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.error('❌ No auth token found in localStorage');
            return;
        }
        
        console.log('✅ Auth token found');
        
        // Make direct API call to transactions endpoint
        const apiUrl = `${window.location.origin.replace('localhost:3000', 'localhost:3001')}/api/transactions?page=1&limit=10`;
        console.log('📡 Making API call to:', apiUrl);
        
        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('📈 Response status:', response.status);
        
        if (!response.ok) {
            console.error('❌ API call failed:', response.statusText);
            return;
        }
        
        const data = await response.json();
        console.log('📊 Raw API response structure:', Object.keys(data));
        console.log('📊 Full API response:', data);
        
        if (data.transactions && data.transactions.length > 0) {
            console.log('💰 First transaction analysis:');
            const firstTx = data.transactions[0];
            
            console.table({
                'Transaction ID': firstTx.id,
                'OR Number': firstTx.or_number,
                'Customer Name': firstTx.customer_name,
                'Amount (raw)': firstTx.amount,
                'Amount (type)': typeof firstTx.amount,
                'Amount (isNaN)': isNaN(firstTx.amount),
                'Payment Mode (raw)': firstTx.payment_mode,
                'Payment Mode (type)': typeof firstTx.payment_mode,
                'Payment Status': firstTx.payment_status,
                'Paid Amount': firstTx.paid_amount,
                'Balance Amount': firstTx.balance_amount
            });
            
            console.log('🔍 All transaction fields:', Object.keys(firstTx));
            console.log('🔍 Full first transaction object:', firstTx);
            
            // Test currency formatting
            console.log('💴 Currency formatting test:');
            const amount = firstTx.amount;
            console.log('  - Raw amount:', amount);
            console.log('  - Number(amount):', Number(amount));
            console.log('  - parseFloat(amount):', parseFloat(amount));
            console.log('  - amount === 0:', amount === 0);
            console.log('  - amount == 0:', amount == 0);
            
            // Test payment mode values
            console.log('🎯 Payment mode analysis:');
            data.transactions.forEach((tx, index) => {
                console.log(`  Transaction ${index + 1}: ${tx.payment_mode} (${typeof tx.payment_mode})`);
            });
            
            // Count payment mode distribution
            const paymentModeCount = {};
            data.transactions.forEach(tx => {
                const mode = tx.payment_mode;
                paymentModeCount[mode] = (paymentModeCount[mode] || 0) + 1;
            });
            console.log('📊 Payment mode distribution:', paymentModeCount);
        } else {
            console.log('❌ No transactions found in API response');
        }
        
    } catch (error) {
        console.error('💥 Error during API debug:', error);
    }
}

// Function to analyze daily summary
async function debugDailySummaryAPI() {
    try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.error('❌ No auth token found for daily summary');
            return;
        }
        
        // Try different dates
        const dates = [
            new Date().toISOString().split('T')[0], // today
            '2025-08-20',
            '2025-08-19',
            '2025-08-18',
            '2025-08-17'
        ];
        
        for (const date of dates) {
            const apiUrl = `${window.location.origin.replace('localhost:3000', 'localhost:3001')}/api/transactions/reports/daily?date=${date}`;
            console.log(`📅 Checking daily summary for ${date}:`, apiUrl);
            
            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const summary = await response.json();
                console.log(`📊 Daily summary for ${date}:`, summary);
                
                if (summary?.paymentModeBreakdown) {
                    console.log(`💰 Payment breakdown for ${date}:`, summary.paymentModeBreakdown);
                }
                
                if (summary?.totalTransactions > 0) {
                    console.log(`✅ Found ${summary.totalTransactions} transactions on ${date}`);
                }
            } else {
                console.log(`❌ Failed to get daily summary for ${date}:`, response.status);
            }
        }
        
    } catch (error) {
        console.error('💥 Error during daily summary debug:', error);
    }
}

// Run both debug functions
debugTransactionAPI();
debugDailySummaryAPI();

console.log('🏁 Debug analysis completed. Check the logs above for details.');
