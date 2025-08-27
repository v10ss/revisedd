import { EventEmitter } from 'events';
import { ExportService } from './export';
import { DetailedExportService } from './detailedExport';

export interface ExportProgress {
  id: string;
  progress: number;
  status: string;
  startTime: Date;
  estimatedCompletion?: Date;
  totalRecords?: number;
  processedRecords?: number;
  error?: string;
}

export interface ExportOptions {
  format: 'xlsx' | 'pdf';
  searchTerm?: string;
  statusFilter?: string;
  dateFilter?: { start: string, end: string };
  customerIds?: number[];
  exportType: 'single' | 'multiple' | 'selected' | 'detailed';
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
  metadata: {
    totalRecords: number;
    exportTime: number;
    generatedAt: string;
  };
}

export class EnhancedExportService extends EventEmitter {
  private static instance: EnhancedExportService;
  private activeExports: Map<string, ExportProgress> = new Map();
  private readonly MAX_CONCURRENT_EXPORTS = 3;
  private readonly EXPORT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  private constructor() {
    super();
    this.setupCleanupTimer();
  }

  static getInstance(): EnhancedExportService {
    if (!this.instance) {
      this.instance = new EnhancedExportService();
    }
    return this.instance;
  }

  /**
   * Start a new export operation with progress tracking
   */
  async startExport(options: ExportOptions): Promise<{ exportId: string; result: Promise<ExportResult> }> {
    // Check if we have reached the maximum concurrent exports
    if (this.activeExports.size >= this.MAX_CONCURRENT_EXPORTS) {
      throw new Error('Maximum concurrent exports reached. Please try again later.');
    }

    const exportId = this.generateExportId();
    const startTime = new Date();

    // Initialize progress tracking
    const progress: ExportProgress = {
      id: exportId,
      progress: 0,
      status: 'Initializing export...',
      startTime,
      estimatedCompletion: new Date(Date.now() + this.EXPORT_TIMEOUT)
    };

    this.activeExports.set(exportId, progress);
    this.emit('exportStarted', { exportId, options });

    // Set up progress callback
    ExportService.registerProgressCallback(exportId, (progress: number, status: string) => {
      this.updateExportProgress(exportId, progress, status);
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      this.handleExportTimeout(exportId);
    }, this.EXPORT_TIMEOUT);

    // Start the export operation
    const resultPromise = this.executeExport(exportId, options)
      .then((result) => {
        clearTimeout(timeoutId);
        this.completeExport(exportId, result);
        return result;
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        this.handleExportError(exportId, error);
        throw error;
      });

    return { exportId, result: resultPromise };
  }

  /**
   * Execute the actual export operation
   */
  private async executeExport(exportId: string, options: ExportOptions): Promise<ExportResult> {
    const startTime = Date.now();

    let buffer: Buffer;
    let filename: string;
    let contentType: string;
    let totalRecords = 0;

    try {
      switch (options.exportType) {
        case 'single':
          if (!options.customerIds || options.customerIds.length !== 1) {
            throw new Error('Single export requires exactly one customer ID');
          }
          
          if (options.format === 'xlsx') {
            buffer = await ExportService.exportCustomerToExcel(options.customerIds[0], exportId);
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          } else {
            buffer = await ExportService.exportCustomerToPDF(options.customerIds[0]);
            contentType = 'application/pdf';
          }
          
          filename = this.generateFilename('customer', options.format, { id: options.customerIds[0] });
          totalRecords = 1;
          break;

        case 'multiple':
          if (options.format === 'xlsx') {
            buffer = await ExportService.exportCustomersToExcel(
              options.searchTerm,
              options.statusFilter,
              options.dateFilter,
              exportId
            );
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          } else {
            buffer = await ExportService.exportCustomersToPDF(
              options.searchTerm,
              options.statusFilter,
              options.dateFilter,
              exportId
            );
            contentType = 'application/pdf';
          }
          
          filename = this.generateFilename('customers', options.format, undefined, {
            searchTerm: options.searchTerm,
            statusFilter: options.statusFilter,
            dateRange: options.dateFilter
          });
          
          // Get the actual count from progress tracking
          const progress = this.activeExports.get(exportId);
          totalRecords = progress?.processedRecords || 0;
          break;

        case 'selected':
          if (!options.customerIds || options.customerIds.length === 0) {
            throw new Error('Selected export requires customer IDs');
          }

          if (options.format === 'xlsx') {
            buffer = await ExportService.exportSelectedCustomersToExcel(options.customerIds);
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          } else {
            buffer = await ExportService.exportSelectedCustomersToPDF(options.customerIds);
            contentType = 'application/pdf';
          }
          
          filename = this.generateFilename('customers', options.format, undefined, {
            count: options.customerIds.length
          });
          totalRecords = options.customerIds.length;
          break;

        case 'detailed':
          if (!options.customerIds || options.customerIds.length === 0) {
            throw new Error('Detailed export requires customer IDs');
          }

          if (options.format === 'pdf') {
            buffer = await DetailedExportService.exportSelectedCustomersToDetailedPDF(options.customerIds);
            contentType = 'application/pdf';
          } else {
            throw new Error('Detailed export is only available in PDF format');
          }
          
          filename = this.generateFilename('customers_detailed', 'pdf', undefined, {
            count: options.customerIds.length
          });
          totalRecords = options.customerIds.length;
          break;

        default:
          throw new Error(`Unsupported export type: ${options.exportType}`);
      }

      const exportTime = Date.now() - startTime;

      return {
        buffer,
        filename,
        contentType,
        metadata: {
          totalRecords,
          exportTime,
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      throw new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update export progress
   */
  private updateExportProgress(exportId: string, progress: number, status: string): void {
    const exportProgress = this.activeExports.get(exportId);
    if (!exportProgress) return;

    exportProgress.progress = progress;
    exportProgress.status = status;

    // Extract processed records from status if available
    const recordsMatch = status.match(/(\d+)\/(\d+)/);
    if (recordsMatch) {
      exportProgress.processedRecords = parseInt(recordsMatch[1]);
      exportProgress.totalRecords = parseInt(recordsMatch[2]);
    }

    // Calculate estimated completion time
    if (progress > 0 && progress < 100) {
      const elapsed = Date.now() - exportProgress.startTime.getTime();
      const estimatedTotal = (elapsed / progress) * 100;
      exportProgress.estimatedCompletion = new Date(exportProgress.startTime.getTime() + estimatedTotal);
    }

    this.activeExports.set(exportId, exportProgress);
    this.emit('progressUpdate', exportProgress);
  }

  /**
   * Complete export operation
   */
  private completeExport(exportId: string, result: ExportResult): void {
    const progress = this.activeExports.get(exportId);
    if (progress) {
      progress.progress = 100;
      progress.status = 'Export completed successfully';
      progress.processedRecords = result.metadata.totalRecords;
      this.emit('exportCompleted', { exportId, result, progress });
    }

    // Clean up
    ExportService.removeProgressCallback(exportId);
    setTimeout(() => {
      this.activeExports.delete(exportId);
    }, 30000); // Keep for 30 seconds for status checking
  }

  /**
   * Handle export error
   */
  private handleExportError(exportId: string, error: Error): void {
    const progress = this.activeExports.get(exportId);
    if (progress) {
      progress.progress = -1;
      progress.status = 'Export failed';
      progress.error = error.message;
      this.emit('exportFailed', { exportId, error, progress });
    }

    // Clean up
    ExportService.removeProgressCallback(exportId);
    setTimeout(() => {
      this.activeExports.delete(exportId);
    }, 30000); // Keep for 30 seconds for status checking
  }

  /**
   * Handle export timeout
   */
  private handleExportTimeout(exportId: string): void {
    const error = new Error('Export operation timed out');
    this.handleExportError(exportId, error);
  }

  /**
   * Get export progress
   */
  getExportProgress(exportId: string): ExportProgress | null {
    return this.activeExports.get(exportId) || null;
  }

  /**
   * Get all active exports
   */
  getActiveExports(): ExportProgress[] {
    return Array.from(this.activeExports.values());
  }

  /**
   * Cancel an export operation
   */
  cancelExport(exportId: string): boolean {
    const progress = this.activeExports.get(exportId);
    if (!progress) {
      return false;
    }

    progress.progress = -1;
    progress.status = 'Export cancelled';
    this.emit('exportCancelled', { exportId, progress });

    // Clean up
    ExportService.removeProgressCallback(exportId);
    this.activeExports.delete(exportId);
    
    return true;
  }

  /**
   * Generate a unique export ID
   */
  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate clean filename with proper conventions
   */
  private generateFilename(type: string, format: string, customerInfo?: { id?: number, name?: string }, options?: any): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    
    if (type === 'customer' && customerInfo) {
      // Single customer export
      return `escashop_customer_${customerInfo.id}_${timestamp}.${format}`;
    } else {
      // Multiple customers export
      let filename = `escashop_${type}`;
      
      if (options?.searchTerm) {
        const cleanTerm = options.searchTerm.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
        filename += `_search_${cleanTerm}`;
      }
      
      if (options?.statusFilter) {
        filename += `_status_${options.statusFilter}`;
      }
      
      if (options?.dateRange) {
        filename += `_${options.dateRange.start}_to_${options.dateRange.end}`;
      }
      
      if (options?.count) {
        filename += `_${options.count}_records`;
      }
      
      filename += `_${timestamp}.${format}`;
      return filename;
    }
  }

  /**
   * Set up cleanup timer to remove old exports
   */
  private setupCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      const cutoff = 24 * 60 * 60 * 1000; // 24 hours

      for (const [exportId, progress] of this.activeExports.entries()) {
        if (now - progress.startTime.getTime() > cutoff) {
          this.activeExports.delete(exportId);
          ExportService.removeProgressCallback(exportId);
        }
      }
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Get export statistics
   */
  getExportStatistics(): {
    activeExports: number;
    completedToday: number;
    failedToday: number;
    averageExportTime: number;
  } {
    const active = this.activeExports.size;
    
    // These would ideally be tracked in a persistent storage
    // For now, return basic statistics
    return {
      activeExports: active,
      completedToday: 0, // Would need to implement persistent tracking
      failedToday: 0,    // Would need to implement persistent tracking
      averageExportTime: 0 // Would need to implement persistent tracking
    };
  }
}

// Export singleton instance
export const enhancedExportService = EnhancedExportService.getInstance();
