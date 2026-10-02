# Roadmap do WhatsFlow

## Índice

1. [Princípios do roadmap](#princípios-do-roadmap)
2. [Visão das Sprints](#visão-das-sprints)
3. [Sprint 1 — Fundação](#sprint-1--fundação)
4. [Sprint 2 — Plataforma e integração do canal](#sprint-2--plataforma-e-integração-do-canal)
5. [Sprint 3 — Automação inteligente](#sprint-3--automação-inteligente)
6. [Sprint 4 — Operação humana e painel](#sprint-4--operação-humana-e-painel)
7. [Sprint 5 — Qualidade e demonstração](#sprint-5--qualidade-e-demonstração)
8. [Dependências e gates](#dependências-e-gates)
9. [Recomendações do Arquiteto](#recomendações-do-arquiteto)

## Princípios do roadmap

- Uma Sprint só inicia após os critérios de saída da anterior.
- Cada Sprint entrega incremento verificável e documentação atualizada.
- Integrações externas são validadas cedo, mas regras críticas permanecem testáveis sem rede.
- Segurança, observabilidade e testes acompanham cada incremento.
- Funcionalidade futura não entra por conveniência técnica sem mudança de escopo aprovada.

Este roadmap descreve objetivos e gates, não datas. Estimativas dependem do tamanho da equipe, ambiente e acesso às contas externas.

Estado em 2026-10-02: Sprints 1 e 2 concluídas. A Fase 4 foi aceita com callback público, assinatura real, inbound persistido/deduplicado, worker, outbound pelo WhatsFlow, recibos `sent`/`delivered` e confirmação física no número brasileiro. A Fase 5 completou conversas, vínculo de mensagens e histórico paginado, com migration/backfill e regressão da Fase 4 aprovados. A Sprint 3 está liberada somente para planejamento/execução incremental conforme seu escopo; não foi iniciada por esta entrega.

## Visão das Sprints

```mermaid
flowchart LR
    S1[Sprint 1<br/>Documentação e infraestrutura] --> S2[Sprint 2<br/>Plataforma e WhatsApp]
    S2 --> S3[Sprint 3<br/>IA, FAQ e catálogo]
    S3 --> S4[Sprint 4<br/>Handoff e painel]
    S4 --> S5[Sprint 5<br/>Hardening e demonstração]
```

| Sprint | Resultado principal                               | Prova de conclusão                                                         |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------- |
| 1      | Fase 1: documentação; Fase 2: infraestrutura      | Build, health, PostgreSQL, Prisma e Docker validados; sem regra de negócio |
| 2      | Mensagem recebida e persistida com confiabilidade | Teste de webhook/idempotência e observabilidade                            |
| 3      | Resposta automática fundamentada ou handoff       | Conjunto de avaliação e fallbacks aprovados                                |
| 4      | Atendente opera conversas pelo painel             | Fluxo ponta a ponta humano, autorizado e auditável                         |
| 5      | MVP seguro para demonstração controlada           | Gates de qualidade, restauração e operação satisfeitos                     |

## Sprint 1 — Fundação

### Objetivo

Eliminar ambiguidades na Fase 1 e preparar a infraestrutura na Fase 2, conforme solicitação posterior do responsável (ADR-007).

### Entregas

- visão geral e vocabulário;
- escopo, restrições e critérios de sucesso;
- arquitetura e limites dos componentes;
- fluxo completo e exceções;
- ADRs iniciais;
- roadmap de cinco Sprints.
- Fase 2: workspace, Express, React/Vite, TypeScript, ESLint/Prettier, Docker Compose, PostgreSQL, Prisma e migration inicial sem domínio.
- Fase 3: auditoria técnica aprovada em [sprint-01-review.md](reviews/sprint-01-review.md).

### Critério de saída

- documentação consistente e revisável;
- recomendações claramente separadas do escopo aprovado;
- nenhuma implementação de regra de negócio;
- pendências técnicas registradas com momento de decisão.
- backend/frontend compilando e iniciando, banco acessível pelo Prisma e ambiente Compose validado.

## Sprint 2 — Plataforma e integração do canal

**Status:** concluída em 2026-10-02 após as Fases 4 e 5; evidências em [sprint-02-review.md](reviews/sprint-02-review.md).

### Objetivo

Evoluir a fundação entregue na Sprint 1/Fase 2 para receber mensagens com segurança, sem depender da IA para completar o fluxo.

### Entregas previstas

Escopo refinado pelos pedidos das Fases 4 e 5 e pelas ADR-009/011:

- webhook GET/POST com assinatura, validação, admissão durável e idempotência;
- Fase 4: mensagens técnicas e recibos, sem regras de negócio;
- inbox/outbox PostgreSQL, worker separado, retry limitado e tratamento de incerteza;
- cliente Meta isolado, envio textual e template simples de validação por CLI;
- logs sanitizados, testes HTTP/mockados e transacionais com PostgreSQL;
- configuração de ambiente, Docker e documentação dos checkpoints.
- Fase 5: `Conversation 1:N ChannelMessage`, identidade concorrente segura, backfill dos dados existentes e última atividade monotônica;
- endpoints REST de listagem, detalhe e histórico com paginação por cursor e ordenação estável.

CI remoto, provedor de identidade/hospedagem, painel, autenticação e automação não foram adicionados nesta Sprint. Permanecem planejamento posterior, a detalhar antes da Sprint correspondente. Template simples serve à validação do canal; não adiciona campanhas nem gestão de templates ao MVP.

### Critério de saída

- evento válido é persistido uma vez mesmo se reenviado;
- ACK não depende de processamento lento;
- job pode ser reexecutado sem duplicar efeito;
- falhas de banco/fila são observáveis e recuperáveis conforme desenho;
- nenhuma credencial aparece no repositório ou logs.
- webhook validado pela Meta, recebimento persistido e envio entregue de fato usando o número Claro;
- conversa única por canal/número/contato, mensagens inbound/outbound vinculadas e histórico consultável de forma paginada;
- migration aplicada sem perda dos dados da Fase 4, sem drift, com testes de concorrência e regressão aprovados;
- logs e testes aprovados, documentação e relatório final entregues.

## Sprint 3 — Automação inteligente

### Objetivo

Responder com segurança às intenções aprovadas e escalar o restante.

### Entregas previstas

- módulo Knowledge com FAQ e catálogo versionáveis;
- política determinística de elegibilidade e escalonamento;
- porta de IA e adaptador OpenAI Responses API;
- esquema de saída estruturada e validação;
- prompts/políticas versionados;
- respostas fundamentadas e fallbacks;
- registro de attempts, latência, uso e resultado;
- conjunto de avaliação com casos felizes, adversariais e fora do escopo;
- limites de custo, timeout e retentativa.

### Critério de saída

- cenários aprovados de FAQ/catálogo atingem meta de qualidade definida;
- saída inválida, recusa e indisponibilidade não chegam ao cliente como conteúdo bruto;
- pergunta sem base não gera fato inventado;
- modelo pode ser substituído/configurado sem alterar o domínio;
- solicitação humana suspende automação.

## Sprint 4 — Operação humana e painel

### Objetivo

Permitir que usuários internos controlem conteúdo e assumam conversas com segurança.

### Entregas previstas

- autenticação e autorização por papéis;
- lista/filtro de conversas e fila de handoff;
- detalhe com histórico cronológico e estados;
- assumir, responder, encerrar e devolver à automação;
- tratamento de concorrência entre atendente e worker;
- manutenção básica de FAQ e catálogo;
- indicadores operacionais essenciais;
- acessibilidade, responsividade e estados de erro;
- auditoria de ações administrativas.

### Critério de saída

- usuários sem permissão não executam ações protegidas;
- dois atendentes não assumem silenciosamente a mesma conversa;
- automação não responde durante modo humano;
- resposta humana é rastreável e usa o mesmo pipeline confiável de envio;
- tarefas essenciais passam em teste de usabilidade com representante da operação.

## Sprint 5 — Qualidade e demonstração

### Objetivo

Preparar o MVP para uso controlado com dados reais e operação sustentável.

### Entregas previstas

- revisão de segurança e threat model;
- validação LGPD, retenção, anonimização e acesso;
- testes de carga, caos/falha e condições de corrida;
- dashboards e alertas acionáveis;
- backup e restauração testados;
- runbooks de incidentes, credenciais e provedores;
- avaliação final de IA e revisão humana amostral;
- política de rollout, feature flags/kill switch da automação e rollback;
- treinamento curto de atendentes;
- demonstração controlada e relatório de resultados.

### Critério de saída

- zero falha crítica conhecida sem mitigação aprovada;
- restauração demonstrada;
- automação pode ser desativada sem perder o canal humano;
- métricas de sucesso estão coletadas;
- responsáveis e procedimento de incidente estão definidos;
- decisão de publicar no portfólio, ajustar ou interromper a demonstração registrada.

## Dependências e gates

```mermaid
flowchart TD
    D[Documentação aprovada] --> P[Fundação técnica]
    A[Conta Meta e número brasileiro] --> P
    P --> K[FAQ e catálogo aprovados]
    K --> I[Avaliação de IA]
    P --> H[Identidade e painel]
    I --> E[Fluxo ponta a ponta]
    H --> E
    E --> Q[Hardening]
    L[Política LGPD/retenção] --> Q
    Q --> Demo[Demonstração controlada]
```

### Gates que bloqueiam avanço

- acesso indisponível à conta de desenvolvimento da Meta bloqueia validação real do canal, mas não testes por contrato;
- ausência de conteúdo aprovado bloqueia avaliação de respostas, não a construção da porta de IA;
- política de retenção indefinida bloqueia uso de dados reais, não desenvolvimento com dados sintéticos;
- falhas em idempotência, autorização ou handoff bloqueiam a demonstração;
- ausência de runbook e kill switch bloqueia automação demonstrada com conversas reais controladas.

## Recomendações do Arquiteto

- Planejar cada Sprint em etapas menores com demonstração ao final, mantendo estes gates como critérios de saída.
- Manter conta Meta, número brasileiro e conteúdo sintético disponíveis para validar o canal sem acoplar a demonstração ao provedor.
- Não usar conversas reais em desenvolvimento; criar dataset sanitizado/sintético para testes e avaliação.
- Fazer a demonstração com volume limitado, números autorizados e supervisão, ampliando apenas após evidência positiva.
- Recalibrar o roadmap após a prova do webhook e a primeira avaliação de IA, pois esses pontos concentram maior incerteza.
