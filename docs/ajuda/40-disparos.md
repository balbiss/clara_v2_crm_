---
titulo: Disparos (mensagem para várias pessoas)
grupo: Dia a dia
perfis: Gerente, Diretoria (e quem tiver a permissão)
resumo: Como mandar a mesma mensagem para várias clientes com segurança, sem o número ser bloqueado.
---
# Disparos

O disparo manda **a mesma mensagem para várias clientes**, uma de cada vez, com intervalo entre os envios para **proteger o número** de bloqueio do WhatsApp.

Fica em **Comunicações › Disparos › Novo disparo**.

![Novo disparo](/ajuda/disparos-novo.png)
*O disparo tem 4 passos: para quem, mensagem, número e quando.*

## Passo a passo

1. **Para quem:** filtre as clientes pelo **status da maleta**, pela **etapa de funil**, por **etiqueta** (tem / não tem), pela **carteira** de uma pessoa ou pela **cidade**. Embaixo aparece quantas pessoas vão receber. Também dá para colar uma **lista de números**.
2. **Mensagem:** escreva o texto. Pode anexar foto ou vídeo, ou rodar um robô. Para a mensagem ficar pessoal (e não parecer disparo), use:
   - `{primeiro_nome}` ou `{nome}`: o nome da cliente. Ex.: "Oi {primeiro_nome}!" vira "Oi Ana!".
   - `{consultora}`: o nome da responsável pela cliente.
   - `{Oi|Olá|Oii}`: o CRM sorteia uma das opções para cada pessoa, assim as mensagens não ficam todas iguais.
3. **Número:** escolha por qual número de WhatsApp vai sair.
4. **Quando:** agora ou num dia e horário.

Depois de criado, o disparo mostra o andamento: **enviadas**, **na fila**, **falharam** e **responderam**.

## Proteção contra bloqueio (automática)

O CRM cuida disso sozinho:

- **Uma mensagem de cada vez**, com intervalo entre elas e "digitando…" antes de cada uma, como uma pessoa.
- **Limite por dia que cresce com o tempo** (aquecimento do número): começa com 20 por dia e vai subindo até **150 por dia**.
- **Cliente "fria"** (que nunca escreveu para a loja): no máximo **30 por dia** por número, com 2 a 5 minutos entre elas.
- **Pausa de 10 a 20 minutos a cada 12 envios.**
- Se o número cair, o disparo **pausa sozinho**.
- Quem responde "parar", "sair" ou "não quero mais" ganha uma etiqueta e sai das próximas listas. Se muita gente pedir para sair no mesmo disparo, ele **pausa sozinho** (sinal de que a lista está incomodando).

> Grupos, contatos bloqueados e quem pediu para não receber ficam de fora sozinhos.

## Consultora com permissão de disparo

A diretoria pode liberar disparos para uma consultora (no cadastro dela, **Fazer disparos**). Nesse caso ela:

- dispara **só para a própria carteira**;
- só pelos **números em que está cadastrada**;
- tem limite de **200 por dia** e no mínimo **30 segundos** entre envios;
- vê só os disparos que ela mesma fez.
