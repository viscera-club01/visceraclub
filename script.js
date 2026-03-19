function updateCartCountGlobal() {
  const counter = document.querySelector(".cart-count");

  if (!counter) return;

  const cart = JSON.parse(localStorage.getItem("cart")) || [];

  let total = 0;

  cart.forEach(item => {
    total += item.quantity;
  });

  counter.innerText = total;

  counter.classList.remove("cart-bounce");
  void counter.offsetWidth;
  counter.classList.add("cart-bounce");
}

const productImages = {
  "BLOOD & DIAMONDS": {
    "Black": "drop1-preto.gif",
    "Off White": "drop1-off.gif"
  },
  "BLUE VEIL": {
    "Black": "drop2-preto.gif",
    "Off White": "drop2-off.gif"
  },
  "PIETÀ": {
    "Black": "drop3-preto.gif",
    "Off White": "drop3-off.gif"
  }
};

document.addEventListener("DOMContentLoaded", function() {
  updateCartCountGlobal();

  // ==========================
  // HERO SCROLL (SÓ DESKTOP)
  // ==========================

  const heroTitle = document.getElementById("hero-title");
  const heroSub = document.getElementById("hero-sub");

  if (window.innerWidth > 768) {
    window.addEventListener("scroll", () => {
      let scroll = window.scrollY;
      let scale = Math.max(1, 6 - scroll * 0.01);

      if (heroTitle && heroSub) {
        heroTitle.style.fontSize = scale + "rem";
        heroSub.style.opacity = 1 - scroll * 0.002;
      }
    });
  }

  // ========================
  // TROCA DE COR (GIF)
  // ========================

  document.querySelectorAll(".color-selector").forEach(selector => {
    const colors = selector.querySelectorAll(".color");

    const dropBox = selector.closest(".drop-box");
    if (!dropBox) return;

    const productImage = dropBox.querySelector(".tshirt img");
    if (!productImage) return;

    colors.forEach(color => {
      color.addEventListener("click", () => {
        colors.forEach(c => c.classList.remove("active"));
        color.classList.add("active");

        const newImg = color.getAttribute("data-img");
        if (!newImg) return;

        productImage.style.opacity = 0;

        setTimeout(() => {
          productImage.src = newImg;
          productImage.style.opacity = 1;
        }, 200);
      });
    });
  });

  // ================= SLIDER PRODUTOS =================

  document.querySelectorAll(".product-block").forEach(block => {
    const slides = block.querySelectorAll(".slide");
    const leftBtn = block.querySelector(".arrow.left");
    const rightBtn = block.querySelector(".arrow.right");

    if (!slides.length) return;

    let current = 0;

    function updateSlider() {
      slides.forEach(slide => {
        slide.classList.remove("active", "prev", "next");
      });

      slides[current].classList.add("active");

      let prev = (current - 1 + slides.length) % slides.length;
      let next = (current + 1) % slides.length;

      slides[prev].classList.add("prev");
      slides[next].classList.add("next");
    }

    if (rightBtn) {
      rightBtn.addEventListener("click", () => {
        current = (current + 1) % slides.length;
        updateSlider();
      });
    }

    if (leftBtn) {
      leftBtn.addEventListener("click", () => {
        current = (current - 1 + slides.length) % slides.length;
        updateSlider();
      });
    }

    block.addEventListener("touchstart", (e) => {
      if (!e.touches || !e.touches.length) return;
      block.dataset.startX = e.touches[0].clientX;
    });

    block.addEventListener("touchend", (e) => {
      const startX = Number(block.dataset.startX || 0);
      const endX = e.changedTouches && e.changedTouches.length
        ? e.changedTouches[0].clientX
        : 0;

      if (startX - endX > 50) {
        current = (current + 1) % slides.length;
        updateSlider();
      }

      if (endX - startX > 50) {
        current = (current - 1 + slides.length) % slides.length;
        updateSlider();
      }
    });

    updateSlider();
  });

  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
});

// ================= BOTÃO VOLTAR AO TOPO =================

const backToTop = document.querySelector(".back-to-top");

window.addEventListener("scroll", () => {
  if (!backToTop) return;

  if (window.scrollY > 400) {
    backToTop.classList.add("show");
  } else {
    backToTop.classList.remove("show");
  }
});

updateCartCountGlobal();