-- RFC12/RFC13: prazos da conferencia e da disputa, estado observado, consulta
-- de pagamentos retidos por status e periodo e exclusao de retencao registrada por erro
-- (RFS37 a RFS39, RFS42 e RFS44). Executar depois de schema-rfc12-rfc13.sql.
-- Aditivo: pode ser executado mais de uma vez.
begin;

-- prazos padrao em dias: conferencia apos o recebimento (declarado no aceite) e decisao da disputa (RFS39)
insert into public.parametros (chave, valor) values ('prazo_conferencia_dias', 7), ('prazo_disputa_dias', 5)
on conflict (chave) do nothing;

alter table public.transacoes add column if not exists prazo_conferencia_dias integer;
alter table public.transacoes add column if not exists conferencia_ate timestamptz;
alter table public.transacoes add column if not exists decisao_ate timestamptz;
alter table public.transacoes add column if not exists estado_observado text;
alter table public.transacoes drop constraint if exists transacoes_prazo_conferencia_check;
alter table public.transacoes add constraint transacoes_prazo_conferencia_check
  check (prazo_conferencia_dias is null or prazo_conferencia_dias between 1 and 30);

-- transacoes ja aceitas antes desta migracao recebem o prazo padrao
update public.transacoes set prazo_conferencia_dias = 7
where prazo_conferencia_dias is null and status in ('aceita', 'paga', 'enviada', 'em_conferencia', 'contestada');
update public.transacoes set conferencia_ate = recebida_em + make_interval(days => prazo_conferencia_dias)
where conferencia_ate is null and recebida_em is not null and prazo_conferencia_dias is not null;
update public.transacoes set decisao_ate = conferida_em + interval '5 days'
where decisao_ate is null and status = 'contestada' and conferida_em is not null;

create or replace function public.parametro_dias(p_chave text, p_padrao integer)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select valor::integer from public.parametros where chave = p_chave), p_padrao);
$$;
revoke all on function public.parametro_dias(text, integer) from public, anon, authenticated;

-- situacao do prazo em aberto: conferencia (em_conferencia) ou decisao da disputa (contestada)
create or replace function public.prazo_situacao(p_limite timestamptz)
returns text language sql stable set search_path = public as $$
  select case
    when p_limite is null then null
    when p_limite < now() then 'vencido'
    when p_limite < now() + interval '2 days' then 'proximo'
    else 'no prazo'
  end;
$$;
grant execute on function public.prazo_situacao(timestamptz) to authenticated;

create or replace view public.vw_transacoes as
select t.id, t.peca_id, p.nome as peca_nome, p.categoria,
  t.comprador_id, c.nome as comprador_nome, t.vendedor_id, v.nome as vendedor_nome,
  t.valor, t.status, t.comissao, t.motivo_cancelamento, t.transferencia_pendente,
  t.criado_em, t.atualizado_em, t.confirmada_em, t.cancelada_em,
  t.aceita_em, t.enviada_em, t.recebida_em, t.conferida_em, t.rastreio, t.motivo_contestacao,
  t.resolucao, t.resolvida_em, pg.status as pagamento_status, pg.retido_em, pg.liberado_em, pg.estornado_em,
  case when t.comprador_id = auth.uid() and not public.is_admin() then null else pg.repasse end as repasse,
  t.prazo_conferencia_dias, t.conferencia_ate, t.decisao_ate, t.estado_observado,
  case t.status when 'em_conferencia' then t.conferencia_ate when 'contestada' then t.decisao_ate end as prazo_limite,
  public.prazo_situacao(case t.status when 'em_conferencia' then t.conferencia_ate when 'contestada' then t.decisao_ate end) as prazo_situacao
from public.transacoes t join public.pecas p on p.id = t.peca_id
join public.perfis c on c.id = t.comprador_id join public.perfis v on v.id = t.vendedor_id
left join public.pagamentos_retidos pg on pg.transacao_id = t.id
where t.comprador_id = auth.uid() or t.vendedor_id = auth.uid() or public.is_admin();

-- RFS37: o vendedor declara o prazo de conferencia ao aceitar a proposta
drop function if exists public.confirmar_transacao(bigint);
create or replace function public.confirmar_transacao(p_id bigint, p_prazo_dias integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype; v_prazo integer;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.vendedor_id is distinct from auth.uid() then raise exception 'Somente o vendedor aceita a proposta' using errcode = '42501'; end if;
  if v_t.status <> 'pendente' then raise exception 'Somente propostas pendentes podem ser aceitas' using errcode = 'P0001'; end if;
  v_prazo := coalesce(p_prazo_dias, public.parametro_dias('prazo_conferencia_dias', 7));
  if v_prazo not between 1 and 30 then
    raise exception 'O prazo de conferência deve ser de 1 a 30 dias' using errcode = 'P0001';
  end if;
  update public.transacoes set status = 'aceita', aceita_em = now(), prazo_conferencia_dias = v_prazo, atualizado_em = now() where id = p_id;
end;
$$;

-- RFS37: o recebimento abre o prazo de conferencia declarado na transacao
create or replace function public.receber_entrega(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.comprador_id is distinct from auth.uid() then raise exception 'Somente o comprador confirma o recebimento' using errcode = '42501'; end if;
  if v_t.status <> 'enviada' then raise exception 'Registre o envio antes do recebimento' using errcode = 'P0001'; end if;
  update public.transacoes set status = 'em_conferencia', recebida_em = now(),
    conferencia_ate = now() + make_interval(days => coalesce(v_t.prazo_conferencia_dias, public.parametro_dias('prazo_conferencia_dias', 7))),
    atualizado_em = now() where id = p_id;
end;
$$;

-- RFS39: a contestacao so e aceita dentro do prazo e abre o prazo de decisao do administrador.
-- A aprovacao continua possivel depois do prazo, porque so beneficia o vendedor.
drop function if exists public.conferir_entrega(bigint, boolean, text);
create or replace function public.conferir_entrega(p_id bigint, p_aprovada boolean, p_motivo text default null, p_estado text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.comprador_id is distinct from auth.uid() then raise exception 'Somente o comprador confere a entrega' using errcode = '42501'; end if;
  if v_t.status <> 'em_conferencia' then raise exception 'Confirme o recebimento antes de conferir a entrega' using errcode = 'P0001'; end if;
  if p_aprovada is null then raise exception 'Informe o resultado da conferencia' using errcode = 'P0001'; end if;
  if length(coalesce(p_estado, '')) > 1000 then raise exception 'Estado observado: máximo de 1000 caracteres' using errcode = 'P0001'; end if;
  update public.transacoes set estado_observado = nullif(trim(p_estado), '') where id = p_id;
  if p_aprovada then
    perform public.concluir_venda_conferida(p_id);
  else
    if v_t.conferencia_ate is not null and v_t.conferencia_ate < now() then
      raise exception 'O prazo de conferência terminou em %. A entrega não pode mais ser contestada',
        to_char(v_t.conferencia_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') using errcode = 'P0001';
    end if;
    if coalesce(length(trim(p_motivo)), 0) not between 1 and 1000 then raise exception 'Informe o motivo da contestacao (ate 1000 caracteres)' using errcode = 'P0001'; end if;
    update public.transacoes set status = 'contestada', motivo_contestacao = trim(p_motivo), conferida_em = now(),
      decisao_ate = now() + make_interval(days => public.parametro_dias('prazo_disputa_dias', 5)),
      atualizado_em = now() where id = p_id;
  end if;
end;
$$;

-- O administrador decide a disputa e, vencido o prazo de conferencia sem resposta do comprador,
-- pode liberar o pagamento retido (nao ha liberacao automatica).
create or replace function public.resolver_contestacao(p_id bigint, p_decisao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  if not public.is_admin() then raise exception 'Somente o administrador resolve contestacoes' using errcode = '42501'; end if;
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if p_decisao is null or p_decisao not in ('liberar', 'estornar') or coalesce(length(trim(p_motivo)), 0) not between 1 and 1000 then
    raise exception 'Informe decisao e justificativa (ate 1000 caracteres)' using errcode = 'P0001';
  end if;
  if v_t.status = 'em_conferencia' then
    if v_t.conferencia_ate is null or v_t.conferencia_ate >= now() then
      raise exception 'A conferência ainda está no prazo do comprador' using errcode = 'P0001';
    end if;
    if p_decisao <> 'liberar' then
      raise exception 'Sem contestação, o prazo vencido só permite liberar o pagamento' using errcode = 'P0001';
    end if;
  elsif v_t.status <> 'contestada' then
    raise exception 'A transacao nao possui contestacao pendente' using errcode = 'P0001';
  end if;
  update public.transacoes set resolucao = trim(p_motivo), resolvida_por = auth.uid(), resolvida_em = now() where id = p_id;
  if p_decisao = 'liberar' then
    perform public.concluir_venda_conferida(p_id);
  else
    update public.pagamentos_retidos set status = 'estornado', estornado_em = now() where transacao_id = p_id and status = 'retido';
    if not found then raise exception 'Pagamento nao esta retido' using errcode = 'P0001'; end if;
    update public.transacoes set status = 'cancelada', motivo_cancelamento = 'Contestacao: ' || trim(p_motivo),
      cancelada_em = now(), cancelada_por = auth.uid(), atualizado_em = now() where id = p_id;
    update public.pecas set em_negociacao = false, atualizado_em = now() where id = v_t.peca_id;
  end if;
end;
$$;

-- RFS44: exclui a retencao registrada por erro, antes do envio (sem liberacao nem devolucao).
-- A transacao volta a aguardar o pagamento e a exclusao fica no historico.
create or replace function public.remover_retencao(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype; v_pg public.pagamentos_retidos%rowtype;
begin
  if not public.is_admin() then raise exception 'Somente o administrador exclui uma retenção' using errcode = '42501'; end if;
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  select * into v_pg from public.pagamentos_retidos where transacao_id = p_id for update;
  if not found or v_pg.status <> 'retido' then
    raise exception 'Só é possível excluir uma retenção sem liberação nem devolução' using errcode = 'P0001';
  end if;
  if v_t.status <> 'paga' then
    raise exception 'Só é possível excluir a retenção antes do envio da peça' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_motivo)), 0) not between 1 and 500 then
    raise exception 'Informe o motivo da exclusão (até 500 caracteres)' using errcode = 'P0001';
  end if;
  insert into public.transacao_eventos(transacao_id, situacao, descricao, autor_id)
  values(p_id, 'retencao_excluida', 'Retenção excluída por erro: ' || trim(p_motivo), auth.uid());
  delete from public.pagamentos_retidos where transacao_id = p_id;
  update public.transacoes set status = 'aceita', atualizado_em = now() where id = p_id;
end;
$$;

-- RFS42: o administrador filtra os pagamentos por status e periodo (data da retencao, horario de Brasilia)
create or replace function public.consultar_pagamentos_retidos(p_inicio date default null, p_fim date default null, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_r jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('retido', 'liberado', 'estornado') then
    raise exception 'Status de pagamento inválido' using errcode = 'P0001';
  end if;
  if p_inicio is not null and p_fim is not null and p_inicio > p_fim then
    raise exception 'A data inicial não pode ser maior que a final' using errcode = 'P0001';
  end if;
  with sel as (
    select pg.*, p.nome as peca, c.nome as comprador, v.nome as vendedor
    from public.pagamentos_retidos pg
    join public.transacoes t on t.id = pg.transacao_id
    join public.pecas p on p.id = t.peca_id
    join public.perfis c on c.id = t.comprador_id
    join public.perfis v on v.id = t.vendedor_id
    where (p_status is null or pg.status = p_status)
      and (p_inicio is null or (pg.retido_em at time zone 'America/Sao_Paulo')::date >= p_inicio)
      and (p_fim is null or (pg.retido_em at time zone 'America/Sao_Paulo')::date <= p_fim)
  )
  select jsonb_build_object(
    'retido', coalesce(sum(valor) filter (where status = 'retido'), 0),
    'repassesLiberados', coalesce(sum(repasse) filter (where status = 'liberado'), 0),
    'estornado', coalesce(sum(valor) filter (where status = 'estornado'), 0),
    'pagamentos', coalesce(jsonb_agg(jsonb_build_object(
      'transacaoId', transacao_id, 'peca', peca, 'comprador', comprador, 'vendedor', vendedor,
      'valor', valor, 'repasse', repasse, 'status', status,
      'retidoEm', retido_em, 'liberadoEm', liberado_em, 'estornadoEm', estornado_em
    ) order by retido_em desc), '[]'::jsonb)
  ) into v_r from sel;
  return v_r;
end;
$$;

revoke all on function public.confirmar_transacao(bigint, integer), public.conferir_entrega(bigint, boolean, text, text),
  public.resolver_contestacao(bigint, text, text), public.remover_retencao(bigint, text),
  public.consultar_pagamentos_retidos(date, date, text) from public, anon;
grant execute on function public.confirmar_transacao(bigint, integer), public.conferir_entrega(bigint, boolean, text, text),
  public.resolver_contestacao(bigint, text, text), public.remover_retencao(bigint, text),
  public.consultar_pagamentos_retidos(date, date, text) to authenticated;
notify pgrst, 'reload schema';
commit;
