-- Conversas que o cliente respondeu depois de fechadas ficavam escondidas (só reabria com IA ligada).
-- Reabre as dos últimos 7 dias cuja última mensagem é do cliente e ainda está sem ler.
UPDATE conversations c SET status = 0, snoozed_until = NULL
WHERE c.status IN (2, 3) AND coalesce(c.unread_count, 0) > 0
  AND c.last_activity_at > now() - interval '7 days'
  AND NOT EXISTS (SELECT 1 FROM contacts ct WHERE ct.id = c.contact_id AND (ct.status = 'grupo' OR coalesce(ct.jid, '') LIKE '%@g.us'))
  AND (SELECT m.sender_type FROM messages m WHERE m.conversation_id = c.id AND m.is_private = false ORDER BY m.created_at DESC, m.id DESC LIMIT 1) = 'Contact';
