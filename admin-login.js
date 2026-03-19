const loginBtn = document.getElementById("admin-login-btn");
const emailInput = document.getElementById("admin-email");
const passwordInput = document.getElementById("admin-password");
const message = document.getElementById("admin-login-message");

const togglePasswordBtn = document.getElementById("toggle-password");
const passwordField = document.getElementById("admin-password");

if(togglePasswordBtn && passwordField){

  togglePasswordBtn.addEventListener("click", () => {

    const type = passwordField.getAttribute("type") === "password"
      ? "text"
      : "password";

    passwordField.setAttribute("type", type);

    const icon = togglePasswordBtn.querySelector("i");

    if(icon){
      icon.setAttribute(
        "data-lucide",
        type === "password" ? "eye" : "eye-off"
      );

      lucide.createIcons();
    }

  });

}

async function checkExistingSession() {
  try {
    const response = await fetch("/admin/auth/me", {
      credentials: "same-origin"
    });

    if (response.ok) {
      window.location.href = "admin.html";
    }
  } catch (error) {
    console.error("Erro ao verificar sessão existente:", error);
  }
}

if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value.trim() || "";

    if (!email || !password) {
      if (message) {
        message.innerHTML = "<p>Preencha email e senha.</p>";
      }
      return;
    }

    if (message) {
      message.innerHTML = "<p>Entrando...</p>";
    }

    try {
      const response = await fetch("/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (message) {
          message.innerHTML = `<p>${data.error || "Email ou senha inválidos."}</p>`;
        }
        return;
      }

      window.location.href = "admin.html";
    } catch (error) {
      console.error(error);

      if (message) {
        message.innerHTML = "<p>Erro ao fazer login.</p>";
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  checkExistingSession();
});