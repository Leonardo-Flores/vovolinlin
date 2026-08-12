CREATE TABLE IF NOT EXISTS produtos (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  desc_curta  TEXT NOT NULL DEFAULT '',
  -- dinheiro sempre em centavos inteiros
  preco_cents INT NOT NULL CHECK (preco_cents >= 0),
  promo_cents INT CHECK (promo_cents IS NULL OR promo_cents >= 0),
  custo_cents INT NOT NULL DEFAULT 0 CHECK (custo_cents >= 0),
  sabores     TEXT[] NOT NULL DEFAULT '{}',
  foto        TEXT NOT NULL DEFAULT '',
  destaque    BOOLEAN NOT NULL DEFAULT false,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id         BIGSERIAL PRIMARY KEY,
  cliente    TEXT NOT NULL DEFAULT '',
  telefone   TEXT NOT NULL DEFAULT '',
  obs        TEXT NOT NULL DEFAULT '',
  origem     TEXT NOT NULL DEFAULT 'caderninho' CHECK (origem IN ('site', 'caderninho')),
  status     TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'entregue', 'cancelado')),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- preço e custo copiados no momento do pedido: mudar o cadastro depois
-- não reescreve a história do que já foi vendido
CREATE TABLE IF NOT EXISTS pedido_itens (
  id          BIGSERIAL PRIMARY KEY,
  pedido_id   BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id  BIGINT NOT NULL REFERENCES produtos(id),
  sabor       TEXT NOT NULL DEFAULT '',
  qtd         INT NOT NULL CHECK (qtd > 0),
  preco_cents INT NOT NULL,
  custo_cents INT NOT NULL
);

CREATE INDEX IF NOT EXISTS pedidos_criado_idx ON pedidos (criado_em);

-- cardápio inicial: tabela oficial da vovó (custos estimados, ela ajusta)
INSERT INTO produtos (nome, desc_curta, preco_cents, custo_cents, sabores, destaque)
SELECT * FROM (VALUES
  ('Tradicional', 'O clássico: crocante por fora, macio e puxento por dentro.', 320, 120, '{}'::text[], true),
  ('Recheado', 'Surpresa cremosa no meio.', 550, 210, ARRAY['Catupiry','Parmesão empanado'], false),
  ('Recheado de carnes', 'Pra quem gosta de um recheio caprichado.', 650, 250,
    ARRAY['Frango com catupiry','Calabresa com queijo','Calabresa com catupiry','Peito de peru com catupiry','Pernil com catupiry'], false),
  ('Recheado especial', 'Os recheios mais pedidos da casa.', 750, 290,
    ARRAY['Carne seca com catupiry','Carne seca com queijo','Tomate seco com queijo branco'], false)
) AS v(nome, d, preco, custo, sabores, destaque)
WHERE NOT EXISTS (SELECT 1 FROM produtos);
