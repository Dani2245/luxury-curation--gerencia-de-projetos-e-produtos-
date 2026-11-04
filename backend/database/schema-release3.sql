-- Release 3: RFC10 categorias, RFC05 laudos e suporte aos experimentos X1-X5.
-- Aplicar depois de schema-conservacao.sql. Não reaplicar seed.sql.
begin;

create table if not exists public.categorias (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(trim(nome)) between 1 and 80),
  atributos text[] not null default '{}',
  atualizado_em timestamptz not null default now()
);
create unique index if not exists categorias_nome_ci on public.categorias(lower(nome));
insert into public.categorias(nome, atributos) values
  ('obra de arte', array['Artista', 'Técnica', 'Dimensões']),
  ('joia', array['Material', 'Gema', 'Peso']),
  ('relógio', array['Marca', 'Modelo', 'Movimento']) on conflict (nome) do nothing;
alter table public.categorias enable row level security;
drop policy if exists categorias_leitura on public.categorias;
create policy categorias_leitura on public.categorias for select to authenticated using (true);
revoke all on public.categorias from public, anon, authenticated;
grant select on public.categorias to authenticated;

alter table public.pecas drop constraint if exists pecas_categoria_check;
alter table public.pecas drop constraint if exists pecas_categoria_fk;
alter table public.pecas add constraint pecas_categoria_fk foreign key (categoria)
  references public.categorias(nome) on update cascade on delete restrict;
alter table public.pecas add column if not exists atributos jsonb not null default '{}';
alter table public.pecas add column if not exists privada boolean not null default false;
-- Mantém os anúncios anteriores; novas inserções começam privadas, inclusive via API direta.
alter table public.pecas alter column privada set default true;
alter table public.listas_desejos drop constraint if exists listas_desejos_categorias_check;

create or replace function public.salvar_categoria(p_id bigint, p_nome text, p_atributos text[])
returns bigint language plpgsql security definer set search_path = public as $$
declare v_nome text; v_id bigint; v_atributos text[];
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_nome)), 0) not between 1 and 80 then
    raise exception 'Informe o nome da categoria (até 80 caracteres)' using errcode = 'P0001'; end if;
  v_atributos := coalesce(p_atributos, '{}');
  if cardinality(v_atributos) > 20 or exists(select 1 from unnest(v_atributos) a where a is null or length(trim(a)) not between 1 and 60)
     or (select count(distinct lower(trim(a))) from unnest(v_atributos) a) <> cardinality(v_atributos) then
    raise exception 'Use até 20 atributos diferentes, com até 60 caracteres cada' using errcode = 'P0001'; end if;
  v_atributos := array(select trim(a) from unnest(v_atributos) a);
  if exists(select 1 from public.categorias where lower(nome) = lower(trim(p_nome)) and id is distinct from p_id) then
    raise exception 'Já existe uma categoria com este nome' using errcode = '23505'; end if;
  if p_id is null then
    insert into public.categorias(nome, atributos) values(trim(p_nome), v_atributos) returning id into v_id;
  else
    select nome into v_nome from public.categorias where id = p_id for update;
    if not found then raise exception 'Categoria não encontrada' using errcode = 'P0002'; end if;
    if exists(select 1 from public.pecas p, jsonb_each_text(p.atributos) a
               where p.categoria = v_nome and a.value <> '' and not a.key = any(v_atributos)) then
      raise exception 'Um atributo removido possui valores em peças. Preserve o atributo ou limpe esses valores primeiro' using errcode = '23503'; end if;
    -- Retira chaves vazias antes de mudar a definição e de propagar uma renomeação.
    -- Assim nenhuma peça mantém um atributo invisível que impeça sua próxima edição.
    update public.pecas p set atributos = (select coalesce(jsonb_object_agg(a.key, a.value), '{}'::jsonb)
      from jsonb_each(p.atributos) a where a.key = any(v_atributos))
      where p.categoria = v_nome and exists(select 1 from jsonb_object_keys(p.atributos) k where not k = any(v_atributos));
    update public.categorias set nome = trim(p_nome), atributos = v_atributos, atualizado_em = now() where id = p_id;
    update public.listas_desejos set categorias = array_replace(categorias, v_nome, trim(p_nome)) where v_nome = any(categorias);
    v_id := p_id;
  end if;
  return v_id;
end;
$$;
create or replace function public.remover_categoria(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select nome into v_nome from public.categorias where id = p_id for update;
  if not found then raise exception 'Categoria não encontrada' using errcode = 'P0002'; end if;
  if exists(select 1 from public.pecas where categoria = v_nome) or exists(select 1 from public.listas_desejos where v_nome = any(categorias)) then
    raise exception 'Categoria vinculada a peças ou listas de desejos não pode ser removida' using errcode = '23503'; end if;
  delete from public.categorias where id = p_id;
end;
$$;

-- Mantém classificações válidas e exige decisão do dono antes de publicar o acervo privado.
create or replace function public.validar_classificacao_peca()
returns trigger language plpgsql set search_path = public as $$
declare v_atributos text[];
begin
  select atributos into v_atributos from public.categorias where nome = new.categoria;
  if not found then raise exception 'Categoria inválida. Consulte as categorias cadastradas' using errcode = 'P0001'; end if;
  if jsonb_typeof(new.atributos) <> 'object' then raise exception 'Classificação inválida' using errcode = 'P0001'; end if;
  if exists(select 1 from jsonb_each(new.atributos) a where not a.key = any(v_atributos) or jsonb_typeof(a.value) <> 'string' or length(a.value #>> '{}') > 500) then
    raise exception 'Atributo de classificação inválido para esta categoria' using errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and new.privada is distinct from old.privada and auth.uid() <> old.proprietario_id then
    raise exception 'Somente o proprietário decide a privacidade da peça' using errcode = '42501'; end if;
  if new.privada and new.publicacao = 'publicada' then
    raise exception 'O proprietário deve autorizar a publicação da peça privada' using errcode = 'P0001'; end if;
  return new;
end;
$$;
drop trigger if exists pecas_z_classificacao on public.pecas;
create trigger pecas_z_classificacao before insert or update on public.pecas for each row execute function public.validar_classificacao_peca();

create or replace view public.vw_pecas as
select p.id, p.nome, p.categoria, p.descricao, p.valor_pretendido, p.fotografias,
  p.vendedor_id, pf.nome as vendedor_nome, p.proprietario_id,
  p.publicacao, coalesce(pp.status, 'sem passaporte') as status_passaporte, pp.id as passaporte_id,
  p.em_negociacao, p.vendida, p.criado_em, p.atualizado_em, p.atributos, p.privada
from public.pecas p join public.perfis pf on pf.id = p.vendedor_id
left join public.passaportes pp on pp.peca_id = p.id where public.pode_ver_peca(p.id);

-- Laudos são registros estruturados assinados pelo perito autenticado.
create table if not exists public.laudos (
  id bigint generated always as identity primary key,
  peca_id bigint not null references public.pecas(id) on delete restrict,
  perito_id uuid not null references public.perfis(id) on delete restrict,
  parecer text not null check(length(trim(parecer)) between 1 and 10000),
  valor_avaliacao numeric(14,2) not null check(valor_avaliacao > 0),
  emitido_em date not null,
  fotografias jsonb not null check(jsonb_typeof(fotografias) = 'array' and jsonb_array_length(fotografias) between 1 and 10),
  assinatura text not null default '',
  assinado_em timestamptz not null default now(),
  passaporte_id bigint references public.passaportes(id) on delete restrict,
  criado_em timestamptz not null default now()
);
create index if not exists laudos_peca_idx on public.laudos(peca_id);
create index if not exists laudos_perito_data_idx on public.laudos(perito_id, assinado_em);
alter table public.laudos enable row level security;
revoke all on public.laudos from public, anon, authenticated;
grant select on public.laudos to authenticated;
create or replace function public.pode_ver_laudo(p_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.laudos l where l.id = p_id and
    (public.is_admin() or public.perfil_atual() = 'Perito' or
      (public.pode_ver_peca(l.peca_id) and l.passaporte_id is not null)));
$$;
drop policy if exists laudos_leitura on public.laudos;
create policy laudos_leitura on public.laudos for select to authenticated using(public.pode_ver_laudo(id));

create or replace function public.laudo_assinar(p_id bigint)
returns text language sql stable security definer set search_path = public, extensions as $$
  select encode(hmac(jsonb_build_object('id', l.id, 'peca', l.peca_id, 'perito', l.perito_id,
    'parecer', l.parecer, 'valor', l.valor_avaliacao, 'data', l.emitido_em, 'fotos', l.fotografias,
    'assinadoEm', l.assinado_em)::text, (select valor from public.segredos where chave = 'passaporte'), 'sha256'), 'hex')
  from public.laudos l where id = p_id;
$$;
create or replace function public.laudo_assinatura_valida(p_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_ver_laudo(p_id) and exists(select 1 from public.laudos where id = p_id and assinatura = public.laudo_assinar(p_id));
$$;
create or replace view public.vw_laudos as
select l.*, p.nome as peca_nome, pf.nome as perito_nome, public.laudo_assinatura_valida(l.id) as assinatura_valida
from public.laudos l join public.pecas p on p.id = l.peca_id join public.perfis pf on pf.id = l.perito_id
where public.pode_ver_laudo(l.id);
revoke all on public.vw_laudos from public, anon;
grant select on public.vw_laudos to authenticated;

create or replace function public.salvar_laudo(p_id bigint, p_peca bigint, p_parecer text, p_valor numeric, p_data date, p_fotos jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_laudo public.laudos%rowtype;
begin
  if public.perfil_atual() is distinct from 'Perito' then raise exception 'Somente peritos emitem laudos' using errcode = '42501'; end if;
  if not public.pode_ver_peca(p_peca) then raise exception 'Peça não encontrada' using errcode = 'P0002'; end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A data de emissão não pode estar no futuro' using errcode = 'P0001'; end if;
  if coalesce(length(trim(p_parecer)), 0) not between 1 and 10000 or p_valor is null or p_valor <= 0 or p_valor >= 1000000000000 or round(p_valor, 2) <> p_valor then
    raise exception 'Informe parecer e valor de avaliação válido' using errcode = 'P0001'; end if;
  if p_fotos is null or jsonb_typeof(p_fotos) <> 'array' or jsonb_array_length(p_fotos) not between 1 and 10 then
    raise exception 'Anexe de 1 a 10 fotografias da perícia' using errcode = 'P0001'; end if;
  if exists(select 1 from jsonb_array_elements(p_fotos) f where
    coalesce(f->>'path','') not like auth.uid()::text || '/%' or coalesce(f->>'hash','') !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from storage.objects o where o.bucket_id = 'laudos' and o.name = f->>'path')) then
    raise exception 'Fotografia inválida ou não enviada pelo perito' using errcode = 'P0001'; end if;
  if p_id is null then
    insert into public.laudos(peca_id, perito_id, parecer, valor_avaliacao, emitido_em, fotografias)
    values(p_peca, auth.uid(), trim(p_parecer), p_valor, p_data, p_fotos) returning id into v_id;
  else
    select * into v_laudo from public.laudos where id = p_id for update;
    if not found then raise exception 'Laudo não encontrado' using errcode = 'P0002'; end if;
    if v_laudo.perito_id <> auth.uid() then raise exception 'Somente o perito responsável pode corrigir o laudo' using errcode = '42501'; end if;
    if v_laudo.passaporte_id is not null then raise exception 'Laudo vinculado ao passaporte não pode ser editado' using errcode = '23503'; end if;
    if v_laudo.peca_id <> p_peca then raise exception 'A peça do laudo não pode ser alterada' using errcode = 'P0001'; end if;
    update public.laudos set parecer = trim(p_parecer), valor_avaliacao = p_valor, emitido_em = p_data, fotografias = p_fotos, assinado_em = now() where id = p_id;
    v_id := p_id;
  end if;
  update public.laudos set assinatura = public.laudo_assinar(v_id) where id = v_id;
  perform public.registrar_evento_interno(case when p_id is null then 'laudo_assinado' else 'laudo_corrigido' end, auth.uid(), 'plataforma', p_peca, null, null, jsonb_build_object('laudo_id', v_id));
  return v_id;
end;
$$;
create or replace function public.remover_laudo(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_l public.laudos%rowtype;
begin
  select * into v_l from public.laudos where id = p_id for update;
  if not found then raise exception 'Laudo não encontrado' using errcode = 'P0002'; end if;
  if not public.is_admin() and not (public.perfil_atual() = 'Perito' and auth.uid() = v_l.perito_id) then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if v_l.passaporte_id is not null then raise exception 'Laudo vinculado ao passaporte não pode ser removido' using errcode = '23503'; end if;
  delete from public.laudos where id = p_id;
  perform public.registrar_evento_interno('laudo_removido', auth.uid(), 'plataforma', v_l.peca_id, null, null, jsonb_build_object('laudo_id', p_id));
end;
$$;

-- Fotos privadas; a consulta exige permissão sobre o laudo, nunca URL pública permanente.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('laudos', 'laudos', false, 5242880, array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists laudos_upload on storage.objects;
create policy laudos_upload on storage.objects for insert to authenticated with check
  (bucket_id = 'laudos' and public.perfil_atual() = 'Perito' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists laudos_fotos_leitura on storage.objects;
create policy laudos_fotos_leitura on storage.objects for select to authenticated using
  (bucket_id = 'laudos' and ((storage.foldername(name))[1] = auth.uid()::text or exists
    (select 1 from public.laudos l, jsonb_array_elements(l.fotografias) f where f->>'path' = name and public.pode_ver_laudo(l.id))));
drop policy if exists laudos_fotos_remover on storage.objects;
create policy laudos_fotos_remover on storage.objects for delete to authenticated using
  (bucket_id = 'laudos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()) and not exists
    (select 1 from public.laudos l, jsonb_array_elements(l.fotografias) f where f->>'path' = name));

revoke all on function public.salvar_categoria(bigint,text,text[]), public.remover_categoria(bigint), public.pode_ver_laudo(bigint),
  public.salvar_laudo(bigint,bigint,text,numeric,date,jsonb), public.remover_laudo(bigint) from public, anon;
grant execute on function public.salvar_categoria(bigint,text,text[]), public.remover_categoria(bigint), public.pode_ver_laudo(bigint),
  public.salvar_laudo(bigint,bigint,text,numeric,date,jsonb), public.remover_laudo(bigint) to authenticated;
revoke all on function public.laudo_assinar(bigint) from public, anon, authenticated;
revoke all on function public.laudo_assinatura_valida(bigint) from public, anon;
grant execute on function public.laudo_assinatura_valida(bigint) to authenticated;

-- As funções integradas e o suporte a growth são definidos abaixo na mesma transação.


create or replace function public.validar_lista_desejos(
  p_id bigint, p_nome text, p_categorias text[], p_valor_min numeric, p_valor_max numeric
)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'O nome da lista é obrigatório' using errcode = 'P0001';
  end if;
  if length(trim(p_nome)) > 100 then
    raise exception 'O nome da lista deve ter no máximo 100 caracteres' using errcode = 'P0001';
  end if;
  if exists(select 1 from unnest(coalesce(p_categorias, '{}')) c where not exists(select 1 from public.categorias cat where cat.nome = c)) then
    raise exception 'Categoria inválida. Consulte as categorias cadastradas' using errcode = 'P0001';
  end if;
  if (p_valor_min is not null and p_valor_min < 0) or (p_valor_max is not null and p_valor_max <= 0) then
    raise exception 'Informe valores maiores que zero' using errcode = 'P0001';
  end if;
  if p_valor_min is not null and p_valor_max is not null and p_valor_min > p_valor_max then
    raise exception 'O valor mínimo não pode ser maior que o valor máximo' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.listas_desejos
     where comprador_id = auth.uid() and lower(nome) = lower(trim(p_nome)) and id is distinct from p_id
  ) then
    raise exception 'Você já tem uma lista com este nome' using errcode = '23505';
  end if;
end;
$$;

create or replace function public.relatorio_transacoes(p_inicio date, p_fim date, p_categoria text default null, p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_resultado jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim then raise exception 'Periodo invalido' using errcode = 'P0001'; end if;
  if p_categoria is not null and not exists(select 1 from public.categorias where nome = p_categoria) then raise exception 'Categoria invalida' using errcode = 'P0001'; end if;
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

  -- Acrescenta laudos estruturados; passaportes antigos sem laudos mantêm a assinatura.
  v_payload := v_payload || coalesce((select '|laudos:' || string_agg(id::text || ':' || assinatura, ',' order by id)
    from public.laudos where passaporte_id = p_id), '');
  return encode(hmac(v_payload, v_segredo, 'sha256'), 'hex');
end;
$$;

create or replace function public.passaporte_pendencias(p_peca_id bigint)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when pp.id is null then 'passaporte emitido' end,
    case when pp.id is not null and not exists (
      select 1 from public.passaporte_documentos d where d.passaporte_id = pp.id and d.tipo = 'laudo') and not exists(select 1 from public.laudos l where l.passaporte_id = pp.id) then 'laudo pericial' end,
    case when pp.id is not null and not exists (
      select 1 from public.passaporte_documentos d where d.passaporte_id = pp.id and d.tipo = 'nota fiscal') then 'nota fiscal' end,
    case when cardinality(p.fotografias) = 0 then 'fotografias da peça' end
  ]::text[], null)
  from public.pecas p
  left join public.passaportes pp on pp.peca_id = p.id
  where p.id = p_peca_id
$$;

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
    select count(distinct l.perito_id) into v from public.laudos l
      join public.perfis p on p.id = l.perito_id and p.perfil = 'Perito'
     where l.assinado_em >= t1 - interval '60 days' and l.assinado_em < t1
       and l.assinatura = public.laudo_assinar(l.id);
  when 'primeiras_sessoes_laudo' then
    select count(*) into v from (
      select usuario_id from public.eventos_uso where tipo = 'laudo_consulta' and usuario_id is not null
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

update public.indicador_formulas set descricao = 'Peritos credenciados com pelo menos um laudo assinado e íntegro nos 60 dias até o fim do período' where chave = 'peritos_ativos';
update public.indicador_formulas set descricao = 'Usuários cuja primeira abertura de laudo aconteceu no período' where chave = 'primeiras_sessoes_laudo';

create or replace function public.vincular_laudo(p_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_l public.laudos%rowtype; v_pp bigint; v_nome text;
begin
  if public.perfil_atual() is distinct from 'Perito' then raise exception 'Somente peritos vinculam laudos' using errcode = '42501'; end if;
  select * into v_l from public.laudos where id = p_id for update;
  if not found then raise exception 'Laudo não encontrado' using errcode = 'P0002'; end if;
  if v_l.perito_id <> auth.uid() then raise exception 'Somente o perito responsável vincula o laudo' using errcode = '42501'; end if;
  if v_l.passaporte_id is not null then raise exception 'Laudo já vinculado ao passaporte' using errcode = '23505'; end if;
  if v_l.assinatura <> public.laudo_assinar(p_id) then raise exception 'Assinatura do laudo inválida' using errcode = 'P0001'; end if;
  select id into v_pp from public.passaportes where peca_id = v_l.peca_id for update;
  if not found then raise exception 'Emita primeiro o passaporte desta peça' using errcode = 'P0001'; end if;
  update public.laudos set passaporte_id = v_pp where id = p_id;
  update public.passaportes set versao = versao + 1, assinado_por = auth.uid(), assinado_em = now(), atualizado_em = now() where id = v_pp;
  update public.passaportes set assinatura = public.passaporte_assinar(v_pp) where id = v_pp;
  select nome into v_nome from public.perfis where id = auth.uid();
  insert into public.passaporte_eventos(passaporte_id,tipo,descricao,autor_id,autor_nome)
    values(v_pp, 'atualizacao', 'Laudo pericial ' || p_id || ' vinculado e preservado', auth.uid(), v_nome);
  perform public.registrar_evento_interno('laudo_vinculado', auth.uid(), 'plataforma', v_l.peca_id, v_pp, null, jsonb_build_object('laudo_id', p_id));
  return v_pp;
end;
$$;
create or replace function public.registrar_consulta_laudo(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_l public.laudos%rowtype;
begin
  if auth.uid() is null or not public.pode_ver_laudo(p_id) then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v_l from public.laudos where id = p_id;
  perform pg_advisory_xact_lock(hashtext('laudo:' || auth.uid()::text || ':' || p_id));
  if not exists(select 1 from public.eventos_uso where usuario_id = auth.uid() and tipo = 'laudo_consulta'
    and dados->>'laudo_id' = p_id::text and criado_em > now() - interval '30 minutes') then
    perform public.registrar_evento_interno('laudo_consulta', auth.uid(), 'plataforma', v_l.peca_id, v_l.passaporte_id, null, jsonb_build_object('laudo_id', p_id));
  end if;
end;
$$;
revoke all on function public.vincular_laudo(bigint), public.registrar_consulta_laudo(bigint) from public, anon;
grant execute on function public.vincular_laudo(bigint), public.registrar_consulta_laudo(bigint) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('pecas-privadas', 'pecas-privadas', false, 5242880, array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create or replace function public.pode_ler_foto_privada(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.pecas p where ('privado:' || p_path) = any(p.fotografias)
    and (public.pode_ver_peca(p.id) or exists(select 1 from public.passaportes pp join public.passaporte_links l on l.passaporte_id = pp.id
      where pp.peca_id = p.id and public.link_situacao(l) = 'ativo' and 'fotografias' = any(l.campos_publicos))));
$$;
revoke all on function public.pode_ler_foto_privada(text) from public;
grant execute on function public.pode_ler_foto_privada(text) to authenticated, anon;
drop policy if exists fotos_privadas_upload on storage.objects;
create policy fotos_privadas_upload on storage.objects for insert to authenticated with check
  (bucket_id = 'pecas-privadas' and public.perfil_atual() = 'Vendedor' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_privadas_leitura on storage.objects;
create policy fotos_privadas_leitura on storage.objects for select to authenticated, anon using
  (bucket_id = 'pecas-privadas' and (public.pode_ler_foto_privada(name) or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists fotos_privadas_remover on storage.objects;
create policy fotos_privadas_remover on storage.objects for delete to authenticated using
  (bucket_id = 'pecas-privadas' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.consultar_link_publico(p_token text, p_origem text default 'link')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.passaporte_links%rowtype;
  v_pp public.passaportes%rowtype;
  v_peca public.pecas%rowtype;
  v_situacao text;
  v_origem text := case when p_origem = 'qr' then 'qr' else 'link' end;
  v_campos text[];
  v_identidade boolean;
  v_peca_json jsonb;
  v_resultado jsonb;
begin
  select * into v_link from public.passaporte_links where token = p_token;
  if not found then
    return jsonb_build_object('disponivel', false, 'motivo', 'inexistente');
  end if;

  v_situacao := public.link_situacao(v_link);
  if v_situacao <> 'ativo' then
    return jsonb_build_object('disponivel', false, 'motivo', v_situacao);
  end if;

  select * into v_pp from public.passaportes where id = v_link.passaporte_id;
  select * into v_peca from public.pecas where id = v_pp.peca_id;
  v_campos := v_link.campos_publicos;
  v_identidade := 'identidade_proprietarios' = any(v_campos);

  insert into public.passaporte_link_acessos (link_id, origem) values (v_link.id, v_origem);
  perform public.registrar_evento_interno('passaporte_consulta_link', null, v_origem, v_peca.id, v_pp.id, v_link.id, '{}'::jsonb);

  v_peca_json := jsonb_build_object('nome', v_peca.nome, 'categoria', v_peca.categoria, 'vendida', v_peca.vendida);
  if 'descricao' = any(v_campos) then
    v_peca_json := v_peca_json || jsonb_build_object('descricao', v_peca.descricao);
  end if;
  if 'fotografias' = any(v_campos) then
    v_peca_json := v_peca_json || jsonb_build_object('fotografias', to_jsonb(v_peca.fotografias));
  end if;
  if 'valor' = any(v_campos) then
    v_peca_json := v_peca_json || jsonb_build_object('valor', v_peca.valor_pretendido);
  end if;

  v_resultado := jsonb_build_object(
    'disponivel', true,
    'camposPublicos', to_jsonb(v_campos),
    'peca', v_peca_json,
    'passaporte', jsonb_build_object(
      'numero', v_pp.id,
      'status', v_pp.status,
      'versao', v_pp.versao,
      'perito', (select nome from public.perfis where id = v_pp.perito_id),
      'assinadoPor', (select nome from public.perfis where id = v_pp.assinado_por),
      'assinadoEm', v_pp.assinado_em,
      'assinaturaValida', v_pp.assinatura = public.passaporte_assinar(v_pp.id),
      'codigo', left(v_pp.assinatura, 24)
    )
  );

  if 'documentos' = any(v_campos) then
    -- somente a lista com o hash de integridade; os arquivos ficam no bucket privado.
    -- Notas fiscais identificam o dono e so aparecem se a identidade for publica (RNF04).
    v_resultado := v_resultado || jsonb_build_object('documentos', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', d.tipo, 'titulo', d.titulo, 'hash', d.hash_sha256, 'criadoEm', d.criado_em) order by d.id)
        from public.passaporte_documentos d
       where d.passaporte_id = v_pp.id and (d.tipo <> 'nota fiscal' or v_identidade)
    ), '[]'::jsonb));
  end if;

  if 'documentos' = any(v_campos) then
    -- Sem parecer, valor ou arquivos no link: apenas identificação e integridade do laudo.
    v_resultado := jsonb_set(v_resultado, '{documentos}', (v_resultado->'documentos') || coalesce((
      select jsonb_agg(jsonb_build_object('tipo', 'laudo', 'titulo', 'Laudo pericial ' || l.id || ' · ' || p.nome,
        'hash', l.assinatura, 'criadoEm', l.assinado_em) order by l.id)
      from public.laudos l join public.perfis p on p.id = l.perito_id where l.passaporte_id = v_pp.id), '[]'::jsonb));
  end if;
  if 'historico_proprietarios' = any(v_campos) then
    v_resultado := v_resultado || jsonb_build_object('proprietarios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ordem', o.ordem,
               'nome', case when v_identidade then o.nome else 'Proprietário ' || o.ordem end,
               'desde', o.desde, 'ate', o.ate,
               'atual', (o.ate is null and o.origem = 'plataforma')) order by o.ordem)
        from public.passaporte_proprietarios o
       where o.passaporte_id = v_pp.id
    ), '[]'::jsonb));
  end if;

  if 'historico_eventos' = any(v_campos) then
    -- eventos de privacidade identificam o dono e nao entram na consulta publica
    v_resultado := v_resultado || jsonb_build_object('eventos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'tipo', e.tipo, 'descricao', e.descricao,
               'autor', case when e.tipo in ('emissao', 'atualizacao') then e.autor_nome else 'Sistema' end,
               'criadoEm', e.criado_em) order by e.id)
        from public.passaporte_eventos e
       where e.passaporte_id = v_pp.id and e.tipo <> 'privacidade'
    ), '[]'::jsonb));
  end if;

  return v_resultado;
end;
$$;

create or replace function public.exportar_dados_proprietario()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Acesso negado' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exportadoEm', now(),
    'colecao', coalesce((select jsonb_agg(jsonb_build_object(
        'nome', i.nome, 'categoria', i.categoria, 'estadoConservacao', i.estado_conservacao, 'fotografias', i.fotografias,
        'documentos', i.documentos, 'ultimaManutencao', i.ultima_manutencao, 'valorReferencia', i.valor_referencia,
        'visibilidade', i.visibilidade, 'status', i.status, 'atualizadoEm', i.atualizado_em,
        'historico', (select coalesce(jsonb_agg(jsonb_build_object('data', h.criado_em, 'descricao', h.descricao) order by h.id), '[]'::jsonb)
                        from public.colecao_historico h where h.item_id = i.id)) order by i.id)
      from public.colecao_itens i where i.proprietario_id = auth.uid()), '[]'::jsonb),
    'passaportes', coalesce((select jsonb_agg(jsonb_build_object(
        'peca', pc.nome, 'categoria', pc.categoria, 'passaporte', pp.id, 'status', pp.status, 'versao', pp.versao,
        'assinatura', pp.assinatura, 'assinadoEm', pp.assinado_em,
        'laudos', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'perito', pf.nome,
          'parecer', l.parecer, 'valorAvaliacao', l.valor_avaliacao, 'emitidoEm', l.emitido_em,
          'assinatura', l.assinatura, 'fotografias', l.fotografias) order by l.id), '[]'::jsonb)
          from public.laudos l join public.perfis pf on pf.id = l.perito_id where l.passaporte_id = pp.id),
        'documentos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', d.tipo, 'titulo', d.titulo, 'hash', d.hash_sha256) order by d.id), '[]'::jsonb)
                         from public.passaporte_documentos d where d.passaporte_id = pp.id),
        'eventos', (select coalesce(jsonb_agg(jsonb_build_object('data', e.criado_em, 'tipo', e.tipo, 'descricao', e.descricao) order by e.id), '[]'::jsonb)
                      from public.passaporte_eventos e where e.passaporte_id = pp.id)) order by pp.id)
      from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
     where pc.proprietario_id = auth.uid()), '[]'::jsonb)
  );
end;
$$;
notify pgrst, 'reload schema';
commit;
