#!/bin/bash

# Build script for Render deployment
set -e

echo "🚀 Starting EscaShop build process..."

# Install dependencies and build backend
echo "📦 Building backend..."
cd backend
npm ci
npm run build:prod
cd ..

# Install dependencies and build frontend
echo "🎨 Building frontend..."
cd frontend
npm ci
npm run build
cd ..

echo "✅ Build completed successfully!"
