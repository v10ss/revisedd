// Production Diagnosis Script for Render.com Deployment Issues
// Run this script to identify common backend deployment problems

const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 ESCASHOP Production Backend Diagnosis Tool');
console.log('='.repeat(60));

// Configuration
const BACKEND_URL = 'https://escashop-backend.onrender.com';
const HEALTH_ENDPOINT = '/health';
const API_ENDPOINT = '/api/transactions';

// Test Functions
async function testHttpRequest(url, timeout = 30000) {
    return new Promise((resolve) => {
        const startTime = Date.now();
        
        const req = https.get(url, { timeout }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const duration = Date.now() - startTime;
                resolve({
                    success: true,
                    status: res.statusCode,
                    headers: res.headers,
                    data: data.substring(0, 500), // First 500 chars
                    duration
                });
            });
        });
        
        req.on('error', (error) => {
            const duration = Date.now() - startTime;
            resolve({
                success: false,
                error: error.message,
                code: error.code,
                duration
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve({
                success: false,
                error: 'Request timeout',
                code: 'TIMEOUT',
                duration: timeout
            });
        });
    });
}

async function checkLocalFiles() {
    console.log('\n📁 Local Build Files Check:');
    console.log('-'.repeat(40));
    
    // Check if dist directory exists
    const distPath = path.join(__dirname, 'dist');
    const distExists = fs.existsSync(distPath);
    console.log(`✅ dist/ directory: ${distExists ? 'EXISTS' : '❌ MISSING'}`);
    
    if (distExists) {
        const indexExists = fs.existsSync(path.join(distPath, 'index.js'));
        console.log(`✅ dist/index.js: ${indexExists ? 'EXISTS' : '❌ MISSING'}`);
        
        // Check file size
        if (indexExists) {
            const stats = fs.statSync(path.join(distPath, 'index.js'));
            console.log(`📦 dist/index.js size: ${(stats.size / 1024).toFixed(2)} KB`);
        }
    }
    
    // Check package.json
    const packageJsonPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        const package = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        console.log(`✅ Start script: "${package.scripts?.start || 'MISSING'}"`);
        console.log(`✅ Build script: "${package.scripts?.build || 'MISSING'}"`);
    }
    
    // Check for common missing dependencies
    const nodeModulesPath = path.join(__dirname, 'node_modules');
    const nodeModulesExists = fs.existsSync(nodeModulesPath);
    console.log(`✅ node_modules: ${nodeModulesExists ? 'EXISTS' : '❌ MISSING'}`);
}

async function checkDatabaseMigration() {
    console.log('\n🗄️  Database Migration Check:');
    console.log('-'.repeat(40));
    
    const migrationPath = path.join(__dirname, 'dist', 'migrate.js');
    const migrationExists = fs.existsSync(migrationPath);
    console.log(`✅ Migration script: ${migrationExists ? 'EXISTS' : '❌ MISSING'}`);
    
    // Check if complete-migration.sql exists
    const sqlPath = path.join(__dirname, 'src', 'database', 'complete-migration.sql');
    const sqlExists = fs.existsSync(sqlPath);
    console.log(`✅ Migration SQL: ${sqlExists ? 'EXISTS' : '❌ MISSING'}`);
}

async function runDiagnostics() {
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    
    // 1. Check local build files
    await checkLocalFiles();
    
    // 2. Check database migration files
    await checkDatabaseMigration();
    
    // 3. Test backend health endpoint
    console.log('\n🏥 Backend Health Check:');
    console.log('-'.repeat(40));
    
    const healthTest = await testHttpRequest(BACKEND_URL + HEALTH_ENDPOINT, 30000);
    if (healthTest.success) {
        console.log(`✅ Health endpoint: ${healthTest.status} (${healthTest.duration}ms)`);
        console.log(`📄 Response: ${healthTest.data}`);
        console.log(`🔗 CORS headers: ${healthTest.headers['access-control-allow-origin'] || 'NONE'}`);
    } else {
        console.log(`❌ Health endpoint: ${healthTest.error} (${healthTest.code})`);
        console.log(`⏱️  Duration: ${healthTest.duration}ms`);
    }
    
    // 4. Test API endpoint (without auth)
    console.log('\n🔌 API Endpoint Test:');
    console.log('-'.repeat(40));
    
    const apiTest = await testHttpRequest(BACKEND_URL + API_ENDPOINT, 15000);
    if (apiTest.success) {
        console.log(`✅ API endpoint: ${apiTest.status} (${apiTest.duration}ms)`);
        if (apiTest.status === 401) {
            console.log('   ℹ️  401 Unauthorized is expected (no auth token)');
        } else {
            console.log(`📄 Response preview: ${apiTest.data.substring(0, 200)}`);
        }
    } else {
        console.log(`❌ API endpoint: ${apiTest.error} (${apiTest.code})`);
        
        // Specific error analysis
        if (apiTest.code === 'ENOTFOUND') {
            console.log('   🚨 DNS resolution failed - service may be down');
        } else if (apiTest.code === 'ECONNREFUSED') {
            console.log('   🚨 Connection refused - service not running');
        } else if (apiTest.code === 'TIMEOUT') {
            console.log('   🚨 Request timeout - service may be starting up');
        }
    }
    
    // 5. Check common Render.com issues
    console.log('\n🔧 Common Render.com Issues Check:');
    console.log('-'.repeat(40));
    
    // Check if using correct port
    const packageJsonPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        const package = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const startScript = package.scripts?.start || '';
        
        console.log(`📦 Start command: "${startScript}"`);
        
        if (startScript.includes('npm run migrate')) {
            console.log('✅ Migration included in start script');
        } else {
            console.log('⚠️  Migration not in start script - may cause DB issues');
        }
        
        if (startScript.includes('node dist/index.js')) {
            console.log('✅ Using compiled dist/index.js');
        } else {
            console.log('⚠️  Start script may not use compiled code');
        }
    }
    
    // 6. Environment-specific checks
    console.log('\n🌍 Environment Configuration:');
    console.log('-'.repeat(40));
    
    // Check if production env template exists
    const prodEnvTemplate = path.join(__dirname, '.env.production.template');
    console.log(`✅ Prod env template: ${fs.existsSync(prodEnvTemplate) ? 'EXISTS' : '❌ MISSING'}`);
    
    // Check TypeScript config
    const tsConfigPath = path.join(__dirname, 'tsconfig.json');
    console.log(`✅ TypeScript config: ${fs.existsSync(tsConfigPath) ? 'EXISTS' : '❌ MISSING'}`);
    
    // 7. Recommendations
    console.log('\n💡 Diagnosis Summary & Recommendations:');
    console.log('='.repeat(60));
    
    if (!healthTest.success) {
        console.log('🚨 CRITICAL: Backend service is not responding');
        console.log('   Possible causes:');
        console.log('   1. Service failed to start due to build errors');
        console.log('   2. Database connection failure');
        console.log('   3. Environment variables not configured');
        console.log('   4. Service crashed due to runtime error');
        console.log('');
        console.log('   📋 Action Items:');
        console.log('   • Check Render.com service logs for error messages');
        console.log('   • Verify DATABASE_URL environment variable is set');
        console.log('   • Ensure all required environment variables are configured');
        console.log('   • Try manual redeploy in Render.com dashboard');
        
    } else if (!apiTest.success && healthTest.success) {
        console.log('⚠️  PARTIAL: Health endpoint works, API endpoints fail');
        console.log('   This suggests database connection issues');
        console.log('');
        console.log('   📋 Action Items:');
        console.log('   • Check DATABASE_URL in Render.com environment variables');
        console.log('   • Verify database migration ran successfully');
        console.log('   • Check service logs for database connection errors');
        
    } else if (healthTest.success && apiTest.success) {
        console.log('✅ SUCCESS: Backend appears to be working correctly');
        console.log('   The issue may be:');
        console.log('   • CORS configuration for your frontend domain');
        console.log('   • Temporary network issues from your location');
        console.log('   • Frontend authentication/token issues');
        
    } else {
        console.log('❓ UNCLEAR: Mixed results - investigate further');
    }
    
    console.log('\n⏰ Diagnosis completed at:', new Date().toISOString());
}

// Run diagnostics
runDiagnostics().catch(console.error);
