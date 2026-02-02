#!/bin/bash

# VPS Deployment Script for Grocery POS Server
# Usage: ./deploy-vps.sh [user@host] [path]

set -e

# Configuration
VPS_USER="${1:-root}"
VPS_HOST="${2:-your-vps-host.com}"
VPS_PATH="${3:-/opt/grocery-pos}"
APP_NAME="grocery-pos-api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[Deploy]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[Warning]${NC} $1"
}

error() {
    echo -e "${RED}[Error]${NC} $1"
    exit 1
}

# Check if required tools are installed
command -v ssh >/dev/null 2>&1 || error "ssh is required but not installed"
command -v scp >/dev/null 2>&1 || error "scp is required but not installed"
command -v npm >/dev/null 2>&1 || error "npm is required but not installed"

# Build the server
log "Building server..."
npm run build:server

# Create deployment archive
log "Creating deployment archive..."
DEPLOY_DIR="dist/server"
ARCHIVE_NAME="grocery-pos-server.tar.gz"

if [ ! -d "$DEPLOY_DIR" ]; then
    error "Build directory not found. Run npm run build:server first"
fi

cd "$DEPLOY_DIR"
tar -czf "../$ARCHIVE_NAME" .
cd -

# Upload to VPS
log "Uploading to VPS ($VPS_USER@$VPS_HOST:$VPS_PATH)..."
ssh "$VPS_USER@$VPS_HOST" "mkdir -p $VPS_PATH"
scp "dist/$ARCHIVE_NAME" "$VPS_USER@$VPS_HOST:$VPS_PATH/"

# Deploy on VPS
log "Deploying on VPS..."
ssh "$VPS_USER@$VPS_HOST" << EOF
    cd $VPS_PATH

    # Stop existing service if running
    pm2 stop $APP_NAME 2>/dev/null || true

    # Backup current deployment
    if [ -d "current" ]; then
        mv current backup-\$(date +%Y%m%d_%H%M%S)
    fi

    # Extract new deployment
    mkdir -p current
    tar -xzf $ARCHIVE_NAME -C current
    rm $ARCHIVE_NAME

    cd current

    # Install production dependencies
    npm install --production

    # Run database migrations
    npx prisma migrate deploy

    # Start/restart with PM2
    pm2 start main.js --name $APP_NAME --update-env
    pm2 save

    # Cleanup old backups (keep last 3)
    cd $VPS_PATH
    ls -dt backup-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true

    echo "Deployment completed successfully!"
EOF

log "Deployment finished!"
log "Check status: ssh $VPS_USER@$VPS_HOST 'pm2 status $APP_NAME'"
log "View logs: ssh $VPS_USER@$VPS_HOST 'pm2 logs $APP_NAME'"
