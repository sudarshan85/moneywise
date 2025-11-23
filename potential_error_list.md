# MoneyWise Potential Errors - User-Friendly Messages

This document lists all potential errors that occur in the MoneyWise application and the user-friendly messages that should be displayed instead of generic error messages or stack traces.

## Database Errors

### UNIQUE Constraint Violations

**When it occurs:**
- User tries to create an account with a name that already exists (including hidden accounts)
- User tries to create a category with a name that already exists (including hidden categories)
- User tries to rename an account to a name that already exists
- User tries to rename a category to a name that already exists

**Current behavior:** Generic "Error creating account" or "Error creating category" toast
**Suggested user-friendly message:**
- "An account named '{name}' already exists. Choose a different name." (for accounts)
- "A category named '{name}' already exists. Choose a different name." (for categories)
- "You cannot rename to '{name}' - an account with that name already exists." (for account updates)
- "You cannot rename to '{name}' - a category with that name already exists." (for category updates)

---

### FOREIGN KEY Constraint Violations

**When it occurs:**
- User tries to delete an account that has associated transactions
- User tries to delete a category that has associated transactions
- User tries to delete a category that has associated category_transfers (either as source or destination)
- User tries to delete an account that has reconciliation records

**Current behavior:** Generic error message or server error
**Suggested user-friendly message:**
- "Cannot delete this account because it has {count} associated transaction(s). Consider hiding the account instead of deleting it." (for accounts with transactions)
- "Cannot delete this category because it has {count} associated transaction(s). Consider hiding the category instead of deleting it." (for categories with transactions)
- "Cannot delete this category because it's used in {count} budget transfer(s). Please remove those transfers first." (for categories in transfers)
- "Cannot delete this account because it has been reconciled. Consider hiding the account instead." (for reconciled accounts)

---

### NOT NULL Constraint Violations

**When it occurs:**
- Backend receives invalid/incomplete data from frontend (validation failure)
- Required field is missing from API request

**Current behavior:** Server 400 error
**Suggested user-friendly message:** Depends on field:
- "Please enter an account name."
- "Please select an account type (Bank or Credit)."
- "Please enter a transaction amount."
- "Please select a transaction date."
- "Please select an account for this transaction."

---

### Duplicate Record Violations

**When it occurs:**
- User tries to create two identical category_transfers on same date
- User tries to create two identical reconciliation records for same account on same date

**Current behavior:** Generic error
**Suggested user-friendly message:**
- "A transfer with these details already exists on this date."
- "This account has already been reconciled on that date."

---

## Validation Errors

### Invalid Input Data

**When it occurs:**
- User enters negative amount for a transfer (transfers must be positive)
- User enters non-numeric value for amount
- User enters invalid date format
- User enters amount exceeding system limits (Decimal(12,2) = max 9,999,999.99)
- User tries to transfer between the same account

**Current behavior:** Varies (might be caught frontend or backend)
**Suggested user-friendly message:**
- "Amount must be a positive number."
- "Amount cannot exceed $9,999,999.99."
- "Please enter a valid date."
- "Please enter a valid amount."
- "Cannot transfer to the same account."
- "Cannot create a transfer with zero amount."

---

### Empty/Whitespace Input

**When it occurs:**
- User tries to create account with only spaces as name
- User tries to create category with only spaces as name
- User tries to add transaction with empty memo field (though this should be allowed)

**Current behavior:** Some handled frontend, some might reach backend
**Suggested user-friendly message:**
- "Account name cannot be empty or contain only spaces."
- "Category name cannot be empty or contain only spaces."

---

## Network & Connection Errors

### API Connection Failures

**When it occurs:**
- Backend server is down or unreachable
- Network is disconnected
- API endpoint returns 500 Internal Server Error
- Request times out (> 30 seconds)

**Current behavior:** Generic fetch error, axios error interceptor not implemented
**Suggested user-friendly message:**
- "Cannot connect to server. Please check your internet connection and try again."
- "Server error. The application may have encountered a problem. Try refreshing the page."
- "Request timed out. Please check your connection and try again."

---

### DNS/Network Issues

**When it occurs:**
- Localhost is unreachable
- Invalid hostname/port configuration
- Port 8000 is in use by another application

**Current behavior:** Network error, user might see blank page
**Suggested user-friendly message:**
- "Cannot reach the application server. Make sure it's running on {host}:{port}."

---

## API Response Errors

### 404 Not Found

**When it occurs:**
- User tries to access a deleted account/category/transaction
- User tries to update/delete non-existent record
- API endpoint doesn't exist (typo in frontend)

**Current behavior:** HTTP 404 error
**Suggested user-friendly message:**
- "Account not found. It may have been deleted."
- "Category not found. It may have been deleted."
- "Transaction not found. It may have been deleted."

---

### 400 Bad Request

**When it occurs:**
- Invalid query parameters
- Malformed request body
- Invalid filter values (e.g., invalid account_type)

**Current behavior:** HTTP 400 error with backend message
**Suggested user-friendly message:**
- "Invalid request. Please refresh and try again."
- "Invalid filter options. Please check your selections."

---

### 500 Internal Server Error

**When it occurs:**
- Unhandled exception in backend
- Database connection lost
- Disk full when writing database
- Memory exhaustion
- Programming error in backend

**Current behavior:** HTTP 500, error might be logged but user sees generic error
**Suggested user-friendly message:**
- "An unexpected error occurred on the server. The error has been logged. Please try again or restart the application."

---

## Database Connection Errors

### SQLite Lock/Concurrent Access

**When it occurs:**
- Multiple requests try to write to database simultaneously
- Database is locked by another process
- Backup is running while user tries to make changes

**Current behavior:** SQLAlchemy timeout or lock error
**Suggested user-friendly message:**
- "Database is busy. Please wait a moment and try again."
- "Cannot write to database. Try restarting the application."

---

### Database File Corrupted

**When it occurs:**
- moneywise.db file is corrupted
- Unexpected database shutdown
- Disk error while reading database

**Current behavior:** SQLite corruption error
**Suggested user-friendly message:**
- "Database appears to be corrupted. Please restore from a backup."
- "Database error. Restart the application. If the problem persists, restore from backup."

---

### Database File Not Found

**When it occurs:**
- config.toml points to non-existent database path
- Database file is deleted while app is running
- Path contains non-existent directories

**Current behavior:** File not found error
**Suggested user-friendly message:**
- "Database file not found at {path}. Check your configuration."

---

## File Operation Errors

### Backup/Export Failures

**When it occurs:**
- Backup directory doesn't exist and can't be created
- No write permissions to backup directory
- Disk full when creating backup
- Invalid export format requested
- File already exists (overwrite prevention)

**Current behavior:** File I/O error
**Suggested user-friendly message:**
- "Cannot create backup. Check that the backup directory is writable."
- "Backup failed. Insufficient disk space."
- "Cannot export. Check your export settings."
- "A backup with this name already exists. Choose a different name or delete the old backup."

---

### Backup Restore Failures

**When it occurs:**
- Backup file is corrupted
- Backup file format is invalid
- Insufficient permissions to restore
- Database is in use during restore

**Current behavior:** Restore error
**Suggested user-friendly message:**
- "Cannot restore backup. The backup file may be corrupted."
- "Restore failed. Close the application and try again."

---

## Exchange Rate API Errors

### Currency API Failures

**When it occurs:**
- Exchange rate API is unreachable (exchangerate-api.com down)
- API rate limit exceeded
- Invalid currency code requested
- API returns invalid response format

**Current behavior:** API error, might use cached or default rate
**Suggested user-friendly message:**
- "Cannot fetch exchange rates. Using cached rates from {last_update_time}."
- "Exchange rate service temporarily unavailable. Using rates from {last_update_time}."
- "Invalid currency selected."

---

### Cached Rate Expired

**When it occurs:**
- Exchange rate cache is older than configured duration (24 hours default)
- Multiple currency rates have different cache ages

**Current behavior:** Might silently use stale rates or show warning
**Suggested user-friendly message:** (Non-blocking, informational)
- "Exchange rates are from {time}. Refresh to get current rates."

---

## Business Logic Errors

### Invalid State Transitions

**When it occurs:**
- User tries to hide an account that's already hidden (shouldn't happen but...)
- User tries to reconcile an account with no transactions
- User tries to create a transfer with zero amount
- User tries to transfer from a category that has no balance

**Current behavior:** Silently succeeds or backend validation error
**Suggested user-friendly message:**
- "This account is already hidden."
- "Cannot reconcile an account with no transactions."
- "Transfer amount must be greater than zero."

---

### Insufficient Balance

**When it occurs:**
- User tries to transfer more money than available in a category
- User tries to mark account as reconciled but balance doesn't match bank statement (future feature)

**Current behavior:** Currently allowed, but should warn
**Suggested user-friendly message:** (For future implementation)
- "Warning: Available balance is only ${amount}. This transfer will overdraw the category."
- "Reconciled balance does not match actual balance. Difference: ${difference}"

---

### Orphaned Records

**When it occurs:**
- Category is deleted but transactions still reference it (shouldn't happen with FK constraints)
- Account is deleted but transactions still reference it (shouldn't happen with FK constraints)

**Current behavior:** Should be prevented by database constraints
**Suggested user-friendly message:**
- "Cannot complete this action. Data integrity error detected. Contact support."

---

## Browser/Frontend Errors

### Local Storage Errors

**When it occurs:**
- Browser localStorage is full
- Browser in private/incognito mode and localStorage is disabled
- Browser blocks access to localStorage (privacy settings)

**Current behavior:** localStorage operations fail silently
**Suggested user-friendly message:**
- "Cannot save preference. Check browser storage settings."
- "Some settings may not be saved in private browsing mode."

---

### Browser Compatibility

**When it occurs:**
- User uses unsupported browser (very old versions)
- Required APIs not available (IndexedDB, Fetch, etc.)

**Current behavior:** Features fail silently or page doesn't load
**Suggested user-friendly message:**
- "Your browser may not be supported. Please use a modern browser (Chrome, Firefox, Safari, Edge)."

---

### Memory/Performance Issues

**When it occurs:**
- Loading 10,000+ transactions causes browser lag/freeze
- Creating very large exports consumes too much memory
- Chart rendering with 1000+ data points is slow

**Current behavior:** Page becomes unresponsive
**Suggested user-friendly message:** (Informational, not error)
- "Loading large dataset. This may take a moment..."
- "Consider using date filters for better performance with large datasets."

---

## Session/Authentication Errors (Future Features)

These are included for completeness if authentication is added in future versions:

### Session Expired

**When it occurs:**
- User's session token expires after inactivity
- User logs out but page is still open

**Suggested user-friendly message:**
- "Your session has expired. Please log in again."

---

### Authorization Errors

**When it occurs:**
- User tries to access another user's data
- User doesn't have permission for an action

**Suggested user-friendly message:**
- "You don't have permission to access this."

---

## Summary of Error Categories

| Category | Count | Priority | Severity |
|----------|-------|----------|----------|
| Database Constraints | 4 | HIGH | CRITICAL |
| Validation Errors | 7 | HIGH | HIGH |
| Network Errors | 3 | MEDIUM | CRITICAL |
| API Response Errors | 3 | MEDIUM | HIGH |
| Database Connection | 3 | MEDIUM | CRITICAL |
| File Operations | 4 | MEDIUM | HIGH |
| Exchange Rate API | 2 | LOW | MEDIUM |
| Business Logic | 3 | MEDIUM | MEDIUM |
| Browser/Frontend | 3 | LOW | MEDIUM |
| **Total** | **32** | - | - |

---

## Implementation Strategy

When implementing error handling:

1. **High Priority (Critical):** Implement first
   - UNIQUE constraint violations (user impact: can't save data)
   - FOREIGN KEY violations (user impact: unexpected failure on delete)
   - Network/connection errors (user impact: app unusable)
   - Database connection errors (user impact: app unusable)

2. **Medium Priority (High):** Implement next
   - Validation errors (user impact: confusing form behavior)
   - API response errors (user impact: unclear why action failed)
   - File operation errors (user impact: backup/restore fails silently)

3. **Low Priority (Medium):** Implement later
   - Exchange rate API errors (user impact: uses cached rates)
   - Business logic errors (user impact: edge case warnings)
   - Browser/frontend errors (user impact: edge cases only)

---

## Technical Implementation Notes

### Error Handling Pattern

For each error type, implement:
1. **Backend:** Catch specific exception, log with context
2. **Frontend:** Catch API error response, extract error details
3. **User:** Display appropriate message in toast/modal

### Example Pattern

```javascript
// Frontend
try {
    await this.api.createAccount(this.newAccount);
} catch (error) {
    if (error.response?.status === 409) { // UNIQUE constraint
        showToast(`An account named "${this.newAccount.name}" already exists.`, 'error');
    } else if (error.response?.status === 400) { // Validation error
        showToast('Please check your input and try again.', 'error');
    } else {
        showToast('Error creating account. Please try again.', 'error');
    }
}
```

---

## SQLAlchemy Async Errors

### MissingGreenlet Error - Lazy Loading in Async Context

**When it occurs:**
- User tries to create a transaction and the API fails silently
- Backend error: `sqlalchemy.exc.MissingGreenlet: greenlet_spawn has not been called; can't call await_only() here`
- Usually happens after successful database insert but during response serialization
- Occurs when accessing relationship properties (account.name, category.name) outside async session scope

**Root cause:**
- Object relationships were not eager-loaded during the database query
- SQLAlchemy attempts "lazy loading" (automatic query) to fetch relationships
- Lazy loading requires active database session but we're in serialization phase

**Current behavior:** Generic "Failed to add transaction" toast on frontend, cryptic greenlet error on backend
**Suggested user-friendly message:** (Already correct) "Transaction added successfully" (error should be fixed in backend)

**Technical fix:**
- Ensure relationships are eager-loaded using `selectinload()` when fetching objects
- If using `refresh()` after insert, follow up with re-fetch that includes eager loading
- Pattern: Use `get_by_id()` functions that explicitly load relationships

**Code pattern to avoid:**
```python
# ❌ WRONG - relationships not loaded
await db.refresh(transaction)
return transaction  # Accessing txn.account.name later fails

# ✅ CORRECT - relationships eager-loaded
await db.refresh(transaction)
return await get_transaction_by_id(db, transaction.id)  # Relationships loaded
```

---

## Future Enhancement: Error Code System

Consider implementing an error code system where backend returns structured errors:

```json
{
  "error_code": "UNIQUE_CONSTRAINT_ACCOUNT_NAME",
  "message": "An account with this name already exists",
  "details": {
    "field": "name",
    "value": "Checking"
  }
}
```

This allows frontend to provide highly specific, localized error messages.
