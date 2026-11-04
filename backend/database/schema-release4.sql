-- Release 4: RFC08 (RFS25–28) e RFC09 (RFS29–32).
-- Aditiva, repetível. Execute depois de schema-release3-growth.sql.
begin;
create table if not exists public.parcerias (
  id bigint generated always as identity primary key,
  nome text not null check(length(trim(nome)) between 1 and 150),
  tipo text not null check(tipo in ('casa de leilao','seguradora','galeria')),
  contato text not null check(length(trim(contato)) between 1 and 200),
  dados text not null default '' check(length(dados)<=2000),
  condicoes text not null check(length(trim(condicoes)) between 1 and 2000),
  encerrada_em timestamptz, motivo_encerramento text,
  criado_por uuid not null references public.perfis(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.consignacoes (
  id bigint generated always as identity primary key,
  peca_id bigint not null references public.pecas(id) on delete restrict,
  vendedor_id uuid not null references public.perfis(id) on delete restrict,
  entrada_em date not null,
  condicoes text not null check(length(trim(condicoes)) between 1 and 2000),
  saida_em date check(saida_em >= entrada_em),
  motivo_saida text check(motivo_saida in ('devolucao','venda')),
  observacao_saida text,
  transacao_id bigint references public.transacoes(id) on delete restrict,
  criado_por uuid not null references public.perfis(id),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  check ((saida_em is null) = (motivo_saida is null))
);
create unique index if not exists consignacao_ativa_peca on public.consignacoes(peca_id) where saida_em is null;
create index if not exists consignacao_entrada on public.consignacoes(entrada_em,id);
create table if not exists public.parceria_historico (
  id bigint generated always as identity primary key,
  parceria_id bigint not null references public.parcerias(id) on delete cascade,
  acao text not null, anterior jsonb, atual jsonb not null,
  autor_id uuid references public.perfis(id), criado_em timestamptz not null default now()
);
create table if not exists public.consignacao_historico (
  id bigint generated always as identity primary key,
  consignacao_id bigint not null references public.consignacoes(id) on delete cascade,
  acao text not null, anterior jsonb, atual jsonb not null,
  autor_id uuid references public.perfis(id), criado_em timestamptz not null default now()
);
alter table public.parcerias enable row level security;
alter table public.consignacoes enable row level security;
alter table public.parceria_historico enable row level security;
alter table public.consignacao_historico enable row level security;
drop policy if exists parcerias_admin on public.parcerias;
create policy parcerias_admin on public.parcerias for select to authenticated using(public.is_admin());
drop policy if exists consignacoes_admin on public.consignacoes;
create policy consignacoes_admin on public.consignacoes for select to authenticated using(public.is_admin());
drop policy if exists parceria_historico_admin on public.parceria_historico;
create policy parceria_historico_admin on public.parceria_historico for select to authenticated using(public.is_admin());
drop policy if exists consignacao_historico_admin on public.consignacao_historico;
create policy consignacao_historico_admin on public.consignacao_historico for select to authenticated using(public.is_admin());
revoke all on public.parcerias,public.consignacoes,public.parceria_historico,public.consignacao_historico from public,anon,authenticated;
grant select on public.parcerias,public.consignacoes,public.parceria_historico,public.consignacao_historico to authenticated;

create or replace function public.auditar_operacao_release4() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_acao text; v_anterior jsonb;
begin
  v_acao := case when TG_OP='INSERT' then 'cadastro' else 'edicao' end;
  if TG_OP='UPDATE' then v_anterior:=to_jsonb(old); end if;
  if TG_TABLE_NAME='parcerias' then
    if new.encerrada_em is not null then v_acao:='encerramento'; end if;
    insert into public.parceria_historico(parceria_id,acao,anterior,atual,autor_id) values(new.id,v_acao,v_anterior,to_jsonb(new),auth.uid());
  else
    if new.saida_em is not null then v_acao:=new.motivo_saida; end if;
    insert into public.consignacao_historico(consignacao_id,acao,anterior,atual,autor_id) values(new.id,v_acao,v_anterior,to_jsonb(new),auth.uid());
  end if;
  return new;
end; $$;
revoke all on function public.auditar_operacao_release4() from public,anon,authenticated;
drop trigger if exists parcerias_auditar on public.parcerias;
create trigger parcerias_auditar after insert or update on public.parcerias for each row execute function public.auditar_operacao_release4();
drop trigger if exists consignacoes_auditar on public.consignacoes;
create trigger consignacoes_auditar after insert or update on public.consignacoes for each row execute function public.auditar_operacao_release4();

create or replace function public.salvar_parceria(p_id bigint,p_nome text,p_tipo text,p_contato text,p_dados text,p_condicoes text)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint; v_parceria public.parcerias%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if coalesce(length(trim(p_nome)),0) not between 1 and 150 or p_tipo is null or p_tipo not in ('casa de leilao','seguradora','galeria')
    or coalesce(length(trim(p_contato)),0) not between 1 and 200 or length(coalesce(p_dados,''))>2000
    or coalesce(length(trim(p_condicoes)),0) not between 1 and 2000 then raise exception 'Dados da parceria invalidos' using errcode='P0001'; end if;
  if p_id is null then
    insert into public.parcerias(nome,tipo,contato,dados,condicoes,criado_por)
    values(trim(p_nome),p_tipo,trim(p_contato),coalesce(trim(p_dados),''),trim(p_condicoes),auth.uid()) returning id into v_id;
  else
    select * into v_parceria from public.parcerias where id=p_id for update;
    if not found then raise exception 'Parceria nao encontrada' using errcode='P0002'; end if;
    if v_parceria.encerrada_em is not null then raise exception 'Parceria encerrada nao pode ser editada' using errcode='P0001'; end if;
    update public.parcerias set nome=trim(p_nome),tipo=p_tipo,contato=trim(p_contato),dados=coalesce(trim(p_dados),''),condicoes=trim(p_condicoes),atualizado_em=now() where id=p_id;
    v_id:=p_id;
  end if;
  return v_id;
end; $$;
create or replace function public.encerrar_parceria(p_id bigint,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare v_parceria public.parcerias%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if coalesce(length(trim(p_motivo)),0) not between 1 and 500 then raise exception 'Informe o motivo (ate 500 caracteres)' using errcode='P0001'; end if;
  select * into v_parceria from public.parcerias where id=p_id for update;
  if not found then raise exception 'Parceria nao encontrada' using errcode='P0002'; end if;
  if v_parceria.encerrada_em is not null then raise exception 'Parceria ja encerrada' using errcode='P0001'; end if;
  update public.parcerias set encerrada_em=now(),motivo_encerramento=trim(p_motivo),atualizado_em=now() where id=p_id;
end; $$;

create or replace view public.vw_consignacoes as
select c.*,p.nome peca_nome,p.categoria,v.nome vendedor_nome,
case when c.saida_em is null then 'em estoque' else c.motivo_saida end status
from public.consignacoes c join public.pecas p on p.id=c.peca_id join public.perfis v on v.id=c.vendedor_id where public.is_admin();
revoke all on public.vw_consignacoes from public,anon,authenticated;
grant select on public.vw_consignacoes to authenticated;

create or replace function public.registrar_consignacao(p_peca bigint,p_vendedor uuid,p_entrada date,p_condicoes text)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_peca public.pecas%rowtype; v_id bigint;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_entrada is null or p_entrada>(now() at time zone 'America/Sao_Paulo')::date or coalesce(length(trim(p_condicoes)),0) not between 1 and 2000 then
    raise exception 'Informe data de entrada e condicoes validas' using errcode='P0001'; end if;
  select * into v_peca from public.pecas where id=p_peca for update;
  if not found then raise exception 'Peca nao encontrada' using errcode='P0002'; end if;
  if v_peca.vendida or v_peca.proprietario_id is distinct from p_vendedor or v_peca.vendedor_id is distinct from p_vendedor then
    raise exception 'O consignante deve ser o vendedor e proprietario atual de uma peca nao vendida' using errcode='P0001'; end if;
  if exists(select 1 from public.consignacoes where peca_id=p_peca and saida_em is null) then raise exception 'Peca ja esta em consignacao' using errcode='23505'; end if;
  if exists(select 1 from public.consignacoes where peca_id=p_peca and saida_em>p_entrada) then raise exception 'Entrada anterior a ultima baixa' using errcode='P0001'; end if;
  insert into public.consignacoes(peca_id,vendedor_id,entrada_em,condicoes,criado_por) values(p_peca,p_vendedor,p_entrada,trim(p_condicoes),auth.uid()) returning id into v_id;
  return v_id;
end; $$;
create or replace function public.editar_consignacao(p_id bigint,p_condicoes text) returns void
language plpgsql security definer set search_path=public as $$
declare v_c public.consignacoes%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if coalesce(length(trim(p_condicoes)),0) not between 1 and 2000 then raise exception 'Informe as condicoes (ate 2000 caracteres)' using errcode='P0001'; end if;
  select * into v_c from public.consignacoes where id=p_id for update;
  if not found then raise exception 'Consignacao nao encontrada' using errcode='P0002'; end if;
  if v_c.saida_em is not null then raise exception 'Somente pecas em estoque permitem alterar condicoes' using errcode='P0001'; end if;
  update public.consignacoes set condicoes=trim(p_condicoes),atualizado_em=now() where id=p_id;
end; $$;
create or replace function public.devolver_consignacao(p_id bigint,p_saida date,p_observacao text) returns void
language plpgsql security definer set search_path=public as $$
declare v_c public.consignacoes%rowtype; v_peca public.pecas%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  -- Mesma ordem de bloqueio da conclusao de venda: peca antes da consignacao.
  select p.* into v_peca from public.pecas p join public.consignacoes c on c.peca_id=p.id where c.id=p_id for update of p;
  if not found then raise exception 'Consignacao nao encontrada' using errcode='P0002'; end if;
  select * into v_c from public.consignacoes where id=p_id for update;
  if v_c.saida_em is not null then raise exception 'Consignacao ja encerrada' using errcode='P0001'; end if;
  if v_peca.em_negociacao or v_peca.vendida then raise exception 'Resolva a negociacao antes de devolver a peca' using errcode='P0001'; end if;
  if p_saida is null or p_saida<v_c.entrada_em or p_saida>(now() at time zone 'America/Sao_Paulo')::date or coalesce(length(trim(p_observacao)),0) not between 1 and 500 then
    raise exception 'Informe data de saida e justificativa validas' using errcode='P0001'; end if;
  update public.consignacoes set saida_em=p_saida,motivo_saida='devolucao',observacao_saida=trim(p_observacao),atualizado_em=now() where id=p_id;
end; $$;
create or replace function public.baixar_consignacao_vendida() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status='confirmada' and old.status is distinct from 'confirmada' then
    update public.consignacoes set saida_em=(new.confirmada_em at time zone 'America/Sao_Paulo')::date,motivo_saida='venda',transacao_id=new.id,
      observacao_saida='Venda concluida apos conferencia e liberacao do pagamento simulado',atualizado_em=now()
    where peca_id=new.peca_id and saida_em is null;
  end if;
  return new;
end; $$;
revoke all on function public.baixar_consignacao_vendida() from public,anon,authenticated;
drop trigger if exists transacoes_baixa_consignacao on public.transacoes;
create trigger transacoes_baixa_consignacao after update of status on public.transacoes for each row execute function public.baixar_consignacao_vendida();

revoke all on function public.salvar_parceria(bigint,text,text,text,text,text),public.encerrar_parceria(bigint,text),public.registrar_consignacao(bigint,uuid,date,text),public.editar_consignacao(bigint,text),public.devolver_consignacao(bigint,date,text) from public,anon;
grant execute on function public.salvar_parceria(bigint,text,text,text,text,text),public.encerrar_parceria(bigint,text),public.registrar_consignacao(bigint,uuid,date,text),public.editar_consignacao(bigint,text),public.devolver_consignacao(bigint,date,text) to authenticated;
notify pgrst,'reload schema';
commit;
