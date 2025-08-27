-- Migration Script: Fix Transaction Amounts from Customer Payment Info
-- Purpose: Update transactions with zero or incorrect amounts to reflect customer payment_info.amount
-- Date: 2024-12-01

-- Start transaction to ensure atomicity
BEGIN;

-- Log current state before migration
SELECT 'BEFORE MIGRATION - Transactions with zero/null amounts:' as log_message;
SELECT 
    t.id,
    t.or_number,
    t.amount,
    t.balance_amount,
    t.paid_amount,
    (c.payment_info->>'amount')::numeric as customer_payment_amount,
    c.name as customer_name
FROM transactions t 
INNER JOIN customers c ON t.customer_id = c.id 
WHERE t.amount = 0 OR t.amount IS NULL OR t.balance_amount = 0 OR t.balance_amount IS NULL
ORDER BY t.created_at DESC;

-- Update transactions where amount is 0 or null, using customer payment_info.amount
UPDATE transactions 
SET 
    amount = (
        SELECT (c.payment_info->>'amount')::numeric 
        FROM customers c 
        WHERE c.id = transactions.customer_id
    ),
    balance_amount = CASE 
        WHEN paid_amount = 0 OR paid_amount IS NULL THEN 
            (SELECT (c.payment_info->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id)
        ELSE 
            (SELECT (c.payment_info->>'amount')::numeric FROM customers c WHERE c.id = transactions.customer_id) - COALESCE(paid_amount, 0)
    END,
    updated_at = CURRENT_TIMESTAMP
FROM customers c
WHERE transactions.customer_id = c.id
  AND (transactions.amount = 0 OR transactions.amount IS NULL OR transactions.balance_amount = 0 OR transactions.balance_amount IS NULL)
  AND c.payment_info->>'amount' IS NOT NULL
  AND (c.payment_info->>'amount')::numeric > 0;

-- Log how many records were updated
SELECT 'MIGRATION COMPLETED - Records updated:' as log_message;
SELECT COUNT(*) as updated_records 
FROM transactions t 
INNER JOIN customers c ON t.customer_id = c.id 
WHERE t.amount > 0 AND t.balance_amount > 0;

-- Verify the fix worked by showing updated transactions
SELECT 'AFTER MIGRATION - Fixed transactions:' as log_message;
SELECT 
    t.id,
    t.or_number,
    t.amount,
    t.balance_amount,
    t.paid_amount,
    t.payment_status,
    (c.payment_info->>'amount')::numeric as customer_payment_amount,
    c.name as customer_name
FROM transactions t 
INNER JOIN customers c ON t.customer_id = c.id 
WHERE t.amount > 0 
ORDER BY t.updated_at DESC, t.created_at DESC 
LIMIT 20;

-- Check for any remaining zero-amount transactions that couldn't be fixed
SELECT 'REMAINING ISSUES - Transactions still with zero amounts:' as log_message;
SELECT 
    t.id,
    t.or_number,
    t.amount,
    t.balance_amount,
    (c.payment_info->>'amount')::numeric as customer_payment_amount,
    c.name as customer_name,
    CASE 
        WHEN c.payment_info->>'amount' IS NULL THEN 'Customer payment_info.amount is NULL'
        WHEN (c.payment_info->>'amount')::numeric = 0 THEN 'Customer payment_info.amount is 0'
        ELSE 'Other issue'
    END as issue_reason
FROM transactions t 
INNER JOIN customers c ON t.customer_id = c.id 
WHERE (t.amount = 0 OR t.amount IS NULL)
ORDER BY t.created_at DESC;

COMMIT;

-- Summary report
SELECT 
    'MIGRATION SUMMARY' as report_type,
    COUNT(*) as total_transactions,
    COUNT(CASE WHEN amount > 0 THEN 1 END) as transactions_with_amount,
    COUNT(CASE WHEN amount = 0 OR amount IS NULL THEN 1 END) as transactions_still_zero,
    AVG(amount) as average_transaction_amount
FROM transactions;
