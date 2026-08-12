// Vitrine: monta o pedido e envia pro WhatsApp da vovó.
// Preços em centavos (nada de float com dinheiro). Tabela oficial da vovó.
const ZAP = "5511952855997";

const PRODUTOS = [
  { id: "tradicional", nome: "Tradicional", desc: "O clássico: crocante por fora, macio por dentro.", preco: 320 },
  { id: "recheado", nome: "Recheado", desc: "Catupiry ou parmesão empanado.", preco: 550 },
  { id: "recheado-carnes", nome: "Recheado de carnes", desc: "Frango c/ catupiry, calabresa c/ queijo ou catupiry, peito de peru ou pernil c/ catupiry.", preco: 650 },
  { id: "recheado-especial", nome: "Recheado especial", desc: "Carne seca c/ catupiry ou queijo, tomate seco c/ queijo branco.", preco: 750 },
];

const reais = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const carrinho = new Map();

function totalCents() {
  return [...carrinho].reduce((a, [id, q]) => a + q * PRODUTOS.find((p) => p.id === id).preco, 0);
}

function render() {
  const raiz = document.getElementById("produtos");
  raiz.innerHTML = "";
  for (const p of PRODUTOS) {
    const qtd = carrinho.get(p.id) ?? 0;
    const el = document.createElement("div");
    el.className = "produto";
    el.innerHTML = `
      <h3>${p.nome}</h3>
      <p class="desc">${p.desc}</p>
      <div class="linha">
        <span class="preco">${reais(p.preco)} <small>/un</small></span>
        <div class="stepper">
          <button type="button" aria-label="Tirar um ${p.nome}" data-menos="${p.id}">−</button>
          <input class="qtd" type="number" min="0" max="999" inputmode="numeric"
                 value="${qtd}" data-qtd="${p.id}" aria-label="Quantidade de ${p.nome}" />
          <button type="button" aria-label="Adicionar um ${p.nome}" data-mais="${p.id}">+</button>
        </div>
      </div>`;
    raiz.appendChild(el);
  }
  atualizaResumo();
}

function atualizaResumo() {
  const itens = [...carrinho.values()].reduce((a, b) => a + b, 0);
  const resumo = document.getElementById("resumo");
  resumo.hidden = itens === 0;
  document.getElementById("resumo-itens").textContent = `${itens} ${itens === 1 ? "unidade" : "unidades"}`;
  document.getElementById("resumo-total").textContent = reais(totalCents());
}

function setQtd(id, q) {
  q = Math.max(0, Math.min(999, Math.round(q) || 0));
  q === 0 ? carrinho.delete(id) : carrinho.set(id, q);
}

document.addEventListener("click", (e) => {
  const mais = e.target.closest("[data-mais]");
  const menos = e.target.closest("[data-menos]");
  if (!mais && !menos) return;
  const id = mais ? mais.dataset.mais : menos.dataset.menos;
  setQtd(id, (carrinho.get(id) ?? 0) + (mais ? 1 : -1));
  render();
});

document.addEventListener("change", (e) => {
  const input = e.target.closest("[data-qtd]");
  if (!input) return;
  setQtd(input.dataset.qtd, Number(input.value));
  render();
});

document.getElementById("enviar").addEventListener("click", () => {
  const linhas = [...carrinho].map(([id, q]) => {
    const p = PRODUTOS.find((x) => x.id === id);
    return `• ${q}x ${p.nome} — ${reais(q * p.preco)}`;
  });
  const temRecheado = [...carrinho.keys()].some((id) => id !== "tradicional");
  const msg =
    `Olá, vovó Linlin! 🧀 Quero encomendar:\n\n${linhas.join("\n")}\n\nTotal: ${reais(totalCents())}\n` +
    (temRecheado ? `\nSabores dos recheados: \n` : "") +
    `\nMeu nome: `;
  window.open(`https://wa.me/${ZAP}?text=${encodeURIComponent(msg)}`, "_blank");
});

document.getElementById("ano").textContent = new Date().getFullYear();
render();
