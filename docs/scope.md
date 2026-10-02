# Escopo do Produto — MVP do WhatsFlow

## Índice

1. [Objetivo do projeto](#objetivo-do-projeto)
2. [Problema que resolve](#problema-que-resolve)
3. [Público-alvo](#público-alvo)
4. [Empresa fictícia](#empresa-fictícia)
5. [Funcionalidades do MVP](#funcionalidades-do-mvp)
6. [Funcionalidades futuras](#funcionalidades-futuras)
7. [Restrições do MVP](#restrições-do-mvp)
8. [Tecnologias previstas](#tecnologias-previstas)
9. [Critérios de sucesso](#critérios-de-sucesso)
10. [Fora do escopo](#fora-do-escopo)
11. [Riscos e premissas a validar](#riscos-e-premissas-a-validar)
12. [Recomendações do Arquiteto](#recomendações-do-arquiteto)

## Objetivo do projeto

Construir uma plataforma de atendimento inteligente que conecte o WhatsApp de uma pequena empresa a uma operação organizada, rastreável e parcialmente automatizada. O WhatsFlow é um projeto robusto de portfólio, não um SaaS comercial. O MVP deve demonstrar capacidade técnica e provar que perguntas comuns podem ser atendidas com segurança, sem perder o histórico e sem impedir a intervenção humana.

O objetivo não é substituir o atendente. É reduzir trabalho repetitivo, melhorar o tempo da primeira resposta e entregar ao atendente contexto suficiente quando sua participação for necessária.

## Problema que resolve

Pequenas empresas frequentemente concentram atendimento em um único WhatsApp, com problemas como:

- repetição manual de respostas sobre produtos, disponibilidade, compatibilidade, entrega, pagamento, garantia e troca;
- demora fora de períodos de disponibilidade;
- conversas sem classificação ou acompanhamento consistente;
- perda de contexto quando outra pessoa assume o atendimento;
- respostas divergentes entre atendentes;
- ausência de dados para medir demanda, falhas e qualidade do atendimento.

O WhatsFlow cria uma porta de entrada automatizada e um registro operacional único. A IA interpreta a mensagem, mas respostas e decisões críticas permanecem limitadas por conteúdo aprovado e regras explícitas.

## Público-alvo

### Público primário

Pequenas empresas brasileiras que atendem clientes pelo WhatsApp e possuem volume relevante de dúvidas repetitivas. O cenário demonstrativo é uma loja de eletrônicos e acessórios, sem restringir a arquitetura a esse segmento.

### Perfis de usuário

| Perfil                      | Necessidade principal                                        | Canal                                  |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Cliente final               | Obter resposta rápida e saber o próximo passo do atendimento | WhatsApp                               |
| Atendente                   | Visualizar contexto, assumir e responder conversas           | Painel web                             |
| Administrador da empresa    | Manter produtos/FAQ básicos e acompanhar a operação          | Painel web                             |
| Equipe técnica do WhatsFlow | Operar integrações, investigar erros e evoluir o produto     | Ferramentas técnicas e observabilidade |

## Empresa fictícia

O MVP será contextualizado para a **Atlas Tech**, empresa fictícia que demonstra uma pequena loja de eletrônicos e acessórios. Atlas Tech não é o produto nem uma organização jurídica usada nas integrações externas; é somente um conjunto de dados, conteúdo e identidade visual para demonstrar o WhatsFlow.

### Características operacionais assumidas

- uma unidade física;
- atendimento em português do Brasil;
- equipe pequena, com papéis de administrador e atendente;
- produtos divulgados em catálogo, sem garantir estoque, compatibilidade ou condição comercial pela automação;
- disponibilidade, entrega, pagamento, garantia e troca confirmados por conteúdo aprovado ou atendimento humano;
- horário comercial configurado pela empresa;
- WhatsApp como canal principal de primeiro contato.

Dados como marca, endereço, horários, produtos, preços informativos e políticas serão conteúdo configurável; não deverão ficar fixos em prompts, regras ou código de infraestrutura.

## Funcionalidades do MVP

### 1. Integração com WhatsApp

- verificar o endpoint de webhook exigido pela Meta;
- receber eventos de mensagens da WhatsApp Cloud API;
- validar a autenticidade/origem dos eventos conforme o mecanismo oficial disponível;
- registrar eventos antes do processamento dependente de IA;
- enviar mensagens de texto ao cliente;
- tratar notificações repetidas sem duplicar mensagens ou respostas;
- acompanhar estados de envio quando disponibilizados pelo provedor.

### 2. Registro de clientes, conversas e mensagens

- identificar o contato pelo identificador fornecido pela integração;
- criar ou localizar conversa ativa;
- registrar mensagens recebidas e enviadas com data, direção, origem e estado;
- preservar histórico para consulta autorizada;
- registrar mudanças de estado da conversa em trilha de auditoria.

### 3. Atendimento com IA

- classificar a intenção em um conjunto limitado e versionado;
- responder perguntas frequentes e consultas ao catálogo aprovado;
- produzir saída estruturada contendo, no mínimo, intenção, ação recomendada, resposta e motivo de escalonamento quando aplicável;
- evitar afirmar estoque, compatibilidade, prazo de entrega, condição de pagamento ou preço não confirmado;
- registrar versão do prompt/política, provedor/modelo e resultado operacional necessários para auditoria;
- usar fallback seguro em falhas, recusas, baixa confiança ou saída inválida.

### 4. Catálogo e FAQ

- consultar produtos ativos, descrição, categoria, compatibilidade, faixa de preço ou observação informativa quando cadastrada;
- consultar respostas aprovadas de FAQ;
- permitir manutenção administrativa básica desses dados;
- impedir que conteúdo inativo seja usado em novas respostas.

### 5. Escalonamento humano

- escalar por solicitação explícita do cliente;
- escalar por intenção fora do escopo, baixa confiança, repetição sem resolução, risco ou falha técnica persistente;
- suspender respostas automáticas enquanto a conversa estiver em atendimento humano;
- exibir ao atendente histórico e motivo do escalonamento;
- permitir assumir, responder e encerrar/devolver uma conversa ao modo automatizado de forma explícita.

### 6. Painel administrativo simples

- autenticação de usuários internos;
- lista de conversas com filtros essenciais por estado;
- visualização cronológica das mensagens;
- indicação de conversas aguardando atendimento;
- envio de resposta textual por atendente;
- mudança controlada do responsável/estado;
- cadastro básico de catálogo e FAQ;
- visão operacional mínima com contagens de conversas, escalonamentos e falhas.

### 7. Requisitos transversais do MVP

- autorização por papel para funções administrativas;
- proteção de credenciais e dados sensíveis;
- logs estruturados com correlação, sem expor conteúdo pessoal por padrão;
- métricas de processamento, falha, latência e escalonamento;
- política documentada de retenção e exclusão;
- backups e procedimento de restauração testável;
- testes automatizados proporcionais ao risco dos fluxos críticos.

## Funcionalidades futuras

- multitenancy completo com isolamento por empresa;
- múltiplas unidades e múltiplos números de WhatsApp;
- anexos, áudio, imagem, transcrição e análise multimodal;
- campanhas, mensagens ativas e gestão de templates aprovados;
- reserva de produtos e acompanhamento de pedidos;
- estoque e logística integrados;
- pagamentos e integrações com ERP/CRM;
- base de conhecimento com recuperação semântica mais ampla;
- construtor visual de fluxos e regras por empresa;
- relatórios avançados, SLA e análise de satisfação;
- distribuição, filas e permissões avançadas de atendentes;
- suporte a outros canais, como web chat, Instagram ou e-mail;
- personalização de modelo/provedor e experimentos controlados;
- aplicativo móvel dedicado.

Esses itens são possibilidades de evolução e não representam compromisso do MVP.

## Restrições do MVP

- apenas uma empresa demonstrativa e um número de WhatsApp no ambiente de demonstração;
- canal limitado ao WhatsApp Cloud API;
- automação plena apenas para texto;
- mensagens não textuais devem ser registradas quando possível e receber fallback/escalonamento, sem interpretação avançada;
- interface e respostas em português do Brasil;
- catálogo simples, sem estoque em tempo real, pedidos, logística ou cálculo dinâmico de condições comerciais;
- atendimento humano realizado no painel, sem roteamento sofisticado entre equipes;
- sem garantia de resposta instantânea quando provedores externos estiverem indisponíveis;
- hospedagem e região devem ser escolhidas considerando custo, latência e requisitos de proteção de dados;
- uso da IA condicionado a limites de custo, latência, segurança e qualidade medidos.

## Tecnologias previstas

React/Vite e Express foram definidos pelo responsável do projeto na Sprint 1, Fase 2, substituindo as sugestões iniciais de Next.js e NestJS (ADR-007). As demais tecnologias de atendimento continuam planejadas para fases posteriores. Versões instaladas estão fixadas nos manifests e no lockfile; consulte o [relatório de infraestrutura](infrastructure.md).

| Área                     | Tecnologia prevista                                                      | Justificativa                                                                             |
| ------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Frontend                 | React + Vite + TypeScript                                                | SPA interna com roteamento cliente e build independente; escolha explícita da Fase 2.     |
| UI                       | Biblioteca de componentes acessíveis + CSS utilitário                    | Consistência visual e velocidade sem criar um design system prematuro.                    |
| Backend                  | Node.js + Express + TypeScript                                           | Composição explícita e módulos pequenos, preservando fronteiras sem framework de injeção. |
| API interna              | REST/JSON com contrato OpenAPI                                           | Simplicidade, testabilidade e documentação do contrato.                                   |
| Persistência             | PostgreSQL                                                               | Integridade transacional, consultas relacionais e maturidade operacional.                 |
| Acesso a dados           | ORM com migrações, inicialmente Prisma                                   | Tipagem, produtividade e histórico de evolução do esquema.                                |
| Processamento assíncrono | Inbox/outbox PostgreSQL com worker separado (ADR-009)                    | Durabilidade transacional no banco já operado; Redis/BullMQ permanece alternativa futura. |
| IA                       | OpenAI Responses API, modelo configurável                                | Saída estruturada e integração contemporânea, mantendo seleção do modelo substituível.    |
| WhatsApp                 | WhatsApp Cloud API                                                       | Canal oficial de integração da Meta.                                                      |
| Contêineres              | Docker para ambientes reproduzíveis                                      | Paridade entre desenvolvimento e implantação.                                             |
| Observabilidade          | Logs estruturados, métricas e rastreamento compatíveis com OpenTelemetry | Diagnóstico independente do fornecedor de hospedagem.                                     |
| Testes                   | Unitários, integração, contrato e ponta a ponta seletivos                | Cobertura orientada ao risco.                                                             |

Não se recomenda Kubernetes, microsserviços ou mensageria dedicada no MVP sem evidência de carga ou requisito operacional que os justifique.

## Critérios de sucesso

### Critérios funcionais de aceite

- uma mensagem textual válida percorre recebimento, persistência, classificação e resposta com rastreabilidade ponta a ponta;
- reentrega do mesmo webhook não gera mensagem nem resposta duplicada;
- perguntas do conjunto aprovado de FAQ e catálogo recebem resposta fundamentada;
- solicitação explícita de atendente interrompe a automação e aparece na fila humana;
- o atendente consulta histórico e responde pelo painel;
- indisponibilidade da IA não perde a mensagem e resulta em nova tentativa limitada ou fallback;
- ações administrativas respeitam autenticação e autorização.

### Indicadores iniciais para a demonstração controlada

As metas numéricas devem ser confirmadas depois de estabelecer volume e baseline. O MVP deve medir:

- taxa de webhooks aceitos e processados;
- tempo até persistência e tempo até primeira resposta;
- taxa de duplicidade evitada;
- taxa de respostas automáticas, escalonamentos e fallbacks;
- taxa de erro por integração;
- custo médio de IA por conversa automatizada;
- percentual de respostas aprovadas em avaliação amostral;
- satisfação ou sinal simples de resolução, se adotado no piloto.

Como gate para a demonstração ponta a ponta, nenhum teste crítico de idempotência, handoff e isolamento de acesso pode estar falhando.

## Fora do escopo

- substituir e-commerce, sistema de pedidos, estoque, ERP, CRM ou financeiro;
- garantir compatibilidade ou disponibilidade sem fonte aprovada;
- confirmar condição comercial, entrega, garantia ou troca fora das políticas cadastradas;
- receber pagamentos;
- disparar marketing em massa;
- operar múltiplas empresas na mesma implantação do MVP;
- chamadas de voz ou vídeo;
- automação de anexos e áudio;
- treinamento ou fine-tuning de modelo próprio;
- decisões autônomas de alto impacto;
- dashboards analíticos avançados;
- aplicativo móvel nativo;
- garantia de disponibilidade equivalente a sistemas críticos 24x7 nesta fase.

## Riscos e premissas a validar

| Risco/premissa                                 | Impacto                            | Tratamento planejado                                                              |
| ---------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| FAQ real não cobre as dúvidas mais comuns      | Automação pouco útil               | Entrevistar operação e montar conjunto de avaliação antes da IA.                  |
| IA responde além do conteúdo aprovado          | Informação incorreta               | Política restritiva, contexto controlado, saída estruturada e auditoria amostral. |
| Eventos são reenviados ou chegam fora de ordem | Duplicidade/inconsistência         | Chaves idempotentes, estados monotônicos e processamento assíncrono.              |
| Atendimento humano fica sem dono               | Cliente aguardando indefinidamente | Estado, responsável, fila e métricas de espera visíveis.                          |
| Conteúdo pessoal aparece em logs               | Risco de privacidade               | Redação, acesso restrito e revisão de logging.                                    |
| Custos/latência externos crescem               | Operação inviável                  | Métricas por chamada, limites e modelo configurável.                              |

## Recomendações do Arquiteto

- Transformar os critérios de sucesso em metas numéricas somente após uma semana de dados de piloto ou simulação representativa.
- Produzir uma base demonstrativa revisada de FAQ, catálogo e casos que sempre exigem humano, sem incorporar regras da Atlas Tech ao núcleo.
- Aprovar formalmente a política de retenção antes de usar dados reais de clientes.
- Realizar uma prova técnica pequena da WhatsApp Cloud API no início da Sprint 2, pois configuração de conta e templates depende de plataforma externa.
