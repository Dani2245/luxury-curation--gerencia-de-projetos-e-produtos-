-- RFC12/RFC13: entrega, conferencia e pagamento SIMULADO retido.
-- Executar depois de schema-financeiro.sql e schema-rfc22-rfc21.sql.
-- Vendas historicas ja confirmadas permanecem concluidas; nao se inventam pagamentos retroativos.
begin;
alter table public.transacoes drop constraint if exists transacoes_status_check;
alter table public.transacoes add constraint transacoes_status_check check
  (status in ('pendente', 'aceita', 'paga', 'enviada', 'em_conferencia', 'contestada', 'confirmada', 'cancelada'));
alter table public.transacoes add column if not exists aceita_em timestamptz;
alter table public.transacoes add column if not exists enviada_em timestamptz;
alter table public.transacoes add column if not exists recebida_em timestamptz;
alter table public.transacoes add column if not exists conferida_em timestamptz;
alter table public.transacoes add column if not exists rastreio text;
alter table public.transacoes add column if not exists motivo_contestacao text;
alter table public.transacoes add column if not exists resolucao text;
alter table public.transacoes add column if not exists resolvida_por uuid references public.perfis(id) on delete restrict;
alter table public.transacoes add column if not exists resolvida_em timestamptz;
create unique index if not exists transacoes_peca_ativa_idx on public.transacoes(peca_id)
  where status not in ('confirmada', 'cancelada');

create table if not exists public.pagamentos_retidos (
  transacao_id bigint primary key references public.transacoes(id) on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  comissao numeric(14,2) not null check (comissao >= 0 and comissao <= valor),
  repasse numeric(14,2) not null check (repasse >= 0),
  status text not null default 'retido' check (status in ('retido', 'liberado', 'estornado')),
  retido_em timestamptz not null default now(),
  liberado_em timestamptz,
  estornado_em timestamptz,
  check (valor = comissao + repasse)
);
create table if not exists public.transacao_eventos (
  id bigint generated always as identity primary key,
  transacao_id bigint not null references public.transacoes(id) on delete cascade,
  situacao text not null,
  descricao text not null,
  autor_id uuid references public.perfis(id) on delete restrict,
  criado_em timestamptz not null default now()
);
create index if not exists transacao_eventos_transacao_idx on public.transacao_eventos(transacao_id);
alter table public.pagamentos_retidos enable row level security;
alter table public.transacao_eventos enable row level security;
drop policy if exists pagamentos_select on public.pagamentos_retidos;
create policy pagamentos_select on public.pagamentos_retidos for select to authenticated using
  (exists(select 1 from public.transacoes t where t.id = transacao_id and (t.comprador_id = auth.uid() or t.vendedor_id = auth.uid() or public.is_admin())));
drop policy if exists transacao_eventos_select on public.transacao_eventos;
create policy transacao_eventos_select on public.transacao_eventos for select to authenticated using
  (exists(select 1 from public.transacoes t where t.id = transacao_id and (t.comprador_id = auth.uid() or t.vendedor_id = auth.uid() or public.is_admin())));
revoke all on public.pagamentos_retidos, public.transacao_eventos from public, anon, authenticated;
grant select on public.pagamentos_retidos, public.transacao_eventos to authenticated;

create or replace view public.vw_transacoes as
select t.id, t.peca_id, p.nome as peca_nome, p.categoria,
  t.comprador_id, c.nome as comprador_nome, t.vendedor_id, v.nome as vendedor_nome,
  t.valor, t.status, t.comissao, t.motivo_cancelamento, t.transferencia_pendente,
  t.criado_em, t.atualizado_em, t.confirmada_em, t.cancelada_em,
  t.aceita_em, t.enviada_em, t.recebida_em, t.conferida_em, t.rastreio, t.motivo_contestacao,
  t.resolucao, t.resolvida_em, pg.status as pagamento_status, pg.retido_em, pg.liberado_em, pg.estornado_em,
  case when t.comprador_id = auth.uid() and not public.is_admin() then null else pg.repasse end as repasse
from public.transacoes t join public.pecas p on p.id = t.peca_id
join public.perfis c on c.id = t.comprador_id join public.perfis v on v.id = t.vendedor_id
left join public.pagamentos_retidos pg on pg.transacao_id = t.id
where t.comprador_id = auth.uid() or t.vendedor_id = auth.uid() or public.is_admin();

create or replace function public.historico_transacao_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.transacao_eventos(transacao_id, situacao, descricao, autor_id)
    values(new.id, new.status,
      case new.status
        when 'pendente' then 'Proposta registrada'
        when 'aceita' then 'Proposta aceita pelo vendedor; aguardando pagamento simulado'
        when 'paga' then 'Pagamento simulado recebido e retido'
        when 'enviada' then 'Envio registrado: ' || coalesce(new.rastreio, '')
        when 'em_conferencia' then 'Comprador confirmou o recebimento; aguardando conferencia'
        when 'contestada' then 'Conferencia contestada: ' || coalesce(new.motivo_contestacao, '')
        when 'confirmada' then 'Venda concluida e pagamento simulado liberado' || coalesce('; decisao: ' || new.resolucao, '')
        when 'cancelada' then 'Transacao cancelada: ' || coalesce(new.motivo_cancelamento, '')
      end, coalesce(auth.uid(), new.registrada_por, new.comprador_id));
  end if;
  return new;
end;
$$;
revoke all on function public.historico_transacao_trg() from public, anon, authenticated;
drop trigger if exists historico_transacao_trg on public.transacoes;
create trigger historico_transacao_trg after insert or update of status on public.transacoes
  for each row execute function public.historico_transacao_trg();

-- O endpoint de confirmar agora aceita a proposta. A propriedade so muda na conclusao.
create or replace function public.confirmar_transacao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.vendedor_id is distinct from auth.uid() then raise exception 'Somente o vendedor aceita a proposta' using errcode = '42501'; end if;
  if v_t.status <> 'pendente' then raise exception 'Somente propostas pendentes podem ser aceitas' using errcode = 'P0001'; end if;
  update public.transacoes set status = 'aceita', aceita_em = now(), atualizado_em = now() where id = p_id;
end;
$$;

create or replace function public.reter_pagamento_simulado(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype; v_pct numeric; v_comissao numeric;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.comprador_id is distinct from auth.uid() then raise exception 'Somente o comprador registra o pagamento' using errcode = '42501'; end if;
  if v_t.status <> 'aceita' then raise exception 'O pagamento exige uma proposta aceita e ainda nao paga' using errcode = 'P0001'; end if;
  select valor into v_pct from public.parametros where chave = 'comissao_percentual';
  if v_pct is null or v_pct < 0 or v_pct > 100 then raise exception 'Percentual de comissao invalido' using errcode = 'P0001'; end if;
  v_comissao := round(v_t.valor * v_pct / 100, 2);
  insert into public.pagamentos_retidos(transacao_id, valor, comissao, repasse)
  values(p_id, v_t.valor, v_comissao, v_t.valor - v_comissao);
  update public.transacoes set status = 'paga', atualizado_em = now() where id = p_id;
end;
$$;

create or replace function public.registrar_envio(p_id bigint, p_rastreio text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.vendedor_id is distinct from auth.uid() then raise exception 'Somente o vendedor registra o envio' using errcode = '42501'; end if;
  if v_t.status <> 'paga' then raise exception 'O envio exige pagamento retido' using errcode = 'P0001'; end if;
  if coalesce(length(trim(p_rastreio)), 0) not between 1 and 200 then raise exception 'Informe rastreio ou comprovante de envio (ate 200 caracteres)' using errcode = 'P0001'; end if;
  update public.transacoes set status = 'enviada', enviada_em = now(), rastreio = trim(p_rastreio), atualizado_em = now() where id = p_id;
end;
$$;

create or replace function public.receber_entrega(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.comprador_id is distinct from auth.uid() then raise exception 'Somente o comprador confirma o recebimento' using errcode = '42501'; end if;
  if v_t.status <> 'enviada' then raise exception 'Registre o envio antes do recebimento' using errcode = 'P0001'; end if;
  update public.transacoes set status = 'em_conferencia', recebida_em = now(), atualizado_em = now() where id = p_id;
end;
$$;

-- Funcao interna: somente conferencia/decisao autorizada pode liberar e transferir.
create or replace function public.concluir_venda_conferida(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype; v_pg public.pagamentos_retidos%rowtype; v_tem_passaporte boolean; v_lancamento bigint; v_nome text;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found or v_t.status not in ('em_conferencia', 'contestada') then raise exception 'Venda nao esta em conferencia' using errcode = 'P0001'; end if;
  select * into v_pg from public.pagamentos_retidos where transacao_id = p_id for update;
  if not found or v_pg.status <> 'retido' then raise exception 'Pagamento nao esta retido' using errcode = 'P0001'; end if;
  select exists(select 1 from public.passaportes where peca_id = v_t.peca_id) into v_tem_passaporte;
  select nome into v_nome from public.pecas where id = v_t.peca_id for update;
  update public.pagamentos_retidos set status = 'liberado', liberado_em = now() where transacao_id = p_id;
  update public.transacoes set status = 'confirmada', confirmada_em = now(), conferida_em = coalesce(conferida_em, now()),
    comissao = v_pg.comissao, transferencia_pendente = not v_tem_passaporte, atualizado_em = now() where id = p_id;
  update public.pecas set vendida = true, em_negociacao = false, proprietario_id = v_t.comprador_id, atualizado_em = now() where id = v_t.peca_id;
  if v_tem_passaporte then perform public.registrar_transferencia_interna(p_id); end if;
  if v_pg.comissao > 0 then
    insert into public.lancamentos_financeiros(tipo, categoria, descricao, valor, competencia, vencimento, status, origem, transacao_id, criado_por, liquidado_em)
    values('receita', 'comissao_venda', left('Comissao da venda: ' || v_nome, 200), v_pg.comissao,
      (now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date,
      'liquidado', 'venda', p_id, auth.uid(), now()) returning id into v_lancamento;
    insert into public.financeiro_eventos(lancamento_id, acao, autor_id, observacao)
    values(v_lancamento, 'criacao', auth.uid(), 'Comissao liquidada na conclusao da venda simulada');
  end if;
end;
$$;
revoke all on function public.concluir_venda_conferida(bigint) from public, anon, authenticated;

create or replace function public.conferir_entrega(p_id bigint, p_aprovada boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.comprador_id is distinct from auth.uid() then raise exception 'Somente o comprador confere a entrega' using errcode = '42501'; end if;
  if v_t.status <> 'em_conferencia' then raise exception 'Confirme o recebimento antes de conferir a entrega' using errcode = 'P0001'; end if;
  if p_aprovada is null then raise exception 'Informe o resultado da conferencia' using errcode = 'P0001'; end if;
  if p_aprovada then
    perform public.concluir_venda_conferida(p_id);
  else
    if coalesce(length(trim(p_motivo)), 0) not between 1 and 1000 then raise exception 'Informe o motivo da contestacao (ate 1000 caracteres)' using errcode = 'P0001'; end if;
    update public.transacoes set status = 'contestada', motivo_contestacao = trim(p_motivo), conferida_em = now(), atualizado_em = now() where id = p_id;
  end if;
end;
$$;

create or replace function public.resolver_contestacao(p_id bigint, p_decisao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  if not public.is_admin() then raise exception 'Somente o administrador resolve contestacoes' using errcode = '42501'; end if;
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if v_t.status <> 'contestada' then raise exception 'A transacao nao possui contestacao pendente' using errcode = 'P0001'; end if;
  if p_decisao is null or p_decisao not in ('liberar', 'estornar') or coalesce(length(trim(p_motivo)), 0) not between 1 and 1000 then
    raise exception 'Informe decisao e justificativa (ate 1000 caracteres)' using errcode = 'P0001';
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

create or replace function public.cancelar_transacao(p_id bigint, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then raise exception 'Transacao nao encontrada' using errcode = 'P0002'; end if;
  if auth.uid() is null or auth.uid() not in (v_t.comprador_id, v_t.vendedor_id) then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if v_t.status not in ('pendente', 'aceita') then raise exception 'Somente propostas ainda nao pagas podem ser canceladas; apos o pagamento utilize a conferencia' using errcode = 'P0001'; end if;
  if length(coalesce(p_motivo, '')) > 500 then raise exception 'Motivo muito longo' using errcode = 'P0001'; end if;
  update public.transacoes set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(), motivo_cancelamento = nullif(trim(p_motivo), ''), atualizado_em = now() where id = p_id;
  update public.pecas set em_negociacao = false, atualizado_em = now() where id = v_t.peca_id;
end;
$$;

create or replace function public.resumo_pagamentos_retidos()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_r jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select jsonb_build_object('retido', coalesce(sum(valor) filter(where status = 'retido'), 0),
    'repassesLiberados', coalesce(sum(repasse) filter(where status = 'liberado'), 0),
    'estornado', coalesce(sum(valor) filter(where status = 'estornado'), 0)) into v_r from public.pagamentos_retidos;
  return v_r;
end;
$$;
revoke all on function public.confirmar_transacao(bigint), public.cancelar_transacao(bigint,text),
  public.reter_pagamento_simulado(bigint), public.registrar_envio(bigint,text), public.receber_entrega(bigint),
  public.conferir_entrega(bigint,boolean,text), public.resolver_contestacao(bigint,text,text), public.resumo_pagamentos_retidos() from public, anon;
grant execute on function public.confirmar_transacao(bigint), public.cancelar_transacao(bigint,text),
  public.reter_pagamento_simulado(bigint), public.registrar_envio(bigint,text), public.receber_entrega(bigint),
  public.conferir_entrega(bigint,boolean,text), public.resolver_contestacao(bigint,text,text), public.resumo_pagamentos_retidos() to authenticated;
notify pgrst, 'reload schema';
commit;
