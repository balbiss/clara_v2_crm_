# Kommo → Clara v2: o que falta pra ficar igual

O Kommo da Clara foi mapeado em 20/10/2026. O mapeamento completo está em `C:\Users\inoov\kommo-clara-mapeamento\MAPEAMENTO_KOMMO_CLARA.md`.
O v1 já foi construído à imagem do Kommo: régua = funil Consignado, `pipelines` + `pipeline_triggers` = "Automatize", `flows` = Salesbot. Este arquivo lista **só o que o Kommo tem a mais** e precisa entrar no v2, além da paridade v1 (ver PARIDADE_V1_V2.md).

## 1. Gatilhos (pipeline_triggers / regua_triggers)
| Kommo | v1 | Falta |
|---|---|---|
| Ao entrar na etapa (+ atraso em horas) | ✅ `event=enter` + `delay_minutes` | — |
| Quando o cliente responde | ✅ `client_reply` | — |
| Relativo a campo de data (X h **antes/depois** de "Data de Agendamento") | ⬜ | novo evento `date_field` (campo + offset ±min) |
| Agendado: diariamente às HH:MM / semanal (dia + hora) / data fixa | ⬜ | novo evento `schedule` (cron simples), roda pra todo card na etapa |
| Condição no gatilho (só se campo = valor, ex. Onboarding = 1º mês) | ⬜ | `config.conditions[]` avaliado antes de executar |
| "Ao entrar **ou ser criado** nesta etapa" | parcial | criar card já dispara `enter` |

## 2. Ações
| Kommo | v1 | Falta |
|---|---|---|
| Mudar etapa (inclusive **para outro funil**) | `move_stage` (mesmo funil) | aceitar `pipeline_id` de destino |
| Criar tarefa (tipo + texto) | ✅ | tipos de tarefa configuráveis |
| Concluir todas as tarefas abertas | ⬜ | `complete_tasks` |
| Alterar / limpar campo | ⬜ | `set_field` (campo personalizado, valor ou vazio) |
| Adicionar / remover etiquetas | ⬜ (só no fluxo) | `add_tags` / `remove_tags` |
| Executar robô | ✅ `start_flow` | — |
| Alterar responsável, nota, webhook, IA | ✅ | — |

## 3. Robôs (flows)
O v1 tem trigger, send_message, ask_question, send_media, options, condition, wait, action e end. Falta:
- condição sobre a **conversa** (`status` aberta/fechada, lida/não lida) e sobre **campo do lead**
- ação **fechar conversa** (`close_conversation`) e **nota interna**
- botões com **timeout de sem resposta** (o wait+options já cobre quase tudo, só falta conferir)
- variáveis de campo na mensagem (`{Data de Agendamento}`)
- recriar os 4 robôs ativos: Confirma Agendamento, Encerra por falta de interação, Pesquisa de satisfação + Pós-pesquisa, Estrelas

## 4. Funis e leads
- Funis do Kommo além do Consignado: **Varejo, Onboarding, Atacado e Prospecção**, que viram `pipelines` com as etapas e os gatilhos já mapeados
- Ganho/perdido com **motivo de perda** obrigatório (Desqualificado, Fora do estado, Contato interno, Não é lead)
- Card do Kanban: soma R$ por coluna, indicador de tarefa atrasada (dias), checklist no topo da coluna (o v2 já tem checklist no Consignado)
- Campos do lead em abas (Principal/Dados/Financeiro), via `contact_field_groups`. Recriar os ~50 campos do Kommo

## 5. Outros
- Tipos de tarefa: Relacionamento, Onboarding, Agendamento, Reativação, Cobrança, Agendar Novas, Acompanhamento, Repescagem, Análise de Form.
- Painel de atividades: mensagens recebidas, conversas em andamento/não respondidas, tempo de resposta, leads ganhos/perdidos/sem tarefa
- Importação dos ~2.053 leads e 2.268 contatos do Kommo (via API v4 com token, ou exportação CSV)

## Andamento
- **20/10/2026**
  - Feito: migration `0001_funis_kommo`, motor `server/src/lib/pipelines.ts` (gatilhos ao entrar, com atraso, quando o cliente responde, agendado, por data e com condição; 12 ações), rotas `routes/pipelines.ts`, estrutura do Kommo (`scripts/seed-kommo-estrutura.ts`: 4 funis, 37 gatilhos, motivos de perda, etiquetas, campos) e teste `tests/e2e-funis.mjs` (13/13).
  - Visual do Kommo no app inteiro (pedido do dono, porque a equipe já conhece o Kommo). Prontos: casca/menu lateral (`AppShell` + `lib/navKommo.ts`), Funil (`pages/Funis.tsx`) e Automatize (`pages/FunilAutomatize.tsx`). Estilos em `lib/kommo.ts`.
  - Próximas telas no visual do Kommo: card do lead, Consignado (régua), Conversas, Contatos/Listas, Calendário/Tarefas, Início, Configurações. Depois os Robôs (Salesbot).
