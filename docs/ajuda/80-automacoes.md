---
titulo: Automações, robôs e IA
grupo: Administração
perfis: Diretoria
resumo: Gatilhos dos funis (Automatize), robôs de mensagem, Agente de IA, modelos, etiquetas, campos e motivos de perda.
---
# Automações, robôs e IA

## Gatilhos dos funis (Automatize)

Cada funil tem o botão **Automatize**. Nele, cada etapa pode ter **gatilhos**: regras do tipo **"quando acontecer X, faça Y"**.

![Adicionar gatilho](/ajuda/funis-gatilho.png)
*Um gatilho tem: quando roda, quanto tempo espera, o que faz e (opcional) para quem.*

**Quando roda (Executar):**
- quando a cliente **entra na etapa** (movida ou criada nela);
- quando a **cliente responde** no WhatsApp;
- quando a **equipe manda mensagem** (pelo CRM ou pelo celular);
- num **horário agendado** (todo dia, toda semana…);
- **antes ou depois de uma data** da cliente (ex.: 1 dia antes da data de agendamento).

**Depois de:** (para "entrar na etapa") espera um tempo antes (ex.: 24 horas). Dá para rodar "só se a cliente não respondeu nesse tempo", por exemplo para mover para "Sem resposta".

**Ação (o que faz):** mudar a cliente de etapa, criar tarefa, concluir tarefas, criar nota, colocar ou tirar etiqueta, preencher um campo, trocar o responsável, copiar a cliente para outro funil, **iniciar um robô** (é assim que o gatilho manda mensagem no WhatsApp) e ligar ou desligar o Agente de IA.

**Condições (opcional):** o gatilho só roda se a cliente bater com a condição (ex.: tem a etiqueta VIP).

> **Aplicar a todos os leads já nesta etapa:** marque para o gatilho valer também para quem já estava na etapa quando ele foi criado. Cada cliente recebe o gatilho uma vez só.

> **Prazo das tarefas:** prazo 0 = vence no fim do dia. Para "imediatamente", escolha a opção própria.

## Robôs (Salesbot)

Em **Automações** ficam os **robôs**: sequências de mensagens com perguntas e respostas (ex.: confirmar agendamento, pesquisa de satisfação). Um robô pode ser iniciado por um gatilho, por um disparo ou manualmente na conversa (**••• › Executar robô**).

## Agente de IA

Em **Agente de IA** fica o atendimento automático com inteligência artificial: ele responde as clientes de um número seguindo as instruções e a base de conhecimento cadastradas, e pode executar ações no CRM (mover etapa, criar tarefa…).

- Quando alguém da equipe responde a conversa (pelo CRM ou pelo celular), a IA **pausa** naquela conversa.
- A chave da OpenAI é cadastrada em **Agente de IA › Chave da OpenAI**.

## Cadastros auxiliares

Em **Configurações**:

| Item | Para que serve |
|---|---|
| **Modelos de mensagem** | Textos prontos usados com **/** na conversa. |
| **Tags** | Etiquetas para marcar clientes (VIP, Indicação, Cobrança…). |
| **Campos e grupos** | Campos da ficha da cliente. Um campo pode ser **obrigatório** para entrar numa etapa. |
| **Motivos de perda** | Opções ao marcar uma venda como perdida. |
| **Grupos de usuários** | Times de vendas. |
