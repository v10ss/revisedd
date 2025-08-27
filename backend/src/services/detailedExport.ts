import { jsPDF } from 'jspdf';
import { CustomerService } from './customer';
import { Customer } from '../types';

export class DetailedExportService {
  /**
   * Export multiple customers to PDF with detailed layout - one customer per page
   */
  static async exportCustomersToDetailedPDF(searchTerm?: string, statusFilter?: string, dateFilter?: { start: string, end: string }): Promise<Buffer> {
    const filters = {
      searchTerm,
      status: statusFilter as any,
      startDate: dateFilter?.start ? new Date(dateFilter.start) : undefined,
      endDate: dateFilter?.end ? new Date(dateFilter.end) : undefined
    };

    const result = await CustomerService.list(filters, 1000, 0);
    const customers = result.customers;

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
        title: 'EscaShop Customer Export - Detailed',
        subject: 'Customer Bulk Export',
        author: 'EscaShop Optical',
        creator: 'EscaShop System'
      });

      customers.forEach((customer, index) => {
        // Add new page for each customer (except the first one)
        if (index > 0) {
          doc.addPage();
        }
        
        this.renderCustomerDetailPage(doc, customer, index + 1, customers.length);
      });

      // Use arraybuffer method - most reliable for jsPDF v3.0.1
      const arrayBuffer = doc.output('arraybuffer');
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error generating detailed bulk PDF for customers:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Failed to generate detailed PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Render a single customer's detailed information on a page
   */
  private static renderCustomerDetailPage(doc: any, customer: Customer, pageNumber: number, totalCustomers: number): void {
    try {
      // Page margins
      const leftMargin = 20;
      const rightMargin = 190;
      const topMargin = 20;
      let currentY = topMargin;
      const lineHeight = 7;
      const sectionSpacing = 10;
      const fieldSpacing = 5;

      // Header Section
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(44, 62, 80); // Dark blue-gray
      doc.text('EscaShop Optical', leftMargin, currentY);
      currentY += 8;
      
      doc.setFontSize(14);
      doc.setTextColor(127, 140, 141); // Gray
      doc.text('Customer Information Report', leftMargin, currentY);
      currentY += sectionSpacing;

      // Customer header with ID and page info
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(52, 152, 219); // Blue
      doc.text(`Customer #${customer.id}`, leftMargin, currentY);
      
      // Page counter on the right
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(149, 165, 166);
      const pageText = `Page ${pageNumber} of ${totalCustomers}`;
      const pageTextWidth = doc.getTextWidth(pageText);
      doc.text(pageText, rightMargin - pageTextWidth, currentY);
      
      // Export date on the right
      const exportDate = `Exported: ${new Date().toLocaleDateString()}`;
      const exportDateWidth = doc.getTextWidth(exportDate);
      doc.text(exportDate, rightMargin - exportDateWidth, currentY - 10);
      
      currentY += sectionSpacing;

      // Draw separator line
      doc.setDrawColor(189, 195, 199);
      doc.setLineWidth(0.5);
      doc.line(leftMargin, currentY, rightMargin, currentY);
      currentY += sectionSpacing;

      // Customer Basic Information Section
      currentY = this.renderSection(doc, 'Customer Details', [
        { label: 'Full Name', value: customer.name || 'N/A' },
        { label: 'Contact Number', value: customer.contact_number || 'N/A' },
        { label: 'Email Address', value: customer.email || 'N/A' },
        { label: 'Age', value: customer.age ? customer.age.toString() : 'N/A' },
        { label: 'Address', value: customer.address || 'N/A' },
        { label: 'Occupation', value: customer.occupation || 'N/A' },
        { label: 'Distribution Method', value: this.formatDistributionType(customer.distribution_info) },
        { label: 'Sales Agent', value: customer.sales_agent_name || 'N/A' },
        { label: 'Doctor Assigned', value: customer.doctor_assigned || 'N/A' }
      ], currentY, leftMargin, lineHeight, fieldSpacing, sectionSpacing);

      // Prescription Details Section
      currentY = this.renderSection(doc, 'Prescription Details', [
        { label: 'OD (Right Eye)', value: customer.prescription?.od || 'N/A' },
        { label: 'OS (Left Eye)', value: customer.prescription?.os || 'N/A' },
        { label: 'OU (Both Eyes)', value: customer.prescription?.ou || 'N/A' },
        { label: 'PD (Pupillary Distance)', value: customer.prescription?.pd || 'N/A' },
        { label: 'ADD (Addition)', value: customer.prescription?.add || 'N/A' },
        { label: 'Grade Type', value: customer.grade_type || 'N/A' },
        { label: 'Lens Type', value: customer.lens_type || 'N/A' },
        { label: 'Frame Code', value: customer.frame_code || 'N/A' }
      ], currentY, leftMargin, lineHeight, fieldSpacing, sectionSpacing);

      // Payment Information Section
      currentY = this.renderSection(doc, 'Payment Information', [
        { label: 'Payment Method', value: customer.payment_info?.mode ? this.formatPaymentMode(customer.payment_info.mode) : 'N/A' },
        { label: 'Payment Amount', value: customer.payment_info?.amount ? `PHP ${customer.payment_info.amount.toLocaleString()}` : 'N/A' },
        { label: 'OR Number', value: customer.or_number || 'N/A' }
      ], currentY, leftMargin, lineHeight, fieldSpacing, sectionSpacing);

      // Queue and Status Information Section
      currentY = this.renderSection(doc, 'Queue & Status Information', [
        { label: 'Current Status', value: this.formatQueueStatus(customer.queue_status) },
        { label: 'Token Number', value: customer.token_number ? `#${customer.token_number}` : 'N/A' },
        { label: 'Estimated Time', value: this.formatEstimatedTime(customer.estimated_time) },
        { label: 'Priority Flags', value: this.formatPriorityFlags(customer.priority_flags) },
        { label: 'Registration Date', value: customer.created_at ? new Date(customer.created_at).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : 'N/A' }
      ], currentY, leftMargin, lineHeight, fieldSpacing, sectionSpacing);

      // Additional Notes Section (if remarks exist)
      if (customer.remarks && customer.remarks.trim()) {
        currentY = this.renderSection(doc, 'Additional Notes', [
          { label: 'Remarks', value: customer.remarks, isLongText: true }
        ], currentY, leftMargin, lineHeight, fieldSpacing, sectionSpacing);
      }

      // Footer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(149, 165, 166);
      const footerY = 285;
      doc.text('Generated by EscaShop Optical Management System', leftMargin, footerY);
      
      const timestamp = new Date().toLocaleString();
      const timestampWidth = doc.getTextWidth(`Generated on: ${timestamp}`);
      doc.text(`Generated on: ${timestamp}`, rightMargin - timestampWidth, footerY);

    } catch (error) {
      console.error(`Error rendering customer detail page for customer ${customer.id}:`, error);
      // Render error message on the page instead of failing completely
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(231, 76, 60); // Red
      doc.text(`Error rendering customer ${customer.id}: ${error instanceof Error ? error.message : 'Unknown error'}`, 20, 150);
    }
  }

  /**
   * Render a section with title and field-value pairs
   */
  private static renderSection(
    doc: any, 
    title: string, 
    fields: Array<{ label: string; value: string; isLongText?: boolean }>,
    startY: number,
    leftMargin: number,
    lineHeight: number,
    fieldSpacing: number,
    sectionSpacing: number
  ): number {
    let currentY = startY;
    
    // Section title
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(44, 62, 80);
    doc.text(title, leftMargin, currentY);
    currentY += lineHeight;
    
    // Section underline
    doc.setDrawColor(52, 152, 219);
    doc.setLineWidth(0.3);
    const titleWidth = doc.getTextWidth(title);
    doc.line(leftMargin, currentY - 1, leftMargin + titleWidth, currentY - 1);
    currentY += fieldSpacing;

    // Field-value pairs
    doc.setFontSize(9);
    fields.forEach(field => {
      const sanitizedLabel = this.sanitizeTextForPDF(field.label);
      const sanitizedValue = this.sanitizeTextForPDF(field.value);
      
      // Label (bold)
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(52, 73, 94);
      doc.text(`${sanitizedLabel}:`, leftMargin, currentY);
      
      // Value (normal)
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(44, 62, 80);
      
      const labelWidth = doc.getTextWidth(`${sanitizedLabel}: `);
      const valueStartX = leftMargin + labelWidth;
      const availableWidth = 170 - labelWidth; // Remaining width for value
      
      if (field.isLongText || doc.getTextWidth(sanitizedValue) > availableWidth) {
        // Handle long text with word wrapping
        const lines = doc.splitTextToSize(sanitizedValue, availableWidth);
        lines.forEach((line: string, index: number) => {
          if (index === 0) {
            doc.text(line, valueStartX, currentY);
          } else {
            currentY += lineHeight;
            doc.text(line, valueStartX, currentY);
          }
        });
      } else {
        doc.text(sanitizedValue, valueStartX, currentY);
      }
      
      currentY += lineHeight;
    });
    
    return currentY + sectionSpacing;
  }

  /**
   * Format distribution type for display
   */
  private static formatDistributionType(distributionInfo: any): string {
    if (!distributionInfo) return 'N/A';
    
    const labels: { [key: string]: string } = {
      'lalamove': 'Lalamove Delivery',
      'lbc': 'LBC Shipping',
      'pickup': 'Store Pickup'
    };
    
    return labels[distributionInfo] || distributionInfo;
  }

  /**
   * Format queue status for display
   */
  private static formatQueueStatus(status: any): string {
    if (!status) return 'Unknown';
    
    const labels: { [key: string]: string } = {
      'waiting': 'Waiting in Queue',
      'serving': 'Currently Being Served',
      'processing': 'Order in Processing',
      'completed': 'Order Completed',
      'cancelled': 'Order Cancelled'
    };
    
    return labels[status] || status;
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
    if (!flags) return 'None';
    
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
   * Export selected customers to detailed PDF - one customer per page
   */
  static async exportSelectedCustomersToDetailedPDF(customerIds: number[]): Promise<Buffer> {
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
        title: 'EscaShop Selected Customers - Detailed Export',
        subject: 'Selected Customer Bulk Export',
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
        
        this.renderCustomerDetailPage(doc, customer, i + 1, customers.length);
        
        // Small delay between customers to prevent memory pressure for large exports
        if (i < customers.length - 1 && customers.length > 20) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }

      // Use arraybuffer method - most reliable for jsPDF v3.0.1
      const arrayBuffer = doc.output('arraybuffer');
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error generating detailed bulk PDF for selected customers:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        customerCount: customers.length
      });
      throw new Error(`Failed to generate detailed PDF file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get customers by their IDs with memory-efficient batching
   */
  private static async getCustomersByIds(customerIds: number[]): Promise<Customer[]> {
    const batchSize = 25; // Smaller batch size for detailed export due to higher memory usage per customer
    const customers: Customer[] = [];
    
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);
      const batchCustomers = await Promise.all(
        batch.map(id => CustomerService.findById(id))
      );
      
      // Filter out null/undefined customers and add to result
      const validCustomers = batchCustomers.filter((customer): customer is Customer => customer !== null);
      customers.push(...validCustomers);
      
      // Longer delay between batches for detailed export to manage memory
      if (i + batchSize < customerIds.length) {
        await new Promise(resolve => setTimeout(resolve, 25));
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
