# Paridade Clara v1 → v2 (checklist)

Legenda: ✅ feito e testado · 🟡 feito, falta testar com dado real · ⬜ falta.
Regra: **visual = Visita IA v2; lógica = Clara v1**. Nada na v1 de produção é alterado.

## Telas (37)
| Tela v1 | Rota | Status | Fase |
|---|---|---|---|
| Login | /login | ✅ | 1 |
| Esqueci a senha / Redefinir | /forgot-password, /users/password/edit | ⬜ (precisa SMTP) | G |
| Conversas | /conversas | ✅ | 1 |
| Início (Dashboard) | /dashboard | ⬜ | C |
| Minhas Revendedoras (Ativas) | /carteira | ✅ | B |
| Inativas | /inativas | ✅ | B |
| Atacado | /atacado | ✅ | B |
| Pedidos Pendentes | /pedidos-pendentes | ✅ | B |
| Contatos / Detalhe | /contatos, /contatos/:id | ✅ | B |
| Todos os leads | /pipelines/todos-leads | ⬜ | E |
| Tarefas | /tarefas | ⬜ | C |
| Calendário | /calendario | ⬜ | C |
| Gerencial | /gerencial | ⬜ | C |
| Relatórios | /relatorios | ⬜ | C |
| Atividades | /atividades | ⬜ | C |
| Consignado (Kanban) | /funil | ✅ (falta "Automatize" — régua automática, fase E) | E |
| Automação da régua | /funil/automatize | ⬜ | E |
| Pipelines (board) | /pipelines/:slug | ⬜ | E |
| Automação do pipeline | /pipelines/:slug/automatize | ⬜ | E |
| Fluxos / Novo / Construtor (+9 nós) | /fluxos… | ⬜ | F |
| Chat da Equipe | /chat-equipe | ⬜ | G |
| Manual | /manual | ⬜ | G |
| Agentes / Form | /agentes… | ✅ | A |
| Caixas / Nova / Detalhe | /settings/inboxes… | ✅ | A |
| Conta | /settings/account | ✅ | A |
| Etiquetas | /settings/tags | ✅ | A |
| Campos do Contato | /settings/campos-contato | ✅ | A |
| Modelos de Mensagem | /settings/modelos-mensagem | ✅ | A |
| Times de Vendas | /settings/times-de-vendas | ✅ | A |

## Backend (lógica)
| Item v1 | Status | Fase |
|---|---|---|
| Login/sessão Devise-JWT, 4 perfis, escopos de carteira | ✅ | 0 |
| Conversas, mensagens, WAHA (webhook, histórico, envio, QR) | ✅ | 1 |
| Contatos (CRUD, merge, block, bulk_assign, etiquetas, campos) | ✅ | 1 |
| Caixas + acesso por caixa, modelos, notificações, push, agentes, times | ✅ | 1 |
| Chat interno | ✅ | 1 |
| Contas (accounts_controller) | ✅ | A |
| Tarefas + agendamentos | ⬜ | C |
| Dashboard + Reports | ⬜ | C |
| Pedidos (pendentes) + `contacts#ativas` (Time Travel) | ⬜ | B |
| Jueri: API, sync completo, sync cadastro, reconciliação, webhook, atividades | ⬜ | D |
| Régua: avanço automático (hora a hora) + gatilhos da régua | ⬜ | D |
| Pipelines, estágios, cards, gatilhos + execução | ⬜ | E |
| Fluxos (modelo, API do grafo, runner, continuação) | ⬜ | F |
| Rodízio de atribuição (RoundRobin) | ⬜ | E |
| E-mail de boas-vindas / recuperar senha | ⬜ | G |
| Agente de IA (ai_assistant, follow-up, prompt) | ⬜ (dono: depois) | H |
| Fora de escopo (decisão do dono): Baileys, Instagram, Facebook Lead Ads, Stripe | — | — |

## Dados
Importação da produção (banco + MinIO) só no fim, com autorização — ver PLANO_CLARA_V2.md.
