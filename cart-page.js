const container = document.querySelector(".cart-products");

let cart = JSON.parse(localStorage.getItem("cart")) || [];
let total = 0;

function renderCart() {
  container.innerHTML = "";
  total = 0;

  if (cart.length === 0) {
    container.innerHTML = "<p style='opacity:0.7'>Seu carrinho está vazio.</p>";
    document.getElementById("cart-total").innerText = "R$ 0,00";
    updateCartCount();
    return;
  }

  cart.forEach((item, index) => {
    const div = document.createElement("div");
    div.classList.add("cart-item");

    div.innerHTML = `
      <img src="${item.image}" width="200" alt="${item.product}">

      <div class="cart-details">
        <h3>${item.product}</h3>
        <p>Cor: ${item.color}</p>
        <p>Tamanho: ${item.size}</p>

        <div class="cart-qty">
          <button class="qty-minus" data-index="${index}">-</button>
          <span>${item.quantity}</span>
          <button class="qty-plus" data-index="${index}">+</button>
        </div>

        <p class="cart-price">
          R$ ${(item.price * item.quantity).toFixed(2)}
        </p>

        <button class="btn remove-item" data-index="${index}">
          Remover
        </button>
      </div>
    `;

    container.appendChild(div);
    total += item.price * item.quantity;
  });

  document.getElementById("cart-total").innerText = `R$ ${total.toFixed(2)}`;
  updateCartCount();
}

function updateCartCount() {
  const savedCart = JSON.parse(localStorage.getItem("cart")) || [];
  let totalItems = 0;

  savedCart.forEach((item) => {
    totalItems += item.quantity;
  });

  const counter = document.querySelector(".cart-count");

  if (counter) {
    counter.innerText = totalItems;
  }
}

function goCheckout() {
  window.location.href = "checkout.html";
}

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("remove-item")) {
    const index = Number(e.target.dataset.index);

    cart.splice(index, 1);
    localStorage.setItem("cart", JSON.stringify(cart));
    renderCart();
  }

  if (e.target.classList.contains("qty-plus")) {
    const index = Number(e.target.dataset.index);

    cart[index].quantity += 1;
    localStorage.setItem("cart", JSON.stringify(cart));
    renderCart();
  }

  if (e.target.classList.contains("qty-minus")) {
    const index = Number(e.target.dataset.index);

    if (cart[index].quantity > 1) {
      cart[index].quantity -= 1;
    } else {
      cart.splice(index, 1);
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    renderCart();
  }
});

renderCart();
updateCartCount();