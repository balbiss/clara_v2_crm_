# Plano — CRM Clara v2

O objetivo é refazer o CRM da Clara Ferreira (hoje em Rails + Vue, repositório `crm_clara_ferreira_pro`) usando a stack do Visita IA v2:

- **Frontend:** React 19 + Vite + Zustand.
- **Backend:** Node + Express + Drizzle + Postgres + socket.io.
- **Arquivos:** MinIO.

As telas e as regras de negócio continuam **as mesmas da Clara**. O código do v2 serve só de esqueleto. Tudo o que é de imobiliária sai.

## Decisões

- **WhatsApp:** só WAHA. Baileys, Instagram, Facebook Lead Ads e Stripe ficam de fora.
- **Dados:** tudo o que está na v1 vem junto.
- **Banco:** fica com **as mesmas tabelas e colunas da Clara v1**. O Drizzle lê essa estrutura por introspecção. Assim a migração de dados é uma cópia direta, sem conversão, e a lógica pode ser portada quase linha a linha.
- **Senhas:** o Devise grava hash bcrypt, que o `bcryptjs` sabe validar. Ninguém precisa trocar de senha.
- **Anexos:** os arquivos já estão no MinIO da v1, guardados com a chave do ActiveStorage. O v2 lê as tabelas `active_storage_*` e serve os arquivos pela própria API, como o Rails já faz hoje (proxy).
- **Jobs:** os jobs do Solid Queue viram agendadores dentro do processo Node: Jueri a cada 30 min, régua de hora em hora, histórico da WAHA, mensagens agendadas e follow-up.
- **Teste:** por enquanto tudo roda local.

## Fases

| # | Fase | O que entra |
|---|------|-------------|
| 0 | Base | Repositório, remoção do domínio imobiliário, schema da Clara no Drizzle, login com os 4 perfis |
| 1 | Conversas + WAHA | Caixas de entrada, QR, webhook, envio/recebimento, mídia, áudio, transcrição, encaminhar, assinatura, pesquisa, mensagens agendadas, histórico da WAHA |
| 2 | Carteira | Revendedoras Ativas/Inativas, Contatos, Detalhe, multi-telefone, campos personalizados, etiquetas, notas, atribuição em lote, Times de Vendas |
| 3 | Jueri + régua | Sync (cadastro, pedidos, reconciliação), webhook do Jueri, avanço automático da régua, gatilhos da régua, Pedidos Pendentes, Atacado |
| 4 | Operação | Tarefas, Agendamentos/Calendário, Atividades, Dashboard, Gerencial, Relatórios, Kanban/Pipelines, Fluxos, Chat da Equipe, Notificações/Push, Templates, Configurações, Manual |
| 5 | Dados | Dump da produção → banco local, anexos do MinIO, conferência de contagens |
| 6 | Validação | Comparar a v1 com a v2 tela por tela, usando os dados reais |

## Inventário da v1 (o checklist)

**Telas Vue:**
- Conversas
- DashboardLayout
- Dashboard
- RevendedorasAtivas
- RevendedorasInativas
- Contacts
- ContactDetails
- TodosLeadsView
- TarefasView
- Calendario
- AtividadesView
- GerencialView
- Reports
- Kanban
- PipelineBoard
- PipelineAutomation
- ReguaAutomation
- FluxosView
- FluxoBuilder
- FluxoNovo
- PedidosPendentes
- AtacadoView
- TeamChat
- Agents
- AgentForm
- SettingsInboxes
- SettingsInboxDetail
- NewInbox
- settings/Account
- settings/ContactFieldGroups
- settings/MessageTemplates
- settings/SalesTeams
- settings/Tags
- Manual
- Login
- ForgotPassword
- ResetPassword

**Tabelas que vêm junto:**
- accounts
- users
- contacts
- reseller_phones
- contact_audit_events
- contact_field_groups
- contact_tags
- tags
- conversations
- conversation_tags
- messages
- message_templates
- scheduled_messages
- notes
- notifications
- push_subscriptions
- inboxes
- inbox_members
- internal_messages
- pedidos
- tarefas
- agendamentos
- jueri_activities
- lifecycle_events
- regua_triggers
- pipelines
- pipeline_stages
- pipeline_cards
- pipeline_triggers
- flows
- flow_nodes
- flow_edges
- flow_runs
- round_robin_groups
- sales_teams
- sales_team_memberships
- global_settings
- active_storage_*

**Tabelas que ficam de fora:** `solid_queue_*`, `solid_cache_*`, `solid_cable_*` e `support_ticket*`.
