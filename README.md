# WhatsFlow

Plataforma de atendimento WhatsApp em desenvolvimento. A entrega atual é a **Sprint 1, Fase 2 — Infraestrutura**: frontend vazio, backend operacional e PostgreSQL/Prisma. Não há regras de negócio, autenticação ou integrações de atendimento.

## Índice

- [Início com Docker](#início-com-docker)
- [Desenvolvimento local](#desenvolvimento-local)
- [Comandos](#comandos)
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
      modules/operations/   # Liveness e readiness
      app.ts                # Composição HTTP testável
      server.ts             # Bootstrap e encerramento
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
