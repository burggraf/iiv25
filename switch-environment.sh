#!/bin/bash

# switch-environment.sh
# Script to switch between development and production environments for Is It Vegan app

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ Error: .env file not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Function to show usage
show_usage() {
    echo -e "${BLUE}📋 Usage:${NC}"
    echo "  ./switch-environment.sh dev      - Switch to development environment"
    echo "  ./switch-environment.sh prod     - Switch to production environment"
    echo "  ./switch-environment.sh status   - Show current environment"
    echo ""
}

# Function to show current environment
show_current_env() {
    local current_env=$(grep "EXPO_PUBLIC_ENVIRONMENT=" .env | cut -d'=' -f2)
    local current_url=$(grep "EXPO_PUBLIC_SUPABASE_URL=" .env | cut -d'=' -f2)
    local current_name=$(grep "EXPO_PUBLIC_APP_NAME=" .env | cut -d'=' -f2 | tr -d '"')
    
    echo -e "${BLUE}📊 Current Environment Status:${NC}"
    echo -e "  Environment: ${YELLOW}${current_env}${NC}"
    echo -e "  App Name: ${YELLOW}${current_name}${NC}"
    echo -e "  Supabase URL: ${YELLOW}${current_url}${NC}"
    
    # Show current Supabase CLI link status
    if command -v supabase &> /dev/null && command -v npm &> /dev/null; then
        echo -e "${BLUE}  Supabase CLI Status:${NC}"
        npm run supabase:status 2>/dev/null | grep -E "●|Connected" | head -1 | sed 's/^/    /' || echo -e "    ${YELLOW}Unable to determine CLI status${NC}"
    fi
    echo ""
}

# Function to switch to development
switch_to_dev() {
    echo -e "${YELLOW}🔄 Switching to DEVELOPMENT environment...${NC}"
    
    # Update .env file
    sed -i '' 's|EXPO_PUBLIC_SUPABASE_URL=.*|EXPO_PUBLIC_SUPABASE_URL=https://wpjqtgkfgvheisgcxhxu.supabase.co|' .env
    sed -i '' 's|EXPO_PUBLIC_SUPABASE_ANON_KEY=.*|EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndwanF0Z2tmZ3ZoZWlzZ2N4aHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDEzNzksImV4cCI6MjA2OTcxNzM3OX0.hPO_VSjIfP6lT8WBQ4HDDKFS1quknTr1gWHSyp6LVwQ|' .env
    sed -i '' 's|EXPO_PUBLIC_APP_NAME=.*|EXPO_PUBLIC_APP_NAME="Is It Vegan? (Dev)"|' .env
    sed -i '' 's|ENVIRONMENT=.*|ENVIRONMENT=development|' .env
    sed -i '' 's|EXPO_PUBLIC_ENVIRONMENT=.*|EXPO_PUBLIC_ENVIRONMENT=development|' .env
    
    # Switch Supabase CLI to development project
    echo -e "${YELLOW}🔗 Linking Supabase CLI to development project...${NC}"
    if command -v supabase &> /dev/null; then
        npm run supabase:dev
        echo -e "${GREEN}✅ Supabase CLI linked to development project${NC}"
    else
        echo -e "${YELLOW}⚠️  Supabase CLI not found, skipping CLI link${NC}"
    fi
    
    echo -e "${GREEN}✅ Switched to DEVELOPMENT environment${NC}"
    echo -e "${GREEN}   • Uses development Supabase backend (wpjqtgkfgvheisgcxhxu)${NC}"
    echo -e "${GREEN}   • Shows '🚧 DEVELOPMENT' environment banner${NC}"
    echo -e "${GREEN}   • App name: 'Is It Vegan? (Dev)'${NC}"
    echo -e "${GREEN}   • Supabase CLI linked to development project${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  You need to rebuild your development client to see changes:${NC}"
    echo -e "   ./local-ios-development-build.sh --device"
}

# Function to switch to production
switch_to_prod() {
    echo -e "${YELLOW}🔄 Switching to PRODUCTION environment...${NC}"
    
    # Update .env file
    sed -i '' 's|EXPO_PUBLIC_SUPABASE_URL=.*|EXPO_PUBLIC_SUPABASE_URL=https://isitvegan.supabase.co|' .env
    sed -i '' 's|EXPO_PUBLIC_SUPABASE_ANON_KEY=.*|EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsYXRuenNucmx3eWtrcmlvdndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMjY5NTcsImV4cCI6MjA2NzkwMjk1N30.dJaysEtKuM4td0LnZUtcVaBk9VWW0TBvvkDRqLpzh4s|' .env
    sed -i '' 's|EXPO_PUBLIC_APP_NAME=.*|EXPO_PUBLIC_APP_NAME="Is It Vegan?"|' .env
    sed -i '' 's|ENVIRONMENT=.*|ENVIRONMENT=production|' .env
    sed -i '' 's|EXPO_PUBLIC_ENVIRONMENT=.*|EXPO_PUBLIC_ENVIRONMENT=production|' .env
    
    # Switch Supabase CLI to production project
    echo -e "${YELLOW}🔗 Linking Supabase CLI to production project...${NC}"
    if command -v supabase &> /dev/null; then
        npm run supabase:prod
        echo -e "${GREEN}✅ Supabase CLI linked to production project${NC}"
    else
        echo -e "${YELLOW}⚠️  Supabase CLI not found, skipping CLI link${NC}"
    fi
    
    echo -e "${GREEN}✅ Switched to PRODUCTION environment${NC}"
    echo -e "${GREEN}   • Uses production Supabase backend (wlatnzsnrlwykkriovwd)${NC}"
    echo -e "${GREEN}   • No environment banner (production)${NC}"
    echo -e "${GREEN}   • App name: 'Is It Vegan?'${NC}"
    echo -e "${GREEN}   • Supabase CLI linked to production project${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  You need to rebuild your development client to see changes:${NC}"
    echo -e "   ./local-ios-development-build.sh --device"
}

# Main script logic
case "$1" in
    "dev"|"development")
        show_current_env
        switch_to_dev
        echo ""
        show_current_env
        ;;
    "prod"|"production")
        show_current_env
        switch_to_prod
        echo ""
        show_current_env
        ;;
    "status"|"current")
        show_current_env
        ;;
    *)
        echo -e "${RED}❌ Invalid or missing argument${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac

echo -e "${BLUE}💡 Tip: Run './switch-environment.sh status' anytime to check current environment${NC}"