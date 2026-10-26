-- Suspensa por atraso agora é etapa das ATIVAS: no funil Consignado fica logo depois de Atrasada.
UPDATE "pipeline_stages" s SET "position" = o.pos
FROM (VALUES ('revendedor_ativo',0),('terceiro_dia',1),('decimo_dia',2),('vigesimo_dia',3),('agendado',4),('reagendar',5),('atrasada',6),('suspensa_atraso',7),
             ('sem_maleta',8),('inativa_pendencia',9),('negativado_juridico',10),('resgate',11),('reativacao',12),('descadastrada',13)) AS o(k, pos)
WHERE s."status_key" = o.k;
