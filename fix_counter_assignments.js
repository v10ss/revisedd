// Using built-in fetch in Node.js 22+

async function fixCounterAssignments() {
  try {
    console.log('🔧 Calling fix serving counter assignments endpoint...');
    
    // First, let's try to get an admin token by logging in
    const loginResponse = await fetch('https://escashop-backend.onrender.com/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@escashop.com',
        password: 'admin123'
      })
    });

    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginResponse.status, await loginResponse.text());
      return;
    }

    const loginData = await loginResponse.json();
    console.log('Login response data:', JSON.stringify(loginData, null, 2));
    
    const token = loginData.accessToken;
    
    if (!token) {
      console.error('❌ No token received from login');
      return;
    }
    
    console.log('✅ Admin login successful, token:', token ? 'received' : 'missing');
    
    // Try the existing fix endpoint first
    console.log('Trying existing fix-counter-assignments endpoint...');
    const fixResponse = await fetch('https://escashop-backend.onrender.com/api/queue/fix-counter-assignments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!fixResponse.ok) {
      console.error('❌ Fix endpoint failed:', fixResponse.status, await fixResponse.text());
      return;
    }

    const fixData = await fixResponse.json();
    console.log('✅ Fix serving counter assignments result:', JSON.stringify(fixData, null, 2));

    // Also let's check the current state of counters after the fix
    const countersResponse = await fetch('https://escashop-backend.onrender.com/api/queue/public/counters/display');
    if (countersResponse.ok) {
      const countersData = await countersResponse.json();
      console.log('\n📊 Current counters state after fix:');
      countersData.forEach((counter, index) => {
        console.log(`   Counter ${index + 1}: ${counter.name} - ${counter.current_customer ? `Serving: ${counter.current_customer.name} (${counter.current_customer.token_number})` : 'Available'}`);
      });
    }

    // And check the queue
    const queueResponse = await fetch('https://escashop-backend.onrender.com/api/queue/public/display-all');
    if (queueResponse.ok) {
      const queueData = await queueResponse.json();
      const servingCount = queueData.filter(item => item.customer?.queue_status === 'serving').length;
      console.log(`\n📋 Current queue state: ${queueData.length} total customers, ${servingCount} serving`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixCounterAssignments();
