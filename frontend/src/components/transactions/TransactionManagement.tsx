import React, { useState, useEffect, useCallback } from 'react';
import { 
  Typography, 
  Box, 
  Card, 
  CardContent, 
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  useTheme,
  useMediaQuery,
  Stack,
  CircularProgress,
  Alert,
  Snackbar,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination
} from '@mui/material';
import { 
  Receipt as ReceiptIcon, 
  Refresh as RefreshIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { apiGet } from '../../utils/api';

interface Transaction {
  id: number;
  or_number: string;
  amount: number;
  payment_mode: string;
  transaction_date: string;
  customer_name: string;
  cashier_name?: string;
  sales_agent_name?: string;
  created_at: string;
}

interface TransactionResponse {
  transactions: Transaction[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

const TransactionManagement: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const DEBUG_TRANSACTIONS = process.env.NODE_ENV !== 'production';
  
  // State management
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentModeFilter, setPaymentModeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error'
  });

  // Fetch transactions from API
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '10',
        ...(searchTerm && { search: searchTerm }),
        ...(paymentModeFilter && { paymentMode: paymentModeFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate })
      });
      
      const response = await apiGet(`/transactions?${params}`);
      
      if (response.ok) {
        const data: TransactionResponse = await response.json();
        
        // Debug raw API data (non-production only)
        if (DEBUG_TRANSACTIONS) {
          console.log('[TM_DEBUG] Raw transaction API response:', data);
          const tx0: any = data.transactions?.[0];
          if (tx0) {
            console.log('[TM_DEBUG] First transaction raw keys:', Object.keys(tx0));
            console.log('[TM_DEBUG] First transaction fields:', {
              id: tx0.id,
              amount: tx0.amount,
              payment_mode: tx0.payment_mode,
              paid_amount: tx0.paid_amount,
              balance_amount: tx0.balance_amount,
              amountType: typeof tx0.amount,
              paymentModeType: typeof tx0.payment_mode
            });
          } else {
            console.log('[TM_DEBUG] No transactions returned');
          }
        }
        
        // FIX: Process transactions to handle backend data inconsistencies
        const processedTransactions = data.transactions.map((tx: any) => ({
          ...tx,
          id: Number(tx.id),
          amount: parseFloat(String(tx.amount || '0')),
          payment_mode: tx.payment_mode ? String(tx.payment_mode).toLowerCase() : 'cash',
          customer_name: tx.customer_name || 'N/A',
          or_number: tx.or_number || 'N/A',
          transaction_date: tx.transaction_date || tx.created_at,
        }));
        
        // Debug processed data (non-production only)
        if (DEBUG_TRANSACTIONS) {
          const sample = processedTransactions[0];
          const zeroAmounts = processedTransactions.filter(t => Number(t.amount) === 0).length;
          const cashDefaults = processedTransactions.filter(t => (t.payment_mode || '').toString().toLowerCase() === 'cash').length;
          const rawNonzeroCount = Array.isArray(data.transactions)
            ? data.transactions.filter((tx: any) => {
                const raw = tx.amount ?? tx.total_amount ?? tx.totalAmount ?? 0;
                const num = Number(typeof raw === 'string' ? raw.replace(/[₱$,\s]/g, '') : raw);
                return !isNaN(num) && num > 0;
              }).length
            : 0;
          console.log('[TM_DEBUG] Sample processed transaction:', sample);
          console.log(`[TM_DEBUG] Processed count=${processedTransactions.length}, zeroAmounts=${zeroAmounts}, cashModes=${cashDefaults}, rawNonzeroCount=${rawNonzeroCount}`);
          if (zeroAmounts > 0 && rawNonzeroCount > 0) {
            console.warn('[TM_DEBUG] Detected zero amounts in processed data while raw had non-zero values. Check mapping logic/field names.');
          }
        }
        
        setTransactions(processedTransactions);
        setTotalPages(data.pagination.total_pages);
        setTotalTransactions(data.pagination.total);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch transactions');
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch transactions';
      setError(errorMessage);
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm, paymentModeFilter, startDate, endDate]);

  // Initial load and refresh on dependencies
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, paymentModeFilter, startDate, endDate]);

  const getPaymentModeLabel = (mode: string) => {
    switch (mode.toLowerCase()) {
      case 'gcash': return 'GCash';
      case 'maya': return 'Maya';
      case 'bank_transfer': return 'Bank Transfer';
      case 'credit_card': return 'Credit Card';
      case 'cash': return 'Cash';
      default: return mode.charAt(0).toUpperCase() + mode.slice(1);
    }
  };

  const getPaymentModeColor = (mode: string) => {
    switch (mode.toLowerCase()) {
      case 'gcash': return 'primary';
      case 'maya': return 'secondary';
      case 'bank_transfer': return 'info';
      case 'credit_card': return 'warning';
      case 'cash': return 'success';
      default: return 'default';
    }
  };

  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    setCurrentPage(value);
  };

  const handleRefresh = () => {
    fetchTransactions();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const paymentModes = ['gcash', 'maya', 'bank_transfer', 'credit_card', 'cash'];

  const renderMobileTransactionCard = (transaction: any) => (
    <Card key={transaction.id} sx={{ mb: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="h6" component="div">
              {transaction.or_number}
            </Typography>
            <Chip 
              label={getPaymentModeLabel(transaction.payment_mode)}
              color={getPaymentModeColor(transaction.payment_mode) as any}
              size="small"
            />
          </Box>
          
          <Box>
            <Typography variant="body2" color="text.secondary">
              Customer
            </Typography>
            <Typography variant="body1">
              {transaction.customer_name}
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Amount
              </Typography>
              <Typography variant="h6" color="primary">
                ₱{transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" color="text.secondary">
                Date
              </Typography>
              <Typography variant="body1">
                {formatDate(transaction.created_at || transaction.transaction_date)}
              </Typography>
            </Box>
          </Box>
          
          {(transaction.cashier_name || transaction.sales_agent_name) && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                {transaction.cashier_name ? 'Cashier' : 'Sales Agent'}
              </Typography>
              <Typography variant="body1">
                {transaction.cashier_name || transaction.sales_agent_name}
              </Typography>
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <Box sx={{ p: 2 }}>
        <Typography 
          variant="h4" 
          gutterBottom
          sx={{ 
            fontSize: { xs: '1.5rem', sm: '2.125rem' },
            fontWeight: 400,
            lineHeight: 1.235
          }}
        >
          Transaction Management
        </Typography>

        {/* Filters and Actions */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction={isMobile ? 'column' : 'row'} spacing={2} alignItems="center">
              <TextField
                label="Search by OR Number or Customer"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                }}
                sx={{ minWidth: 250 }}
              />
              
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Payment Mode</InputLabel>
                <Select
                  value={paymentModeFilter}
                  onChange={(e) => setPaymentModeFilter(e.target.value)}
                  label="Payment Mode"
                >
                  <MenuItem value="">All</MenuItem>
                  {paymentModes.map((mode) => (
                    <MenuItem key={mode} value={mode}>
                      {getPaymentModeLabel(mode)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <TextField
                label="Start Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              
              <TextField
                label="End Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              
              <Button 
                variant="outlined" 
                startIcon={<RefreshIcon />} 
                onClick={handleRefresh}
                disabled={loading}
              >
                Refresh
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

      {/* Transactions */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Transactions {totalTransactions > 0 && `(${totalTransactions} total)`}
            </Typography>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : isMobile ? (
            // Mobile view - Cards
            <Box>
              {transactions.map(renderMobileTransactionCard)}
            </Box>
          ) : (
            // Desktop view - Table
            <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>OR Number</TableCell>
                    <TableCell>Customer Name</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Payment Mode</TableCell>
                    <TableCell>Transaction Date</TableCell>
                    {!isMobile && <TableCell>Staff</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{transaction.or_number}</TableCell>
                      <TableCell>{transaction.customer_name}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                          ₱{transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={getPaymentModeLabel(transaction.payment_mode)}
                          color={getPaymentModeColor(transaction.payment_mode) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatDate(transaction.created_at || transaction.transaction_date)}</TableCell>
                      {!isMobile && (
                        <TableCell>
                          {transaction.cashier_name || transaction.sales_agent_name || 'N/A'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {transactions.length === 0 && !loading && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <ReceiptIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                {error ? 'Unable to load transactions' : 'No transactions found'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {error ? 'Please try refreshing the page' : 'Transactions will appear here once recorded'}
              </Typography>
            </Box>
          )}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </CardContent>
      </Card>
      
      {/* Snackbar for notifications */}
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
      >
        <Alert 
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
      </Box>
    </div>
  );
};

export default TransactionManagement;
