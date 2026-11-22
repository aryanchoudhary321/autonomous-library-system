// Admin Management Dashboard Controller
document.addEventListener("DOMContentLoaded", () => {
  // DOM References
  const addBookForm = document.getElementById("add-book-form");
  const addBookBtn = document.getElementById("add-book-btn");
  const inventoryTbody = document.getElementById("inventory-table-body");
  const issuedTbody = document.getElementById("issued-table-body");
  const inventorySearch = document.getElementById("inventory-search");
  const refreshAllBtn = document.getElementById("refresh-all-btn");
  const toastContainer = document.getElementById("toast-container");

  // Stat Elements
  const statTotalTitles = document.getElementById("stat-total-titles");
  const statAvailableCopies = document.getElementById("stat-available-copies");
  const statActiveIssued = document.getElementById("stat-active-issued");

  // In-memory cache for search filtering
  let allBooks = [];
  let allIssuedRecords = [];

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
  // FETCH & RENDER BOOK INVENTORY
  // ==========================================
  async function loadBooks() {
    try {
      const response = await fetch("/api/books");
      const data = await response.json();
      allBooks = Array.isArray(data) ? data : (data.books || []);
      renderInventoryTable(allBooks);
      updateStats();
    } catch (err) {
      console.error("Error fetching books:", err);
      inventoryTbody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty-state" style="color: var(--danger);">
            Failed to load books. Please check network or backend connection.
          </td>
        </tr>
      `;
    }
  }

  function renderInventoryTable(books) {
    if (!books || books.length === 0) {
      inventoryTbody.innerHTML = `
        <tr>
          <td colspan="7" class="table-empty-state">
            No books found in the library catalog. Add one above!
          </td>
        </tr>
      `;
      return;
    }

    inventoryTbody.innerHTML = books.map(book => {
      const available = Number(book.available_copies ?? 0);
      const total = Number(book.total_copies ?? 0);
      const isAvailable = available > 0;

      const badgeHtml = isAvailable
        ? `<span class="badge badge-success">Available</span>`
        : `<span class="badge badge-danger">Out of Stock</span>`;

      return `
        <tr data-id="${book.id || ''}">
          <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(book.title || 'Untitled')}</td>
          <td>${escapeHtml(book.author || 'Unknown')}</td>
          <td><code>${escapeHtml(book.isbn || '—')}</code></td>
          <td><code>${escapeHtml(book.rfid_tag || '—')}</code></td>
          <td style="text-align: center; font-weight: 600;">${total}</td>
          <td style="text-align: center; font-weight: 700; color: ${isAvailable ? 'var(--success)' : 'var(--danger)'};">
            ${available}
          </td>
          <td style="text-align: center;">${badgeHtml}</td>
        </tr>
      `;
    }).join("");
  }

  // ==========================================
  // FETCH & RENDER ACTIVE ISSUED RECORDS
  // ==========================================
  async function loadIssuedRecords() {
    try {
      const response = await fetch("/api/admin/records");
      const data = await response.json();
      allIssuedRecords = Array.isArray(data) ? data : (data.records || []);
      renderIssuedTable(allIssuedRecords);
      updateStats();
    } catch (err) {
      console.error("Error fetching issued records:", err);
      issuedTbody.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty-state" style="color: var(--danger);">
            Failed to load active issued records.
          </td>
        </tr>
      `;
    }
  }

  function renderIssuedTable(records) {
    if (!records || records.length === 0) {
      issuedTbody.innerHTML = `
        <tr>
          <td colspan="6" class="table-empty-state">
            No active issued books right now. All borrowed books are returned!
          </td>
        </tr>
      `;
      return;
    }

    issuedTbody.innerHTML = records.map(record => {
      const fine = Number(record.fine_amount || 0);
      const overdue = Number(record.overdue_days || 0);
      const fineBadge = fine > 0
        ? `<span class="badge badge-danger" title="${overdue} days overdue">₹${fine} (${overdue}d)</span>`
        : `<span class="badge badge-success">₹0</span>`;

      return `
        <tr>
          <td style="font-weight: 500;">${escapeHtml(record.student_email || '—')}</td>
          <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(record.book_title || 'Untitled')}</td>
          <td>${escapeHtml(record.issue_date || '—')}</td>
          <td>${escapeHtml(record.due_date || '—')}</td>
          <td style="text-align: center;">${fineBadge}</td>
          <td style="text-align: center;">
            <button 
              type="button" 
              class="btn btn-sm btn-action-return checkout-return-btn"
              data-record-id="${record.id}"
              data-book-id="${record.book_id || ''}"
            >
              Checkout / Return Book
            </button>
          </td>
        </tr>
      `;
    }).join("");

    // Attach listeners to Return buttons
    document.querySelectorAll(".checkout-return-btn").forEach(btn => {
      btn.addEventListener("click", handleReturnBook);
    });
  }

  // ==========================================
  // ACTION: RETURN BOOK / CLEARANCE
  // ==========================================
  async function handleReturnBook(e) {
    const btn = e.currentTarget;
    const recordId = btn.getAttribute("data-record-id");
    const bookId = btn.getAttribute("data-book-id");

    if (!recordId) return;

    btn.disabled = true;
    btn.textContent = "Returning...";

    try {
      const response = await fetch("/api/admin/checkout-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          record_id: recordId,
          book_id: bookId
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast("Book returned and inventory updated successfully!", "success");
        // Immediately refresh both tables
        await Promise.all([loadBooks(), loadIssuedRecords()]);
      } else {
        showToast(data.message || "Failed to return book.", "error");
        btn.disabled = false;
        btn.textContent = "Checkout / Return Book";
      }
    } catch (err) {
      console.error("Error returning book:", err);
      showToast("Network error while returning book.", "error");
      btn.disabled = false;
      btn.textContent = "Checkout / Return Book";
    }
  }

  // ==========================================
  // ACTION: ADD NEW BOOK
  // ==========================================
  if (addBookForm) {
    addBookForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = document.getElementById("book-title").value.trim();
      const author = document.getElementById("book-author").value.trim();
      const isbn = document.getElementById("book-isbn").value.trim();
      const rfidTag = document.getElementById("book-rfid").value.trim();
      const totalCopies = parseInt(document.getElementById("book-copies").value, 10) || 1;

      if (!title || !author) {
        showToast("Please provide both book title and author.", "error");
        return;
      }

      addBookBtn.disabled = true;
      addBookBtn.classList.add("loading");

      try {
        const response = await fetch("/api/books", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title,
            author: author,
            isbn: isbn,
            rfid_tag: rfidTag,
            total_copies: totalCopies
          })
        });

        const data = await response.json();

        if (response.ok && data.success) {
          showToast(`"${title}" added to inventory!`, "success");
          addBookForm.reset();
          document.getElementById("book-copies").value = "5";
          // Immediately reload books
          await loadBooks();
        } else {
          showToast(data.message || "Failed to add book.", "error");
        }
      } catch (err) {
        console.error("Error adding book:", err);
        showToast("Network error while adding book.", "error");
      } finally {
        addBookBtn.disabled = false;
        addBookBtn.classList.remove("loading");
      }
    });
  }

  // ==========================================
  // INVENTORY SEARCH FILTER
  // ==========================================
  if (inventorySearch) {
    inventorySearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderInventoryTable(allBooks);
        return;
      }

      const filtered = allBooks.filter(b => 
        (b.title && b.title.toLowerCase().includes(q)) ||
        (b.author && b.author.toLowerCase().includes(q)) ||
        (b.isbn && b.isbn.toLowerCase().includes(q)) ||
        (b.rfid_tag && b.rfid_tag.toLowerCase().includes(q))
      );
      renderInventoryTable(filtered);
    });
  }

  // ==========================================
  // STATS COUNTER UPDATE
  // ==========================================
  function updateStats() {
    if (statTotalTitles) statTotalTitles.textContent = allBooks.length;
    if (statAvailableCopies) {
      const totalAvail = allBooks.reduce((sum, b) => sum + (Number(b.available_copies) || 0), 0);
      statAvailableCopies.textContent = totalAvail;
    }
    if (statActiveIssued) statActiveIssued.textContent = allIssuedRecords.length;
  }

  // Manual refresh button
  if (refreshAllBtn) {
    refreshAllBtn.addEventListener("click", async () => {
      refreshAllBtn.disabled = true;
      await Promise.all([loadBooks(), loadIssuedRecords()]);
      showToast("Dashboard synchronized with Firebase Firestore.", "success");
      refreshAllBtn.disabled = false;
    });
  }

  // Utility to escape HTML and prevent XSS
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initial Data Load
  Promise.all([loadBooks(), loadIssuedRecords()]);
});
