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
10. [Modelo para novas ADRs](#modelo-para-novas-adrs)
11. [Decisões pendentes](#decisões-pendentes)
12. [Recomendações do Arquiteto](#recomendações-do-arquiteto)

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

| Tema                            | Evidência necessária                               | Prazo sugerido     |
| ------------------------------- | -------------------------------------------------- | ------------------ |
| Provedor de hospedagem e região | custo, LGPD, serviços gerenciados e latência       | Início da Sprint 2 |
| Redis/BullMQ ou fila PostgreSQL | suporte operacional e teste de falha               | Sprint 2           |
| Provedor de identidade          | custo, segurança e papéis necessários              | Sprint 2           |
| Modelo OpenAI                   | avaliação de qualidade, latência e custo           | Sprint 3           |
| Política de retenção            | necessidade operacional e análise de privacidade   | Antes do piloto    |
| Atualização do painel           | teste com atendentes: polling versus SSE/WebSocket | Sprint 4           |
| Estratégia de deploy            | ambiente escolhido, rollback e migrações           | Sprint 2           |

## Recomendações do Arquiteto

- Separar ADRs em arquivos individuais quando ultrapassarem cerca de dez registros; manter este documento como índice.
- Incluir um teste ou mecanismo de revisão para dependências entre módulos, protegendo a ADR-001.
- Não transformar “tecnologia prevista” em decisão irreversível sem prova técnica e critério mensurável.
- Registrar imediatamente qualquer exceção às ADRs, em vez de permitir divergência silenciosa entre documentação e implementação.
