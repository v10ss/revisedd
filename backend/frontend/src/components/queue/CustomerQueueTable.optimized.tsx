import React, { useState, useMemo, useCallback } from 'react';
import { QueueStatus, QueueItem, Customer } from '../../types/queue';

interface CustomerQueueTableProps {
  queueItems: QueueItem[];
  isLoading?: boolean;
  onCallCustomer?: (customerId: number) => void;
  onMarkAsProcessing?: (customerId: number) => void;
  onCompleteService?: (customerId: number) => void;
  onCancelService?: (customerId: number) => void;
  userRole?: string;
  className?: string;
}

// ✅ OPTIMIZED: Memoized Priority Indicator component
const PriorityIndicator = React.memo<{ customer: Customer }>(({ customer }) => {
  const priorityTypes = useMemo(() => {
    const types = [];
    if (customer.priority_flags?.senior_citizen) types.push('👴 Senior');
    if (customer.priority_flags?.pregnant) types.push('🤱 Pregnant');
    if (customer.priority_flags?.pwd) types.push('♿ PWD');
    return types;
  }, [customer.priority_flags]);

  if (priorityTypes.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {priorityTypes.map((type, index) => (
        <span 
          key={index}
          className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded"
        >
          {type}
        </span>
      ))}
    </div>
  );
});

PriorityIndicator.displayName = 'PriorityIndicator';

// ✅ OPTIMIZED: Memoized Action Buttons component
const ActionButtons = React.memo<{ 
  customer: Customer; 
  userRole: string;
  onCallCustomer?: (customerId: number) => void;
  onMarkAsProcessing?: (customerId: number) => void;
  onCompleteService?: (customerId: number) => void;
  onCancelService?: (customerId: number) => void;
}>(({ 
  customer, 
  userRole, 
  onCallCustomer, 
  onMarkAsProcessing, 
  onCompleteService, 
  onCancelService 
}) => {
  // ✅ OPTIMIZED: Memoized permission checks
  const permissions = useMemo(() => {
    const isAuthorized = ['admin', 'cashier', 'sales'].includes(userRole.toLowerCase());
    
    if (!isAuthorized) return {};
    
    return {
      canCall: customer.queue_status === QueueStatus.WAITING,
      canMarkProcessing: customer.queue_status === QueueStatus.SERVING && ['admin', 'cashier'].includes(userRole.toLowerCase()),
      canComplete: [QueueStatus.SERVING, QueueStatus.PROCESSING].includes(customer.queue_status),
      canCancel: customer.queue_status !== QueueStatus.COMPLETED && customer.queue_status !== QueueStatus.CANCELLED
    };
  }, [customer.queue_status, userRole]);

  // ✅ OPTIMIZED: Memoized click handlers
  const handleCall = useCallback(() => {
    onCallCustomer?.(customer.id);
  }, [onCallCustomer, customer.id]);

  const handleMarkProcessing = useCallback(() => {
    onMarkAsProcessing?.(customer.id);
  }, [onMarkAsProcessing, customer.id]);

  const handleComplete = useCallback(() => {
    onCompleteService?.(customer.id);
  }, [onCompleteService, customer.id]);

  const handleCancel = useCallback(() => {
    onCancelService?.(customer.id);
  }, [onCancelService, customer.id]);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Call Customer */}
      {permissions.canCall && onCallCustomer && (
        <button
          onClick={handleCall}
          className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 
                   transition-colors duration-200 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          📢 Call
        </button>
      )}

      {/* Mark as Processing */}
      {permissions.canMarkProcessing && onMarkAsProcessing && (
        <button
          onClick={handleMarkProcessing}
          className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 
                   transition-colors duration-200 dark:bg-purple-500 dark:hover:bg-purple-600"
        >
          🔄 Mark as Processing
        </button>
      )}

      {/* Serve/Complete */}
      {permissions.canComplete && onCompleteService && (
        <button
          onClick={handleComplete}
          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 
                   transition-colors duration-200 dark:bg-green-500 dark:hover:bg-green-600"
        >
          ✅ {customer.queue_status === QueueStatus.SERVING ? 'Serve' : 'Complete'}
        </button>
      )}

      {/* Cancel */}
      {permissions.canCancel && onCancelService && (
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 
                   transition-colors duration-200 dark:bg-red-500 dark:hover:bg-red-600"
        >
          ❌ Cancel
        </button>
      )}
    </div>
  );
});

ActionButtons.displayName = 'ActionButtons';

// ✅ OPTIMIZED: Memoized Table Row component
const QueueTableRow = React.memo<{
  item: QueueItem;
  index: number;
  isSelected: boolean;
  onSelect: (customerId: number) => void;
  userRole: string;
  onCallCustomer?: (customerId: number) => void;
  onMarkAsProcessing?: (customerId: number) => void;
  onCompleteService?: (customerId: number) => void;
  onCancelService?: (customerId: number) => void;
}>(({ 
  item, 
  index, 
  isSelected, 
  onSelect, 
  userRole, 
  onCallCustomer, 
  onMarkAsProcessing, 
  onCompleteService, 
  onCancelService 
}) => {
  // ✅ OPTIMIZED: Memoized status badge and display
  const statusInfo = useMemo(() => {
    const baseClasses = 'px-2 py-1 text-xs font-medium rounded-full';
    
    const statusConfig = {
      [QueueStatus.WAITING]: { 
        className: `${baseClasses} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300`,
        display: { text: 'Waiting', icon: '⏳' }
      },
      [QueueStatus.SERVING]: { 
        className: `${baseClasses} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300`,
        display: { text: 'Serving', icon: '👥' }
      },
      [QueueStatus.PROCESSING]: { 
        className: `${baseClasses} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 animate-pulse`,
        display: { text: 'Processing', icon: '🔄' }
      },
      [QueueStatus.COMPLETED]: { 
        className: `${baseClasses} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300`,
        display: { text: 'Completed', icon: '✅' }
      },
      [QueueStatus.CANCELLED]: { 
        className: `${baseClasses} bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300`,
        display: { text: 'Cancelled', icon: '❌' }
      }
    };
    
    return statusConfig[item.customer.queue_status] || {
      className: `${baseClasses} bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300`,
      display: { text: item.customer.queue_status, icon: '❓' }
    };
  }, [item.customer.queue_status]);

  const handleRowClick = useCallback(() => {
    onSelect(isSelected ? -1 : item.customer_id);
  }, [onSelect, isSelected, item.customer_id]);

  return (
    <tr
      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 cursor-pointer ${
        isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
      onClick={handleRowClick}
    >
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            #{item.position}
          </span>
          {item.customer.token_number && (
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              Token: {item.customer.token_number}
            </span>
          )}
        </div>
      </td>
      
      <td className="px-6 py-4">
        <div className="text-sm">
          <div className="font-medium text-gray-900 dark:text-white">
            {item.customer.name}
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            OR: {item.customer.or_number}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">
            {item.customer.contact_number}
          </div>
          <PriorityIndicator customer={item.customer} />
        </div>
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={statusInfo.className}>
          <span className="flex items-center gap-1">
            <span>{statusInfo.display.icon}</span>
            {statusInfo.display.text}
          </span>
        </span>
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
        {item.estimated_wait_time > 0 ? (
          <div>
            <div className="font-medium">
              ~{Math.round(item.estimated_wait_time)}m
            </div>
            <div className="text-xs opacity-75">
              estimated
            </div>
          </div>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm">
          <div className="font-medium text-gray-900 dark:text-white">
            Score: {item.priority_score}
          </div>
          {item.priority_score > 1 && (
            <div className="text-xs text-orange-600 dark:text-orange-400">
              ⭐ Priority customer
            </div>
          )}
        </div>
      </td>
      
      <td className="px-6 py-4 whitespace-nowrap">
        <ActionButtons 
          customer={item.customer}
          userRole={userRole}
          onCallCustomer={onCallCustomer}
          onMarkAsProcessing={onMarkAsProcessing}
          onCompleteService={onCompleteService}
          onCancelService={onCancelService}
        />
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // ✅ OPTIMIZED: Custom comparison for optimal re-rendering
  return (
    prevProps.item.customer_id === nextProps.item.customer_id &&
    prevProps.item.customer.queue_status === nextProps.item.customer.queue_status &&
    prevProps.item.position === nextProps.item.position &&
    prevProps.item.priority_score === nextProps.item.priority_score &&
    prevProps.item.estimated_wait_time === nextProps.item.estimated_wait_time &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.userRole === nextProps.userRole
  );
});

QueueTableRow.displayName = 'QueueTableRow';

// ✅ OPTIMIZED: Main component with React.memo and comprehensive optimization
const CustomerQueueTable = React.memo<CustomerQueueTableProps>(({
  queueItems,
  isLoading = false,
  onCallCustomer,
  onMarkAsProcessing,
  onCompleteService,
  onCancelService,
  userRole = 'cashier',
  className = ''
}) => {
  const [selectedCustomer, setSelectedCustomer] = useState<number>(-1);

  // ✅ OPTIMIZED: Memoized sorted queue items with stable sorting
  const sortedQueueItems = useMemo(() => {
    return [...queueItems].sort((a, b) => {
      // Sort by position first, then by priority score
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return b.priority_score - a.priority_score;
    });
  }, [queueItems]);

  // ✅ OPTIMIZED: Memoized statistics calculations
  const queueStats = useMemo(() => {
    const waiting = queueItems.filter(item => item.customer.queue_status === QueueStatus.WAITING).length;
    const processing = queueItems.filter(item => item.customer.queue_status === QueueStatus.PROCESSING).length;
    const serving = queueItems.filter(item => item.customer.queue_status === QueueStatus.SERVING).length;
    
    return {
      total: queueItems.length,
      waiting,
      processing,
      serving
    };
  }, [queueItems]);

  // ✅ OPTIMIZED: Memoized selection handler
  const handleCustomerSelect = useCallback((customerId: number) => {
    setSelectedCustomer(customerId);
  }, []);

  // ✅ OPTIMIZED: Memoized loading component
  const loadingComponent = useMemo(() => (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  ), [className]);

  // ✅ OPTIMIZED: Memoized empty state component
  const emptyStateComponent = useMemo(() => (
    <div className="text-center py-12">
      <div className="text-gray-400 dark:text-gray-500 text-4xl mb-4">🏪</div>
      <p className="text-gray-500 dark:text-gray-400 text-lg">No customers in queue</p>
      <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
        New customers will appear here automatically
      </p>
    </div>
  ), []);

  if (isLoading) {
    return loadingComponent;
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Customer Queue ({queueStats.total})
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Real-time queue management with processing status
        </p>
      </div>

      <div className="overflow-x-auto">
        {sortedQueueItems.length === 0 ? (
          emptyStateComponent
        ) : (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Wait Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedQueueItems.map((item, index) => (
                <QueueTableRow
                  key={`${item.customer_id}-${item.customer.queue_status}-${item.position}`}
                  item={item}
                  index={index}
                  isSelected={selectedCustomer === item.customer_id}
                  onSelect={handleCustomerSelect}
                  userRole={userRole}
                  onCallCustomer={onCallCustomer}
                  onMarkAsProcessing={onMarkAsProcessing}
                  onCompleteService={onCompleteService}
                  onCancelService={onCancelService}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer with summary */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span>
              Total: <strong>{queueStats.total}</strong>
            </span>
            <span>
              Waiting: <strong>{queueStats.waiting}</strong>
            </span>
            <span>
              Processing: <strong className="text-purple-600 dark:text-purple-400">
                {queueStats.processing}
              </strong>
            </span>
            <span>
              Serving: <strong className="text-blue-600 dark:text-blue-400">
                {queueStats.serving}
              </strong>
            </span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // ✅ OPTIMIZED: Custom shallow comparison for props
  const queueItemsEqual = 
    prevProps.queueItems.length === nextProps.queueItems.length &&
    prevProps.queueItems.every((item, index) => {
      const nextItem = nextProps.queueItems[index];
      return nextItem && 
             item.customer_id === nextItem.customer_id &&
             item.customer.queue_status === nextItem.customer.queue_status &&
             item.position === nextItem.position &&
             item.priority_score === nextItem.priority_score;
    });

  return (
    queueItemsEqual &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.userRole === nextProps.userRole &&
    prevProps.className === nextProps.className
  );
});

CustomerQueueTable.displayName = 'CustomerQueueTable';

export default CustomerQueueTable;
