#!/bin/bash
# E-commerce Analytics - Setup Verification Script

echo "======================================"
echo "E-commerce Analytics Setup Check"
echo "======================================"
echo ""

# Check backend
echo "1. Checking Backend (Port 8000)..."
if nc -z localhost 8000 2>/dev/null || curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo "   ✅ Backend is running"
else
    echo "   ❌ Backend is NOT running - Start with: cd backend && python run.py"
fi

# Check frontend
echo ""
echo "2. Checking Frontend (Port 3000)..."
if nc -z localhost 3000 2>/dev/null || curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Frontend is running"
else
    echo "   ❌ Frontend is NOT running - Start with: cd storefront && npm run dev"
fi

# Check env configuration
echo ""
echo "3. Checking Environment Configuration..."
if grep -q "NEXT_PUBLIC_API_BASE" storefront/.env.local 2>/dev/null; then
    API_BASE=$(grep "NEXT_PUBLIC_API_BASE" storefront/.env.local | cut -d= -f2)
    echo "   ✅ NEXT_PUBLIC_API_BASE is set to: $API_BASE"
else
    echo "   ⚠️  NEXT_PUBLIC_API_BASE not found"
fi

echo ""
echo "======================================"
echo "Admin Account Creation Instructions"
echo "======================================"
echo ""
echo "1. Go to http://localhost:3000/login"
echo "2. Click 'Register' tab"
echo "3. Fill in the form:"
echo "   - Name: Your Name"
echo "   - Gender: Male/Female (optional)"
echo "   - Account Type: Select 'Admin (KPI Dashboard Access)'"
echo "   - Email: your.email@example.com"
echo "   - Password: secure_password"
echo "4. Click 'Create Account'"
echo ""
echo "5. You will be logged in - you can now access:"
echo "   - Admin Dashboard: http://localhost:3000/admin"
echo "   - Analytics: http://localhost:3000/analytics"
echo ""
echo "======================================"
