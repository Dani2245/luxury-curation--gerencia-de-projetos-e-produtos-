-- RFC06 / RFS21-RFS24: custodia fisica. Executar depois das migracoes anteriores.
-- Migracao aditiva e repetivel. Saidas encerram a guarda; nao apagam o historico.
begin;

create table if not exists public.custodias (
  id bigint generated always as identity primary key,
  peca_id bigint not null references public.pecas(id) on delete restrict,
  tipo_local text not null check (tipo_local in ('cofre', 'sala de guarda')),
  local text not null check (length(trim(local)) between 1 and 150),
  entrada_em date not null,
  responsavel text not null check (length(trim(responsavel)) between 1 and 150),
  saida_em date check (saida_em >= entrada_em),
  motivo_saida text,
  registrado_por uuid not null references public.perfis(id) on delete restrict,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists custodias_peca_ativa_idx on public.custodias(peca_id) where saida_em is null;
create table if not exists public.custodia_movimentacoes (
  id bigint generated always as identity primary key,
  custodia_id bigint not null references public.custodias(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'movimentacao', 'saida')),
  local_anterior text,
  local_destino text,
  observacao text,
  autor_id uuid not null references public.perfis(id) on delete restrict,
  criado_em timestamptz not null default now()
);
create index if not exists custodia_movimentacoes_custodia_idx on public.custodia_movimentacoes(custodia_id);
alter table public.custodias enable row level security;
alter table public.custodia_movimentacoes enable row level security;
drop policy if exists custodias_select on public.custodias;
create policy custodias_select on public.custodias for select to authenticated using (public.is_admin());
drop policy if exists custodia_movimentacoes_select on public.custodia_movimentacoes;
create policy custodia_movimentacoes_select on public.custodia_movimentacoes for select to authenticated using (public.is_admin());
revoke all on public.custodias, public.custodia_movimentacoes from public, anon, authenticated;
grant select on public.custodias, public.custodia_movimentacoes to authenticated;

create or replace view public.vw_custodias as
select c.*, p.nome as peca_nome, p.categoria,
       case when c.saida_em is null then 'em custodia' else 'retirada' end as status
from public.custodias c join public.pecas p on p.id = c.peca_id
where public.is_admin();
revoke all on public.vw_custodias from public, anon, authenticated;
grant select on public.vw_custodias to authenticated;

create or replace function public.registrar_custodia(p_peca_id bigint, p_tipo_local text, p_local text, p_entrada date, p_responsavel text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_tipo_local is null or p_tipo_local not in ('cofre', 'sala de guarda') or coalesce(length(trim(p_local)), 0) not between 1 and 150
     or coalesce(length(trim(p_responsavel)), 0) not between 1 and 150 then
    raise exception 'Informe tipo, local de guarda e responsavel validos' using errcode = 'P0001';
  end if;
  if p_entrada is null or p_entrada > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data de entrada nao pode estar no futuro' using errcode = 'P0001';
  end if;
  perform 1 from public.pecas where id = p_peca_id for update;
  if not found then raise exception 'Peca nao encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from public.custodias where peca_id = p_peca_id and saida_em is null) then
    raise exception 'A peca ja esta em custodia' using errcode = '23505';
  end if;
  if exists (select 1 from public.custodias where peca_id = p_peca_id and saida_em > p_entrada) then
    raise exception 'A entrada nao pode anteceder a ultima saida' using errcode = 'P0001';
  end if;
  insert into public.custodias(peca_id, tipo_local, local, entrada_em, responsavel, registrado_por)
  values(p_peca_id, p_tipo_local, trim(p_local), p_entrada, trim(p_responsavel), auth.uid()) returning id into v_id;
  insert into public.custodia_movimentacoes(custodia_id, tipo, local_destino, observacao, autor_id)
  values(v_id, 'entrada', p_tipo_local || ': ' || trim(p_local), 'Recebida por ' || trim(p_responsavel), auth.uid());
  return v_id;
end;
$$;

create or replace function public.mover_custodia(p_id bigint, p_tipo_local text, p_local text, p_observacao text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.custodias%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v_c from public.custodias where id = p_id for update;
  if not found then raise exception 'Custodia nao encontrada' using errcode = 'P0002'; end if;
  if v_c.saida_em is not null then raise exception 'A custodia ja foi encerrada' using errcode = 'P0001'; end if;
  if p_tipo_local is null or p_tipo_local not in ('cofre', 'sala de guarda') or coalesce(length(trim(p_local)), 0) not between 1 and 150
     or length(coalesce(p_observacao, '')) > 500 then
    raise exception 'Local ou observacao invalida' using errcode = 'P0001';
  end if;
  if v_c.tipo_local = p_tipo_local and v_c.local = trim(p_local) then
    raise exception 'Informe um local diferente do atual' using errcode = 'P0001';
  end if;
  update public.custodias set tipo_local = p_tipo_local, local = trim(p_local), atualizado_em = now() where id = p_id;
  insert into public.custodia_movimentacoes(custodia_id, tipo, local_anterior, local_destino, observacao, autor_id)
  values(p_id, 'movimentacao', v_c.tipo_local || ': ' || v_c.local, p_tipo_local || ': ' || trim(p_local), nullif(trim(p_observacao), ''), auth.uid());
end;
$$;

create or replace function public.encerrar_custodia(p_id bigint, p_saida date, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_c public.custodias%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v_c from public.custodias where id = p_id for update;
  if not found then raise exception 'Custodia nao encontrada' using errcode = 'P0002'; end if;
  if v_c.saida_em is not null then raise exception 'A custodia ja foi encerrada' using errcode = 'P0001'; end if;
  if p_saida is null or p_saida < v_c.entrada_em or p_saida > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A saida deve estar entre a entrada e a data atual' using errcode = 'P0001';
  end if;
  if coalesce(length(trim(p_motivo)), 0) not between 1 and 500 then
    raise exception 'Informe o motivo da saida (ate 500 caracteres)' using errcode = 'P0001';
  end if;
  update public.custodias set saida_em = p_saida, motivo_saida = trim(p_motivo), atualizado_em = now() where id = p_id;
  insert into public.custodia_movimentacoes(custodia_id, tipo, local_anterior, observacao, autor_id)
  values(p_id, 'saida', v_c.tipo_local || ': ' || v_c.local, trim(p_motivo), auth.uid());
end;
$$;

revoke all on function public.registrar_custodia(bigint, text, text, date, text), public.mover_custodia(bigint, text, text, text), public.encerrar_custodia(bigint, date, text) from public, anon;
grant execute on function public.registrar_custodia(bigint, text, text, date, text), public.mover_custodia(bigint, text, text, text), public.encerrar_custodia(bigint, date, text) to authenticated;
notify pgrst, 'reload schema';
commit;
