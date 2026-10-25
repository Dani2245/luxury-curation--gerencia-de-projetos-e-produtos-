-- Lastro - RFC03 (Passaporte Digital), RFC07 (Assinatura do Perito) e RFC04 (Transacoes)
-- Execute depois de schema.sql e antes de seed.sql. O script pode ser executado mais de uma vez.

-- ---------------------------------------------------------------------------
-- Segredo de assinatura e parametros (inacessiveis aos clientes)
-- ---------------------------------------------------------------------------
create table if not exists public.segredos (
  chave text primary key,
  valor text not null
);
alter table public.segredos enable row level security;
revoke all on public.segredos from public, anon, authenticated;
insert into public.segredos (chave, valor)
values ('passaporte', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (chave) do nothing;

create table if not exists public.parametros (
  chave text primary key,
  valor numeric not null
);
alter table public.parametros enable row level security;
revoke all on public.parametros from public, anon, authenticated;
-- percentual de comissao gerado na confirmacao da venda (RFS15)
insert into public.parametros (chave, valor) values ('comissao_percentual', 10)
on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------
-- Pecas: proprietario atual, venda concluida e status do passaporte derivado
-- ---------------------------------------------------------------------------
create or replace function public.pecas_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.proprietario_id := new.vendedor_id;
  end if;

  -- SQL Editor, seed e funcoes internas (SECURITY DEFINER) sao contexto confiavel
  if auth.uid() is null or current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.publicacao := 'pendente';
    new.em_negociacao := false;
    new.vendida := false;
  else
    new.vendedor_id := old.vendedor_id;
    new.proprietario_id := old.proprietario_id;
    new.vendida := old.vendida;
    new.em_negociacao := old.em_negociacao;
    if not public.is_admin() then
      new.publicacao := 'pendente';
    end if;
    new.atualizado_em := now();
  end if;

  return new;
end;
$$;

drop view if exists public.vw_pecas;

alter table public.pecas add column if not exists proprietario_id uuid references public.perfis (id) on delete restrict;
update public.pecas set proprietario_id = vendedor_id where proprietario_id is null;
alter table public.pecas alter column proprietario_id set not null;
alter table public.pecas add column if not exists vendida boolean not null default false;
alter table public.pecas drop column if exists status_passaporte;
create index if not exists pecas_proprietario_idx on public.pecas (proprietario_id);

-- ---------------------------------------------------------------------------
-- Passaporte digital (Tabela 2) e historico
-- ---------------------------------------------------------------------------
create table if not exists public.passaportes (
  id bigint generated always as identity primary key,
  peca_id bigint not null unique references public.pecas (id) on delete cascade,
  status text not null check (status in ('valido', 'em revisão', 'revogado')),
  perito_id uuid not null references public.perfis (id) on delete restrict,
  versao integer not null default 1,
  assinatura text not null,
  assinado_por uuid not null references public.perfis (id) on delete restrict,
  assinado_em timestamptz not null default now(),
  -- RNF04: identidade dos proprietarios so aparece a terceiros se o dono permitir
  proprietarios_publicos boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.passaporte_documentos (
  id bigint generated always as identity primary key,
  passaporte_id bigint not null references public.passaportes (id) on delete cascade,
  tipo text not null check (tipo in ('certificado', 'laudo', 'nota fiscal', 'fotografia', 'restauracao')),
  titulo varchar(200) not null,
  descricao text,
  arquivo_path text not null,
  mime text,
  hash_sha256 text not null,
  enviado_por uuid references public.perfis (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists passaporte_documentos_idx on public.passaporte_documentos (passaporte_id);

create table if not exists public.passaporte_proprietarios (
  id bigint generated always as identity primary key,
  passaporte_id bigint not null references public.passaportes (id) on delete cascade,
  ordem integer not null,
  nome varchar(150) not null,
  proprietario_id uuid references public.perfis (id) on delete set null,
  desde date,
  ate date,
  transacao_id bigint,
  origem text not null check (origem in ('informado', 'plataforma')),
  unique (passaporte_id, ordem)
);

create table if not exists public.passaporte_eventos (
  id bigint generated always as identity primary key,
  passaporte_id bigint not null references public.passaportes (id) on delete cascade,
  tipo text not null check (tipo in ('emissao', 'atualizacao', 'transferencia', 'privacidade')),
  descricao text not null,
  autor_id uuid references public.perfis (id) on delete set null,
  autor_nome varchar(150),
  criado_em timestamptz not null default now()
);
create index if not exists passaporte_eventos_idx on public.passaporte_eventos (passaporte_id);

-- ---------------------------------------------------------------------------
-- Transacoes (Tabela de RFS13 a RFS16)
-- ---------------------------------------------------------------------------
create table if not exists public.transacoes (
  id bigint generated always as identity primary key,
  peca_id bigint not null references public.pecas (id) on delete cascade,
  comprador_id uuid not null references public.perfis (id) on delete restrict,
  vendedor_id uuid not null references public.perfis (id) on delete restrict,
  valor numeric(14, 2) not null check (valor > 0),
  status text not null default 'pendente' check (status in ('pendente', 'confirmada', 'cancelada')),
  comissao numeric(14, 2),
  motivo_cancelamento text,
  cancelada_por uuid references public.perfis (id) on delete restrict,
  registrada_por uuid references public.perfis (id) on delete restrict,
  transferencia_pendente boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  confirmada_em timestamptz,
  cancelada_em timestamptz,
  check (comprador_id <> vendedor_id)
);
create unique index if not exists transacoes_peca_pendente_idx on public.transacoes (peca_id) where status = 'pendente';
create index if not exists transacoes_comprador_idx on public.transacoes (comprador_id);
create index if not exists transacoes_vendedor_idx on public.transacoes (vendedor_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'passaporte_proprietarios_transacao_fk') then
    alter table public.passaporte_proprietarios
      add constraint passaporte_proprietarios_transacao_fk
      foreign key (transacao_id) references public.transacoes (id) on delete set null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Visibilidade
-- ---------------------------------------------------------------------------
-- Mesma regra da consulta de pecas: vendedor e proprietario veem a propria peca,
-- administrador todas, comprador as publicadas e disponiveis, perito as nao rejeitadas.
create or replace function public.pode_ver_peca(p_peca_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pecas p
    where p.id = p_peca_id
      and (
        p.vendedor_id = auth.uid()
        or p.proprietario_id = auth.uid()
        or public.is_admin()
        or (public.perfil_atual() = 'Comprador' and p.publicacao = 'publicada' and not p.vendida)
        or (public.perfil_atual() = 'Perito' and p.publicacao <> 'rejeitada')
      )
  )
$$;

create or replace function public.pode_ver_proprietarios(p_passaporte_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.perfil_atual() = 'Perito'
    or exists (
      select 1
      from public.passaportes pp
      join public.pecas pc on pc.id = pp.peca_id
      where pp.id = p_passaporte_id
        and (pc.proprietario_id = auth.uid() or pc.vendedor_id = auth.uid() or pp.proprietarios_publicos)
    )
$$;

revoke all on function public.pode_ver_peca(bigint) from public, anon;
revoke all on function public.pode_ver_proprietarios(bigint) from public, anon;
grant execute on function public.pode_ver_peca(bigint) to authenticated;
grant execute on function public.pode_ver_proprietarios(bigint) to authenticated;

create or replace view public.vw_pecas as
select
  p.id, p.nome, p.categoria, p.descricao, p.valor_pretendido, p.fotografias,
  p.vendedor_id, pf.nome as vendedor_nome, p.proprietario_id,
  p.publicacao, coalesce(pp.status, 'sem passaporte') as status_passaporte, pp.id as passaporte_id,
  p.em_negociacao, p.vendida, p.criado_em, p.atualizado_em
from public.pecas p
join public.perfis pf on pf.id = p.vendedor_id
left join public.passaportes pp on pp.peca_id = p.id
where public.pode_ver_peca(p.id);

revoke all on public.vw_pecas from anon;
grant select on public.vw_pecas to authenticated;

create or replace view public.vw_transacoes as
select
  t.id, t.peca_id, p.nome as peca_nome, p.categoria,
  t.comprador_id, c.nome as comprador_nome, t.vendedor_id, v.nome as vendedor_nome,
  t.valor, t.status, t.comissao, t.motivo_cancelamento, t.transferencia_pendente,
  t.criado_em, t.atualizado_em, t.confirmada_em, t.cancelada_em
from public.transacoes t
join public.pecas p on p.id = t.peca_id
join public.perfis c on c.id = t.comprador_id
join public.perfis v on v.id = t.vendedor_id
where t.comprador_id = auth.uid() or t.vendedor_id = auth.uid() or public.is_admin();

revoke all on public.vw_transacoes from anon;
grant select on public.vw_transacoes to authenticated;

create or replace view public.vw_passaporte_proprietarios as
select
  o.id, o.passaporte_id, o.ordem,
  case when public.pode_ver_proprietarios(o.passaporte_id) then o.nome else 'Proprietário ' || o.ordem end as nome,
  o.desde, o.ate, o.origem, (o.ate is null and o.origem = 'plataforma') as atual
from public.passaporte_proprietarios o
join public.passaportes pp on pp.id = o.passaporte_id
where public.pode_ver_peca(pp.peca_id);

revoke all on public.vw_passaporte_proprietarios from anon;
grant select on public.vw_passaporte_proprietarios to authenticated;

-- RLS: leitura conforme a visibilidade da peca; escritas somente pelas funcoes abaixo
alter table public.passaportes enable row level security;
alter table public.passaporte_documentos enable row level security;
alter table public.passaporte_proprietarios enable row level security;
alter table public.passaporte_eventos enable row level security;
alter table public.transacoes enable row level security;

drop policy if exists passaportes_select on public.passaportes;
create policy passaportes_select on public.passaportes
  for select to authenticated using (public.pode_ver_peca(peca_id));

drop policy if exists passaporte_documentos_select on public.passaporte_documentos;
create policy passaporte_documentos_select on public.passaporte_documentos
  for select to authenticated
  using (
    exists (select 1 from public.passaportes pp where pp.id = passaporte_id and public.pode_ver_peca(pp.peca_id))
    and (tipo <> 'nota fiscal' or public.pode_ver_proprietarios(passaporte_id))
  );

drop policy if exists passaporte_proprietarios_select on public.passaporte_proprietarios;
create policy passaporte_proprietarios_select on public.passaporte_proprietarios
  for select to authenticated
  using (exists (select 1 from public.passaportes pp where pp.id = passaporte_id and public.pode_ver_peca(pp.peca_id)));

drop policy if exists passaporte_eventos_select on public.passaporte_eventos;
create policy passaporte_eventos_select on public.passaporte_eventos
  for select to authenticated
  using (exists (select 1 from public.passaportes pp where pp.id = passaporte_id and public.pode_ver_peca(pp.peca_id)));

drop policy if exists transacoes_select on public.transacoes;
create policy transacoes_select on public.transacoes
  for select to authenticated
  using (comprador_id = auth.uid() or vendedor_id = auth.uid() or public.is_admin());

revoke all on public.passaportes, public.passaporte_documentos, public.passaporte_proprietarios,
  public.passaporte_eventos, public.transacoes from anon, authenticated;
grant select on public.passaportes, public.passaporte_documentos, public.passaporte_proprietarios,
  public.passaporte_eventos, public.transacoes to authenticated;

-- Pecas: vendidas ou em negociacao nao podem ser editadas nem removidas (RFS03 e RFS04)
drop policy if exists pecas_select on public.pecas;
create policy pecas_select on public.pecas
  for select to authenticated
  using (vendedor_id = auth.uid() or proprietario_id = auth.uid() or public.is_admin());

drop policy if exists pecas_update on public.pecas;
create policy pecas_update on public.pecas
  for update to authenticated
  using ((vendedor_id = auth.uid() and not em_negociacao and not vendida) or public.is_admin())
  with check (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists pecas_delete on public.pecas;
create policy pecas_delete on public.pecas
  for delete to authenticated
  using (vendedor_id = auth.uid() and not em_negociacao and not vendida);

-- ---------------------------------------------------------------------------
-- Passaporte: assinatura digital do perito (RFC07)
-- ---------------------------------------------------------------------------
-- A assinatura e um HMAC-SHA256 do conteudo atestado (peca, status, versao, perito
-- responsavel, signatario e hash de cada documento) com segredo guardado so no banco.
create or replace function public.passaporte_assinar(p_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_segredo text;
  v_payload text;
begin
  select valor into v_segredo from public.segredos where chave = 'passaporte';

  select pp.peca_id || '|' || pp.status || '|' || pp.versao || '|' || pp.perito_id || '|' || pp.assinado_por || '|'
         || coalesce((select string_agg(d.tipo || ':' || d.hash_sha256, ',' order by d.id)
                        from public.passaporte_documentos d where d.passaporte_id = pp.id), '')
    into v_payload
    from public.passaportes pp where pp.id = p_id;

  return encode(hmac(v_payload, v_segredo, 'sha256'), 'hex');
end;
$$;

create or replace function public.passaporte_assinatura_valida(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.passaportes pp
    where pp.id = p_id and public.pode_ver_peca(pp.peca_id) and pp.assinatura = public.passaporte_assinar(pp.id)
  )
$$;

create or replace function public.emitir_passaporte_interno(
  p_perito uuid, p_peca_id bigint, p_status text, p_documentos jsonb, p_proprietarios text[]
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peca public.pecas%rowtype;
  v_id bigint;
  v_doc jsonb;
  v_nome text;
  v_ordem integer := 0;
  v_perito_nome text;
begin
  select * into v_peca from public.pecas where id = p_peca_id;
  if not found then
    raise exception 'Peça não encontrada' using errcode = 'P0002';
  end if;
  if v_peca.publicacao = 'rejeitada' then
    raise exception 'Peça com anúncio rejeitado não pode receber passaporte' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.passaportes where peca_id = p_peca_id) then
    raise exception 'A peça já possui passaporte digital' using errcode = '23505';
  end if;
  if p_status not in ('valido', 'em revisão', 'revogado') then
    raise exception 'Status inválido. Escolha: valido, em revisão ou revogado' using errcode = 'P0001';
  end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(p_documentos, '[]'::jsonb)) d where d ->> 'tipo' = 'certificado') then
    raise exception 'Anexe ao menos um certificado de autenticidade' using errcode = 'P0001';
  end if;

  insert into public.passaportes (peca_id, status, perito_id, assinatura, assinado_por)
  values (p_peca_id, p_status, p_perito, '', p_perito)
  returning id into v_id;

  for v_doc in select * from jsonb_array_elements(p_documentos) loop
    insert into public.passaporte_documentos (passaporte_id, tipo, titulo, descricao, arquivo_path, mime, hash_sha256, enviado_por)
    values (v_id, v_doc ->> 'tipo', left(v_doc ->> 'titulo', 200), v_doc ->> 'descricao',
            v_doc ->> 'arquivo_path', v_doc ->> 'mime', v_doc ->> 'hash_sha256', p_perito);
  end loop;

  foreach v_nome in array coalesce(p_proprietarios, '{}'::text[]) loop
    if length(trim(v_nome)) > 0 then
      v_ordem := v_ordem + 1;
      insert into public.passaporte_proprietarios (passaporte_id, ordem, nome, origem)
      values (v_id, v_ordem, left(trim(v_nome), 150), 'informado');
    end if;
  end loop;

  -- proprietario atual; se a venda ja foi confirmada e a transferencia aguarda o RFS08, o vendedor ainda consta como dono
  v_ordem := v_ordem + 1;
  insert into public.passaporte_proprietarios (passaporte_id, ordem, nome, proprietario_id, desde, origem)
  select v_id, v_ordem, nome, id, current_date, 'plataforma'
    from public.perfis
   where id = coalesce(
     (select t.vendedor_id from public.transacoes t
       where t.peca_id = p_peca_id and t.status = 'confirmada' and t.transferencia_pendente
       order by t.id limit 1),
     v_peca.proprietario_id);

  update public.passaportes set assinatura = public.passaporte_assinar(v_id) where id = v_id;

  select nome into v_perito_nome from public.perfis where id = p_perito;
  insert into public.passaporte_eventos (passaporte_id, tipo, descricao, autor_id, autor_nome)
  values (v_id, 'emissao', 'Passaporte emitido e assinado digitalmente pelo perito', p_perito, v_perito_nome);

  return v_id;
end;
$$;

create or replace function public.emitir_passaporte(
  p_peca_id bigint, p_status text, p_documentos jsonb, p_proprietarios text[] default '{}'
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.perfil_atual() is distinct from 'Perito' then
    raise exception 'Somente peritos podem emitir passaportes digitais' using errcode = '42501';
  end if;
  return public.emitir_passaporte_interno(auth.uid(), p_peca_id, p_status, p_documentos, p_proprietarios);
end;
$$;

create or replace function public.atualizar_passaporte(
  p_id bigint, p_status text, p_documentos jsonb, p_descricao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pp public.passaportes%rowtype;
  v_doc jsonb;
  v_docs jsonb := coalesce(p_documentos, '[]'::jsonb);
  v_status_mudou boolean;
  v_resumo text;
  v_nome text;
begin
  if public.perfil_atual() not in ('Perito', 'Administrador') then
    raise exception 'Somente perito ou administrador podem atualizar o passaporte' using errcode = '42501';
  end if;

  select * into v_pp from public.passaportes where id = p_id;
  if not found then
    raise exception 'Passaporte não encontrado' using errcode = 'P0002';
  end if;

  if p_status is not null and p_status not in ('valido', 'em revisão', 'revogado') then
    raise exception 'Status inválido. Escolha: valido, em revisão ou revogado' using errcode = 'P0001';
  end if;

  v_status_mudou := p_status is not null and p_status <> v_pp.status;
  if not v_status_mudou and jsonb_array_length(v_docs) = 0 then
    raise exception 'Informe ao menos uma alteração: novo documento, laudo, certificado, restauração ou status' using errcode = 'P0001';
  end if;

  for v_doc in select * from jsonb_array_elements(v_docs) loop
    insert into public.passaporte_documentos (passaporte_id, tipo, titulo, descricao, arquivo_path, mime, hash_sha256, enviado_por)
    values (p_id, v_doc ->> 'tipo', left(v_doc ->> 'titulo', 200), v_doc ->> 'descricao',
            v_doc ->> 'arquivo_path', v_doc ->> 'mime', v_doc ->> 'hash_sha256', auth.uid());
  end loop;

  update public.passaportes
     set status = coalesce(p_status, status), versao = versao + 1, assinado_por = auth.uid(),
         assinado_em = now(), atualizado_em = now()
   where id = p_id;
  update public.passaportes set assinatura = public.passaporte_assinar(p_id) where id = p_id;

  v_resumo := concat_ws('; ',
    case when jsonb_array_length(v_docs) > 0 then jsonb_array_length(v_docs) || ' documento(s) adicionado(s)' end,
    case when v_status_mudou then 'status alterado de ' || v_pp.status || ' para ' || p_status end,
    nullif(trim(p_descricao), ''));
  select nome into v_nome from public.perfis where id = auth.uid();
  insert into public.passaporte_eventos (passaporte_id, tipo, descricao, autor_id, autor_nome)
  values (p_id, 'atualizacao', v_resumo, auth.uid(), v_nome);
end;
$$;

create or replace function public.definir_exibicao_proprietarios(p_id bigint, p_publico boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if not exists (
    select 1 from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
    where pp.id = p_id and pc.proprietario_id = auth.uid()
  ) then
    raise exception 'Somente o proprietário da peça decide o que fica público' using errcode = '42501';
  end if;

  update public.passaportes set proprietarios_publicos = p_publico, atualizado_em = now() where id = p_id;
  select nome into v_nome from public.perfis where id = auth.uid();
  insert into public.passaporte_eventos (passaporte_id, tipo, descricao, autor_id, autor_nome)
  values (p_id, 'privacidade',
          case when p_publico then 'Proprietário tornou a identidade dos proprietários pública'
               else 'Proprietário tornou a identidade dos proprietários privada' end,
          auth.uid(), v_nome);
end;
$$;

-- Transferencia de propriedade no passaporte (RFS08), usada pela confirmacao da venda
create or replace function public.registrar_transferencia_interna(p_transacao_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.transacoes%rowtype;
  v_pp public.passaportes%rowtype;
  v_ordem integer;
  v_nome text;
begin
  select * into v_t from public.transacoes where id = p_transacao_id;
  select * into v_pp from public.passaportes where peca_id = v_t.peca_id;

  update public.passaporte_proprietarios set ate = current_date
   where passaporte_id = v_pp.id and ate is null and origem = 'plataforma';

  select coalesce(max(ordem), 0) + 1 into v_ordem from public.passaporte_proprietarios where passaporte_id = v_pp.id;
  select nome into v_nome from public.perfis where id = v_t.comprador_id;
  insert into public.passaporte_proprietarios (passaporte_id, ordem, nome, proprietario_id, desde, transacao_id, origem)
  values (v_pp.id, v_ordem, v_nome, v_t.comprador_id, current_date, v_t.id, 'plataforma');

  insert into public.passaporte_eventos (passaporte_id, tipo, descricao, autor_id, autor_nome)
  values (v_pp.id, 'transferencia',
          'Transferência de propriedade registrada após a venda (proprietário nº ' || v_ordem || ')',
          null, 'Sistema');

  update public.transacoes set transferencia_pendente = false, atualizado_em = now() where id = v_t.id;
end;
$$;

create or replace function public.admin_registrar_transferencia(p_transacao_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.transacoes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select * into v_t from public.transacoes where id = p_transacao_id;
  if not found then
    raise exception 'Transação não encontrada' using errcode = 'P0002';
  end if;
  if v_t.status <> 'confirmada' then
    raise exception 'A transferência só pode ser registrada após a confirmação da venda' using errcode = 'P0001';
  end if;
  if not v_t.transferencia_pendente then
    raise exception 'A transferência desta venda já foi registrada no passaporte' using errcode = '23505';
  end if;
  if not exists (select 1 from public.passaportes where peca_id = v_t.peca_id) then
    raise exception 'A peça ainda não possui passaporte digital emitido' using errcode = 'P0001';
  end if;

  perform public.registrar_transferencia_interna(p_transacao_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Transacoes (RFC04)
-- ---------------------------------------------------------------------------
create or replace function public.inserir_transacao(p_peca_id bigint, p_valor numeric, p_comprador_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comprador uuid;
  v_peca public.pecas%rowtype;
  v_id bigint;
begin
  if public.perfil_atual() = 'Comprador' then
    v_comprador := auth.uid();
  elsif public.is_admin() then
    if p_comprador_id is null then
      raise exception 'Informe o comprador da proposta' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.perfis where id = p_comprador_id and perfil = 'Comprador') then
      raise exception 'O comprador informado não existe ou não possui o perfil Comprador' using errcode = 'P0001';
    end if;
    v_comprador := p_comprador_id;
  else
    raise exception 'Somente compradores e administradores registram propostas' using errcode = '42501';
  end if;

  select * into v_peca from public.pecas where id = p_peca_id for update;
  if not found then
    raise exception 'Peça não encontrada' using errcode = 'P0002';
  end if;
  if v_peca.publicacao <> 'publicada' or v_peca.vendida then
    raise exception 'A peça não está disponível na plataforma' using errcode = 'P0001';
  end if;
  if v_peca.em_negociacao then
    raise exception 'A peça já possui uma proposta em andamento' using errcode = '23505';
  end if;
  if v_peca.proprietario_id = v_comprador then
    raise exception 'O comprador não pode propor a compra de uma peça que já lhe pertence' using errcode = 'P0001';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor da proposta deve ser maior que zero' using errcode = 'P0001';
  end if;

  insert into public.transacoes (peca_id, comprador_id, vendedor_id, valor, registrada_por)
  values (p_peca_id, v_comprador, v_peca.proprietario_id, round(p_valor, 2),
          case when v_comprador <> auth.uid() then auth.uid() end)
  returning id into v_id;

  update public.pecas set em_negociacao = true, atualizado_em = now() where id = p_peca_id;
  return v_id;
end;
$$;

create or replace function public.confirmar_transacao(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.transacoes%rowtype;
  v_pct numeric;
  v_tem_passaporte boolean;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then
    raise exception 'Transação não encontrada' using errcode = 'P0002';
  end if;
  if v_t.vendedor_id <> auth.uid() then
    raise exception 'Somente o vendedor da peça confirma a venda' using errcode = '42501';
  end if;
  if v_t.status <> 'pendente' then
    raise exception 'A transação já foi %', v_t.status using errcode = 'P0001';
  end if;

  select valor into v_pct from public.parametros where chave = 'comissao_percentual';
  select exists (select 1 from public.passaportes where peca_id = v_t.peca_id) into v_tem_passaporte;

  update public.transacoes
     set status = 'confirmada', confirmada_em = now(), atualizado_em = now(),
         comissao = round(valor * coalesce(v_pct, 0) / 100, 2), transferencia_pendente = not v_tem_passaporte
   where id = p_id;

  update public.pecas
     set vendida = true, em_negociacao = false, proprietario_id = v_t.comprador_id, atualizado_em = now()
   where id = v_t.peca_id;

  -- atualiza o passaporte com o novo proprietario (RFC04); sem passaporte, fica pendente para o RFS08
  if v_tem_passaporte then
    perform public.registrar_transferencia_interna(p_id);
  end if;
end;
$$;

create or replace function public.cancelar_transacao(p_id bigint, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t public.transacoes%rowtype;
begin
  select * into v_t from public.transacoes where id = p_id for update;
  if not found then
    raise exception 'Transação não encontrada' using errcode = 'P0002';
  end if;
  if auth.uid() not in (v_t.comprador_id, v_t.vendedor_id) then
    raise exception 'Somente o comprador ou o vendedor cancelam a transação' using errcode = '42501';
  end if;
  if v_t.status <> 'pendente' then
    raise exception 'Somente transações ainda não confirmadas podem ser canceladas' using errcode = 'P0001';
  end if;

  update public.transacoes
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(),
         motivo_cancelamento = nullif(trim(p_motivo), ''), atualizado_em = now()
   where id = p_id;
  update public.pecas set em_negociacao = false, atualizado_em = now() where id = v_t.peca_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Usuarios: integridade com as novas entidades (RFS11 e RFS12)
-- ---------------------------------------------------------------------------
create or replace function public.admin_editar_usuario(
  p_id uuid, p_email text, p_nome text, p_perfil text, p_senha text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if not exists (select 1 from public.perfis where id = p_id) then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;

  if p_perfil not in ('Administrador', 'Vendedor', 'Comprador', 'Perito') then
    raise exception 'Perfil de acesso inválido' using errcode = 'P0001';
  end if;

  if p_id = auth.uid() and p_perfil <> 'Administrador' then
    raise exception 'Você não pode remover o seu próprio perfil de administrador' using errcode = 'P0001';
  end if;

  if p_perfil <> 'Vendedor' and exists (select 1 from public.pecas where vendedor_id = p_id) then
    raise exception 'O usuário possui peças cadastradas e deve manter o perfil Vendedor' using errcode = 'P0001';
  end if;

  if p_perfil <> 'Perito' and exists (select 1 from public.passaportes where perito_id = p_id or assinado_por = p_id) then
    raise exception 'O usuário assinou passaportes digitais e deve manter o perfil Perito' using errcode = 'P0001';
  end if;

  if p_perfil <> 'Comprador' and exists (select 1 from public.transacoes where comprador_id = p_id) then
    raise exception 'O usuário possui transações como comprador e deve manter o perfil Comprador' using errcode = 'P0001';
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_id) then
    raise exception 'Já existe um usuário com este e-mail' using errcode = '23505';
  end if;

  update auth.users
     set email = v_email,
         raw_user_meta_data = jsonb_build_object('nome', trim(p_nome), 'perfil', p_perfil),
         encrypted_password = case when p_senha is null then encrypted_password else crypt(p_senha, gen_salt('bf')) end,
         updated_at = now()
   where id = p_id;

  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_email),
         updated_at = now()
   where user_id = p_id and provider = 'email';

  update public.perfis
     set nome = trim(p_nome), email = v_email, perfil = p_perfil, atualizado_em = now()
   where id = p_id;
end;
$$;

create or replace function public.admin_remover_usuario(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  if p_id = auth.uid() then
    raise exception 'Você não pode remover o seu próprio usuário' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.perfis where id = p_id) then
    raise exception 'Usuário não encontrado' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.pecas where vendedor_id = p_id or proprietario_id = p_id) then
    raise exception 'O usuário possui peças cadastradas e não pode ser removido' using errcode = '23503';
  end if;

  if exists (select 1 from public.passaportes where perito_id = p_id or assinado_por = p_id) then
    raise exception 'O usuário assinou passaportes digitais e não pode ser removido' using errcode = '23503';
  end if;

  if exists (select 1 from public.transacoes where comprador_id = p_id or vendedor_id = p_id) then
    raise exception 'O usuário possui transações registradas e não pode ser removido' using errcode = '23503';
  end if;

  delete from auth.users where id = p_id;
end;
$$;

revoke all on function public.passaporte_assinar(bigint) from public, anon, authenticated;
revoke all on function public.emitir_passaporte_interno(uuid, bigint, text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public.registrar_transferencia_interna(bigint) from public, anon, authenticated;
revoke all on function public.passaporte_assinatura_valida(bigint) from public, anon;
revoke all on function public.emitir_passaporte(bigint, text, jsonb, text[]) from public, anon;
revoke all on function public.atualizar_passaporte(bigint, text, jsonb, text) from public, anon;
revoke all on function public.definir_exibicao_proprietarios(bigint, boolean) from public, anon;
revoke all on function public.admin_registrar_transferencia(bigint) from public, anon;
revoke all on function public.inserir_transacao(bigint, numeric, uuid) from public, anon;
revoke all on function public.confirmar_transacao(bigint) from public, anon;
revoke all on function public.cancelar_transacao(bigint, text) from public, anon;
revoke all on function public.admin_editar_usuario(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_remover_usuario(uuid) from public, anon;
grant execute on function public.passaporte_assinatura_valida(bigint) to authenticated;
grant execute on function public.emitir_passaporte(bigint, text, jsonb, text[]) to authenticated;
grant execute on function public.atualizar_passaporte(bigint, text, jsonb, text) to authenticated;
grant execute on function public.definir_exibicao_proprietarios(bigint, boolean) to authenticated;
grant execute on function public.admin_registrar_transferencia(bigint) to authenticated;
grant execute on function public.inserir_transacao(bigint, numeric, uuid) to authenticated;
grant execute on function public.confirmar_transacao(bigint) to authenticated;
grant execute on function public.cancelar_transacao(bigint, text) to authenticated;
grant execute on function public.admin_editar_usuario(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_remover_usuario(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage dos documentos do passaporte (privado; acesso por URL assinada)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('passaportes', 'passaportes', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists passaportes_docs_insert on storage.objects;
create policy passaportes_docs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'passaportes' and public.perfil_atual() in ('Perito', 'Administrador'));

drop policy if exists passaportes_docs_select on storage.objects;
create policy passaportes_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'passaportes'
    and exists (select 1 from public.passaporte_documentos d where d.arquivo_path = name)
  );

drop policy if exists passaportes_docs_delete on storage.objects;
create policy passaportes_docs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'passaportes' and owner_id = auth.uid()::text);

notify pgrst, 'reload schema';
