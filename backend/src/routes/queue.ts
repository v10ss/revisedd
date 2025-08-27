import express, { Router, Request, Response } from 'express';
import { QueueService, CounterService } from '../services/queue';
import { DisplayService } from '../services/displayService';
import { 
  authenticateToken, 
  requireCashierOrAdmin, 
  requireProcessingView,
  requireServeToProcessing,
  requireForcedTransitions,
  requireAdmin,
  logActivity 
} from '../middleware/auth';
import { AuthRequest, QueueStatus } from '../types';
import { pool } from '../config/database';

const router: express.Router = Router();

// Helper functions
const calculatePriorityScore = (priorityFlags: any): number => {
  let score = 0;
  if (priorityFlags.senior_citizen) score += 1000;
  if (priorityFlags.pwd) score += 900;
  if (priorityFlags.pregnant) score += 800;
  return score;
};

const calculateEstimatedWaitTime = (position: number): number => {
  // Estimated wait time based on position and average service time
  const averageServiceTime = 15; // minutes
  return (position - 1) * averageServiceTime;
};

// Debug route to check customers
router.get('/debug', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const allCustomers = await pool.query('SELECT id, name, queue_status, created_at FROM customers ORDER BY created_at DESC LIMIT 10');
    const waitingCustomers = await pool.query('SELECT id, name, queue_status, created_at FROM customers WHERE queue_status = $1', ['waiting']);
    
    res.json({
      allCustomers: allCustomers.rows,
      waitingCustomers: waitingCustomers.rows,
      user: req.user
    });
  } catch (error) {
    console.error('Error getting debug info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current queue with optional status filtering
router.get('/', authenticateToken, logActivity('get_queue'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('Queue route accessed by user:', req.user?.full_name, 'role:', req.user?.role);
    const statusFilter = req.query.status as string;
    const queue = await QueueService.getQueue(statusFilter);
    console.log('Queue data fetched:', queue.length, 'items', statusFilter ? `with status filter: ${statusFilter}` : '');
    res.json(queue);
  } catch (error) {
    console.error('Error getting queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Call next customer
router.post('/call-next', authenticateToken, requireCashierOrAdmin, logActivity('call_next_customer'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { counterId } = req.body;

    if (!counterId) {
      res.status(400).json({ error: 'Counter ID is required' });
      return;
    }

    const customer = await QueueService.callNext(counterId);
    
    if (!customer) {
      res.status(404).json({ error: 'No customers in queue' });
      return;
    }

    res.json(customer);
  } catch (error) {
    console.error('Error calling next customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Call specific customer
router.post('/call-customer', authenticateToken, requireCashierOrAdmin, logActivity('call_specific_customer'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerId, counterId } = req.body;

    if (!customerId || !counterId) {
      res.status(400).json({ error: 'Customer ID and Counter ID are required' });
      return;
    }

    const customer = await QueueService.callSpecificCustomer(customerId, counterId);
    
    if (!customer) {
      res.status(404).json({ error: 'Customer not found or already served' });
      return;
    }

    res.json(customer);
  } catch (error) {
    console.error('Error calling specific customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete service
router.post('/complete', authenticateToken, requireCashierOrAdmin, logActivity('complete_service'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerId, counterId } = req.body;

    if (!customerId || !counterId) {
      res.status(400).json({ error: 'Customer ID and Counter ID are required' });
      return;
    }

    const customer = await QueueService.completeService(customerId, counterId);
    res.json(customer);
  } catch (error) {
    console.error('Error completing service:', error);
    if (error instanceof Error && error.message === 'Customer not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Cancel service
router.post('/cancel', authenticateToken, requireCashierOrAdmin, logActivity('cancel_service'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerId, reason } = req.body;

    if (!customerId) {
      res.status(400).json({ error: 'Customer ID is required' });
      return;
    }

    const customer = await QueueService.cancelService(customerId, reason);
    res.json(customer);
  } catch (error) {
    console.error('Error cancelling service:', error);
    if (error instanceof Error && error.message === 'Customer not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Get customer position
router.get('/position/:customerId', authenticateToken, logActivity('get_queue_position'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerId } = req.params;
    const position = await QueueService.getPosition(parseInt(customerId, 10));
    
    res.json({ position });
  } catch (error) {
    console.error('Error getting queue position:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get queue statistics
router.get('/stats', authenticateToken, logActivity('get_queue_statistics'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stats = await QueueService.getQueueStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error getting queue statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Counter management routes
router.get('/counters', authenticateToken, logActivity('list_counters'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const counters = await CounterService.list();
    res.json(counters);
  } catch (error) {
    console.error('Error listing counters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all customers for queue management (waiting + serving + completed)
router.get('/all-statuses', authenticateToken, logActivity('get_all_statuses'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = `
      SELECT 
        c.*,
        u.full_name as sales_agent_name,
        ROW_NUMBER() OVER (ORDER BY 
          CASE 
            WHEN c.queue_status = 'serving' THEN 0
            WHEN c.queue_status = 'waiting' THEN 1
            WHEN c.queue_status = 'completed' THEN 2
            ELSE 3
          END,
          CASE 
            WHEN c.manual_position IS NOT NULL THEN c.manual_position
            ELSE
              CASE 
                WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
                WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
                WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
                ELSE 0
              END * 100000 + EXTRACT(EPOCH FROM c.created_at)
          END ASC
        ) as position
      FROM customers c
      LEFT JOIN users u ON c.sales_agent_id = u.id
      WHERE c.queue_status IN ('waiting', 'serving', 'processing', 'completed')
      ORDER BY 
        CASE 
          WHEN c.queue_status = 'serving' THEN 0
          WHEN c.queue_status = 'processing' THEN 0.5
          WHEN c.queue_status = 'waiting' THEN 1
          WHEN c.queue_status = 'completed' THEN 2
          ELSE 3
        END,
        CASE 
          WHEN c.manual_position IS NOT NULL THEN c.manual_position
          ELSE
            CASE 
              WHEN c.priority_flags::json->>'senior_citizen' = 'true' THEN 1000
              WHEN c.priority_flags::json->>'pwd' = 'true' THEN 900
              WHEN c.priority_flags::json->>'pregnant' = 'true' THEN 800
              ELSE 0
            END * 100000 + EXTRACT(EPOCH FROM c.created_at)
        END ASC
    `;
    
    const result = await pool.query(query);
    
    const customers = result.rows.map((row: any) => ({
      customer_id: row.id,
      customer: {
        ...row,
        prescription: typeof row.prescription === 'string' ? JSON.parse(row.prescription) : row.prescription,
        payment_info: typeof row.payment_info === 'string' ? JSON.parse(row.payment_info) : row.payment_info,
        priority_flags: typeof row.priority_flags === 'string' ? JSON.parse(row.priority_flags) : row.priority_flags,
      },
      position: row.position,
      priority_score: calculatePriorityScore(typeof row.priority_flags === 'string' ? JSON.parse(row.priority_flags) : row.priority_flags),
      estimated_wait_time: calculateEstimatedWaitTime(row.position)
    }));
    
    res.json(customers);
  } catch (error) {
    console.error('Error getting all queue statuses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all customers for display monitor (waiting + serving) - excludes processing records
router.get('/display-all', authenticateToken, logActivity('get_display_all'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Use DisplayService.getDisplayQueue() method that filters out processing records
    const customers = await DisplayService.getDisplayQueue();
    
    console.log('Display queue data retrieved:', {
      count: customers.length,
      items: customers.map(c => ({ 
        id: c.customer_id, 
        name: c.customer?.name, 
        estimated_time: c.estimated_wait_time 
      }))
    });
    
    // Internal calculation - not exposed in response
    // Calculate service time from completed customers (served - called)
    const servedCustomersQuery = `
      WITH service_times AS (
        SELECT 
          called.customer_id,
          EXTRACT(EPOCH FROM (served.created_at - called.created_at)) / 60 AS service_duration_minutes
        FROM queue_events called
        INNER JOIN queue_events served 
          ON called.customer_id = served.customer_id 
          AND called.event_type = 'called' 
          AND served.event_type = 'served'
        WHERE DATE(called.created_at) = CURRENT_DATE
      )
      SELECT AVG(service_duration_minutes) as avg_service_time
      FROM service_times
    `;
    
    try {
      const servedResults = await pool.query(servedCustomersQuery);
      const averageServiceTime = servedResults.rows[0]?.avg_service_time || 0;
      console.log('Internal Average Service Time (minutes):', averageServiceTime);
    } catch (error) {
      console.log('Could not calculate internal service time:', error instanceof Error ? error.message : 'Unknown error');
    }

    res.json(customers);
  } catch (error) {
    console.error('Error getting display all data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public endpoint for display monitor - no authentication required
router.get('/public/display-all', logActivity('get_public_display_all'), async (req: Request, res: Response): Promise<void> => {
  try {
    // Use DisplayService.getDisplayQueue() method that filters out processing records
    const customers = await DisplayService.getDisplayQueue();
    
    console.log('Public display queue data retrieved:', {
      count: customers.length,
      items: customers.map(c => ({ 
        id: c.customer_id, 
        name: c.customer?.name, 
        estimated_time: c.estimated_wait_time 
      }))
    });

    res.json(customers);
  } catch (error) {
    console.error('Error getting public display all data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Explanation: The average service time is calculated internally and logged, but not sent in the response.

// Counters endpoint for Display Monitor (authenticated)
router.get('/counters/display', authenticateToken, logActivity('list_display_counters'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const query = `
      SELECT 
        c.id,
        c.name,
        c.is_active,
        c.display_order,
        cu.id as current_customer_id,
        cu.name as current_customer_name,
        cu.token_number as current_customer_token,
        cu.priority_flags as current_customer_priority_flags
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id AND cu.queue_status = 'serving'
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `;
    
    const result = await pool.query(query);
    
    console.log('Display counters query result:', {
      count: result.rows.length,
      counters: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        current_customer_id: row.current_customer_id,
        current_customer_name: row.current_customer_name
      }))
    });
    
    const counters = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      is_active: row.is_active,
      current_customer: row.current_customer_id ? {
        id: row.current_customer_id,
        name: row.current_customer_name,
        token_number: row.current_customer_token,
        queue_status: 'serving',
        priority_flags: typeof row.current_customer_priority_flags === 'string' 
          ? JSON.parse(row.current_customer_priority_flags) 
          : row.current_customer_priority_flags || { senior_citizen: false, pregnant: false, pwd: false }
      } : null
    }));
    
    res.json(counters);
  } catch (error) {
    console.error('Error listing display counters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public counters endpoint for standalone display - no authentication required
router.get('/public/counters/display', logActivity('list_public_display_counters'), async (req: Request, res: Response): Promise<void> => {
  try {
    const query = `
      SELECT 
        c.id,
        c.name,
        c.is_active,
        c.display_order,
        cu.id as current_customer_id,
        cu.name as current_customer_name,
        cu.token_number as current_customer_token,
        cu.priority_flags as current_customer_priority_flags
      FROM counters c
      LEFT JOIN customers cu ON c.current_customer_id = cu.id AND cu.queue_status = 'serving'
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `;
    
    const result = await pool.query(query);
    
    console.log('Public display counters query result:', {
      count: result.rows.length,
      counters: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        current_customer_id: row.current_customer_id,
        current_customer_name: row.current_customer_name
      }))
    });
    
    const counters = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      is_active: row.is_active,
      current_customer: row.current_customer_id ? {
        id: row.current_customer_id,
        name: row.current_customer_name,
        token_number: row.current_customer_token,
        queue_status: 'serving',
        priority_flags: typeof row.current_customer_priority_flags === 'string' 
          ? JSON.parse(row.current_customer_priority_flags) 
          : row.current_customer_priority_flags || { senior_citizen: false, pregnant: false, pwd: false }
      } : null
    }));
    
    res.json(counters);
  } catch (error) {
    console.error('Error listing public display counters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fix serving customers counter assignment endpoint
router.post('/admin/fix-serving-counter-assignments', authenticateToken, requireAdmin, logActivity('fix_serving_counter_assignments'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('Starting serving customers counter assignment fix...');
    
    // Get all serving customers
    const servingCustomers = await pool.query(`
      SELECT id, name, token_number, queue_status, created_at
      FROM customers 
      WHERE queue_status = 'serving'
      ORDER BY created_at ASC
    `);
    
    // Get current counter assignments
    const counterAssignments = await pool.query(`
      SELECT 
        c.id as counter_id,
        c.name as counter_name,
        c.current_customer_id
      FROM counters c
      WHERE c.is_active = true
      ORDER BY c.display_order ASC, c.name ASC
    `);
    
    // Get available counters (no current customer assigned)
    const availableCounters = await pool.query(`
      SELECT id, name, display_order
      FROM counters 
      WHERE is_active = true AND current_customer_id IS NULL
      ORDER BY display_order ASC, name ASC
    `);
    
    // Find unassigned serving customers
    const assignedCustomerIds = counterAssignments.rows
      .filter(c => c.current_customer_id)
      .map(c => c.current_customer_id);
    
    const unassignedServing = servingCustomers.rows.filter(customer => 
      !assignedCustomerIds.includes(customer.id)
    );
    
    console.log(`Found ${servingCustomers.rows.length} serving customers`);
    console.log(`Found ${unassignedServing.length} unassigned serving customers`);
    console.log(`Found ${availableCounters.rows.length} available counters`);
    
    if (unassignedServing.length === 0) {
      res.json({ 
        success: true, 
        message: 'All serving customers are already assigned to counters',
        stats: {
          servingCustomers: servingCustomers.rows.length,
          unassignedServing: 0,
          availableCounters: availableCounters.rows.length,
          assignmentsMade: 0
        }
      });
      return;
    }
    
    if (availableCounters.rows.length === 0) {
      res.json({ 
        success: false, 
        message: 'No available counters to assign customers to',
        stats: {
          servingCustomers: servingCustomers.rows.length,
          unassignedServing: unassignedServing.length,
          availableCounters: 0,
          assignmentsMade: 0
        }
      });
      return;
    }
    
    // Assign customers to counters
    const client = await pool.connect();
    let assignmentsMade = 0;
    
    try {
      await client.query('BEGIN');
      
      const assignmentsToMake = Math.min(unassignedServing.length, availableCounters.rows.length);
      
      for (let i = 0; i < assignmentsToMake; i++) {
        const customer = unassignedServing[i];
        const counter = availableCounters.rows[i];
        
        console.log(`Assigning customer "${customer.name}" (ID: ${customer.id}) to "${counter.name}" (ID: ${counter.id})`);
        
        await client.query(`
          UPDATE counters 
          SET current_customer_id = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [customer.id, counter.id]);
        
        assignmentsMade++;
      }
      
      await client.query('COMMIT');
      console.log(`Successfully made ${assignmentsMade} counter assignments`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    res.json({ 
      success: true, 
      message: `Successfully assigned ${assignmentsMade} serving customers to counters`,
      stats: {
        servingCustomers: servingCustomers.rows.length,
        unassignedServing: unassignedServing.length,
        availableCounters: availableCounters.rows.length,
        assignmentsMade
      }
    });
    
  } catch (error) {
    console.error('Error fixing serving customer counter assignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/counters', authenticateToken, requireCashierOrAdmin, logActivity('create_counter'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Counter name is required' });
      return;
    }

    const counter = await CounterService.create(name);
    res.status(201).json(counter);
  } catch (error) {
    console.error('Error creating counter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/counters/:id', authenticateToken, requireCashierOrAdmin, logActivity('update_counter'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const counterId = Number(id);
    if (!Number.isInteger(counterId)) {
      res.status(400).json({ error: 'Invalid counter id' });
      return;
    }

    const updates = req.body;

    const counter = await CounterService.update(counterId, updates);
    res.json(counter);
  } catch (error) {
    console.error('Error updating counter:', error);
    if (error instanceof Error && error.message === 'Counter not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Manual queue reordering
// Fix counter assignments for production
router.post('/fix-counter-assignments', authenticateToken, requireCashierOrAdmin, logActivity('fix_counter_assignments'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🔧 Fixing counter assignments...');

    // 1. Get serving customers that need counter assignments
    const servingCustomersQuery = `
      SELECT c.id, c.name, c.token_number, c.created_at
      FROM customers c
      LEFT JOIN counters co ON co.current_customer_id = c.id
      WHERE c.queue_status = 'serving' AND co.current_customer_id IS NULL
      ORDER BY c.created_at ASC
    `;
    const servingCustomers = await pool.query(servingCustomersQuery);

    // 2. Get available counters
    const availableCountersQuery = `
      SELECT id, name 
      FROM counters 
      WHERE is_active = true AND current_customer_id IS NULL
      ORDER BY id ASC
    `;
    const availableCounters = await pool.query(availableCountersQuery);

    if (servingCustomers.rows.length === 0) {
      res.json({ message: 'No serving customers need counter assignments', assignments: [] });
      return;
    }

    if (availableCounters.rows.length === 0) {
      res.status(400).json({ error: 'No available counters for assignment' });
      return;
    }

    // 3. Make assignments
    const assignments = [];
    const assignmentsToMake = Math.min(servingCustomers.rows.length, availableCounters.rows.length);

    for (let i = 0; i < assignmentsToMake; i++) {
      const customer = servingCustomers.rows[i];
      const counter = availableCounters.rows[i];

      await pool.query(
        'UPDATE counters SET current_customer_id = $1 WHERE id = $2',
        [customer.id, counter.id]
      );

      assignments.push({
        customerId: customer.id,
        customerName: customer.name,
        customerToken: customer.token_number,
        counterId: counter.id,
        counterName: counter.name
      });

      console.log(`✅ Assigned Customer ${customer.id} (${customer.name}) to Counter ${counter.id} (${counter.name})`);
    }

    res.json({
      message: `Successfully assigned ${assignments.length} customers to counters`,
      assignments
    });
  } catch (error) {
    console.error('Error fixing counter assignments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/reorder', authenticateToken, requireCashierOrAdmin, logActivity('reorder_queue'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerIds } = req.body;

    if (!customerIds || !Array.isArray(customerIds)) {
      res.status(400).json({ error: 'Customer IDs array is required' });
      return;
    }

    const updatedQueue = await QueueService.reorderQueue(customerIds);
    res.json(updatedQueue);
  } catch (error) {
    console.error('Error reordering queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change customer status with validation
router.post('/change-status', authenticateToken, requireCashierOrAdmin, logActivity('change_queue_status'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { customerId, status } = req.body;

    if (!customerId || !status) {
      res.status(400).json({ error: 'Customer ID and status are required' });
      return;
    }

    // Validate status is one of the valid enum values
    const validStatuses = ['waiting', 'serving', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status.toLowerCase())) {
      res.status(400).json({ 
        error: 'Invalid status. Valid statuses are: waiting, serving, processing, completed, cancelled' 
      });
      return;
    }

    const customer = await QueueService.changeStatus(
      parseInt(customerId, 10),
      status.toLowerCase() as QueueStatus,
      req.user?.id,
      req.user?.role
    );
    
    res.json(customer);
  } catch (error) {
    console.error('Error changing queue status:', error);
    if (error instanceof Error) {
      if (error.message.includes('Invalid status transition')) {
        res.status(400).json({ error: error.message });
      } else if (error.message === 'Customer not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * PATCH /api/queue/:id/status - Update queue status to 'processing'
 * 
 * API v1.1 - Accepts { status: 'processing' } for marking customers as processing.
 * 
 * Note: Clients should ignore unknown future statuses for forward compatibility.
 * This endpoint specifically supports the 'processing' status as part of the enhanced
 * queue workflow for customers whose orders are being prepared.
 */
router.patch('/:id/status', authenticateToken, requireCashierOrAdmin, logActivity('patch_queue_status'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    // For PATCH endpoint, we primarily support 'processing' status
    // but allow other valid statuses for flexibility
    const validStatuses = ['waiting', 'serving', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status.toLowerCase())) {
      res.status(400).json({ 
        error: 'Invalid status. Valid statuses are: waiting, serving, processing, completed, cancelled',
        note: 'Clients should ignore unknown future statuses for forward compatibility'
      });
      return;
    }

    const customerId = parseInt(id, 10);
    if (isNaN(customerId)) {
      res.status(400).json({ error: 'Invalid customer ID' });
      return;
    }

    const customer = await QueueService.changeStatus(
      customerId,
      status.toLowerCase() as QueueStatus,
      req.user?.id,
      req.user?.role
    );
    
    res.json(customer);
  } catch (error) {
    console.error('Error updating queue status via PATCH:', error);
    if (error instanceof Error) {
      if (error.message.includes('Invalid status transition')) {
        res.status(400).json({ error: error.message });
      } else if (error.message === 'Customer not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Reset entire queue (Admin only)
router.post('/reset', authenticateToken, logActivity('reset_queue'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only administrators can reset the queue' });
      return;
    }

    const { reason } = req.body;
    const result = await QueueService.resetQueue(req.user.id, reason);
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error resetting queue:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
