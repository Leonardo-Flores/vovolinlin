// Vovó Linlin: vitrine pública + caderninho de pedidos (PIN) + API.
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
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

// ---- auth ----
app.post("/api/login", async (c) => {
  const { pin } = await c.req.json().catch(() => ({ pin: "" }));
  if (String(pin) !== PIN) return c.json({ erro: "PIN errado" }, 401);
  setCookie(c, "vovo", token(), { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return c.json({ ok: true });
});

app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/login") return next();
  if (!valid(getCookie(c, "vovo"))) return c.json({ erro: "faça login" }, 401);
  return next();
});

// ---- produtos ----
app.get("/api/produtos", async (c) => {
  const r = await pool.query("SELECT * FROM produtos ORDER BY ativo DESC, nome");
  return c.json(r.rows);
});
app.post("/api/produtos", async (c) => {
  const b = await c.req.json();
  const r = await pool.query(
    "INSERT INTO produtos (nome, preco_cents, custo_cents) VALUES ($1,$2,$3) RETURNING *",
    [String(b.nome).trim(), Math.round(b.preco_cents), Math.round(b.custo_cents ?? 0)],
  );
  return c.json(r.rows[0]);
});
app.put("/api/produtos/:id", async (c) => {
  const b = await c.req.json();
  const r = await pool.query(
    "UPDATE produtos SET nome=$1, preco_cents=$2, custo_cents=$3, ativo=$4 WHERE id=$5 RETURNING *",
    [String(b.nome).trim(), Math.round(b.preco_cents), Math.round(b.custo_cents ?? 0), Boolean(b.ativo), c.req.param("id")],
  );
  return c.json(r.rows[0] ?? null);
});

// ---- pedidos ----
app.get("/api/pedidos", async (c) => {
  const r = await pool.query(`
    SELECT p.*, COALESCE(json_agg(json_build_object(
             'produto_id', i.produto_id, 'qtd', i.qtd,
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
  const itens: { produto_id: number; qtd: number }[] = b.itens ?? [];
  if (itens.length === 0) return c.json({ erro: "pedido sem itens" }, 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ped = await client.query(
      "INSERT INTO pedidos (cliente, obs) VALUES ($1,$2) RETURNING id",
      [String(b.cliente ?? "").trim(), String(b.obs ?? "").trim()],
    );
    for (const it of itens) {
      await client.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, qtd, preco_cents, custo_cents)
         SELECT $1, id, $3, preco_cents, custo_cents FROM produtos WHERE id = $2`,
        [ped.rows[0].id, it.produto_id, Math.max(1, Math.round(it.qtd))],
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

// ---- resumo do mês: o que vende, o que dá lucro ----
app.get("/api/resumo", async (c) => {
  const mes = c.req.query("mes") ?? new Date().toISOString().slice(0, 7); // AAAA-MM
  const tot = await pool.query(
    `SELECT COUNT(DISTINCT p.id)::int AS pedidos,
            COALESCE(SUM(i.qtd * i.preco_cents), 0)::int AS faturamento_cents,
            COALESCE(SUM(i.qtd * i.custo_cents), 0)::int AS custo_cents
     FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
     WHERE to_char(p.criado_em, 'YYYY-MM') = $1 AND p.status <> 'cancelado'`, [mes]);
  const rank = await pool.query(
    `SELECT pr.nome, SUM(i.qtd)::int AS qtd,
            SUM(i.qtd * i.preco_cents)::int AS faturamento_cents,
            SUM(i.qtd * (i.preco_cents - i.custo_cents))::int AS lucro_cents
     FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id JOIN produtos pr ON pr.id = i.produto_id
     WHERE to_char(p.criado_em, 'YYYY-MM') = $1 AND p.status <> 'cancelado'
     GROUP BY pr.nome ORDER BY qtd DESC`, [mes]);
  const t = tot.rows[0];
  return c.json({ mes, ...t, lucro_cents: t.faturamento_cents - t.custo_cents, ranking: rank.rows });
});

// ---- páginas ----
const gestao = await readFile(new URL("../public/gestao.html", import.meta.url), "utf8");
app.get("/gestao", (c) => c.html(gestao));
app.use("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT ?? 8080);
console.log(`vovolinlin no ar :${port}`);
serve({ fetch: app.fetch, port });
