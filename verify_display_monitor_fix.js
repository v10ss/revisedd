// Using built-in fetch in Node.js 22+

async function verifyDisplayMonitorFix() {
  try {
    console.log('🔍 Verifying Display Monitor data consistency after counter assignment fix...\n');
    
    // Test 1: Get queue data
    console.log('📋 Testing queue data endpoint...');
    const queueResponse = await fetch('https://escashop-backend.onrender.com/api/queue/public/display-all');
    
    if (!queueResponse.ok) {
      console.error('❌ Queue endpoint failed:', queueResponse.status, await queueResponse.text());
      return;
    }
    
    const queueData = await queueResponse.json();
    console.log(`✅ Queue endpoint successful: ${queueData.length} items`);
    
    // Analyze queue data
    const servingCustomers = queueData.filter(item => item.customer?.queue_status === 'serving');
    const waitingCustomers = queueData.filter(item => item.customer?.queue_status === 'waiting');
    
    console.log(`   - ${servingCustomers.length} customers with status 'serving'`);
    console.log(`   - ${waitingCustomers.length} customers with status 'waiting'`);
    
    if (servingCustomers.length > 0) {
      console.log('   Serving customers:');
      servingCustomers.forEach((customer, index) => {
        console.log(`     ${index + 1}. ${customer.customer.name} (Token: ${customer.customer.token_number}) - Time: ${customer.estimated_wait_time}`);
      });
    }
    
    // Test 2: Get counters data
    console.log('\n🏪 Testing counters data endpoint...');
    const countersResponse = await fetch('https://escashop-backend.onrender.com/api/queue/public/counters/display');
    
    if (!countersResponse.ok) {
      console.error('❌ Counters endpoint failed:', countersResponse.status, await countersResponse.text());
      return;
    }
    
    const countersData = await countersResponse.json();
    console.log(`✅ Counters endpoint successful: ${countersData.length} counters`);
    
    // Analyze counter data
    const busyCounters = countersData.filter(counter => counter.current_customer);
    const availableCounters = countersData.filter(counter => !counter.current_customer);
    
    console.log(`   - ${busyCounters.length} counters with assigned customers`);
    console.log(`   - ${availableCounters.length} counters available`);
    
    if (busyCounters.length > 0) {
      console.log('   Busy counters:');
      busyCounters.forEach((counter, index) => {
        console.log(`     ${index + 1}. ${counter.name}: ${counter.current_customer.name} (Token: ${counter.current_customer.token_number})`);
      });
    }
    
    // Test 3: Data consistency check
    console.log('\n🔍 Checking data consistency...');
    
    const consistencyChecks = {
      servingCustomersMatchCounterAssignments: servingCustomers.length === busyCounters.length,
      noInvalidEstimatedTimes: queueData.every(item => 
        item.estimated_wait_time === 0 || 
        (!isNaN(item.estimated_wait_time) && isFinite(item.estimated_wait_time))
      ),
      allServingCustomersHaveCounters: servingCustomers.length === busyCounters.length
    };
    
    console.log('Consistency Check Results:');
    console.log(`   ✅ Serving customers (${servingCustomers.length}) match counter assignments (${busyCounters.length}): ${consistencyChecks.servingCustomersMatchCounterAssignments ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ No invalid estimated wait times: ${consistencyChecks.noInvalidEstimatedTimes ? 'PASS' : 'FAIL'}`);
    console.log(`   ✅ All serving customers have assigned counters: ${consistencyChecks.allServingCustomersHaveCounters ? 'PASS' : 'FAIL'}`);
    
    // Test 4: Cross-reference serving customers with counter assignments
    if (servingCustomers.length > 0 && busyCounters.length > 0) {
      console.log('\n🔗 Cross-referencing customer assignments...');
      const servingCustomerIds = servingCustomers.map(c => c.customer.id);
      const assignedCustomerIds = busyCounters.map(c => c.current_customer.id);
      
      const unmatchedServing = servingCustomerIds.filter(id => !assignedCustomerIds.includes(id));
      const unmatchedAssigned = assignedCustomerIds.filter(id => !servingCustomerIds.includes(id));
      
      if (unmatchedServing.length === 0 && unmatchedAssigned.length === 0) {
        console.log('   ✅ Perfect match: All serving customers are properly assigned to counters');
      } else {
        console.log('   ❌ Mismatch found:');
        if (unmatchedServing.length > 0) {
          console.log(`     - Serving customers without counter assignments: ${unmatchedServing}`);
        }
        if (unmatchedAssigned.length > 0) {
          console.log(`     - Counter assignments without serving customers: ${unmatchedAssigned}`);
        }
      }
    }
    
    // Summary
    console.log('\n📊 SUMMARY:');
    const allChecksPass = Object.values(consistencyChecks).every(check => check);
    
    if (allChecksPass && servingCustomers.length === busyCounters.length) {
      console.log('   🎉 SUCCESS: Display Monitor data is now consistent!');
      console.log(`   📈 Current state: ${servingCustomers.length} customers being served at ${busyCounters.length} counters`);
      console.log(`   📈 Queue status: ${waitingCustomers.length} customers waiting`);
    } else {
      console.log('   ⚠️  WARNING: Some consistency issues remain');
      console.log('   🔧 Consider running the fix endpoint again or investigating further');
    }
    
  } catch (error) {
    console.error('❌ Error during verification:', error.message);
  }
}

verifyDisplayMonitorFix();
