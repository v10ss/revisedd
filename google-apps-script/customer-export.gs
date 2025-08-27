/**
 * Google Apps Script for EscaShop Customer Export Integration
 * This script handles incoming POST requests to export customer data to Google Sheets
 */

// Configuration - Replace with your actual spreadsheet ID
const SPREADSHEET_ID = '1EQoJp1fjxMJc3L54JA5hKWHkm-K36vg81YyPv4cCIBE';
const SHEET_NAME = 'Customers';

/**
 * Main handler for POST requests
 */
function doPost(e) {
  try {
    // Parse the incoming request
    const data = JSON.parse(e.postData.contents);
    
    console.log('Received request:', data);
    
    // Validate request
    if (!data || !data.action) {
      return createResponse(false, 'Invalid request: missing action parameter');
    }
    
    // Get or create spreadsheet
    let spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (error) {
      console.error('Error opening spreadsheet:', error);
      return createResponse(false, 'Failed to access Google Sheets. Please check spreadsheet permissions.');
    }
    
    // Get or create the sheet
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      // Add headers
      const headers = [
        'Customer Name', 'Contact Number', 'Email', 'Age', 'Address',
        'Occupation', 'Distribution Method', 'Sales Agent', 'Doctor Assigned',
        'OD (Right Eye)', 'OS (Left Eye)', 'OU (Both Eyes)', 'PD (Pupillary Distance)',
        'ADD (Addition)', 'Grade Type', 'Lens Type', 'Frame Code', 'Payment Method',
        'Payment Amount', 'OR Number', 'Priority Flags', 'Remarks', 'Queue Status', 
        'Token Number', 'Estimated Time', 'Registration Date', 'Export Date'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    
    // Handle different actions
    if (data.action === 'single') {
      return handleSingleCustomerExport(sheet, data.customer);
    } else if (data.action === 'bulk') {
      return handleBulkCustomerExport(sheet, data.customers);
    } else {
      return createResponse(false, `Unknown action: ${data.action}`);
    }
    
  } catch (error) {
    console.error('Error in doPost:', error);
    return createResponse(false, `Server error: ${error.message}`);
  }
}

/**
 * Handle single customer export
 */
function handleSingleCustomerExport(sheet, customer) {
  try {
    if (!customer) {
      return createResponse(false, 'No customer data provided');
    }
    
    console.log('Processing single customer:', customer.name);
    
    // Format customer data for the sheet
    const rowData = formatCustomerData(customer);
    
    // Add the row to the sheet
    sheet.appendRow(rowData);
    
    // Get spreadsheet URL
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;
    
    return createResponse(true, 'Customer exported successfully', {
      spreadsheetUrl: spreadsheetUrl,
      customerName: customer.name,
      exportedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in single customer export:', error);
    return createResponse(false, `Failed to export customer: ${error.message}`);
  }
}

/**
 * Handle bulk customer export
 */
function handleBulkCustomerExport(sheet, customers) {
  try {
    if (!customers || !Array.isArray(customers)) {
      return createResponse(false, 'No customers data provided or invalid format');
    }
    
    console.log(`Processing bulk export for ${customers.length} customers`);
    
    // Prepare batch data
    const batchData = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const customer of customers) {
      try {
        const rowData = formatCustomerData(customer);
        batchData.push(rowData);
        successCount++;
      } catch (customerError) {
        console.error(`Error processing customer ${customer?.id}:`, customerError);
        errorCount++;
      }
    }
    
    if (batchData.length === 0) {
      return createResponse(false, 'No valid customer data to export');
    }
    
    // Add all rows at once for better performance
    if (batchData.length > 0) {
      const range = sheet.getRange(sheet.getLastRow() + 1, 1, batchData.length, batchData[0].length);
      range.setValues(batchData);
    }
    
    // Get spreadsheet URL
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;
    
    return createResponse(true, `Bulk export completed: ${successCount} customers exported`, {
      spreadsheetUrl: spreadsheetUrl,
      successCount: successCount,
      errorCount: errorCount,
      exportedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in bulk customer export:', error);
    return createResponse(false, `Failed to export customers: ${error.message}`);
  }
}

/**
 * Format customer data for spreadsheet row
 */
function formatCustomerData(customer) {
  return [
    customer.name || '',
    customer.contact_number || '',
    customer.email || '',
    customer.age || '',
    customer.address || '',
    customer.occupation || '',
    customer.distribution_info || '',
    customer.sales_agent_name || '',
    customer.doctor_assigned || '',
    customer.prescription?.od || '',
    customer.prescription?.os || '',
    customer.prescription?.ou || '',
    customer.prescription?.pd || '',
    customer.prescription?.add || '',
    customer.grade_type || '',
    customer.lens_type || '',
    customer.frame_code || '',
    formatPaymentMode(customer.payment_info?.mode) || '',
    customer.payment_info?.amount ? `₱${customer.payment_info.amount}` : '',
    customer.or_number || '',
    formatPriorityFlags(customer.priority_flags) || '',
    customer.remarks || '',
    customer.queue_status || '',
    customer.token_number || '',
    formatEstimatedTime(customer.estimated_time) || '',
    customer.created_at ? new Date(customer.created_at).toLocaleDateString() : '',
    new Date().toLocaleDateString() // Export date
  ];
}

/**
 * Format payment mode for display
 */
function formatPaymentMode(mode) {
  if (!mode) return 'N/A';
  const labels = {
    'gcash': 'GCash',
    'maya': 'Maya',
    'bank_transfer': 'Bank Transfer',
    'credit_card': 'Credit Card',
    'cash': 'Cash'
  };
  return labels[mode] || mode;
}

/**
 * Format priority flags for display
 */
function formatPriorityFlags(flags) {
  if (!flags) return 'None';
  const priorities = [];
  if (flags.senior_citizen) priorities.push('Senior Citizen');
  if (flags.pregnant) priorities.push('Pregnant');
  if (flags.pwd) priorities.push('PWD');
  return priorities.join(', ') || 'None';
}

/**
 * Format estimated time for display
 */
function formatEstimatedTime(estimatedTime) {
  if (typeof estimatedTime === 'number') {
    return `${estimatedTime} minutes`;
  }
  
  if (typeof estimatedTime === 'object' && estimatedTime !== null) {
    const parts = [];
    if (estimatedTime.days && estimatedTime.days > 0) {
      parts.push(`${estimatedTime.days} day${estimatedTime.days > 1 ? 's' : ''}`);
    }
    if (estimatedTime.hours && estimatedTime.hours > 0) {
      parts.push(`${estimatedTime.hours} hour${estimatedTime.hours > 1 ? 's' : ''}`);
    }
    if (estimatedTime.minutes && estimatedTime.minutes > 0) {
      parts.push(`${estimatedTime.minutes} minute${estimatedTime.minutes > 1 ? 's' : ''}`);
    }
    return parts.length > 0 ? parts.join(', ') : '0 minutes';
  }
  
  return String(estimatedTime) || '0 minutes';
}

/**
 * Create standardized response object
 */
function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message,
    timestamp: new Date().toISOString()
  };
  
  if (data) {
    Object.assign(response, data);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  return createResponse(true, 'EscaShop Customer Export API is running', {
    version: '1.0',
    endpoints: ['POST for customer exports'],
    supportedActions: ['single', 'bulk']
  });
}
