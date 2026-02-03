# KhataBook Web App — Deployment & Setup Guide

---

## 📁 Project Structure

```
khatabook/
├── backend/
│   └── Code.gs              ← Google Apps Script (paste into Apps Script editor)
├── frontend/
│   └── index.html           ← Complete frontend SPA (host anywhere or open locally)
└── README.md                ← This file
```

---

## 📊 Google Sheets Structure

Create a new Google Sheet. Inside it, set up **two sheets** with the exact tab names and column headers below.

---

### Sheet 1 — `Users`

| Column A   | Column B | Column C |
|------------|----------|----------|
| username   | password | role     |
| admin      | admin123 | admin    |
| john       | pass123  | user     |
| sarah      | pass456  | user     |

**Rules:**
- Row 1 is the header row (username, password, role).
- `role` must be exactly `admin` or `user` (lowercase).
- Passwords are stored as plain text (Apps Script limitation — acceptable for small business use; for production with sensitive data, hash passwords before storing).
- The first admin account must be created manually here.

---

### Sheet 2 — `Transactions`

| Column A | Column B | Column C | Column D  | Column E | Column F | Column G |
|----------|----------|----------|-----------|----------|----------|----------|
| id       | date     | user     | item_name | rate     | total    | notes    |

**Rules:**
- Row 1 is the header row (id, date, user, item_name, rate, total, notes).
- Leave all data rows empty initially — the app auto-populates them.
- `id` is auto-generated (equals the row number at time of insertion).
- `date` format: `YYYY-MM-DD` (e.g. `2026-02-03`).
- `rate` and `total` are numeric values.

---

## 🚀 Deployment Steps

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com).
2. Click **+ Blank** to create a new spreadsheet.
3. Rename the first sheet tab to exactly: **Users**
4. Add the headers in Row 1: `username | password | role`
5. Add at least one admin row (e.g. `admin | admin123 | admin`).
6. Click the **+** tab at the bottom to add a new sheet.
7. Rename it to exactly: **Transactions**
8. Add the headers in Row 1: `id | date | user | item_name | rate | total | notes`

---

### Step 2 — Open the Apps Script Editor

1. In your Google Sheet, click the menu: **Extensions → Apps Script**
2. This opens the Apps Script IDE in a new tab.
3. Delete all existing code in the editor.
4. Paste the entire contents of `backend/Code.gs` into the editor.
5. Click the **Save** button (floppy disk icon) or press `Ctrl + S`.

---

### Step 3 — Deploy as a Web App

1. In the Apps Script IDE, click the **Deploy** button (top-right).
2. Select **New deployment**.
3. Click the gear icon ⚙️ next to "Select type" and choose **Web app**.
4. A settings panel appears. Fill in:
   - **Description:** KhataBook API (optional)
   - **Execute as:** `Me` (your Google account)
   - **Who has access:** `Anyone` ← **this is critical**
5. Click **Deploy**.
6. Google may ask you to **Grant permissions** — click **Allow**.
7. You will see a confirmation screen with a **Web app URL**. It looks like:
   ```
   https://script.google.com/macros/s/AKfycTz.../exec
   ```
8. **Copy this URL.** You will need it in the next step.

---

### Step 4 — Configure the Frontend

1. Open `frontend/index.html` in any text editor.
2. Find this line near the top of the `<script>` section:
   ```javascript
   const API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYED_SCRIPT_ID/exec';
   ```
3. Replace `YOUR_DEPLOYED_SCRIPT_ID` (and the full placeholder URL) with the **Web app URL** you copied in Step 3.
4. Save the file.

---

### Step 5 — Host the Frontend (choose one option)

#### Option A — Open Locally (quickest for testing)
- Double-click `index.html` or open it via `file:///path/to/index.html` in your browser.
- Works immediately. No server required.

#### Option B — Host on GitHub Pages (free, permanent URL)
1. Push the `frontend/` folder to a GitHub repository.
2. Go to **Settings → Pages** in that repo.
3. Set source to the branch and folder containing `index.html`.
4. GitHub will give you a live URL like `https://yourusername.github.io/khatabook/`.

#### Option C — Host on Netlify / Vercel (free, production-grade)
1. Sign up at [netlify.app](https://app.netlify.com) or [vercel.com](https://vercel.com).
2. Connect your GitHub repo or drag-and-drop the `frontend/` folder.
3. Deploy — you get a custom HTTPS URL in seconds.

---

## 🔐 Security Notes

| Layer | Protection |
|-------|-----------|
| **Role enforcement** | Backend checks `role` from the Users sheet on every API call — users cannot call admin-only endpoints. |
| **Token validation** | Every request after login includes a token. The backend re-validates the user exists and the role matches before processing. |
| **XSS prevention** | All user-supplied strings are HTML-escaped before rendering (`escHtml()`). |
| **Admin-only actions** | `edit_transaction`, `delete_transaction`, `add_user`, `remove_user`, `get_users` all verify `role === 'admin'` server-side. |
| **Self-delete guard** | An admin cannot remove their own account. |

---

## 📝 API Reference (for developers)

All calls are `POST` to the Web App URL with a JSON body.

| Action | Auth Required | Admin Only | Payload Fields |
|--------|:---:|:---:|----------------|
| `login` | No | No | `username`, `password` |
| `add_transaction` | Yes | No | `date`, `item_name`, `rate`, `total`, `notes`, `override_user`* |
| `get_transactions` | Yes | No | `filterUser`*, `filterDate`* |
| `edit_transaction` | Yes | **Yes** | `id`, `date`, `item_name`, `rate`, `total`, `notes` |
| `delete_transaction` | Yes | **Yes** | `id` |
| `add_user` | Yes | **Yes** | `new_username`, `new_password`, `new_role` |
| `remove_user` | Yes | **Yes** | `target_username` |
| `get_users` | Yes | **Yes** | — |

*`override_user` — admin only; assigns the transaction to another user.
*`filterUser` / `filterDate` — optional; admin only; server-side filtering.

---

## ✅ Quick Checklist

- [ ] Google Sheet created with `Users` and `Transactions` tabs
- [ ] Headers in Row 1 match exactly (case-sensitive)
- [ ] At least one admin user in the Users sheet
- [ ] Apps Script code pasted and saved
- [ ] Deployed as Web App with access set to `Anyone`
- [ ] Permissions granted when prompted
- [ ] Web App URL pasted into `index.html` → `API_URL`
- [ ] File saved and opened in browser
- [ ] Login tested with admin credentials
- [ ] Login tested with a regular user

---

## 💡 Tips & Troubleshooting

- **CORS errors?** Make sure the Web App is deployed with "Who has access: Anyone". If you redeploy, use "New deployment" — do not reuse old ones.
- **Blank page after login?** Open browser DevTools (F12) → Console tab and check for JavaScript errors.
- **Data not saving?** Verify the sheet tab names are exactly `Users` and `Transactions` (capital first letter).
- **Token errors after adding/removing a user?** The token validates against the Users sheet live — if a user is removed, their session ends automatically on the next API call.
