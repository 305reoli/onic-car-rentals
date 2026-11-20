# Esqueleto — Site de Locadora de Carros (vitrine + reserva + pagamento + admin)

Código-fonte completo de um site de locadora, **sem nenhum dado da empresa de origem**:
marca, telefones, e-mails, endereços, chaves, IDs de rastreamento, fotos da frota,
blog e textos comerciais foram removidos ou trocados por placeholders.
Para achar o que trocar, procure no código por: `Onic Car Rentals`, `oniccarrentals.com`,
`SEU_`, `555 123-4567`, `info@oniccarrentals.com`.

## O que tem dentro

- **Front**: React + TanStack + Vite + Tailwind — home, catálogo por cidade, página do
  carro, checkout em etapas, área do cliente, blog, FAQ, páginas legais (PT/EN/ES).
- **Backend (estrutura)**: a pasta `drizzle/migrations` traz o schema completo do banco
  (carros, cidades, reservas, pagamentos, cupons, checkout abandonado, avaliações etc.).
- **Pagamentos**: checkout com Stripe e com Global Pays (Pix e cartão parcelado).
- **Extras já estruturados**: verificação de identidade (Stripe Identity), verificação
  de seguro (MeasureOne), e-mails transacionais (Resend), sincronização com um sistema
  de gestão externo (no original era o sistema interno do dono — reconecte ao seu
  sistema ou remova as chamadas em `src/services`, marcadas como `SistemaGestao`).
- **Admin**: painel em `/admin` (frota, reservas, preços, configurações da empresa).

A frota (carros, preços, fotos) **vive no banco de dados, não no código** — por isso o
esqueleto já nasce "vazio": você cadastra os seus carros no admin.

## O caminho (como subir no seu Lovable)

O Lovable **não importa** um repositório existente direto para um projeto novo.
A rota que funciona é esta:

1. Crie sua conta no Lovable e um projeto novo qualquer (pode ser vazio).
2. Dentro do projeto: **More → Settings → Git → GitHub** e conecte — o Lovable cria um
   repositório novo, vazio, ligado ao projeto.
3. Clone esse repositório no seu computador, apague o conteúdo gerado, cole os arquivos
   **deste esqueleto** por cima (mantendo a pasta `.git`), e faça commit + push.
4. O Lovable puxa os commits automaticamente e o projeto vira este site.
5. Daí em diante, o **Claude Code** (sobre o mesmo repositório) faz os ajustes finos:
   sua marca, suas cores, seus carros, seus textos.

Alternativa: trabalhar só local com o Claude Code e publicar em Vercel/servidor próprio.

## Contas que você precisa criar (nada vem da empresa de origem)

- Lovable + GitHub
- Banco de dados próprio (Lovable Cloud ou Supabase) — rodar as migrations de `drizzle/`
- Stripe (sua conta) e/ou gateway de sua escolha
- Google Maps (chave de API), Resend (e-mails), MeasureOne (se quiser verificar seguro)
- Domínio próprio

## Configuração inicial

1. Copie `.env.example` para `.env` e preencha com as **suas** chaves.
2. Troque os placeholders de marca/contato/domínio (busca global pelos termos acima).
3. Rode as migrations no seu banco e cadastre seus carros, cidades e preços no `/admin`.
4. Suba suas fotos: as referências de imagem em `src/assets` e `public/images` foram
   removidas de propósito (eram da frota de origem) — o Claude reconecta com as suas.
5. O blog (`src/data/blog.ts`) e as descrições de modelos (`src/data/modelContent.ts`)
   foram esvaziados mantendo os tipos/estrutura — preencha com o seu conteúdo.

## Avisos honestos

- Não é plug-and-play: o esqueleto economiza a estrutura inteira (meses de trabalho),
  mas banco, pagamentos, domínio e conteúdo exigem a sua configuração.
- Alguns testes internos (`*.test.ts`) referenciam os placeholders — servem de referência
  da lógica, não precisam passar de primeira.
- As fotos de capa de cidade e a galeria do carro em destaque também foram removidas;
  use o arquivo `public/images/car-placeholder.svg` como referência de proporção.
