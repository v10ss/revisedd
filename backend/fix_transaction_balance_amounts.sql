-- Fix balance_amount for existing transactions
-- This script calculates and sets the correct balance_amount for all transactions

-- Update all transactions to have correct balance_amount
-- balance_amount = amount - paid_amount
UPDATE transactions 
SET balance_amount = COALESCE(amount, 0) - COALESCE(paid_amount, 0)
WHERE balance_amount IS NULL 
   OR balance_amount = 0 
   OR balance_amount != (COALESCE(amount, 0) - COALESCE(paid_amount, 0));

-- Verify the fix by showing a sample of corrected transactions
SELECT 
    id,
    or_number,
    amount,
    paid_amount,
    balance_amount,
    payment_status,
    CASE 
        WHEN balance_amount = (amount - paid_amount) THEN '✅ Correct'
        ELSE '❌ Incorrect'
    END as balance_status
FROM transactions 
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 10;
