// Firebase Web SDK v10+ Modular Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBl5UVRlGfkD9y6F87d94A3bLZTZO1kOgs",
  authDomain: "autonomous-library-4cfb8.firebaseapp.com",
  projectId: "autonomous-library-4cfb8",
  storageBucket: "autonomous-library-4cfb8.firebasestorage.app",
  messagingSenderId: "808073482264",
  appId: "1:808073482264:web:78088163f71663a3b2f36d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// DOM Elements
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const tabStudent = document.getElementById("tab-student");
const tabAdmin = document.getElementById("tab-admin");
const selectedRoleInput = document.getElementById("selected-role");
const alertBox = document.getElementById("auth-alert");
const alertMessage = document.getElementById("alert-message");
const portalSubtitle = document.getElementById("portal-subtitle");
const roleHint = document.getElementById("role-hint");

// Helper to display alert
function showAlert(message, type = "danger") {
  alertBox.className = `alert alert-${type} show`;
  alertMessage.textContent = message;
}

// Helper to hide alert
function hideAlert() {
  alertBox.className = "alert";
  alertMessage.textContent = "";
}

// Toggle role switching
function setRole(role) {
  hideAlert();
  selectedRoleInput.value = role;

  if (role === "admin") {
    tabAdmin.classList.add("active");
    tabAdmin.setAttribute("aria-selected", "true");
    tabStudent.classList.remove("active");
    tabStudent.setAttribute("aria-selected", "false");
    
    portalSubtitle.textContent = "Administrator Portal Login";
    emailInput.placeholder = "admin@library.com";
    roleHint.textContent = "Administrative privileges required (admin@library.com).";
  } else {
    tabStudent.classList.add("active");
    tabStudent.setAttribute("aria-selected", "true");
    tabAdmin.classList.remove("active");
    tabAdmin.setAttribute("aria-selected", "false");

    portalSubtitle.textContent = "Student Portal Login";
    emailInput.placeholder = "student@example.com";
    roleHint.textContent = "Authorized library student account required.";
  }
}

if (tabStudent && tabAdmin) {
  tabStudent.addEventListener("click", () => setRole("student"));
  tabAdmin.addEventListener("click", () => setRole("admin"));
}

// Form Submission Handler
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const selectedRole = selectedRoleInput.value;

    if (!email || !password) {
      showAlert("Please enter both email and password.");
      return;
    }

    // Set button loading state
    submitBtn.disabled = true;
    submitBtn.classList.add("loading");

    try {
      // 1. Firebase client authentication
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Obtain Firebase ID token
      const idToken = await user.getIdToken();

      // 3. Post token and role to backend verification endpoint
      const response = await fetch("/api/verify-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          idToken: idToken,
          selectedRole: selectedRole
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showAlert("Authentication successful! Redirecting...", "success");
        window.location.href = data.redirect || (selectedRole === "admin" ? "/admin" : "/student");
      } else {
        showAlert(data.message || "Login failed. Please verify your credentials and role.");
      }
    } catch (error) {
      let errorMsg = "Authentication failed. Please check your credentials.";
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
        errorMsg = "Invalid email or password.";
      } else if (error.code === "auth/too-many-requests") {
        errorMsg = "Too many failed login attempts. Please try again later.";
      } else if (error.code === "auth/network-request-failed") {
        errorMsg = "Network error. Please check your connection.";
      } else if (error.message) {
        errorMsg = error.message;
      }
      showAlert(errorMsg);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("loading");
    }
  });
}
