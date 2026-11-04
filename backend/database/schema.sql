-- Lastro - schema do banco (RFC01 Manter Usuarios, RFC02 Manter Pecas)
-- Execute no SQL Editor do Supabase. O script pode ser executado mais de uma vez.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Perfis de usuario (complementam auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome varchar(150) not null,
  email varchar(255) not null unique,
  perfil text not null check (perfil in ('Administrador', 'Vendedor', 'Comprador', 'Perito')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.perfil_atual()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select perfil from public.perfis where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select perfil = 'Administrador' from public.perfis where id = auth.uid()), false)
$$;

revoke all on function public.perfil_atual() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.perfil_atual() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.perfis enable row level security;

drop policy if exists perfis_select on public.perfis;
create policy perfis_select on public.perfis
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

revoke all on public.perfis from anon;
revoke insert, update, delete on public.perfis from authenticated;
grant select on public.perfis to authenticated;

-- ---------------------------------------------------------------------------
-- Gestao de usuarios (RFS09-RFS12). Somente via funcoes que validam o perfil.
-- ---------------------------------------------------------------------------
create or replace function public.criar_usuario_interno(p_email text, p_senha text, p_nome text, p_perfil text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
begin
  if p_perfil not in ('Administrador', 'Vendedor', 'Comprador', 'Perito') then
    raise exception 'Perfil de acesso inválido' using errcode = 'P0001';
  end if;

  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Já existe um usuário com este e-mail' using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_senha, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', p_nome, 'perfil', p_perfil), now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.perfis (id, nome, email, perfil) values (v_id, trim(p_nome), v_email, p_perfil);

  return v_id;
end;
$$;

create or replace function public.admin_criar_usuario(p_email text, p_senha text, p_nome text, p_perfil text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  return public.criar_usuario_interno(p_email, p_senha, p_nome, p_perfil);
end;
$$;

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

  if exists (select 1 from public.pecas where vendedor_id = p_id) then
    raise exception 'O usuário possui peças cadastradas e não pode ser removido' using errcode = '23503';
  end if;

  delete from auth.users where id = p_id;
end;
$$;

revoke all on function public.criar_usuario_interno(text, text, text, text) from public, anon, authenticated;
revoke all on function public.admin_criar_usuario(text, text, text, text) from public, anon;
revoke all on function public.admin_editar_usuario(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_remover_usuario(uuid) from public, anon;
grant execute on function public.admin_criar_usuario(text, text, text, text) to authenticated;
grant execute on function public.admin_editar_usuario(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_remover_usuario(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Pecas (RFS01-RFS04)
-- ---------------------------------------------------------------------------
create table if not exists public.pecas (
  id bigint generated always as identity primary key,
  nome varchar(256) not null,
  categoria text not null check (categoria in ('obra de arte', 'joia', 'relógio')),
  descricao text not null default '',
  valor_pretendido numeric(14, 2) not null check (valor_pretendido > 0),
  fotografias text[] not null default '{}',
  vendedor_id uuid not null references public.perfis (id) on delete restrict,
  -- validacao do anuncio pelo administrador antes da publicacao (RFC02)
  publicacao text not null default 'pendente' check (publicacao in ('pendente', 'publicada', 'rejeitada')),
  -- status do passaporte digital (RFC03 emite e mantem o passaporte)
  status_passaporte text not null default 'em revisão' check (status_passaporte in ('valido', 'em revisão', 'revogado')),
  -- verdadeiro enquanto houver transacao em andamento (RFC04)
  em_negociacao boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists pecas_vendedor_idx on public.pecas (vendedor_id);
create index if not exists pecas_categoria_idx on public.pecas (categoria);
create index if not exists pecas_nome_idx on public.pecas (lower(nome));

create or replace function public.pecas_guard()
returns trigger
language plpgsql
as $$
begin
  -- sem JWT (SQL Editor / seed) o contexto e confiavel
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.publicacao := 'pendente';
    new.status_passaporte := 'em revisão';
    new.em_negociacao := false;
  else
    new.vendedor_id := old.vendedor_id;
    if not public.is_admin() then
      new.publicacao := 'pendente';
      new.status_passaporte := old.status_passaporte;
      new.em_negociacao := old.em_negociacao;
    end if;
    new.atualizado_em := now();
  end if;

  return new;
end;
$$;

drop trigger if exists pecas_guard_trg on public.pecas;
create trigger pecas_guard_trg
  before insert or update on public.pecas
  for each row execute function public.pecas_guard();

alter table public.pecas enable row level security;

drop policy if exists pecas_select on public.pecas;
create policy pecas_select on public.pecas
  for select to authenticated
  using (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists pecas_insert on public.pecas;
create policy pecas_insert on public.pecas
  for insert to authenticated
  with check (vendedor_id = auth.uid() and public.perfil_atual() = 'Vendedor');

drop policy if exists pecas_update on public.pecas;
create policy pecas_update on public.pecas
  for update to authenticated
  using ((vendedor_id = auth.uid() and not em_negociacao) or public.is_admin())
  with check (vendedor_id = auth.uid() or public.is_admin());

drop policy if exists pecas_delete on public.pecas;
create policy pecas_delete on public.pecas
  for delete to authenticated
  using (vendedor_id = auth.uid() and not em_negociacao);

revoke all on public.pecas from anon;
grant select, insert, update, delete on public.pecas to authenticated;

-- Consulta de pecas (RFS02): vendedor ve as proprias, administrador ve todas,
-- comprador ve somente as publicadas. Inclui o nome do vendedor.
create or replace view public.vw_pecas as
select
  p.id, p.nome, p.categoria, p.descricao, p.valor_pretendido, p.fotografias,
  p.vendedor_id, pf.nome as vendedor_nome,
  p.publicacao, p.status_passaporte, p.em_negociacao, p.criado_em, p.atualizado_em
from public.pecas p
join public.perfis pf on pf.id = p.vendedor_id
where p.vendedor_id = auth.uid()
   or public.is_admin()
   or (p.publicacao = 'publicada' and public.perfil_atual() = 'Comprador');

revoke all on public.vw_pecas from anon;
grant select on public.vw_pecas to authenticated;

-- ---------------------------------------------------------------------------
-- Storage das fotografias
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pecas', 'pecas', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pecas_fotos_insert on storage.objects;
create policy pecas_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pecas'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.perfil_atual() = 'Vendedor'
  );

drop policy if exists pecas_fotos_delete on storage.objects;
create policy pecas_fotos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pecas' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
