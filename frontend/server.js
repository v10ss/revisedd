const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Check if build directory exists
const buildPath = path.join(__dirname, 'build');
if (!fs.existsSync(buildPath)) {
  console.error(`Build directory does not exist at: ${buildPath}`);
  process.exit(1);
}

// Check if index.html exists
const indexPath = path.join(buildPath, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error(`index.html does not exist at: ${indexPath}`);
  process.exit(1);
}

console.log(`Build directory: ${buildPath}`);
console.log(`Index file: ${indexPath}`);

// Serve static files from the React app build directory
app.use(express.static(buildPath, {
  maxAge: '1d',
  index: false // Don't serve index.html for directory requests
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle React Router routes - send all non-static requests to React app
app.get('*', (req, res) => {
  console.log(`Serving React app for route: ${req.path}`);
  res.sendFile(indexPath);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal Server Error');
});

app.listen(port, () => {
  console.log(`Express server is running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Build directory exists: ${fs.existsSync(buildPath)}`);
  console.log(`Index.html exists: ${fs.existsSync(indexPath)}`);
});
