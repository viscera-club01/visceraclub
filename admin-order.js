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
    console.error("Erro ao validar sessão:", error);
    window.location.href = "admin-login.html";
    return false;
  }
}

const orderDetailContainer = document.getElementById("admin-order-detail");

function formatDate(dateString) {
  return new Date(dateString).toLocaleString("pt-BR");
}

function formatPrice(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
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

function renderOrderDetail(order) {
  orderDetailContainer.innerHTML = `
    <div class="admin-order-detail-grid">
      
      <div class="admin-detail-card">
        <h2>Informações do pedido</h2>
        <p><strong>Número:</strong> #${order.id}</p>
        <p>
          <strong>Status atual:</strong>
          <span class="order-status status-${order.status}">
            ${getStatusLabel(order.status)}
          </span>
        </p>
        <p><strong>Data:</strong> ${formatDate(order.createdAt)}</p>
        <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
        <p><strong>Transportadora:</strong> ${order.carrier || "—"}</p>
        <p><strong>Código de rastreio:</strong> ${order.trackingCode || "—"}</p>
        <p><strong>Enviado em:</strong> ${order.shippedAt ? formatDate(order.shippedAt) : "—"}</p>

        <div class="admin-status-update">
          <label for="order-status-select"><strong>Alterar status</strong></label>

          <select id="order-status-select">
            <option value="pending" ${order.status === "pending" ? "selected" : ""}>Pendente</option>
            <option value="paid" ${order.status === "paid" ? "selected" : ""}>Pago</option>
            <option value="shipped" ${order.status === "shipped" ? "selected" : ""}>Enviado</option>
            <option value="cancelled" ${order.status === "cancelled" ? "selected" : ""}>Cancelado</option>
          </select>

          <input
            type="text"
            id="carrier-input"
            placeholder="Transportadora"
            value="${order.carrier || ""}"
          />

          <input
            type="text"
            id="tracking-code-input"
            placeholder="Código de rastreio"
            value="${order.trackingCode || ""}"
          />

          <button id="update-status-btn" data-id="${order.id}">
            Salvar status
          </button>

          <button id="delete-order-btn" data-id="${order.id}" class="admin-delete-btn">
            Excluir pedido
          </button>

          ${order.status === "paid" ? `
            <button id="generate-shipment-btn" data-id="${order.id}" class="admin-generate-btn">
              Gerar envio
            </button>
          ` : ""}

          ${order.labelUrl ? `
            <a href="${order.labelUrl}" target="_blank" class="admin-label-btn">
              Imprimir etiqueta
            </a>
          ` : `
            <button class="admin-label-btn disabled" disabled>
              Etiqueta indisponível
            </button>
          `}

          <p id="status-message"></p>
        </div>
      </div>

      <div class="admin-detail-card">
        <h2>Cliente</h2>
        <p><strong>Nome:</strong> ${order.customer?.name || "Não informado"}</p>
        <p><strong>Email:</strong> ${order.customer?.email || "Não informado"}</p>
        <p><strong>Telefone:</strong> ${order.customer?.phone || "Não informado"}</p>
      </div>

      <div class="admin-detail-card">
        <h2>Endereço</h2>
        <p><strong>Rua:</strong> ${order.address?.street || "Não informado"}</p>
        <p><strong>Número:</strong> ${order.address?.number || "Não informado"}</p>
        <p><strong>Complemento:</strong> ${order.address?.complement || "—"}</p>
        <p><strong>Referência:</strong> ${order.address?.reference || "—"}</p>
        <p><strong>Cidade:</strong> ${order.address?.city || "Não informado"}</p>
        <p><strong>Estado:</strong> ${order.address?.state || "Não informado"}</p>
        <p><strong>CEP:</strong> ${order.address?.cep || "Não informado"}</p>
      </div>

      <div class="admin-detail-card admin-detail-items">
        <h2>Itens do pedido</h2>

        <div class="admin-items-list">
          ${order.cart.map(item => `
            <div class="admin-item-row">
              <div>
                <strong>${item.product}</strong>
                <p>Tamanho: ${item.size}</p>
                <p>Cor: ${item.color}</p>
              </div>

              <div class="admin-item-meta">
                <p>Qtde: ${item.quantity}</p>
                <p>${formatPrice(item.price)}</p>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

    </div>
  `;

  setupStatusUpdate(order.id);
}

function setupStatusUpdate(orderId) {
  const updateBtn = document.getElementById("update-status-btn");
  const statusSelect = document.getElementById("order-status-select");
  const statusMessage = document.getElementById("status-message");
  const trackingCodeInput = document.getElementById("tracking-code-input");
  const carrierInput = document.getElementById("carrier-input");
  const deleteBtn = document.getElementById("delete-order-btn");
  const generateShipmentBtn = document.getElementById("generate-shipment-btn");

  if (!updateBtn || !statusSelect) return;

  updateBtn.addEventListener("click", async () => {
    const newStatus = statusSelect.value;
    const trackingCode = trackingCodeInput ? trackingCodeInput.value.trim() : "";
    const carrier = carrierInput ? carrierInput.value.trim() : "";

    try {
      updateBtn.disabled = true;
      updateBtn.textContent = "Salvando...";

      const response = await fetch(`/admin/orders/${orderId}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "same-origin",
      body: JSON.stringify({
        status: newStatus,
        trackingCode,
        carrier
      })
    });

      if (!response.ok) {
        throw new Error("Erro ao atualizar status");
      }

      const data = await response.json();

      renderOrderDetail(data.order);

      const newStatusMessage = document.getElementById("status-message");
      if (newStatusMessage) {
        newStatusMessage.textContent = "Status atualizado com sucesso.";
        newStatusMessage.style.color = "#4ade80";
      }

    } catch (error) {
      console.error(error);

      if (statusMessage) {
        statusMessage.textContent = "Erro ao atualizar status.";
        statusMessage.style.color = "#ff6b6b";
      }
    } finally {
      updateBtn.disabled = false;
      updateBtn.textContent = "Salvar status";
    }
  });

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const confirmed = window.confirm("Tem certeza que deseja excluir este pedido? Essa ação não poderá ser desfeita.");

      if (!confirmed) return;

      try {
        deleteBtn.disabled = true;
        deleteBtn.textContent = "Excluindo...";

        const response = await fetch(`/admin/orders/${orderId}`, {
          method: "DELETE",
          credentials: "same-origin"
        });

        if (!response.ok) {
          throw new Error("Erro ao excluir pedido");
        }

        alert("Pedido excluído com sucesso.");
        window.location.href = "admin.html";
      } catch (error) {
        console.error(error);

        if (statusMessage) {
          statusMessage.textContent = "Erro ao excluir pedido.";
          statusMessage.style.color = "#ff6b6b";
        }

        deleteBtn.disabled = false;
        deleteBtn.textContent = "Excluir pedido";
      }
    });
  }

  if (generateShipmentBtn) {
    generateShipmentBtn.addEventListener("click", async () => {
      try {
        generateShipmentBtn.disabled = true;
        generateShipmentBtn.textContent = "Gerando envio...";

        const response = await fetch(`/admin/orders/${orderId}/generate-shipment`, {
          method: "POST",
          credentials: "same-origin"
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Erro ao gerar envio");
        }

        const data = await response.json();
        renderOrderDetail(data.order);

        const newStatusMessage = document.getElementById("status-message");
        if (newStatusMessage) {
          newStatusMessage.textContent = "Envio gerado com sucesso.";
          newStatusMessage.style.color = "#4ade80";
        }
      } catch (error) {
        console.error(error);

        if (statusMessage) {
          statusMessage.textContent = error.message || "Erro ao gerar envio.";
          statusMessage.style.color = "#ff6b6b";
        }

        generateShipmentBtn.disabled = false;
        generateShipmentBtn.textContent = "Gerar envio";
      }
    });
  }
}

async function loadOrderDetail() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("id");

  if (!orderId) {
    orderDetailContainer.innerHTML = "<p>Pedido não informado.</p>";
    return;
  }

  try {
    const response = await fetch(`/admin/orders/${orderId}`, {
      credentials: "same-origin"
    });

    if (!response.ok) {
      throw new Error("Pedido não encontrado");
    }

    const order = await response.json();
    renderOrderDetail(order);
  } catch (error) {
    console.error(error);
    orderDetailContainer.innerHTML = "<p>Erro ao carregar pedido.</p>";
  }
}

async function initAdminOrderPage() {
  const authenticated = await requireAdminAuth();

  if (!authenticated) return;

  await loadOrderDetail();
}

initAdminOrderPage();