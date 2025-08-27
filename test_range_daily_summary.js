// Usage:
//   set ACCESS_TOKEN and API_BASE_URL in your environment (do not echo secrets!)
//   node test_range_daily_summary.js 2025-08-20 2025-08-26
//
// Defaults:
//   BASE_URL: https://escashop-backend.onrender.com/api
//   Path: /transactions/reports/daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//
// The script prints:
//   - Range
//   - totalTransactions
//   - totalAmount (currency formatted)
//   - optional: paid/unpaid and registeredCustomers if present

const https = require('https');

function currency(n) {
  const num = typeof n === 'number' ? n : Number(n || 0);
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(num);
}

function requestJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'User-Agent': 'ESCASHOP-Range-Tester',
        ...headers,
      },
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
    req.end();
  });
}

(async function main() {
  const [startDate, endDate] = process.argv.slice(2);
  if (!startDate || !endDate) {
    console.error('Usage: node test_range_daily_summary.js <YYYY-MM-DD> <YYYY-MM-DD>');
    process.exit(1);
  }

  const BASE = process.env.API_BASE_URL || 'https://escashop-backend.onrender.com/api';
  const token = process.env.ACCESS_TOKEN;
  const url = `${BASE}/transactions/reports/daily?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    console.log(`🔎 Testing range summary: ${startDate} → ${endDate}`);
    console.log(`GET ${url}`);
    const res = await requestJSON(url, headers);
    if (res.status !== 200) {
      console.error(`❌ HTTP ${res.status}`);
      console.error('Body preview:', typeof res.data === 'string' ? res.data.substring(0, 200) : JSON.stringify(res.data));
      process.exit(2);
    }
    const s = res.data || {};
    console.log('\n✅ Range Summary');
    console.log(`  Range: ${startDate} → ${endDate}`);
    console.log(`  Total Transactions: ${s.totalTransactions ?? 'N/A'}`);
    console.log(`  Total Amount: ${currency(s.totalAmount ?? 0)}`);
    if (typeof s.paidTransactions !== 'undefined' || typeof s.unpaidTransactions !== 'undefined') {
      console.log(`  Paid / Unpaid: ${s.paidTransactions ?? 0} / ${s.unpaidTransactions ?? 0}`);
    }
    if (typeof s.registeredCustomers !== 'undefined') {
      console.log(`  Registered Customers: ${s.registeredCustomers}`);
    }

    if (s.paymentModeBreakdown && typeof s.paymentModeBreakdown === 'object') {
      console.log('\n  Payment Modes:');
      Object.entries(s.paymentModeBreakdown).forEach(([mode, info]) => {
        const amt = info && typeof info === 'object' ? info.amount : 0;
        const cnt = info && typeof info === 'object' ? info.count : 0;
        console.log(`   • ${mode.padEnd(14)}  count=${String(cnt).padStart(3)}  amount=${currency(amt)}`);
      });
    }

    if (Array.isArray(s.salesAgentBreakdown) && s.salesAgentBreakdown.length) {
      console.log('\n  Top Agents:');
      s.salesAgentBreakdown.slice(0, 5).forEach((a) => {
        console.log(`   • ${a.agent_name || 'Unknown'}  (${a.count} tx, ${currency(a.amount)})`);
      });
    }
    console.log('\nDone.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(3);
  }
})();

