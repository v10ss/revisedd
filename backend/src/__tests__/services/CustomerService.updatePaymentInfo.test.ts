import { CustomerService } from '../../services/customer';
import { pool } from '../../config/database';
import { PaymentMode, PaymentStatus } from '../../types';

describe('CustomerService.update - payment_info merge and sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('merges partial payment_info update and syncs latest non-paid transaction', async () => {
    // Stub database query sequence via spy
    const spy = jest.spyOn(pool, 'query') as unknown as jest.MockedFunction<any>;
    spy
      // findById SELECT
      .mockResolvedValueOnce({ rows: [ { id: 1, payment_info: { amount: 1500, mode: 'gcash' } } ] } as any)
      // UPDATE customers RETURNING *
      .mockResolvedValueOnce({ rows: [ { id: 1, payment_info: JSON.stringify({ amount: 1500, mode: 'credit_card' }) } ] } as any)
      // sync: SELECT latest UNPAID/PARTIAL transaction
      .mockResolvedValueOnce({ rows: [ { id: 999, paid_amount: 200 } ] } as any)
      // sync: SELECT payment_info after update
      .mockResolvedValueOnce({ rows: [ { payment_info: { amount: 1500, mode: 'credit card' } } ] } as any)
      // sync: UPDATE transactions
      .mockResolvedValueOnce({ rowCount: 1, rows: [] } as any);

    await CustomerService.update(1, { payment_info: { mode: 'CREDIT CARD' } as any });

    // Verify UPDATE transactions called with normalized values
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+transactions/i),
      [
        1500,
        PaymentMode.CREDIT_CARD,
        1300,
        PaymentStatus.PARTIAL,
        999
      ]
    );
  });

  it('normalizes amount and payment_mode when updating payment_info', async () => {
    const spy = jest.spyOn(pool, 'query') as unknown as jest.MockedFunction<any>;
    // existing has no payment_info
    spy
      // findById
      .mockResolvedValueOnce({ rows: [ { id: 1, payment_info: {} } ] } as any)
      // UPDATE customers RETURNING * (we just need to capture the value passed into UPDATE)
      .mockResolvedValueOnce({ rows: [ { id: 1, payment_info: JSON.stringify({ amount: 1200, mode: 'bank_transfer' }) } ] } as any)
      // sync: SELECT latest UNPAID/PARTIAL transaction (none -> no sync)
      .mockResolvedValueOnce({ rows: [] } as any);

    await CustomerService.update(1, { payment_info: { amount: '₱1,200', mode: 'bank transfer' } as any });

    // Verify UPDATE customers called with JSON string containing normalized values
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE\s+customers/i),
      expect.arrayContaining([
        expect.stringContaining('"amount":1200'),
      ])
    );
  });
});
