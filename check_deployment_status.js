require('dotenv').config({ path: './backend/.env' });

async function checkDeploymentStatus() {
  try {
    console.log('🔍 Checking deployment status...\n');
    
    const healthUrl = `${process.env.API_BASE_URL || 'https://escashop-backend.onrender.com'}/api/health`;
    console.log('Health URL:', healthUrl);
    
    const response = await fetch(healthUrl);
    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('\n📊 Health Data:');
      console.log(JSON.stringify(data, null, 2));
      
      // Check if deployment timestamp indicates our latest fix
      if (data.deployment && data.deployment.includes('Transaction amounts')) {
        console.log('\n✅ Latest deployment is live!');
        return true;
      } else {
        console.log('\n⏳ Still waiting for deployment...');
        console.log('Current deployment:', data.deployment);
        console.log('Expected: Something with "Transaction amounts"');
        return false;
      }
    } else {
      console.log('❌ Health check failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error checking deployment:', error.message);
    return false;
  }
}

// Check every 30 seconds for up to 10 minutes
async function waitForDeployment() {
  const maxAttempts = 20; // 10 minutes
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n🔄 Attempt ${attempts}/${maxAttempts} - ${new Date().toISOString()}`);
    
    const isDeployed = await checkDeploymentStatus();
    if (isDeployed) {
      console.log('\n🎉 Deployment completed!');
      return true;
    }
    
    if (attempts < maxAttempts) {
      console.log('⏳ Waiting 30 seconds...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
  
  console.log('\n⏰ Timeout: Deployment taking longer than expected');
  return false;
}

waitForDeployment();
