# Flight Alert Worker

Worker da Cloudflare para monitorar voos de `VIX` para `BSB` em `2026-08-01`.

Se encontrar preço abaixo de `R$ 500`, envia e-mail para `renanysbrobows@gmail.com`.

## Requisitos

- Node.js 18+
- Conta Cloudflare
- Conta Resend (ou outro provedor compatível com API do Resend)

## Instalação

```bash
npm install
```

## Desenvolvimento local

Crie `.dev.vars` com:

```env
RAPIDAPI_KEY=sua_chave_rapidapi
RESEND_API_KEY=sua_chave_resend
```

Depois rode:

```bash
npm run dev
```

Para disparar manualmente, acesse a URL local do worker.

## Deploy

Configure secrets no Worker:

```bash
wrangler secret put RAPIDAPI_KEY
wrangler secret put RESEND_API_KEY
```

Deploy:

```bash
npm run deploy
```

O cron está configurado para executar a cada 6 horas em `wrangler.toml`.
