# Registros de Decisão Arquitetural (ADRs)

## Índice

1. [Como manter este arquivo](#como-manter-este-arquivo)
2. [ADR-001 — Monólito modular](#adr-001--monólito-modular)
3. [ADR-002 — Processamento assíncrono após persistência](#adr-002--processamento-assíncrono-após-persistência)
4. [ADR-003 — PostgreSQL como fonte de verdade](#adr-003--postgresql-como-fonte-de-verdade)
5. [ADR-004 — IA por porta e saída estruturada](#adr-004--ia-por-porta-e-saída-estruturada)
6. [ADR-005 — Handoff governado pela aplicação](#adr-005--handoff-governado-pela-aplicação)
7. [ADR-006 — API REST para o painel](#adr-006--api-rest-para-o-painel)
8. [ADR-007 — Stack e limite da infraestrutura](#adr-007--stack-e-limite-da-infraestrutura)
9. [ADR-008 — Migração inicial sem domínio](#adr-008--migração-inicial-sem-domínio)
10. [ADR-009 — Canal Meta e fila PostgreSQL](#adr-009--canal-meta-fila-postgresql-e-validação-externa-pendente)
11. [ADR-010 — Projeto de portfólio e empresa demonstrativa desacoplada](#adr-010--projeto-de-portfólio-e-empresa-demonstrativa-desacoplada)
12. [Modelo para novas ADRs](#modelo-para-novas-adrs)
13. [Decisões pendentes](#decisões-pendentes)
14. [Recomendações do Arquiteto](#recomendações-do-arquiteto)

## Como manter este arquivo

Cada ADR possui estado, contexto, problema, alternativas, decisão e consequências. Estados permitidos: `Proposta`, `Aceita`, `Substituída` e `Rejeitada`. Uma decisão aceita não deve ser reescrita para apagar o passado; uma nova ADR a substitui e referencia a anterior.

As ADRs 001–006 estão aceitas para orientar o MVP e serão concretizadas incrementalmente. As ADRs 007–008 registram decisões aplicadas à infraestrutura da Sprint 1, Fase 2. Aceite arquitetural não significa que todas as funcionalidades descritas já foram implementadas.

## ADR-001 — Monólito modular

- **Estado:** Aceita
- **Data:** 2026-09-28

### Contexto

O MVP possui vários conceitos de negócio, mas uma única equipe, uma empresa piloto e escala ainda desconhecida.

### Problema

É necessário preservar separação de responsabilidades sem criar complexidade distribuída precoce.

### Alternativas

1. aplicação monolítica sem fronteiras formais;
2. monólito modular;
3. microsserviços independentes desde o início;
4. funções serverless isoladas por operação.

### Decisão

Adotar um monólito modular. Módulos expõem casos de uso/contratos e não acessam livremente os detalhes internos dos demais. API e worker podem ser processos separados do mesmo sistema.

### Consequências

**Positivas:** implantação e depuração simples, transações locais, refatoração rápida e fronteiras preparadas para futura extração.

**Negativas:** disciplina arquitetural depende de testes/revisão; uma implantação pode afetar vários módulos; escala por módulo é limitada, exceto separação API/worker.

**Gatilho de revisão:** um módulo exigir escala, disponibilidade, equipe ou ciclo de implantação materialmente diferente e mensurável.

## ADR-002 — Processamento assíncrono após persistência

- **Estado:** Aceita
- **Data:** 2026-09-28

### Contexto

Webhooks precisam ser reconhecidos rapidamente, enquanto chamadas de IA e envio podem ser lentos ou falhar.

### Problema

Processar toda a conversa durante a requisição do webhook aumenta timeout, duplicidade e acoplamento a fornecedores.

### Alternativas

1. processamento totalmente síncrono;
2. confirmar antes de persistir e processar em memória;
3. persistir, registrar outbox e processar em fila;
4. adotar broker distribuído de alta escala desde o início.

### Decisão

Persistir a admissão e um evento de outbox na mesma transação, responder ao webhook e processar via worker idempotente. Adotar Redis/BullMQ inicialmente se o ambiente o suportar; manter a abstração de fila para permitir alternativa baseada em PostgreSQL.

### Consequências

**Positivas:** mensagens sobrevivem a falhas, retentativas ficam controladas e API/worker escalam separadamente.

**Negativas:** consistência eventual, mais estados operacionais e necessidade de monitorar fila, outbox e dead-letter lógica.

**Gatilho de revisão:** limites de throughput, durabilidade ou operação tornarem a tecnologia de fila insuficiente.

## ADR-003 — PostgreSQL como fonte de verdade

- **Estado:** Aceita
- **Data:** 2026-09-28

### Contexto

Conversas, mensagens, handoffs e auditoria possuem relações e invariantes transacionais.

### Problema

O histórico não pode depender somente do estado do canal, do frontend ou do fornecedor de IA.

### Alternativas

1. PostgreSQL relacional;
2. banco documental como fonte primária;
3. estado mantido pelo provedor de IA;
4. armazenamento apenas de logs/eventos sem projeções relacionais.

### Decisão

Usar PostgreSQL como fonte canônica do negócio. IDs externos e metadados de integrações são referências, não autoridade sobre o estado interno.

### Consequências

**Positivas:** integridade, consultas operacionais, transações, auditoria e menor lock-in.

**Negativas:** necessidade de migrações, modelagem cuidadosa, retenção e escalabilidade do histórico.

**Gatilho de revisão:** padrões de volume/consulta justificarem particionamento, arquivamento ou armazenamento complementar.

## ADR-004 — IA por porta e saída estruturada

- **Estado:** Aceita
- **Data:** 2026-09-28

### Contexto

A IA é útil para linguagem natural, mas modelos e APIs mudam e podem produzir respostas incorretas.

### Problema

Acoplamento direto do domínio a um SDK ou texto livre tornaria o sistema difícil de testar, validar e substituir.

### Alternativas

1. chamada direta e geração livre;
2. adaptador por porta com saída JSON validada manualmente;
3. adaptador por porta com Structured Outputs;
4. regras determinísticas sem IA;
5. framework de agentes completo.

### Decisão

Definir uma porta interna para classificação/geração, implementar inicialmente com OpenAI Responses API e exigir saída estruturada por esquema. Regras determinísticas continuam responsáveis por estados e ações. O modelo exato será configuração selecionada por avaliação.

### Consequências

**Positivas:** testabilidade com fake, validação, troca de modelo/provedor e menor risco de ação indevida.

**Negativas:** adaptador e esquema adicionais; esquema válido ainda pode conter erro semântico; avaliação contínua necessária.

**Gatilho de revisão:** novo provedor, necessidade multimodal ou evidência de que uma solução determinística atende melhor uma intenção.

## ADR-005 — Handoff governado pela aplicação

- **Estado:** Aceita
- **Data:** 2026-09-28

### Contexto

O MVP precisa transferir atendimentos e impedir que a IA continue respondendo após uma pessoa assumir.

### Problema

Se o modelo decidir sozinho ou se o estado existir apenas na interface, podem ocorrer respostas conflitantes e perda de responsabilidade.

### Alternativas

1. modelo decide e executa handoff;
2. frontend controla um indicador local;
3. backend mantém máquina de estados e regras, usando a IA apenas como sinal;
4. todo atendimento passa por aprovação humana.

### Decisão

Persistir o modo/estado da conversa no backend. Regras da aplicação decidem a transição com base em solicitação explícita, classificação, falhas e ações humanas. Todo job revalida o estado antes de enviar.

### Consequências

**Positivas:** comportamento determinístico, auditável e seguro em concorrência.

**Negativas:** exige máquina de estados, tratamento de corrida e processo operacional de fila humana.

**Gatilho de revisão:** necessidade de roteamento por equipes, SLA ou múltiplos níveis de suporte.

## ADR-006 — API REST para o painel

- **Estado:** Aceita
- **Data:** 2026-09-28

### Contexto

O painel necessita de operações previsíveis de listagem, leitura e alteração, sem requisitos atuais de federação complexa.

### Problema

É preciso escolher um contrato simples, documentável e seguro entre frontend e backend.

### Alternativas

1. REST/JSON com OpenAPI;
2. GraphQL;
3. chamadas server-only acopladas ao framework do frontend;
4. comunicação em tempo real como interface principal.

### Decisão

Usar REST/JSON versionado e contrato OpenAPI. Atualização periódica atende o início; SSE/WebSocket pode ser adicionado depois para eventos do painel.

### Consequências

**Positivas:** curva baixa, contrato visível, testes e integração simples.

**Negativas:** múltiplas requisições podem ser necessárias; tempo real não é imediato no primeiro incremento.

**Gatilho de revisão:** requisitos concretos de latência do painel ou composição de dados mostrarem limitação relevante.

## ADR-007 — Stack e limite da infraestrutura

- **Estado:** Aceita por orientação explícita do responsável na Fase 2
- **Data:** 2026-09-28
- **Substitui:** sugestões tecnológicas de Next.js/NestJS em scope.md e alocação do bootstrap à Sprint 2; preserva ADR-001 a ADR-006.

### Contexto

A Fase 1 sugeriu Next.js/NestJS e uma Sprint 1 documental. A solicitação da Fase 2 determina React/Vite, Express e infraestrutura ainda na Sprint 1. A divergência foi comunicada antes da implementação, junto ao bloqueio do Git; após configurar o repositório próprio, o responsável retornou para continuidade.

### Problema

Alinhar a stack e a sequência ao pedido atual, preservando a arquitetura modular e limitando a entrega à fundação técnica.

### Alternativas

Manter as sugestões iniciais; ou aplicar a stack explicitamente solicitada com composição manual. A segunda opção atende à direção atual do produto.

### Decisão

Usar workspace pnpm com backend e frontend independentes em apps/, TypeScript estrito, React/Vite e Express. Criar somente módulo operacional de health, configuração, logging, tratamento HTTP e acesso técnico ao banco. O frontend terá layout vazio, roteador e os diretórios expressamente solicitados. Contexts/hooks/services permanecerão documentados, sem abstrações artificiais. Docker Compose será ambiente de desenvolvimento com rede e volumes próprios. Não criar autenticação, entidades, filas, worker ou adaptadores externos nesta fase.

### Consequências

A simplicidade de Express exige preservar manualmente limites e injeção das dependências; Vite entrega uma SPA sem SSR, suficiente para este painel. A infraestrutura local passa para Sprint 1/Fase 2; as funcionalidades continuam nas Sprints seguintes. O build será verificável, mas o Compose de desenvolvimento não representa implantação de produção.

## ADR-008 — Migração inicial sem domínio

- **Estado:** Aceita
- **Data:** 2026-09-28

### Contexto

A Fase 2 exige primeira migration e conexão Prisma, mas não entidades ou regras de negócio.

### Problema

Estabelecer um histórico de migrations reproduzível sem inventar uma tabela de produto ou uma tabela descartável apenas para teste.

### Alternativas

Criar tabela técnica de validação; antecipar uma entidade de negócio; ou iniciar o histórico com SQL sem tabelas de aplicação e verificar conectividade por SELECT 1.

### Decisão

A primeira migration garante o schema public, sem modelos de domínio. Prisma mantém somente sua tabela técnica de controle de migrations. Prisma Client usa PostgreSQL por driver adapter e valida a conexão com SELECT 1. Geração e aplicação de migrations são comandos explícitos; o Compose executa migrate deploy antes do servidor.

### Consequências

Não há CRUD, seed ou tabela temporária. A primeira entidade surgirá em migration futura. A validação deve comprovar geração do client sem modelos, aplicação do histórico, ausência de drift e consulta real ao banco.

## ADR-009 — Canal Meta, fila PostgreSQL e validação externa pendente

- **Estado:** Aceita para a Fase 4, conforme autorização de avanço em 2026-09-30
- **Data:** 2026-09-30
- **Complementa:** ADR-001/002/003; concretiza a alternativa PostgreSQL da ADR-002.

### Contexto

A Sprint 1 está aprovada. O responsável confirmou app Meta, credenciais e destinatário de teste verificado. Recebimento no painel Meta funciona; o envio para +55 falhou com 130497. Um eSIM Claro está aguardando ativação. O responsável autorizou implementar e testar o canal antes da ativação, mantendo envio/recebimento reais com o novo número como gate obrigatório de conclusão.

**Atualização factual em 2026-10-01:** o número brasileiro da Claro foi ativado, cadastrado na Cloud API e teve envio/recebimento validados diretamente pelos recursos da Meta. O erro 130497 permanece apenas como histórico do número de teste internacional. O gate de conclusão continua sendo o fluxo real pelo WhatsFlow, não o teste isolado no painel da Meta.

**Conclusão em 2026-10-02:** callback e `messages` foram configurados, o app foi associado à WABA por `subscribed_apps` e o fluxo real percorreu webhook assinado, inbox, worker, outbox e cliente Meta. O inbound foi persistido/deduplicado; o outbound obteve HTTP 200, Provider ID, `sent`, `delivered` e confirmação no aparelho. A Sprint 2 foi concluída. O Quick Tunnel e a rota host-network usados para contornar restrições locais são evidências de desenvolvimento, não estratégia de deploy.

**Complemento posterior:** a conclusão acima encerrou corretamente a Fase 4, mas o roadmap ainda previa a Fase 5. A Sprint 2 foi reaberta somente para modelar conversas e histórico, sem invalidar o aceite real do canal, e encerrada novamente após a ADR-011.

### Problema

Entregar comunicação durável sem acrescentar regras de atendimento, nem confundir aceite HTTP da Meta com entrega. A tabela anterior de módulos tinha um ciclo Conversations/Messaging e o roadmap antecipava domínio além da fase autorizada.

### Alternativas

Redis/BullMQ com publicador de outbox; outbox consumida diretamente no PostgreSQL; envio síncrono sem persistência. O ambiente já opera PostgreSQL e o volume deste laboratório não justifica um segundo serviço de armazenamento.

### Decisão

Usar inbox durável para envelopes assinados e outbox transacional para mensagens de saída. Worker separado consome PostgreSQL com reservas atômicas e SKIP LOCKED. A admissão grava payload validado antes do ACK; normalização e estados ocorrem depois. A fase cria somente dados técnicos do canal, não Contacts/Conversations nem IA. Messaging não dependerá de Conversations; a coordenação futura ficará na aplicação, eliminando o ciclo documentado.

Envio será iniciado por CLI local, sem rota pública desprotegida. Cliente HTTP Meta fica isolado. Retentativas limitadas apenas para rejeição explícita de rate limit; timeout, erro de rede, resposta 5xx e crash durante envio ficam em estado incerto, sem reenvio automático. Callback opaco permite reconciliar status quando disponível. Entrega real não é garantida por HTTP 200. Nenhum segredo será copiado do chat ou exibido nos logs.

### Consequências

Menos dependências operacionais; transações locais preservam admissão/outbox. Polling e retenção exigem acompanhamento. Não há garantia exactly-once na rede: incertezas exigem inspeção humana. Redis poderá substituir a fila diante de medição de carga. O aceite comprovou a decisão; URL HTTPS permanente, supervisão e rede do ambiente implantado permanecem decisões operacionais futuras.

## ADR-010 — Projeto de portfólio e empresa demonstrativa desacoplada

- **Estado:** Aceita
- **Data:** 2026-10-01
- **Complementa:** ADR-001 e o escopo do MVP

### Contexto

O WhatsFlow foi inicialmente documentado em torno de uma assistência técnica fictícia e com linguagem próxima de um produto comercial. O objetivo aprovado evoluiu para uma demonstração profissional de arquitetura backend, integrações, APIs, persistência, IA e desenvolvimento full stack. A Atlas Tech, loja fictícia de eletrônicos e acessórios, será usada para tornar a demonstração concreta.

### Problema

Demonstrar uma experiência coerente sem transformar o nome, o segmento ou as regras da Atlas Tech em dependências do núcleo. Também é necessário deixar claro que o repositório é um projeto de portfólio, não um SaaS comercial nem um chatbot específico de uma única empresa.

### Alternativas

Acoplar entidades e regras ao varejo eletrônico; construir multitenancy completo desde o MVP; ou manter uma única empresa demonstrativa composta por dados configuráveis sobre um núcleo genérico. A primeira alternativa reduz reutilização. A segunda cria complexidade sem necessidade comprovada.

### Decisão

Tratar o WhatsFlow como **AI Customer Assistant Platform for Small Businesses** e projeto de portfólio. Usar a Atlas Tech exclusivamente como empresa demonstrativa. Marca, identidade visual, catálogo, FAQ e políticas operacionais entram como dados/configuração. Integrações Meta/OpenAI, persistência, conversas, autenticação, dashboard e serviços permanecem independentes desse cenário. Não implementar multitenancy completo no MVP.

### Consequências

O portfólio apresenta um caso de uso compreensível sem limitar a arquitetura ao varejo. Trocar a empresa demonstrativa deve exigir substituição de conteúdo e identidade, não reescrita de módulos. Exemplos e avaliações poderão usar eletrônicos, acessórios, disponibilidade, compatibilidade, entrega, pagamento, garantia e troca. Essa separação exige revisão para impedir nomes e políticas demonstrativas hardcoded. Multitenancy continua evolução futura, não requisito implícito.

## ADR-011 — Identidade da conversa no canal WhatsApp

- **Estado:** Aceita
- **Data:** 2026-10-02
- **Complementa:** ADR-003 e ADR-009

### Contexto

A Fase 4 já persistia mensagens técnicas em `ChannelMessage`, com idempotência, inbox/outbox e estados de entrega validados. A Fase 5 precisava agrupar essas mensagens em históricos sem criar um segundo modelo de mensagem, perder os dados reais existentes ou antecipar multitenancy, contatos enriquecidos e estados de atendimento.

### Problema

Definir quando duas mensagens pertencem à mesma conversa e garantir essa identidade sob processamento concorrente, mantendo o modelo independente da empresa demonstrativa.

### Alternativas

Criar uma conversa por mensagem; agrupar apenas pelo telefone do contato; usar uma janela temporal para abrir/fechar sessões; ou adotar uma identidade estável composta por canal, número empresarial e identificador externo do contato. Agrupar só pelo contato conflita quando há mais de um número empresarial. Sessões temporais exigiriam regras de ciclo de vida ainda não aprovadas.

### Decisão

Uma conversa é identificada no MVP pela chave `(channel, phoneNumberId, externalContactId)`. Para WhatsApp, `externalContactId` é o identificador do contato recebido/enviado no canal e `phoneNumberId` identifica o número empresarial conectado. A chave única no PostgreSQL e um upsert atômico impedem duplicidade sob concorrência. Toda `ChannelMessage` pertence obrigatoriamente a uma `Conversation` e possui `occurredAt`; `lastMessageAt` somente avança.

O `ChannelMessage` existente continua sendo a fonte normalizada de mensagens e estados. A migration cria conversas por agrupamento dos dados da Fase 4, vincula todas as mensagens e só então torna a relação obrigatória. O histórico é exposto por projeções paginadas que não retornam o payload bruto do provedor.

### Consequências

O dashboard e a automação futura recebem histórico consistente sem duplicar conceitos. Eventos atrasados não regridem a atividade da conversa e concorrência fica protegida pelo banco. A identidade representa um diálogo contínuo por canal/número/contato; encerramento, reabertura, múltiplas empresas, fusão de contatos e política de retenção continuam decisões futuras. Até existir autenticação, os endpoints de leitura não devem ser publicados sem uma camada de acesso confiável.

## Modelo para novas ADRs

```markdown
## ADR-NNN — Título

- **Estado:** Proposta | Aceita | Substituída | Rejeitada
- **Data:** AAAA-MM-DD
- **Substitui:** ADR-NNN, se aplicável

### Contexto

Fatos e forças que motivam a decisão.

### Problema

Pergunta objetiva que precisa ser resolvida.

### Alternativas

Opções consideradas, incluindo manter o estado atual quando pertinente.

### Decisão

Escolha e justificativa.

### Consequências

Efeitos positivos, negativos, riscos e gatilho de revisão.
```

## Decisões pendentes

Estas decisões exigem evidência e não devem ser fechadas apenas por preferência:

| Tema                            | Evidência necessária                               | Prazo sugerido              |
| ------------------------------- | -------------------------------------------------- | --------------------------- |
| Provedor de hospedagem e região | custo, LGPD, serviços gerenciados e latência       | Antes do deploy persistente |
| Revisão da fila PostgreSQL      | throughput e contenção medidos (ADR-009)           | Após piloto                 |
| Provedor de identidade          | custo, segurança e papéis necessários              | Sprint 4                    |
| Modelo OpenAI                   | avaliação de qualidade, latência e custo           | Sprint 3                    |
| Política de retenção            | necessidade operacional e análise de privacidade   | Antes do piloto             |
| Atualização do painel           | teste com atendentes: polling versus SSE/WebSocket | Sprint 4                    |
| Estratégia de deploy            | ambiente escolhido, rollback e migrações           | Antes do deploy persistente |

## Recomendações do Arquiteto

- Separar ADRs em arquivos individuais quando ultrapassarem cerca de dez registros; manter este documento como índice.
- Incluir um teste ou mecanismo de revisão para dependências entre módulos, protegendo a ADR-001.
- Não transformar “tecnologia prevista” em decisão irreversível sem prova técnica e critério mensurável.
- Registrar imediatamente qualquer exceção às ADRs, em vez de permitir divergência silenciosa entre documentação e implementação.
