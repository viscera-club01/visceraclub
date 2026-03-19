const ordersSectionTitle = document.getElementById("orders-section-title");
const clearDateFilterBtn = document.getElementById("clear-date-filter");
const ordersSearchInput = document.getElementById("orders-search-input");
const ordersDateInput = document.getElementById("orders-date-input");
const applyDateFilterBtn = document.getElementById("apply-date-filter-btn");
const exportOrdersBtn = document.getElementById("export-orders-btn");
let currentDateRange = null;

const statsContainer = document.getElementById("admin-stats");
const ordersContainer = document.getElementById("admin-orders-result");
const logoutBtn = document.getElementById("logout-btn");
const salesChartCanvas = document.getElementById("salesChart");

const adminBellBtn = document.getElementById("admin-bell-btn");
const adminBellCount = document.getElementById("admin-bell-count");
const adminBellDropdown = document.getElementById("admin-bell-dropdown");
const adminBellList = document.getElementById("admin-bell-list");

let salesChartInstance = null;
let allOrders = [];
let currentFilter = "all";
let currentDateFilter = null;
let currentSearchTerm = "";
let allReturnRequests = [];

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

function formatPrice(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatChartDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR");
}

function getStatusLabel(status) {
  const labels = {
    pending: "Pendente",
    paid: "Pago",
    shipped: "Enviado",
    cancelled: "Cancelado"
  };

  return labels[status] || status;
}

function getReturnTypeLabel(type) {
  const labels = {
    exchange: "Troca",
    return: "Devolução"
  };

  return labels[type] || type;
}

async function parseJsonSafe(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Resposta não era JSON:", text);
    throw new Error("Resposta inválida do servidor");
  }
}

function renderStats(stats) {
  statsContainer.innerHTML = `
    <div class="admin-stat-card">
      <h3>Total vendido</h3>
      <p>${formatPrice(stats.totalSales)}</p>
    </div>

    <div class="admin-stat-card">
      <h3>Pedidos</h3>
      <p>${stats.totalOrders}</p>
    </div>

    <div class="admin-stat-card">
      <h3>Clientes</h3>
      <p>${stats.totalCustomers}</p>
    </div>

    <div class="admin-stat-card">
      <h3>Pendentes</h3>
      <p>${stats.pendingOrders}</p>
    </div>
  `;
}

function updateOrdersTitle() {
  if (!ordersSectionTitle) return;

  if (currentDateFilter) {
    ordersSectionTitle.textContent = `Pedidos de ${formatChartDate(currentDateFilter)}`;
    clearDateFilterBtn.classList.remove("hidden");
  } else {
    ordersSectionTitle.textContent = "Pedidos recentes";
    clearDateFilterBtn.classList.add("hidden");
  }
}

function renderOrders(orders) {
  if (!Array.isArray(orders) || orders.length === 0) {
    ordersContainer.innerHTML = "<p>Nenhum pedido encontrado.</p>";
    return;
  }

  ordersContainer.innerHTML = `
  <div class="orders-table-wrapper">
    <table class="orders-table">
      <thead>
        <tr>
          <th>Pedido</th>
          <th>Cliente</th>
          <th>Total</th>
          <th>Status</th>
          <th>Envio</th>
          <th>Data</th>
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(order => `
          <tr>
            <td>#${order.id}</td>

            <td>
              <div class="order-customer">
                <strong>${order.customer?.name || "Não informado"}</strong>
                <span>${order.customer?.email || "Sem email"}</span>
              </div>
            </td>

            <td>${formatPrice(order.total)}</td>

            <td>
              <span class="order-status status-${order.status}">
                ${getStatusLabel(order.status)}
              </span>
            </td>

            <td>
              ${
                order.trackingCode
                  ? `
                    <div class="order-shipping">
                      <strong>${order.carrier || "Transportadora"}</strong>
                      <span>${order.trackingCode}</span>
                    </div>
                  `
                  : `<span style="opacity:0.5;">Não enviado</span>`
              }
            </td>

            <td>${formatDate(order.createdAt)}</td>

            <td>
              <div class="order-actions">
                <a href="admin-order.html?id=${order.id}" class="order-view-btn">
                  Ver
                </a>

                <button class="order-delete-btn" data-id="${order.id}">
                  Excluir
                </button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>
`;

  setupDeleteButtons();
}

function setupDeleteButtons() {
  const deleteButtons = document.querySelectorAll(".order-delete-btn");

  deleteButtons.forEach(button => {
    button.addEventListener("click", async () => {
      const orderId = button.dataset.id;
      const confirmed = window.confirm("Tem certeza que deseja excluir este pedido?");

      if (!confirmed) return;

      try {
        button.disabled = true;
        button.textContent = "Excluindo...";

        const response = await fetch(`/admin/orders/${orderId}`, {
          method: "DELETE",
          credentials: "same-origin"
        });

        if (!response.ok) {
          throw new Error("Erro ao excluir pedido");
        }

        allOrders = allOrders.filter(order => String(order.id) !== String(orderId));
        updateFilterCounts();
        applyOrdersFilter();
      } catch (error) {
        console.error(error);
        alert("Erro ao excluir pedido.");
        button.disabled = false;
        button.textContent = "Excluir";
      }
    });
  });
}

function updateFilterCounts() {
  const counts = {
    all: allOrders.length,
    pending: allOrders.filter(order => order.status === "pending").length,
    paid: allOrders.filter(order => order.status === "paid").length,
    shipped: allOrders.filter(order => order.status === "shipped").length,
    cancelled: allOrders.filter(order => order.status === "cancelled").length
  };

  document.getElementById("count-all").textContent = counts.all;
  document.getElementById("count-pending").textContent = counts.pending;
  document.getElementById("count-paid").textContent = counts.paid;
  document.getElementById("count-shipped").textContent = counts.shipped;
  document.getElementById("count-cancelled").textContent = counts.cancelled;
}

function applyOrdersFilter() {
  let filteredOrders = [...allOrders];

  if (currentFilter !== "all") {
    filteredOrders = filteredOrders.filter(order => order.status === currentFilter);
  }

  if (currentDateFilter) {
    filteredOrders = filteredOrders.filter(order => {
      if (!order.createdAt) return false;
      const orderDate = new Date(order.createdAt).toISOString().split("T")[0];
      return orderDate === currentDateFilter;
    });
  }

  if (currentDateRange) {
    const now = new Date();

    filteredOrders = filteredOrders.filter(order => {
      if (!order.createdAt) return false;

      const orderDate = new Date(order.createdAt);

      if (currentDateRange === "today") {
        return orderDate.toISOString().split("T")[0] === now.toISOString().split("T")[0];
      }

      if (currentDateRange === "yesterday") {
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);
        return orderDate.toISOString().split("T")[0] === yesterday.toISOString().split("T")[0];
      }

      if (currentDateRange === "7days") {
        const last7Days = new Date();
        last7Days.setDate(now.getDate() - 7);
        return orderDate >= last7Days;
      }

      if (currentDateRange === "month") {
        return (
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        );
      }

      return true;
    });
  }

  if (currentSearchTerm) {
    const term = currentSearchTerm.toLowerCase();

    filteredOrders = filteredOrders.filter(order => {
      const orderId = String(order.id || "").toLowerCase();
      const customerName = String(order.customer?.name || "").toLowerCase();
      const customerEmail = String(order.customer?.email || "").toLowerCase();

      return (
        orderId.includes(term) ||
        customerName.includes(term) ||
        customerEmail.includes(term)
      );
    });
  }

  updateOrdersTitle();
  renderOrders(filteredOrders);
}

function setupOrderFilters() {
  const filterButtons = document.querySelectorAll(".filter-btn");

  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      filterButtons.forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");

      currentFilter = button.dataset.status;
      applyOrdersFilter();
    });
  });
}

function renderSalesChart(salesData) {
  if (!salesChartCanvas) return;

  if (!Array.isArray(salesData) || salesData.length === 0) {
    salesChartCanvas.parentElement.innerHTML =
      "<p style='color:#aaa;'>Ainda não há vendas para exibir no gráfico.</p>";
    return;
  }

  const labels = salesData.map(item => formatChartDate(item.date));
  const totals = salesData.map(item => Number(item.total) || 0);

  if (salesChartInstance) {
    salesChartInstance.destroy();
  }

  salesChartInstance = new Chart(salesChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Vendas por dia",
          data: totals,
          borderColor: "#8B0000",
          backgroundColor: "rgba(139, 0, 0, 0.18)",
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (!elements.length) return;

        const pointIndex = elements[0].index;
        const clickedDate = salesData[pointIndex].date;

        currentDateFilter = clickedDate;
        applyOrdersFilter();

        const prettyDate = formatChartDate(clickedDate);
        if (ordersSectionTitle) {
          ordersSectionTitle.textContent = `Pedidos de ${prettyDate}`;
        }
      },
      plugins: {
        legend: {
          labels: {
            color: "#ffffff"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#ffffff"
          },
          grid: {
            color: "rgba(255,255,255,0.08)"
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#ffffff",
            callback: function(value) {
              return "R$ " + value;
            }
          },
          grid: {
            color: "rgba(255,255,255,0.08)"
          }
        }
      }
    }
  });
}

function renderBellNotifications(requests) {
  if (!adminBellList) return;

  const unread = requests.filter(item => item.isReadByAdmin === false);

  if (!unread.length) {
    adminBellList.innerHTML = "<p>Nenhuma notificação nova.</p>";
    return;
  }

  adminBellList.innerHTML = unread.map(item => `
    <div class="admin-bell-item">
      <strong>${getReturnTypeLabel(item.type)} • Pedido #${item.orderId}</strong>
      <span>${item.customer?.name || "Cliente"}</span>
      <small>${formatDate(item.createdAt)}</small>
    </div>
  `).join("");
}

function updateBellCount(requests) {
  if (!adminBellCount) return;

  const unreadCount = requests.filter(item => item.isReadByAdmin === false).length;

  if (unreadCount > 0) {
    adminBellCount.textContent = unreadCount;
    adminBellCount.classList.remove("hidden");
  } else {
    adminBellCount.textContent = "0";
    adminBellCount.classList.add("hidden");
  }
}

async function loadReturnNotifications() {
  try {
    const response = await fetch("/admin/return-requests", {
      credentials: "same-origin"
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || "Erro ao buscar notificações");
    }

    allReturnRequests = Array.isArray(data) ? data : [];

    renderBellNotifications(allReturnRequests);
    updateBellCount(allReturnRequests);
  } catch (error) {
    console.error("Erro ao carregar notificações:", error);

    if (adminBellList) {
      adminBellList.innerHTML = "<p>Erro ao carregar notificações.</p>";
    }
  }
}

async function loadDashboard() {
  try {
    const statsRes = await fetch("/admin/stats", {
      credentials: "same-origin"
    });

    const ordersRes = await fetch("/admin/orders", {
      credentials: "same-origin"
    });

    if (!statsRes.ok) {
      throw new Error("Erro ao buscar estatísticas");
    }

    if (!ordersRes.ok) {
      throw new Error("Erro ao buscar pedidos");
    }

    const stats = await statsRes.json();
    const orders = await ordersRes.json();

    allOrders = orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    renderStats(stats);
    updateFilterCounts();
    applyOrdersFilter();
  } catch (error) {
    console.error(error);
    ordersContainer.innerHTML = "<p>Erro ao carregar dashboard.</p>";
  }

  try {
    const salesRes = await fetch("/admin/sales", {
      credentials: "same-origin"
    });

    if (!salesRes.ok) {
      throw new Error("Erro ao buscar vendas");
    }

    const sales = await salesRes.json();
    renderSalesChart(sales);
  } catch (error) {
    console.error("Erro no gráfico:", error);
  }

  if (adminBellBtn || adminBellList) {
    await loadReturnNotifications();
  }
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

if (clearDateFilterBtn) {
  clearDateFilterBtn.addEventListener("click", () => {
    currentDateFilter = null;
    applyOrdersFilter();
  });
}

if (ordersSearchInput) {
  ordersSearchInput.addEventListener("input", (event) => {
    currentSearchTerm = event.target.value.trim();
    applyOrdersFilter();
  });
}

if (applyDateFilterBtn && ordersDateInput) {
  applyDateFilterBtn.addEventListener("click", () => {
    currentDateFilter = ordersDateInput.value || null;
    currentDateRange = null;

    document.querySelectorAll(".quick-date-btn").forEach(btn => btn.classList.remove("active"));

    applyOrdersFilter();
  });
}

if (exportOrdersBtn) {
  exportOrdersBtn.addEventListener("click", () => {
    window.location.href = "/admin/export-orders-csv";
  });
}

const quickDateButtons = document.querySelectorAll(".quick-date-btn");

quickDateButtons.forEach(button => {
  button.addEventListener("click", () => {
    quickDateButtons.forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");

    currentDateRange = button.dataset.range;
    currentDateFilter = null;

    if (ordersDateInput) {
      ordersDateInput.value = "";
    }

    applyOrdersFilter();
  });
});

if (adminBellBtn && adminBellDropdown) {
  adminBellBtn.addEventListener("click", () => {
    adminBellDropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (event) => {
    const clickedInsideBell = event.target.closest(".admin-bell-wrapper");

    if (!clickedInsideBell) {
      adminBellDropdown.classList.add("hidden");
    }
  });
}

async function initAdminPage() {
  const authenticated = await requireAdminAuth();
  if (!authenticated) return;

  setupOrderFilters();
  loadDashboard();
}

initAdminPage();