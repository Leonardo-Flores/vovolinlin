CREATE TABLE IF NOT EXISTS produtos (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  -- dinheiro sempre em centavos inteiros
  preco_cents INT NOT NULL CHECK (preco_cents >= 0),
  custo_cents INT NOT NULL DEFAULT 0 CHECK (custo_cents >= 0),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id         BIGSERIAL PRIMARY KEY,
  cliente    TEXT NOT NULL DEFAULT '',
  obs        TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'entregue', 'cancelado')),
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- preço e custo copiados no momento do pedido: mudar o cadastro depois
-- não reescreve a história do que já foi vendido
CREATE TABLE IF NOT EXISTS pedido_itens (
  id          BIGSERIAL PRIMARY KEY,
  pedido_id   BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id  BIGINT NOT NULL REFERENCES produtos(id),
  qtd         INT NOT NULL CHECK (qtd > 0),
  preco_cents INT NOT NULL,
  custo_cents INT NOT NULL
);

CREATE INDEX IF NOT EXISTS pedidos_criado_idx ON pedidos (criado_em);

-- cardápio inicial (a vovó edita pelo caderninho)
INSERT INTO produtos (nome, preco_cents, custo_cents)
SELECT * FROM (VALUES
  ('Tradicional (un)', 320, 120),
  ('Recheado — catupiry/parmesão (un)', 550, 210),
  ('Recheado de carnes (un)', 650, 250),
  ('Recheado especial (un)', 750, 290)
) AS v(nome, preco, custo)
WHERE NOT EXISTS (SELECT 1 FROM produtos);
