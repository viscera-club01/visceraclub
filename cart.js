document.addEventListener("DOMContentLoaded", () => {

  /* =========================
  ATUALIZAR CONTADOR DO CARRINHO
  ========================= */

  function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem("cart")) || [];
    let total = 0;

    cart.forEach(item => {
      total += item.quantity;
    });

    const counter = document.querySelector(".cart-count");

    if (counter) {
      counter.innerText = total;
    }
  }

  function bounceCartCount() {
    const counter = document.querySelector(".cart-count");

    if (!counter) return;

    counter.classList.remove("cart-bounce");
    void counter.offsetWidth;
    counter.classList.add("cart-bounce");
  }

  updateCartCount();

  /* =========================
  SELEÇÃO DE COR
  ========================= */

  document.querySelectorAll(".product-block").forEach(block => {
    const dots = block.querySelectorAll(".color-dot");

    dots.forEach(dot => {
      dot.addEventListener("click", () => {
        dots.forEach(d => d.classList.remove("active"));
        dot.classList.add("active");
      });
    });
  });

  /* =========================
  ANIMAÇÃO PREMIUM PARA O CARRINHO
  ========================= */

  function animateToCart(startElement) {
    const cartIcon = document.querySelector(".cart-icon");

    if (!startElement || !cartIcon) {
      bounceCartCount();
      return;
    }

    const startRect = startElement.getBoundingClientRect();
    const cartRect = cartIcon.getBoundingClientRect();

    const clone = startElement.cloneNode(true);
    clone.classList.add("fly-cart-clone", "fly-start");

    clone.style.top = `${startRect.top}px`;
    clone.style.left = `${startRect.left}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;

    document.body.appendChild(clone);

    const targetX = cartRect.left + (cartRect.width / 2) - 10;
    const targetY = cartRect.top + (cartRect.height / 2) - 10;

    requestAnimationFrame(() => {
      clone.classList.add("fly-moving");
      clone.style.left = `${targetX}px`;
      clone.style.top = `${targetY}px`;
      clone.style.width = `20px`;
      clone.style.height = `20px`;
    });

    setTimeout(() => {
      clone.remove();
      bounceCartCount();
    }, 980);
  }

  /* =========================
  ADICIONAR AO CARRINHO
  ========================= */

  document.querySelectorAll(".add-cart").forEach(button => {
    button.addEventListener("click", () => {
      const block = button.closest(".product-block");
      if (!block) return;

      const productImage =
        block.querySelector(".tshirt img") ||
        block.querySelector(".slide.active img") ||
        block.querySelector("img");

      const product = button.dataset.product;
      const price = Number(button.dataset.price);

      const colorBtn = block.querySelector(".color-dot.active");
      const sizeSelect = block.querySelector(".size-select");
      const size = sizeSelect ? sizeSelect.value : null;

      if (!colorBtn || !size) {
        alert("Selecione cor e tamanho");
        return;
      }

      const color = colorBtn.dataset.color;

      /* =========================
      DEFINIR IMAGEM
      ========================= */

      let image = "";

      if (product === "BLOOD & DIAMONDS") {
        image = color === "Black" ? "drop1-preto.gif" : "drop1-off.gif";
      }

      if (product === "BLUE VEIL") {
        image = color === "Black" ? "drop2-preto.gif" : "drop2-off.gif";
      }

      if (product === "PIETÀ") {
        image = color === "Black" ? "drop3-preto.gif" : "drop3-off.gif";
      }

      /* =========================
      SALVAR NO CARRINHO
      ========================= */

      let cart = JSON.parse(localStorage.getItem("cart")) || [];

      const existingItem = cart.find(item =>
        item.product === product &&
        item.color === color &&
        item.size === size
      );

      if (existingItem) {
        existingItem.quantity += 1;
      } else {
        cart.push({
          product,
          price,
          image,
          color,
          size,
          quantity: 1,
          weight: 0.4,
          width: 30,
          height: 5,
          length: 35
        });
      }

      localStorage.setItem("cart", JSON.stringify(cart));
      updateCartCount();
      animateToCart(productImage);
    });
  });

  /* =========================
  MINI CART
  ========================= */

  const cartIcon = document.querySelector(".cart-icon");
  const miniCart = document.querySelector(".mini-cart");
  const overlay = document.querySelector(".mini-cart-overlay");
  const closeMini = document.querySelector(".close-mini-cart");

  function renderMiniCart() {
    const container = document.querySelector(".mini-cart-products");
    if (!container) return;

    const cart = JSON.parse(localStorage.getItem("cart")) || [];

    container.innerHTML = "";

    let total = 0;

    cart.forEach((item, index) => {
      const div = document.createElement("div");
      div.classList.add("mini-cart-item");

      div.innerHTML = `
        <img src="${item.image}" width="70" alt="${item.product}">

        <div class="mini-cart-info">
          <p>${item.product}</p>
          <p>${item.size} • ${item.color}</p>

          <div class="mini-cart-qty">
            <button class="mini-minus" data-index="${index}">−</button>
            <span>${item.quantity}</span>
            <button class="mini-plus" data-index="${index}">+</button>
          </div>
        </div>
      `;

      container.appendChild(div);
      total += item.price * item.quantity;
    });

    const totalElement = document.getElementById("mini-cart-total");

    if (totalElement) {
      totalElement.innerText = "R$ " + total.toFixed(2);
    }
  }

  if (cartIcon && miniCart && overlay) {
    cartIcon.addEventListener("click", (e) => {
      e.preventDefault();
      miniCart.classList.add("open");
      overlay.classList.add("open");
      renderMiniCart();
    });
  }

  if (closeMini && miniCart && overlay) {
    closeMini.addEventListener("click", () => {
      miniCart.classList.remove("open");
      overlay.classList.remove("open");
    });
  }

  if (overlay && miniCart) {
    overlay.addEventListener("click", () => {
      miniCart.classList.remove("open");
      overlay.classList.remove("open");
    });
  }

  /* =========================
  CONTROLE QUANTIDADE MINI CART
  ========================= */

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("mini-plus")) {
      const cart = JSON.parse(localStorage.getItem("cart")) || [];
      const index = Number(e.target.dataset.index);

      if (cart[index]) {
        cart[index].quantity += 1;
        localStorage.setItem("cart", JSON.stringify(cart));
        renderMiniCart();
        updateCartCount();
        bounceCartCount();
      }
    }

    if (e.target.classList.contains("mini-minus")) {
      const cart = JSON.parse(localStorage.getItem("cart")) || [];
      const index = Number(e.target.dataset.index);

      if (cart[index]) {
        if (cart[index].quantity > 1) {
          cart[index].quantity -= 1;
        } else {
          cart.splice(index, 1);
        }

        localStorage.setItem("cart", JSON.stringify(cart));
        renderMiniCart();
        updateCartCount();
        bounceCartCount();
      }
    }
  });

});