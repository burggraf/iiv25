#!/bin/bash

# Is It Vegan Website Deployment Script
# This script deploys the static website to Cloudflare Pages and the contact form worker

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the correct directory
if [ ! -f "wrangler.toml" ]; then
    print_error "wrangler.toml not found. Please run this script from the website directory."
    exit 1
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    print_error "Wrangler CLI is not installed. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if user is logged in to Cloudflare
print_status "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    print_warning "Not authenticated with Cloudflare. Please run:"
    echo "wrangler login"
    exit 1
fi

print_success "Authenticated with Cloudflare"

# Deploy the contact form worker first
print_status "Deploying contact form worker..."
cd functions
if wrangler deploy --env production; then
    print_success "Contact form worker deployed successfully"
else
    print_error "Failed to deploy contact form worker"
    exit 1
fi
cd ..

# Deploy the main website to Cloudflare Pages
print_status "Deploying website to Cloudflare Pages..."
if wrangler pages deploy public --project-name isitvegan-website; then
    print_success "Website deployed successfully to Cloudflare Pages"
else
    print_error "Failed to deploy website"
    exit 1
fi

print_success "🎉 Deployment completed successfully!"
print_status "Your website should be available at:"
echo "  • https://isitvegan.net"
echo "  • https://www.isitvegan.net"
echo ""
print_status "Contact form endpoint:"
echo "  • https://isitvegan.net/api/contact"
echo ""
print_warning "Make sure to:"
echo "  1. Configure DNS records in Cloudflare Dashboard"
echo "  2. Set up email service API keys as secrets"
echo "  3. Test the contact form functionality"