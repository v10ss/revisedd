# Bulk Export Functionality Update

## Overview

The bulk export functionality has been updated to support exporting selected customers with improved memory management and proper page breaks. This update provides enhanced capabilities for handling large customer exports while maintaining system performance.

## Key Features

### 1. Selected Customer Export
- Users can now select specific customers and export only those selected
- Supports batch processing for memory efficiency
- Maintains all existing filtering capabilities as fallback

### 2. Single-Page Template for Each Customer
- Each customer gets their own dedicated page in PDF exports
- Consistent formatting using the established single-customer template
- Proper page breaks between customers

### 3. Memory-Efficient Processing
- Batch processing for large customer lists
- Configurable delays between batches to prevent memory pressure
- Different batch sizes for different export types (Excel vs PDF vs Detailed PDF)

### 4. Enhanced Error Handling
- Graceful failure handling - continues processing even if individual customers fail
- Comprehensive error logging with context
- User-friendly error messages

## Updated Endpoints

### POST /api/customers/export/excel
**New Parameters:**
- `customerIds` (array, optional): Array of customer IDs to export

**Behavior:**
- If `customerIds` is provided and not empty: exports only selected customers
- If `customerIds` is not provided or empty: falls back to existing filter-based export
- Returns Excel file with selected customers

### POST /api/customers/export/pdf
**New Parameters:**
- `customerIds` (array, optional): Array of customer IDs to export

**Behavior:**
- If `customerIds` is provided and not empty: exports selected customers using single-page template
- If `customerIds` is not provided or empty: falls back to existing list-style PDF export
- Each customer gets their own page with complete details

### POST /api/customers/export/detailed-pdf
**New Parameters:**
- `customerIds` (array, optional): Array of customer IDs to export

**Behavior:**
- If `customerIds` is provided and not empty: exports selected customers using detailed template
- If `customerIds` is not provided or empty: falls back to existing filter-based detailed export
- Uses enhanced detailed template with professional formatting

## New Service Methods

### ExportService

#### `exportSelectedCustomersToExcel(customerIds: number[])`
- Exports selected customers to Excel format
- Memory-efficient batch processing (50 customers per batch)
- Uses same formatting as existing Excel export

#### `exportSelectedCustomersToPDF(customerIds: number[])`
- Exports selected customers to PDF using single-page template
- Each customer on separate page with complete details
- Batch processing with 50 customers per batch

#### `getCustomersByIds(customerIds: number[])` (private)
- Memory-efficient customer retrieval by IDs
- Batch processing to handle large selections
- Filters out invalid/missing customers automatically

#### `renderSingleCustomerPage(doc, customer, pageNumber, totalCustomers)` (private)
- Renders individual customer page using single-customer template
- Proper formatting and error handling
- Page numbering and export information

### DetailedExportService

#### `exportSelectedCustomersToDetailedPDF(customerIds: number[])`
- Exports selected customers using detailed template
- One customer per page with enhanced formatting
- Smaller batch size (25 customers) due to detailed formatting complexity

#### `getCustomersByIds(customerIds: number[])` (private)
- Similar to ExportService but optimized for detailed export
- Smaller batch size and longer delays for memory management

## Memory Management Features

### Batch Processing
- **Excel Export**: 50 customers per batch
- **PDF Export**: 50 customers per batch
- **Detailed PDF Export**: 25 customers per batch (more memory intensive)

### Delay Management
- Small delays between batches prevent memory pressure
- Configurable delays based on export type:
  - Standard exports: 10ms delay
  - Detailed exports: 25ms delay
  - Large detailed exports (>20 customers): 5ms delay between customers

### Error Recovery
- Individual customer failures don't stop the entire export
- Comprehensive error logging for debugging
- Graceful degradation when customers can't be loaded

## Usage Examples

### Frontend Implementation
```javascript
// Export selected customers to Excel
const exportSelectedToExcel = async (selectedCustomerIds) => {
  try {
    const response = await fetch('/api/customers/export/excel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        customerIds: selectedCustomerIds
      })
    });
    
    if (!response.ok) throw new Error('Export failed');
    
    const blob = await response.blob();
    downloadFile(blob, 'selected-customers.xlsx');
  } catch (error) {
    console.error('Export error:', error);
  }
};

// Export with filters (existing behavior)
const exportWithFilters = async (filters) => {
  const response = await fetch('/api/customers/export/excel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      searchTerm: filters.search,
      statusFilter: filters.status,
      dateFilter: filters.dateRange
    })
  });
  // ... handle response
};
```

### Backend Usage
```typescript
// Export selected customers
const customerIds = [1, 2, 3, 4, 5];
const buffer = await ExportService.exportSelectedCustomersToExcel(customerIds);

// Export with detailed template
const detailedBuffer = await DetailedExportService.exportSelectedCustomersToDetailedPDF(customerIds);
```

## Performance Considerations

### Large Exports
- Batch processing prevents memory overflow
- Progressive delays manage system resources
- Error isolation prevents cascade failures

### Memory Usage
- Standard PDF: ~1-2MB per 100 customers
- Detailed PDF: ~3-5MB per 100 customers
- Excel: ~500KB per 1000 customers

### Recommended Limits
- Standard exports: Up to 1000 customers
- Detailed exports: Up to 500 customers
- Consider pagination for larger datasets

## Error Scenarios

### Common Errors
1. **"No customers selected for export"** - Empty or invalid customerIds array
2. **"No customers found to export"** - All provided customer IDs are invalid
3. **"Failed to generate PDF file"** - System resource or PDF generation error

### Error Handling
- Individual customer errors are logged but don't stop export
- Comprehensive error context for debugging
- User-friendly error messages in API responses

## Migration Notes

### Backward Compatibility
- All existing export functionality remains unchanged
- New `customerIds` parameter is optional
- Existing frontend code continues to work without modification

### Frontend Updates Required
- Add customer selection UI components
- Implement `customerIds` parameter in export requests
- Handle new error scenarios appropriately

## Testing

### Unit Tests
- Test individual customer export functionality
- Verify batch processing logic
- Test error handling scenarios

### Integration Tests
- Test end-to-end export workflows
- Verify memory management with large datasets
- Test concurrent export scenarios

### Performance Tests
- Benchmark export times with various customer counts
- Monitor memory usage during large exports
- Test system stability under load

## Future Enhancements

### Potential Improvements
1. **Progress Indicators**: Real-time export progress updates
2. **Background Processing**: Queue large exports for background processing
3. **Export Templates**: Customizable export templates
4. **Compression**: Automatic compression for large exports
5. **Caching**: Cache frequently exported customer data

### Scalability Considerations
- Consider implementing export queues for very large datasets
- Add export job status tracking
- Implement export result caching
