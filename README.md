# Autonomous Library Management System

An enterprise-grade, full-stack library automation and inventory management platform built with **Python Flask**, **Firebase Authentication**, and **Google Cloud Firestore**. The system enables seamless, autonomous self-checkout for students and provides administrators with real-time inventory control, catalog seeding, and loan clearance capabilities.

---

## 📌 Key Features

- **Dual-Role Firebase Authentication (Admin & Student)**:
  - Clean modular frontend login with dedicated tabs for Student and Admin portals.
  - Powered by client-side Firebase Web SDK v10+ modular CDN with secure server-side verification using Firebase Admin SDK (`verify_id_token`).
  - Built-in clock-drift tolerance to eliminate token synchronization mismatches.

- **Dynamic Admin Access Management**:
  - Validates administrators dynamically against a Cloud Firestore `admins` collection and configurable fallback lists.
  - Allows granting administrative privileges directly via Firebase Console without code redeployment.

- **Autonomous Student Self-Issue**:
  - Live searchable book catalog filtered in real time by title, author, ISBN, or RFID tag.
  - Instant self-checkout that decrements available copies in Firestore and generates a 14-day borrowing loan document.
  - Self-issue action is automatically disabled if available copies reach zero.

- **Real-Time Admin Return & Clearance Sync**:
  - Live queue of all active borrowings across students.
  - One-click **"Checkout / Return Book"** clearance that marks records as returned and immediately increments available inventory copies.
  - Real-time polling and instant synchronization across both Admin and Student dashboards.

- **Automated Overdue Fine Calculation**:
  - Dynamically calculates fines at **₹5 per day** past the 14-day loan due date.
  - Live fine and overdue day tracking visible on both Student and Admin consoles.

- **Batch Dataset Seeding (`seed_books.py`)**:
  - Standalone data ingestion utility using Python's native `csv` module.
  - Extracts, cleans author prefixes (e.g., removing `"By "`), generates sequential ISBNs and RFID tags, and uploads 50 books atomically using Firestore Batch Writes (`db.batch()`) in under 2 seconds.

---

## 🛠️ Tech Stack

- **Backend**: Python 3.10+, Flask
- **Database & Auth**: Google Firebase Cloud Firestore, Firebase Authentication, Firebase Admin SDK
- **Frontend**: HTML5, Modern CSS3 (CSS Variables, Flexbox, CSS Grid), Vanilla JavaScript (ES6+ Modules, Fetch API)
- **Token Verification**: PyJWT with custom clock-drift tolerance patch

---

## 📂 Project Structure

```text
autonomous-library-system/
├── app.py                     # Main Flask application and REST API endpoints
├── firebase_config.py         # Firebase Admin SDK initialization and PyJWT drift patch
├── seed_books.py              # Standalone batch data seeding script for Firestore
├── requirements.txt           # Python dependencies (flask, firebase-admin)
├── serviceAccountKey.json     # Firebase service account credentials (git-ignored)
├── .gitignore                 # Excludes credentials, venv, and cache files
├── README.md                  # Project documentation
│
├── dataset/
│   ├── BooksDataset.csv       # Raw library dataset
│   └── BooksDatasetClean.csv  # Cleaned library book dataset
│
├── static/
│   ├── css/
│   │   └── style.css          # Modern design system (cards, tables, badges, toasts)
│   └── js/
│       ├── auth.js            # Firebase Web SDK auth and role routing handler
│       ├── admin.js           # Admin inventory management and return clearance
│       └── student.js          # Live catalog search, self-issue, and polling
│
└── templates/
    ├── login.html             # Dual-role login portal
    ├── admin_dashboard.html   # Admin management console
    └── student_dashboard.html # Student borrowing and discovery portal
```

---

## 🚀 Setup Instructions

### 1. Clone & Navigate to Workspace
```bash
git clone <repository-url>
cd autonomous-library-system
```

### 2. Configure Python Virtual Environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Add Firebase Service Account Key
1. Go to your [Firebase Console](https://console.firebase.google.com/) $\rightarrow$ **Project Settings** $\rightarrow$ **Service Accounts**.
2. Click **Generate new private key**.
3. Place the downloaded JSON file in the project's root folder named either:
   - `serviceAccountKey.json` or `serviceAccountkey.json`
*(This file is automatically protected and ignored by `.gitignore`).*

### 5. Seed Initial Books Dataset
Populate Firestore with the first 50 cleaned books from the dataset using atomic batch operations:
```bash
python seed_books.py
```
*Output:* `Successfully seeded 50 books into Firestore!`

### 6. Start the Application
Run the Flask server:
```bash
python app.py
```
Open your browser and navigate to:
```text
http://127.0.0.1:5000/
```

---

## 🔑 Default Roles & Access

- **Student Login**: Any user registered in Firebase Authentication (`Authentication` $\rightarrow$ `Users`).
- **Admin Login**: Requires an account in Firebase Authentication **AND** presence in the Firestore **`admins`** collection (Document ID = Admin Email) or configured in `ADMIN_EMAILS` inside `app.py`.

---

## 📡 REST API Overview

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/verify-login` | Verifies Firebase ID token, validates role, creates session | Public |
| `GET` | `/api/books` | Fetches all book records from Firestore | Student / Admin |
| `POST` | `/api/books` | Adds a new book to the inventory | Admin |
| `POST` | `/api/issue` | Autonomous book self-issue (decrements inventory) | Student |
| `GET` | `/api/student/records/<email>` | Fetches active loans & dynamic fines for a student | Student |
| `GET` | `/api/admin/records` | Fetches all active issued books across students | Admin |
| `POST` | `/api/admin/checkout-return` | Clears loan & increments available book copies | Admin |
| `GET` | `/logout` | Clears Flask session and redirects to login | Public |
