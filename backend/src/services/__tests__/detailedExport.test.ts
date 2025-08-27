import { DetailedExportService } from '../detailedExport';
import { CustomerService } from '../customer';
import { DistributionType, PaymentMode, QueueStatus } from '../../types';

// Mock CustomerService
jest.mock('../customer');
const mockCustomerService = CustomerService as jest.Mocked<typeof CustomerService>;

describe('DetailedExportService', () => {
  const mockCustomer = {
    id: 1,
    name: 'John Doe',
    contact_number: '09123456789',
    email: 'john.doe@example.com',
    age: 30,
    address: '123 Main Street, Manila',
    occupation: 'Engineer',
    distribution_info: DistributionType.PICKUP,
    sales_agent_name: 'Agent Smith',
    doctor_assigned: 'Dr. Johnson',
    prescription: {
      od: '-2.00',
      os: '-1.50',
      ou: 'N/A',
      pd: '32',
      add: '+1.00'
    },
    grade_type: 'Progressive',
    lens_type: 'Anti-reflective',
    frame_code: 'FR-001',
    payment_info: {
      mode: PaymentMode.CASH,
      amount: 5000
    },
    or_number: 'OR-2024-001',
    queue_status: QueueStatus.WAITING,
    token_number: 101,
    priority_flags: {
      senior_citizen: false,
      pregnant: false,
      pwd: false
    },
    estimated_time: {
      days: 0,
      hours: 2,
      minutes: 30
    },
    remarks: 'Customer prefers blue frames',
    created_at: new Date('2024-01-15T10:30:00'),
    updated_at: new Date('2024-01-15T10:30:00'),
    sales_agent_id: 1
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportCustomersToDetailedPDF', () => {
    it('should generate PDF buffer for single customer', async () => {
      // Mock CustomerService.list to return test customer
      mockCustomerService.list.mockResolvedValue({
        customers: [mockCustomer],
        total: 1
      });

      const result = await DetailedExportService.exportCustomersToDetailedPDF();
      
      expect(result).toBeInstanceOf(Buffer);
      expect(mockCustomerService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: undefined,
          status: undefined,
          startDate: undefined,
          endDate: undefined
        }),
        1000,
        0
      );
    });

    it('should handle search filters correctly', async () => {
      mockCustomerService.list.mockResolvedValue({
        customers: [mockCustomer],
        total: 1
      });

      await DetailedExportService.exportCustomersToDetailedPDF(
        'John',
        'waiting',
        { start: '2024-01-01', end: '2024-01-31' }
      );
      
      expect(mockCustomerService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          searchTerm: 'John',
          status: 'waiting',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31')
        }),
        1000,
        0
      );
    });

    it('should throw error when no customers found', async () => {
      mockCustomerService.list.mockResolvedValue({
        customers: [],
        total: 0
      });

      await expect(
        DetailedExportService.exportCustomersToDetailedPDF()
      ).rejects.toThrow('No customers found to export');
    });

    it('should handle multiple customers', async () => {
      const customers = [
        mockCustomer,
        { ...mockCustomer, id: 2, name: 'Jane Smith', or_number: 'OR-2024-002' }
      ];

      mockCustomerService.list.mockResolvedValue({
        customers,
        total: 2
      });

      const result = await DetailedExportService.exportCustomersToDetailedPDF();
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle customer with minimal data', async () => {
      const minimalCustomer = {
        id: 3,
        name: 'Minimal Customer',
        contact_number: '09999999999',
        email: '',
        age: null,
        address: '',
        occupation: null,
        distribution_info: null as any,
        sales_agent_name: null,
        doctor_assigned: null,
        prescription: {},
        grade_type: null,
        lens_type: null,
        frame_code: null,
        payment_info: null,
        or_number: '',
        queue_status: null,
        token_number: null,
        priority_flags: null,
        estimated_time: null,
        remarks: null,
        created_at: null,
        updated_at: null,
        sales_agent_id: 1
      };

      mockCustomerService.list.mockResolvedValue({
        customers: [minimalCustomer as any],
        total: 1
      });

      const result = await DetailedExportService.exportCustomersToDetailedPDF();
      
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle customer with long text fields', async () => {
      const longTextCustomer = {
        ...mockCustomer,
        address: 'Very long address that might wrap to multiple lines and test the word wrapping functionality of the PDF generation system which should handle this gracefully',
        remarks: 'This is a very long remarks field that contains multiple sentences and should test the text wrapping functionality. It includes various details about the customer preferences and special instructions that might be quite lengthy and need proper formatting in the PDF document.'
      };

      mockCustomerService.list.mockResolvedValue({
        customers: [longTextCustomer],
        total: 1
      });

      const result = await DetailedExportService.exportCustomersToDetailedPDF();
      
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('text processing utilities', () => {
    it('should sanitize text for PDF', () => {
      // Access private method for testing via any type
      const service = DetailedExportService as any;
      
      const input = 'Text with "smart quotes" and —dashes— and ₱peso';
      const result = service.sanitizeTextForPDF(input);
      
      expect(result).toBe('Text with "smart quotes" and -dashes- and PHP peso');
    });

    it('should format payment modes correctly', () => {
      const service = DetailedExportService as any;
      
      expect(service.formatPaymentMode('gcash')).toBe('GCash');
      expect(service.formatPaymentMode('maya')).toBe('Maya');
      expect(service.formatPaymentMode('cash')).toBe('Cash');
      expect(service.formatPaymentMode('unknown')).toBe('unknown');
    });

    it('should format priority flags correctly', () => {
      const service = DetailedExportService as any;
      
      const flags1 = { senior_citizen: true, pregnant: false, pwd: true };
      expect(service.formatPriorityFlags(flags1)).toBe('Senior Citizen, PWD');
      
      const flags2 = { senior_citizen: false, pregnant: true, pwd: false };
      expect(service.formatPriorityFlags(flags2)).toBe('Pregnant');
      
      const flags3 = { senior_citizen: false, pregnant: false, pwd: false };
      expect(service.formatPriorityFlags(flags3)).toBe('None');
      
      expect(service.formatPriorityFlags(null)).toBe('None');
    });

    it('should format queue status correctly', () => {
      const service = DetailedExportService as any;
      
      expect(service.formatQueueStatus('waiting')).toBe('Waiting in Queue');
      expect(service.formatQueueStatus('serving')).toBe('Currently Being Served');
      expect(service.formatQueueStatus('processing')).toBe('Order in Processing');
      expect(service.formatQueueStatus('completed')).toBe('Order Completed');
      expect(service.formatQueueStatus('cancelled')).toBe('Order Cancelled');
      expect(service.formatQueueStatus(null)).toBe('Unknown');
    });

    it('should format estimated time correctly', () => {
      const service = DetailedExportService as any;
      
      expect(service.formatEstimatedTime(30)).toBe('30 minutes');
      
      const timeObj1 = { days: 1, hours: 2, minutes: 30 };
      expect(service.formatEstimatedTime(timeObj1)).toBe('1 day, 2 hours, 30 minutes');
      
      const timeObj2 = { days: 0, hours: 0, minutes: 15 };
      expect(service.formatEstimatedTime(timeObj2)).toBe('15 minutes');
      
      const timeObj3 = { days: 0, hours: 0, minutes: 0 };
      expect(service.formatEstimatedTime(timeObj3)).toBe('0 minutes');
      
      expect(service.formatEstimatedTime(null)).toBe('0 minutes');
      expect(service.formatEstimatedTime('')).toBe('0 minutes');
    });
  });
});
