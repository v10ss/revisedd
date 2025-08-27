import express, { Router, Response } from 'express';
import { enhancedExportService } from '../services/enhancedExportService';
import { AuthRequest } from '../types';

const { authenticateToken, logActivity } = require('../middleware/auth');
const router: express.Router = Router();

// Get export progress
router.get('/:exportId/progress', authenticateToken, logActivity('get_export_progress'), async (req: AuthRequest, res: Response) => {
  try {
    const { exportId } = req.params;
    
    const progress = enhancedExportService.getExportProgress(exportId);
    
    if (!progress) {
      res.status(404).json({ error: 'Export not found or expired' });
      return;
    }
    
    res.json(progress);
  } catch (error) {
    console.error('Error getting export progress:', error);
    res.status(500).json({ error: 'Failed to get export progress' });
  }
});

// Download completed export
router.get('/:exportId/download', authenticateToken, logActivity('download_export'), async (req: AuthRequest, res: Response) => {
  try {
    const { exportId } = req.params;
    
    const progress = enhancedExportService.getExportProgress(exportId);
    
    if (!progress) {
      res.status(404).json({ error: 'Export not found or expired' });
      return;
    }
    
    if (progress.progress !== 100) {
      res.status(400).json({ 
        error: 'Export not completed yet',
        progress: progress.progress,
        status: progress.status
      });
      return;
    }
    
    // In a real implementation, you would store the file and provide download
    res.status(501).json({ 
      error: 'File download not implemented - files are returned directly for now',
      message: 'Use the original export endpoints for direct file downloads'
    });
  } catch (error) {
    console.error('Error downloading export:', error);
    res.status(500).json({ error: 'Failed to download export' });
  }
});

// Cancel export operation
router.delete('/:exportId', authenticateToken, logActivity('cancel_export'), async (req: AuthRequest, res: Response) => {
  try {
    const { exportId } = req.params;
    
    const cancelled = enhancedExportService.cancelExport(exportId);
    
    if (!cancelled) {
      res.status(404).json({ error: 'Export not found or already completed' });
      return;
    }
    
    res.json({ message: 'Export cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling export:', error);
    res.status(500).json({ error: 'Failed to cancel export' });
  }
});

// Get all active exports (admin only)
router.get('/active', authenticateToken, logActivity('get_active_exports'), async (req: AuthRequest, res: Response) => {
  try {
    // Only allow admin users to see all active exports
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    
    const activeExports = enhancedExportService.getActiveExports();
    
    res.json({
      exports: activeExports,
      total: activeExports.length
    });
  } catch (error) {
    console.error('Error getting active exports:', error);
    res.status(500).json({ error: 'Failed to get active exports' });
  }
});

// Get export statistics (admin only)
router.get('/statistics', authenticateToken, logActivity('get_export_statistics'), async (req: AuthRequest, res: Response) => {
  try {
    // Only allow admin users to see export statistics
    if (req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    
    const statistics = enhancedExportService.getExportStatistics();
    
    res.json(statistics);
  } catch (error) {
    console.error('Error getting export statistics:', error);
    res.status(500).json({ error: 'Failed to get export statistics' });
  }
});

// WebSocket endpoint for real-time progress updates
router.get('/:exportId/stream', authenticateToken, (req: AuthRequest, res: Response) => {
  const { exportId } = req.params;
  
  // Set up Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial progress
  const initialProgress = enhancedExportService.getExportProgress(exportId);
  if (initialProgress) {
    res.write(`data: ${JSON.stringify(initialProgress)}\n\n`);
  }

  // Set up progress listener
  const progressListener = (progress: any) => {
    if (progress.id === exportId) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
      
      // Close connection when export is complete or failed
      if (progress.progress === 100 || progress.progress === -1) {
        res.end();
      }
    }
  };

  enhancedExportService.on('progressUpdate', progressListener);
  enhancedExportService.on('exportCompleted', progressListener);
  enhancedExportService.on('exportFailed', progressListener);
  enhancedExportService.on('exportCancelled', progressListener);

  // Clean up when client disconnects
  req.on('close', () => {
    enhancedExportService.removeListener('progressUpdate', progressListener);
    enhancedExportService.removeListener('exportCompleted', progressListener);
    enhancedExportService.removeListener('exportFailed', progressListener);
    enhancedExportService.removeListener('exportCancelled', progressListener);
  });

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`data: {"type": "heartbeat", "timestamp": "${new Date().toISOString()}"}\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

export default router;
