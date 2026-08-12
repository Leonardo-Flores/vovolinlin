// Vitrine: cardápio vem do banco, pedido entra direto no caderninho da vovó.
// Dinheiro em centavos inteiros. Chave do carrinho: "produtoId|sabor".
const ZAP = "5511952855997";
const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const $ = (id) => document.getElementById(id);

let cardapio = [];
const carrinho = new Map(); // "id|sabor" -> qtd
const saborEscolhido = new Map(); // produtoId -> sabor ativo no card

const precoDe = (p) => p.promo_cents ?? p.preco_cents;
const chave = (id, sabor) => `${id}|${sabor ?? ""}`;

function totalCents() {
  let t = 0;
  for (const [k, q] of carrinho) {
    const p = cardapio.find((x) => String(x.id) === k.split("|")[0]);
    if (p) t += q * precoDe(p);
  }
  return t;
}

function render() {
  const raiz = $("produtos");
  raiz.innerHTML = "";
  for (const p of cardapio) {
    const sabor = p.sabores.length ? (saborEscolhido.get(p.id) ?? p.sabores[0]) : "";
    saborEscolhido.set(p.id, sabor);
    const qtd = carrinho.get(chave(p.id, sabor)) ?? 0;
    const el = document.createElement("article");
    el.className = "produto";
    el.innerHTML = `
      <div class="foto" data-card="${p.id}" role="button" tabindex="0" aria-label="Adicionar 1 ${p.nome}">
        ${p.destaque ? '<span class="badge">❤ queridinho</span>' : ""}
        ${p.promo_cents ? '<span class="badge promo">promoção</span>' : ""}
        ${p.foto
          ? `<img class="real" src="${p.foto}" alt="Foto: ${p.nome}" loading="lazy" />`
          : `<img class="ilustra" src="assets/pao.png" alt="" aria-hidden="true" />`}
      </div>
      <div class="corpo">
        <h3>${p.nome}</h3>
        <p class="desc">${p.desc_curta}</p>
        <div class="preco-linha">
          ${p.promo_cents ? `<span class="preco-antigo">${reais(p.preco_cents)}</span>` : ""}
          <span class="preco">${reais(precoDe(p))} <small>/un</small></span>
        </div>
        ${p.sabores.length ? `<div class="sabores" role="group" aria-label="Sabores de ${p.nome}">
          ${p.sabores.map((s) => `<button type="button" class="sabor" aria-pressed="${s === sabor}" data-sabor="${s}" data-prod="${p.id}">${s}</button>`).join("")}
        </div>` : ""}
        <div class="stepper">
          <span class="rotulo">${sabor ? `Quantos de ${sabor.toLowerCase()}?` : "Quantos você quer?"}</span>
          <div class="controles">
            <button type="button" data-menos="${p.id}" aria-label="Tirar um">−</button>
            <input type="number" min="0" max="500" inputmode="numeric" value="${qtd}" data-qtd="${p.id}" aria-label="Quantidade" />
            <button type="button" data-mais="${p.id}" aria-label="Adicionar um">+</button>
          </div>
        </div>
      </div>`;
    raiz.appendChild(el);
  }
  atualizaBarra();
}

function atualizaBarra() {
  const unidades = [...carrinho.values()].reduce((a, b) => a + b, 0);
  $("barra-pedido").hidden = unidades === 0;
  $("barra-itens").textContent = `${unidades} ${unidades === 1 ? "unidade" : "unidades"}`;
  $("barra-total").textContent = reais(totalCents());
  document.body.style.paddingBottom = unidades ? "5.5rem" : "";
}

function setQtd(prodId, sabor, q) {
  q = Math.max(0, Math.min(500, Math.round(q) || 0));
  const k = chave(prodId, sabor);
  q === 0 ? carrinho.delete(k) : carrinho.set(k, q);
}

document.addEventListener("click", (e) => {
  const sab = e.target.closest(".sabor");
  if (sab) { saborEscolhido.set(Number(sab.dataset.prod), sab.dataset.sabor); render(); return; }
  const card = e.target.closest("[data-card]");
  const mais = e.target.closest("[data-mais]");
  const menos = e.target.closest("[data-menos]");
  if (card || mais || menos) {
    const id = Number(card ? card.dataset.card : (mais ?? menos).dataset[mais ? "mais" : "menos"]);
    const sabor = saborEscolhido.get(id) ?? "";
    setQtd(id, sabor, (carrinho.get(chave(id, sabor)) ?? 0) + (menos ? -1 : 1));
    render();
    if (card || mais) pulsar(id);
  }
});

// feedback visual: número da quantidade dá uma pulsada ao adicionar
function pulsar(id) {
  const input = document.querySelector(`[data-qtd="${id}"]`);
  if (!input || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  input.animate([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 180, easing: "ease-out" });
}
document.addEventListener("keydown", (e) => {
  const card = e.target.closest?.("[data-card]");
  if (card && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); card.click(); }
});
document.addEventListener("change", (e) => {
  const input = e.target.closest("[data-qtd]");
  if (!input) return;
  const id = Number(input.dataset.qtd);
  setQtd(id, saborEscolhido.get(id) ?? "", Number(input.value));
  render();
});

// ---------- checkout ----------
const dlg = $("checkout");

function abrirCheckout() {
  $("checkout-form").hidden = false;
  $("checkout-sucesso").hidden = true;
  $("checkout-erro").textContent = "";
  const lista = $("lista-checkout");
  lista.innerHTML = [...carrinho].map(([k, q]) => {
    const [id, sabor] = k.split("|");
    const p = cardapio.find((x) => String(x.id) === id);
    return `<li><span>${q}x ${p.nome}${sabor ? ` · ${sabor}` : ""}</span>
      <span>${reais(q * precoDe(p))} <button type="button" class="apagar" data-del="${k}" aria-label="Tirar do pedido">×</button></span></li>`;
  }).join("");
  $("checkout-total").textContent = reais(totalCents());
  $("c-nome").value = localStorage.getItem("vovo-nome") ?? "";
  $("c-tel").value = localStorage.getItem("vovo-tel") ?? "";
  dlg.showModal();
}
$("abrir-checkout").addEventListener("click", abrirCheckout);
$("fechar-checkout").addEventListener("click", () => dlg.close());
$("lista-checkout").addEventListener("click", (e) => {
  const b = e.target.closest("[data-del]");
  if (!b) return;
  carrinho.delete(b.dataset.del);
  render();
  carrinho.size === 0 ? dlg.close() : abrirCheckout();
});

$("confirmar").addEventListener("click", async () => {
  const nome = $("c-nome").value.trim();
  const tel = $("c-tel").value.replace(/\D/g, "");
  $("checkout-erro").textContent = "";
  if (!nome) return ($("checkout-erro").textContent = "Conta pra vovó o seu nome :)");
  if (tel.length < 10) return ($("checkout-erro").textContent = "Preencha seu WhatsApp com DDD");
  $("confirmar").disabled = true;
  try {
    const r = await fetch("/api/pedido-site", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cliente: nome, telefone: tel, obs: $("c-obs").value,
        itens: [...carrinho].map(([k, qtd]) => {
          const [produto_id, sabor] = k.split("|");
          return { produto_id: Number(produto_id), sabor, qtd };
        }),
      }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro ?? "deu ruim");
    localStorage.setItem("vovo-nome", nome);
    localStorage.setItem("vovo-tel", $("c-tel").value);
    $("sucesso-id").textContent = `#${dados.id}`;
    const msg = `Olá, vovó Linlin! Acabei de fazer o pedido #${dados.id} pelo site 🧀 (${reais(dados.total_cents)})`;
    $("sucesso-zap").href = `https://wa.me/${ZAP}?text=${encodeURIComponent(msg)}`;
    $("checkout-form").hidden = true;
    $("checkout-sucesso").hidden = false;
    carrinho.clear();
    render();
  } catch (err) {
    $("checkout-erro").textContent = err.message;
  } finally {
    $("confirmar").disabled = false;
  }
});
$("sucesso-fechar").addEventListener("click", () => dlg.close());

// ---------- carga inicial ----------
(async () => {
  cardapio = await fetch("/api/cardapio").then((r) => r.json());
  const promo = cardapio.find((p) => p.promo_cents);
  if (promo) {
    const bar = $("promo-bar");
    bar.hidden = false;
    bar.textContent = `🔥 Promoção: ${promo.nome} de ${reais(promo.preco_cents)} por ${reais(promo.promo_cents)} a unidade!`;
  }
  render();
})();
$("ano").textContent = new Date().getFullYear();
