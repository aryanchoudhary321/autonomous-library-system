import os
from datetime import datetime, date, timedelta, timezone
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from firebase_config import db, auth
import firebase_admin.auth

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "autonomous-library-secret-key-2026")

# ==========================================
# ADMIN CONFIGURATION
# Add authorized administrator emails here:
# ==========================================
ADMIN_EMAILS = [
    "admin@library.com",
    # "aryan@library.com",
    # "librarian@library.com",
]


# ==========================================
# AUTHENTICATION & PAGE ROUTING
# ==========================================

@app.route("/")
def login():
    # If already authenticated, redirect to appropriate portal
    if "role" in session:
        if session["role"] == "admin":
            return redirect(url_for("admin_dashboard"))
        elif session["role"] == "student":
            return redirect(url_for("student_dashboard"))
    return render_template("login.html")


@app.route("/api/verify-login", methods=["POST"])
def verify_login():
    data = request.get_json(silent=True) or {}
    id_token = data.get("idToken")
    selected_role = (data.get("selectedRole") or "student").strip().lower()

    if not id_token:
        return jsonify({"success": False, "message": "Missing ID token."}), 400

    try:
        # Verify the Firebase ID token using firebase_admin.auth
        decoded_token = firebase_admin.auth.verify_id_token(id_token)
        user_email = decoded_token.get("email", "").strip()
        uid = decoded_token.get("uid", "")
    except Exception as e:
        return jsonify({"success": False, "message": f"Token verification failed: {str(e)}"}), 401

    # Role validation
    if selected_role == "admin":
        user_email_clean = user_email.strip().lower()
        is_admin = False

        # 1. Check local config fallback
        if user_email_clean in [e.strip().lower() for e in ADMIN_EMAILS]:
            is_admin = True

        # 2. Check Firestore 'admins' and 'admin' collections (checks doc ID and email fields)
        if not is_admin:
            try:
                for col_name in ["admins", "admin"]:
                    col_ref = db.collection(col_name)
                    
                    # Direct doc ID lookup
                    doc = col_ref.document(user_email_clean).get()
                    if doc.exists:
                        is_admin = True
                        break

                    # Scan documents in collection for email field or loose ID match
                    for d in col_ref.stream():
                        d_id = d.id.strip().lower()
                        d_data = d.to_dict() or {}
                        d_email = str(d_data.get("email", "")).strip().lower()

                        if d_id == user_email_clean or d_email == user_email_clean:
                            is_admin = True
                            break
                    if is_admin:
                        break
            except Exception as check_err:
                print(f"[AUTH ERROR] Failed checking Firestore admin status: {check_err}")

        print(f"[AUTH] Admin login attempt for '{user_email_clean}' -> Result: {'APPROVED' if is_admin else 'DENIED'}")

        if not is_admin:
            return jsonify({
                "success": False,
                "message": f"Access denied: '{user_email_clean}' is not registered in the administrator database."
            }), 403
        role = "admin"
        redirect_url = "/admin"
    else:
        role = "student"
        redirect_url = "/student"

    # Store user credentials in session
    session["user_email"] = user_email
    session["role"] = role
    session["uid"] = uid

    return jsonify({
        "success": True,
        "redirect": redirect_url
    })


@app.route("/admin")
def admin_dashboard():
    # Protect admin dashboard: redirect to login if not admin
    if session.get("role") != "admin":
        return redirect(url_for("login"))
    return render_template(
        "admin_dashboard.html",
        user_email=session.get("user_email", "admin@library.com"),
        role=session.get("role", "admin")
    )


@app.route("/student")
def student_dashboard():
    # Protect student dashboard: redirect to login if not student
    if session.get("role") != "student":
        return redirect(url_for("login"))
    return render_template(
        "student_dashboard.html",
        user_email=session.get("user_email", ""),
        role=session.get("role", "student")
    )


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


# ==========================================
# BOOKS CATALOG REST API
# ==========================================

@app.route("/api/books", methods=["GET", "POST"])
def handle_books():
    if request.method == "GET":
        try:
            books_ref = db.collection("books").stream()
            books = []
            for doc in books_ref:
                book = doc.to_dict()
                book["id"] = doc.id
                books.append(book)
            return jsonify(books)
        except Exception as e:
            return jsonify({"success": False, "message": f"Failed to fetch books: {str(e)}"}), 500

    # POST /api/books (Admin adds a book)
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        title = str(data.get("title", "")).strip()
        author = str(data.get("author", "")).strip()
        isbn = str(data.get("isbn", "")).strip()
        rfid_tag = str(data.get("rfid_tag", "")).strip()

        if not title or not author:
            return jsonify({"success": False, "message": "Title and author are required."}), 400

        try:
            total_copies = int(data.get("total_copies", 1))
        except (ValueError, TypeError):
            total_copies = 1

        if total_copies < 1:
            total_copies = 1

        available_copies = total_copies

        book_data = {
            "title": title,
            "author": author,
            "isbn": isbn,
            "rfid_tag": rfid_tag,
            "total_copies": total_copies,
            "available_copies": available_copies,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

        update_time, doc_ref = db.collection("books").add(book_data)
        return jsonify({
            "success": True,
            "message": "Book added successfully.",
            "id": doc_ref.id,
            "book": {**book_data, "id": doc_ref.id}
        }), 201

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to add book: {str(e)}"}), 500


# ==========================================
# AUTONOMOUS ISSUE & RETURN REST API
# ==========================================

@app.route("/api/issue", methods=["POST"])
def issue_book():
    """
    Autonomous self-checkout for students:
    Accepts book_id and student_email, checks available_copies > 0,
    decrements available_copies by 1 in books, and creates an issued_records document.
    """
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        book_id = str(data.get("book_id", "")).strip()
        student_email = str(data.get("student_email") or session.get("user_email") or "").strip()

        if not book_id:
            return jsonify({"success": False, "message": "book_id is required."}), 400
        if not student_email:
            return jsonify({"success": False, "message": "student_email is required."}), 400

        # Retrieve book from Firestore
        book_ref = db.collection("books").document(book_id)
        book_snap = book_ref.get()

        if not book_snap.exists:
            return jsonify({"success": False, "message": "Book not found."}), 404

        book_data = book_snap.to_dict()
        available_copies = int(book_data.get("available_copies", 0))

        if available_copies <= 0:
            return jsonify({"success": False, "message": "No copies available for issue."}), 400

        # Decrement available_copies by 1
        book_ref.update({"available_copies": available_copies - 1})

        # Calculate issue date (today) and due date (14 days from today)
        today = date.today()
        due_date = today + timedelta(days=14)

        record_data = {
            "student_email": student_email,
            "book_id": book_id,
            "book_title": book_data.get("title", "Untitled Book"),
            "issue_date": today.isoformat(),
            "due_date": due_date.isoformat(),
            "status": "issued"
        }

        update_time, record_ref = db.collection("issued_records").add(record_data)

        return jsonify({
            "success": True,
            "message": "Book issued successfully.",
            "record_id": record_ref.id,
            "record": {**record_data, "id": record_ref.id}
        }), 201

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to issue book: {str(e)}"}), 500


@app.route("/api/student/records/<email>", methods=["GET"])
def get_student_records(email):
    """
    Fetches all issued_records where student_email == email and status == 'issued',
    dynamically calculating fine_amount at ₹5 per overdue day.
    """
    try:
        email = email.strip()
        records = []
        today = date.today()

        # Query records matching student email
        docs = db.collection("issued_records").where("student_email", "==", email).stream()

        for doc in docs:
            data = doc.to_dict()
            if data.get("status") == "issued":
                data["id"] = doc.id
                due_date_str = data.get("due_date", "")

                fine_amount = 0
                overdue_days = 0

                if due_date_str:
                    try:
                        due_date_obj = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")).date()
                        if today > due_date_obj:
                            overdue_days = (today - due_date_obj).days
                            fine_amount = overdue_days * 5
                    except Exception:
                        pass

                data["fine_amount"] = fine_amount
                data["overdue_days"] = overdue_days
                records.append(data)

        return jsonify(records)

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to fetch student records: {str(e)}"}), 500


@app.route("/api/admin/records", methods=["GET"])
def get_admin_records():
    """
    Fetches all issued_records where status == 'issued' across all students,
    including calculated overdue days and fine amounts.
    """
    try:
        records = []
        today = date.today()
        docs = db.collection("issued_records").stream()

        for doc in docs:
            data = doc.to_dict()
            if data.get("status") == "issued":
                data["id"] = doc.id
                due_date_str = data.get("due_date", "")

                fine_amount = 0
                overdue_days = 0

                if due_date_str:
                    try:
                        due_date_obj = datetime.fromisoformat(due_date_str.replace("Z", "+00:00")).date()
                        if today > due_date_obj:
                            overdue_days = (today - due_date_obj).days
                            fine_amount = overdue_days * 5
                    except Exception:
                        pass

                data["fine_amount"] = fine_amount
                data["overdue_days"] = overdue_days
                records.append(data)

        return jsonify(records)

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to fetch admin records: {str(e)}"}), 500


@app.route("/api/admin/checkout-return", methods=["POST"])
def return_book():
    """
    Admin book return / clearance:
    Accepts record_id and book_id, updates status to 'returned' in issued_records
    (so it no longer appears in active student records), and increments available_copies by 1 in books.
    """
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        record_id = str(data.get("record_id", "")).strip()
        book_id = str(data.get("book_id", "")).strip()

        if not record_id:
            return jsonify({"success": False, "message": "record_id is required."}), 400

        record_ref = db.collection("issued_records").document(record_id)
        record_snap = record_ref.get()

        if not record_snap.exists:
            return jsonify({"success": False, "message": "Issued record not found."}), 404

        record_data = record_snap.to_dict()
        target_book_id = book_id or record_data.get("book_id")

        # Update record status to 'returned'
        record_ref.update({
            "status": "returned",
            "returned_at": date.today().isoformat()
        })

        # Increment available_copies in books
        if target_book_id:
            book_ref = db.collection("books").document(target_book_id)
            book_snap = book_ref.get()
            if book_snap.exists:
                b_data = book_snap.to_dict()
                curr_avail = int(b_data.get("available_copies", 0))
                total_copies = int(b_data.get("total_copies", curr_avail + 1))
                new_avail = min(curr_avail + 1, total_copies)
                book_ref.update({"available_copies": new_avail})

        return jsonify({
            "success": True,
            "message": "Book returned successfully and inventory updated.",
            "record_id": record_id
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Failed to return book: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
