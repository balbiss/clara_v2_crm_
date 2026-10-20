# Checklist da documentação do Kommo → Clara v2

Fonte: o índice completo da base de conhecimento (support.kommo.com/llms.txt), lido em 20/10/2026.
O dono pediu tudo igual ao Kommo, no visual e nas funções.
Legenda: ✅ feito e testado no navegador · 🟡 feito, falta teste · ⬜ falta · ⛔ fora (motivo ao lado).

Decisões que já existiam e continuam valendo: o WhatsApp é só pela WAHA. Instagram, Facebook, Stripe e TikTok ficaram fora do Clara v2 por decisão do dono em 15/10. Se ele quiser essas integrações, é preciso confirmar com ele antes.

## Interface
- ✅ Menu lateral do Kommo (Início, Comunicações, Pipelines, Calendário, Listas, Automações, Insights; Configurações / Ajuda / Notificações embaixo)
- ✅ Padrão visual do Kommo na base (fonte PT Sans, paleta, botões, janelas, tabelas, tags) em todas as telas
- ⬜ Telas com layout próprio do Kommo ainda por fazer: Início, Contatos/Listas (tabela), Configurações (menu de configurações próprio), Consignado

## Pipelines
- ✅ Quadro Kanban: colunas com "N leads: R$", cards, arrastar, zonas de Venda perdida (com motivo) / Venda ganha / Excluir, busca, Novo lead, adição rápida
- ✅ Etapas: criar, renomear, cor, dicas (check-list), excluir (os leads vão pra outra etapa)
- ✅ Ganho/perdido com motivo de perda
- ⬜ Funis: reordenar (⋯ › Reordenar), arquivar e restaurar, excluir só funil vazio, modelos de funil
- ⬜ "Editar funil": arrastar etapa pela alça, ×, Salvar; ligar/desligar a Etapa de leads de entrada; renomear ganho/perdido
- ⬜ Visualização em lista (ícone ≡) + "Selecionar vários" + ações em massa (responsável, tarefas, etapa, excluir, tags)
- ⬜ Filtros prontos (Ativos, Meus, Ganhos, Perdidos, Sem tarefas, Tarefas atrasadas) + filtro por campo/tag/responsável
- ⬜ Permissões por funil/etapa por usuário

## Funil Digital (Automatize)
- ✅ Gatilhos: ao entrar ou ser criado, depois de X, quando o cliente responde, agendado (diário, semanal, data), relativo a campo de data, com condições
- ✅ Ações: mudar etapa (inclusive pra outro funil), tarefa, concluir tarefas, alterar campo, tags (+/−), responsável, nota, webhook, IA liga/pausa, robô
- ⬜ "Aplicar aos leads que já estão na etapa"
- ⬜ Tarefa: prazo com atalhos (Imediatamente, Fim do dia, Em 1 dia, Em 3 dias, Fim da semana) e "Para: responsável do lead / usuário X"
- ⬜ Concluir tarefas: filtro por tipo e por prazo (atrasadas, hoje, amanhã) + comentário
- ⬜ Criar lead (copiar para outro funil/etapa)
- ⬜ Robô: horário de atividade (24/7 ou fora do expediente)
- ⛔ Enviar e-mail, gerar formulário, apagar arquivos (o CRM não tem e-mail nem formulários)

## Leads, contatos e empresas
- ✅ Card do lead: painel escuro, abas = grupos de campos, campos com tipo, #tags, funil › etapa (dias) + barra
- ✅ Campos do Kommo: os 57 campos da Clara com tipo e opções; painel "Campos e grupos" copiado da conta de teste (grupos em pílulas, edição dentro da lista, 16 tipos com os nomes do Kommo, opções arrastáveis, Apenas API, Visível, Obrigatório para etapas com as etapas coloridas, Arquivo com upload)
- ✅ Campo obrigatório bloqueia a mudança de etapa (funil e régua)
- ⬜ Página do lead aberta pelo funil (/leads/:id) com o mesmo card + histórico
- ⬜ Lista de contatos em tabela do Kommo (colunas configuráveis, seleção, ações em massa, filtros)
- ⬜ Empresas
- ⬜ Importar e exportar (CSV/XLS)
- ⬜ Controle de duplicados + mesclar (mesclar já existe na v1)
- ⬜ Tags: tela de gerenciar (renomear, excluir, mesclar)

## Calendário, tarefas e agendamentos
- ✅ Calendário dia/semana/mês, Meus eventos/Todos, filtro, ⋯, configurações, novo/editar/excluir evento com lead
- ✅ Quadro de tarefas (Atrasadas/Hoje/Amanhã/Semana/Depois) e lista de tarefas; concluir com resultado
- ⬜ Formulário de tarefa do Kommo: atalhos de prazo, "Para", tipo, comentário, "Definir"
- ⬜ Gerenciar tipos de evento/tarefa (Calendário › ⋯)
- ⬜ Booking (página e links de agendamento)

## Comunicação
- ✅ Inbox de chat no layout do Kommo (lista | card | histórico), nota, tarefa, fechar conversa, colocar em espera, resumo, modelos, áudio, anexos, encaminhar
- ✅ Chat da equipe (já existe na v1/v2, falta o visual do Kommo)
- 🟡 Modelos de mensagem (existem; falta o visual do Kommo)
- ⬜ Placeholders nas mensagens ({{lead.nome}} etc.)
- ⛔ Mail (sem caixa de e-mail no projeto)

## Salesbot / Robôs
- ⬜ Construtor visual (os 9 nós da v1 + condição sobre a conversa, fechar conversa, botões com tempo de espera, nota interna, preencher campo)
- ⬜ Recriar os 4 robôs ativos da Clara e religar os gatilhos
- ⬜ Modelos, interrupções, estatísticas por bloco, Round Robin

## Marketing
- ⬜ Transmissões (broadcast pelo WhatsApp da WAHA)
- ⬜ Segmentos
- ⬜ Formulário web (webform) que cria lead
- ⬜ Botão de chat no site
- ⛔ Anúncios Meta/TikTok, CAPI (fora por decisão do dono)

## Análises
- ⬜ Início/Painel com widgets (mensagens, conversas, tempo de resposta, leads ganhos/ativos/perdidos/sem tarefa)
- ⬜ Estatísticas de ganho/perda, consolidado, desempenho da equipe, atividades, metas
- ⬜ NPS (robô)

## Administração
- ✅ Usuários, perfis (4 perfis da v1), times de vendas
- ⬜ Permissões no padrão do Kommo (ver / editar / excluir / exportar: só os meus × todos, por entidade e por etapa)
- ⬜ Configurações no layout do Kommo: menu próprio (Perfil · Configurações de trabalho · de chat · de email · Gestão de usuários · IA · Fontes de conhecimento · Central de integrações), fuso, moeda, formato de data/hora/nome, acesso por país
- ⬜ Segurança: sessões ativas, verificação em 2 etapas

## IA
- ⬜ Agente de IA (há um gancho na v2, o dono quer em fase futura), resumo da conversa (✅ já existe), sugestões de resposta

## Integrações
- ⛔ Marketplace de integrações (Shopify, Zapier etc.). Webhook genérico ✅ no Automatize
