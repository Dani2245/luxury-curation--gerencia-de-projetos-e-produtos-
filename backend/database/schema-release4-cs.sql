-- Complemento RFC14/RFC15/RF03. Aplicar depois das tres migracoes da Release 4.
begin;
create table if not exists public.onboarding_dossies (
  id bigint generated always as identity primary key,
  peca_id bigint not null unique references public.pecas(id) on delete restrict,
  vendedor_id uuid not null references public.perfis(id),
  diagnostico text not null check(length(trim(diagnostico)) between 1 and 2000),
  documentacao text not null default '' check(length(documentacao)<=4000),
  etapa text not null default 'diagnostico' check(etapa in ('diagnostico','verificacao','dossie','pericia','curadoria','publicacao')),
  status text not null default 'ativo' check(status in ('ativo','desistido','concluido')),
  motivo text, etapa_em timestamptz not null default now(),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.onboarding_historico (
  id bigint generated always as identity primary key,
  dossie_id bigint not null references public.onboarding_dossies(id) on delete cascade,
  acao text not null, observacao text not null, anterior jsonb, atual jsonb not null,
  autor_id uuid references public.perfis(id), criado_em timestamptz not null default now()
);
create table if not exists public.recuperacao_planos (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.perfis(id),
  responsavel_id uuid not null references public.perfis(id),
  objetivo text not null check(length(trim(objetivo)) between 1 and 1000),
  prazo date not null,
  status text not null default 'ativo' check(status in ('ativo','concluido','cancelado')),
  motivo text, encerrado_em timestamptz,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists recuperacao_ativa_cliente on public.recuperacao_planos(cliente_id) where status='ativo';
create table if not exists public.recuperacao_acoes (
  id bigint generated always as identity primary key,
  plano_id bigint not null references public.recuperacao_planos(id) on delete cascade,
  descricao text not null check(length(trim(descricao)) between 1 and 1000),
  prazo date not null,
  status text not null default 'pendente' check(status in ('pendente','em_andamento','concluida','cancelada')),
  resultado text, concluida_em timestamptz,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create table if not exists public.recuperacao_historico (
  id bigint generated always as identity primary key,
  plano_id bigint not null references public.recuperacao_planos(id) on delete cascade,
  acao_id bigint, acao text not null, anterior jsonb, atual jsonb not null,
  autor_id uuid references public.perfis(id), criado_em timestamptz not null default now()
);
alter table public.onboarding_dossies enable row level security;
alter table public.onboarding_historico enable row level security;
alter table public.recuperacao_planos enable row level security;
alter table public.recuperacao_acoes enable row level security;
alter table public.recuperacao_historico enable row level security;
drop policy if exists dossie_leitura on public.onboarding_dossies;
create policy dossie_leitura on public.onboarding_dossies for select to authenticated using(public.is_admin() or vendedor_id=auth.uid());
drop policy if exists dossie_historico_leitura on public.onboarding_historico;
create policy dossie_historico_leitura on public.onboarding_historico for select to authenticated using(exists(select 1 from public.onboarding_dossies d where d.id=dossie_id));
drop policy if exists recuperacao_leitura on public.recuperacao_planos;
create policy recuperacao_leitura on public.recuperacao_planos for select to authenticated using(public.is_admin() or cliente_id=auth.uid());
drop policy if exists recuperacao_acoes_leitura on public.recuperacao_acoes;
create policy recuperacao_acoes_leitura on public.recuperacao_acoes for select to authenticated using(exists(select 1 from public.recuperacao_planos p where p.id=plano_id));
drop policy if exists recuperacao_historico_leitura on public.recuperacao_historico;
create policy recuperacao_historico_leitura on public.recuperacao_historico for select to authenticated using(exists(select 1 from public.recuperacao_planos p where p.id=plano_id));
revoke all on public.onboarding_dossies,public.onboarding_historico,public.recuperacao_planos,public.recuperacao_acoes,public.recuperacao_historico from public,anon,authenticated;
grant select on public.onboarding_dossies,public.onboarding_historico,public.recuperacao_planos,public.recuperacao_acoes,public.recuperacao_historico to authenticated;

-- Nome do responsavel apenas dentro dos planos autorizados. Nao abre a tabela de perfis.
create or replace function public.consultar_planos_recuperacao(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('ativo','concluido','cancelado') then raise exception 'Situacao invalida' using errcode='P0001'; end if;
  select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
    'cliente',jsonb_build_object('nome',c.nome),'responsavel',jsonb_build_object('nome',r.nome),
    'acoes',coalesce((select jsonb_agg(to_jsonb(a) order by a.prazo,a.id) from public.recuperacao_acoes a where a.plano_id=p.id),'[]'::jsonb)
  ) order by p.prazo,p.id),'[]'::jsonb) into v_result
  from public.recuperacao_planos p join public.perfis c on c.id=p.cliente_id join public.perfis r on r.id=p.responsavel_id
  where (public.is_admin() or p.cliente_id=auth.uid()) and (p_status is null or p.status=p_status);
  return v_result;
end; $$;
revoke all on function public.consultar_planos_recuperacao(text) from public,anon;
grant execute on function public.consultar_planos_recuperacao(text) to authenticated;

create or replace function public.salvar_dossie(p_id bigint,p_peca bigint,p_diagnostico text,p_documentacao text default '') returns bigint
language plpgsql security definer set search_path=public as $$
declare v_p public.pecas%rowtype; v_d public.onboarding_dossies%rowtype; v_atual jsonb; v_id bigint;
begin
  -- Ordem de bloqueio igual a publicacao: peca antes do dossie.
  select * into v_p from public.pecas where id=case when p_id is null then p_peca else (select peca_id from public.onboarding_dossies where id=p_id) end for update;
  if not found then raise exception 'Peca ou dossie nao encontrado' using errcode='P0002'; end if;
  if not public.is_admin() and (public.perfil_atual() is distinct from 'Vendedor' or v_p.vendedor_id is distinct from auth.uid()) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if coalesce(length(trim(p_diagnostico)),0) not between 1 and 2000 or length(coalesce(p_documentacao,''))>4000 then raise exception 'Informe diagnostico e documentacao validos' using errcode='P0001'; end if;
  if p_id is null then
    if v_p.vendida or v_p.publicacao='publicada' then raise exception 'Abra o dossie antes de publicar a peca' using errcode='P0001'; end if;
    insert into public.onboarding_dossies(peca_id,vendedor_id,diagnostico,documentacao) values(v_p.id,v_p.vendedor_id,trim(p_diagnostico),trim(coalesce(p_documentacao,''))) returning id,to_jsonb(onboarding_dossies.*) into v_id,v_atual;
  else
    select * into v_d from public.onboarding_dossies where id=p_id for update;
    if v_d.status<>'ativo' or v_d.etapa not in ('diagnostico','verificacao','dossie') then raise exception 'O dossie so pode ser editado antes da pericia e enquanto ativo' using errcode='P0001'; end if;
    update public.onboarding_dossies set diagnostico=trim(p_diagnostico),documentacao=trim(coalesce(p_documentacao,'')),atualizado_em=now() where id=p_id returning id,to_jsonb(onboarding_dossies.*) into v_id,v_atual;
  end if;
  insert into public.onboarding_historico(dossie_id,acao,observacao,anterior,atual,autor_id) values(v_id,case when p_id is null then 'cadastro' else 'edicao' end,'Dados do dossie registrados',case when p_id is not null then to_jsonb(v_d) end,v_atual,auth.uid());
  return v_id;
end; $$;
create or replace function public.movimentar_dossie(p_id bigint,p_acao text,p_observacao text) returns void
language plpgsql security definer set search_path=public as $$
declare v_d public.onboarding_dossies%rowtype; v_p public.pecas%rowtype; v_etapa text; v_atual jsonb;
begin
  select p.* into v_p from public.pecas p join public.onboarding_dossies d on d.peca_id=p.id where d.id=p_id for update of p;
  if not found then raise exception 'Dossie nao encontrado' using errcode='P0002'; end if;
  select * into v_d from public.onboarding_dossies where id=p_id for update;
  if not public.is_admin() and (public.perfil_atual() is distinct from 'Vendedor' or v_d.vendedor_id is distinct from auth.uid()) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if coalesce(length(trim(p_observacao)),0) not between 1 and 1000 then raise exception 'Informe justificativa de ate 1000 caracteres' using errcode='P0001'; end if;
  if p_acao='avancar' then
    if not public.is_admin() then raise exception 'Somente administrador valida etapas' using errcode='42501'; end if;
    if v_d.status<>'ativo' then raise exception 'Dossie encerrado' using errcode='P0001'; end if;
    v_etapa:=case v_d.etapa when 'diagnostico' then 'verificacao' when 'verificacao' then 'dossie' when 'dossie' then 'pericia' when 'pericia' then 'curadoria' end;
    if v_etapa is null then raise exception 'A publicacao ocorre pela curadoria da peca' using errcode='P0001'; end if;
    if v_d.etapa='dossie' and (length(trim(v_d.documentacao))=0 or cardinality(v_p.fotografias)=0) then raise exception 'Reuna a documentacao do dossie e fotografe a peca antes da pericia' using errcode='P0001'; end if;
    if v_d.etapa='pericia' and (not exists(select 1 from public.laudos where peca_id=v_p.id) or not exists(select 1 from public.passaportes where peca_id=v_p.id and status='valido')) then raise exception 'A curadoria exige laudo pericial e passaporte valido' using errcode='P0001'; end if;
    update public.onboarding_dossies set etapa=v_etapa,etapa_em=now(),atualizado_em=now() where id=p_id returning to_jsonb(onboarding_dossies.*) into v_atual;
  elsif p_acao='desistir' then
    if v_d.status<>'ativo' or v_p.em_negociacao or v_p.vendida then raise exception 'Somente dossie ativo sem negociacao pode registrar desistencia' using errcode='P0001'; end if;
    update public.onboarding_dossies set status='desistido',motivo=trim(p_observacao),atualizado_em=now() where id=p_id returning to_jsonb(onboarding_dossies.*) into v_atual;
  elsif p_acao='retomar' then
    if v_d.status<>'desistido' then raise exception 'Somente dossie desistido pode ser retomado' using errcode='P0001'; end if;
    update public.onboarding_dossies set status='ativo',motivo=null,etapa_em=now(),atualizado_em=now() where id=p_id returning to_jsonb(onboarding_dossies.*) into v_atual;
  else raise exception 'Acao invalida' using errcode='P0001'; end if;
  insert into public.onboarding_historico(dossie_id,acao,observacao,anterior,atual,autor_id) values(p_id,p_acao,trim(p_observacao),to_jsonb(v_d),v_atual,auth.uid());
end; $$;

-- Primeira publicacao observada; legado usa evidencias existentes, sem inventar datas.
create table if not exists public.publicacoes_cs (
  peca_id bigint primary key references public.pecas(id) on delete cascade,
  vendedor_id uuid not null references public.perfis(id),
  cadastro_em timestamptz not null, publicado_em timestamptz not null,
  fonte text not null check(fonte in ('evento','registro_existente','curadoria')),
  check(publicado_em>=cadastro_em)
);
alter table public.publicacoes_cs enable row level security;
revoke all on public.publicacoes_cs from public,anon,authenticated;
insert into public.publicacoes_cs(peca_id,vendedor_id,cadastro_em,publicado_em,fonte)
select p.id,p.vendedor_id,p.criado_em,coalesce(e.primeira,p.publicado_em),case when e.primeira is null then 'registro_existente' else 'evento' end
from public.pecas p left join lateral(select min(criado_em) primeira from public.eventos_uso where peca_id=p.id and tipo='anuncio_publicado') e on true
where coalesce(e.primeira,p.publicado_em)>=p.criado_em on conflict do nothing;
create or replace function public.validar_publicacao_dossie() returns trigger language plpgsql security definer set search_path=public as $$
declare v_d public.onboarding_dossies%rowtype; v_atual jsonb;
begin
  if new.publicacao='publicada' and old.publicacao is distinct from 'publicada' then
    select * into v_d from public.onboarding_dossies where peca_id=new.id for update;
    if found and v_d.status<>'concluido' then
      if v_d.status<>'ativo' or v_d.etapa<>'curadoria' then raise exception 'Conclua as etapas do dossie antes de publicar' using errcode='P0001'; end if;
      if not exists(select 1 from public.laudos where peca_id=new.id) or not exists(select 1 from public.passaportes where peca_id=new.id and status='valido') then raise exception 'Laudo e passaporte valido sao obrigatorios' using errcode='P0001'; end if;
      update public.onboarding_dossies set etapa='publicacao',status='concluido',etapa_em=now(),atualizado_em=now() where id=v_d.id returning to_jsonb(onboarding_dossies.*) into v_atual;
      insert into public.onboarding_historico(dossie_id,acao,observacao,anterior,atual,autor_id) values(v_d.id,'publicacao','Publicacao aprovada pela curadoria',to_jsonb(v_d),v_atual,auth.uid());
    end if;
    insert into public.publicacoes_cs(peca_id,vendedor_id,cadastro_em,publicado_em,fonte) values(new.id,new.vendedor_id,new.criado_em,now(),'curadoria') on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.validar_publicacao_dossie() from public,anon,authenticated;
drop trigger if exists pecas_dossie_publicacao on public.pecas;
create trigger pecas_dossie_publicacao after update of publicacao on public.pecas for each row execute function public.validar_publicacao_dossie();

create or replace function public.salvar_plano_recuperacao(p_id bigint,p_cliente uuid,p_responsavel uuid,p_objetivo text,p_prazo date) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_p public.recuperacao_planos%rowtype; v_atual jsonb; v_id bigint;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if coalesce(length(trim(p_objetivo)),0) not between 1 and 1000 or p_prazo is null or p_prazo<(now() at time zone 'America/Sao_Paulo')::date
    or not exists(select 1 from public.perfis where id=p_responsavel and perfil='Administrador') then raise exception 'Informe objetivo, prazo e responsavel administrador validos' using errcode='P0001'; end if;
  if p_id is null then
    if not exists(select 1 from public.perfis where id=p_cliente and perfil in ('Comprador','Vendedor','Perito')) then raise exception 'Cliente invalido' using errcode='P0001'; end if;
    insert into public.recuperacao_planos(cliente_id,responsavel_id,objetivo,prazo) values(p_cliente,p_responsavel,trim(p_objetivo),p_prazo) returning id,to_jsonb(recuperacao_planos.*) into v_id,v_atual;
  else
    select * into v_p from public.recuperacao_planos where id=p_id for update;
    if not found then raise exception 'Plano nao encontrado' using errcode='P0002'; end if;
    if v_p.status<>'ativo' then raise exception 'Plano encerrado nao permite edicao' using errcode='P0001'; end if;
    if p_cliente is distinct from v_p.cliente_id or exists(select 1 from public.recuperacao_acoes where plano_id=p_id and status in ('pendente','em_andamento') and prazo>p_prazo) then raise exception 'Preserve o cliente e um prazo que comporte as acoes abertas' using errcode='P0001'; end if;
    update public.recuperacao_planos set responsavel_id=p_responsavel,objetivo=trim(p_objetivo),prazo=p_prazo,atualizado_em=now() where id=p_id returning id,to_jsonb(recuperacao_planos.*) into v_id,v_atual;
  end if;
  insert into public.recuperacao_historico(plano_id,acao,anterior,atual,autor_id) values(v_id,case when p_id is null then 'criar_plano' else 'editar_plano' end,case when p_id is not null then to_jsonb(v_p) end,v_atual,auth.uid());
  return v_id;
end; $$;
create or replace function public.salvar_acao_recuperacao(p_id bigint,p_plano bigint,p_descricao text,p_prazo date) returns bigint
language plpgsql security definer set search_path=public as $$
declare v_p public.recuperacao_planos%rowtype; v_a public.recuperacao_acoes%rowtype; v_atual jsonb; v_id bigint;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into v_p from public.recuperacao_planos where id=p_plano for update;
  if not found then raise exception 'Plano nao encontrado' using errcode='P0002'; end if;
  if v_p.status<>'ativo' or coalesce(length(trim(p_descricao)),0) not between 1 and 1000 or p_prazo is null or p_prazo>v_p.prazo or p_prazo<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Acao exige plano ativo, descricao e prazo dentro do plano' using errcode='P0001'; end if;
  if p_id is null then
    insert into public.recuperacao_acoes(plano_id,descricao,prazo) values(p_plano,trim(p_descricao),p_prazo) returning id,to_jsonb(recuperacao_acoes.*) into v_id,v_atual;
  else
    select * into v_a from public.recuperacao_acoes where id=p_id and plano_id=p_plano for update;
    if not found then raise exception 'Acao nao encontrada' using errcode='P0002'; end if;
    if v_a.status not in ('pendente','em_andamento') then raise exception 'Acao encerrada nao permite edicao' using errcode='P0001'; end if;
    update public.recuperacao_acoes set descricao=trim(p_descricao),prazo=p_prazo,atualizado_em=now() where id=p_id returning id,to_jsonb(recuperacao_acoes.*) into v_id,v_atual;
  end if;
  insert into public.recuperacao_historico(plano_id,acao_id,acao,anterior,atual,autor_id) values(p_plano,v_id,case when p_id is null then 'criar_acao' else 'editar_acao' end,case when p_id is not null then to_jsonb(v_a) end,v_atual,auth.uid());
  return v_id;
end; $$;
create or replace function public.movimentar_acao_recuperacao(p_id bigint,p_status text,p_resultado text) returns void
language plpgsql security definer set search_path=public as $$
declare v_p public.recuperacao_planos%rowtype; v_a public.recuperacao_acoes%rowtype; v_atual jsonb;
begin
  select p.* into v_p from public.recuperacao_planos p join public.recuperacao_acoes a on a.plano_id=p.id where a.id=p_id for update of p;
  if not found then raise exception 'Acao nao encontrada' using errcode='P0002'; end if;
  if not public.is_admin() and v_p.cliente_id is distinct from auth.uid() then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into v_a from public.recuperacao_acoes where id=p_id for update;
  if v_p.status<>'ativo' or v_a.status not in ('pendente','em_andamento') or p_status is null or p_status not in ('em_andamento','concluida','cancelada') or p_status=v_a.status then raise exception 'Transicao invalida ou registro encerrado' using errcode='P0001'; end if;
  if p_status='cancelada' and not public.is_admin() then raise exception 'Somente administrador cancela acoes' using errcode='42501'; end if;
  if coalesce(length(trim(p_resultado)),0) not between 1 and 1000 then raise exception 'Registre o resultado ou justificativa' using errcode='P0001'; end if;
  update public.recuperacao_acoes set status=p_status,resultado=trim(p_resultado),concluida_em=case when p_status='concluida' then now() end,atualizado_em=now() where id=p_id returning to_jsonb(recuperacao_acoes.*) into v_atual;
  insert into public.recuperacao_historico(plano_id,acao_id,acao,anterior,atual,autor_id) values(v_p.id,p_id,p_status,to_jsonb(v_a),v_atual,auth.uid());
end; $$;
create or replace function public.encerrar_plano_recuperacao(p_id bigint,p_status text,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare v_p public.recuperacao_planos%rowtype; v_atual jsonb; v_a record;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into v_p from public.recuperacao_planos where id=p_id for update;
  if not found then raise exception 'Plano nao encontrado' using errcode='P0002'; end if;
  if v_p.status<>'ativo' or p_status is null or p_status not in ('concluido','cancelado') or coalesce(length(trim(p_motivo)),0) not between 1 and 1000 then raise exception 'Informe encerramento e justificativa validos' using errcode='P0001'; end if;
  if p_status='concluido' and (not exists(select 1 from public.recuperacao_acoes where plano_id=p_id and status='concluida') or exists(select 1 from public.recuperacao_acoes where plano_id=p_id and status in ('pendente','em_andamento'))) then raise exception 'Conclua as acoes antes de encerrar o plano' using errcode='P0001'; end if;
  if p_status='cancelado' then
    for v_a in select id from public.recuperacao_acoes where plano_id=p_id and status in ('pendente','em_andamento') loop
      perform public.movimentar_acao_recuperacao(v_a.id,'cancelada',p_motivo);
    end loop;
  end if;
  update public.recuperacao_planos set status=p_status,motivo=trim(p_motivo),encerrado_em=now(),atualizado_em=now() where id=p_id returning to_jsonb(recuperacao_planos.*) into v_atual;
  insert into public.recuperacao_historico(plano_id,acao,anterior,atual,autor_id) values(p_id,p_status,to_jsonb(v_p),v_atual,auth.uid());
end; $$;

-- Classificacao estruturada evita divulgar motivos livres (e possiveis dados pessoais) no RF03.
alter table public.transacoes add column if not exists categoria_contestacao text check(categoria_contestacao in ('autenticidade','conservacao','documentacao','entrega','outro'));
update public.transacoes set categoria_contestacao='outro' where motivo_contestacao is not null and categoria_contestacao is null;
do $$ begin
  if to_regprocedure('public.conferir_entrega_base(bigint,boolean,text,text)') is null then
    alter function public.conferir_entrega(bigint,boolean,text,text) rename to conferir_entrega_base;
  end if;
end $$;
revoke all on function public.conferir_entrega_base(bigint,boolean,text,text) from public,anon,authenticated;
create or replace function public.conferir_entrega(p_id bigint,p_aprovada boolean,p_motivo text default null,p_estado text default null,p_categoria text default 'outro') returns void
language plpgsql security definer set search_path=public as $$
begin
  if not p_aprovada and (p_categoria is null or p_categoria not in ('autenticidade','conservacao','documentacao','entrega','outro')) then raise exception 'Categoria de contestacao invalida' using errcode='P0001'; end if;
  perform public.conferir_entrega_base(p_id,p_aprovada,p_motivo,p_estado);
  if not p_aprovada then update public.transacoes set categoria_contestacao=p_categoria where id=p_id; end if;
end; $$;

-- Conserva validacao, pontuacao e filtros existentes; acrescenta so agregados operacionais.
do $$ begin
  if to_regprocedure('public.relatorio_saude_base_core(date,date,text,text)') is null then
    alter function public.relatorio_saude_base(date,date,text,text) rename to relatorio_saude_base_core;
  end if;
end $$;
revoke all on function public.relatorio_saude_base_core(date,date,text,text) from public,anon,authenticated;
create or replace function public.relatorio_saude_base(p_inicio date,p_fim date,p_perfil text default null,p_coorte text default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_base jsonb; v_op jsonb; t0 timestamptz:=p_inicio::timestamp at time zone 'America/Sao_Paulo'; t1 timestamptz:=(p_fim+1)::timestamp at time zone 'America/Sao_Paulo';
begin
  v_base:=public.relatorio_saude_base_core(p_inicio,p_fim,p_perfil,p_coorte);
  with clientes as (select usuario_id from public.health_sinais(p_inicio,p_fim) where (p_perfil is null or perfil=p_perfil) and (p_coorte is null or coorte=p_coorte)),
  planos as (select p.* from public.recuperacao_planos p join clientes c on c.usuario_id=p.cliente_id where p.criado_em>=t0 and p.criado_em<t1),
  acoes as (select a.* from public.recuperacao_acoes a join public.recuperacao_planos p on p.id=a.plano_id join clientes c on c.usuario_id=p.cliente_id where a.criado_em>=t0 and a.criado_em<t1),
  conferencias as (select t.* from public.transacoes t where t.conferida_em>=t0 and t.conferida_em<t1 and exists(select 1 from clientes c where c.usuario_id in (t.comprador_id,t.vendedor_id))),
  disputas as (select coalesce(categoria_contestacao,'outro') motivo,count(*) quantidade from conferencias where motivo_contestacao is not null group by 1),
  publicacoes as (select p.* from public.publicacoes_cs p join clientes c on c.usuario_id=p.vendedor_id where p.publicado_em>=t0 and p.publicado_em<t1),
  dossies as (select d.* from public.onboarding_dossies d join clientes c on c.usuario_id=d.vendedor_id where d.criado_em>=t0 and d.criado_em<t1)
  select jsonb_build_object(
    'planos',(select jsonb_build_object('total',count(*),'ativos',count(*) filter(where status='ativo'),'concluidos',count(*) filter(where status='concluido'),'cancelados',count(*) filter(where status='cancelado')) from planos),
    'acoes',(select jsonb_build_object('total',count(*),'pendentes',count(*) filter(where status='pendente'),'emAndamento',count(*) filter(where status='em_andamento'),'concluidas',count(*) filter(where status='concluida'),'canceladas',count(*) filter(where status='cancelada'),'atrasadas',count(*) filter(where status in ('pendente','em_andamento') and prazo<(now() at time zone 'America/Sao_Paulo')::date)) from acoes),
    'conferencias',(select jsonb_build_object('total',count(*),'aprovadas',count(*) filter(where status='confirmada'),'semDisputa',count(*) filter(where status='confirmada' and motivo_contestacao is null),'contestadas',count(*) filter(where motivo_contestacao is not null),'taxaAprovacao',round(100.0*count(*) filter(where status='confirmada')/nullif(count(*),0),1)) from conferencias),
    'disputas',coalesce((select jsonb_agg(to_jsonb(d) order by motivo) from disputas d),'[]'::jsonb),
    'publicacao',(select jsonb_build_object('quantidade',count(*),'mediaDias',round(avg(extract(epoch from (publicado_em-cadastro_em))/86400),2),'registrosLegados',count(*) filter(where fonte='registro_existente')) from publicacoes),
    'dossies',(select jsonb_build_object('total',count(*),'ativos',count(*) filter(where status='ativo'),'parados',count(*) filter(where status='ativo' and etapa_em<now()-interval '10 days'),'desistidos',count(*) filter(where status='desistido'),'publicados',count(*) filter(where status='concluido')) from dossies)
  ) into v_op;
  return v_base||jsonb_build_object('operacao',v_op);
end; $$;

revoke all on function public.salvar_dossie(bigint,bigint,text,text),public.movimentar_dossie(bigint,text,text),public.salvar_plano_recuperacao(bigint,uuid,uuid,text,date),public.salvar_acao_recuperacao(bigint,bigint,text,date),public.movimentar_acao_recuperacao(bigint,text,text),public.encerrar_plano_recuperacao(bigint,text,text),public.conferir_entrega(bigint,boolean,text,text,text),public.relatorio_saude_base(date,date,text,text) from public,anon;
grant execute on function public.salvar_dossie(bigint,bigint,text,text),public.movimentar_dossie(bigint,text,text),public.salvar_plano_recuperacao(bigint,uuid,uuid,text,date),public.salvar_acao_recuperacao(bigint,bigint,text,date),public.movimentar_acao_recuperacao(bigint,text,text),public.encerrar_plano_recuperacao(bigint,text,text),public.conferir_entrega(bigint,boolean,text,text,text),public.relatorio_saude_base(date,date,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
