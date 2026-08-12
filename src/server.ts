// Vovó Linlin: vitrine pública + pedidos pelo site + caderninho (PIN) + API.
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://vovo:vovo@localhost:5434/vovolinlin",
});
const PIN = process.env.VOVO_PIN ?? "1234";
const SECRET = process.env.APP_SECRET ?? "troque-isto-em-producao";

const sign = (v: string) => createHmac("sha256", SECRET).update(v).digest("hex");
const token = () => { const t = `vovo.${Date.now()}`; return `${t}.${sign(t)}`; };
const valid = (c?: string) => {
  if (!c) return false;
  const i = c.lastIndexOf(".");
  const body = c.slice(0, i), mac = c.slice(i + 1), want = sign(body);
  return mac.length === want.length && timingSafeEqual(Buffer.from(mac), Buffer.from(want));
};

const app = new Hono();

// ================= público =================

app.get("/api/cardapio", async (c) => {
  const r = await pool.query(
    `SELECT id, nome, desc_curta, preco_cents, promo_cents, sabores, foto, destaque
     FROM produtos WHERE ativo ORDER BY destaque DESC, preco_cents`);
  return c.json(r.rows);
});

// pedido feito pelo cliente no site: cai direto no caderninho da vovó
app.post("/api/pedido-site", async (c) => {
  const b = await c.req.json().catch(() => null);
  const cliente = String(b?.cliente ?? "").trim().slice(0, 80);
  const telefone = String(b?.telefone ?? "").replace(/\D/g, "").slice(0, 13);
  const obs = String(b?.obs ?? "").trim().slice(0, 300);
  const itens: { produto_id: number; sabor?: string; qtd: number }[] = Array.isArray(b?.itens) ? b.itens : [];
  if (!cliente) return c.json({ erro: "Conta pra vovó o seu nome :)" }, 400);
  if (telefone.length < 10) return c.json({ erro: "Preencha um WhatsApp válido com DDD" }, 400);
  if (itens.length === 0 || itens.length > 30) return c.json({ erro: "Escolha pelo menos um pão de queijo" }, 400);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ped = await client.query(
      "INSERT INTO pedidos (cliente, telefone, obs, origem) VALUES ($1,$2,$3,'site') RETURNING id",
      [cliente, telefone, obs],
    );
    for (const it of itens) {
      const r = await client.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, sabor, qtd, preco_cents, custo_cents)
         SELECT $1, id, $3, $4, COALESCE(promo_cents, preco_cents), custo_cents
         FROM produtos WHERE id = $2 AND ativo RETURNING preco_cents`,
        [ped.rows[0].id, it.produto_id, String(it.sabor ?? "").slice(0, 60), Math.min(500, Math.max(1, Math.round(it.qtd)))],
      );
      if (r.rowCount === 0) throw new Error("produto inválido");
    }
    const tot = await client.query(
      "SELECT COALESCE(SUM(qtd * preco_cents),0)::int AS t FROM pedido_itens WHERE pedido_id=$1", [ped.rows[0].id]);
    await client.query("COMMIT");
    return c.json({ ok: true, id: Number(ped.rows[0].id), total_cents: tot.rows[0].t });
  } catch (e) {
    await client.query("ROLLBACK");
    return c.json({ erro: "Não consegui anotar o pedido, tenta de novo?" }, 400);
  } finally {
    client.release();
  }
});

// ================= caderninho (PIN) =================

app.post("/api/login", async (c) => {
  const { pin } = await c.req.json().catch(() => ({ pin: "" }));
  if (String(pin) !== PIN) return c.json({ erro: "PIN errado" }, 401);
  setCookie(c, "vovo", token(), { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return c.json({ ok: true });
});

app.use("/api/*", async (c, next) => {
  const publico = ["/api/login", "/api/cardapio", "/api/pedido-site"];
  if (publico.includes(c.req.path)) return next();
  if (!valid(getCookie(c, "vovo"))) return c.json({ erro: "faça login" }, 401);
  return next();
});

app.get("/api/produtos", async (c) => {
  const r = await pool.query("SELECT * FROM produtos ORDER BY ativo DESC, nome");
  return c.json(r.rows);
});
app.post("/api/produtos", async (c) => {
  const b = await c.req.json();
  const r = await pool.query(
    `INSERT INTO produtos (nome, desc_curta, preco_cents, promo_cents, custo_cents, sabores, destaque)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [String(b.nome).trim(), String(b.desc_curta ?? "").trim(), Math.round(b.preco_cents),
     b.promo_cents ? Math.round(b.promo_cents) : null, Math.round(b.custo_cents ?? 0),
     Array.isArray(b.sabores) ? b.sabores : [], Boolean(b.destaque)],
  );
  return c.json(r.rows[0]);
});
app.put("/api/produtos/:id", async (c) => {
  const b = await c.req.json();
  const r = await pool.query(
    `UPDATE produtos SET nome=$1, desc_curta=$2, preco_cents=$3, promo_cents=$4,
       custo_cents=$5, sabores=$6, destaque=$7, ativo=$8 WHERE id=$9 RETURNING *`,
    [String(b.nome).trim(), String(b.desc_curta ?? "").trim(), Math.round(b.preco_cents),
     b.promo_cents ? Math.round(b.promo_cents) : null, Math.round(b.custo_cents ?? 0),
     Array.isArray(b.sabores) ? b.sabores : [], Boolean(b.destaque), Boolean(b.ativo), c.req.param("id")],
  );
  return c.json(r.rows[0] ?? null);
});

// foto real do produto, enviada pela vovó (nada de imagem de IA em comida)
app.post("/api/produtos/:id/foto", async (c) => {
  const body = await c.req.parseBody();
  const file = body.foto;
  if (!(file instanceof File)) return c.json({ erro: "manda o arquivo no campo 'foto'" }, 400);
  if (file.size > 8 * 1024 * 1024) return c.json({ erro: "foto muito grande (máx 8MB)" }, 400);
  const ext = [".jpg", ".jpeg", ".png", ".webp"].includes(extname(file.name).toLowerCase())
    ? extname(file.name).toLowerCase() : ".jpg";
  await mkdir("uploads", { recursive: true });
  const nome = `produto-${c.req.param("id")}-${Date.now()}${ext}`;
  await writeFile(`uploads/${nome}`, Buffer.from(await file.arrayBuffer()));
  const r = await pool.query("UPDATE produtos SET foto=$1 WHERE id=$2 RETURNING *", [`/uploads/${nome}`, c.req.param("id")]);
  return c.json(r.rows[0] ?? null);
});

app.get("/api/pedidos", async (c) => {
  const r = await pool.query(`
    SELECT p.*, COALESCE(json_agg(json_build_object(
             'produto_id', i.produto_id, 'qtd', i.qtd, 'sabor', i.sabor,
             'preco_cents', i.preco_cents, 'nome', pr.nome
           ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS itens,
           COALESCE(SUM(i.qtd * i.preco_cents), 0)::int AS total_cents
    FROM pedidos p
    LEFT JOIN pedido_itens i ON i.pedido_id = p.id
    LEFT JOIN produtos pr ON pr.id = i.produto_id
    GROUP BY p.id ORDER BY p.criado_em DESC LIMIT 200`);
  return c.json(r.rows);
});
app.post("/api/pedidos", async (c) => {
  const b = await c.req.json();
  const itens: { produto_id: number; sabor?: string; qtd: number }[] = b.itens ?? [];
  if (itens.length === 0) return c.json({ erro: "pedido sem itens" }, 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ped = await client.query(
      "INSERT INTO pedidos (cliente, telefone, obs, origem) VALUES ($1,$2,$3,'caderninho') RETURNING id",
      [String(b.cliente ?? "").trim(), String(b.telefone ?? "").replace(/\D/g, ""), String(b.obs ?? "").trim()],
    );
    for (const it of itens) {
      await client.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, sabor, qtd, preco_cents, custo_cents)
         SELECT $1, id, $3, $4, COALESCE(promo_cents, preco_cents), custo_cents FROM produtos WHERE id = $2`,
        [ped.rows[0].id, it.produto_id, String(it.sabor ?? ""), Math.max(1, Math.round(it.qtd))],
      );
    }
    await client.query("COMMIT");
    return c.json({ ok: true, id: ped.rows[0].id });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
app.put("/api/pedidos/:id/status", async (c) => {
  const { status } = await c.req.json();
  if (!["aberto", "entregue", "cancelado"].includes(status)) return c.json({ erro: "status inválido" }, 400);
  await pool.query("UPDATE pedidos SET status=$1 WHERE id=$2", [status, c.req.param("id")]);
  return c.json({ ok: true });
});

app.get("/api/resumo", async (c) => {
  const mes = c.req.query("mes") ?? new Date().toISOString().slice(0, 7);
  const tot = await pool.query(
    `SELECT COUNT(DISTINCT p.id)::int AS pedidos,
            COALESCE(SUM(i.qtd * i.preco_cents), 0)::int AS faturamento_cents,
            COALESCE(SUM(i.qtd * i.custo_cents), 0)::int AS custo_cents
     FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
     WHERE to_char(p.criado_em, 'YYYY-MM') = $1 AND p.status <> 'cancelado'`, [mes]);
  const rank = await pool.query(
    `SELECT pr.nome, NULLIF(i.sabor, '') AS sabor, SUM(i.qtd)::int AS qtd,
            SUM(i.qtd * i.preco_cents)::int AS faturamento_cents,
            SUM(i.qtd * (i.preco_cents - i.custo_cents))::int AS lucro_cents
     FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id JOIN produtos pr ON pr.id = i.produto_id
     WHERE to_char(p.criado_em, 'YYYY-MM') = $1 AND p.status <> 'cancelado'
     GROUP BY pr.nome, NULLIF(i.sabor, '') ORDER BY qtd DESC`, [mes]);
  const t = tot.rows[0];
  return c.json({ mes, ...t, lucro_cents: t.faturamento_cents - t.custo_cents, ranking: rank.rows });
});

// ================= páginas =================
const gestao = await readFile(new URL("../public/gestao.html", import.meta.url), "utf8");
app.get("/gestao", (c) => c.html(gestao));
app.use("/uploads/*", serveStatic({ root: "./" }));
app.use("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT ?? 8080);
console.log(`vovolinlin no ar :${port}`);
serve({ fetch: app.fetch, port });
