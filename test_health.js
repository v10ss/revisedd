// Test health endpoint to check deployment status

async function testHealth() {
  try {
    console.log('Testing health endpoint...');
    
    const response = await fetch('https://escashop-backend.onrender.com/health');
    
    if (!response.ok) {
      console.error('Health check failed:', response.status, await response.text());
      return;
    }
    
    const data = await response.json();
    console.log('Health check successful:', data);
    
    // Now test a public queue endpoint
    console.log('\nTesting public queue endpoint...');
    const queueResponse = await fetch('https://escashop-backend.onrender.com/api/queue/public/display-all');
    
    console.log('Queue endpoint status:', queueResponse.status);
    
    if (queueResponse.ok) {
      const queueData = await queueResponse.json();
      console.log('✅ Queue endpoint working! Data count:', queueData.length);
    } else {
      const errorText = await queueResponse.text();
      console.log('❌ Queue endpoint failed:', errorText);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testHealth();
