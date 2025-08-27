import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import axios from 'axios';
import { CustomerService } from './customer';
import { Customer } from '../types';
import { config } from '../config/config';

export class ExportService {
  private static GOOGLE_SHEETS_URL = config.GOOGLE_SHEETS_URL;
  
  // Memory optimization constants
  private static readonly BATCH_SIZE = 100;
  private static readonly MEMORY_THRESHOLD = 500 * 1024 * 1024; // 500MB
  private static readonly BATCH_DELAY = 50; // ms
  
  // Progress tracking
  private static progressCallbacks: Map<string, (progress: number, status: string) => void> = new Map();

  /**
   * Register progress callback for export operations
   */
  static registerProgressCallback(exportId: string, callback: (progress: number, status: string) => void): void {
    this.progressCallbacks.set(exportId, callback);
  }
  
  /**
   * Remove progress callback after export completion
   */
  static removeProgressCallback(exportId: string): void {
    this.progressCallbacks.delete(exportId);
  }
  
  /**
   * Update progress for tracked export
   */
  private static updateProgress(exportId: string, progress: number, status: string): void {
    const callback = this.progressCallbacks.get(exportId);
    if (callback) {
      callback(progress, status);
    }
  }
  
  /**
   * Generate clean, descriptive filename for exports
   */
  private static generateCleanFilename(type: 'customer' | 'customers', format: 'xlsx' | 'pdf', customerInfo?: { id?: number, name?: string }, options?: { 
    searchTerm?: string, 
    statusFilter?: string, 
    dateRange?: { start: string, end: string },
    count?: number 
  }): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    
    if (type === 'customer' && customerInfo) {
      // Single customer export
      const customerName = customerInfo.name 
        ? customerInfo.name.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').toLowerCase()
        : `customer_${customerInfo.id}`;
      return `escashop_${customerName}_${timestamp}.${format}`;
    } else {
      // Multiple customers export
      let filename = `escashop_customers`;
      
      if (options?.searchTerm) {
        const cleanTerm = options.searchTerm.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
        filename += `_search_${cleanTerm}`;
      }
      
      if (options?.statusFilter) {
        filename += `_status_${options.statusFilter}`;
      }
      
      if (options?.dateRange) {
        filename += `_${options.dateRange.start}_to_${options.dateRange.end}`;
      }
      
      if (options?.count) {
        filename += `_${options.count}_records`;
      }
      
      filename += `_${timestamp}.${format}`;
      return filename;
    }
  }
  
  /**
   * Validate and sanitize customer data with fallback values
   */
  private static validateCustomerData(customer: any): any {
    const fallbacks: { [key: string]: any } = {
      name: 'Unknown Customer',
      contact_number: 'No Contact',
      email: 'no-email@example.com',
      age: 0,
      address: 'No Address Provided',
      occupation: 'Not Specified',
      distribution_info: 'pickup',
      sales_agent_name: 'No Agent Assigned',
      doctor_assigned: 'No Doctor Assigned',
      grade_type: 'Not Specified',
      lens_type: 'Not Specified',
      frame_code: 'Not Specified',
      or_number: 'No OR Number',
      remarks: 'No Remarks',
      queue_status: 'unknown',
      token_number: '000'
    };
    
    // Create validated customer with fallbacks
    const validatedCustomer: { [key: string]: any } = { ...customer };
    
    // Apply fallbacks for missing or invalid data
    Object.keys(fallbacks).forEach(key => {
      if (!validatedCustomer[key] || validatedCustomer[key] === null || validatedCustomer[key] === undefined || validatedCustomer[key] === '') {
        validatedCustomer[key] = fallbacks[key];
      }
    });
    
    // Handle complex objects with fallbacks
    if (!validatedCustomer.prescription || typeof validatedCustomer.prescription !== 'object') {
      validatedCustomer.prescription = {
        od: 'Not Specified',
        os: 'Not Specified', 
        ou: 'Not Specified',
        pd: 'Not Specified',
        add: 'Not Specified'
      };
    } else {
      validatedCustomer.prescription = {
        od: validatedCustomer.prescription.od || 'Not Specified',
        os: validatedCustomer.prescription.os || 'Not Specified',
        ou: validatedCustomer.prescription.ou || 'Not Specified', 
        pd: validatedCustomer.prescription.pd || 'Not Specified',
        add: validatedCustomer.prescription.add || 'Not Specified'
      };
    }
    
    if (!validatedCustomer.payment_info || typeof validatedCustomer.payment_info !== 'object') {
      validatedCustomer.payment_info = {
        mode: 'cash',
        amount: 0
      };
    } else {
      validatedCustomer.payment_info = {
        mode: validatedCustomer.payment_info.mode || 'cash',
        amount: validatedCustomer.payment_info.amount || 0
      };
    }
    
    if (!validatedCustomer.priority_flags || typeof validatedCustomer.priority_flags !== 'object') {
      validatedCustomer.priority_flags = {
        senior_citizen: false,
        pregnant: false,
        pwd: false
      };
    }
    
    if (!validatedCustomer.estimated_time) {
      validatedCustomer.estimated_time = { minutes: 0 };
    }
    
    return validatedCustomer;
  }
  
  /**
   * Export single customer to Excel with enhanced error handling
   */
  static async exportCustomerToExcel(customerId: number, exportId?: string): Promise<Buffer> {
    try {
      if (exportId) this.updateProgress(exportId, 10, 'Fetching customer data...');
      
      const customer = await CustomerService.findById(customerId);
      if (!customer) {
        throw new Error(`Customer with ID ${customerId} not found`);
      }
      
      // Validate and apply fallbacks
      const validatedCustomer = this.validateCustomerData(customer);
      
      if (exportId) this.updateProgress(exportId, 30, 'Preparing Excel workbook...');

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Customer Data');

      // Add headers
      const headers = [
        'Customer Name', 'Contact Number', 'Email', 'Age', 'Address',
        'Occupation', 'Distribution Method', 'Sales Agent', 'Doctor Assigned',
        'OD (Right Eye)', 'OS (Left Eye)', 'OU (Both Eyes)', 'PD (Pupillary Distance)',
        'ADD (Addition)', 'Grade Type', 'Lens Type', 'Frame Code', 'Payment Method',
        'Payment Amount', 'OR Number', 'Priority Flags', 'Remarks', 'Queue Status', 'Token Number',
        'Estimated Time (min)', 'Registration Date'
      ];

      worksheet.addRow(headers);

      if (exportId) this.updateProgress(exportId, 50, 'Formatting Excel data...');

      // Format headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4285F4' }
      };

      // Add customer data
      const rowData = this.formatCustomerData(validatedCustomer);
      worksheet.addRow(rowData);

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        column.width = 15;
      });

      if (exportId) this.updateProgress(exportId, 80, 'Generating Excel file...');

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      if (exportId) this.updateProgress(exportId, 100, 'Export completed');
      
      return Buffer.from(buffer);
    } catch (error) {
      if (exportId) this.updateProgress(exportId, -1, `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to export customer to Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export single customer to PDF
   */
  static async exportCustomerToPDF(customerId: number): Promise<Buffer> {
    const customer = await CustomerService.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
    
      // Set document properties
      doc.setProperties({
        title: `Customer Details - ${customer.name}`,
        subject: 'Customer Information',
        author: 'EscaShop Optical',
        creator: 'EscaShop System'
      });
    
      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('EscaShop Optical - Customer Details', 105, 20, { align: 'center' });
      
      // Add export date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Export Date: ${new Date().toLocaleDateString()}`, 20, 30);
      doc.text(`Customer ID: #${customer.id}`, 150, 30);
    
      // Customer info
      doc.setFontSize(12);
      let y = 45;
      const lineHeight = 8;
      
      const customerInfo = [
        `Customer Name: ${this.sanitizeTextForPDF(customer.name || '')}`,
        `Contact Number: ${this.sanitizeTextForPDF(customer.contact_number || '')}`,
        `Email: ${this.sanitizeTextForPDF(customer.email || 'N/A')}`,
        `Age: ${customer.age || 'N/A'}`,
        `Address: ${this.sanitizeTextForPDF(customer.address || '')}`,
        `Occupation: ${this.sanitizeTextForPDF(customer.occupation || 'N/A')}`,
        `Distribution Method: ${this.sanitizeTextForPDF(customer.distribution_info || '')}`,
        `Sales Agent: ${this.sanitizeTextForPDF(customer.sales_agent_name || 'N/A')}`,
        `Doctor Assigned: ${this.sanitizeTextForPDF(customer.doctor_assigned || 'N/A')}`,
        '',
        'Prescription Details:',
        `OD (Right Eye): ${this.sanitizeTextForPDF(customer.prescription?.od || 'N/A')}`,
        `OS (Left Eye): ${this.sanitizeTextForPDF(customer.prescription?.os || 'N/A')}`,
        `OU (Both Eyes): ${this.sanitizeTextForPDF(customer.prescription?.ou || 'N/A')}`,
        `PD (Pupillary Distance): ${this.sanitizeTextForPDF(customer.prescription?.pd || 'N/A')}`,
        `ADD (Addition): ${this.sanitizeTextForPDF(customer.prescription?.add || 'N/A')}`,
        `Grade Type: ${this.sanitizeTextForPDF(customer.grade_type || 'N/A')}`,
        `Lens Type: ${this.sanitizeTextForPDF(customer.lens_type || 'N/A')}`,
        `Frame Code: ${this.sanitizeTextForPDF(customer.frame_code || 'N/A')}`,
        '',
        'Payment Information:',
        `Payment Method: ${customer.payment_info?.mode ? this.formatPaymentMode(customer.payment_info.mode) : 'N/A'}`,
        `Payment Amount: ${customer.payment_info?.amount ? `PHP ${customer.payment_info.amount}` : 'N/A'}`,
        `OR Number: ${this.sanitizeTextForPDF(customer.or_number || 'N/A')}`,
        '',
        'Additional Information:',
        `Priority Flags: ${customer.priority_flags ? this.formatPriorityFlags(customer.priority_flags) : 'None'}`,
        `Remarks: ${this.sanitizeTextForPDF(customer.remarks || 'N/A')}`,
        `Queue Status: ${customer.queue_status || 'Unknown'}`,
        `Token Number: #${customer.token_number || 'N/A'}`,
        `Estimated Time: ${this.formatEstimatedTime(customer.estimated_time)}`,
        `Registration Date: ${customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}`
      ];

      customerInfo.forEach((line, index) => {
        try {
          if (line === '') {
            y += lineHeight / 2;
            return;
          }
          
          // Set font style based on content
          if (line.includes(':') && !line.startsWith('  ')) {
            if (line.endsWith(':')) {
              doc.setFont('helvetica', 'bold');
            } else {
              doc.setFont('helvetica', 'normal');
            }
          }
          
          // Ensure text fits on page
          const textWidth = doc.getTextWidth(line);
          if (textWidth > 170) { // Page width minus margins
            // Split long text into multiple lines
            const words = line.split(' ');
            let currentLine = '';
            
            for (const word of words) {
              const testLine = currentLine + (currentLine ? ' ' : '') + word;
              if (doc.getTextWidth(testLine) > 170) {
                if (currentLine) {
                  doc.text(currentLine, 20, y);
                  y += lineHeight;
                  currentLine = word;
                } else {
                  // Single word too long, truncate it
                  doc.text(word.substring(0, 50) + '...', 20, y);
                  y += lineHeight;
                  currentLine = '';
                }
              } else {
                currentLine = testLine;
              }
            }
            
            if (currentLine) {
              doc.text(currentLine, 20, y);
              y += lineHeight;
            }
          } else {
            doc.text(line, 20, y);
            y += lineHeight;
          }
          
          // Add new page if needed
          if (y > 270) {
            doc.addPage();
            y = 20;
          }
        } catch (lineError) {
          console.error(`Error processing line ${index}: "${line}"`, lineError);
          // Skip this line and continue
          y += lineHeight;
        }
      });
      
      // Add footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${i} of ${pageCount}`, 105, 285, { align: 'center' });
        doc.text('Generated by EscaShop Optical System', 105, 290, { align: 'center' });
      }

      // Use arraybuffer method - most reliable for jsPDF v3.0.1
      const arrayBuffer = doc.output('arraybuffer');
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error generating PDF for customer:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        customerId
      });
      throw new Error(`Failed to generate PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export single customer to Google Sheets
   */
  static async exportCustomerToGoogleSheets(customerId: number): Promise<any> {
    try {
      console.log(`Starting Google Sheets export for customer ID: ${customerId}`);
      
      const customer = await CustomerService.findById(customerId);
      if (!customer) {
        throw new Error('Customer not found');
      }

      if (!this.GOOGLE_SHEETS_URL) {
        throw new Error('Google Sheets URL not configured');
      }

      // Validate Google Sheets URL format
      if (!this.GOOGLE_SHEETS_URL.includes('script.google.com')) {
        throw new Error('Invalid Google Sheets URL format. Expected Google Apps Script deployment URL.');
      }

      console.log(`Sending request to Google Sheets URL: ${this.GOOGLE_SHEETS_URL}`);
      console.log(`Request payload:`, { action: 'single', customer: { id: customer.id, name: customer.name } });

      const response = await axios.post(this.GOOGLE_SHEETS_URL, {
        action: 'single',
        customer: customer
      }, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`Google Sheets API Response:`, response.status, response.data);
      
      // Check if the response indicates success
      if (response.data && response.data.success === false) {
        throw new Error(`Google Sheets API Error: ${response.data.error || 'Unknown error from Google Sheets'}`);  
      }

      return response.data;
    } catch (error) {
      console.error('Error in exportCustomerToGoogleSheets:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error('Google Sheets API Response Error:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          });
          throw new Error(`Google Sheets API Error (${error.response.status}): ${error.response.data?.error || error.response.statusText}`);
        } else if (error.request) {
          console.error('Google Sheets API Network Error:', error.message);
          throw new Error('Failed to connect to Google Sheets API. Please check your internet connection and Google Sheets URL configuration.');
        }
      }
      
      throw error instanceof Error ? error : new Error('Unknown error occurred during Google Sheets export');
    }
  }

  /**
   * Export multiple customers to Excel with memory optimization and progress tracking
   */
  static async exportCustomersToExcel(searchTerm?: string, statusFilter?: string, dateFilter?: { start: string, end: string }, exportId?: string): Promise<Buffer> {
    try {
      if (exportId) this.updateProgress(exportId, 5, 'Initializing export...');
      
      const filters = {
        searchTerm,
        status: statusFilter as any,
        startDate: dateFilter?.start ? new Date(dateFilter.start) : undefined,
        endDate: dateFilter?.end ? new Date(dateFilter.end) : undefined
      };

      // Get total count first for progress calculation
      const totalResult = await CustomerService.list(filters, 1, 0);
      const totalCustomers = totalResult.total;
      
      if (totalCustomers === 0) {
        throw new Error('No customers found matching the specified criteria');
      }
      
      if (exportId) this.updateProgress(exportId, 10, `Found ${totalCustomers} customers to export...`);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Customers');

      // Add headers
      const headers = [
        'Customer Name', 'Contact Number', 'Email', 'Age', 'Address',
        'Occupation', 'Distribution Method', 'Sales Agent', 'Doctor Assigned',
        'OD (Right Eye)', 'OS (Left Eye)', 'OU (Both Eyes)', 'PD (Pupillary Distance)',
        'ADD (Addition)', 'Grade Type', 'Lens Type', 'Frame Code', 'Payment Method',
        'Payment Amount', 'OR Number', 'Priority Flags', 'Remarks', 'Queue Status', 'Token Number',
        'Estimated Time (min)', 'Registration Date'
      ];

      worksheet.addRow(headers);

      // Format headers
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4285F4' }
      };
      
      if (exportId) this.updateProgress(exportId, 20, 'Processing customers in batches...');

      // Process customers in batches for memory efficiency
      let processedCount = 0;
      let offset = 0;
      const batchSize = this.BATCH_SIZE;
      
      while (processedCount < totalCustomers) {
        const batch = await CustomerService.list(filters, batchSize, offset);
        const batchCustomers = batch.customers;
        
        if (batchCustomers.length === 0) break;
        
        // Add customer data with validation and fallbacks
        for (const customer of batchCustomers) {
          try {
            const validatedCustomer = this.validateCustomerData(customer);
            const rowData = this.formatCustomerData(validatedCustomer);
            worksheet.addRow(rowData);
            processedCount++;
            
            // Update progress every 50 records
            if (exportId && processedCount % 50 === 0) {
              const progress = 20 + Math.floor((processedCount / totalCustomers) * 60);
              this.updateProgress(exportId, progress, `Processed ${processedCount}/${totalCustomers} customers...`);
            }
          } catch (customerError) {
            console.warn(`Error processing customer ${customer?.id}:`, customerError);
            // Continue with next customer instead of failing entire export
            processedCount++;
          }
        }
        
        offset += batchSize;
        
        // Small delay to prevent overwhelming the system
        if (offset < totalCustomers) {
          await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY));
        }
      }

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        column.width = 15;
      });
      
      if (exportId) this.updateProgress(exportId, 85, 'Generating Excel file...');

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      
      if (exportId) this.updateProgress(exportId, 100, `Export completed: ${processedCount} customers exported`);
      
      return Buffer.from(buffer);
    } catch (error) {
      if (exportId) this.updateProgress(exportId, -1, `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to export customers to Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export multiple customers to PDF with memory optimization and progress tracking
   */
  static async exportCustomersToPDF(searchTerm?: string, statusFilter?: string, dateFilter?: { start: string, end: string }, exportId?: string): Promise<Buffer> {
    try {
      if (exportId) this.updateProgress(exportId, 5, 'Initializing PDF export...');
      
      const filters = {
        searchTerm,
        status: statusFilter as any,
        startDate: dateFilter?.start ? new Date(dateFilter.start) : undefined,
        endDate: dateFilter?.end ? new Date(dateFilter.end) : undefined
      };

      // Get total count first for progress calculation
      const totalResult = await CustomerService.list(filters, 1, 0);
      const totalCustomers = totalResult.total;
      
      if (totalCustomers === 0) {
        throw new Error('No customers found matching the specified criteria');
      }
      
      if (exportId) this.updateProgress(exportId, 10, `Found ${totalCustomers} customers for PDF export...`);

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
    
      // Set document properties
      doc.setProperties({
        title: 'EscaShop Customer List',
        subject: 'Customer Export',
        author: 'EscaShop Optical',
        creator: 'EscaShop System'
      });
    
      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('EscaShop Optical - Customer List', 105, 20, { align: 'center' });
      
      // Add export date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Export Date: ${new Date().toLocaleDateString()}`, 20, 30);
      doc.text(`Total Customers: ${totalCustomers}`, 150, 30);
      
      if (exportId) this.updateProgress(exportId, 20, 'Processing customers for PDF...');
    
      let y = 45;
      const lineHeight = 7;
      const pageHeight = 290;
      
      // Headers with proper column spacing to prevent overlap
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Name', 15, y);
      doc.text('Contact', 55, y);
      doc.text('Amount', 95, y);
      doc.text('OR Number', 125, y);
      doc.text('Status', 170, y);
      y += lineHeight;
      
      // Draw header line
      doc.setLineWidth(0.5);
      doc.line(15, y, 195, y);
      y += lineHeight;
      
      // Customer data - Process in batches for memory efficiency
      let processedCount = 0;
      let offset = 0;
      const batchSize = Math.min(this.BATCH_SIZE, 50); // Smaller batch size for PDF
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      
      while (processedCount < totalCustomers) {
        const batch = await CustomerService.list(filters, batchSize, offset);
        const batchCustomers = batch.customers;
        
        if (batchCustomers.length === 0) break;
        
        for (const customer of batchCustomers) {
          try {
            // Check if we need a new page
            if (y > pageHeight - 20) {
              doc.addPage();
              y = 20;
              
              // Repeat headers on new page with consistent spacing
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(9);
              doc.text('Name', 15, y);
              doc.text('Contact', 55, y);
              doc.text('Amount', 95, y);
              doc.text('OR Number', 125, y);
              doc.text('Status', 170, y);
              y += lineHeight;
              doc.line(15, y, 195, y);
              y += lineHeight;
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(7);
            }
            
            // Validate customer data with fallbacks
            const validatedCustomer = this.validateCustomerData(customer);
            
            // Ensure all data is properly formatted and not null/undefined
            const name = this.sanitizeTextForPDF(validatedCustomer.name || 'N/A');
            const contact = this.sanitizeTextForPDF(validatedCustomer.contact_number || 'N/A');
            const amount = validatedCustomer.payment_info?.amount ? `PHP ${validatedCustomer.payment_info.amount}` : 'N/A';
            const orNumber = this.sanitizeTextForPDF(validatedCustomer.or_number || 'N/A');
            const status = this.sanitizeTextForPDF(validatedCustomer.queue_status || 'unknown');
            
            // Safely truncate text to fit columns with proper spacing
            const truncatedName = name.length > 18 ? name.substring(0, 18) + '...' : name;
            const truncatedContact = contact.length > 12 ? contact.substring(0, 12) : contact;
            const truncatedAmount = amount.length > 10 ? amount.substring(0, 10) : amount;
            const truncatedOR = orNumber.length > 20 ? orNumber.substring(0, 20) + '...' : orNumber;
            const truncatedStatus = status.length > 10 ? status.substring(0, 10) : status;
            
            // Set consistent font before each text output
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7); // Slightly smaller font for better fit
            
            // Position data to match headers exactly
            doc.text(truncatedName, 15, y);
            doc.text(truncatedContact, 55, y);
            doc.text(truncatedAmount, 95, y);
            doc.text(truncatedOR, 125, y);
            doc.text(truncatedStatus, 170, y);
            
            y += lineHeight;
            processedCount++;
            
            // Update progress every 25 records for PDF
            if (exportId && processedCount % 25 === 0) {
              const progress = 20 + Math.floor((processedCount / totalCustomers) * 65);
              this.updateProgress(exportId, progress, `Processed ${processedCount}/${totalCustomers} customers for PDF...`);
            }
            
          } catch (customerError) {
            console.warn(`Error processing customer ${customer?.id} for PDF:`, customerError);
            // Skip this row and continue
            y += lineHeight;
            processedCount++;
          }
        }
        
        offset += batchSize;
        
        // Small delay to prevent overwhelming the system
        if (offset < totalCustomers) {
          await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY));
        }
      }
      
      if (exportId) this.updateProgress(exportId, 90, 'Finalizing PDF...');
      
      // Add footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Page ${i} of ${pageCount}`, 105, 285, { align: 'center' });
        doc.text('Generated by EscaShop Optical System', 105, 290, { align: 'center' });
      }

      // Use arraybuffer method - most reliable for jsPDF v3.0.1
      const arrayBuffer = doc.output('arraybuffer');
      
      if (exportId) this.updateProgress(exportId, 100, `PDF export completed: ${processedCount} customers exported`);
      
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (exportId) this.updateProgress(exportId, -1, `PDF export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error(`Failed to export customers to PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export multiple customers to Google Sheets
   */
  static async exportCustomersToGoogleSheets(searchTerm?: string, statusFilter?: string, dateFilter?: { start: string, end: string }): Promise<any> {
    try {
      console.log('Starting bulk Google Sheets export with filters:', { searchTerm, statusFilter, dateFilter });
      
      const filters = {
        searchTerm,
        status: statusFilter as any,
        startDate: dateFilter?.start ? new Date(dateFilter.start) : undefined,
        endDate: dateFilter?.end ? new Date(dateFilter.end) : undefined
      };

      const result = await CustomerService.list(filters, 1000, 0);
      const customers = result.customers;
      
      console.log(`Found ${customers.length} customers for bulk export`);

      if (customers.length === 0) {
        throw new Error('No customers found matching the specified criteria');
      }

      if (!this.GOOGLE_SHEETS_URL) {
        throw new Error('Google Sheets URL not configured');
      }

      // Validate Google Sheets URL format
      if (!this.GOOGLE_SHEETS_URL.includes('script.google.com')) {
        throw new Error('Invalid Google Sheets URL format. Expected Google Apps Script deployment URL.');
      }

      console.log(`Sending bulk export request to Google Sheets URL: ${this.GOOGLE_SHEETS_URL}`);
      console.log(`Request payload summary:`, { 
        action: 'bulk', 
        customersCount: customers.length,
        sampleCustomer: customers.length > 0 ? { id: customers[0].id, name: customers[0].name } : null 
      });

      const response = await axios.post(this.GOOGLE_SHEETS_URL, {
        action: 'bulk',
        customers: customers
      }, {
        timeout: 60000, // 60 second timeout for bulk operations
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`Google Sheets bulk API Response:`, response.status, response.data);
      
      // Check if the response indicates success
      if (response.data && response.data.success === false) {
        throw new Error(`Google Sheets API Error: ${response.data.error || 'Unknown error from Google Sheets'}`);  
      }

      return response.data;
    } catch (error) {
      console.error('Error in exportCustomersToGoogleSheets:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error('Google Sheets bulk API Response Error:', {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          });
          throw new Error(`Google Sheets API Error (${error.response.status}): ${error.response.data?.error || error.response.statusText}`);
        } else if (error.request) {
          console.error('Google Sheets bulk API Network Error:', error.message);
          throw new Error('Failed to connect to Google Sheets API. Please check your internet connection and Google Sheets URL configuration.');
        }
      }
      
      throw error instanceof Error ? error : new Error('Unknown error occurred during bulk Google Sheets export');
    }
  }

  /**
   * Format customer data for export
   */
  private static formatCustomerData(customer: Customer): any[] {
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
      customer.prescription?.od || 'N/A',
      customer.prescription?.os || 'N/A',
      customer.prescription?.ou || 'N/A',
      customer.prescription?.pd || 'N/A',
      customer.prescription?.add || 'N/A',
      customer.grade_type || '',
      customer.lens_type || '',
      customer.frame_code || '',
      customer.payment_info?.mode ? this.formatPaymentMode(customer.payment_info.mode) : 'N/A',
      customer.payment_info?.amount ? `₱${customer.payment_info.amount}` : 'N/A',
      customer.or_number || '',
      customer.priority_flags ? this.formatPriorityFlags(customer.priority_flags) : 'None',
      customer.remarks || '',
      customer.queue_status || '',
      customer.token_number || '',
      this.formatEstimatedTime(customer.estimated_time),
      customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'
    ];
  }

  /**
   * Format payment mode for display
   */
  private static formatPaymentMode(mode: string): string {
    const labels: { [key: string]: string } = {
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
  private static formatPriorityFlags(flags: any): string {
    const priorities: string[] = [];
    if (flags.senior_citizen) priorities.push('Senior Citizen');
    if (flags.pregnant) priorities.push('Pregnant');
    if (flags.pwd) priorities.push('PWD');
    return priorities.join(', ') || 'None';
  }

  /**
   * Format estimated time for display
   */
  private static formatEstimatedTime(estimatedTime: any): string {
    if (typeof estimatedTime === 'number') {
      return `${estimatedTime} minutes`;
    }
    
    if (typeof estimatedTime === 'object' && estimatedTime !== null) {
      const parts: string[] = [];
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
   * Export selected customers to Excel
   */
  static async exportSelectedCustomersToExcel(customerIds: number[]): Promise<Buffer> {
    if (!customerIds || customerIds.length === 0) {
      throw new Error('No customers selected for export');
    }

    const customers = await this.getCustomersByIds(customerIds);
    
    if (customers.length === 0) {
      throw new Error('No customers found to export');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Selected Customers');

    // Add headers
    const headers = [
      'Customer Name', 'Contact Number', 'Email', 'Age', 'Address',
      'Occupation', 'Distribution Method', 'Sales Agent', 'Doctor Assigned',
      'OD (Right Eye)', 'OS (Left Eye)', 'OU (Both Eyes)', 'PD (Pupillary Distance)',
      'ADD (Addition)', 'Grade Type', 'Lens Type', 'Frame Code', 'Payment Method',
      'Payment Amount', 'OR Number', 'Priority Flags', 'Remarks', 'Queue Status', 'Token Number',
      'Estimated Time (min)', 'Registration Date'
    ];

    worksheet.addRow(headers);

    // Format headers
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4285F4' }
    };

    // Add customer data with memory-efficient processing
    for (const customer of customers) {
      const rowData = this.formatCustomerData(customer);
      worksheet.addRow(rowData);
    }

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Export selected customers to PDF using single-page template with proper page breaks
   */
  static async exportSelectedCustomersToPDF(customerIds: number[]): Promise<Buffer> {
    if (!customerIds || customerIds.length === 0) {
      throw new Error('No customers selected for export');
    }

    const customers = await this.getCustomersByIds(customerIds);
    
    if (customers.length === 0) {
      throw new Error('No customers found to export');
    }

    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
    
      // Set document properties
      doc.setProperties({
        title: 'EscaShop Selected Customers Export',
        subject: 'Selected Customer Export',
        author: 'EscaShop Optical',
        creator: 'EscaShop System'
      });
    
      // Process customers one by one for memory efficiency
      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        
        // Add new page for each customer (except the first one)
        if (i > 0) {
          doc.addPage();
        }
        
        this.renderSingleCustomerPage(doc, customer, i + 1, customers.length);
      }
      
      // Add footer to all pages
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(149, 165, 166);
        doc.text(`Page ${i} of ${pageCount}`, 105, 285, { align: 'center' });
        doc.text('Generated by EscaShop Optical System', 105, 290, { align: 'center' });
      }

      // Use arraybuffer method - most reliable for jsPDF v3.0.1
      const arrayBuffer = doc.output('arraybuffer');
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error generating selected customers PDF:', error);
      throw new Error(`Failed to generate PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Render a single customer's information on a page using the single-page template
   */
  private static renderSingleCustomerPage(doc: any, customer: Customer, pageNumber: number, totalCustomers: number): void {
    try {
      // Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(44, 62, 80);
      doc.text('EscaShop Optical - Customer Details', 105, 20, { align: 'center' });
      
      // Add export date and page info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(127, 140, 141);
      doc.text(`Export Date: ${new Date().toLocaleDateString()}`, 20, 30);
      doc.text(`Customer ${pageNumber} of ${totalCustomers}`, 150, 30);
      doc.text(`Customer ID: #${customer.id}`, 20, 35);
    
      // Customer info
      doc.setFontSize(12);
      let y = 50;
      const lineHeight = 8;
      
      const customerInfo = [
        `Customer Name: ${this.sanitizeTextForPDF(customer.name || '')}`,
        `Contact Number: ${this.sanitizeTextForPDF(customer.contact_number || '')}`,
        `Email: ${this.sanitizeTextForPDF(customer.email || 'N/A')}`,
        `Age: ${customer.age || 'N/A'}`,
        `Address: ${this.sanitizeTextForPDF(customer.address || '')}`,
        `Occupation: ${this.sanitizeTextForPDF(customer.occupation || 'N/A')}`,
        `Distribution Method: ${this.sanitizeTextForPDF(customer.distribution_info || '')}`,
        `Sales Agent: ${this.sanitizeTextForPDF(customer.sales_agent_name || 'N/A')}`,
        `Doctor Assigned: ${this.sanitizeTextForPDF(customer.doctor_assigned || 'N/A')}`,
        '',
        'Prescription Details:',
        `OD (Right Eye): ${this.sanitizeTextForPDF(customer.prescription?.od || 'N/A')}`,
        `OS (Left Eye): ${this.sanitizeTextForPDF(customer.prescription?.os || 'N/A')}`,
        `OU (Both Eyes): ${this.sanitizeTextForPDF(customer.prescription?.ou || 'N/A')}`,
        `PD (Pupillary Distance): ${this.sanitizeTextForPDF(customer.prescription?.pd || 'N/A')}`,
        `ADD (Addition): ${this.sanitizeTextForPDF(customer.prescription?.add || 'N/A')}`,
        `Grade Type: ${this.sanitizeTextForPDF(customer.grade_type || 'N/A')}`,
        `Lens Type: ${this.sanitizeTextForPDF(customer.lens_type || 'N/A')}`,
        `Frame Code: ${this.sanitizeTextForPDF(customer.frame_code || 'N/A')}`,
        '',
        'Payment Information:',
        `Payment Method: ${customer.payment_info?.mode ? this.formatPaymentMode(customer.payment_info.mode) : 'N/A'}`,
        `Payment Amount: ${customer.payment_info?.amount ? `PHP ${customer.payment_info.amount}` : 'N/A'}`,
        `OR Number: ${this.sanitizeTextForPDF(customer.or_number || 'N/A')}`,
        '',
        'Additional Information:',
        `Priority Flags: ${customer.priority_flags ? this.formatPriorityFlags(customer.priority_flags) : 'None'}`,
        `Remarks: ${this.sanitizeTextForPDF(customer.remarks || 'N/A')}`,
        `Queue Status: ${customer.queue_status || 'Unknown'}`,
        `Token Number: #${customer.token_number || 'N/A'}`,
        `Estimated Time: ${this.formatEstimatedTime(customer.estimated_time)}`,
        `Registration Date: ${customer.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}`
      ];

      // Set text color
      doc.setTextColor(44, 62, 80);
      
      customerInfo.forEach((line, index) => {
        try {
          if (line === '') {
            y += lineHeight / 2;
            return;
          }
          
          // Set font style based on content
          if (line.includes(':') && !line.startsWith('  ')) {
            if (line.endsWith(':')) {
              doc.setFont('helvetica', 'bold');
            } else {
              doc.setFont('helvetica', 'normal');
            }
          }
          
          // Ensure text fits on page
          const textWidth = doc.getTextWidth(line);
          if (textWidth > 170) { // Page width minus margins
            // Split long text into multiple lines
            const words = line.split(' ');
            let currentLine = '';
            
            for (const word of words) {
              const testLine = currentLine + (currentLine ? ' ' : '') + word;
              if (doc.getTextWidth(testLine) > 170) {
                if (currentLine) {
                  doc.text(currentLine, 20, y);
                  y += lineHeight;
                  currentLine = word;
                } else {
                  // Single word too long, truncate it
                  doc.text(word.substring(0, 50) + '...', 20, y);
                  y += lineHeight;
                  currentLine = '';
                }
              } else {
                currentLine = testLine;
              }
            }
            
            if (currentLine) {
              doc.text(currentLine, 20, y);
              y += lineHeight;
            }
          } else {
            doc.text(line, 20, y);
            y += lineHeight;
          }
        } catch (lineError) {
          console.error(`Error processing line ${index}: "${line}"`, lineError);
          // Skip this line and continue
          y += lineHeight;
        }
      });
    } catch (error) {
      console.error(`Error rendering customer page for customer ${customer.id}:`, error);
      // Render error message on the page instead of failing completely
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(231, 76, 60); // Red
      doc.text(`Error rendering customer ${customer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`, 20, 150);
    }
  }

  /**
   * Get customers by their IDs with memory-efficient batching
   */
  private static async getCustomersByIds(customerIds: number[]): Promise<Customer[]> {
    const batchSize = 50; // Process in batches to handle memory efficiently
    const customers: Customer[] = [];
    
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);
      const batchCustomers = await Promise.all(
        batch.map(id => CustomerService.findById(id))
      );
      
      // Filter out null/undefined customers and add to result
      const validCustomers = batchCustomers.filter((customer): customer is Customer => customer !== null);
      customers.push(...validCustomers);
      
      // Small delay between batches to prevent memory pressure
      if (i + batchSize < customerIds.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return customers;
  }

  /**
   * Sanitize text for PDF to prevent special character issues
   */
  private static sanitizeTextForPDF(text: string): string {
    if (!text) return '';
    
    return text
      .replace(/[\u2018\u2019]/g, "'")  // Replace smart quotes
      .replace(/[\u201C\u201D]/g, '"')  // Replace smart double quotes
      .replace(/[\u2013\u2014]/g, '-')  // Replace em/en dashes
      .replace(/[\u2026]/g, '...')     // Replace ellipsis
      .replace(/₱/g, 'PHP ')          // Replace peso sign with PHP
      .replace(/[^\x20-\x7E]/g, '')   // Remove other non-ASCII characters
      .trim();
  }
}
