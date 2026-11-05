-- Empresa de DEMONSTRAÇÃO pro Manual do sistema (prints de docs/ajuda). SÓ LOCAL — nomes e números fictícios.
-- Apaga conversas/contatos/tarefas/cards do banco LOCAL e recria um cenário completo.
--   docker exec -i clara-v2-postgres-1 psql -U clara -d clara_v2 < server/scripts/seed-demo-manual.sql
-- Pré-requisito: funis do Kommo + Consignado já criados (seed-kommo-estrutura / seed-consignado).
BEGIN;

TRUNCATE messages, conversations, conversation_tags, contact_tags, contacts, notes, notifications, tarefas,
  pipeline_cards, pipeline_trigger_runs, lifecycle_events, activity_events, contact_audit_events, pedidos,
  reseller_phones, scheduled_messages, broadcast_recipients, broadcasts, flow_runs, ai_agent_sessions,
  ai_agent_logs, agendamentos, inbox_members, internal_messages, team_chat_messages, team_chat_members, team_chats, jueri_activities, sales_goals, sales_team_memberships, push_subscriptions RESTART IDENTITY CASCADE;
DELETE FROM inboxes;
DELETE FROM tags;

-- pessoas (senha de todas: 123456 — mesmo hash da diretoria de teste)
UPDATE users SET first_name = 'Diana',    last_name = 'Souza',   role = 2 WHERE email = 'diretoria@teste.local';
UPDATE users SET first_name = 'Gabriela', last_name = 'Rocha',   role = 1 WHERE email = 'gerente@teste.local';
UPDATE users SET first_name = 'Fernanda', last_name = 'Lima',    role = 3 WHERE email = 'financeiro@teste.local';
UPDATE users SET first_name = 'Carla',    last_name = 'Mendes',  role = 0 WHERE email = 'consultor@teste.local';
DELETE FROM users WHERE email NOT IN ('diretoria@teste.local','gerente@teste.local','financeiro@teste.local','consultor@teste.local');
INSERT INTO users (account_id, email, encrypted_password, first_name, last_name, role, status, department, permissions, available_for_roundrobin, created_at, updated_at)
SELECT 1, e, (SELECT encrypted_password FROM users WHERE email = 'diretoria@teste.local'), f, l, 0, 'active', 'corretor', '{}'::jsonb, false, now(), now()
FROM (VALUES ('julia@teste.local','Júlia','Prado'), ('bruna@teste.local','Bruna','Alves')) v(e,f,l);

-- números de WhatsApp (caixas)
INSERT INTO inboxes (id, account_id, name, phone_number, provider, restrict_by_portfolio, short_name, color, entry_stage_id, created_at, updated_at) VALUES
  (1, 1, 'Consultoras Comerciais', '5511900000001', 'waha', true,  'CONSULTORAS', '#c8506a', NULL, now(), now()),
  (2, 1, 'Prospecção',             '5511900000002', 'waha', false, 'PROSPECÇÃO',  '#3b7dd8', (SELECT s.id FROM pipeline_stages s JOIN pipelines p ON p.id = s.pipeline_id WHERE p.slug = 'prospeccao' ORDER BY s.position LIMIT 1), now(), now()),
  (3, 1, 'Financeiro',             '5511900000003', 'waha', false, 'FINANCEIRO',  '#2e9e6a', NULL, now(), now());
SELECT setval(pg_get_serial_sequence('inboxes','id'), 3);

INSERT INTO inbox_members (inbox_id, user_id, created_at, updated_at)
SELECT i, u.id, now(), now() FROM (VALUES
  (1,'consultor@teste.local'), (1,'julia@teste.local'), (1,'gerente@teste.local'),
  (2,'bruna@teste.local'), (2,'consultor@teste.local'), (2,'gerente@teste.local'),
  (3,'financeiro@teste.local')) v(i,e) JOIN users u ON u.email = v.e;

INSERT INTO tags (account_id, name, color, created_at, updated_at) VALUES
  (1,'VIP','#b8860b',now(),now()), (1,'Indicação','#3b7dd8',now(),now()), (1,'Cobrança','#d9534f',now(),now());

-- revendedoras e leads
CREATE TEMP TABLE demo_c (k text, nome text, fone text, status text, dona text, jueri text, dias int);
INSERT INTO demo_c VALUES
  ('ana',     'Ana Beatriz Costa',   '5511911110001', 'revendedor_ativo', 'consultor@teste.local', 'J1001', 25),
  ('mariana', 'Mariana Ferreira',    '5511911110002', 'terceiro_dia',     'consultor@teste.local', 'J1002', 3),
  ('paula',   'Paula Ribeiro',       '5511911110003', 'decimo_dia',       'consultor@teste.local', 'J1003', 10),
  ('renata',  'Renata Oliveira',     '5511911110004', 'vigesimo_dia',     'julia@teste.local',     'J1004', 20),
  ('simone',  'Simone Batista',      '5511911110005', 'agendado',         'julia@teste.local',     'J1005', 28),
  ('tatiane', 'Tatiane Gomes',       '5511911110006', 'atrasada',         'julia@teste.local',     'J1006', 34),
  ('vanessa', 'Vanessa Martins',     '5511911110007', 'sem_maleta',       'consultor@teste.local', 'J1007', 60),
  ('lucia',   'Lúcia Andrade',       '5511911110008', 'reativacao',       'julia@teste.local',     'J1008', 90),
  ('gabi',    'Gabriela Nunes',      '5511922220001', NULL, NULL, NULL, 0),
  ('helena',  'Helena Duarte',       '5511922220002', NULL, NULL, NULL, 1),
  ('isabela', 'Isabela Freitas',     '5511922220003', NULL, NULL, NULL, 2),
  ('joana',   'Joana Pires',         '5511922220004', NULL, NULL, NULL, 4),
  ('karen',   'Karen Lopes',         '5511922220005', NULL, NULL, NULL, 6),
  ('livia',   'Lívia Moraes',        '5511933330001', NULL, NULL, NULL, 12);

INSERT INTO contacts (account_id, name, phone, jid, status, status_changed_at, user_id, id_jueri, source, custom_attributes, created_at, updated_at)
SELECT 1, d.nome, '+' || d.fone, d.fone || '@c.us', d.status, now() - (d.dias || ' days')::interval,
  (SELECT id FROM users WHERE email = d.dona), d.jueri, 'WhatsApp',
  CASE WHEN d.status IS NOT NULL THEN jsonb_build_object('limite_inicial', 1500, 'meta', 2000) ELSE '{}'::jsonb END,
  now() - ((d.dias + 30) || ' days')::interval, now()
FROM demo_c d ORDER BY d.k;

CREATE TEMP TABLE demo_id AS SELECT d.k, c.id FROM demo_c d JOIN contacts c ON c.phone = '+' || d.fone;

-- Consignado: card de cada revendedora na etapa do status
INSERT INTO pipeline_cards (pipeline_id, pipeline_stage_id, contact_id, stage_entered_at, created_at, updated_at)
SELECT s.pipeline_id, s.id, c.id, c.status_changed_at, now(), now()
FROM contacts c JOIN pipeline_stages s ON s.status_key = c.status JOIN pipelines p ON p.id = s.pipeline_id AND p.slug = 'consignado';

-- Prospecção: leads espalhados pelas etapas
INSERT INTO pipeline_cards (pipeline_id, pipeline_stage_id, contact_id, stage_entered_at, created_at, updated_at, value)
SELECT p.id, s.id, i.id, now() - interval '1 day', now(), now(), v.valor
FROM (VALUES ('gabi',0,0::numeric), ('helena',1,0), ('isabela',2,0), ('joana',3,0), ('karen',5,0)) v(k,pos,valor)
JOIN demo_id i ON i.k = v.k JOIN pipelines p ON p.slug = 'prospeccao'
JOIN LATERAL (SELECT id FROM pipeline_stages WHERE pipeline_id = p.id ORDER BY position OFFSET v.pos LIMIT 1) s ON true;

-- Varejo: uma cliente que comprou
INSERT INTO pipeline_cards (pipeline_id, pipeline_stage_id, contact_id, stage_entered_at, created_at, updated_at, value)
SELECT p.id, (SELECT id FROM pipeline_stages WHERE pipeline_id = p.id ORDER BY position OFFSET 2 LIMIT 1), i.id, now() - interval '2 days', now(), now(), 389.90
FROM demo_id i JOIN pipelines p ON p.slug = 'varejo' WHERE i.k = 'livia';

-- conversas (k, caixa, atendente, minutos atrás, não lidas)
CREATE TEMP TABLE demo_conv (k text, caixa int, atendente text, min int, naolidas int);
INSERT INTO demo_conv VALUES
  ('ana',1,'consultor@teste.local',8,2), ('mariana',1,'consultor@teste.local',35,0), ('paula',1,'consultor@teste.local',120,0),
  ('renata',1,'julia@teste.local',15,1), ('simone',1,'julia@teste.local',300,0), ('tatiane',3,'financeiro@teste.local',50,1),
  ('tatiane',1,'julia@teste.local',1500,0),
  ('gabi',2,'bruna@teste.local',5,1), ('helena',2,'bruna@teste.local',60,0), ('isabela',2,NULL,180,1), ('joana',2,'consultor@teste.local',1440,0),
  ('karen',2,'bruna@teste.local',2880,0), ('livia',3,'financeiro@teste.local',600,0);
INSERT INTO conversations (account_id, contact_id, inbox_id, user_id, status, unread_count, source, last_activity_at, created_at, updated_at)
SELECT 1, i.id, v.caixa, (SELECT id FROM users WHERE email = v.atendente), 0, v.naolidas, 'whatsapp',
  now() - (v.min || ' minutes')::interval, now() - interval '40 days', now()
FROM demo_conv v JOIN demo_id i ON i.k = v.k;

-- mensagens (k, caixa, quem: C=cliente U=equipe, minutos atrás, texto)
CREATE TEMP TABLE demo_msg (k text, caixa int, quem text, min int, txt text);
INSERT INTO demo_msg VALUES
  ('ana',1,'U',60,'Oi Ana! Tudo bem? Chegaram as peças novas da coleção de verão 💛'),
  ('ana',1,'C',12,'Oii! Que lindo, me manda as fotos dos brincos?'),
  ('ana',1,'C',8,'E queria saber se dá pra trocar 2 peças da maleta'),
  ('mariana',1,'U',90,'Oi Mariana, já é o 3º dia da sua maleta! Conseguiu ver o catálogo?'),
  ('mariana',1,'C',40,'Consegui sim, já vendi 3 peças 😍'),
  ('mariana',1,'U',35,'Que demais! Parabéns! Qualquer dúvida é só chamar'),
  ('paula',1,'U',180,'Oi Paula! Hoje é o 10º dia, como estão as vendas?'),
  ('paula',1,'C',120,'Tá indo bem, mas o movimento caiu essa semana'),
  ('renata',1,'U',60,'Renata, já estamos no 20º dia! Vamos agendar o acerto?'),
  ('renata',1,'C',15,'Pode ser sexta às 14h?'),
  ('simone',1,'U',300,'Simone, seu acerto ficou agendado pra amanhã às 10h ✅'),
  ('tatiane',1,'U',1500,'Tatiane, seu acerto venceu ontem. Consegue vir essa semana?'),
  ('tatiane',3,'U',80,'Olá Tatiane, aqui é a Fernanda do financeiro da Clara. Identificamos um valor em aberto do último acerto.'),
  ('tatiane',3,'C',50,'Oi Fernanda, consigo pagar no Pix até sexta'),
  ('gabi',2,'U',30,'Oi Gabriela, tudo bem? Me chamo Bruna, sou da Clara Ferreira Semijoias 💖 Queria te apresentar uma oportunidade de renda extra. Você teria interesse?'),
  ('gabi',2,'C',5,'Sim! Como funciona?'),
  ('helena',2,'U',90,'Oi Helena! Vi que você se interessou pela revenda. Posso te explicar?'),
  ('helena',2,'C',60,'Pode sim, trabalho em loja e queria uma renda a mais'),
  ('isabela',2,'C',180,'Boa tarde, vi o anúncio de vocês no Instagram'),
  ('joana',2,'U',1440,'Joana, te mandei o formulário de cadastro, conseguiu preencher?'),
  ('karen',2,'U',2880,'Karen, seu cadastro foi aprovado! 🎉 Vamos agendar o início?'),
  ('livia',3,'U',600,'Olá Lívia! Seu pagamento de R$ 389,90 foi confirmado. Obrigada pela compra!');
INSERT INTO messages (account_id, conversation_id, sender_type, sender_id, text, status, source_id, is_private, created_at, updated_at)
SELECT 1, cv.id, CASE m.quem WHEN 'C' THEN 'Contact' ELSE 'User' END,
  CASE m.quem WHEN 'C' THEN i.id ELSE coalesce(cv.user_id, (SELECT id FROM users WHERE email='gerente@teste.local')) END,
  m.txt, CASE m.quem WHEN 'C' THEN 1 ELSE 2 END, 'demo_' || md5(m.txt), false,
  now() - (m.min || ' minutes')::interval, now() - (m.min || ' minutes')::interval
FROM demo_msg m JOIN demo_id i ON i.k = m.k JOIN conversations cv ON cv.contact_id = i.id AND cv.inbox_id = m.caixa;

-- etiquetas
INSERT INTO contact_tags (contact_id, tag_id) SELECT i.id, t.id FROM (VALUES ('ana','VIP'), ('helena','Indicação'), ('tatiane','Cobrança')) v(k,n) JOIN demo_id i ON i.k = v.k JOIN tags t ON t.name = v.n;

-- tarefas
INSERT INTO tarefas (account_id, contact_id, user_id, tipo, titulo, descricao, status, prioridade, vencimento_em, created_at, updated_at)
SELECT 1, i.id, (SELECT id FROM users WHERE email = v.e), v.tipo, v.titulo, v.descr, 'pendente', v.prio, now() + (v.h || ' hours')::interval, now() - interval '1 day', now()
FROM (VALUES
  ('mariana','consultor@teste.local','terceiro_dia','3º Dia — mensagem de incentivo','Mandar mensagem de incentivo · Perguntar se conseguiu ver o catálogo','normal',4),
  ('paula','consultor@teste.local','decimo_dia','10º Dia — acompanhar vendas','Ver como estão as vendas · Ajudar a divulgar','normal',-20),
  ('renata','julia@teste.local','vigesimo_dia','20º Dia — agendar acerto','Agendar acerto · Pegar encomendas para o próximo mês','alta',2),
  ('tatiane','financeiro@teste.local','manual_outro','Cobrar valor em aberto do acerto','Combinar o Pix até sexta','urgente',-3),
  ('gabi','bruna@teste.local','manual_acompanhamento','Explicar como funciona a revenda','Mandar o vídeo de apresentação e o formulário','normal',1),
  ('helena','bruna@teste.local','manual_acompanhamento','Ligar para a Helena','Ela prefere ligação depois das 18h','normal',6)
) v(k,e,tipo,titulo,descr,prio,h) JOIN demo_id i ON i.k = v.k;

COMMIT;

-- modelos de mensagem (usados com "/" na conversa)
DELETE FROM message_templates;
INSERT INTO message_templates (account_id, nome, categoria, mensagem, created_at, updated_at) VALUES
  (1, 'Apresentação', 'Prospecção', 'Oi, tudo bem? Me chamo Carla, sou da Clara Ferreira Semijoias 💖 Queria te apresentar uma oportunidade de renda extra. Você teria interesse?', now(), now()),
  (1, 'Agendar acerto', 'Consignado', 'Oi! Já estamos chegando no fim do ciclo da sua maleta. Qual o melhor dia e horário pra fazermos o acerto?', now(), now()),
  (1, 'Pix confirmado', 'Financeiro', 'Recebemos o seu pagamento, obrigada! Qualquer dúvida estou à disposição.', now(), now());
