# Production-Level Approval Workflow Implementation

## Overview

This implementation adds a complete approval workflow for restaurant owners and delivery riders to ensure platform quality and compliance. Unapproved users cannot operate until explicitly approved by admin.

---

## Database Changes

### Migration: `2026_05_13_add_approval_workflow.sql`

**New Fields Added to `users` Table:**
- `approval_status` - ENUM: pending, approved, rejected, suspended
- `approved_at` - DATETIME when approved
- `approved_by_admin_id` - INT admin who approved
- `rejection_reason` - TEXT explanation
- `admin_notes` - TEXT internal notes
- `approval_updated_at` - DATETIME of last change

**New Fields Added to `restaurants` Table (if exists):**
- Same approval fields as users
- Tracks approval history per restaurant

**New Table: `approval_audit_log`**
- Tracks all approval actions
- Fields: entity_type, entity_id, action, admin_id, previous_status, new_status, reason, notes, created_at
- Purpose: Complete audit trail for compliance

---

## Backend Changes

### 1. User Model (`backend/models/User.php`)

**Modified Methods:**
- `register()` - Now sets `approval_status='pending'` for owners/riders
- `login()` - Checks approval status; returns false if not approved
- `getByEmail()` - Includes approval_status in response

**New Methods:**
- `updateApprovalStatus($userId, $status, $adminId, $reason, $notes)` - Updates approval status with audit logging
- `logApprovalAction()` - Internal logging to approval_audit_log

**Registration Flow:**
```
Customer: approval_status = 'approved' (immediate access)
Restaurant Owner: approval_status = 'pending' (blocked until approved)
Delivery Rider: approval_status = 'pending' (blocked until approved)
```

### 2. Admin Users Controller (`backend/controllers/AdminUsersController.php`)

**New/Modified Endpoints:**

#### `action=list&filter=[all|pending|approved|rejected|suspended]`
- Lists users with approval status
- Returns: id, name, email, role, status, approval_status, approved_at, rejection_reason, admin_notes, approval_updated_at
- Requires: Admin role

#### `action=update_approval` (NEW)
- Updates user approval status
- Request body:
  ```json
  {
    "id": 123,
    "approval_status": "approved|rejected|suspended",
    "reason": "optional reason",
    "notes": "optional internal notes"
  }
  ```
- Sends notification email to user
- Logs to approval_audit_log

**Security:**
- `requireRole('admin')` on all endpoints
- JWT token verification
- User existence checks

### 3. Admin Restaurants Controller (`backend/controllers/AdminRestaurantsController.php`)

**New/Modified Endpoints:**

#### `action=update_status` (Enhanced)
- Now uses `approval_status` instead of `status`
- Validates restaurant exists and owner is approved
- Sends approval notification emails
- Logs all actions to audit table

**Restaurant Creation:**
- When owner creates restaurant, it starts with `approval_status='pending'`
- Restaurant appears in admin dashboard for review
- Owner cannot operate until approved

### 4. Auth Controller (`backend/controllers/AuthController.php`)

**Login Flow Enhancement:**
- After successful password verification, check approval status
- Return specific error for pending/rejected/suspended:
  ```
  "pending" → "Your account is pending approval. Please wait for admin review."
  "rejected" → "Your account application was rejected. Please contact support."
  "suspended" → "Your account has been suspended. Please contact support."
  ```

### 5. Owner Settings Controller (`backend/controllers/OwnerSettingsController.php`)

**New Action: `action=create`**
- Creates restaurant for owner
- Validates owner is approved
- Sets restaurant `approval_status='pending'`
- Prevents unvetted restaurants from operating

---

## Middleware

### Auth Middleware (`backend/middleware/authMiddleware.php`)

Already supports:
- `requireAuth()` - Hard auth check (exits 401 if missing)
- `requireRole('admin')` - Role-based access (exits 403 if wrong role)

Used throughout approval workflow:
- All admin controllers call `requireRole('admin')`
- All owner controllers call `requireAuth()` and verify ownership
- All rider controllers call `requireAuth()`

---

## Frontend Changes

### 1. Admin Users Page (`frontend/pages/admin-users.html`)

**New Table Column:**
- "Approval Status" - Shows pending/approved/rejected/suspended badge

**New Filter:**
- Approval status dropdown: All, Pending, Approved, Rejected, Suspended

**New Buttons for Pending Users:**
- "Review" button opens approval modal for pending users

### 2. Admin Users Script (`frontend/js/admin-users.js`)

**New Functions:**
- `openApprovalModal(userId, userName)` - Opens modal to approve/reject user
- `submitApprovalDecision()` - Sends approval decision to backend
- `getApprovalBadgeClass(status)` - Colors for badge display
- `createApprovalModal()` - Dynamic modal creation

**Updated Functions:**
- `loadUsers()` - Now includes approval filter
- `renderUsers()` - Displays approval status, shows "Review" for pending
- `renderUsers()` - Filters by approval_status

**Approval Modal Fields:**
- Decision: Approve / Reject / Suspend
- Reason: Text explaining rejection/suspension
- Admin Notes: Internal notes visible only to admins

### 3. Admin Restaurants Page (`frontend/pages/admin-restaurants.html`)

**New Table Columns:**
- "Approval Status" badge
- "Approved On" date
- "Notes" (rejection reason if applicable)

**New Filter:**
- Approval status dropdown

### 4. Admin Restaurants Script (`frontend/js/admin-restaurants.js`) (NEW)

Complete restaurant approval UI:
- Load restaurants with approval status
- Filter by approval status
- View restaurant details
- Approve/reject/suspend with reason and notes
- Audit trail visibility

---

## Workflows

### Workflow 1: Restaurant Owner Registration & Approval

```
1. Owner registers → User created with approval_status='pending'
   ↓
2. Owner cannot login (approval_status check in User::login())
   ↓
3. Admin sees pending approval in Admin > Users or Admin > Restaurants
   ↓
4. Admin clicks "Review" → Opens approval modal
   ↓
5. Admin selects: Approve / Reject / Suspend
   ↓
6. Owner receives email notification
   ↓
7. If Approved → Owner can now login and create/manage restaurant
   If Rejected → Owner gets rejection reason, can reapply
   If Suspended → Account locked, contact support required
```

### Workflow 2: Delivery Rider Registration & Approval

```
1. Rider registers → User created with approval_status='pending'
   ↓
2. Rider cannot login
   ↓
3. Admin reviews and approves
   ↓
4. Rider receives approval email
   ↓
5. Rider can now login and accept deliveries
```

### Workflow 3: Restaurant Approval

```
1. Approved owner creates restaurant → Restaurant created with approval_status='pending'
   ↓
2. Restaurant appears in Admin > Restaurants with "Pending Approval" badge
   ↓
3. Admin reviews restaurant details (docs, info, etc.)
   ↓
4. Admin approves/rejects restaurant
   ↓
5. Owner receives approval email
   ↓
6. If Approved → Restaurant goes live, can accept orders
   If Rejected → Owner gets feedback, can reapply after fixes
```

---

## Security Features

1. **Authentication Required**: All admin endpoints require valid JWT token
2. **Role-Based Access Control**: Only admins can approve/reject
3. **Audit Trail**: All decisions logged with admin ID, timestamp, reason
4. **Status Validation**: Only valid status transitions allowed
5. **Email Notifications**: Users informed of decisions (audit trail)
6. **Ownership Verification**: Owners can only manage their own restaurants
7. **Race Condition Prevention**: Status checks before operations

---

## Testing Checklist

### Backend
- [ ] User registration sets `approval_status='pending'` for owners/riders
- [ ] Customer registration sets `approval_status='approved'`
- [ ] Login fails for pending/rejected/suspended users with proper error
- [ ] Admin can approve user via POST to `/AdminUsersController.php?action=update_approval`
- [ ] Approval email sent on approval/rejection
- [ ] Audit log records all approval actions
- [ ] Restaurant created with `approval_status='pending'`
- [ ] Unvetted restaurant cannot be operated before approval
- [ ] Admin can approve restaurant via POST to `/AdminRestaurantsController.php?action=update_status`

### Frontend
- [ ] Admin Users page shows "Approval Status" column
- [ ] Filter by approval status works
- [ ] "Review" button appears for pending users
- [ ] Approval modal allows decision selection
- [ ] Reason and notes fields optional but captured
- [ ] Approval decision updates table immediately
- [ ] Same for Admin Restaurants page

### End-to-End
- [ ] Owner registers → cannot login → admin approves → can login → can create restaurant
- [ ] Restaurant creation succeeds → appears in admin dashboard pending approval
- [ ] Admin approves restaurant → owner notified → restaurant goes live

---

## API Reference

### Admin Approval Endpoints

#### List Pending Users
```
GET /backend/controllers/AdminUsersController.php?action=list&filter=pending
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "data": [
    {
      "id": 456,
      "name": "John Owner",
      "email": "owner@example.com",
      "role": "restaurant-owner",
      "approval_status": "pending",
      "created_at": "2026-05-13 10:00:00",
      "approval_updated_at": null,
      ...
    }
  ]
}
```

#### Approve User
```
POST /backend/controllers/AdminUsersController.php?action=update_approval
Authorization: Bearer <admin_token>
Content-Type: application/json

Request:
{
  "id": 456,
  "approval_status": "approved",
  "reason": null,
  "notes": "Verified legitimate business owner"
}

Response:
{
  "success": true,
  "message": "User approval status updated successfully."
}
```

#### Reject User
```
POST /backend/controllers/AdminUsersController.php?action=update_approval
Authorization: Bearer <admin_token>
Content-Type: application/json

Request:
{
  "id": 456,
  "approval_status": "rejected",
  "reason": "Business license verification failed",
  "notes": "License number does not match records"
}

Response:
{
  "success": true,
  "message": "User approval status updated successfully."
}
```

#### Approve Restaurant
```
POST /backend/controllers/AdminRestaurantsController.php?action=update_status
Authorization: Bearer <admin_token>
Content-Type: application/json

Request:
{
  "id": 789,
  "approval_status": "approved",
  "reason": null,
  "notes": "All documents verified. Menu looks good."
}

Response:
{
  "success": true,
  "message": "Restaurant approval status updated to approved."
}
```

---

## Email Templates

### User Approved
```
Subject: Welcome to FoodExpress - Your Account is Approved!

Dear [Name],

Congratulations! Your account has been approved and you can now access your dashboard.
You can log in and start managing your restaurant.

Welcome to the FoodExpress family!
```

### User Rejected
```
Subject: FoodExpress Account Application Update

Dear [Name],

After reviewing your application, we regret to inform you that your account cannot be 
approved at this time.

Reason: [reason if provided]

You may reapply after addressing the issues mentioned.
If you have questions, please contact our support team.
```

### User Suspended
```
Subject: FoodExpress Account Suspended

Dear [Name],

Your account has been temporarily suspended.

Reason: [reason if provided]

Please contact support for assistance with reactivation.
```

---

## Configuration & Deployment

### Migration Execution
```bash
# Run migration on production database
mysql -h localhost -u root -p food_deliveryapp < database/migrations/2026_05_13_add_approval_workflow.sql
```

### Required Environment Variables
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` - Database credentials

### Email Configuration
- Ensure `MailHelper.php` is properly configured for SMTP
- Test email sending before deployment

### JWT Configuration
- Ensure `JwtHelper.php` secret key is set
- Token expiration should be reasonable (e.g., 24 hours)

---

## Troubleshooting

### Users Can't Login After Approval
- Check `approval_status` in database is 'approved'
- Verify email is verified (`email_verified_at` is set)
- Check `status` column is 'active' (not 'blocked')

### Approval Emails Not Sending
- Verify `MailHelper.php` SMTP configuration
- Check email_queue table for failures
- Run `processEmailQueue.php` manually if needed

### Admin Can't See Pending Users
- Verify admin has JWT token with role='admin'
- Check Authorization header is present
- Review error logs for 401/403 responses

### Restaurant Can't Be Created
- Verify owner is approved (`approval_status='approved'`)
- Check owner exists in users table
- Verify owner role is 'restaurant-owner'

---

## Future Enhancements

1. **Bulk Approval**: Approve multiple users/restaurants at once
2. **Scheduled Approval**: Auto-expire pending approvals after N days
3. **Document Verification**: Upload and verify business docs before approval
4. **Background Checks**: Integrate with verification services
5. **Appeal Process**: Allow rejected users to appeal decisions
6. **Performance Metrics**: Track which admins approve fastest
7. **Auto-Suspension**: Suspend based on complaint thresholds
8. **SMS Notifications**: Text users approval status instead of email only

---

## Version History

- **v1.0** (2026-05-13): Initial implementation
  - User approval workflow
  - Restaurant approval workflow
  - Email notifications
  - Audit logging
  - Admin dashboard UI
