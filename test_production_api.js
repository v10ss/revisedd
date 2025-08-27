const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testProductionAPI() {
  const BACKEND_URL = 'https://escashop-backend.onrender.com';
  
  console.log('=== TESTING PRODUCTION API ENDPOINTS ===\n');

  try {
    // Test the display queue endpoint
    console.log('1. Testing /api/queue/display-all endpoint:');
    const displayResponse = await fetch(`${BACKEND_URL}/api/queue/display-all`);
    console.log('Status:', displayResponse.status);
    
    if (displayResponse.ok) {
      const displayData = await displayResponse.json();
      console.log('Response data:', JSON.stringify(displayData, null, 2));
      
      const servingCustomers = displayData.filter(item => 
        (item.customer && item.customer.queue_status === 'serving') || 
        item.queue_status === 'serving'
      );
      console.log(`Serving customers count from API: ${servingCustomers.length}`);
      
      if (servingCustomers.length > 0) {
        console.log('Serving customers details:');
        servingCustomers.forEach(customer => {
          console.log(`- ID: ${customer.customer?.id || customer.id}, Name: ${customer.customer?.name || customer.name}, Token: ${customer.customer?.token_number || customer.token_number}`);
        });
      }
    } else {
      const errorText = await displayResponse.text();
      console.log('Error response:', errorText);
    }

    console.log('\n2. Testing /api/queue/counters/display endpoint:');
    const countersResponse = await fetch(`${BACKEND_URL}/api/queue/counters/display`);
    console.log('Status:', countersResponse.status);
    
    if (countersResponse.ok) {
      const countersData = await countersResponse.json();
      console.log('Response data:', JSON.stringify(countersData, null, 2));
      
      const countersWithCustomers = countersData.filter(counter => counter.current_customer);
      console.log(`Counters with assigned customers: ${countersWithCustomers.length}`);
      
      if (countersWithCustomers.length > 0) {
        console.log('Counters with customers:');
        countersWithCustomers.forEach(counter => {
          console.log(`- Counter: ${counter.name}, Customer: ${counter.current_customer.name}, Token: ${counter.current_customer.token_number}`);
        });
      }
    } else {
      const errorText = await countersResponse.text();
      console.log('Error response:', errorText);
    }

    // Test public endpoints as well
    console.log('\n3. Testing public /api/queue/public/display-all endpoint:');
    const publicDisplayResponse = await fetch(`${BACKEND_URL}/api/queue/public/display-all`);
    console.log('Status:', publicDisplayResponse.status);
    
    if (publicDisplayResponse.ok) {
      const publicDisplayData = await publicDisplayResponse.json();
      console.log('Public display data length:', publicDisplayData.length);
      
      const publicServingCustomers = publicDisplayData.filter(item => 
        (item.customer && item.customer.queue_status === 'serving') || 
        item.queue_status === 'serving'
      );
      console.log(`Public serving customers count: ${publicServingCustomers.length}`);
    } else {
      const errorText = await publicDisplayResponse.text();
      console.log('Public display error:', errorText);
    }

    console.log('\n4. Testing public /api/queue/public/counters/display endpoint:');
    const publicCountersResponse = await fetch(`${BACKEND_URL}/api/queue/public/counters/display`);
    console.log('Status:', publicCountersResponse.status);
    
    if (publicCountersResponse.ok) {
      const publicCountersData = await publicCountersResponse.json();
      console.log('Public counters data length:', publicCountersData.length);
      
      const publicCountersWithCustomers = publicCountersData.filter(counter => counter.current_customer);
      console.log(`Public counters with assigned customers: ${publicCountersWithCustomers.length}`);
    } else {
      const errorText = await publicCountersResponse.text();
      console.log('Public counters error:', errorText);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testProductionAPI();
