import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from firebase_config import db, auth
import firebase_admin.auth

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "autonomous-library-secret-key-2026")

@app.route("/")
def login():
    # If already logged in, route to appropriate dashboard
    if "role" in session:
        return redirect(url_for("admin_dashboard" if session["role"] == "admin" else "student_dashboard"))
    return render_template("login.html")

@app.route("/api/verify-login", methods=["POST"])
def verify_login():
    data = request.get_json() or {}
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

    # Role-based validation
    if selected_role == "admin":
        if user_email.lower() != "admin@library.com":
            return jsonify({
                "success": False,
                "message": "Access denied: Only admin@library.com has administrator access."
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
    return render_template(
        "admin_dashboard.html",
        user_email=session.get("user_email", "admin@library.com"),
        role=session.get("role", "admin")
    )

@app.route("/student")
def student_dashboard():
    return render_template(
        "student_dashboard.html",
        user_email=session.get("user_email", "student"),
        role=session.get("role", "student")
    )

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
