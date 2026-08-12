# vovolinlin

Site e caderninho de pedidos da Vovó Linlin Pão de Queijo. Cliente real, feito sob medida: vitrine pública com pedido via WhatsApp e um painel de gestão simples o bastante para uma avó usar no celular.

## O que tem

- **Vitrine** (`/`): cardápio por unidade, montagem de pedido com quantidades e envio já escrito no WhatsApp da vovó. A arte da marca foi feita pelo neto dela.
- **Caderninho** (`/gestao`): protegido por PIN. Anotar pedidos, cadastrar produtos com preço e custo, marcar entregas e ver o mês: quanto vendeu, quanto gastou, quanto sobrou, o que mais sai e o que mais dá lucro.
- **API** (Hono + Postgres): dinheiro em centavos inteiros; itens de pedido guardam preço e custo do momento da venda, então mudar o cadastro não reescreve a história.

## Rodar

```sh
cp .env.example .env   # defina senha do banco, PIN e secret
docker compose up -d --build
```

Sobe app + Postgres + Caddy (TLS automático para o domínio do Caddyfile). Para desenvolver: `docker compose up db -d && npm install && npm run dev`.

## Stack

Hono, PostgreSQL, TypeScript, Caddy, Docker Compose. Sem framework de front: a vitrine e o caderninho são HTML/CSS/JS direto, porque é o tamanho certo do problema.

---
Desenvolvido com carinho por [Leonardo Flores](https://leonardoflores.dev.br).
