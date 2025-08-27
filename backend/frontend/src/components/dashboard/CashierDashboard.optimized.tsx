import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { QueueStatus, validateQueueStatusPayload, validateQueueUpdatePayload } from '../../types/queue';
import { useWebSocketQueue } from '../../hooks/useWebSocketQueue';

// Interface for notification statistics
interface NotificationStats {
  total_notifications: number;
  total_active: number;
  total_unread: number;
  total_read: number;
  expires_soon: number;
  avg_response_time_minutes: number;
  created_today: number;
  read_today: number;
  target_role: string;
  last_updated: string;
  timestamp: number;
}

// Interface for KPI card data
interface KPICardData {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'stable';
    percentage?: number;
  };
  color: 'primary' | 'success' | 'warning' | 'error';
  icon: string;
}

interface QueueEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
}

// Memoized KPI Card component to prevent unnecessary re-renders
const KPICard = React.memo<{ data: KPICardData }>(({ data }) => {
  const getColorClass = useCallback((color: string) => {
    const colorMap = {
      primary: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200',
      success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200',
      warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200',
      error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.primary;
  }, []);

  return (
    <div className={`p-4 md:p-6 rounded-lg border-2 ${getColorClass(data.color)} transition-all duration-200 hover:shadow-lg dark:hover:shadow-xl`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium opacity-75">{data.title}</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">{data.value}</p>
          {data.subtitle && (
            <p className="text-xs md:text-sm opacity-60 mt-1">{data.subtitle}</p>
          )}
        </div>
        <div className="text-3xl md:text-4xl opacity-40 flex-shrink-0 ml-2">
          {data.icon}
        </div>
      </div>
    </div>
  );
});

KPICard.displayName = 'KPICard';

// Memoized Connection Status component
const ConnectionStatus = React.memo<{ isConnected: boolean; lastUpdated: Date | null }>(({ 
  isConnected, 
  lastUpdated 
}) => (
  <div className="flex items-center space-x-2 mb-6">
    <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} ${isConnected ? 'animate-pulse' : ''}`}></div>
    <span className={`text-sm font-medium ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
      {isConnected ? 'Connected' : 'Disconnected'}
    </span>
    {lastUpdated && (
      <span className="text-xs text-gray-500">
        Last updated: {lastUpdated.toLocaleTimeString()}
      </span>
    )}
  </div>
));

ConnectionStatus.displayName = 'ConnectionStatus';

const CashierDashboard: React.FC = () => {
  // State management
  const [notificationStats, setNotificationStats] = useState<NotificationStats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [processingCount, setProcessingCount] = useState<number>(0);
  const [queueEvents, setQueueEvents] = useState<QueueEvent[]>([]);
  const [lastQueueUpdate, setLastQueueUpdate] = useState<Date | null>(null);

  // WebSocket connection state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs to prevent stale closures
  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);

  // ✅ FIXED: Memoized WebSocket initialization with proper cleanup
  const initializeSocket = useCallback(() => {
    // Cleanup existing socket first
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        setConnectionError('Authentication token not found');
        return;
      }

      const newSocket = io(process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      // Store socket reference
      socketRef.current = newSocket;

      // Connection event handlers
      newSocket.on('connect', () => {
        if (!mountedRef.current) return;
        console.log('[CASHIER_DASHBOARD] Connected to WebSocket server');
        setIsConnected(true);
        setConnectionError(null);
        newSocket.emit('subscribe:notification_analytics');
      });

      newSocket.on('disconnect', (reason) => {
        if (!mountedRef.current) return;
        console.log('[CASHIER_DASHBOARD] Disconnected from WebSocket:', reason);
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        if (!mountedRef.current) return;
        console.error('[CASHIER_DASHBOARD] Connection error:', error);
        setConnectionError(`Connection failed: ${error.message}`);
        setIsConnected(false);
      });

      // ✅ FIXED: Optimized event handlers with validation
      newSocket.on('notification_stats_update', (stats: NotificationStats) => {
        if (!mountedRef.current) return;
        console.log('[CASHIER_DASHBOARD] Received notification stats update:', stats);
        setNotificationStats(stats);
        setLastUpdated(new Date());
      });

      newSocket.on('queue:status_changed', (data: unknown) => {
        if (!mountedRef.current) return;
        console.log('[CASHIER_DASHBOARD] Queue status changed:', data);
        
        if (validateQueueStatusPayload(data)) {
          const eventId = `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          setQueueEvents(prev => [
            {
              id: eventId,
              type: 'queue:status_changed',
              timestamp: new Date(),
              data: {
                customerId: data.id,
                newStatus: data.newStatus,
                previousStatus: data.previousStatus,
                suppressSound: data.suppressSound
              }
            }, 
            ...prev.slice(0, 9)
          ]);
          
          setLastQueueUpdate(new Date());
          
          if (data.newStatus === QueueStatus.PROCESSING) {
            console.log('[CASHIER_DASHBOARD] Customer moved to processing status', {
              customerId: data.id,
              suppressSound: data.suppressSound
            });
          }
        }
      });

      newSocket.on('queue:update', (data: unknown) => {
        if (!mountedRef.current) return;
        console.log('[CASHIER_DASHBOARD] Queue update:', data);
        
        if (validateQueueUpdatePayload(data)) {
          setProcessingCount(data.processingCount);
          
          const eventId = `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          setQueueEvents(prev => [
            {
              id: eventId,
              type: 'queue:update',
              timestamp: new Date(),
              data: {
                type: data.type,
                processingCount: data.processingCount,
                suppressSound: data.suppressSound,
                customer: data.customer ? {
                  id: data.customer.id,
                  name: data.customer.name,
                  queue_status: data.customer.queue_status
                } : undefined
              }
            }, 
            ...prev.slice(0, 9)
          ]);
          
          setLastQueueUpdate(new Date());
        }
      });

      newSocket.on('auth:error', ({ code, message }) => {
        if (!mountedRef.current) return;
        console.error('[CASHIER_DASHBOARD] Auth error:', code, message);
        setConnectionError(`Authentication failed: ${message}`);
      });

      setSocket(newSocket);

    } catch (error) {
      console.error('[CASHIER_DASHBOARD] Error initializing socket:', error);
      setConnectionError('Failed to initialize WebSocket connection');
    }
  }, []); // ✅ FIXED: Empty dependency array

  // ✅ FIXED: Proper cleanup with ref tracking
  useEffect(() => {
    mountedRef.current = true;
    initializeSocket();

    return () => {
      mountedRef.current = false;
      if (socketRef.current) {
        console.log('[CASHIER_DASHBOARD] Cleaning up WebSocket connection');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []); // ✅ FIXED: Empty dependency array

  // ✅ OPTIMIZED: Memoized average processing time calculation
  const avgProcessingTime = useMemo(() => {
    const processingEvents = queueEvents.filter(event =>
      event.type === 'queue:update' && event.data.processingCount > 0
    );

    if (processingEvents.length === 0) return 0;

    const avgTime = Math.round(
      processingEvents.reduce((acc, event) => acc + event.data.processingCount, 0) / processingEvents.length
    );

    return Math.min(avgTime, 60);
  }, [queueEvents]);

  // ✅ OPTIMIZED: Memoized KPI cards generation
  const kpiCards = useMemo((): KPICardData[] => {
    if (!notificationStats) {
      return [
        {
          title: 'Loading...',
          value: '...',
          color: 'primary',
          icon: '⏳'
        }
      ];
    }

    return [
      {
        title: 'Processing Queue',
        value: processingCount,
        subtitle: `Avg: ${avgProcessingTime}m`,
        color: processingCount > 10 ? 'error' :
               processingCount > 5 ? 'warning' :
               processingCount > 0 ? 'primary' : 'success',
        icon: '🔄'
      },
      {
        title: 'Active Notifications',
        value: notificationStats.total_active,
        subtitle: 'Currently pending',
        color: notificationStats.total_active > 0 ? 'warning' : 'success',
        icon: '📢'
      },
      {
        title: 'Unread Notifications',
        value: notificationStats.total_unread,
        subtitle: 'Requiring attention',
        color: notificationStats.total_unread > 5 ? 'error' : 
               notificationStats.total_unread > 0 ? 'warning' : 'success',
        icon: '🔔'
      },
      {
        title: 'Expiring Soon',
        value: notificationStats.expires_soon,
        subtitle: 'Within 1 hour',
        color: notificationStats.expires_soon > 0 ? 'error' : 'success',
        icon: '⏰'
      },
      {
        title: 'Avg Response Time',
        value: `${Math.round(notificationStats.avg_response_time_minutes)}m`,
        subtitle: 'Minutes to respond',
        color: notificationStats.avg_response_time_minutes > 30 ? 'error' :
               notificationStats.avg_response_time_minutes > 15 ? 'warning' : 'success',
        icon: '⚡'
      },
      {
        title: 'Created Today',
        value: notificationStats.created_today,
        subtitle: 'New registrations',
        color: 'primary',
        icon: '📅'
      },
      {
        title: 'Processed Today',
        value: notificationStats.read_today,
        subtitle: 'Notifications handled',
        color: 'success',
        icon: '✅'
      }
    ];
  }, [notificationStats, processingCount, avgProcessingTime]);

  // ✅ OPTIMIZED: Memoized recent events rendering
  const recentEventsContent = useMemo(() => {
    if (queueEvents.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p>No queue events received yet</p>
          <p className="text-xs mt-1">Events will appear here when queue status changes occur</p>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {queueEvents.map((event) => (
          <div key={event.id} className="flex justify-between items-start p-3 bg-gray-50 border border-gray-200 rounded">
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  event.type === 'queue:status_changed' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                }`}>
                  {event.type}
                </span>
                <span className="text-xs text-gray-500">
                  {event.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="mt-1 text-sm text-gray-700">
                {event.type === 'queue:status_changed' && (
                  <span>
                    Customer {event.data.customerId}: {event.data.previousStatus} → {event.data.newStatus}
                    {event.data.newStatus === QueueStatus.PROCESSING && ' 🔄'}
                    {event.data.suppressSound && ' (silent)'}
                  </span>
                )}
                {event.type === 'queue:update' && (
                  <span>
                    {event.data.type} | Processing: {event.data.processingCount}
                    {event.data.customer && ` | ${event.data.customer.name} (${event.data.customer.queue_status})`}
                    {event.data.suppressSound && ' (silent)'}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }, [queueEvents]);

  // Main render
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Cashier Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
            Real-time notification analytics and KPI monitoring
          </p>
          <ConnectionStatus isConnected={isConnected} lastUpdated={lastUpdated} />
        </div>

        {/* Error handling */}
        {connectionError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
            <div className="flex items-center">
              <div className="text-red-400 dark:text-red-300 mr-3 text-xl">
                ⚠️
              </div>
              <div>
                <h4 className="text-red-800 dark:text-red-200 font-medium">Connection Error</h4>
                <p className="text-red-600 dark:text-red-300 text-sm">{connectionError}</p>
              </div>
            </div>
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {kpiCards.map((kpiData, index) => (
            <KPICard key={index} data={kpiData} />
          ))}
        </div>

        {/* Enhanced Queue Monitoring Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Queue Status Monitoring (Enhanced WebSocket Events)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-2">Processing Count</h3>
              <p className="text-2xl font-bold text-blue-900">{processingCount}</p>
              <p className="text-xs text-blue-600 mt-1">Customers being processed</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-800 mb-2">Last Queue Update</h3>
              <p className="text-sm font-bold text-green-900">
                {lastQueueUpdate ? lastQueueUpdate.toLocaleTimeString() : 'Never'}
              </p>
              <p className="text-xs text-green-600 mt-1">Latest event received</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-purple-800 mb-2">Event Count</h3>
              <p className="text-2xl font-bold text-purple-900">{queueEvents.length}</p>
              <p className="text-xs text-purple-600 mt-1">Recent events (max 10)</p>
            </div>
          </div>
          
          {/* Recent Queue Events */}
          <div className="mt-4">
            <h3 className="text-lg font-medium text-gray-800 mb-3">Recent Queue Events</h3>
            {recentEventsContent}
          </div>
        </div>

        {/* Real-time Data Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Real-time Analytics Info
          </h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>WebSocket Status:</span>
              <span className={`font-medium ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Data Source:</span>
              <span className="font-medium">Customer Notifications Service</span>
            </div>
            <div className="flex justify-between">
              <span>Update Frequency:</span>
              <span className="font-medium">Real-time (on notification create/read)</span>
            </div>
            {notificationStats && (
              <div className="flex justify-between">
                <span>Target Role:</span>
                <span className="font-medium">{notificationStats.target_role}</span>
              </div>
            )}
          </div>
        </div>

        {/* Debug Information (remove in production) */}
        {process.env.NODE_ENV === 'development' && notificationStats && (
          <div className="mt-6 bg-gray-900 rounded-lg p-4">
            <h3 className="text-white font-medium mb-2">Debug: Raw Stats Data</h3>
            <pre className="text-green-400 text-xs overflow-auto">
              {JSON.stringify(notificationStats, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(CashierDashboard);
