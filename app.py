import os
from flask import Flask, render_template
import firebase_config  # Initializes Firebase Admin SDK and exports db, auth

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "autonomous-library-secret-key-2026")

@app.route("/")
def login():
    return render_template("login.html")

@app.route("/admin")
def admin_dashboard():
    return render_template("admin_dashboard.html")

@app.route("/student")
def student_dashboard():
    return render_template("student_dashboard.html")

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
