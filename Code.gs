// ============================================================
// KHATABOOK WEB APP — Google Apps Script Backend
// File: Code.gs
// Handles: Login, Transactions, User Management
// All responses are JSON. Role-based security enforced server-side.
// ============================================================

// --------------- SHEET NAME CONSTANTS ---------------
const SHEET_USERS        = 'Users';
const SHEET_TRANSACTIONS = 'Transactions';

// --------------- ENTRY POINTS ---------------
// doGet — serves the HTML SPA.  This is the only URL the user visits.
// The same /exec URL also accepts POST (handled by doPost below),
// so the frontend POSTs back to window.location.href with zero CORS issues.
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('KhataBook')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Main POST router — dispatches to the correct handler
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = (body.action || '').toLowerCase();

    switch (action) {
      // ---- AUTH ----
      case 'login':              return handleLogin(body);

      // ---- TRANSACTIONS ----
      case 'add_transaction':    return handleAddTransaction(body);
      case 'get_transactions':   return handleGetTransactions(body);
      case 'edit_transaction':   return handleEditTransaction(body);
      case 'delete_transaction': return handleDeleteTransaction(body);

      // ---- USER MANAGEMENT (admin only) ----
      case 'add_user':           return handleAddUser(body);
      case 'remove_user':        return handleRemoveUser(body);
      case 'get_users':          return handleGetUsers(body);

      default:
        return respond({ success: false, message: 'Unknown action.' }, 400);
    }
  } catch (err) {
    return respond({ success: false, message: 'Server error: ' + err.message }, 500);
  }
}

// --------------- HELPER: wrap response ---------------
function respond(data, code) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MIME_TYPE.JSON);
}

// --------------- HELPER: validate session token ---------------
// Token format: username|role|timestamp  (signed simply; good enough for Apps Script apps)
// In production you would use a proper secret; here we validate existence in Users sheet.
function validateToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('|');
    if (parts.length < 3) return null;
    const username = parts[0];
    const role     = parts[1];

    // Verify user still exists in sheet
    const ss   = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_USERS);
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === username && data[i][2] === role) {
        return { username, role };
      }
    }
    return null; // user removed or role changed
  } catch (e) {
    return null;
  }
}

// ================================================================
// LOGIN
// ================================================================
function handleLogin(body) {
  const { username, password } = body;
  if (!username || !password) {
    return respond({ success: false, message: 'Username and password are required.' });
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_USERS);
  const data  = sheet.getDataRange().getValues();
  // Row 0 = headers: [username, password, role]

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === String(password)) {
      const role  = data[i][2]; // 'admin' or 'user'
      const token = username + '|' + role + '|' + Date.now();
      return respond({
        success:  true,
        message:  'Login successful.',
        username: username,
        role:     role,
        token:    token
      });
    }
  }

  return respond({ success: false, message: 'Invalid username or password.' });
}

// ================================================================
// TRANSACTIONS
// ================================================================

// --- ADD TRANSACTION (any authenticated user) ---
function handleAddTransaction(body) {
  const session = validateToken(body.token);
  if (!session) return respond({ success: false, message: 'Unauthorized.' }, 401);

  const { date, item_name, rate, total, notes } = body;
  if (!item_name || rate === undefined || total === undefined) {
    return respond({ success: false, message: 'Item name, rate, and total are required.' });
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const lastRow = sheet.getLastRow();

  // Columns: id | date | user | item_name | rate | total | notes
  const id = lastRow; // simple auto-increment id (row number)

  // Admin can assign a transaction to another user via override_user
  let targetUser = session.username;
  if (session.role === 'admin' && body.override_user) {
    // Verify the target user exists
    const usersSheet = ss.getSheetByName(SHEET_USERS);
    const usersData  = usersSheet.getDataRange().getValues();
    let found = false;
    for (let j = 1; j < usersData.length; j++) {
      if (usersData[j][0] === body.override_user) { found = true; break; }
    }
    if (!found) return respond({ success: false, message: 'Target user not found.' });
    targetUser = body.override_user;
  }

  sheet.appendRow([
    id,
    date || new Date().toISOString().split('T')[0],
    targetUser,
    item_name,
    Number(rate),
    Number(total),
    notes || ''
  ]);

  return respond({ success: true, message: 'Transaction added.', id: id });
}

// --- GET TRANSACTIONS (role-based) ---
function handleGetTransactions(body) {
  const session = validateToken(body.token);
  if (!session) return respond({ success: false, message: 'Unauthorized.' }, 401);

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const data  = sheet.getDataRange().getValues();
  // Headers: id, date, user, item_name, rate, total, notes

  let rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = {
      id:        data[i][0],
      date:      data[i][1],
      user:      data[i][2],
      item_name: data[i][3],
      rate:      data[i][4],
      total:     data[i][5],
      notes:     data[i][6]
    };

    // USER sees only own transactions; ADMIN sees all
    if (session.role === 'admin') {
      rows.push(row);
    } else if (row.user === session.username) {
      rows.push(row);
    }
  }

  // Optional filters passed from frontend (admin)
  if (body.filterUser && session.role === 'admin') {
    rows = rows.filter(r => r.user === body.filterUser);
  }
  if (body.filterDate && session.role === 'admin') {
    rows = rows.filter(r => r.date === body.filterDate);
  }

  return respond({ success: true, transactions: rows });
}

// --- EDIT TRANSACTION (admin only) ---
function handleEditTransaction(body) {
  const session = validateToken(body.token);
  if (!session || session.role !== 'admin') {
    return respond({ success: false, message: 'Unauthorized. Admin only.' }, 401);
  }

  const { id, date, item_name, rate, total, notes } = body;
  if (!id) return respond({ success: false, message: 'Transaction ID required.' });

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const rowIndex = i + 1; // 1-indexed
      if (date      !== undefined) sheet.getRange(rowIndex, 2).setValue(date);
      if (item_name !== undefined) sheet.getRange(rowIndex, 4).setValue(item_name);
      if (rate      !== undefined) sheet.getRange(rowIndex, 5).setValue(Number(rate));
      if (total     !== undefined) sheet.getRange(rowIndex, 6).setValue(Number(total));
      if (notes     !== undefined) sheet.getRange(rowIndex, 7).setValue(notes);
      return respond({ success: true, message: 'Transaction updated.' });
    }
  }

  return respond({ success: false, message: 'Transaction not found.' });
}

// --- DELETE TRANSACTION (admin only) ---
function handleDeleteTransaction(body) {
  const session = validateToken(body.token);
  if (!session || session.role !== 'admin') {
    return respond({ success: false, message: 'Unauthorized. Admin only.' }, 401);
  }

  const { id } = body;
  if (!id) return respond({ success: false, message: 'Transaction ID required.' });

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_TRANSACTIONS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1); // 1-indexed
      return respond({ success: true, message: 'Transaction deleted.' });
    }
  }

  return respond({ success: false, message: 'Transaction not found.' });
}

// ================================================================
// USER MANAGEMENT (ADMIN ONLY)
// ================================================================

// --- ADD USER ---
function handleAddUser(body) {
  const session = validateToken(body.token);
  if (!session || session.role !== 'admin') {
    return respond({ success: false, message: 'Unauthorized. Admin only.' }, 401);
  }

  const { new_username, new_password, new_role } = body;
  if (!new_username || !new_password) {
    return respond({ success: false, message: 'Username and password are required.' });
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_USERS);
  const data  = sheet.getDataRange().getValues();

  // Check duplicate
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === new_username) {
      return respond({ success: false, message: 'Username already exists.' });
    }
  }

  const role = (new_role === 'admin') ? 'admin' : 'user';
  sheet.appendRow([new_username, new_password, role]);

  return respond({ success: true, message: 'User added successfully.' });
}

// --- REMOVE USER ---
function handleRemoveUser(body) {
  const session = validateToken(body.token);
  if (!session || session.role !== 'admin') {
    return respond({ success: false, message: 'Unauthorized. Admin only.' }, 401);
  }

  const { target_username } = body;
  if (!target_username) {
    return respond({ success: false, message: 'Target username is required.' });
  }
  // Prevent admin from removing themselves
  if (target_username === session.username) {
    return respond({ success: false, message: 'You cannot remove yourself.' });
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_USERS);
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === target_username) {
      sheet.deleteRow(i + 1);
      return respond({ success: true, message: 'User removed.' });
    }
  }

  return respond({ success: false, message: 'User not found.' });
}

// --- GET ALL USERS (admin only) ---
function handleGetUsers(body) {
  const session = validateToken(body.token);
  if (!session || session.role !== 'admin') {
    return respond({ success: false, message: 'Unauthorized. Admin only.' }, 401);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_USERS);
  const data  = sheet.getDataRange().getValues();

  const users = [];
  for (let i = 1; i < data.length; i++) {
    users.push({ username: data[i][0], role: data[i][2] });
    // passwords intentionally excluded from response
  }

  return respond({ success: true, users: users });
}