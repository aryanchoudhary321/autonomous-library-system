// Student Portal Controller
document.addEventListener("DOMContentLoaded", () => {
  // DOM References
  const myRecordsTbody = document.getElementById("my-records-tbody");
  const catalogTbody = document.getElementById("catalog-tbody");
  const catalogSearch = document.getElementById("catalog-search");
  const refreshStudentBtn = document.getElementById("refresh-student-btn");
  const toastContainer = document.getElementById("toast-container");

  // Metric Elements
  const statMyLoans = document.getElementById("stat-my-loans");
  const statTotalFines = document.getElementById("stat-total-fines");
  const statAvailableTitles = document.getElementById("stat-available-titles");

  // In-memory collections
  let catalogBooks = [];
  let myIssuedRecords = [];

  // Toast Notification Helper
  function showToast(message, type = "success") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${type === "success" 
          ? '<polyline points="20 6 9 17 4 12"></polyline>' 
          : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'}
      </svg>
      <span>${message}</span>
    `;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ==========================================
  // 1. FETCH & RENDER MY ISSUED BOOKS
  // ==========================================
  async function loadMyRecords() {
    if (!STUDENT_EMAIL) return;

    try {
      const response = await fetch(`/api/student/records/${encodeURIComponent(STUDENT_EMAIL)}`);
      const data = await response.json();
      myIssuedRecords = Array.isArray(data) ? data : (data.records || []);
      renderMyRecordsTable(myIssuedRecords);
      updateMetrics();
    } catch (err) {
      console.error("Error fetching student records:", err);
      myRecordsTbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty-state" style="color: var(--danger);">
            Failed to sync your borrowed books.
          </td>
        </tr>
      `;
    }
  }

  function renderMyRecordsTable(records) {
    if (!records || records.length === 0) {
      myRecordsTbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty-state">
            You currently have no active issued books. Discover and self-issue books below!
          </td>
        </tr>
      `;
      return;
    }

    myRecordsTbody.innerHTML = records.map(rec => {
      const fine = Number(rec.fine_amount || 0);
      const overdue = Number(rec.overdue_days || 0);

      const fineDisplay = fine > 0
        ? `<span class="badge badge-danger">₹${fine} (${overdue}d overdue)</span>`
        : `<span class="badge badge-success">₹0</span>`;

      const statusBadge = fine > 0
        ? `<span class="badge badge-warning">Overdue</span>`
        : `<span class="badge badge-student">Active Loan</span>`;

      return `
        <tr>
          <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(rec.book_title || 'Untitled')}</td>
          <td>${escapeHtml(rec.issue_date || '—')}</td>
          <td style="font-weight: 500;">${escapeHtml(rec.due_date || '—')}</td>
          <td style="text-align: center;">${fineDisplay}</td>
          <td style="text-align: center;">${statusBadge}</td>
        </tr>
      `;
    }).join("");
  }

  // ==========================================
  // 2. FETCH & RENDER BOOK CATALOG
  // ==========================================
  async function loadCatalog() {
    try {
      const response = await fetch("/api/books");
      const data = await response.json();
      catalogBooks = Array.isArray(data) ? data : (data.books || []);
      renderCatalogTable(catalogBooks);
      updateMetrics();
    } catch (err) {
      console.error("Error fetching catalog:", err);
      catalogTbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty-state" style="color: var(--danger);">
            Failed to load books catalog.
          </td>
        </tr>
      `;
    }
  }

  function renderCatalogTable(books) {
    if (!books || books.length === 0) {
      catalogTbody.innerHTML = `
        <tr>
          <td colspan="5" class="table-empty-state">
            No matching books found in the library.
          </td>
        </tr>
      `;
      return;
    }

    catalogTbody.innerHTML = books.map(book => {
      const available = Number(book.available_copies ?? 0);
      const isAvailable = available > 0;

      const copiesDisplay = isAvailable
        ? `<span style="font-weight: 700; color: var(--success);">${available}</span>`
        : `<span class="badge badge-danger">Out of Stock</span>`;

      return `
        <tr data-book-id="${book.id || ''}">
          <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(book.title || 'Untitled')}</td>
          <td>${escapeHtml(book.author || 'Unknown')}</td>
          <td><code>${escapeHtml(book.isbn || '—')}</code></td>
          <td style="text-align: center;">${copiesDisplay}</td>
          <td style="text-align: center;">
            <button 
              type="button" 
              class="btn btn-sm btn-primary self-issue-btn"
              data-book-id="${book.id || ''}"
              data-book-title="${escapeHtml(book.title || '')}"
              ${!isAvailable ? 'disabled' : ''}
            >
              ${isAvailable ? 'Autonomous Self-Issue' : 'Unavailable'}
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Attach listeners to issue buttons
    document.querySelectorAll(".self-issue-btn").forEach(btn => {
      btn.addEventListener("click", handleSelfIssue);
    });
  }

  // ==========================================
  // 3. ACTION: AUTONOMOUS SELF-ISSUE
  // ==========================================
  async function handleSelfIssue(e) {
    const btn = e.currentTarget;
    const bookId = btn.getAttribute("data-book-id");
    const bookTitle = btn.getAttribute("data-book-title");

    if (!bookId) return;

    btn.disabled = true;
    btn.textContent = "Issuing...";

    try {
      const response = await fetch("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          book_id: bookId,
          student_email: STUDENT_EMAIL
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast(`Successfully issued "${bookTitle || 'Book'}" for 14 days!`, "success");
        // Immediately refresh both sections
        await Promise.all([loadMyRecords(), loadCatalog()]);
      } else {
        showToast(data.message || "Failed to issue book.", "error");
        btn.disabled = false;
        btn.textContent = "Autonomous Self-Issue";
      }
    } catch (err) {
      console.error("Error self-issuing book:", err);
      showToast("Network error while issuing book.", "error");
      btn.disabled = false;
      btn.textContent = "Autonomous Self-Issue";
    }
  }

  // ==========================================
  // 4. LIVE SEARCH FILTER
  // ==========================================
  if (catalogSearch) {
    catalogSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderCatalogTable(catalogBooks);
        return;
      }

      const filtered = catalogBooks.filter(b => 
        (b.title && b.title.toLowerCase().includes(q)) ||
        (b.author && b.author.toLowerCase().includes(q)) ||
        (b.isbn && b.isbn.toLowerCase().includes(q)) ||
        (b.rfid_tag && b.rfid_tag.toLowerCase().includes(q))
      );
      renderCatalogTable(filtered);
    });
  }

  // ==========================================
  // 5. UPDATE METRICS
  // ==========================================
  function updateMetrics() {
    if (statMyLoans) statMyLoans.textContent = myIssuedRecords.length;
    if (statTotalFines) {
      const totalFine = myIssuedRecords.reduce((sum, r) => sum + (Number(r.fine_amount) || 0), 0);
      statTotalFines.textContent = `₹${totalFine}`;
    }
    if (statAvailableTitles) {
      const readyTitles = catalogBooks.filter(b => (Number(b.available_copies) || 0) > 0).length;
      statAvailableTitles.textContent = readyTitles;
    }
  }

  // Sync button listener
  if (refreshStudentBtn) {
    refreshStudentBtn.addEventListener("click", async () => {
      refreshStudentBtn.disabled = true;
      await Promise.all([loadMyRecords(), loadCatalog()]);
      showToast("Library portal synchronized.", "success");
      refreshStudentBtn.disabled = false;
    });
  }

  // ==========================================
  // 6. REAL-TIME POLLING (Sync Admin Returns)
  // ==========================================
  // Polls every 12 seconds so if an admin checks out / returns a book,
  // the student's active loans and available copies sync automatically.
  setInterval(() => {
    loadMyRecords();
    loadCatalog();
  }, 12000);

  // Utility to escape HTML
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initial fetch
  Promise.all([loadMyRecords(), loadCatalog()]);
});
