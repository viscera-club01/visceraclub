console.log("CHECKOUT OFICIAL V11");

const API_URL =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : window.location.origin;
console.log("API_URL USADA:", API_URL);

const itemsCountEl = document.getElementById("items-count");
const container = document.getElementById("checkout-products");
const subtotalEl = document.getElementById("subtotal-value");
const discountEl = document.getElementById("discount-value");
const shippingEl = document.getElementById("shipping-value");
const totalEl = document.getElementById("checkout-total");

const couponInput = document.getElementById("coupon-code");
const couponMessage = document.getElementById("coupon-message");
const applyCouponBtn = document.getElementById("apply-coupon-btn");

const cepInput = document.getElementById("cep");
const calcFreteBtn = document.getElementById("calc-frete-btn");
const shippingOptions = document.getElementById("shipping-options");
const payBtn = document.getElementById("pay-btn");

let cart = [];
let subtotal = 0;
let shippingCost = 0;
let discount = 0;
let selectedShipping = null;
let appliedCoupon = "";

function loadCart() {
  cart = JSON.parse(localStorage.getItem("cart")) || [];
}

function formatBRL(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function updateCartCount() {
  const counter = document.querySelector(".cart-count");
  if (!counter) return;

  const totalItems = cart.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0);
  }, 0);

  counter.innerText = totalItems;
}

function updateSummary() {
  const total = Math.max(subtotal + shippingCost - discount, 0);
  const installmentsEl = document.getElementById("checkout-installments");

  if (subtotalEl) subtotalEl.innerText = formatBRL(subtotal);
  if (discountEl) discountEl.innerText = "-" + formatBRL(discount);
  if (shippingEl) shippingEl.innerText = formatBRL(shippingCost);
  if (totalEl) totalEl.innerText = formatBRL(total);

  if (installmentsEl) {
    const installmentValue = total / 3;
    installmentsEl.innerText = `ou 3x de ${formatBRL(installmentValue)} sem juros no cartão`;
  }
}

function renderCheckoutItems() {
  loadCart();

  if (!container) return;

  container.innerHTML = "";
  subtotal = 0;

  if (!cart.length) {
    container.innerHTML = "<p style='opacity:0.7'>Seu carrinho está vazio.</p>";

    if (itemsCountEl) {
      itemsCountEl.innerText = "0";
    }

    updateCartCount();
    updateSummary();
    return;
  }

  let totalItems = 0;

  cart.forEach((item) => {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;

    const div = document.createElement("div");
    div.classList.add("checkout-item");

    div.innerHTML = `
      <p>${item.product} • ${item.size} • ${item.color} • Quantidade: ${quantity}</p>
    `;

    container.appendChild(div);

    subtotal += price * quantity;
    totalItems += quantity;
  });

  if (itemsCountEl) {
    itemsCountEl.innerText = totalItems;
  }

  updateCartCount();
  updateSummary();
}

function getCustomerData() {
  return {
    name: document.getElementById("customer-name")?.value.trim() || "",
    document: document.getElementById("cpf")?.value.trim() || "",
    email: document.getElementById("customer-email")?.value.trim() || "",
    phone: document.getElementById("customer-phone")?.value.trim() || ""
  };
}

function getAddressData() {
  return {
    cep: document.getElementById("cep")?.value.trim() || "",
    street: document.getElementById("street")?.value.trim() || "",
    number: document.getElementById("number")?.value.trim() || "",
    complement: document.getElementById("complement")?.value.trim() || "",
    reference: document.getElementById("reference")?.value.trim() || "",
    city: document.getElementById("city")?.value.trim() || "",
    state: document.getElementById("state")?.value.trim() || ""
  };
}

function validateCustomer(customer) {
  return customer.name && customer.document && customer.email && customer.phone;
}

function validateAddress(address) {
  return address.cep && address.street && address.number && address.city && address.state;
}

function resetShippingSelection() {
  selectedShipping = null;
  shippingCost = 0;
  updateSummary();
}

function renderShippingOptions(options) {
  if (!shippingOptions) return;

  shippingOptions.innerHTML = options
    .map((option) => {
      const price = Number(option.price) || 0;
      const companyName = option.company?.name || "";
      const serviceName = option.name || "";
      const deliveryTime = option.delivery_time || 0;
      const serviceId = option.id || option.service || "";

      return `
        <label class="shipping-option-card">
          <input
            type="radio"
            name="shipping"
            value="${price}"
            data-id="${serviceId}"
            data-name="${serviceName}"
            data-delivery="${deliveryTime}"
            data-company="${companyName}"
          >

          <div class="shipping-option-info">
            <div class="shipping-option-top">
              <span class="shipping-name">${companyName} ${serviceName}</span>
              <span class="shipping-price">${formatBRL(price)}</span>
            </div>

            <div class="shipping-option-bottom">
              Prazo: ${deliveryTime ? `${deliveryTime} dia(s) úteis` : "Não informado"}
            </div>
          </div>
        </label>
      `;
    })
    .join("");

  document.querySelectorAll('input[name="shipping"]').forEach((input) => {
    input.addEventListener("change", () => {
      shippingCost = Number(input.value) || 0;

      selectedShipping = {
        id: input.dataset.id || "",
        company: input.dataset.company || "",
        name: input.dataset.name || "",
        deliveryTime: Number(input.dataset.delivery || 0),
        price: shippingCost
      };

      document.querySelectorAll(".shipping-option-card").forEach((card) => {
        card.classList.remove("selected");
      });

      const card = input.closest(".shipping-option-card");
      if (card) {
        card.classList.add("selected");
      }

      updateSummary();
    });
  });
}

async function applyCoupon() {
  const code = couponInput ? couponInput.value.trim().toUpperCase() : "";

  if (!code) {
    discount = 0;
    appliedCoupon = "";

    if (couponMessage) {
      couponMessage.innerText = "Digite um cupom";
    }

    updateSummary();
    return;
  }

  try {
    const response = await fetch(`${API_URL}/validate-coupon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ coupon: code })
    });

    const text = await response.text();
    let data = {};

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Resposta inválida do servidor: ${text}`);
    }

    if (!response.ok) {
      throw new Error(data.message || "Erro ao validar cupom");
    }

    if (!data.valid) {
      discount = 0;
      appliedCoupon = "";

      if (couponMessage) {
        couponMessage.innerText = data.message || "Cupom inválido";
      }

      updateSummary();
      return;
    }

    discount = subtotal * (Number(data.discountPercent || 0) / 100);
    appliedCoupon = code;

    if (couponMessage) {
      couponMessage.innerText = data.message || "Cupom aplicado";
    }

    updateSummary();
  } catch (error) {
    console.error("Erro ao validar cupom:", error);

    discount = 0;
    appliedCoupon = "";

    if (couponMessage) {
      couponMessage.innerText = "Erro ao validar cupom";
    }

    updateSummary();
  }
}

async function fillAddressByCep() {
  if (!cepInput) return;

  const cep = cepInput.value.replace(/\D/g, "");

  if (cep.length !== 8) return;

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await response.json();

    if (data.erro) {
      alert("CEP não encontrado");
      return;
    }

    const streetInput = document.getElementById("street");
    const cityInput = document.getElementById("city");
    const stateInput = document.getElementById("state");

    if (streetInput) streetInput.value = data.logradouro || "";
    if (cityInput) cityInput.value = data.localidade || "";
    if (stateInput) stateInput.value = data.uf || "";
  } catch (error) {
    console.error("Erro ao buscar CEP:", error);
  }
}

function formatCepInput() {
  if (!cepInput) return;

  let cep = cepInput.value.replace(/\D/g, "");

  if (cep.length > 5) {
    cep = cep.replace(/^(\d{5})(\d)/, "$1-$2");
  }

  cepInput.value = cep;
}

async function calculateShipping() {
  loadCart();

  const cep = cepInput ? cepInput.value.replace(/\D/g, "") : "";

  if (!shippingOptions) return;

  if (cep.length !== 8) {
    shippingOptions.innerHTML = "<p>Digite um CEP válido.</p>";
    return;
  }

  if (!cart.length) {
    shippingOptions.innerHTML = "<p>Seu carrinho está vazio.</p>";
    return;
  }

  shippingOptions.innerHTML = "<p>Calculando frete...</p>";
  resetShippingSelection();

  try {
    console.log("ENVIANDO PARA /calcular-frete:", { cep, cart });

    const response = await fetch(`${API_URL}/calcular-frete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ cep, cart })
    });

    const data = await response.json().catch(() => ({}));

    console.log("RESPOSTA /calcular-frete:", data);

    if (!response.ok) {
      shippingOptions.innerHTML = `<p>${data.erro || data.error || "Erro ao calcular frete."}</p>`;
      return;
    }

    if (!Array.isArray(data)) {
      shippingOptions.innerHTML = `<p>${data.erro || data.message || "Resposta inválida do frete."}</p>`;
      return;
    }

    const validOptions = data.filter((option) => {
      return (
        option && 
        option.price && 
        !option.error &&
        (
          option.company?.name === "Correios" ||
          option.company?.name === "Jadlog"
        )
      );
    });

    if (!validOptions.length) {
      shippingOptions.innerHTML = "<p>Nenhuma opção de frete encontrada.</p>";
      return;
    }

    renderShippingOptions(validOptions);
  } catch (error) {
    console.error("Erro ao calcular frete:", error);
    shippingOptions.innerHTML = "<p>Erro ao calcular frete.</p>";
  }
}

async function finalizarCompraComMercadoPago(
  customer,
  address,
  cartItems,
  shippingValue,
  discountAmount,
  shippingMethod,
  couponCode
) {
  const payload = {
    customer,
    address,
    cart: cartItems,
    shippingCost: shippingValue,
    discountAmount,
    selectedShipping: shippingMethod,
    couponCode
  };

  console.log("ENVIANDO FORM PARA /create-payment-redirect:", payload);

  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${API_URL}/create-payment-redirect`;
  form.style.display = "none";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(payload);

  form.appendChild(input);
  document.body.appendChild(form);

  form.submit();
}

async function handlePayButtonClick(event) {
  event.preventDefault();

  loadCart();

  const customer = getCustomerData();
  const address = getAddressData();

  console.log("CUSTOMER:", customer);
  console.log("ADDRESS:", address);

  if (!validateCustomer(customer)) {
    alert("Preencha nome, cpf, email e telefone.");
    return;
  }

  if (!validateAddress(address)) {
    alert("Preencha os dados do endereço.");
    return;
  }

  if (!Array.isArray(cart) || cart.length === 0) {
    alert("Seu carrinho está vazio.");
    return;
  }

  if (!selectedShipping) {
    alert("Selecione uma opção de frete.");
    return;
  }

  await finalizarCompraComMercadoPago(
    customer,
    address,
    cart,
    shippingCost,
    discount,
    selectedShipping,
    appliedCoupon
  );
}

function setupCPFMask() {
  const cpfInput = document.getElementById("cpf");

  if (!cpfInput) return;

  cpfInput.addEventListener("input", function (e) {
    let value = e.target.value.replace(/\D/g, "");

    value = value.slice(0, 11);

    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");

    e.target.value = value;
  });
}

function initCheckout() {
  renderCheckoutItems();

  window.addEventListener("focus", renderCheckoutItems);
  window.addEventListener("pageshow", renderCheckoutItems);

  if (applyCouponBtn) {
    applyCouponBtn.addEventListener("click", applyCoupon);
  }

  if (cepInput) {
    cepInput.addEventListener("blur", fillAddressByCep);
    cepInput.addEventListener("input", formatCepInput);
  }

  if (calcFreteBtn) {
    calcFreteBtn.addEventListener("click", calculateShipping);
  }

  if (payBtn) {
    payBtn.addEventListener("click", handlePayButtonClick);
  }

  setupCPFMask();
  updateCartCount();
  updateSummary();
}

document.addEventListener("DOMContentLoaded", initCheckout);