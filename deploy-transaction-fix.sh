#!/bin/bash

# Deploy Transaction Amount Fix
# This script deploys the transaction amount fix and runs the migration

echo "🚀 Starting Transaction Amount Fix Deployment..."

# Set up environment variables if not already set
export NODE_ENV=${NODE_ENV:-production}
export DB_HOST=${DB_HOST:-localhost}
export DB_PORT=${DB_PORT:-5432}
export DB_NAME=${DB_NAME:-escashop}
export DB_USER=${DB_USER:-postgres}

echo "📝 Environment: $NODE_ENV"
echo "🗄️  Database: $DB_HOST:$DB_PORT/$DB_NAME"

# Navigate to backend directory
cd backend

echo "📦 Installing dependencies..."
npm install

echo "🔧 Building TypeScript..."
npm run build

echo "⚠️  Stopping current backend service..."
# Kill any existing Node.js process on port 3001 (adjust port as needed)
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

echo "🔍 Running transaction amount migration..."
node scripts/migrate-transaction-amounts.js

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully"
else
    echo "❌ Migration failed"
    exit 1
fi

echo "🚀 Starting backend service..."
# Start the backend service in the background
npm start &
BACKEND_PID=$!

echo "⏱️  Waiting for backend to start..."
sleep 10

# Check if backend is running
if ps -p $BACKEND_PID > /dev/null; then
    echo "✅ Backend started successfully (PID: $BACKEND_PID)"
else
    echo "❌ Backend failed to start"
    exit 1
fi

echo "🔍 Testing transaction API..."
# Test the transaction API endpoint
curl -X GET "http://localhost:3001/api/transactions" \
     -H "Authorization: Bearer YOUR_TEST_TOKEN" \
     -H "Content-Type: application/json" \
     --silent --output /dev/null --write-out "%{http_code}" > /tmp/api_test_result

API_RESPONSE=$(cat /tmp/api_test_result)

if [ "$API_RESPONSE" = "200" ] || [ "$API_RESPONSE" = "401" ]; then
    echo "✅ Transaction API is responding (HTTP $API_RESPONSE)"
else
    echo "⚠️  Transaction API response: HTTP $API_RESPONSE"
fi

echo "📋 Deployment Summary:"
echo "   - Transaction amount fix applied"
echo "   - Migration completed"
echo "   - Backend service restarted"
echo "   - API endpoint tested"

echo ""
echo "🎉 Deployment completed!"
echo ""
echo "📋 Next Steps:"
echo "   1. Test the Transaction Management page in the frontend"
echo "   2. Verify that amounts are now displaying correctly"
echo "   3. Check that new transactions have proper amounts"
echo "   4. Monitor logs for any issues"

echo ""
echo "🔍 To monitor backend logs:"
echo "   tail -f backend/logs/app.log"
echo ""
echo "🛑 To stop backend:"
echo "   kill $BACKEND_PID"

# Save PID for later reference
echo $BACKEND_PID > backend.pid
echo "Backend PID saved to backend.pid"
