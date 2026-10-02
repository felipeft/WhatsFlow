# WhatsFlow

**AI Customer Assistant Platform for Small Businesses.** O WhatsFlow é uma plataforma de atendimento inteligente construída como projeto robusto de portfólio para demonstrar arquitetura backend, integrações, APIs, persistência e desenvolvimento full stack. Não é um SaaS comercial.

O cenário funcional usa a **Atlas Tech**, loja fictícia de eletrônicos e acessórios, somente como empresa demonstrativa. Marca, catálogo e políticas da demonstração serão dados configuráveis; o núcleo do WhatsFlow não depende desse domínio.

**Sprints 1 e 2 concluídas.** O canal Meta possui webhook assinado, inbox/outbox PostgreSQL, worker e envio por CLI. Em 2026-10-02, o fluxo real foi validado com o número brasileiro: challenge público, mensagem inbound persistida, deduplicação, envio pelo WhatsFlow, recibos `sent`/`delivered` e confirmação no telefone. A Fase 5 acrescentou conversas, histórico paginado e vínculo das mensagens inbound/outbound, preservando os dados reais da Fase 4. Frontend continua vazio; não há IA, classificação, regras de atendimento ou autenticação do painel.

## Índice

- [Início com Docker](#início-com-docker)
- [Desenvolvimento local](#desenvolvimento-local)
- [Comandos](#comandos)
- [Integração Meta](#integração-meta)
- [Estrutura](#estrutura)
- [Documentação](#documentação)

## Início com Docker

Requisitos: Git, Docker Engine em execução e Docker Compose com suporte a `develop.watch` (2.32 ou posterior). O host não precisa de Node/pnpm para esta modalidade.

Na raiz do repositório, crie `.env` se ainda não existir:

```bash
test -f .env || cp .env.example .env
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
curl --fail http://localhost:3000/health
curl --fail http://localhost:3000/health/ready
curl --fail http://localhost:5173/api/health/ready
```

Abra [frontend](http://localhost:5173): a página deve estar vazia, com título WhatsFlow e um elemento `main`. Isso é intencional. O proxy `/api` permite comunicação com o backend sem adicionar CORS desnecessário no ambiente de desenvolvimento.

O Compose aplica migrations antes de iniciar o backend. A imagem gera Prisma Client e compila os dois projetos. Dependências e código gerado permanecem na imagem; não dependem de `node_modules` do host.

Para sincronizar alterações de `src/` nos contêineres em execução:

```bash
docker compose watch
```

Alterações em manifests, lockfile, Prisma ou configurações exigem `docker compose up --build -d --wait`. O watch não sincroniza Prisma Client gerado no host. Para parar, use `docker compose down`; o volume do banco é preservado. Não use `down -v` se quiser manter os dados.

As credenciais do exemplo são exclusivamente de desenvolvimento. Se alterá-las, atualize também `DATABASE_URL` para uso local. Nos campos usuário/senha destinados à URL, use caracteres alfanuméricos simples no ambiente de exemplo, ou configure corretamente o percent-encoding da URL. Alterar `.env` não redefine a senha de um banco já inicializado no volume.

## Desenvolvimento local

Requisitos adicionais: Node.js 24 e pnpm 10.34.5, conforme `.nvmrc` e `packageManager`. Com um gerenciador de Node já instalado, selecione Node 24. Para instalar a versão do pnpm no ambiente Node ativo:

```bash
npm install --global pnpm@10.34.5
node --version
pnpm --version
```

Execute na raiz:

```bash
test -f .env || cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d --wait postgres
pnpm db:generate
pnpm db:deploy
pnpm db:check
pnpm dev
```

Se backend/frontend do Compose estiverem em execução, pare-os antes de `pnpm dev` para liberar as portas:

```bash
docker compose stop backend frontend
```

As aplicações carregam o `.env` da raiz independentemente de onde o comando do workspace é iniciado. Nenhum segredo deve usar prefixo `VITE_`, pois variáveis com esse prefixo podem ser incorporadas ao bundle.

## Comandos

| Comando                                     | Finalidade                                                   |
| ------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                  | Backend e frontend em desenvolvimento                        |
| `pnpm check`                                | Formatação, lint, tipos, testes e build                      |
| `pnpm build`                                | Gerar client, compilar backend e empacotar frontend          |
| `pnpm --filter @whatsflow/backend start`    | Executar JavaScript compilado do backend                     |
| `pnpm --filter @whatsflow/frontend preview` | Inspecionar build estático local; não é servidor de produção |
| `pnpm db:generate`                          | Gerar Prisma Client                                          |
| `pnpm db:validate`                          | Validar schema/configuração Prisma                           |
| `pnpm db:deploy`                            | Aplicar migrations versionadas sem criar novas               |
| `pnpm db:migrate --name nome_da_mudanca`    | Criar/aplicar uma migration futura em desenvolvimento        |
| `pnpm db:status`                            | Verificar histórico de migrations                            |
| `pnpm db:check`                             | Executar SELECT 1 por Prisma                                 |
| `pnpm format`                               | Formatar código e documentação                               |

## Integração Meta

Leia o [guia do canal Meta](docs/meta-cloud-api.md) antes de habilitar. O modo padrão `META_ENABLED=false` mantém a infraestrutura utilizável sem credenciais; `/webhooks/meta` não é exposto nesse modo.

No `.env` privado da raiz, configure `META_ENABLED`, `META_APP_SECRET`, `META_VERIFY_TOKEN` (token próprio de pelo menos 32 caracteres), `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_API_BASE_URL` e `META_API_VERSION`. Os dois primeiros IDs representam o número remetente e a conta WhatsApp, não o App ID. App ID não é necessário nas chamadas implementadas. Base URL e versão vêm do painel; o host permitido é `graph.facebook.com` via HTTPS. `META_REQUEST_TIMEOUT_MS` e `META_WORKER_POLL_MS` controlam timeout e polling. Nenhum valor Meta usa prefixo `VITE_`.

Após preencher as credenciais e definir `META_ENABLED=true`:

```bash
pnpm db:deploy
docker compose --profile meta up --build -d --wait --wait-timeout 180
docker compose logs --tail 50 worker
```

Para desenvolvimento no host, execute backend com `pnpm dev` e worker em outro terminal com `pnpm worker`. Não mantenha simultaneamente processos Docker e locais usando as mesmas portas. O worker só envia intenções explicitamente enfileiradas; mensagens recebidas não geram resposta automática nesta fase.

| Comando                                            | Finalidade                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm test`                                        | Contratos HTTP, autenticação do webhook e cliente Meta mockado  |
| `pnpm test:integration`                            | PostgreSQL real em schema temporário; exige `TEST_DATABASE_URL` |
| `pnpm worker`                                      | Worker inbox/outbox no host                                     |
| `pnpm meta enqueue /caminho/privado/mensagem.json` | Gravar intenção idempotente de envio                            |
| `pnpm meta status UUID`                            | Consultar estado sem exibir destinatário ou conteúdo            |

O formato do arquivo e os comandos equivalentes no Docker estão no guia. **Enfileirar com worker ativo causa envio real**, se as credenciais estiverem válidas. `accepted` significa aceite da requisição; somente `delivered`/`read` confirmam entrega. O erro `130497` é preservado nos recibos, sem retentativa automática. Use somente destinatários autorizados e arquivos privados fora do repositório.

O webhook público é `https://SEU_HOST/webhooks/meta`; o host deve existir e estar sob seu controle. O aceite da Sprint utilizou um Cloudflare Quick Tunnel temporário, não um endpoint de produção. O callback foi verificado, o campo `messages` assinado e o aplicativo associado à WABA por `/{WABA-ID}/subscribed_apps`. Veja o [relatório final da Sprint 2](docs/reviews/sprint-02-review.md).

O backend expõe a base de leitura que será consumida pelo dashboard futuro:

```text
GET /api/conversations?limit=20&cursor=...
GET /api/conversations/:id
GET /api/conversations/:id/messages?limit=20&cursor=...
```

As respostas usam cursores opacos, ordenação estável e não expõem o payload bruto da Meta. Como autenticação pertence à Sprint 4, esses endpoints não devem ser publicados diretamente na internet antes da camada de acesso apropriada.

## Estrutura

```text
apps/
  backend/
    prisma/                 # Schema e migrations
    scripts/                # Diagnóstico de conexão
    src/
      config/               # Carregamento e validação do ambiente
      http/                 # Tratamento de erros HTTP
      infrastructure/       # Logger e cliente PostgreSQL/Prisma
      integrations/meta/    # Contratos, webhook, cliente HTTP, persistência e worker
      modules/conversations/# Consulta paginada de conversas e histórico
      modules/operations/   # Liveness e readiness
      app.ts                # Composição HTTP testável
      server.ts             # Bootstrap e encerramento
      worker.ts             # Processo assíncrono separado
      meta-cli.ts           # Enqueue e consulta local de estado
    test/                   # Testes de infraestrutura
  frontend/
    src/
      app/                  # Roteador e estilos base
      components/           # Layout vazio
      contexts/             # Orientações, sem providers artificiais
      hooks/                # Orientações, sem hooks artificiais
      services/             # Orientações de acesso à API
docs/
Dockerfile
compose.yaml
pnpm-workspace.yaml
pnpm-lock.yaml
```

## Documentação

- [Visão geral do produto](docs/overview.md)
- [Arquitetura e limites](docs/architecture.md)
- [ADRs](docs/decisions.md)
- [Guia e relatório da infraestrutura](docs/infrastructure.md)
- [Roadmap](docs/roadmap.md)
- [Integração Meta e checkpoints](docs/meta-cloud-api.md)
- [Review da Sprint 1](docs/reviews/sprint-01-review.md)
- [Relatório final da Sprint 2](docs/reviews/sprint-02-review.md)
