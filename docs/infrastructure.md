# Sprint 1 — Fase 2: infraestrutura

Este é o registro histórico da entrega de 2026-09-28. As afirmações de ausência de tabelas/integrações e os resultados abaixo referem-se àquela fase. Para o estado atual com canal Meta, quatro tabelas técnicas adicionais e worker, consulte [meta-cloud-api.md](meta-cloud-api.md) e [review parcial da Sprint 2](reviews/sprint-02-review.md).

## Índice

1. [Resumo da implementação](#1-resumo-da-implementação)
2. [Estrutura criada](#2-estrutura-criada)
3. [Dependências instaladas](#3-dependências-instaladas)
4. [Arquivos importantes](#4-arquivos-importantes)
5. [Configurações realizadas](#5-configurações-realizadas)
6. [Decisões arquiteturais](#6-decisões-arquiteturais)
7. [Validação](#7-validação)
8. [Pendências manuais](#8-pendências-manuais)
9. [Próxima fase](#9-próxima-fase)
10. [Mensagens de commit sugeridas](#mensagens-de-commit-sugeridas)
11. [Recomendações do Arquiteto](#recomendações-do-arquiteto)

## 1. Resumo da implementação

Workspace pnpm com duas aplicações TypeScript: API Express e SPA React/Vite. O backend expõe somente endpoints operacionais. O frontend possui roteamento e layout vazio, sem telas. PostgreSQL roda em um volume Docker próprio; Prisma dispõe de configuração, geração de client, primeira migration e consulta de conectividade.

Não existem modelos ou regras de negócio, autenticação, WhatsApp, OpenAI, fila ou worker implementados. A arquitetura-alvo desses componentes continua na documentação da Fase 1.

## 2. Estrutura criada

A árvore completa está no [README](../README.md#estrutura). `apps/backend` e `apps/frontend` são pacotes privados com scripts próprios e lockfile compartilhado. Não há pacotes compartilhados artificiais, repositório genérico ou camadas vazias de domínio.

`Operations` é o único módulo inicial, responsável por health checks. A composição injeta a função de verificação de banco em `createApp`; os testes não precisam de banco real. O cliente Prisma está isolado na infraestrutura. `server.ts` controla configuração, inicialização e encerramento; importar `app.ts` não abre portas.

No frontend, os diretórios `contexts`, `hooks` e `services` contêm orientações por terem sido explicitamente solicitados. Receberão código quando existirem consumidores reais.

## 3. Dependências instaladas

Versões diretas estão fixadas nos manifests; versões transitivas e integridade estão no lockfile.

| Área      | Dependências                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------- |
| Runtime   | Node.js 24; pnpm 10.34.5                                                                        |
| Backend   | Express 5.2.1, Pino 10.3.1, pino-http 11.0.0, Zod 4.6.5, dotenv 17.4.2                          |
| Banco     | PostgreSQL 17, Prisma/Client/adapter-pg 7.10.0                                                  |
| Frontend  | React/React DOM 19.3.0, React Router DOM 7.18.4                                                 |
| Build     | Vite 7.3.6, plugin-react 5.2.0, TypeScript 5.9.3, tsx 4.23.15, tsc-alias 1.9.5                  |
| Qualidade | ESLint 10.11.0, typescript-eslint 8.70.1, Prettier 3.9.9, plugins React e tipos correspondentes |

Não há SDK de WhatsApp/OpenAI. ESLint 9 foi descartado durante a instalação porque o registro o marcou como descontinuado; a compatibilidade dos plugins com ESLint 10 foi verificada.

## 4. Arquivos importantes

| Arquivo                                                            | Responsabilidade                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`            | Workspace, comandos, versões e instalações reproduzíveis   |
| `tsconfig.base.json`                                               | Regras estritas compartilhadas                             |
| `apps/backend/tsconfig.build.json`                                 | Compilação do servidor sem testes/configurações auxiliares |
| `apps/backend/src/app.ts`                                          | Middleware, health e handler de erros                      |
| `apps/backend/src/server.ts`                                       | Bootstrap e shutdown                                       |
| `apps/backend/prisma.config.ts`                                    | Configuração CLI Prisma e ambiente                         |
| `apps/backend/prisma/schema.prisma`                                | Gerador e datasource, sem modelos                          |
| `apps/backend/prisma/migrations/20260928000000_init/migration.sql` | Inicialização do schema public                             |
| `apps/frontend/vite.config.ts`                                     | React, alias e proxy de desenvolvimento                    |
| `.env.example`                                                     | Contrato de configuração local                             |
| `Dockerfile`, `compose.yaml`                                       | Imagens, serviços, health checks, rede e volume            |
| `eslint.config.js`, `.prettierrc.json`                             | Qualidade e estilo                                         |

O `.env` local é ignorado por Git e Docker. Código gerado, dependências e builds também não são versionados. Não foi realizado commit.

## 5. Configurações realizadas

### TypeScript e aliases

Backend usa módulos ESM com resolução NodeNext e imports `.js`. O alias `@/` aponta para `src/`; tsx o resolve em desenvolvimento e tsc-alias o converte para caminhos relativos `.js` no build. Assim, `node dist/server.js` não depende de tsx em execução.

Frontend usa resolução Bundler e alias equivalente configurado também no Vite. Ambos herdam `strict`, checagem de acesso indexado, propriedades opcionais exatas e rejeição a símbolos não utilizados.

### HTTP e logs

| Rota                | Resultado                                |
| ------------------- | ---------------------------------------- |
| `GET /health`       | 200 se o processo HTTP responde          |
| `GET /health/ready` | 200 após SELECT 1; 503 se o banco falhar |
| Outras rotas        | 404 JSON com ID de requisição            |

O ID é gerado pelo servidor e retornado em `X-Request-Id`. Logs JSON omitem corpo, headers, query strings e mensagens brutas de erro de drivers. O middleware trata JSON malformado (400), payload acima de 16 KiB (413) e erro inesperado (500). O bootstrap valida variáveis antes de abrir a porta e verifica o banco. SIGINT/SIGTERM encerram HTTP e conexões com prazo máximo de dez segundos.

### Docker e banco

Compose cria três serviços na rede `whatsflow_development`. PostgreSQL usa `whatsflow_postgres_data`; somente portas localhost são publicadas. O banco precisa estar saudável antes do backend; o backend aplica migrations e precisa estar pronto antes do frontend.

As aplicações usam o usuário `node` sem root. A imagem compila ambos os projetos. Docker Compose Watch sincroniza fontes sem sobrepor dependências/client gerado por bind mounts. O Compose é voltado a desenvolvimento; HTTPS, secrets gerenciados, backup e deploy de produção permanecem etapas futuras.

Dentro do Compose, `DATABASE_URL` aponta para `postgres:5432` e o proxy Vite para `backend:3000`. No host, o `.env` usa localhost. `PORT` e `FRONTEND_PORT` controlam as portas publicadas; internamente o Compose mantém 3000/5173. Ao trocar `POSTGRES_PORT`, atualizar a URL local também.

### Prisma

A [configuração do Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) utiliza `prisma.config.ts`, client gerado no código-fonte e adapter PostgreSQL. O schema sem modelos evita antecipar entidades. `migrate deploy` cria o controle `_prisma_migrations` e aplica a migration inicial; `db:check` consulta o banco sem inserir dados.

O [Express 5](https://expressjs.com/en/guide/error-handling/) encaminha rejeições assíncronas aos handlers de erro. O [Vite](https://vite.dev/guide/) fornece servidor de desenvolvimento e build separado; a imagem usa Node 24 para atender às ferramentas escolhidas.

## 6. Decisões arquiteturais

- ADR-007: React/Vite e Express por solicitação atual; infraestrutura na Fase 2 da Sprint 1; limites modulares preservados.
- ADR-008: primeira migration sem tabela de domínio; conectividade real por SELECT 1.
- Workspace pnpm mantém duas aplicações independentes sem introduzir orchestrator de build adicional.
- Testes usam `node:test` e HTTP real em porta efêmera; não foi adicionado framework de testes.
- Proxy Vite mantém o navegador na mesma origem durante desenvolvimento. Nenhuma autenticação ou política CORS de produção é presumida.

## 7. Validação

### Instalação e qualidade no host

Requer Node 24 e pnpm 10.34.5. Execute na raiz:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm check
```

`check` deve terminar com código zero. Os testes cobrem variáveis inválidas sem vazamento, liveness, readiness bem-sucedida/falha, 404, JSON malformado, limite de payload e ID de correlação.

### Compose e conectividade

```bash
test -f .env || cp .env.example .env
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps
curl --fail http://localhost:3000/health
curl --fail http://localhost:3000/health/ready
curl --fail http://localhost:5173/api/health/ready
docker compose exec -T backend pnpm db:check
docker compose exec -T backend pnpm db:status
docker compose exec -T postgres psql -U whatsflow -d whatsflow -c '\dt'
```

Usando `.env.example`, os três serviços devem estar saudáveis, os endpoints devem responder 200, Prisma deve executar SELECT 1 e não pode haver migration pendente. `\dt` deve listar somente `_prisma_migrations`. Se alterar usuário/banco no `.env`, ajuste o comando psql.

Verifique ausência de diferença entre banco e schema:

```bash
docker compose exec -T backend pnpm --filter @whatsflow/backend exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

O comando deve terminar com código zero. Para validar qualidade inteiramente no contêiner, execute `docker compose exec -T backend pnpm check`.

### Build do backend em execução

O comando abaixo inicia o JavaScript compilado em uma porta interna alternativa, preservando o servidor de desenvolvimento:

```bash
docker compose exec -e PORT=3001 backend pnpm --filter @whatsflow/backend start
```

Em outro terminal:

```bash
docker compose exec -T backend node -e "fetch('http://127.0.0.1:3001/health/ready').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

Finalize o processo alternativo com Ctrl+C. Isso comprova resolução dos aliases compilados e conexão via Prisma, além da compilação estática.

### Banco indisponível e recuperação

Somente neste ambiente local de desenvolvimento:

```bash
docker compose stop postgres
curl -i http://localhost:3000/health
curl -i http://localhost:3000/health/ready
docker compose up -d --wait postgres
curl --fail http://localhost:3000/health/ready
```

Durante a interrupção, liveness continua 200 e readiness responde 503. Após recuperação, readiness volta a 200. O volume e histórico são preservados.

### Frontend e desenvolvimento

Abra `http://localhost:5173`. Deve haver título WhatsFlow, `main` vazio e ausência de erros JavaScript. Nenhuma tela de produto é esperada. `docker compose watch` permite sincronizar alterações nas fontes. Use `pnpm dev` para desenvolvimento no host após parar os dois serviços de aplicação do Compose; mantenha PostgreSQL ligado.

### Evidências desta execução

Validação realizada em 2026-09-28:

| Verificação                                | Resultado observado                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline` | Lockfile consistente; instalação concluída                                      |
| `pnpm check`                               | Formatação, lint, tipos, dois testes de infraestrutura e build aprovados        |
| Build frontend após ajuste do `.env`       | Bundle de produção de aproximadamente 315 kB; sem aviso de tamanho              |
| `pnpm db:validate`                         | Schema válido, mesmo sem modelos                                                |
| `docker compose up --build -d --wait`      | Backend, frontend e PostgreSQL saudáveis                                        |
| Prisma no host e no contêiner              | SELECT 1 concluído em ambos                                                     |
| Migrations                                 | Uma aplicada, nenhuma pendente; diff sem diferenças                             |
| Tabelas                                    | Somente `_prisma_migrations`                                                    |
| Backend compilado                          | `node dist/server.js` respondeu 200 na readiness e encerrou por SIGTERM         |
| Indisponibilidade do banco                 | Liveness 200, readiness 503; recuperação para 200 após reinício                 |
| Proxy frontend                             | `/api/health/ready` respondeu 200                                               |
| Navegador                                  | Título WhatsFlow, um `main` vazio, nenhum erro/aviso JavaScript                 |
| Compose Watch                              | Alteração temporária sincronizada para o frontend e depois restaurada           |
| Git                                        | `.env`, dependências, client gerado e builds ignorados; nenhum commit realizado |

A porta 5432 já era usada pelo banco do projeto mini-ecommerce. O `.env` desta máquina publica o banco WhatsFlow em **55432**, com `DATABASE_URL` local correspondente. O `.env.example` mantém o padrão 5432; em outra máquina escolha uma porta livre. Nenhum serviço de outro projeto foi interrompido.

O ambiente da ferramenta exigiu execução autorizada fora do sandbox para rede, sockets dos testes e Docker. Node 24.19.0 e pnpm 10.34.5 foram usados nos comandos locais; o pnpm global não foi alterado. Foi removido `NODE_ENV=development` do `.env` compartilhado para evitar incluir React de desenvolvimento no build Vite; o backend já possui esse default e o Compose o declara somente em runtime.

## 8. Pendências manuais

**Nenhuma pendência manual bloqueia a conclusão desta fase.** O repositório próprio foi criado pelo desenvolvedor e sua raiz foi conferida. Os três serviços ficam disponíveis no Compose. Para usar desenvolvimento no host, é necessário ter Node 24 e pnpm 10.34.5 no terminal; isso é opcional para quem usar Docker. Comandos de preparação estão no README. Contas Meta/OpenAI, credenciais de produção e deploy remoto pertencem a fases futuras.

## 9. Próxima fase

O planejamento seguinte poderá adicionar os módulos de contato, conversa e mensagem, respectivas migrations e integração do canal, sobre os pontos de composição já preparados. Fila/outbox/worker devem entrar quando o fluxo assíncrono for iniciado. A IA continua prevista para a Sprint 3 e o painel funcional para a Sprint 4. Essas etapas não foram iniciadas nesta entrega.

## Mensagens de commit sugeridas

Nenhum commit foi executado. Para organizar o primeiro histórico, considere:

```text
docs: record foundation architecture and infrastructure decisions
chore(workspace): configure pnpm typescript eslint and prettier
feat(backend): bootstrap express server and health checks
chore(frontend): bootstrap react vite router and empty layout
chore(database): configure prisma and initial migration
chore(docker): add development services and compose watch
docs: add development guide and infrastructure validation report
```

Separe os arquivos por etapa ao preparar commits; não use `git add .` sem revisar o status.

## Recomendações do Arquiteto

- Avaliar imagem de produção e autenticação somente na fase correspondente, preservando a distinção entre dev e deploy real.
- Ao introduzir entidades, manter migrations pequenas e documentar suas invariantes.
- Acrescentar CI executando `pnpm check` e validação de migration quando houver serviço remoto de repositório definido.
- Rever versões e imagens periodicamente, atualizando lockfile e repetindo a validação antes de incorporá-las.
