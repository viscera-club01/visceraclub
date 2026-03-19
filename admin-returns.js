const logoutBtn = document.getElementById("logout-btn");
const returnsContainer = document.getElementById("admin-returns-result");
const searchInput = document.getElementById("returns-search-input");

let allRequests = [];
let currentFilter = "all";
let currentSearchTerm = "";

async function requireAdminAuth() {
  try {
    const response = await fetch("/admin/auth/me", {
      credentials: "same-origin"
    });

    if (!response.ok) {
      window.location.href = "admin-login.html";
      return false;
    }

    return true;
  } catch (error) {
    console.error("Erro ao validar sessão admin:", error);
    window.location.href = "admin-login.html";
    return false;
  }
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString("pt-BR");
}

function getReturnTypeLabel(type) {
  const labels = {
    exchange: "Troca",
    return: "Devolução"
  };

  return labels[type] || type;
}

function getReturnStatusLabel(status) {
  const labels = {
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Recusada",
    completed: "Concluída"
  };

  return labels[status] || status;
}

function getStatusClass(status) {
  if (status === "approved") return "paid";
  if (status === "completed") return "shipped";
  if (status === "rejected") return "cancelled";
  return "pending";
}

function renderRequests(requests) {
  if (!Array.isArray(requests) || requests.length === 0) {
    returnsContainer.innerHTML = "<p>Nenhuma solicitação encontrada.</p>";
    return;
  }

  returnsContainer.innerHTML = `
    <div class="return-requests-list">
      ${requests.map(request => `
        <div class="return-request-card ${request.isReadByAdmin === false ? "unread" : ""}">
          <div class="return-request-top">
            <div>
              <h3>${getReturnTypeLabel(request.type)} • Pedido #${request.orderId}</h3>
              <p>${request.customer?.name || "Cliente"} • ${request.customer?.email || ""}</p>
              <p><strong>Status:</strong> 
                <span class="order-status status-${getStatusClass(request.status)}">
                  ${getReturnStatusLabel(request.status)}
                </span>
              </p>
            </div>
          </div>

          <p><strong>Motivo:</strong> ${request.reason || "—"}</p>
          <p><strong>Mensagem:</strong> ${request.message || "—"}</p>
          <p><strong>Tamanho desejado:</strong> ${request.desiredSize || "—"}</p>
          <p><strong>Data:</strong> ${formatDate(request.createdAt)}</p>

          <div class="return-request-items">
            <strong>Item(s):</strong>
            ${
              Array.isArray(request.requestedItems) && request.requestedItems.length
                ? request.requestedItems.map(item => `
                  <div class="return-request-item">
                    ${item.product} • ${item.size} • ${item.color} • Qtde: ${item.quantity}
                  </div>
                `).join("")
                : "<p>—</p>"
            }
          </div>

          <div class="return-request-actions">
            <a href="admin-order.html?id=${request.orderId}" class="order-view-btn">
              Ver pedido
            </a>

            <button class="return-status-btn" data-id="${request.id}" data-status="approved">Aprovar</button>
            <button class="return-status-btn" data-id="${request.id}" data-status="rejected">Recusar</button>
            <button class="return-status-btn" data-id="${request.id}" data-status="completed">Concluir</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  setupStatusButtons();
}

function applyFilters() {
  let filtered = [...allRequests];

  if (currentFilter !== "all") {
    filtered = filtered.filter(item => item.status === currentFilter);
  }

  if (currentSearchTerm) {
    const term = currentSearchTerm.toLowerCase();

    filtered = filtered.filter(item => {
      const orderId = String(item.orderId || "").toLowerCase();
      const name = String(item.customer?.name || "").toLowerCase();
      const email = String(item.customer?.email || "").toLowerCase();

      return (
        orderId.includes(term) ||
        name.includes(term) ||
        email.includes(term)
      );
    });
  }

  renderRequests(filtered);
}

function setupStatusButtons() {
  const buttons = document.querySelectorAll(".return-status-btn");

  buttons.forEach(button => {
    button.addEventListener("click", async () => {
      const requestId = button.dataset.id;
      const status = button.dataset.status;

      try {
        const response = await fetch(`/admin/return-requests/${requestId}/status`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "same-origin",
          body: JSON.stringify({ status })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erro ao atualizar solicitação");
        }

        await loadRequests();
      } catch (error) {
        console.error(error);
        alert("Erro ao atualizar solicitação.");
      }
    });
  });
}

async function loadRequests() {
  try {
    const response = await fetch("/admin/return-requests", {
      credentials: "same-origin"
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao buscar solicitações");
    }

    allRequests = Array.isArray(data) ? data : [];
    applyFilters();
  } catch (error) {
    console.error(error);
    returnsContainer.innerHTML = "<p>Erro ao carregar solicitações.</p>";
  }
}

document.querySelectorAll(".return-filter-btn").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".return-filter-btn").forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    currentFilter = button.dataset.status;
    applyFilters();
  });
});

if (searchInput) {
  searchInput.addEventListener("input", (event) => {
    currentSearchTerm = event.target.value.trim();
    applyFilters();
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/admin/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }

    window.location.href = "admin-login.html";
  });
}

async function initAdminReturnsPage() {
  const authenticated = await requireAdminAuth();
  if (!authenticated) return;

  loadRequests();
}

initAdminReturnsPage();