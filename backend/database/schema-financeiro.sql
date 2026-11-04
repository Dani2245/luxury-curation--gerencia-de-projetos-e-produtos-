-- RF01, RF02 e RFC11. Executar depois de schema-rnf06-rfc16.sql.
-- Valores de terceiros (pagamento retido e repasse) nao sao receita/despesa da Lastro.
begin;
create table if not exists public.lancamentos_financeiros (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria text not null,
  descricao text not null check (length(trim(descricao)) between 1 and 200),
  valor numeric(14,2) not null check (valor > 0),
  competencia date not null,
  vencimento date not null,
  status text not null default 'aberto' check (status in ('aberto', 'liquidado', 'cancelado')),
  origem text not null default 'manual' check (origem in ('manual', 'venda')),
  transacao_id bigint references public.transacoes(id) on delete cascade,
  criado_por uuid not null references public.perfis(id) on delete restrict,
  criado_em timestamptz not null default now(),
  liquidado_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  check ((tipo = 'receita' and categoria in ('comissao_venda', 'emissao_passaporte', 'manutencao_passaporte'))
      or (tipo = 'despesa' and categoria in ('comissao_perito', 'comissao_parceiro', 'custo_operacional'))),
  check ((origem = 'venda' and transacao_id is not null and categoria = 'comissao_venda') or (origem = 'manual' and transacao_id is null))
);
create unique index if not exists lancamentos_comissao_unica_idx on public.lancamentos_financeiros(transacao_id) where origem = 'venda';
create index if not exists lancamentos_competencia_idx on public.lancamentos_financeiros(competencia);
create table if not exists public.financeiro_eventos (
  id bigint generated always as identity primary key,
  lancamento_id bigint not null references public.lancamentos_financeiros(id) on delete cascade,
  acao text not null check (acao in ('criacao', 'liquidacao', 'cancelamento')),
  autor_id uuid not null references public.perfis(id) on delete restrict,
  observacao text,
  criado_em timestamptz not null default now()
);
alter table public.lancamentos_financeiros enable row level security;
alter table public.financeiro_eventos enable row level security;
drop policy if exists lancamentos_select on public.lancamentos_financeiros;
create policy lancamentos_select on public.lancamentos_financeiros for select to authenticated using (public.is_admin());
drop policy if exists financeiro_eventos_select on public.financeiro_eventos;
create policy financeiro_eventos_select on public.financeiro_eventos for select to authenticated using (public.is_admin());
revoke all on public.lancamentos_financeiros, public.financeiro_eventos from public, anon, authenticated;
grant select on public.lancamentos_financeiros, public.financeiro_eventos to authenticated;

create or replace function public.criar_lancamento(p_tipo text, p_categoria text, p_descricao text, p_valor numeric, p_competencia date, p_vencimento date)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_tipo is null or p_categoria is null or not ((p_tipo = 'receita' and p_categoria in ('emissao_passaporte', 'manutencao_passaporte'))
    or (p_tipo = 'despesa' and p_categoria in ('comissao_perito', 'comissao_parceiro', 'custo_operacional'))) then
    raise exception 'Categoria invalida; comissoes de venda sao geradas pela conclusao da venda' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_descricao)), 0) not between 1 and 200 or p_valor is null or p_valor < 0.01 or p_valor > 999999999999.99
     or p_valor <> round(p_valor, 2) or p_competencia is null or p_vencimento is null then
    raise exception 'Informe descricao, valor monetario positivo e datas validas' using errcode = 'P0001';
  end if;
  insert into public.lancamentos_financeiros(tipo, categoria, descricao, valor, competencia, vencimento, criado_por)
  values(p_tipo, p_categoria, trim(p_descricao), p_valor, p_competencia, p_vencimento, auth.uid()) returning id into v_id;
  insert into public.financeiro_eventos(lancamento_id, acao, autor_id) values(v_id, 'criacao', auth.uid());
  return v_id;
end;
$$;

create or replace function public.alterar_lancamento(p_id bigint, p_acao text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_l public.lancamentos_financeiros%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v_l from public.lancamentos_financeiros where id = p_id for update;
  if not found then raise exception 'Lancamento nao encontrado' using errcode = 'P0002'; end if;
  if v_l.status <> 'aberto' or v_l.origem <> 'manual' then raise exception 'Somente lancamentos manuais em aberto podem ser alterados' using errcode = 'P0001'; end if;
  if p_acao is null or p_acao not in ('liquidar', 'cancelar') then raise exception 'Acao invalida' using errcode = 'P0001'; end if;
  if p_acao = 'cancelar' and coalesce(length(trim(p_motivo)), 0) not between 1 and 500 then
    raise exception 'Informe o motivo do cancelamento (ate 500 caracteres)' using errcode = 'P0001';
  end if;
  update public.lancamentos_financeiros set
    status = case when p_acao = 'liquidar' then 'liquidado' else 'cancelado' end,
    liquidado_em = case when p_acao = 'liquidar' then now() end,
    cancelado_em = case when p_acao = 'cancelar' then now() end,
    motivo_cancelamento = case when p_acao = 'cancelar' then trim(p_motivo) end
  where id = p_id;
  insert into public.financeiro_eventos(lancamento_id, acao, autor_id, observacao)
  values(p_id, case when p_acao = 'liquidar' then 'liquidacao' else 'cancelamento' end, auth.uid(), nullif(trim(p_motivo), ''));
end;
$$;

create or replace function public.relatorio_transacoes(p_inicio date, p_fim date, p_categoria text default null, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_resultado jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim then raise exception 'Periodo invalido' using errcode = 'P0001'; end if;
  if p_categoria is not null and p_categoria not in ('obra de arte', 'joia', 'relógio') then raise exception 'Categoria invalida' using errcode = 'P0001'; end if;
  if p_status is not null and p_status not in ('pendente', 'aceita', 'paga', 'enviada', 'em_conferencia', 'contestada', 'confirmada', 'cancelada') then
    raise exception 'Situacao invalida' using errcode = 'P0001';
  end if;
  with filtradas as (
    select t.id, t.valor, t.status, t.criado_em, p.nome as peca, p.categoria,
           c.nome as comprador, v.nome as vendedor
    from public.transacoes t join public.pecas p on p.id = t.peca_id
    join public.perfis c on c.id = t.comprador_id join public.perfis v on v.id = t.vendedor_id
    where t.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
      and t.criado_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
      and (p_categoria is null or p.categoria = p_categoria) and (p_status is null or t.status = p_status)
  ), grupos as (
    select categoria, count(*) as quantidade, sum(valor) as subtotal,
      coalesce(sum(valor) filter (where status = 'confirmada'), 0) as vendas_concluidas,
      jsonb_agg(to_jsonb(f) order by criado_em, id) as transacoes
    from filtradas f group by categoria
  )
  select jsonb_build_object('grupos', coalesce(jsonb_agg(to_jsonb(g) order by categoria), '[]'::jsonb),
    'quantidade', coalesce(sum(quantidade), 0), 'total', coalesce(sum(subtotal), 0),
    'vendasConcluidas', coalesce(sum(vendas_concluidas), 0)) into v_resultado from grupos g;
  return v_resultado;
end;
$$;

create or replace function public.relatorio_financeiro(p_inicio date, p_fim date, p_tipo text default null, p_categoria text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_resultado jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim then raise exception 'Periodo invalido' using errcode = 'P0001'; end if;
  if p_tipo is not null and p_tipo not in ('receita', 'despesa') then raise exception 'Tipo invalido' using errcode = 'P0001'; end if;
  if p_categoria is not null and p_categoria not in ('comissao_venda', 'emissao_passaporte', 'manutencao_passaporte', 'comissao_perito', 'comissao_parceiro', 'custo_operacional') then
    raise exception 'Categoria invalida' using errcode = 'P0001';
  end if;
  with filtrados as (
    select * from public.lancamentos_financeiros
    where competencia between p_inicio and p_fim and (p_tipo is null or tipo = p_tipo) and (p_categoria is null or categoria = p_categoria)
  )
  select jsonb_build_object(
    'lancamentos', coalesce(jsonb_agg(to_jsonb(f) order by competencia, id), '[]'::jsonb),
    'receitas', coalesce(sum(valor) filter (where tipo = 'receita' and status <> 'cancelado'), 0),
    'despesas', coalesce(sum(valor) filter (where tipo = 'despesa' and status <> 'cancelado'), 0),
    'recebido', coalesce(sum(valor) filter (where tipo = 'receita' and status = 'liquidado'), 0),
    'pago', coalesce(sum(valor) filter (where tipo = 'despesa' and status = 'liquidado'), 0),
    'aReceber', coalesce(sum(valor) filter (where tipo = 'receita' and status = 'aberto'), 0),
    'aPagar', coalesce(sum(valor) filter (where tipo = 'despesa' and status = 'aberto'), 0)
  ) into v_resultado from filtrados f;
  return v_resultado || jsonb_build_object('resultadoPrevisto', (v_resultado->>'receitas')::numeric - (v_resultado->>'despesas')::numeric,
    'saldoRealizado', (v_resultado->>'recebido')::numeric - (v_resultado->>'pago')::numeric);
end;
$$;

revoke all on function public.criar_lancamento(text,text,text,numeric,date,date), public.alterar_lancamento(bigint,text,text),
  public.relatorio_transacoes(date,date,text,text), public.relatorio_financeiro(date,date,text,text) from public, anon;
grant execute on function public.criar_lancamento(text,text,text,numeric,date,date), public.alterar_lancamento(bigint,text,text),
  public.relatorio_transacoes(date,date,text,text), public.relatorio_financeiro(date,date,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
