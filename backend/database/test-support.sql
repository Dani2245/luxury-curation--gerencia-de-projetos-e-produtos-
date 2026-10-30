-- Apoio aos testes end-to-end (NAO use em producao).
-- Permite ao administrador apagar os dados criados pelos testes (pecas cujo nome comeca com o prefixo),
-- inclusive vendidas, com suas transacoes e passaportes. Execute no SQL Editor do ambiente de testes.
create or replace function public.e2e_limpar_dados(p_prefixo text default 'E2E ')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if coalesce(length(p_prefixo), 0) < 3 then
    raise exception 'Prefixo muito curto' using errcode = 'P0001';
  end if;

  if left(p_prefixo, 4) <> 'E2E ' or position('%' in p_prefixo) > 0 or position('_' in p_prefixo) > 0 then
    raise exception 'Use um prefixo literal iniciado por E2E ' using errcode = 'P0001';
  end if;

  -- Novos modulos: somente registros vinculados as pecas/descricoes desse teste.
  -- Blocos dinamicos permitem instalar o apoio antes ou depois das migracoes opcionais.
  if to_regclass('public.custodias') is not null then
    execute 'delete from public.custodias c using public.pecas p where c.peca_id = p.id and p.nome like $1'
      using p_prefixo || '%';
  end if;
  if to_regclass('public.lancamentos_financeiros') is not null then
    execute 'delete from public.lancamentos_financeiros where origem = ''manual'' and descricao like $1'
      using p_prefixo || '%';
  end if;

  delete from public.pecas where nome like p_prefixo || '%';
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.e2e_limpar_dados(text) from public, anon;
grant execute on function public.e2e_limpar_dados(text) to authenticated;

-- Antecipa o prazo em aberto (conferencia ou decisao da disputa) de uma transacao de teste,
-- para demonstrar prazos proximos e vencidos sem esperar dias (RFC12).
create or replace function public.e2e_ajustar_prazo(p_transacao bigint, p_horas numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if to_regclass('public.transacoes') is null or not exists (
    select 1 from public.transacoes t join public.pecas p on p.id = t.peca_id
     where t.id = p_transacao and p.nome like 'E2E %') then
    raise exception 'Somente transacoes de pecas de teste (E2E)' using errcode = 'P0001';
  end if;
  execute 'update public.transacoes set
      conferencia_ate = case when status = ''em_conferencia'' then now() + make_interval(secs => $2 * 3600) else conferencia_ate end,
      decisao_ate = case when status = ''contestada'' then now() + make_interval(secs => $2 * 3600) else decisao_ate end
    where id = $1'
    using p_transacao, p_horas;
end;
$$;

revoke all on function public.e2e_ajustar_prazo(bigint, numeric) from public, anon;
grant execute on function public.e2e_ajustar_prazo(bigint, numeric) to authenticated;

-- Apaga os dados de growth criados pelos testes: inscricoes e indicacoes com e-mail e2e-...,
-- experimentos e indicadores com nome iniciado por "E2E " (RFC17 a RFC20).
create or replace function public.e2e_limpar_growth()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if to_regclass('public.lista_espera') is null then
    return;
  end if;
  delete from public.lista_espera where email like 'e2e-%';
  delete from public.indicacoes where contato like 'e2e-%';
  delete from public.experimentos where titulo like 'E2E %';
  delete from public.indicadores where nome like 'E2E %';
  if to_regclass('public.colecao_itens') is not null then
    delete from public.colecao_itens where nome like 'E2E %';
  end if;
end;
$$;

revoke all on function public.e2e_limpar_growth() from public, anon;
grant execute on function public.e2e_limpar_growth() to authenticated;

-- Envelhece a ultima atualizacao de uma peca de teste da colecao, para demonstrar o lembrete de conservacao (RFC21).
create or replace function public.e2e_envelhecer_item_colecao(p_item bigint, p_dias integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  update public.colecao_itens set atualizado_em = now() - make_interval(days => p_dias)
   where id = p_item and nome like 'E2E %';
  if not found then
    raise exception 'Somente pecas de teste (E2E)' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.e2e_envelhecer_item_colecao(bigint, integer) from public, anon;
grant execute on function public.e2e_envelhecer_item_colecao(bigint, integer) to authenticated;
