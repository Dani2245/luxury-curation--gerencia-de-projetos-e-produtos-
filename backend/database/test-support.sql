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

  delete from public.pecas where nome like p_prefixo || '%';
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.e2e_limpar_dados(text) from public, anon;
grant execute on function public.e2e_limpar_dados(text) to authenticated;
