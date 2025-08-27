// ESCASHOP Frontend Data Debugging Script
// Copy and paste this into your browser's console on the transaction management page

console.log("🔍 ESCASHOP Frontend Data Debugging Started");
console.log("==========================================");

// Function to debug the transaction data processing
function debugTransactionData() {
  console.log("\n📊 FRONTEND TRANSACTION DATA ANALYSIS");
  console.log("=====================================");
  
  // Check if we're on the right page
  if (!window.location.pathname.includes('transactions') && !window.location.pathname.includes('dashboard')) {
    console.warn("⚠️ You might not be on the transactions page. Navigate to the transaction management page first.");
  }
  
  // Look for React components and state
  console.log("🔍 Looking for React components and state...");
  
  // Try to access React DevTools data
  const reactFiber = Object.keys(document.querySelector('#root') || {}).find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
  if (reactFiber) {
    console.log("✅ Found React fiber:", reactFiber);
  }
  
  // Check for any global transaction data
  if (window.transactionData) {
    console.log("📦 Found window.transactionData:");
    console.log(window.transactionData);
  }
  
  // Look for API responses in network tab
  console.log("\n🌐 NETWORK DEBUGGING");
  console.log("===================");
  console.log("📋 Instructions:");
  console.log("1. Open Network tab in DevTools");
  console.log("2. Filter by 'XHR' or 'Fetch'");
  console.log("3. Look for API calls to /api/transactions or similar");
  console.log("4. Check the Response data structure");
  
  // Check local storage
  console.log("\n💾 LOCAL STORAGE CHECK");
  console.log("=====================");
  Object.keys(localStorage).forEach(key => {
    if (key.toLowerCase().includes('transaction') || key.toLowerCase().includes('escashop')) {
      console.log(`🔑 ${key}:`, localStorage.getItem(key));
    }
  });
  
  // Check session storage
  console.log("\n🗃️ SESSION STORAGE CHECK");
  console.log("========================");
  Object.keys(sessionStorage).forEach(key => {
    if (key.toLowerCase().includes('transaction') || key.toLowerCase().includes('escashop')) {
      console.log(`🔑 ${key}:`, sessionStorage.getItem(key));
    }
  });
}

// Function to monitor API calls
function monitorAPIRequests() {
  console.log("\n🕵️ MONITORING API REQUESTS");
  console.log("==========================");
  
  // Override fetch to monitor requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    if (typeof url === 'string' && (url.includes('transaction') || url.includes('api'))) {
      console.log(`📡 API Request detected: ${url}`);
    }
    
    return originalFetch.apply(this, args)
      .then(response => {
        if (typeof url === 'string' && (url.includes('transaction') || url.includes('api'))) {
          console.log(`📨 API Response for ${url}:`, response.status, response.statusText);
          
          // Clone the response to read the data without consuming it
          const responseClone = response.clone();
          responseClone.json()
            .then(data => {
              console.log(`📊 Response Data for ${url}:`, data);
              
              // Analyze transaction data specifically
              if (data && data.transactions) {
                console.log("💰 TRANSACTION DATA ANALYSIS:");
                data.transactions.slice(0, 3).forEach((tx, index) => {
                  console.log(`Transaction ${index + 1}:`, {
                    id: tx.id,
                    or_number: tx.or_number,
                    amount: tx.amount,
                    amount_type: typeof tx.amount,
                    payment_mode: tx.payment_mode,
                    payment_mode_type: typeof tx.payment_mode,
                    customer_name: tx.customer_name,
                    all_keys: Object.keys(tx)
                  });
                });
              }
            })
            .catch(err => console.log("Could not parse response as JSON:", err));
        }
        
        return response;
      });
  };
  
  console.log("✅ API monitoring enabled. Refresh the page or trigger API calls to see data.");
}

// Function to test currency formatting
function testCurrencyFormatting() {
  console.log("\n💱 CURRENCY FORMATTING TESTS");
  console.log("=============================");
  
  const testValues = [
    0,
    1500,
    2500.50,
    "1500",
    "2500.50",
    null,
    undefined,
    NaN,
    "0",
    ""
  ];
  
  // Test the formatCurrency function if available
  if (window.formatCurrency) {
    console.log("🧪 Testing window.formatCurrency:");
    testValues.forEach(value => {
      try {
        const result = window.formatCurrency(value);
        console.log(`formatCurrency(${JSON.stringify(value)}) = ${result}`);
      } catch (err) {
        console.error(`formatCurrency(${JSON.stringify(value)}) ERROR:`, err);
      }
    });
  } else {
    console.log("⚠️ window.formatCurrency not found. Testing basic formatting:");
    testValues.forEach(value => {
      try {
        // Test parseFloat conversion
        const parsed = parseFloat(String(value || 0)) || 0;
        const formatted = new Intl.NumberFormat('en-PH', {
          style: 'currency',
          currency: 'PHP',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(parsed);
        console.log(`${JSON.stringify(value)} -> ${parsed} -> ${formatted}`);
      } catch (err) {
        console.error(`Error formatting ${JSON.stringify(value)}:`, err);
      }
    });
  }
}

// Function to check DOM elements
function checkDOMElements() {
  console.log("\n🎯 DOM ELEMENTS CHECK");
  console.log("=====================");
  
  // Look for transaction table or cards
  const tables = document.querySelectorAll('table');
  const cards = document.querySelectorAll('[class*="card"]');
  const amounts = document.querySelectorAll('[class*="amount"], [class*="currency"]');
  
  console.log(`Found ${tables.length} tables, ${cards.length} cards, ${amounts.length} amount elements`);
  
  // Check for specific text content
  const zeroAmounts = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent && el.textContent.includes('₱0.00')
  );
  
  console.log(`Found ${zeroAmounts.length} elements with ₱0.00:`);
  zeroAmounts.slice(0, 5).forEach((el, index) => {
    console.log(`Element ${index + 1}:`, el, el.textContent);
  });
  
  // Check for Cash payment modes
  const cashPayments = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent && el.textContent.trim() === 'Cash' && 
    el.className && (el.className.includes('chip') || el.className.includes('badge'))
  );
  
  console.log(`Found ${cashPayments.length} elements with Cash payment mode:`);
  cashPayments.slice(0, 5).forEach((el, index) => {
    console.log(`Element ${index + 1}:`, el, el.textContent);
  });
}

// Main debug function
function runFullDebug() {
  debugTransactionData();
  monitorAPIRequests();
  testCurrencyFormatting();
  checkDOMElements();
  
  console.log("\n🎯 DEBUGGING COMPLETE");
  console.log("====================");
  console.log("📋 Next Steps:");
  console.log("1. Check the Network tab for API responses");
  console.log("2. Look at the console output above for data structure issues");
  console.log("3. If needed, run 'checkTransactionProcessing()' after the page loads data");
}

// Function to check how data is being processed in the component
function checkTransactionProcessing() {
  console.log("\n🔄 CHECKING TRANSACTION PROCESSING");
  console.log("==================================");
  
  // Try to find React components
  const rootElement = document.querySelector('#root');
  if (rootElement && rootElement._reactInternalFiber) {
    console.log("Found React fiber, attempting to access component state...");
    // This is a simplified approach - in production we'd need React DevTools
  }
  
  // Look for debug logs in console
  console.log("Looking for existing debug logs...");
  
  // Set up a custom logger to catch our debug messages
  const originalLog = console.log;
  window.transactionDebugLogs = [];
  
  console.log = function(...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('[TRANSACTION_DEBUG]')) {
      window.transactionDebugLogs.push(args);
    }
    originalLog.apply(console, args);
  };
  
  console.log("✅ Debug logging interceptor set up. Logs will be captured in window.transactionDebugLogs");
}

// Export functions for manual use
window.debugESCASHOP = {
  runFullDebug,
  debugTransactionData,
  monitorAPIRequests,
  testCurrencyFormatting,
  checkDOMElements,
  checkTransactionProcessing
};

console.log("🚀 ESCASHOP Debug Tools Loaded!");
console.log("===============================");
console.log("Available commands:");
console.log("• debugESCASHOP.runFullDebug() - Run all debugging checks");
console.log("• debugESCASHOP.monitorAPIRequests() - Monitor API calls");
console.log("• debugESCASHOP.testCurrencyFormatting() - Test currency formatting");
console.log("• debugESCASHOP.checkDOMElements() - Check DOM for issues");
console.log("• debugESCASHOP.checkTransactionProcessing() - Monitor data processing");
console.log("\n👉 Start with: debugESCASHOP.runFullDebug()");
