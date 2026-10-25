# Lastro

A luxurious, high-end web application for curating rare art, iconic objects, and extraordinary pieces. Built with React, Vite, and Tailwind CSS.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

## Design System
- **Typography:** Italiana (Serif) & Inter (Sans-serif)
- **Colors:** Deep obsidian (`#0a0a0a`), warm off-white (`#f0ebe1`), and elegant champagne-gold (`#A69076`).
- **Layout:** Fully responsive, modern asymmetrical grids with precise micro-interactions.

## Backend e banco de dados (Supabase)

1. Copie `backend/.env.example` para `backend/.env` e preencha `SUPABASE_URL` e `SUPABASE_KEY` (chave anon/public).
2. No SQL Editor do Supabase, execute, nesta ordem, `backend/database/schema.sql` (RFC01 e RFC02), `backend/database/schema-rfc03-rfc04.sql` (passaporte digital, assinatura do perito e transações) e `backend/database/seed.sql`.
3. Inicie a API e o frontend:
   ```bash
   cd backend && npm install && npm run dev
   npm run dev
   ```

O frontend usa `VITE_API_URL` (padrão `http://localhost:3000`) e o backend aceita as origens de `FRONTEND_URL` (padrão `http://localhost:5173`) no CORS.

Usuários de teste criados pelo seed (senha de desenvolvimento em `backend/database/seed.sql`): `admin@`, `vendedor@`, `comprador@` e `perito@lastro.com`.

## Testes end-to-end (Selenium)

Com a API e o frontend em execução e o Chrome instalado:

```bash
npm run test:e2e
```

- Configurável por `E2E_BASE_URL` (padrão `http://localhost:5173`), `E2E_API_URL` (padrão `http://localhost:3000`) e `E2E_HEADLESS=false` para ver o navegador.
- As suítes cobrem RFC01 a RFC04 e RFC07 e criam os próprios dados (peças com prefixo `E2E `).
- Para apagar esses dados ao final (peças vendidas não podem ser removidas pela aplicação), execute uma vez `backend/database/test-support.sql` no ambiente de testes. **Não use esse arquivo em produção.**

## Regras de negócio implementadas

- **Passaporte digital (RFC03, RFC07):** o perito emite o passaporte com certificados (obrigatório), laudos, notas fiscais, fotografias e proprietários anteriores. O conteúdo é assinado digitalmente (HMAC-SHA256 com segredo guardado só no banco) e a assinatura é verificada a cada consulta. Perito e administrador atualizam o passaporte e a assinatura é renovada.
- **Privacidade (RNF04):** a identidade dos proprietários e as notas fiscais só aparecem a terceiros se o dono permitir.
- **Transações (RFC04):** o comprador (ou o administrador, em nome dele) registra a proposta; a peça entra em negociação (uma proposta por vez). O vendedor confirma (gera a comissão de 10%, parâmetro `comissao_percentual`, marca a peça como vendida e registra o novo proprietário no passaporte) ou cancela; o comprador também pode cancelar.
