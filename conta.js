document.getElementById("search-orders-btn").addEventListener("click", async () => {
  const email = document.getElementById("client-email").value.trim();
  const result = document.getElementById("orders-result");

  if (!email) {
    result.innerHTML = "<p>Digite um email válido.</p>";
    return;
  }

  result.innerHTML = "<p>Buscando pedidos...</p>";

  try {
    const response = await fetch(`/orders?email=${encodeURIComponent(email)}`);

    if (!response.ok) {
      throw new Error("Erro ao buscar pedidos");
    }

    const data = await response.json();
    renderOrders(data);

  } catch (error) {
    console.error(error);
    result.innerHTML = "<p>Erro ao buscar pedidos.</p>";
  }
});

document.addEventListener("DOMContentLoaded", () => {
  if (typeof updateCartCountGlobal === "function") {
    updateCartCountGlobal();
  }
});

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

function renderOrders(orders) {
  const ordersContainer = document.getElementById("orders-result");

  if (!Array.isArray(orders) || orders.length === 0) {
    ordersContainer.innerHTML = "<p>Nenhum pedido encontrado para este email.</p>";
    return;
  }

  ordersContainer.innerHTML = orders.map(order => `
    <div class="account-order-card">
      <div class="account-order-top">
        <h3>Pedido #${order.id}</h3>
        <span class="order-status status-${order.status}">
          ${getStatusLabel(order.status)}
        </span>
      </div>

      <p><strong>Data:</strong> ${formatDate(order.createdAt)}</p>
      <p><strong>Total:</strong> ${formatPrice(order.total)}</p>

      <div class="account-shipping-box">
        <h4>Acompanhamento</h4>
        <p><strong>Status:</strong> ${getStatusLabel(order.status)}</p>
        <p><strong>Transportadora:</strong> ${order.carrier || "—"}</p>
        <p><strong>Código de rastreio:</strong> ${order.trackingCode || "—"}</p>
        <p><strong>Enviado em:</strong> ${order.shippedAt ? formatDate(order.shippedAt) : "—"}</p>
      </div>

      <div class="account-order-items">
        <h4>Itens</h4>
        ${order.cart.map(item => `
          <div class="account-order-item">
            <div>
              <strong>${item.product}</strong>
              <p>Tamanho: ${item.size}</p>
              <p>Cor: ${item.color}</p>
            </div>

            <div class="account-order-item-meta">
              <p>Qtde: ${item.quantity}</p>
              <p>${formatPrice(item.price)}</p>
            </div>
          </div>
        `).join("")}
      </div>

      ${
        ["paid","shipped"].includes(order.status) ? `
        <div class="account-return-box">

          <button class="return-toggle-btn" data-order="${order.id}">
            Solicitar troca ou devolução
          </button>

          <div class="return-form hidden" id="return-form-${order.id}">

            <select class="return-type">
              <option value="exchange">Troca</option>
              <option value="return">Devolução</option>
            </select>

            <select class="return-reason">
              <option value="">Motivo</option>
              <option value="Tamanho não serviu">Tamanho não serviu</option>
              <option value="Produto com defeito">Produto com defeito</option>
              <option value="Recebi item errado">Recebi item errado</option>
              <option value="Arrependimento">Arrependimento</option>
            </select>

            <textarea class="return-message" placeholder="Explique melhor sua solicitação"></textarea>

            <button class="return-send-btn" data-order="${order.id}">
              Enviar solicitação
            </button>

            <div class="return-feedback"></div>

          </div>
        </div>
      ` : ""
      }

    </div>
  `).join("");

  setupReturnButtons();
}

function setupReturnButtons(){

  document.querySelectorAll(".return-toggle-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{

      const id = btn.dataset.order;
      const form = document.getElementById(`return-form-${id}`);

      form.classList.toggle("hidden");

    });
  });


  document.querySelectorAll(".return-send-btn").forEach(btn=>{
    btn.addEventListener("click",async ()=>{

      const orderId = btn.dataset.order;
      const email = document.getElementById("client-email").value.trim();

      const container = btn.closest(".return-form");

      const type = container.querySelector(".return-type").value;
      const reason = container.querySelector(".return-reason").value;
      const message = container.querySelector(".return-message").value.trim();

      const feedback = container.querySelector(".return-feedback");

      if(!reason){
        feedback.innerHTML = "Escolha o motivo.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Enviando...";

      try{

        const response = await fetch("/return-requests",{
          method:"POST",
          headers:{
            "Content-Type":"application/json"
          },
          body:JSON.stringify({
            orderId,
            email,
            type,
            reason,
            message
          })
        });

        const data = await response.json();

        if(!response.ok){
          throw new Error(data.error || "Erro ao enviar");
        }

        feedback.innerHTML = "Solicitação enviada com sucesso.";
        btn.textContent = "Solicitação enviada";

      }catch(error){

        console.error(error);
        feedback.innerHTML = "Erro ao enviar solicitação.";
        btn.disabled = false;
        btn.textContent = "Enviar solicitação";

      }

    });
  });

}