-- Growth: lista de espera (RFC17), indicacoes e origem das contas (RFC18), indicadores de growth (RFC19),
-- experimentos com ICE Score (RFC20) e painel de indicadores (RF04).
-- Executar depois de schema-rfc12-rfc13-prazos.sql. Aditivo: pode ser executado mais de uma vez.
begin;

-- ===================================================================================================
-- RFC18: origem de toda conta nova (indicacao, link, lista de espera, conteudo ou anuncio)
-- ===================================================================================================
alter table public.perfis add column if not exists origem text not null default 'direto';
alter table public.perfis drop constraint if exists perfis_origem_check;
alter table public.perfis add constraint perfis_origem_check
  check (origem in ('indicação', 'link', 'lista de espera', 'conteúdo', 'anúncio', 'direto'));

create table if not exists public.indicacoes (
  id bigint generated always as identity primary key,
  indicador_id uuid not null references public.perfis (id) on delete cascade,
  nome varchar(150) not null check (length(trim(nome)) > 0),
  contato varchar(255) not null check (contato ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  perfil text not null check (perfil in ('comprador', 'vendedor')),
  status text not null default 'enviada' check (status in ('enviada', 'cadastrada', 'ativada')),
  codigo text not null unique default encode(extensions.gen_random_bytes(8), 'hex'),
  usuario_id uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cadastrada_em timestamptz,
  ativada_em timestamptz
);
create index if not exists indicacoes_indicador_idx on public.indicacoes (indicador_id);
create unique index if not exists indicacoes_contato_aberta_idx on public.indicacoes (lower(contato)) where status = 'enviada';

-- ===================================================================================================
-- RFC17: lista de espera
-- ===================================================================================================
create table if not exists public.lista_espera (
  id bigint generated always as identity primary key,
  nome varchar(150) not null check (length(trim(nome)) > 0),
  email varchar(255) not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  perfil text not null check (perfil in ('comprador', 'vendedor')),
  categorias text[] not null default '{}' check (categorias <@ array['obra de arte', 'joia', 'relógio', 'bolsa']::text[]),
  versao_pagina text not null default 'a' check (versao_pagina ~ '^[a-z0-9-]{1,20}$'),
  origem text not null default 'direto' check (length(origem) between 1 and 40),
  link_id bigint references public.passaporte_links (id) on delete set null,
  indicacao_id bigint references public.indicacoes (id) on delete set null,
  consentimento boolean not null check (consentimento),
  status text not null default 'aguardando' check (status in ('aguardando', 'convidado', 'cadastrado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists lista_espera_email_idx on public.lista_espera (lower(email));

alter table public.indicacoes enable row level security;
alter table public.lista_espera enable row level security;
drop policy if exists indicacoes_select on public.indicacoes;
create policy indicacoes_select on public.indicacoes for select to authenticated
  using (indicador_id = auth.uid() or public.is_admin());
drop policy if exists lista_espera_select on public.lista_espera;
create policy lista_espera_select on public.lista_espera for select to authenticated using (public.is_admin());
revoke all on public.indicacoes, public.lista_espera from public, anon, authenticated;
grant select on public.indicacoes, public.lista_espera to authenticated;

-- origem livre (utm_source ou ?origem=) normalizada para o registro
create or replace function public.normalizar_origem(p_origem text)
returns text language sql immutable as $$
  select case
    when coalesce(trim(p_origem), '') = '' then 'direto'
    when lower(trim(p_origem)) ~ '^[a-z0-9 _.-]{1,40}$' then lower(trim(p_origem))
    else 'outro'
  end;
$$;

-- RFS57: o visitante se inscreve sem cadastro; versao da pagina e origem sao registradas automaticamente.
-- O convite de uma indicacao (RFS61) e o link de um passaporte (RFS54) ficam vinculados a inscricao.
create or replace function public.inscrever_lista_espera(
  p_nome text, p_email text, p_perfil text, p_categorias text[], p_versao text, p_origem text,
  p_consentimento boolean, p_link_token text default null, p_convite text default null
)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; v_email text := lower(trim(p_email)); v_origem text := public.normalizar_origem(p_origem);
  v_link bigint; v_indicacao bigint; v_versao text := lower(trim(coalesce(p_versao, '')));
begin
  if coalesce(length(trim(p_nome)), 0) not between 1 and 150 then raise exception 'Informe o nome' using errcode = 'P0001'; end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido' using errcode = 'P0001'; end if;
  if p_perfil is null or p_perfil not in ('comprador', 'vendedor') then raise exception 'Escolha o perfil: comprador ou vendedor' using errcode = 'P0001'; end if;
  if not coalesce(p_categorias, '{}') <@ array['obra de arte', 'joia', 'relógio', 'bolsa']::text[] then
    raise exception 'Categoria de interesse inválida' using errcode = 'P0001';
  end if;
  if not coalesce(p_consentimento, false) then
    raise exception 'É preciso concordar com o uso dos dados para entrar na lista de espera' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lista_espera where lower(email) = v_email) then
    raise exception 'Este e-mail já está na lista de espera' using errcode = '23505';
  end if;
  if v_versao !~ '^[a-z0-9-]{1,20}$' then v_versao := 'a'; end if;

  if p_convite is not null then
    select id into v_indicacao from public.indicacoes where codigo = p_convite and status = 'enviada';
    if v_indicacao is not null then v_origem := 'indicação'; end if;
  end if;
  if v_indicacao is null and p_link_token is not null then
    select id into v_link from public.passaporte_links where token = p_link_token;
    if v_link is not null then v_origem := 'link'; end if;
  end if;

  insert into public.lista_espera (nome, email, perfil, categorias, versao_pagina, origem, link_id, indicacao_id, consentimento)
  values (trim(p_nome), v_email, p_perfil, coalesce(p_categorias, '{}'), v_versao, v_origem, v_link, v_indicacao, true)
  returning id into v_id;

  perform public.registrar_evento_interno('lista_espera_inscricao', null, case when v_link is not null then 'link' else 'plataforma' end,
    null, null, v_link, jsonb_build_object('versao', v_versao, 'origem', v_origem, 'perfil', p_perfil));
  return v_id;
end;
$$;

-- RFS58: filtros por perfil, categoria, versao da pagina, origem e periodo, com o total por versao
create or replace function public.consultar_lista_espera(
  p_perfil text default null, p_categoria text default null, p_versao text default null, p_origem text default null,
  p_inicio date default null, p_fim date default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_r jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  with sel as (
    select * from public.lista_espera
    where (p_perfil is null or perfil = p_perfil)
      and (p_categoria is null or p_categoria = any (categorias))
      and (p_versao is null or versao_pagina = p_versao)
      and (p_origem is null or origem = p_origem)
      and (p_inicio is null or (criado_em at time zone 'America/Sao_Paulo')::date >= p_inicio)
      and (p_fim is null or (criado_em at time zone 'America/Sao_Paulo')::date <= p_fim)
  )
  select jsonb_build_object(
    'total', (select count(*) from sel),
    'porVersao', coalesce((select jsonb_agg(jsonb_build_object('versao', versao_pagina, 'total', n) order by versao_pagina)
                             from (select versao_pagina, count(*) as n from sel group by versao_pagina) v), '[]'::jsonb),
    'inscricoes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'nome', nome, 'email', email, 'perfil', perfil, 'categorias', categorias, 'versao', versao_pagina,
        'origem', origem, 'status', status, 'criadoEm', criado_em) order by criado_em desc) from sel), '[]'::jsonb)
  ) into v_r;
  return v_r;
end;
$$;

-- RFS59: o administrador atualiza os dados e o status (aguardando, convidado, cadastrado)
create or replace function public.editar_inscricao(p_id bigint, p_nome text, p_email text, p_perfil text, p_categorias text[], p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if not exists (select 1 from public.lista_espera where id = p_id) then raise exception 'Inscrição não encontrada' using errcode = 'P0002'; end if;
  if p_status is null or p_status not in ('aguardando', 'convidado', 'cadastrado') then raise exception 'Status inválido' using errcode = 'P0001'; end if;
  if coalesce(length(trim(p_nome)), 0) not between 1 and 150 then raise exception 'Informe o nome' using errcode = 'P0001'; end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido' using errcode = 'P0001'; end if;
  if p_perfil is null or p_perfil not in ('comprador', 'vendedor') then raise exception 'Escolha o perfil: comprador ou vendedor' using errcode = 'P0001'; end if;
  if not coalesce(p_categorias, '{}') <@ array['obra de arte', 'joia', 'relógio', 'bolsa']::text[] then
    raise exception 'Categoria de interesse inválida' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lista_espera where lower(email) = v_email and id <> p_id) then
    raise exception 'Este e-mail já está na lista de espera' using errcode = '23505';
  end if;
  update public.lista_espera set nome = trim(p_nome), email = v_email, perfil = p_perfil, categorias = coalesce(p_categorias, '{}'),
    status = p_status, atualizado_em = now() where id = p_id;
end;
$$;

-- RFS60: exclui a inscricao, inclusive a pedido do inscrito
create or replace function public.remover_inscricao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  delete from public.lista_espera where id = p_id;
  if not found then raise exception 'Inscrição não encontrada' using errcode = 'P0002'; end if;
end;
$$;

-- ===================================================================================================
-- RFC18: indicacoes
-- ===================================================================================================
create or replace function public.validar_indicacao(p_nome text, p_contato text, p_ignorar bigint)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(length(trim(p_nome)), 0) not between 1 and 150 then raise exception 'Informe o nome do indicado' using errcode = 'P0001'; end if;
  if p_contato is null or trim(p_contato) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Informe o e-mail do indicado' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.perfis where lower(email) = lower(trim(p_contato))) then
    raise exception 'Esta pessoa já tem conta na Lastro' using errcode = '23505';
  end if;
  if exists (select 1 from public.indicacoes where lower(contato) = lower(trim(p_contato)) and status = 'enviada'
             and id is distinct from p_ignorar) then
    raise exception 'Esta pessoa já foi indicada e o convite ainda não foi aceito' using errcode = '23505';
  end if;
end;
$$;
revoke all on function public.validar_indicacao(text, text, bigint) from public, anon, authenticated;

-- RFS61: registra o indicado e gera o convite (link da lista de espera com o codigo), vinculando a futura conta
create or replace function public.criar_indicacao(p_nome text, p_contato text, p_perfil text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_codigo text;
begin
  if auth.uid() is null then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_perfil is null or p_perfil not in ('comprador', 'vendedor') then raise exception 'Escolha o perfil do indicado: comprador ou vendedor' using errcode = 'P0001'; end if;
  perform public.validar_indicacao(p_nome, p_contato, null);
  insert into public.indicacoes (indicador_id, nome, contato, perfil)
  values (auth.uid(), trim(p_nome), lower(trim(p_contato)), p_perfil)
  returning id, codigo into v_id, v_codigo;
  perform public.registrar_evento_interno('indicacao_enviada', auth.uid(), 'plataforma', null, null, null,
    jsonb_build_object('indicacao_id', v_id, 'perfil', p_perfil));
  return jsonb_build_object('id', v_id, 'codigo', v_codigo);
end;
$$;

-- RFS63: corrige o contato enquanto o convite nao for aceito
create or replace function public.editar_indicacao(p_id bigint, p_nome text, p_contato text)
returns void language plpgsql security definer set search_path = public as $$
declare v_i public.indicacoes%rowtype;
begin
  select * into v_i from public.indicacoes where id = p_id for update;
  if not found or (v_i.indicador_id <> auth.uid() and not public.is_admin()) then raise exception 'Indicação não encontrada' using errcode = 'P0002'; end if;
  if v_i.status <> 'enviada' then raise exception 'O convite já foi aceito; a indicação não pode mais ser alterada' using errcode = 'P0001'; end if;
  perform public.validar_indicacao(p_nome, p_contato, p_id);
  update public.indicacoes set nome = trim(p_nome), contato = lower(trim(p_contato)), atualizado_em = now() where id = p_id;
end;
$$;

-- RFS64: cancela uma indicacao ainda nao aceita
create or replace function public.remover_indicacao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_i public.indicacoes%rowtype;
begin
  select * into v_i from public.indicacoes where id = p_id for update;
  if not found or (v_i.indicador_id <> auth.uid() and not public.is_admin()) then raise exception 'Indicação não encontrada' using errcode = 'P0002'; end if;
  if v_i.status <> 'enviada' then raise exception 'Só é possível cancelar uma indicação cujo convite ainda não foi aceito' using errcode = 'P0001'; end if;
  delete from public.indicacoes where id = p_id;
end;
$$;

-- RFS62: indicacoes de quem indicou (o administrador ve todas), com o status
create or replace view public.vw_indicacoes as
select i.id, i.indicador_id, p.nome as indicador_nome, i.nome, i.contato, i.perfil, i.status, i.codigo,
       i.criado_em, i.cadastrada_em, i.ativada_em
  from public.indicacoes i join public.perfis p on p.id = i.indicador_id
 where i.indicador_id = auth.uid() or public.is_admin();
grant select on public.vw_indicacoes to authenticated;

-- A conta nova recebe a origem pela indicacao ou pela inscricao na lista de espera com o mesmo e-mail
create or replace function public.perfis_origem_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_le public.lista_espera%rowtype;
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.indicacoes where lower(contato) = lower(new.email) and status = 'enviada') then
      new.origem := 'indicação';
    else
      select * into v_le from public.lista_espera where lower(email) = lower(new.email);
      if found then
        new.origem := case
          when v_le.indicacao_id is not null or v_le.origem = 'indicação' then 'indicação'
          when v_le.link_id is not null or v_le.origem = 'link' then 'link'
          when v_le.origem in ('conteudo', 'conteúdo') then 'conteúdo'
          when v_le.origem in ('anuncio', 'anúncio', 'ads') then 'anúncio'
          else 'lista de espera'
        end;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists perfis_origem_trg on public.perfis;
create trigger perfis_origem_trg before insert on public.perfis for each row execute function public.perfis_origem_trg();

create or replace function public.perfis_vinculo_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.indicacoes set status = 'cadastrada', usuario_id = new.id, cadastrada_em = now(), atualizado_em = now()
   where id = coalesce(
     (select id from public.indicacoes where lower(contato) = lower(new.email) and status = 'enviada' order by id limit 1),
     (select indicacao_id from public.lista_espera where lower(email) = lower(new.email)));
  update public.lista_espera set status = 'cadastrado', atualizado_em = now() where lower(email) = lower(new.email);
  perform public.registrar_evento_interno('conta_criada', new.id, 'plataforma', null, null, null, jsonb_build_object('origem', new.origem));
  return new;
end;
$$;
drop trigger if exists perfis_vinculo_trg on public.perfis;
create trigger perfis_vinculo_trg after insert on public.perfis for each row execute function public.perfis_vinculo_trg();
revoke all on function public.perfis_origem_trg(), public.perfis_vinculo_trg() from public, anon, authenticated;

-- O administrador informa a origem de uma conta criada sem indicacao nem lista de espera (conteudo ou anuncio)
create or replace function public.definir_origem_conta(p_id uuid, p_origem text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_origem is null or p_origem not in ('link', 'conteúdo', 'anúncio', 'direto') then raise exception 'Origem inválida' using errcode = 'P0001'; end if;
  update public.perfis set origem = p_origem where id = p_id and origem = 'direto';
end;
$$;

-- a indicacao e ativada no primeiro login da conta indicada
create or replace function public.registrar_sessao(p_origem text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  perform public.registrar_evento_interno('sessao_inicio', auth.uid(), p_origem, null, null, null, '{}'::jsonb);
  update public.indicacoes set status = 'ativada', ativada_em = now(), atualizado_em = now()
   where usuario_id = auth.uid() and status = 'cadastrada';
end;
$$;

-- ===================================================================================================
-- RFC20: experimentos de growth (ICE Score = media das notas de impacto, confianca e facilidade)
-- ===================================================================================================
create table if not exists public.experimentos (
  id bigint generated always as identity primary key,
  titulo varchar(150) not null unique check (length(trim(titulo)) > 0),
  hipotese text not null check (length(trim(hipotese)) > 0),
  etapa text not null check (etapa in ('aquisição', 'ativação', 'retenção', 'receita', 'indicação')),
  indicador text not null check (length(trim(indicador)) > 0),
  impacto smallint not null check (impacto between 1 and 10),
  confianca smallint not null check (confianca between 1 and 10),
  facilidade smallint not null check (facilidade between 1 and 10),
  ice numeric(3, 1) generated always as (round((impacto + confianca + facilidade) / 3.0, 1)) stored,
  criterio_sucesso text not null check (length(trim(criterio_sucesso)) > 0),
  status text not null default 'backlog' check (status in ('backlog', 'em execução', 'concluído', 'descartado')),
  resultado text,
  decisao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz
);
alter table public.experimentos enable row level security;
drop policy if exists experimentos_select on public.experimentos;
create policy experimentos_select on public.experimentos for select to authenticated using (public.is_admin());
revoke all on public.experimentos from public, anon, authenticated;
grant select on public.experimentos to authenticated;

-- RFS69 e RFS71: insere (p_id nulo) ou atualiza notas, status, resultado e decisao.
-- O experimento concluido exige resultado e decisao; experimento iniciado nao volta ao backlog.
create or replace function public.salvar_experimento(
  p_id bigint, p_titulo text, p_hipotese text, p_etapa text, p_indicador text,
  p_impacto integer, p_confianca integer, p_facilidade integer, p_criterio text,
  p_status text default 'backlog', p_resultado text default null, p_decisao text default null
)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_atual public.experimentos%rowtype; v_id bigint;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if coalesce(p_status, '') not in ('backlog', 'em execução', 'concluído', 'descartado') then raise exception 'Status inválido' using errcode = 'P0001'; end if;
  if p_status = 'concluído' and (coalesce(trim(p_resultado), '') = '' or coalesce(trim(p_decisao), '') = '') then
    raise exception 'Para concluir o experimento, registre o resultado e a decisão tomada' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.experimentos where lower(titulo) = lower(trim(p_titulo)) and id is distinct from p_id) then
    raise exception 'Já existe um experimento com este título' using errcode = '23505';
  end if;
  if p_id is null then
    if p_status <> 'backlog' then raise exception 'O experimento novo entra no backlog' using errcode = 'P0001'; end if;
    insert into public.experimentos (titulo, hipotese, etapa, indicador, impacto, confianca, facilidade, criterio_sucesso)
    values (trim(p_titulo), trim(p_hipotese), p_etapa, trim(p_indicador), p_impacto, p_confianca, p_facilidade, trim(p_criterio))
    returning id into v_id;
    return v_id;
  end if;
  select * into v_atual from public.experimentos where id = p_id for update;
  if not found then raise exception 'Experimento não encontrado' using errcode = 'P0002'; end if;
  if v_atual.status in ('concluído', 'descartado') and p_status <> v_atual.status then
    raise exception 'Experimento % fica no histórico e não muda de status', v_atual.status using errcode = 'P0001';
  end if;
  if v_atual.status <> 'backlog' and p_status = 'backlog' then
    raise exception 'Um experimento iniciado não volta ao backlog' using errcode = 'P0001';
  end if;
  update public.experimentos set titulo = trim(p_titulo), hipotese = trim(p_hipotese), etapa = p_etapa, indicador = trim(p_indicador),
    impacto = p_impacto, confianca = p_confianca, facilidade = p_facilidade, criterio_sucesso = trim(p_criterio),
    status = p_status, resultado = nullif(trim(p_resultado), ''), decisao = nullif(trim(p_decisao), ''),
    concluido_em = case when p_status = 'concluído' and v_atual.status <> 'concluído' then now() else concluido_em end,
    atualizado_em = now()
  where id = p_id;
  return p_id;
end;
$$;

-- RFS72: exclui apenas experimentos em backlog; os concluidos ficam no historico
create or replace function public.remover_experimento(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select status into v_status from public.experimentos where id = p_id for update;
  if not found then raise exception 'Experimento não encontrado' using errcode = 'P0002'; end if;
  if v_status <> 'backlog' then raise exception 'Só é possível excluir experimentos em backlog' using errcode = 'P0001'; end if;
  delete from public.experimentos where id = p_id;
end;
$$;

-- backlog priorizado do Plano de Growth (secao 3)
insert into public.experimentos (titulo, hipotese, etapa, indicador, impacto, confianca, facilidade, criterio_sucesso) values
  ('X1 · Passaporte privado primeiro', 'Se o vendedor puder registrar a peça sem que nada fique público até ele decidir, mais vendedores indicados aceitarão o diagnóstico do acervo.', 'aquisição', 'A4 · Contatos de vendedor por indicação que viram diagnóstico', 8, 7, 7, 'Pelo menos 2 de 5 vendedores indicados aceitam o diagnóstico.'),
  ('X2 · Teste de leitura do passaporte-exemplo', 'Se o passaporte se explicar sozinho, o comprador chega ao primeiro valor na primeira sessão, sem depender de nós.', 'ativação', 'B1 · Primeiras sessões com laudo aberto', 6, 7, 9, 'Pelo menos 4 de 5 pessoas explicam o passaporte sem ajuda.'),
  ('X3 · Programa de perito fundador', 'Se o perito ganhar nome público e laudos consultáveis e citados a cada revenda, pelo menos dois dos quatro laboratórios mapeados aceitam assinar um laudo piloto.', 'aquisição', 'A5 · Peritos credenciados ativos', 9, 5, 7, 'Dois peritos aceitam assinar o laudo piloto.'),
  ('X4 · Vendedor indicado pelo perito', 'Se o vendedor chegar por indicação de um perito que ele já conhece, a conversão de contato em diagnóstico deixa de ser zero.', 'aquisição', 'A4 · Contatos de vendedor por indicação que viram diagnóstico', 8, 6, 5, 'Pelo menos um em cada três indicados chega ao diagnóstico.'),
  ('X5 · Bolsas na lista de espera', 'Se a lista de espera incluir bolsas, as inscrições de compradores aumentam.', 'aquisição', 'Inscrições na lista de espera por versão da página', 6, 6, 7, 'A versão com bolsas gera pelo menos 30% mais inscrições.'),
  ('X6 · Importação da planilha do colecionador', 'Se a planilha do colecionador virar passaportes rascunho, ele completa parte deles.', 'retenção', 'R3 · Passaportes atualizados em 90 dias', 6, 6, 6, 'A definir pelo grupo antes do início.'),
  ('X7 · Crédito da emissão', 'Abater a emissão da comissão da primeira venda leva mais vendedores até o dossiê.', 'receita', 'F3 · Receita de emissão, manutenção e reavaliação', 6, 5, 6, 'A definir pelo grupo antes do início.'),
  ('X8 · Link em negociação real', 'O link do passaporte enviado aos interessados traz novos usuários.', 'indicação', 'I2 · Novos usuários por passaporte compartilhado', 7, 5, 5, 'A definir pelo grupo antes do início.'),
  ('X9 · Alertas à mão por lista de desejos', 'Alertas de peças compatíveis fazem colecionadores voltarem sem ser chamados.', 'retenção', 'R1 · Usuários habituais', 5, 4, 7, 'A definir pelo grupo antes do início.'),
  ('X10 · Política de recusa na landing', 'Mostrar a regra da curadoria e quantas peças ela recusa aumenta a inscrição.', 'aquisição', 'Inscrições na lista de espera por versão da página', 4, 4, 8, 'A definir pelo grupo antes do início.'),
  ('X11 · Diagnóstico por advogado de inventário', 'Herdeiros indicados por escritórios de sucessão aceitam o diagnóstico gratuito do acervo.', 'aquisição', 'A4 · Contatos de vendedor por indicação que viram diagnóstico', 7, 4, 4, 'A definir pelo grupo antes do início.'),
  ('X12 · História de procedência', 'Publicar o caso documentado de uma peça atrai compradores em grupos de colecionadores.', 'aquisição', 'A2 · Primeiras consultas vindas de link ou QR', 5, 4, 6, 'A definir pelo grupo antes do início.'),
  ('X13 · Garantias na hora da proposta', 'Mostrar escrow, seguro e prazo de conferência na proposta reduz negociações fora da plataforma.', 'receita', 'F1 · Propostas que viram pagamento', 7, 5, 3, 'A definir pelo grupo antes do início.'),
  ('X14 · Painel do perito', 'Mostrar ao perito quantas vezes cada laudo foi consultado faz ele assinar mais.', 'retenção', 'A5 · Peritos credenciados ativos', 5, 4, 6, 'A definir pelo grupo antes do início.'),
  ('X15 · Acesso antecipado via personal shopper', 'Um personal shopper que recebe as peças antes da vitrine traz compradores.', 'aquisição', 'A2 · Primeiras consultas vindas de link ou QR', 6, 4, 4, 'A definir pelo grupo antes do início.')
on conflict (titulo) do nothing;

-- ===================================================================================================
-- RFC19: indicadores de growth, calculados a partir dos eventos de uso
-- ===================================================================================================
create table if not exists public.indicador_formulas (
  chave text primary key,
  descricao text not null,
  unidade text not null check (unidade in ('%', 'qtd', 'dias', 'R$', 'razão'))
);
revoke all on public.indicador_formulas from public, anon, authenticated;
grant select on public.indicador_formulas to authenticated;
insert into public.indicador_formulas (chave, descricao, unidade) values
  ('passaportes_vivos', 'Passaportes válidos com consulta de quem não é o dono, atualização ou transferência nos 90 dias até o fim do período', 'qtd'),
  ('proporcao_vivos', 'Passaportes vivos sobre os passaportes válidos emitidos até o fim do período', '%'),
  ('conferencias_sem_disputa', 'Conferências do período aprovadas sem contestação sobre as conferências do período', '%'),
  ('pecas_recusadas', 'Anúncios recusados pela curadoria sobre os anúncios decididos no período', '%'),
  ('negociacoes_nao_concluidas', 'Propostas do período canceladas sobre as propostas encerradas (concluídas ou canceladas)', '%'),
  ('desativacao_alertas', 'Alertas desligados ou excluídos enquanto ligados sobre os alertas criados no período', '%'),
  ('inscricoes_lista_espera', 'Inscrições na lista de espera no período', 'qtd'),
  ('consultas_link', 'Consultas ao passaporte por link ou QR code no período', 'qtd'),
  ('indicacoes_vendedor', 'Indicações de vendedores registradas no período', 'qtd'),
  ('peritos_ativos', 'Peritos com pelo menos um passaporte emitido ou atualizado nos 60 dias até o fim do período', 'qtd'),
  ('primeiras_sessoes_laudo', 'Usuários cuja primeira consulta a um passaporte aconteceu no período', 'qtd'),
  ('dias_peca_passaporte', 'Média de dias entre o cadastro da peça e a emissão do passaporte, para os emitidos no período', 'dias'),
  ('compradores_habituais', 'Compradores com sessão em todas as semanas do período sobre o total de compradores', '%'),
  ('passaportes_atualizados_90d', 'Passaportes atualizados nos 90 dias até o fim do período', 'qtd'),
  ('vendedores_segunda_peca', 'Vendedores com pelo menos duas peças cadastradas nos 6 meses até o fim do período', 'qtd'),
  ('propostas_pagamento', 'Propostas do período que chegaram ao pagamento sobre as propostas do período', '%'),
  ('comissao_efetiva', 'Comissão sobre o valor vendido nas vendas concluídas no período', '%'),
  ('receita_emissao', 'Receita de emissão e manutenção de passaporte lançada no período (competência)', 'R$'),
  ('novos_por_link', 'Inscrições e contas originadas de link sobre os passaportes com link de compartilhamento', 'razão'),
  ('novos_indicacao', 'Contas novas do período originadas de indicação sobre as contas novas do período', '%'),
  ('revendas', 'Vendas concluídas no período de peças que o vendedor comprou antes na Lastro', 'qtd')
on conflict (chave) do update set descricao = excluded.descricao, unidade = excluded.unidade;

create table if not exists public.indicadores (
  id bigint generated always as identity primary key,
  codigo varchar(10) not null unique check (codigo ~ '^[A-Z0-9]{1,10}$'),
  nome varchar(150) not null check (length(trim(nome)) > 0),
  etapa text not null check (etapa in ('North Star', 'proteção', 'aquisição', 'ativação', 'retenção', 'receita', 'indicação')),
  lado text not null check (lado in ('comprador', 'vendedor', 'perito', 'ambos')),
  formula text not null references public.indicador_formulas (chave),
  meta_min numeric(14, 2),
  meta_max numeric(14, 2),
  frequencia text not null check (frequencia in ('diária', 'semanal', 'mensal')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (meta_min is null or meta_max is null or meta_min <= meta_max)
);
create table if not exists public.indicador_metas_historico (
  id bigint generated always as identity primary key,
  indicador_id bigint not null references public.indicadores (id) on delete cascade,
  formula text not null,
  meta_min numeric(14, 2),
  meta_max numeric(14, 2),
  frequencia text not null,
  vigente_ate timestamptz not null default now(),
  alterado_por uuid references public.perfis (id) on delete set null
);
create table if not exists public.indicador_medicoes (
  id bigint generated always as identity primary key,
  indicador_id bigint not null references public.indicadores (id) on delete cascade,
  inicio date not null,
  fim date not null,
  valor numeric(16, 2),
  medido_em timestamptz not null default now(),
  unique (indicador_id, inicio, fim)
);
alter table public.indicadores enable row level security;
alter table public.indicador_metas_historico enable row level security;
alter table public.indicador_medicoes enable row level security;
drop policy if exists indicadores_select on public.indicadores;
create policy indicadores_select on public.indicadores for select to authenticated using (public.is_admin());
drop policy if exists indicador_metas_select on public.indicador_metas_historico;
create policy indicador_metas_select on public.indicador_metas_historico for select to authenticated using (public.is_admin());
drop policy if exists indicador_medicoes_select on public.indicador_medicoes;
create policy indicador_medicoes_select on public.indicador_medicoes for select to authenticated using (public.is_admin());
revoke all on public.indicadores, public.indicador_metas_historico, public.indicador_medicoes from public, anon, authenticated;
grant select on public.indicadores, public.indicador_metas_historico, public.indicador_medicoes to authenticated;

-- Valor de uma formula no periodo [p_inicio, p_fim], datas no horario de Brasilia
create or replace function public.valor_indicador(p_formula text, p_inicio date, p_fim date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  t1 timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v numeric;
  semanas integer := greatest(1, ceil((p_fim - p_inicio + 1) / 7.0)::integer);
begin
  case p_formula
  when 'passaportes_vivos', 'proporcao_vivos' then
    select count(distinct e.passaporte_id) into v
      from public.eventos_uso e join public.passaportes pp on pp.id = e.passaporte_id
     where pp.status = 'valido' and e.criado_em >= t1 - interval '90 days' and e.criado_em < t1
       and ((e.tipo in ('passaporte_consulta', 'passaporte_consulta_link') and coalesce((e.dados ->> 'dono')::boolean, false) = false)
            or e.tipo in ('passaporte_atualizacao', 'passaporte_transferencia'));
    if p_formula = 'proporcao_vivos' then
      v := round(100.0 * v / nullif((select count(*) from public.passaportes where status = 'valido' and criado_em < t1), 0), 2);
    end if;
  when 'conferencias_sem_disputa' then
    select round(100.0 * count(*) filter (where motivo_contestacao is null) / nullif(count(*), 0), 2) into v
      from public.transacoes where conferida_em >= t0 and conferida_em < t1;
  when 'pecas_recusadas' then
    select round(100.0 * count(*) filter (where tipo = 'anuncio_rejeitado') / nullif(count(*), 0), 2) into v
      from public.eventos_uso where tipo in ('anuncio_publicado', 'anuncio_rejeitado') and criado_em >= t0 and criado_em < t1;
  when 'negociacoes_nao_concluidas' then
    select round(100.0 * count(*) filter (where status = 'cancelada') / nullif(count(*) filter (where status in ('confirmada', 'cancelada')), 0), 2) into v
      from public.transacoes where criado_em >= t0 and criado_em < t1;
  when 'desativacao_alertas' then
    with ev as (
      select tipo, dados ->> 'alerta_id' as alerta, dados ->> 'ativo' as ativo
        from public.eventos_uso
       where tipo in ('alerta_criado', 'alerta_desativado', 'alerta_removido') and criado_em >= t0 and criado_em < t1
    )
    -- least() ignora nulo: sem alertas criados no periodo, o valor fica sem dados (e nao 100%)
    select case when count(*) filter (where tipo = 'alerta_criado') = 0 then null
                else least(round(100.0 * count(distinct alerta) filter (where tipo = 'alerta_desativado' or (tipo = 'alerta_removido' and ativo = 'true'))
                           / count(*) filter (where tipo = 'alerta_criado'), 2), 100) end into v from ev;
  when 'inscricoes_lista_espera' then
    select count(*) into v from public.lista_espera where criado_em >= t0 and criado_em < t1;
  when 'consultas_link' then
    select count(*) into v from public.eventos_uso where tipo = 'passaporte_consulta_link' and criado_em >= t0 and criado_em < t1;
  when 'indicacoes_vendedor' then
    select count(*) into v from public.indicacoes where perfil = 'vendedor' and criado_em >= t0 and criado_em < t1;
  when 'peritos_ativos' then
    select count(distinct pe.autor_id) into v
      from public.passaporte_eventos pe join public.perfis p on p.id = pe.autor_id and p.perfil = 'Perito'
     where pe.tipo in ('emissao', 'atualizacao') and pe.criado_em >= t1 - interval '60 days' and pe.criado_em < t1;
  when 'primeiras_sessoes_laudo' then
    select count(*) into v from (
      select usuario_id from public.eventos_uso where tipo = 'passaporte_consulta' and usuario_id is not null
       group by usuario_id having min(criado_em) >= t0 and min(criado_em) < t1) s;
  when 'dias_peca_passaporte' then
    select round(avg(extract(epoch from (pp.criado_em - pc.criado_em)) / 86400.0)::numeric, 2) into v
      from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
     where pp.criado_em >= t0 and pp.criado_em < t1;
  when 'compradores_habituais' then
    select round(100.0 * count(*) filter (where s.semanas_ativas >= semanas) / nullif(count(*), 0), 2) into v
      from public.perfis p
      left join lateral (
        select count(distinct date_trunc('week', e.criado_em at time zone 'America/Sao_Paulo')) as semanas_ativas
          from public.eventos_uso e where e.usuario_id = p.id and e.tipo = 'sessao_inicio' and e.criado_em >= t0 and e.criado_em < t1
      ) s on true
     where p.perfil = 'Comprador' and p.criado_em < t1;
  when 'passaportes_atualizados_90d' then
    select count(distinct passaporte_id) into v from public.eventos_uso
     where tipo = 'passaporte_atualizacao' and criado_em >= t1 - interval '90 days' and criado_em < t1;
  when 'vendedores_segunda_peca' then
    select count(*) into v from (
      select vendedor_id from public.pecas where criado_em >= t1 - interval '6 months' and criado_em < t1
       group by vendedor_id having count(*) >= 2) s;
  when 'propostas_pagamento' then
    select round(100.0 * count(*) filter (where t.status in ('paga', 'enviada', 'em_conferencia', 'contestada', 'confirmada')
                                            or exists (select 1 from public.pagamentos_retidos pg where pg.transacao_id = t.id))
                 / nullif(count(*), 0), 2) into v
      from public.transacoes t where t.criado_em >= t0 and t.criado_em < t1;
  when 'comissao_efetiva' then
    select round(100.0 * sum(comissao) / nullif(sum(valor), 0), 2) into v
      from public.transacoes where status = 'confirmada' and confirmada_em >= t0 and confirmada_em < t1;
  when 'receita_emissao' then
    select coalesce(sum(valor), 0) into v from public.lancamentos_financeiros
     where tipo = 'receita' and categoria in ('emissao_passaporte', 'manutencao_passaporte') and status <> 'cancelado'
       and competencia between p_inicio and p_fim;
  when 'novos_por_link' then
    select round(((select count(*) from public.lista_espera where origem = 'link' and criado_em >= t0 and criado_em < t1)
                + (select count(*) from public.perfis where origem = 'link' and criado_em >= t0 and criado_em < t1))::numeric
                / nullif((select count(distinct passaporte_id) from public.passaporte_links where criado_em < t1), 0), 2) into v;
  when 'novos_indicacao' then
    select round(100.0 * count(*) filter (where origem = 'indicação') / nullif(count(*), 0), 2) into v
      from public.perfis where criado_em >= t0 and criado_em < t1;
  when 'revendas' then
    select count(*) into v from public.transacoes t
     where t.status = 'confirmada' and t.confirmada_em >= t0 and t.confirmada_em < t1
       and exists (select 1 from public.transacoes a where a.peca_id = t.peca_id and a.status = 'confirmada'
                   and a.comprador_id = t.vendedor_id and a.confirmada_em < t.confirmada_em);
  else
    raise exception 'Fórmula de indicador desconhecida: %', p_formula using errcode = 'P0001';
  end case;
  return v;
end;
$$;
revoke all on function public.valor_indicador(text, date, date) from public, anon, authenticated;

create or replace function public.situacao_meta(p_valor numeric, p_min numeric, p_max numeric)
returns text language sql immutable as $$
  select case
    when p_valor is null then 'sem dados'
    when p_min is null and p_max is null then 'sem meta'
    when (p_min is null or p_valor >= p_min) and (p_max is null or p_valor <= p_max) then 'na meta'
    else 'fora da meta'
  end;
$$;

-- RFS65 e RFS67: insere (p_id nulo) ou atualiza o indicador; metas, formula e frequencia anteriores vao para o historico
create or replace function public.salvar_indicador(
  p_id bigint, p_codigo text, p_nome text, p_etapa text, p_lado text, p_formula text,
  p_meta_min numeric, p_meta_max numeric, p_frequencia text
)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_atual public.indicadores%rowtype; v_id bigint; v_codigo text := upper(trim(p_codigo));
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if v_codigo is null or v_codigo !~ '^[A-Z0-9]{1,10}$' then raise exception 'Código inválido: use até 10 letras e números' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.indicador_formulas where chave = p_formula) then raise exception 'Fórmula inválida' using errcode = 'P0001'; end if;
  if p_meta_min is not null and p_meta_max is not null and p_meta_min > p_meta_max then
    raise exception 'A meta mínima não pode ser maior que a máxima' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.indicadores where codigo = v_codigo and id is distinct from p_id) then
    raise exception 'Já existe um indicador com este código' using errcode = '23505';
  end if;
  if p_id is null then
    insert into public.indicadores (codigo, nome, etapa, lado, formula, meta_min, meta_max, frequencia)
    values (v_codigo, trim(p_nome), p_etapa, p_lado, p_formula, p_meta_min, p_meta_max, p_frequencia)
    returning id into v_id;
    return v_id;
  end if;
  select * into v_atual from public.indicadores where id = p_id for update;
  if not found then raise exception 'Indicador não encontrado' using errcode = 'P0002'; end if;
  if v_atual.formula is distinct from p_formula or v_atual.meta_min is distinct from p_meta_min
     or v_atual.meta_max is distinct from p_meta_max or v_atual.frequencia is distinct from p_frequencia then
    insert into public.indicador_metas_historico (indicador_id, formula, meta_min, meta_max, frequencia, alterado_por)
    values (p_id, v_atual.formula, v_atual.meta_min, v_atual.meta_max, v_atual.frequencia, auth.uid());
  end if;
  update public.indicadores set codigo = v_codigo, nome = trim(p_nome), etapa = p_etapa, lado = p_lado, formula = p_formula,
    meta_min = p_meta_min, meta_max = p_meta_max, frequencia = p_frequencia, atualizado_em = now()
  where id = p_id;
  return p_id;
end;
$$;

-- RFS68: desativa (ou reativa) o indicador, preservando os valores ja medidos
create or replace function public.definir_indicador_ativo(p_id bigint, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  update public.indicadores set ativo = coalesce(p_ativo, false), atualizado_em = now() where id = p_id;
  if not found then raise exception 'Indicador não encontrado' using errcode = 'P0002'; end if;
end;
$$;

-- RFS66: indicadores por etapa e lado, com o ultimo valor medido e o status em relacao a meta
create or replace view public.vw_indicadores as
select i.id, i.codigo, i.nome, i.etapa, i.lado, i.formula, f.descricao as formula_descricao, f.unidade,
       i.meta_min, i.meta_max, i.frequencia, i.ativo, i.atualizado_em,
       m.valor as ultimo_valor, m.inicio as ultimo_inicio, m.fim as ultimo_fim, m.medido_em as ultima_medicao,
       public.situacao_meta(m.valor, i.meta_min, i.meta_max) as situacao,
       (select count(*) from public.indicador_metas_historico h where h.indicador_id = i.id) as alteracoes_meta
  from public.indicadores i
  join public.indicador_formulas f on f.chave = i.formula
  left join lateral (select * from public.indicador_medicoes x where x.indicador_id = i.id order by x.medido_em desc limit 1) m on true
 where public.is_admin();
grant select on public.vw_indicadores to authenticated;

-- RF04: painel de growth. Calcula os indicadores ativos do periodo (registrando a medicao), agrupados por etapa,
-- com valor, meta e status, e lista os experimentos concluidos com resultado e decisao.
create or replace function public.painel_growth(p_inicio date, p_fim date, p_etapa text default null, p_lado text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ind record; v_valor numeric; v_lista jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim then raise exception 'Informe um período válido' using errcode = 'P0001'; end if;
  for v_ind in
    select i.*, f.unidade, f.descricao from public.indicadores i join public.indicador_formulas f on f.chave = i.formula
     where i.ativo and (p_etapa is null or i.etapa = p_etapa)
       and (p_lado is null or i.lado = p_lado or i.lado = 'ambos' or p_lado = 'ambos')
     order by array_position(array['North Star', 'proteção', 'aquisição', 'ativação', 'retenção', 'receita', 'indicação'], i.etapa), i.codigo
  loop
    v_valor := public.valor_indicador(v_ind.formula, p_inicio, p_fim);
    insert into public.indicador_medicoes (indicador_id, inicio, fim, valor) values (v_ind.id, p_inicio, p_fim, v_valor)
    on conflict (indicador_id, inicio, fim) do update set valor = excluded.valor, medido_em = now();
    v_lista := v_lista || jsonb_build_object('id', v_ind.id, 'codigo', v_ind.codigo, 'nome', v_ind.nome, 'etapa', v_ind.etapa,
      'lado', v_ind.lado, 'formula', v_ind.descricao, 'unidade', v_ind.unidade, 'valor', v_valor,
      'metaMin', v_ind.meta_min, 'metaMax', v_ind.meta_max, 'situacao', public.situacao_meta(v_valor, v_ind.meta_min, v_ind.meta_max));
  end loop;
  return jsonb_build_object(
    'indicadores', v_lista,
    'experimentos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'etapa', etapa, 'indicador', indicador,
        'ice', ice, 'resultado', resultado, 'decisao', decisao, 'concluidoEm', concluido_em) order by concluido_em desc)
      from public.experimentos
     where status = 'concluído' and (p_etapa is null or etapa = p_etapa)
       and (concluido_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim), '[]'::jsonb)
  );
end;
$$;

-- North Star, metricas de protecao e indicadores do funil do Plano de Growth
insert into public.indicadores (codigo, nome, etapa, lado, formula, meta_min, meta_max, frequencia) values
  ('NSM', 'Passaportes vivos', 'North Star', 'ambos', 'passaportes_vivos', null, null, 'semanal'),
  ('NSM2', 'Proporção de passaportes vivos', 'North Star', 'ambos', 'proporcao_vivos', 70, null, 'semanal'),
  ('P1', 'Conferências aprovadas sem disputa', 'proteção', 'ambos', 'conferencias_sem_disputa', 95, null, 'mensal'),
  ('P2', 'Peças recusadas pela curadoria', 'proteção', 'vendedor', 'pecas_recusadas', 20, 40, 'mensal'),
  ('P3', 'Negociações iniciadas e não concluídas', 'proteção', 'ambos', 'negociacoes_nao_concluidas', null, 15, 'mensal'),
  ('P4', 'Desativação de alertas', 'proteção', 'ambos', 'desativacao_alertas', null, null, 'mensal'),
  ('A1', 'Inscrições na lista de espera', 'aquisição', 'ambos', 'inscricoes_lista_espera', null, null, 'semanal'),
  ('A2', 'Primeiras consultas vindas de link ou QR', 'aquisição', 'comprador', 'consultas_link', null, null, 'semanal'),
  ('A4', 'Contatos de vendedor por indicação', 'aquisição', 'vendedor', 'indicacoes_vendedor', null, null, 'semanal'),
  ('A5', 'Peritos credenciados ativos', 'aquisição', 'perito', 'peritos_ativos', 3, null, 'mensal'),
  ('B1', 'Primeiras sessões com laudo aberto', 'ativação', 'comprador', 'primeiras_sessoes_laudo', null, null, 'semanal'),
  ('B3', 'Tempo do cadastro da peça ao passaporte publicado', 'ativação', 'vendedor', 'dias_peca_passaporte', null, 7, 'mensal'),
  ('R1', 'Usuários habituais', 'retenção', 'comprador', 'compradores_habituais', 5, null, 'mensal'),
  ('R3', 'Passaportes atualizados em 90 dias', 'retenção', 'comprador', 'passaportes_atualizados_90d', null, null, 'mensal'),
  ('R4', 'Vendedores com segunda peça em 6 meses', 'retenção', 'vendedor', 'vendedores_segunda_peca', null, null, 'mensal'),
  ('F1', 'Propostas que viram pagamento', 'receita', 'comprador', 'propostas_pagamento', null, null, 'mensal'),
  ('F2', 'Comissão efetiva sobre o valor vendido', 'receita', 'vendedor', 'comissao_efetiva', 8, 12, 'mensal'),
  ('F3', 'Receita de emissão e manutenção', 'receita', 'vendedor', 'receita_emissao', null, null, 'mensal'),
  ('I2', 'Novos usuários por passaporte compartilhado', 'indicação', 'vendedor', 'novos_por_link', null, null, 'mensal'),
  ('I4', 'Novos clientes vindos de indicação', 'indicação', 'comprador', 'novos_indicacao', 25, null, 'mensal'),
  ('I5', 'Revendas que voltam à plataforma', 'indicação', 'comprador', 'revendas', null, null, 'mensal')
on conflict (codigo) do nothing;

-- RFS54: inscricoes originadas de cada link de compartilhamento (visivel ao dono do link)
create or replace function public.cadastros_por_link()
returns table (link_id bigint, cadastros bigint)
language sql stable security definer set search_path = public as $$
  select le.link_id, count(*) from public.lista_espera le
    join public.passaporte_links l on l.id = le.link_id
   where l.criado_por = auth.uid() or public.is_admin()
   group by le.link_id;
$$;

revoke all on function public.inscrever_lista_espera(text, text, text, text[], text, text, boolean, text, text),
  public.consultar_lista_espera(text, text, text, text, date, date), public.editar_inscricao(bigint, text, text, text, text[], text),
  public.remover_inscricao(bigint), public.criar_indicacao(text, text, text), public.editar_indicacao(bigint, text, text),
  public.remover_indicacao(bigint), public.definir_origem_conta(uuid, text),
  public.salvar_experimento(bigint, text, text, text, text, integer, integer, integer, text, text, text, text),
  public.remover_experimento(bigint),
  public.salvar_indicador(bigint, text, text, text, text, text, numeric, numeric, text),
  public.definir_indicador_ativo(bigint, boolean), public.painel_growth(date, date, text, text),
  public.cadastros_por_link() from public, anon;
grant execute on function public.inscrever_lista_espera(text, text, text, text[], text, text, boolean, text, text) to anon, authenticated;
grant execute on function public.consultar_lista_espera(text, text, text, text, date, date), public.editar_inscricao(bigint, text, text, text, text[], text),
  public.remover_inscricao(bigint), public.criar_indicacao(text, text, text), public.editar_indicacao(bigint, text, text),
  public.remover_indicacao(bigint), public.definir_origem_conta(uuid, text),
  public.salvar_experimento(bigint, text, text, text, text, integer, integer, integer, text, text, text, text),
  public.remover_experimento(bigint),
  public.salvar_indicador(bigint, text, text, text, text, text, numeric, numeric, text),
  public.definir_indicador_ativo(bigint, boolean), public.painel_growth(date, date, text, text),
  public.cadastros_por_link() to authenticated;
grant execute on function public.situacao_meta(numeric, numeric, numeric) to authenticated;
notify pgrst, 'reload schema';
commit;
