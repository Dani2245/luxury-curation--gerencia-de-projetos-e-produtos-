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
