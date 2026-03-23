require("dotenv").config();

const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const { Resend } = require("resend");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
const ordersFilePath = path.join(__dirname, "orders.json");
const returnRequestsFilePath = path.join(__dirname, "return-requests.json");

const ADMIN_EMAIL = String(
  process.env.ADMIN_LOGIN_EMAIL || "visceraclub01@gmail.com"
).trim().toLowerCase();

const ADMIN_PASSWORD = String(
  process.env.ADMIN_LOGIN_PASSWORD || ""
).trim();

const ADMIN_SESSION_SECRET = String(
  process.env.ADMIN_SESSION_SECRET || "change-this-secret"
).trim();

const TOKEN = process.env.MELHOR_ENVIO_TOKEN;

const MELHOR_ENVIO_BASE_URL = "https://www.melhorenvio.com.br/api/v2/me";

console.log("TOKEN MELHOR ENVIO CARREGADO:", TOKEN ? "SIM" : "NÃO");
console.log("BASE URL MELHOR ENVIO:", MELHOR_ENVIO_BASE_URL);

const MELHOR_ENVIO_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "VISCERA CLUB (visceraclub01@gmail.com)"
};

/* =========================
   EMAIL (RESEND)
========================= */

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const STORE_NAME = process.env.STORE_NAME || "VISCERA CLUB";
const STORE_FROM_EMAIL =
  process.env.STORE_FROM_EMAIL || "VISCERA CLUB <pedidos@visceraclub.com.br>";
const STORE_REPLY_TO =
  process.env.STORE_REPLY_TO || "visceraclub01@gmail.com";
const ADMIN_NOTIFICATION_EMAIL =
  process.env.STORE_NOTIFICATION_EMAIL || "visceraclub01@gmail.com";
const STORE_URL = process.env.STORE_URL || "https://visceraclub.com.br";

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN
});

/* =========================
   SESSÃO ADMIN
========================= */

const adminSessions = new Map();
const ADMIN_COOKIE_NAME = "viscera_admin_session";
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 horas

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;

      const key = decodeURIComponent(part.slice(0, index).trim());
      const value = decodeURIComponent(part.slice(index + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function signAdminToken(rawToken) {
  return crypto
    .createHmac("sha256", ADMIN_SESSION_SECRET)
    .update(String(rawToken))
    .digest("hex");
}

function createAdminSession(email) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const signedToken = signAdminToken(rawToken);
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;

  adminSessions.set(signedToken, {
    email,
    expiresAt
  });

  return {
    rawToken,
    signedToken,
    expiresAt
  };
}

function cleanupExpiredAdminSessions() {
  const now = Date.now();

  for (const [token, session] of adminSessions.entries()) {
    if (!session || session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function getAdminSessionFromRequest(req) {
  cleanupExpiredAdminSessions();

  const cookies = parseCookies(req.headers.cookie || "");
  const rawToken = cookies[ADMIN_COOKIE_NAME];

  if (!rawToken) return null;

  const signedToken = signAdminToken(rawToken);
  const session = adminSessions.get(signedToken);

  if (!session) return null;

  if (session.expiresAt <= Date.now()) {
    adminSessions.delete(signedToken);
    return null;
  }

  return {
    rawToken,
    signedToken,
    session
  };
}

function setAdminSessionCookie(res, rawToken) {
  const isProduction = process.env.NODE_ENV === "production";

  const parts = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}`
  ];

  if (isProduction) {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAdminSessionCookie(res) {
  const isProduction = process.env.NODE_ENV === "production";

  const parts = [
    `${ADMIN_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (isProduction) {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

function requireAdminAuth(req, res, next) {
  const auth = getAdminSessionFromRequest(req);

  if (!auth) {
    return res.status(401).json({
      authenticated: false,
      error: "Não autorizado"
    });
  }

  req.adminUser = auth.session;
  req.adminSessionToken = auth.signedToken;
  return next();
}

/* =========================
   FUNÇÕES AUXILIARES
========================= */

function getCouponDiscountPercent(code) {
  const coupons = {
    MEMBROVISCERA: 10,
    TESTE99: 99
  };

  return coupons[code] || 0;
}

function readOrders() {
  try {
    if (!fs.existsSync(ordersFilePath)) {
      fs.writeFileSync(ordersFilePath, "[]", "utf8");
    }

    const fileContent = fs.readFileSync(ordersFilePath, "utf8");
    return JSON.parse(fileContent || "[]");
  } catch (error) {
    console.log("ERRO AO LER orders.json");
    console.error(error);
    return [];
  }
}

function saveOrders(orders) {
  try {
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2), "utf8");
  } catch (error) {
    console.log("ERRO AO SALVAR orders.json");
    console.error(error);
  }
}

function readReturnRequests() {
  try {
    if (!fs.existsSync(returnRequestsFilePath)) {
      fs.writeFileSync(returnRequestsFilePath, "[]", "utf8");
    }

    const fileContent = fs.readFileSync(returnRequestsFilePath, "utf8");
    return JSON.parse(fileContent || "[]");
  } catch (error) {
    console.log("ERRO AO LER return-requests.json");
    console.error(error);
    return [];
  }
}

function saveReturnRequests(requests) {
  try {
    fs.writeFileSync(returnRequestsFilePath, JSON.stringify(requests, null, 2), "utf8");
  } catch (error) {
    console.log("ERRO AO SALVAR return-requests.json");
    console.error(error);
  }
}

function formatBRL(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getOrderItemsHtml(order) {
  if (!Array.isArray(order.cart) || order.cart.length === 0) {
    return "<li>Nenhum item encontrado.</li>";
  }

  return order.cart
    .map((item) => {
      const product = escapeHtml(item.product || "Produto");
      const size = item.size ? ` | Tam: ${escapeHtml(item.size)}` : "";
      const color = item.color ? ` | Cor: ${escapeHtml(item.color)}` : "";
      const quantity = Number(item.quantity || 0);
      const price = formatBRL(item.price || 0);

      return `<li>${product}${size}${color} | Qtd: ${quantity} | Valor unit.: ${price}</li>`;
    })
    .join("");
}

function getOrderItemsText(order) {
  if (!Array.isArray(order.cart) || order.cart.length === 0) {
    return "Nenhum item encontrado.";
  }

  return order.cart
    .map((item, index) => {
      const product = item.product || "Produto";
      const size = item.size ? ` | Tam: ${item.size}` : "";
      const color = item.color ? ` | Cor: ${item.color}` : "";
      const quantity = Number(item.quantity || 0);
      const price = formatBRL(item.price || 0);

      return `${index + 1}. ${product}${size}${color} | Qtd: ${quantity} | Valor unit.: ${price}`;
    })
    .join("\n");
}

function ensureEmailNotifications(order) {
  if (!order.emailNotifications) {
    order.emailNotifications = {
      orderCreatedSentAt: "",
      adminOrderCreatedSentAt: "",
      paymentApprovedSentAt: "",
      adminNewSaleSentAt: "",
      shipmentSentAt: ""
    };
  }

  return order.emailNotifications;
}

function renderEmailLayout(title, contentHtml) {
  const logoUrl = "https://res.cloudinary.com/dojrpqufo/image/upload/v1773334042/logo-email_hhkrvi.png";
  const instagramUrl = process.env.STORE_INSTAGRAM || "https://instagram.com/visceraclub";

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
    </head>
    <body style="margin:0;padding:0;background:#0a0a0a;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0a0a0a;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:40px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#111111;border:1px solid #1f1f1f;border-radius:18px;overflow:hidden;">
              
              <tr>
                <td align="center" style="padding:36px 24px 20px;background:#0d0d0d;">
                  <img
                    src="${logoUrl}"
                    alt="VISCERA CLUB"
                    width="220"
                    border="0"
                    style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:220px;max-width:220px;height:auto;"
                  />
                </td>
              </tr>

              <tr>
                <td style="padding:0 32px;">
                  <div style="height:1px;background:#2a2a2a;width:100%;"></div>
                </td>
              </tr>

              <tr>
                <td style="padding:32px;">
                  <h1 style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.2;color:#ffffff;font-weight:700;letter-spacing:0.5px;">
                    ${escapeHtml(title)}
                  </h1>

                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.8;color:#d8d8d8;">
                    ${contentHtml}
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:0 32px 32px 32px;">
                  <div style="height:1px;background:#2a2a2a;width:100%;margin-bottom:20px;"></div>

                  <p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#8d8d8d;text-align:center;">
                    VISCERA CLUB<br>
                    Não é sobre roupa. É sobre identidade.
                  </p>

                  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:#8d8d8d;text-align:center;">
                    <a href="${STORE_URL}" target="_blank" style="color:#b5b5b5;text-decoration:none;">Site</a>
                    &nbsp;•&nbsp;
                    <a href="${instagramUrl}" target="_blank" style="color:#b5b5b5;text-decoration:none;">Instagram</a>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

async function sendEmailSafe({ to, subject, html, text }) {
  if (!resend) {
    console.warn("[EMAIL] RESEND_API_KEY não configurada. E-mail não enviado.");
    return { skipped: true };
  }

  try {
    const result = await resend.emails.send({
      from: STORE_FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      replyTo: STORE_REPLY_TO,
      subject,
      html,
      text
    });

    console.log("EMAIL ENVIADO:", result?.data?.id || result?.id || "sem-id");
    return result;
  } catch (error) {
    console.error("[EMAIL] ERRO AO ENVIAR EMAIL:");
    console.error(error);
    return { error: true };
  }
}

async function sendOrderCreatedEmail(order) {
  if (!order?.customer?.email) return;

  const itemsText = getOrderItemsText(order);
  const subject = `Recebemos seu pedido #${order.id}`;

  const html = renderEmailLayout(
    "Pedido recebido",
    `
      <p style="margin:0 0 14px 0;">Olá, ${escapeHtml(order.customer.name || "cliente")}.</p>

      <p style="margin:0 0 14px 0;">
        Seu pedido foi recebido e já está registrado em nosso sistema.
      </p>

      <p style="margin:0 0 14px 0;">
        <strong style="color:#ffffff;">Pedido:</strong> #${escapeHtml(order.id)}<br>
        <strong style="color:#ffffff;">Total:</strong> ${formatBRL(order.total)}
      </p>

      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Itens:</strong></p>
      <ul style="padding-left:18px;margin:0 0 18px 0;color:#d8d8d8;">
        ${getOrderItemsHtml(order)}
      </ul>

      <p style="margin:0;">
        Assim que o pagamento for confirmado, você recebe a próxima atualização por e-mail.
      </p>
    `
  );

  const text = [
    `Olá, ${order.customer.name || "cliente"}.`,
    "",
    "Seu pedido foi recebido e já está registrado em nosso sistema.",
    `Pedido: #${order.id}`,
    `Total: ${formatBRL(order.total)}`,
    "",
    "Itens:",
    itemsText,
    "",
    "Assim que o pagamento for confirmado, você recebe a próxima atualização por e-mail."
  ].join("\n");

  return sendEmailSafe({
    to: order.customer.email,
    subject,
    html,
    text
  });
}

async function sendAdminOrderReceivedEmail(order) {
  const itemsText = getOrderItemsText(order);

  const subject = `Novo pedido recebido na VISCERA CLUB • #${order.id}`;

  const html = renderEmailLayout(
    "Novo pedido recebido",
    `
      <p style="margin:0 0 14px 0;">
        Um novo pedido foi recebido na loja e está aguardando pagamento.
      </p>

      <p style="margin:0 0 14px 0;">
        <strong style="color:#ffffff;">Pedido:</strong> #${escapeHtml(order.id)}<br>
        <strong style="color:#ffffff;">Cliente:</strong> ${escapeHtml(order.customer?.name || "-")}<br>
        <strong style="color:#ffffff;">E-mail:</strong> ${escapeHtml(order.customer?.email || "-")}<br>
        <strong style="color:#ffffff;">Telefone:</strong> ${escapeHtml(order.customer?.phone || "-")}<br>
        <strong style="color:#ffffff;">Total:</strong> ${formatBRL(order.total)}<br>
        <strong style="color:#ffffff;">Status:</strong> Pedido recebido / aguardando pagamento
      </p>

      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Itens:</strong></p>
      <ul style="padding-left:18px;margin:0;color:#d8d8d8;">
        ${getOrderItemsHtml(order)}
      </ul>
    `
  );

  const text = [
    "Um novo pedido foi recebido na loja e está aguardando pagamento.",
    `Pedido: #${order.id}`,
    `Cliente: ${order.customer?.name || "-"}`,
    `E-mail: ${order.customer?.email || "-"}`,
    `Telefone: ${order.customer?.phone || "-"}`,
    `Total: ${formatBRL(order.total)}`,
    "Status: Pedido recebido / aguardando pagamento",
    "",
    "Itens:",
    itemsText
  ].join("\n");

  return sendEmailSafe({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject,
    html,
    text
  });
}

async function sendPaymentApprovedEmail(order) {
  if (!order?.customer?.email) return;

  const subject = `Pagamento confirmado do pedido #${order.id}`;

  const html = renderEmailLayout(
    "Pagamento confirmado",
    `
      <p style="margin:0 0 14px 0;">Olá, ${escapeHtml(order.customer.name || "cliente")}.</p>

      <p style="margin:0 0 14px 0;">
        O pagamento do seu pedido foi aprovado com sucesso.
      </p>

      <p style="margin:0 0 14px 0;">
        <strong style="color:#ffffff;">Pedido:</strong> #${escapeHtml(order.id)}<br>
        <strong style="color:#ffffff;">Total:</strong> ${formatBRL(order.total)}
      </p>

      <p style="margin:0;">
        Agora vamos preparar seu envio.
      </p>
    `
  );

  const text = [
    `Olá, ${order.customer.name || "cliente"}.`,
    "",
    "O pagamento do seu pedido foi aprovado com sucesso.",
    `Pedido: #${order.id}`,
    `Total: ${formatBRL(order.total)}`,
    "",
    "Agora vamos preparar seu envio."
  ].join("\n");

  return sendEmailSafe({
    to: order.customer.email,
    subject,
    html,
    text
  });
}

async function sendAdminNewSaleEmail(order) {
  const itemsText = getOrderItemsText(order);
  const subject = `Nova venda confirmada na VISCERA CLUB • #${order.id}`;

  const html = renderEmailLayout(
    "Nova venda confirmada",
    `
      <p style="margin:0 0 14px 0;">Uma nova venda foi confirmada na loja.</p>

      <p style="margin:0 0 14px 0;">
        <strong style="color:#ffffff;">Pedido:</strong> #${escapeHtml(order.id)}<br>
        <strong style="color:#ffffff;">Cliente:</strong> ${escapeHtml(order.customer?.name || "-")}<br>
        <strong style="color:#ffffff;">E-mail:</strong> ${escapeHtml(order.customer?.email || "-")}<br>
        <strong style="color:#ffffff;">Total:</strong> ${formatBRL(order.total)}
      </p>

      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Itens:</strong></p>
      <ul style="padding-left:18px;margin:0;color:#d8d8d8;">
        ${getOrderItemsHtml(order)}
      </ul>
    `
  );

  const text = [
    "Uma nova venda foi confirmada na loja.",
    `Pedido: #${order.id}`,
    `Cliente: ${order.customer?.name || "-"}`,
    `E-mail: ${order.customer?.email || "-"}`,
    `Total: ${formatBRL(order.total)}`,
    `Data: ${order.createdAt || "-"}`,
    "",
    "Itens:",
    itemsText
  ].join("\n");

  return sendEmailSafe({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject,
    html,
    text
  });
}

async function sendShipmentEmail(order) {
  if (!order?.customer?.email) return;

  const subject = `Seu pedido foi enviado`;
  const carrier = order.carrier || "Transportadora";
  const trackingCode = order.trackingCode || "Aguardando rastreio";
  const labelUrl = order.labelUrl || "";

  const html = renderEmailLayout(
    "Pedido enviado",
    `
      <p style="margin:0 0 14px 0;">Olá, ${escapeHtml(order.customer.name || "cliente")}.</p>

      <p style="margin:0 0 14px 0;">
        Seu pedido foi enviado.
      </p>

      <p style="margin:0 0 14px 0;">
        <strong style="color:#ffffff;">Pedido:</strong> #${escapeHtml(order.id)}<br>
        <strong style="color:#ffffff;">Transportadora:</strong> ${escapeHtml(carrier)}<br>
        <strong style="color:#ffffff;">Rastreio:</strong> ${escapeHtml(trackingCode)}
      </p>

      ${
        labelUrl
          ? `
            <div style="margin:22px 0;">
              <a
                href="${escapeHtml(labelUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                style="display:inline-block;background:#7a0000;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;padding:14px 22px;border-radius:10px;"
              >
                Acompanhar envio
              </a>
            </div>
          `
          : `
            <p style="margin:0;">
              Use o código acima para acompanhar seu pedido.
            </p>
          `
      }
    `
  );

  const text = [
    `Olá, ${order.customer.name || "cliente"}.`,
    "",
    "Seu pedido foi enviado.",
    `Pedido: #${order.id}`,
    `Transportadora: ${carrier}`,
    `Código de rastreio: ${trackingCode}`,
    labelUrl
      ? `Acompanhar envio: ${labelUrl}`
      : "Use o código acima para acompanhar seu pedido."
  ].join("\n");

  return sendEmailSafe({
    to: order.customer.email,
    subject,
    html,
    text
  });
}

function sanitizePostalCode(value = "") {
  return String(value).replace(/\D/g, "");
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function getSenderData() {
  return {
    name: process.env.MELHOR_ENVIO_FROM_NAME || "",
    phone: onlyDigits(process.env.MELHOR_ENVIO_FROM_PHONE || ""),
    email: process.env.MELHOR_ENVIO_FROM_EMAIL || "",
    document: onlyDigits(process.env.MELHOR_ENVIO_FROM_DOCUMENT || ""),
    company_name: process.env.MELHOR_ENVIO_FROM_COMPANY || "VISCERA CLUB",
    address: process.env.MELHOR_ENVIO_FROM_STREET || "",
    number: String(process.env.MELHOR_ENVIO_FROM_NUMBER || ""),
    complement: process.env.MELHOR_ENVIO_FROM_COMPLEMENT || "",
    district: process.env.MELHOR_ENVIO_FROM_DISTRICT || "",
    city: process.env.MELHOR_ENVIO_FROM_CITY || "",
    state_abbr: process.env.MELHOR_ENVIO_FROM_STATE || "",
    country_id: "BR",
    postal_code: sanitizePostalCode(process.env.MELHOR_ENVIO_FROM_POSTAL_CODE || "")
  };
}

function getRecipientDataFromOrder(order) {
  return {
    name: order.customer?.name || "",
    phone: onlyDigits(order.customer?.phone || ""),
    email: order.customer?.email || "",
    document: onlyDigits(order.customer?.document || order.customer?.cpf || ""),
    company_name: "",
    state_register: "",
    address: order.address?.street || "",
    number: String(order.address?.number || ""),
    complement: order.address?.complement || "",
    district: order.address?.district || order.address?.reference || "",
    city: order.address?.city || "",
    state_abbr: order.address?.state || "",
    country_id: "BR",
    postal_code: sanitizePostalCode(order.address?.cep || ""),
    note: order.address?.reference || ""
  };
}

function getPackageProductFromOrder(order) {
  return {
    id: String(order.id),
    name: `Pedido #${order.id} - VISCERA CLUB`,
    quantity: 1,
    unitary_value: Number(order.total || 0)
  };
}


function getPackageVolumeFromOrder(order) {
  const packageData = getPackageData(order.cart || []);

  return {
    height: Number(packageData.height),
    width: Number(packageData.width),
    length: Number(packageData.length),
    weight: Number(packageData.weight)
  };
}

function getSelectedServiceId(order) {
  return (
    order.shippingMethod?.id ||
    order.shippingMethod?.service ||
    order.shippingMethod?.service_id ||
    null
  );
}

async function melhorEnvioRequest(method, endpoint, data) {
  const response = await axios({
    method,
    url: `${MELHOR_ENVIO_BASE_URL}${endpoint}`,
    headers: MELHOR_ENVIO_HEADERS,
    data
  });

  return response.data;
}

async function generateShipmentForOrder(order) {
  try {
    console.log("GERANDO ENVIO REAL PARA PEDIDO:", order.id);

    if (!TOKEN) {
      throw new Error("MELHOR_ENVIO_TOKEN não configurado");
    }

    const serviceId = getSelectedServiceId(order);

    if (!serviceId) {
      throw new Error("Não foi possível identificar o serviço selecionado no pedido.");
    }

    const from = getSenderData();
    const to = getRecipientDataFromOrder(order);
    const product = getPackageProductFromOrder(order);
    const volume = getPackageVolumeFromOrder(order);

    console.log("DESTINATÁRIO MONTADO:");
    console.dir(to, { depth: null });

    console.log("CLIENTE DO PEDIDO:");
    console.dir(order.customer, { depth: null });

    console.log("ENDEREÇO DO PEDIDO:");
    console.dir(order.address, { depth: null });

    if (
      !from.name ||
      !from.document ||
      !from.phone ||
      !from.email ||
      !from.document ||
      !from.address ||
      !from.number ||
      !from.district ||
      !from.city ||
      !from.state_abbr ||
      !from.postal_code
    ) {
      throw new Error("Dados do remetente incompletos no .env");
    }

    if (
      !to.name ||
      !to.document ||
      !to.phone ||
      !to.email ||
      !to.address ||
      !to.number ||
      !to.city ||
      !to.state_abbr ||
      !to.postal_code
    ) {
      throw new Error("Dados do destinatário incompletos no pedido");
    }

    const cartPayload = {
      service: Number(serviceId),
      from,
      to,
      products: [product],
      volumes: [volume],
      options: {
        receipt: false,
        own_hand: false,
        insurance_value: Number(order.total || 0),
        reverse: false,
        non_commercial: true
      }
    };
    console.log("PAYLOAD ENVIADO AO /cart:");
    console.dir(cartPayload, { depth: null });

    const cartResult = await melhorEnvioRequest("post", "/cart", cartPayload);

    console.log("RESPOSTA /cart:");
    console.dir(cartResult, { depth: null });

    const cartItemId =
      cartResult?.id ||
      cartResult?.data?.id ||
      cartResult?.shipment_id ||
      null;

    if (!cartItemId) {
      throw new Error("Melhor Envio não retornou o ID do carrinho.");
    }

    const checkoutPayload = {
      orders: [cartItemId]
    };

    const checkoutResult = await melhorEnvioRequest(
      "post",
      "/shipment/checkout",
      checkoutPayload
    );

    console.log("RESPOSTA /shipment/checkout:");
    console.dir(checkoutResult, { depth: null });

    const generatePayload = {
      orders: [cartItemId]
    };

    const generateResult = await melhorEnvioRequest(
      "post",
      "/shipment/generate",
      generatePayload
    );

    console.log("RESPOSTA /shipment/generate:");
    console.dir(generateResult, { depth: null });

    const printPayload = {
      orders: [cartItemId],
      mode: "public"
    };

    const printResult = await melhorEnvioRequest(
      "post",
      "/shipment/print",
      printPayload
    );

    console.log("RESPOSTA /shipment/print:");
    console.dir(printResult, { depth: null });

    const trackingCode =
      generateResult?.tracking ||
      generateResult?.tracking_code ||
      generateResult?.data?.tracking ||
      generateResult?.data?.tracking_code ||
      "";

    const carrierName =
      generateResult?.company?.name ||
      generateResult?.agency?.company?.name ||
      order.shippingMethod?.company?.name ||
      order.shippingMethod?.company ||
      "Melhor Envio";

    const labelUrl =
      printResult?.url ||
      printResult?.link ||
      printResult?.data?.url ||
      printResult?.data?.link ||
      "";

    order.melhorEnvioCartId = cartItemId;
    order.melhorEnvioCheckout = checkoutResult || null;
    order.melhorEnvioGenerate = generateResult || null;
    order.melhorEnvioPrint = printResult || null;

    order.carrier = carrierName;
    order.trackingCode = trackingCode;
    order.labelUrl = labelUrl;
    order.shippedAt = new Date().toISOString();
    order.status = "shipped";

    console.log("ENVIO REAL GERADO COM SUCESSO");
  } catch (error) {
    console.error("Erro ao gerar envio real:");

    if (error.response) {
      console.error("STATUS:", error.response.status);
      console.dir(error.response.data, { depth: null });
    } else {
      console.error(error.message || error);
    }

    throw error;
  }
}

function buildMercadoPagoItems(cart, shippingCost = 0, discountAmount = 0) {
  const normalizedCart = cart.map((item) => ({
    title: item.product,
    quantity: Number(item.quantity),
    unitPrice: Number(item.price)
  }));

  const totalProducts = normalizedCart.reduce((sum, item) => {
    return sum + item.unitPrice * item.quantity;
  }, 0);

  let remainingDiscount = Number(discountAmount) || 0;

  const mpItems = normalizedCart.map((item, index) => {
    const lineTotal = item.unitPrice * item.quantity;
    let lineDiscount = 0;

    if (remainingDiscount > 0 && totalProducts > 0) {
      if (index === normalizedCart.length - 1) {
        lineDiscount = remainingDiscount;
      } else {
        lineDiscount = Number(((lineTotal / totalProducts) * discountAmount).toFixed(2));
        remainingDiscount = Number((remainingDiscount - lineDiscount).toFixed(2));
      }
    }

    const adjustedLineTotal = Math.max(0, Number((lineTotal - lineDiscount).toFixed(2)));
    const adjustedUnitPrice = Number((adjustedLineTotal / item.quantity).toFixed(2));

    return {
      title: item.title,
      quantity: item.quantity,
      unit_price: adjustedUnitPrice,
      currency_id: "BRL"
    };
  });

  if (Number(shippingCost) > 0) {
    mpItems.push({
      title: "Frete",
      quantity: 1,
      unit_price: Number(Number(shippingCost).toFixed(2)),
      currency_id: "BRL"
    });
  }

  return mpItems;
}

/* =========================
   CUPOM
========================= */

app.post("/validate-coupon", (req, res) => {
  try {
    const code = String(req.body?.coupon || "").trim().toUpperCase();

    if (!code) {
      return res.status(200).json({
        valid: false,
        discountPercent: 0,
        message: "Digite um cupom."
      });
    }

    const discountPercent = getCouponDiscountPercent(code);

    if (!discountPercent) {
      return res.status(200).json({
        valid: false,
        discountPercent: 0,
        message: "Cupom inválido"
      });
    }

    return res.status(200).json({
      valid: true,
      discountPercent,
      message: `Cupom aplicado: ${discountPercent}%`
    });
  } catch (error) {
    console.error("Erro em /validate-coupon:", error);
    return res.status(500).json({
      valid: false,
      discountPercent: 0,
      message: "Erro ao validar cupom"
    });
  }
});

/* =========================
   FRETE
========================= */

function getPackageData(cart = []) {
  const totalQuantity = cart.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0);
  }, 0);

  if (totalQuantity <= 1) {
    return { width: 30, length: 40, height: 2, weight: 0.4 };
  }

  if (totalQuantity === 2) {
    return { width: 30, length: 40, height: 4, weight: 0.75 };
  }

  if (totalQuantity === 3) {
    return { width: 30, length: 40, height: 6, weight: 1.1 };
  }

  return {
    width: 30,
    length: 40,
    height: Math.ceil(8 + ((totalQuantity - 4) * 1.5)),
    weight: Number((1.45 + ((totalQuantity - 4) * 0.35)).toFixed(2))
  };
}

app.post("/calcular-frete", async (req, res) => {
  console.log("BATEU NA ROTA /calcular-frete");
  console.log("BODY RECEBIDO:", req.body);

  let { cep, cart } = req.body;

  if (!cep || !cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({
      erro: "CEP ou carrinho não informado"
    });
  }

  cep = String(cep).replace(/\D/g, "");

  const packageData = getPackageData(cart);

  const insuranceValue = cart.reduce((sum, item) => {
    return sum + (Number(item.price) * Number(item.quantity || 0));
  }, 0);

  const products = [
    {
      id: "viscera-envelope",
      width: packageData.width,
      height: packageData.height,
      length: packageData.length,
      weight: packageData.weight,
      insurance_value: Number(insuranceValue.toFixed(2)),
      quantity: 1
    }
  ];

  console.log("PRODUTOS ENVIADOS AO MELHOR ENVIO:");
  console.dir(products, { depth: null });

  try {
    const response = await axios.post(
      "https://www.melhorenvio.com.br/api/v2/me/shipment/calculate",
      {
        from: {
          postal_code: "11608572"
        },
        to: {
          postal_code: cep
        },
        products,
        options: {
          receipt: false,
          own_hand: false
        }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "VisceraClub (dev@viscera.club)"
        }
      }
    );

    console.log("RESPOSTA MELHOR ENVIO:");
    console.dir(response.data, { depth: null });

    return res.json(response.data);
  } catch (error) {
    console.log("ERRO MELHOR ENVIO:");

    if (error.response) {
      console.log("STATUS:", error.response.status);
      console.dir(error.response.data, { depth: null });

      return res.status(error.response.status || 500).json({
        erro: "Erro ao calcular frete",
        details: error.response.data || null
      });
    }

    console.log(error.message);

    return res.status(500).json({
      erro: "Erro ao calcular frete",
      details: error.message
    });
  }
});

/* =========================
   PAGAMENTO COM REDIRECT
========================= */

app.post("/create-payment-redirect", async (req, res) => {
  console.log("BATEU NA ROTA /create-payment-redirect");

  try {
    const rawPayload = req.body.payload;

    if (!rawPayload) {
      return res.status(400).send("Payload não enviado");
    }

    const {
      customer,
      address,
      cart,
      shippingCost = 0,
      selectedShipping = null,
      couponCode = ""
    } = JSON.parse(rawPayload);

    if (!customer || !address || !cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).send("Dados do pagamento incompletos");
    }

    if (!customer.name || !customer.document || !customer.email || !customer.phone) {
      return res.status(400).send("Nome, CPF, email e telefone são obrigatórios.");
    }

    const productsTotal = cart.reduce((sum, item) => {
      return sum + Number(item.price) * Number(item.quantity);
    }, 0);

    const normalizedCouponCode = String(couponCode || "").trim().toUpperCase();
    const couponPercent = getCouponDiscountPercent(normalizedCouponCode);

    const calculatedDiscountAmount = couponPercent > 0
      ? (productsTotal * couponPercent) / 100
      : 0;

    const finalTotal =
      Number(productsTotal) +
      Number(shippingCost || 0) -
      Number(calculatedDiscountAmount || 0);

    const orderId = Date.now();

    const order = {
      id: orderId,
      customer,
      address,
      cart,
      subtotal: Number(productsTotal.toFixed(2)),
      shippingCost: Number(Number(shippingCost || 0).toFixed(2)),
      discountAmount: Number(Number(calculatedDiscountAmount || 0).toFixed(2)),
      couponCode: couponPercent > 0 ? normalizedCouponCode : "",
      shippingMethod: selectedShipping || null,
      total: Number(finalTotal.toFixed(2)),
      status: "pending",
      paymentMethod: "mercado_pago",
      createdAt: new Date().toISOString(),
      paidAt: "",
      carrier: "",
      trackingCode: "",
      labelUrl: "",
      shippedAt: "",
      mercadoPagoPaymentId: "",
      paymentStatus: "",
      paymentStatusDetail: "",
      emailNotifications: {
        orderCreatedSentAt: "",
        adminOrderCreatedSentAt: "",
        paymentApprovedSentAt: "",
        adminNewSaleSentAt: "",
        shipmentSentAt: ""
      }
    };

    const orders = readOrders();
    orders.push(order);
    saveOrders(orders);

    try {
      await sendOrderCreatedEmail(order);
      order.emailNotifications.orderCreatedSentAt = new Date().toISOString();

      if (!order.emailNotifications.adminOrderCreatedSentAt) {
        await sendAdminOrderReceivedEmail(order);
        order.emailNotifications.adminOrderCreatedSentAt = new Date().toISOString();
      }

        saveOrders(orders);
      } catch (emailError) {
        console.error("Erro ao enviar e-mails de pedido criado:", emailError);
      }

    const mpItems = buildMercadoPagoItems(
      cart,
      Number(shippingCost || 0),
      Number(calculatedDiscountAmount || 0)
    );

    const preference = new Preference(mpClient);

    const result = await preference.create({
      body: {
        items: mpItems,
        external_reference: String(orderId),
        payer: {
          name: customer.name || undefined,
          document: customer.document || undefined,
          email: customer.email || undefined
        },

        payment_methods: {
          installments: 3
        },

        back_urls: {
          success: "https://visceraclub.com.br/checkout-success.html",
          failure: "https://visceraclub.com.br/checkout-failure.html",
          pending: "https://visceraclub.com.br/checkout-pending.html"
        },
        auto_return: "approved"
      }
    });

    const checkoutUrl =
      process.env.NODE_ENV === "production"
        ? result.init_point
        : (result.sandbox_init_point || result.init_point);

    if (!checkoutUrl) {
      return res.status(500).send("Mercado Pago não retornou URL");
    }

    console.log("REDIRECIONANDO NAVEGADOR PARA:", checkoutUrl);

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="refresh" content="0;url=${checkoutUrl}" />
        <title>Redirecionando...</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #0b0b0b;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            text-align: center;
            padding: 20px;
          }
          .box {
            max-width: 420px;
          }
          a {
            color: #b30000;
          }
        </style>
      </head>
      <body>
        <div class="box">
          <p>Redirecionando para o Mercado Pago...</p>
          <p>Se não abrir automaticamente, <a href="${checkoutUrl}">clique aqui</a>.</p>
        </div>

        <script>
          window.location.replace(${JSON.stringify(checkoutUrl)});
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("ERRO EM /create-payment-redirect:");
    console.error(error);
    return res.status(500).send("Erro ao iniciar pagamento");
  }
});

/* =========================
   PAGAMENTO JSON
========================= */

app.post("/create-payment", async (req, res) => {
  console.log("BATEU NA ROTA /create-payment");

  try {
    const {
      customer,
      address,
      cart,
      shippingCost = 0,
      discountAmount = 0,
      selectedShipping = null,
      couponCode = ""
    } = req.body;

    if (!customer || !address || !cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Dados do pagamento incompletos" });
    }

    if (!customer.name || !customer.document || !customer.email || !customer.phone) {
      return res.status(400).send("Nome, email e telefone são obrigatórios.");
    }

    const productsTotal = cart.reduce((sum, item) => {
      return sum + Number(item.price) * Number(item.quantity);
    }, 0);

    const finalTotal =
      Number(productsTotal) +
      Number(shippingCost || 0) -
      Number(discountAmount || 0);

    const orderId = Date.now();

    const order = {
      id: orderId,
      customer,
      address,
      cart,
      subtotal: Number(productsTotal.toFixed(2)),
      shippingCost: Number(Number(shippingCost || 0).toFixed(2)),
      discountAmount: Number(Number(discountAmount || 0).toFixed(2)),
      couponCode: couponCode || "",
      shippingMethod: selectedShipping || null,
      total: Number(finalTotal.toFixed(2)),
      status: "pending",
      paymentMethod: "mercado_pago",
      createdAt: new Date().toISOString(),
      paidAt: "",
      carrier: "",
      trackingCode: "",
      labelUrl: "",
      shippedAt: "",
      mercadoPagoPaymentId: "",
      paymentStatus: "",
      paymentStatusDetail: "",
      emailNotifications: {
        orderCreatedSentAt: "",
        paymentApprovedSentAt: "",
        adminNewSaleSentAt: "",
        shipmentSentAt: ""
      }
    };

    const orders = readOrders();
    orders.push(order);
    saveOrders(orders);

    return res.json({
      success: true,
      orderId,
      order
    });
  } catch (error) {
    console.error("Erro em /create-payment:", error);
    return res.status(500).json({
      error: "Erro ao criar pagamento"
    });
  }
});

/* =========================
   PEDIDOS DO CLIENTE
========================= */

app.get("/orders", (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "Email é obrigatório" });
  }

  const orders = readOrders();
  const filtered = orders
    .filter((order) => String(order.customer?.email || "").trim().toLowerCase() === email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return res.json(filtered);
});

/* =========================
   TROCAS / DEVOLUÇÕES
========================= */

app.post("/return-requests", (req, res) => {
  try {
    const { orderId, email, type, reason, message = "" } = req.body;

    if (!orderId || !email || !type || !reason) {
      return res.status(400).json({ error: "Dados incompletos" });
    }

    const orders = readOrders();
    const order = orders.find((item) => {
      return (
        String(item.id) === String(orderId) &&
        String(item.customer?.email || "").trim().toLowerCase() === String(email).trim().toLowerCase()
      );
    });

    if (!order) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    const request = {
      id: Date.now(),
      orderId: order.id,
      customer: {
        name: order.customer?.name || "",
        email: order.customer?.email || "",
        phone: order.customer?.phone || ""
      },
      type,
      reason,
      requestedItems: Array.isArray(order.cart) ? order.cart : [],
      desiredSize: "",
      message,
      status: "pending",
      isReadByAdmin: false,
      createdAt: new Date().toISOString()
    };

    const requests = readReturnRequests();
    requests.unshift(request);
    saveReturnRequests(requests);

    return res.status(201).json({
      success: true,
      request
    });
  } catch (error) {
    console.error("Erro ao criar solicitação de troca/devolução:", error);
    return res.status(500).json({ error: "Erro ao criar solicitação" });
  }
});

/* =========================
   ADMIN AUTH
========================= */

app.post("/admin/login", (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();

    if (!ADMIN_PASSWORD) {
      return res.status(500).json({
        success: false,
        error: "ADMIN_LOGIN_PASSWORD não configurada no .env"
      });
    }

    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return res.status(401).json({
        success: false,
        error: "Email ou senha inválidos"
      });
    }

    const { rawToken } = createAdminSession(email);
    setAdminSessionCookie(res, rawToken);

    return res.json({
      success: true,
      email
    });
  } catch (error) {
    console.error("Erro no login admin:", error);
    return res.status(500).json({
      success: false,
      error: "Erro ao fazer login"
    });
  }
});

app.post("/admin/logout", (req, res) => {
  try {
    const auth = getAdminSessionFromRequest(req);

    if (auth?.signedToken) {
      adminSessions.delete(auth.signedToken);
    }

    clearAdminSessionCookie(res);

    return res.json({
      success: true
    });
  } catch (error) {
    console.error("Erro no logout admin:", error);
    clearAdminSessionCookie(res);

    return res.json({
      success: true
    });
  }
});

app.get("/admin/auth/me", (req, res) => {
  const auth = getAdminSessionFromRequest(req);

  if (!auth) {
    return res.status(401).json({
      authenticated: false
    });
  }

  return res.json({
    authenticated: true,
    email: auth.session.email
  });
});

/* =========================
   ADMIN ROTAS PROTEGIDAS
========================= */

app.get("/admin/return-requests", requireAdminAuth, (req, res) => {
  const requests = readReturnRequests().sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return res.json(requests);
});

app.put("/admin/return-requests/:id/status", requireAdminAuth, (req, res) => {
  const requestId = req.params.id;
  const status = String(req.body?.status || "").trim();

  const allowed = ["pending", "approved", "rejected", "completed"];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Status inválido" });
  }

  const requests = readReturnRequests();
  const requestIndex = requests.findIndex((item) => String(item.id) === String(requestId));

  if (requestIndex === -1) {
    return res.status(404).json({ error: "Solicitação não encontrada" });
  }

  requests[requestIndex].status = status;
  requests[requestIndex].updatedAt = new Date().toISOString();

  saveReturnRequests(requests);

  return res.json({
    success: true,
    request: requests[requestIndex]
  });
});

app.put("/admin/return-requests/:id/read", requireAdminAuth, (req, res) => {
  const requestId = req.params.id;
  const requests = readReturnRequests();
  const requestIndex = requests.findIndex((item) => String(item.id) === String(requestId));

  if (requestIndex === -1) {
    return res.status(404).json({ error: "Solicitação não encontrada" });
  }

  requests[requestIndex].isReadByAdmin = true;
  requests[requestIndex].readAt = new Date().toISOString();

  saveReturnRequests(requests);

  return res.json({
    success: true,
    request: requests[requestIndex]
  });
});

app.get("/admin/orders", requireAdminAuth, (req, res) => {
  const orders = readOrders();
  return res.json(orders);
});

app.get("/admin/orders/:id", requireAdminAuth, (req, res) => {
  const orderId = req.params.id;
  const orders = readOrders();

  const order = orders.find((order) => String(order.id) === String(orderId));

  if (!order) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  return res.json(order);
});

app.put("/admin/orders/:id/status", requireAdminAuth, (req, res) => {
  const orderId = req.params.id;
  const { status, trackingCode, carrier } = req.body;

  const allowedStatus = ["pending", "paid", "shipped", "cancelled"];

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ error: "Status inválido" });
  }

  const orders = readOrders();
  const orderIndex = orders.findIndex((order) => String(order.id) === String(orderId));

  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  orders[orderIndex].status = status;

  if (status === "shipped") {
    orders[orderIndex].trackingCode = trackingCode || "";
    orders[orderIndex].carrier = carrier || "";
    orders[orderIndex].shippedAt = new Date().toISOString();
  }

  saveOrders(orders);

  return res.json({
    success: true,
    order: orders[orderIndex]
  });
});

app.delete("/admin/orders/:id", requireAdminAuth, (req, res) => {
  const orderId = req.params.id;
  const orders = readOrders();

  const orderIndex = orders.findIndex((order) => String(order.id) === String(orderId));

  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  const deletedOrder = orders[orderIndex];

  orders.splice(orderIndex, 1);
  saveOrders(orders);

  return res.json({
    success: true,
    message: "Pedido excluído com sucesso",
    order: deletedOrder
  });
});

app.post("/admin/orders/:id/generate-shipment", requireAdminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const orders = readOrders();
    const orderIndex = orders.findIndex((order) => String(order.id) === String(orderId));

    if (orderIndex === -1) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    const order = orders[orderIndex];

    if (order.status !== "paid") {
      return res.status(400).json({
        error: "Só é possível gerar envio para pedidos pagos"
      });
    }

    await generateShipmentForOrder(order);

    const emailNotifications = ensureEmailNotifications(order);

    if (!emailNotifications.shipmentSentAt) {
      await sendShipmentEmail(order);
      emailNotifications.shipmentSentAt = new Date().toISOString();
    }

    saveOrders(orders);

    return res.json({
      success: true,
      message: "Envio gerado com sucesso",
      order
    });
    } catch (error) {
      console.error("Erro ao gerar envio no admin:", error);

      const apiMessage =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Erro ao gerar envio";

      return res.status(500).json({
        error: apiMessage
      });
    }
});

app.get("/admin/stats", requireAdminAuth, (req, res) => {
  const orders = readOrders();

  const totalSales = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const totalOrders = orders.length;

  const uniqueEmails = new Set(
    orders.map((order) => order.customer?.email).filter(Boolean)
  );

  const totalCustomers = uniqueEmails.size;
  const pendingOrders = orders.filter((order) => order.status === "pending").length;

  return res.json({
    totalSales,
    totalOrders,
    totalCustomers,
    pendingOrders
  });
});

app.get("/admin/sales", requireAdminAuth, (req, res) => {
  try {
    const orders = readOrders();

    const salesByDay = {};

    orders.forEach((order) => {
      if (!order.createdAt) return;

      const date = new Date(order.createdAt).toISOString().split("T")[0];

      if (!salesByDay[date]) {
        salesByDay[date] = 0;
      }

      salesByDay[date] += Number(order.total) || 0;
    });

    const result = Object.keys(salesByDay)
      .sort()
      .map((date) => ({
        date,
        total: salesByDay[date]
      }));

    return res.json(result);
  } catch (error) {
    console.error("Erro ao gerar vendas por dia:", error);
    return res.status(500).json({ error: "Erro ao gerar gráfico de vendas" });
  }
});

app.get("/admin/export-orders-csv", requireAdminAuth, (req, res) => {
  const orders = readOrders();

  const headers = [
    "Pedido",
    "Data",
    "Status",
    "Nome",
    "Email",
    "Telefone",
    "CEP",
    "Cidade",
    "Estado",
    "Subtotal",
    "Frete",
    "Desconto",
    "Total",
    "Transportadora",
    "Rastreio"
  ];

  const rows = orders.map((order) => [
    order.id,
    order.createdAt || "",
    order.status || "",
    order.customer?.name || "",
    order.customer?.email || "",
    order.customer?.phone || "",
    order.address?.cep || "",
    order.address?.city || "",
    order.address?.state || "",
    order.subtotal || 0,
    order.shippingCost || 0,
    order.discountAmount || 0,
    order.total || 0,
    order.carrier || "",
    order.trackingCode || ""
  ]);

  const csv = [
    headers.join(";"),
    ...rows.map((row) =>
      row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")
    )
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=pedidos-viscera.csv");
  return res.send("\uFEFF" + csv);
});

/* =========================
   WEBHOOK MERCADO PAGO
========================= */

app.post("/mercadopago/webhook", async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type !== "payment" || !data?.id) {
      return res.sendStatus(200);
    }

    const paymentClient = new Payment(mpClient);
    const paymentInfo = await paymentClient.get({ id: data.id });

    const orderId = paymentInfo.external_reference;

    if (!orderId) {
      return res.sendStatus(200);
    }

    const orders = readOrders();
    const orderIndex = orders.findIndex(
      (order) => String(order.id) === String(orderId)
    );

    if (orderIndex === -1) {
      return res.sendStatus(200);
    }

    const order = orders[orderIndex];
    const emailNotifications = ensureEmailNotifications(order);

    order.mercadoPagoPaymentId = String(paymentInfo.id || "");
    order.paymentStatus = paymentInfo.status || "";
    order.paymentStatusDetail = paymentInfo.status_detail || "";

    if (paymentInfo.status === "approved") {
      order.status = "paid";

      if (!order.paidAt) {
        order.paidAt = new Date().toISOString();
      }

      if (!emailNotifications.paymentApprovedSentAt) {
        await sendPaymentApprovedEmail(order);
        emailNotifications.paymentApprovedSentAt = new Date().toISOString();
      }

      if (!emailNotifications.adminNewSaleSentAt) {
        await sendAdminNewSaleEmail(order);
        emailNotifications.adminNewSaleSentAt = new Date().toISOString();
      }
    }

    saveOrders(orders);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook Mercado Pago:", error);
    return res.sendStatus(500);
  }
});

/* =========================
   TESTE DE EMAIL
========================= */

app.post("/admin/test-email/:id", requireAdminAuth, async (req, res) => {
  try {
    const orderId = req.params.id;
    const type = String(req.body?.type || "").trim();

    const orders = readOrders();
    const order = orders.find((item) => String(item.id) === String(orderId));

    if (!order) {
      return res.status(404).json({
        error: "Pedido não encontrado."
      });
    }

    if (type === "order-created") {
      await sendOrderCreatedEmail(order);

      return res.json({
        success: true,
        message: "E-mail de pedido criado enviado com sucesso."
      });
    }

    if (type === "admin-order-created") {
  await sendAdminOrderReceivedEmail(order);

  return res.json({
    success: true,
    message: "E-mail de novo pedido para o admin enviado com sucesso."
  });
}

    if (type === "payment-approved") {
      await sendPaymentApprovedEmail(order);

      return res.json({
        success: true,
        message: "E-mail de pagamento aprovado enviado com sucesso."
      });
    }

    if (type === "shipment") {
      if (!order.carrier) order.carrier = "Correios";
      if (!order.trackingCode) order.trackingCode = "TESTE123456BR";
      if (!order.labelUrl) order.labelUrl = "https://www.google.com";
      if (!order.shippedAt) order.shippedAt = new Date().toISOString();

      await sendShipmentEmail(order);
      saveOrders(orders);

      return res.json({
        success: true,
        message: "E-mail de envio enviado com sucesso."
      });
    }

    return res.status(400).json({
      error: "Tipo inválido. Use: order-created, admin-order-created, payment-approved ou shipment."
    });
  } catch (error) {
    console.error("Erro ao testar e-mail:", error);

    return res.status(500).json({
      error: "Erro ao testar e-mail."
    });
  }
});

/* =========================
   TESTE ENVIO FAKE
========================= */

app.post("/test-shipment/:id", async (req, res) => {
  const orderId = req.params.id;
  const orders = readOrders();
  const orderIndex = orders.findIndex((order) => String(order.id) === String(orderId));

  if (orderIndex === -1) {
    return res.status(404).json({ error: "Pedido não encontrado" });
  }

  await generateShipmentForOrder(orders[orderIndex]);
  saveOrders(orders);

  return res.json({
    success: true,
    order: orders[orderIndex]
  });
});

/* =========================
   SERVIDOR
========================= */

console.log("INICIANDO SERVIDOR.");

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:");
  console.error(error);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:");
  console.error(reason);
});