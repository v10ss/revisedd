import { TransactionService } from '../../services/transaction';
import { pool } from '../../config/database';
import { PaymentMode } from '../../types';

// Mock DB and WebSocket side-effects
jest.mock('../../config/database');
jest.mock('../../services/websocket', () => ({
  WebSocketService: {
    emitTransactionUpdate: jest.fn(),
    emitPaymentStatusUpdate: jest.fn(),
  }
}));

const mockPool = pool as unknown as jest.Mocked<typeof pool>;

describe('TransactionService.create - normalization and fallbacks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to customer.payment_info amount and normalizes payment_mode', async () => {
    // SELECT customer payment_info
    (mockPool.query as unknown as jest.MockedFunction<any>)
      .mockResolvedValueOnce({ rows: [ { payment_info: { amount: '1,500', mode: 'gcash' } } ] } as any)
      // INSERT transactions returning *
      .mockResolvedValueOnce({ rows: [ { id: 111, amount: 1500, payment_mode: 'bank_transfer' } ] } as any);

    await TransactionService.create({
      customer_id: 123,
      or_number: 'OR-001',
      amount: 0, // triggers fallback
      payment_mode: 'bank transfer' as any, // will be normalized
      sales_agent_id: 77,
      cashier_id: 88,
    });

    // Second call is the INSERT; verify values
    const calls = (mockPool.query as jest.Mock).mock.calls;
    const insertCall = calls[1];
    const sql = insertCall[0] as string;
    const params = insertCall[1] as any[];

    expect(/INSERT\s+INTO\s+transactions/i.test(sql)).toBe(true);
    expect(params).toEqual([
      123,           // customer_id
      'OR-001',      // or_number
      1500,          // finalAmount normalized from '1,500'
      PaymentMode.BANK_TRANSFER, // finalPaymentMode normalized
      77,            // sales_agent_id
      88             // cashier_id
    ]);
  });
});
