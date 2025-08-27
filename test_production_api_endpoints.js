const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testProductionAPIEndpoints() {
  const BACKEND_URL = 'https://escashop-backend.onrender.com/api';
  
  console.log('=== TESTING PRODUCTION API ENDPOINTS ===\n');

  try {
    // Test the display queue endpoint without auth (should fail)
    console.log('1. Testing /queue/display-all (without auth):');
    const displayResponse = await fetch(`${BACKEND_URL}/queue/display-all`);
    console.log('Status:', displayResponse.status);
    if (!displayResponse.ok) {
      const errorText = await displayResponse.text();
      console.log('Error:', errorText);
    }

    // Test the public display queue endpoint
    console.log('\n2. Testing /queue/public/display-all (public):');
    const publicDisplayResponse = await fetch(`${BACKEND_URL}/queue/public/display-all`);
    console.log('Status:', publicDisplayResponse.status);
    
    if (publicDisplayResponse.ok) {
      const data = await publicDisplayResponse.json();
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      const servingCustomers = data.filter(item => 
        (item.customer && item.customer.queue_status === 'serving') || 
        item.queue_status === 'serving'
      );
      console.log(`\nServing customers from public API: ${servingCustomers.length}`);
      
      if (servingCustomers.length > 0) {
        console.log('Serving customers details:');
        servingCustomers.forEach((customer, index) => {
          console.log(`${index + 1}. ID: ${customer.customer?.id || customer.id}, Name: ${customer.customer?.name || customer.name}, Token: ${customer.customer?.token_number || customer.token_number}, Status: ${customer.customer?.queue_status || customer.queue_status}`);
        });
      }
    } else {
      const errorText = await publicDisplayResponse.text();
      console.log('Error:', errorText);
    }

    // Test the public counters endpoint
    console.log('\n3. Testing /queue/public/counters/display (public):');
    const publicCountersResponse = await fetch(`${BACKEND_URL}/queue/public/counters/display`);
    console.log('Status:', publicCountersResponse.status);
    
    if (publicCountersResponse.ok) {
      const data = await publicCountersResponse.json();
      console.log('Response data:', JSON.stringify(data, null, 2));
      
      const countersWithCustomers = data.filter(counter => counter.current_customer);
      console.log(`\nCounters with assigned customers: ${countersWithCustomers.length}`);
      
      if (countersWithCustomers.length > 0) {
        console.log('Counters with customers:');
        countersWithCustomers.forEach((counter, index) => {
          console.log(`${index + 1}. Counter: ${counter.name}, Customer: ${counter.current_customer.name}, Token: ${counter.current_customer.token_number}`);
        });
      }
    } else {
      const errorText = await publicCountersResponse.text();
      console.log('Error:', errorText);
    }

    // Test with a sample authentication token (we'll need to get this)
    console.log('\n4. Testing authenticated endpoints...');
    console.log('NOTE: Authentication required - frontend should be calling these with a token.');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testProductionAPIEndpoints();
