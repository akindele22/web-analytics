# Admin Authentication System

## Overview

The E-commerce Analytics platform has a complete role-based access control system with two user types:

### User Roles

1. **Standard User**
   - Can browse the store
   - Can add items to cart
   - Can checkout and make purchases
   - Can view products
   - **Cannot** access `/admin` or `/analytics` routes

2. **Admin**
   - Full access to admin dashboard (`/admin`)
   - Full access to detailed analytics (`/analytics`)
   - Can view all KPIs and metrics
   - Can see product interaction data
   - All standard store features

## Architecture

### Frontend (React/Next.js)

#### Authentication Flow
```
User Registration/Login
    ↓
[API Request to Backend]
    ↓
[JWT/Session Set via httpOnly Cookie]
    ↓
[User Profile Stored in localStorage]
    ↓
Frontend Routes Check Role
    ↓
Redirect if Non-Admin to /login
```

#### Key Files
- `src/lib/auth.ts` - Authentication functions (login, register, logout, fetchMe)
- `src/app/login/page.tsx` - Registration & login form with role selector
- `src/app/admin/page.tsx` - Admin dashboard (role-protected)
- `src/app/analytics/layout.tsx` - Analytics routes (role-protected)
- `src/components/AdminGuard.tsx` - Reusable role-check component

### Backend (Flask/Python)

#### Authentication Endpoints
```
POST /api/auth/register
- Input: { name, email, password, gender?, role? }
- Output: { ok: true, user: { user_id, name, email, role } }
- Sets: httpOnly cookie with session token

POST /api/auth/login
- Input: { email, password }
- Output: { ok: true, user: { user_id, name, email, role } }
- Sets: httpOnly cookie with session token

POST /api/auth/logout
- Clears session

GET /api/auth/me
- Returns current user or null
```

#### Protected KPI Endpoints
```
GET /api/kpis/overview (ADMIN ONLY)
GET /api/kpis/top-products (ADMIN ONLY)
GET /api/kpis/interaction-cube (ADMIN ONLY)
GET /api/kpis/site-analytics (ADMIN ONLY)
```

All return `401 Unauthorized` or `403 Forbidden` if user is not admin.

#### Key Files
- `backend/app/api.py` - Main API with auth endpoints
- `backend/app/config.py` - Configuration (frontend origin, session settings)
- `backend/app/csv_store.py` - CSV-based user storage with role field
- `backend/app/kpi.py` - KPI calculation functions

## Data Storage

### User Data (backend/data/users.csv)
```csv
user_id,name,email,gender,password_hash,role,created_at,last_login_at
038f043b-...,TestAdmin,admin@test.com,Male,<pbkdf2-hash>,admin,2026-01-15T...,2026-01-15T...
```

### Events (backend/data/web_events.csv)
All user interactions are tracked:
- `page_view`, `page_exit` - Navigation
- `session_start` - Session beginning
- `like` - Product likes
- `click` - CTAs
- `purchase` - Checkout completion

## Setup Instructions

### Enable Admin Authentication

#### 1. Install Backend & Frontend
```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd storefront
npm install
```

#### 2. Configure Environment
```bash
# frontend/.env.local
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

#### 3. Start Services
```bash
# Terminal 1: Backend
cd backend
python run.py
# Runs on http://localhost:8000

# Terminal 2: Frontend
cd storefront
npm run dev
# Runs on http://localhost:3000
```

#### 4. Create Admin Account
1. Go to http://localhost:3000/login
2. Click **Register** tab
3. Fill form:
   - Name: Your Name
   - Gender: (optional)
   - **Account Type: Admin (KPI Dashboard Access)**
   - Email: admin@example.com
   - Password: SecurePass123
4. Click **Create Account**

#### 5. Access Admin Features
- **Admin Dashboard**: http://localhost:3000/admin
- **Analytics**: http://localhost:3000/analytics
- **Product Insights**: http://localhost:3000/analytics/products

### Create Standard User Account
Same process as admin, but select:
- **Account Type: Standard User (Browse & Checkout)**

Standard users cannot access `/admin` or `/analytics` - they're redirected to `/login`

## Troubleshooting

### "Failed to fetch" Error

#### Cause 1: Backend not running
```bash
# Check if backend is running
curl http://localhost:8000/api/health
# Should return: {"status":"ok"}

# Fix: Start backend
cd backend && python run.py
```

#### Cause 2: API base URL not configured
```bash
# Check .env.local
cat storefront/.env.local
# Should have: NEXT_PUBLIC_API_BASE=http://localhost:8000

# Fix: Add or update it
echo "NEXT_PUBLIC_API_BASE=http://localhost:8000" > storefront/.env.local
# RESTART frontend: npm run dev
```

#### Cause 3: CORS issues
```bash
# Check browser console for CORS errors
# Backend should return CORS headers:
# Access-Control-Allow-Origin: http://localhost:3000
# Access-Control-Allow-Credentials: true

# If issues persist:
# 1. Verify FRONTEND_ORIGIN in backend/.env or config.py
# 2. Should match http://localhost:3000
```

### "Invalid credentials" on login
- First time? Create an account at /login (Register tab)
- Email/password mismatch? Try again carefully
- Database issue? Check `backend/data/users.csv`

### Non-admin can't see analytics
This is **by design**. Check:
```bash
# Verify user role in database
cat backend/data/users.csv | grep your_email@example.com
# Should show role: admin
```

## Security Features

✅ **Implemented:**
- Password hashing (PBKDF2-SHA256 with salt)
- Session management with TTL (14 days default)
- httpOnly cookies (cannot be accessed by JavaScript)
- CORS validation against frontend origin
- Role-based access control (RBAC) on all endpoints
- Admin-only KPI endpoints

⚠️ **Not Implemented (For Production):**
- HTTPS/TLS
- Rate limiting
- 2FA
- Refresh tokens
- Token expiration headers

## Testing

### Test Admin Register
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Admin",
    "email": "admin@test.com",
    "password": "password123",
    "role": "admin"
  }'
```

### Test KPI Access (Admin)
```bash
# Get session cookie first from login response
curl -X GET http://localhost:8000/api/kpis/overview \
  -H "Cookie: ea_session=<session_token>"
# Should return KPI data
```

### Test KPI Access (Non-Admin)
```bash
# After creating standard user and getting their cookie
curl -X GET http://localhost:8000/api/kpis/overview \
  -H "Cookie: ea_session=<standard_user_session>"
# Should return: {"error": "forbidden: admin role required"} (403)
```

## Database Schema

### Users Table (CSV)
| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID | Unique identifier |
| name | String | User's display name |
| email | String | Unique, lowercase |
| gender | String | Optional demographic |
| password_hash | String | PBKDF2-SHA256 salted |
| role | String | 'user' or 'admin' |
| created_at | ISO8601 | Account creation time |
| last_login_at | ISO8601 | Last login time |

### Web Events Table (CSV)
Tracks all user interactions with:
- event_type: page_view, click, like, purchase, etc.
- user_id: From authenticated session
- session_id: Fallback for anonymous users
- product_sku: If product-related
- page_url, utm_*, metadata: Additional context

## Next Steps

1. ✅ **Admin Authentication** - Complete
2. 📊 **Real-time KPI Dashboard** - Ready in `/admin`
3. 📈 **Analytics Pages** - Ready in `/analytics`
4. 🔐 **Role-based API** - Protected endpoints active
5. 💾 **CSV Data Storage** - Active (`data/*.csv`)

For production deployment:
- [ ] Use PostgreSQL instead of CSV
- [ ] Implement HTTPS/TLS
- [ ] Add rate limiting
- [ ] Set up refresh token system
- [ ] Deploy with SSL certificates
- [ ] Configure proper session store (Redis)

