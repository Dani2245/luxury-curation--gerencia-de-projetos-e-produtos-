-- Lastro - RFC22 (Lista de Desejos) e RFC21 (Alertas e Lembretes)
-- Execute depois de schema-rnf06-rfc16.sql. O script pode ser executado mais de uma vez.

-- ---------------------------------------------------------------------------
-- Pecas: data de publicacao pela curadoria (define as "pecas novas" da lista de desejos)
-- ---------------------------------------------------------------------------
alter table public.pecas add column if not exists publicado_em timestamptz;
update public.pecas set publicado_em = atualizado_em where publicacao = 'publicada' and publicado_em is null;

create or replace function public.pecas_publicado_em()
returns trigger
language plpgsql
as $$
begin
  if new.publicacao = 'publicada' and (tg_op = 'INSERT' or old.publicacao is distinct from 'publicada') then
    new.publicado_em := now();
  end if;
  return new;
end;
$$;

-- roda depois de pecas_guard_trg (ordem alfabetica), que pode devolver o anuncio para 'pendente'
drop trigger if exists pecas_publicado_em_trg on public.pecas;
create trigger pecas_publicado_em_trg
  before insert or update of publicacao on public.pecas
  for each row execute function public.pecas_publicado_em();

-- ---------------------------------------------------------------------------
-- Lista de desejos (RFC22, RFS77 a RFS80)
-- ---------------------------------------------------------------------------
create table if not exists public.listas_desejos (
  id bigint generated always as identity primary key,
  comprador_id uuid not null references public.perfis (id) on delete cascade,
  nome varchar(100) not null,
  categorias text[] not null default '{}' check (categorias <@ array['obra de arte', 'joia', 'relógio']::text[]),
  valor_min numeric(14, 2) check (valor_min is null or valor_min >= 0),
  valor_max numeric(14, 2) check (valor_max is null or valor_max > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (valor_min is null or valor_max is null or valor_min <= valor_max)
);
create index if not exists listas_desejos_comprador_idx on public.listas_desejos (comprador_id);

create table if not exists public.lista_desejos_pecas (
  lista_id bigint not null references public.listas_desejos (id) on delete cascade,
  peca_id bigint not null references public.pecas (id) on delete cascade,
  salva_em timestamptz not null default now(),
  primary key (lista_id, peca_id)
);
create index if not exists lista_desejos_pecas_peca_idx on public.lista_desejos_pecas (peca_id);

-- ---------------------------------------------------------------------------
-- Alertas e lembretes (RFC21, RFS73 a RFS76). Canal: somente plataforma nesta versao.
-- O lembrete de conservacao depende da colecao privada (RFC23) e entra junto com ela.
-- ---------------------------------------------------------------------------
create table if not exists public.alertas (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  tipo text not null check (tipo in ('peca compativel', 'passaporte incompleto')),
  lista_id bigint references public.listas_desejos (id) on delete cascade,
  frequencia text not null check (frequencia in ('diaria', 'semanal', 'mensal')),
  canal text not null default 'plataforma' check (canal in ('plataforma', 'email')),
  ativo boolean not null default true,
  -- marco a partir do qual uma peca publicada conta como novidade (criacao ou ultima reativacao)
  referencia_em timestamptz not null default now(),
  ultimo_envio timestamptz,
  desativado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((tipo = 'peca compativel') = (lista_id is not null))
);
create unique index if not exists alertas_unico_idx on public.alertas (usuario_id, tipo, coalesce(lista_id, 0));

-- Envios na plataforma: caixa de notificacoes e historico de envios de cada alerta
create table if not exists public.alerta_envios (
  id bigint generated always as identity primary key,
  alerta_id bigint not null references public.alertas (id) on delete cascade,
  usuario_id uuid not null references public.perfis (id) on delete cascade,
  titulo varchar(200) not null,
  mensagem text not null,
  link text,
  itens jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists alerta_envios_usuario_idx on public.alerta_envios (usuario_id, criado_em);
create index if not exists alerta_envios_alerta_idx on public.alerta_envios (alerta_id);

-- ---------------------------------------------------------------------------
-- Regras de compatibilidade e de passaporte completo
-- ---------------------------------------------------------------------------
-- Peca publicada e disponivel que atende aos criterios da lista e ainda nao foi salva nela
create or replace function public.peca_compativel(p_lista public.listas_desejos, p_peca public.pecas)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (cardinality(p_lista.categorias) > 0 or p_lista.valor_min is not null or p_lista.valor_max is not null)
     and p_peca.publicacao = 'publicada'
     and not p_peca.vendida
     and p_peca.proprietario_id <> p_lista.comprador_id
     and (cardinality(p_lista.categorias) = 0 or p_peca.categoria = any(p_lista.categorias))
     and (p_lista.valor_min is null or p_peca.valor_pretendido >= p_lista.valor_min)
     and (p_lista.valor_max is null or p_peca.valor_pretendido <= p_lista.valor_max)
     and not exists (select 1 from public.lista_desejos_pecas s where s.lista_id = p_lista.id and s.peca_id = p_peca.id)
$$;

-- O que falta para o passaporte da peca ficar completo: emissao, laudo pericial, nota fiscal e fotografias
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
      select 1 from public.passaporte_documentos d where d.passaporte_id = pp.id and d.tipo = 'laudo') then 'laudo pericial' end,
    case when pp.id is not null and not exists (
      select 1 from public.passaporte_documentos d where d.passaporte_id = pp.id and d.tipo = 'nota fiscal') then 'nota fiscal' end,
    case when cardinality(p.fotografias) = 0 then 'fotografias da peça' end
  ]::text[], null)
  from public.pecas p
  left join public.passaportes pp on pp.peca_id = p.id
  where p.id = p_peca_id
$$;

-- Pecas do estoque do vendedor autenticado com passaporte incompleto
create or replace function public.passaportes_incompletos_estoque()
returns table (peca_id bigint, nome text, pendencias text[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome::text, public.passaporte_pendencias(p.id)
    from public.pecas p
   where p.vendedor_id = auth.uid() and p.proprietario_id = auth.uid()
     and not p.vendida and p.publicacao <> 'rejeitada'
     and cardinality(public.passaporte_pendencias(p.id)) > 0
   order by p.nome
$$;

create or replace function public.alerta_intervalo(p_frequencia text)
returns interval
language sql
immutable
as $$
  select case p_frequencia when 'diaria' then interval '1 day' when 'semanal' then interval '7 days' else interval '30 days' end
$$;

-- ---------------------------------------------------------------------------
-- Visibilidade: cada usuario ve so as proprias listas, alertas e notificacoes; escritas pelas funcoes
-- ---------------------------------------------------------------------------
alter table public.listas_desejos enable row level security;
alter table public.lista_desejos_pecas enable row level security;
alter table public.alertas enable row level security;
alter table public.alerta_envios enable row level security;

drop policy if exists listas_desejos_select on public.listas_desejos;
create policy listas_desejos_select on public.listas_desejos
  for select to authenticated using (comprador_id = auth.uid());

drop policy if exists lista_desejos_pecas_select on public.lista_desejos_pecas;
create policy lista_desejos_pecas_select on public.lista_desejos_pecas
  for select to authenticated
  using (exists (select 1 from public.listas_desejos l where l.id = lista_id and l.comprador_id = auth.uid()));

drop policy if exists alertas_select on public.alertas;
create policy alertas_select on public.alertas
  for select to authenticated using (usuario_id = auth.uid());

drop policy if exists alerta_envios_select on public.alerta_envios;
create policy alerta_envios_select on public.alerta_envios
  for select to authenticated using (usuario_id = auth.uid());

revoke all on public.listas_desejos, public.lista_desejos_pecas, public.alertas, public.alerta_envios
  from public, anon, authenticated;
grant select on public.listas_desejos, public.lista_desejos_pecas, public.alertas, public.alerta_envios to authenticated;

create or replace view public.vw_listas_desejos as
select
  l.id, l.nome, l.categorias, l.valor_min, l.valor_max, l.criado_em, l.atualizado_em,
  coalesce((select array_agg(s.peca_id order by s.salva_em) from public.lista_desejos_pecas s where s.lista_id = l.id), '{}') as pecas_ids,
  (select count(*) from public.pecas p where public.peca_compativel(l, p)) as compativeis,
  (select count(*) from public.pecas p where public.peca_compativel(l, p) and p.publicado_em > l.criado_em) as novas,
  (select a.id from public.alertas a where a.lista_id = l.id) as alerta_id
from public.listas_desejos l
where l.comprador_id = auth.uid();

create or replace view public.vw_lista_desejos_pecas as
select
  s.lista_id, s.peca_id, p.nome, p.categoria, p.valor_pretendido as valor, p.fotografias[1] as fotografia, s.salva_em,
  case
    when p.vendida then 'vendida'
    when p.publicacao <> 'publicada' then 'indisponível'
    when p.em_negociacao then 'em negociação'
    else 'disponível'
  end as situacao
from public.lista_desejos_pecas s
join public.listas_desejos l on l.id = s.lista_id
join public.pecas p on p.id = s.peca_id
where l.comprador_id = auth.uid();

create or replace view public.vw_alertas as
select
  a.id, a.tipo, a.lista_id, l.nome as lista_nome, a.frequencia, a.canal, a.ativo, a.ultimo_envio, a.criado_em,
  -- sem envio anterior, o alerta sai assim que houver novidade
  case when a.ativo and a.ultimo_envio is not null then a.ultimo_envio + public.alerta_intervalo(a.frequencia) end as proximo_envio,
  (select count(*) from public.alerta_envios e where e.alerta_id = a.id) as envios
from public.alertas a
left join public.listas_desejos l on l.id = a.lista_id
where a.usuario_id = auth.uid();

revoke all on public.vw_listas_desejos, public.vw_lista_desejos_pecas, public.vw_alertas from anon;
grant select on public.vw_listas_desejos, public.vw_lista_desejos_pecas, public.vw_alertas to authenticated;

-- ---------------------------------------------------------------------------
-- Lista de desejos: escritas (RFS77, RFS79, RFS80) e consultas (RFS78)
-- ---------------------------------------------------------------------------
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
  if not (coalesce(p_categorias, '{}') <@ array['obra de arte', 'joia', 'relógio']::text[]) then
    raise exception 'Categoria inválida. Escolha: obra de arte, joia ou relógio' using errcode = 'P0001';
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

create or replace function public.salvar_peca_lista(p_lista_id bigint, p_peca_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.listas_desejos where id = p_lista_id and comprador_id = auth.uid()) then
    raise exception 'Lista de desejos não encontrada' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.pecas p
     where p.id = p_peca_id and p.publicacao = 'publicada' and not p.vendida and public.pode_ver_peca(p.id)
  ) then
    raise exception 'A peça não está disponível na plataforma' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lista_desejos_pecas where lista_id = p_lista_id and peca_id = p_peca_id) then
    raise exception 'A peça já está nesta lista' using errcode = '23505';
  end if;

  insert into public.lista_desejos_pecas (lista_id, peca_id) values (p_lista_id, p_peca_id);
  update public.listas_desejos set atualizado_em = now() where id = p_lista_id;
  -- investimento do modelo Hooked (RF05: tempo ate o primeiro investimento)
  perform public.registrar_evento_interno('peca_salva', auth.uid(), 'plataforma', p_peca_id, null, null,
                                          jsonb_build_object('lista_id', p_lista_id));
end;
$$;

-- RFS77 - cria uma lista por categoria e faixa de valor, ou ao salvar uma peca consultada
create or replace function public.criar_lista_desejos(
  p_nome text, p_categorias text[] default '{}', p_valor_min numeric default null, p_valor_max numeric default null,
  p_peca_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_categorias text[];
begin
  if public.perfil_atual() is distinct from 'Comprador' then
    raise exception 'Somente compradores mantêm listas de desejos' using errcode = '42501';
  end if;

  perform public.validar_lista_desejos(null, p_nome, p_categorias, p_valor_min, p_valor_max);
  v_categorias := array(select distinct c from unnest(coalesce(p_categorias, '{}')) c order by c);

  insert into public.listas_desejos (comprador_id, nome, categorias, valor_min, valor_max)
  values (auth.uid(), trim(p_nome), v_categorias, p_valor_min, p_valor_max)
  returning id into v_id;

  perform public.registrar_evento_interno('lista_desejos_criada', auth.uid(), 'plataforma', null, null, null,
                                          jsonb_build_object('lista_id', v_id, 'categorias', to_jsonb(v_categorias)));

  if p_peca_id is not null then
    perform public.salvar_peca_lista(v_id, p_peca_id);
  end if;

  return v_id;
end;
$$;

-- RFS79 - altera os criterios da lista
create or replace function public.editar_lista_desejos(
  p_id bigint, p_nome text, p_categorias text[] default '{}', p_valor_min numeric default null, p_valor_max numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.listas_desejos where id = p_id and comprador_id = auth.uid()) then
    raise exception 'Lista de desejos não encontrada' using errcode = 'P0002';
  end if;

  perform public.validar_lista_desejos(p_id, p_nome, p_categorias, p_valor_min, p_valor_max);

  update public.listas_desejos
     set nome = trim(p_nome),
         categorias = array(select distinct c from unnest(coalesce(p_categorias, '{}')) c order by c),
         valor_min = p_valor_min, valor_max = p_valor_max, atualizado_em = now()
   where id = p_id;

  perform public.registrar_evento_interno('lista_desejos_editada', auth.uid(), 'plataforma', null, null, null,
                                          jsonb_build_object('lista_id', p_id));
end;
$$;

-- RFS79 - retira uma peca da lista
create or replace function public.remover_peca_lista(p_lista_id bigint, p_peca_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.listas_desejos where id = p_lista_id and comprador_id = auth.uid()) then
    raise exception 'Lista de desejos não encontrada' using errcode = 'P0002';
  end if;
  delete from public.lista_desejos_pecas where lista_id = p_lista_id and peca_id = p_peca_id;
  if not found then
    raise exception 'A peça não está nesta lista' using errcode = 'P0002';
  end if;
  update public.listas_desejos set atualizado_em = now() where id = p_lista_id;
end;
$$;

-- RFS80 - exclui a lista e os alertas vinculados a ela (cascata)
create or replace function public.remover_lista_desejos(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.listas_desejos where id = p_id and comprador_id = auth.uid();
  if not found then
    raise exception 'Lista de desejos não encontrada' using errcode = 'P0002';
  end if;
  perform public.registrar_evento_interno('lista_desejos_removida', auth.uid(), 'plataforma', null, null, null,
                                          jsonb_build_object('lista_id', p_id));
end;
$$;

-- RFS78 - pecas da curadoria compativeis com a lista; "nova" quando publicada depois da criacao da lista
create or replace function public.pecas_compativeis_lista(p_lista_id bigint)
returns table (peca_id bigint, nome text, categoria text, valor numeric, fotografia text, publicado_em timestamptz, nova boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome::text, p.categoria, p.valor_pretendido::numeric, p.fotografias[1], p.publicado_em,
         coalesce(p.publicado_em > l.criado_em, false)
    from public.listas_desejos l
    join public.pecas p on public.peca_compativel(l, p)
   where l.id = p_lista_id and l.comprador_id = auth.uid()
   order by p.publicado_em desc nulls last, p.nome
   limit 50
$$;

-- RFS78 - o administrador ve so a demanda agregada, sem identificar o comprador
create or replace function public.demanda_listas_desejos()
returns table (categoria_desejada text, listas bigint, compradores bigint, valor_min_medio numeric, valor_max_medio numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    select c.cat, count(distinct l.id), count(distinct l.comprador_id), round(avg(l.valor_min), 2), round(avg(l.valor_max), 2)
      from public.listas_desejos l
      cross join lateral unnest(
        case when cardinality(l.categorias) = 0 then array['todas as categorias']::text[] else l.categorias end
      ) as c (cat)
     group by c.cat
     order by 2 desc, 1;
end;
$$;

create or replace function public.pecas_mais_salvas(p_limite integer default 5)
returns table (peca text, categoria_peca text, vezes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    select p.nome::text, p.categoria, count(*)
      from public.lista_desejos_pecas s
      join public.pecas p on p.id = s.peca_id
     group by p.id, p.nome, p.categoria
     order by 3 desc, 1
     limit greatest(coalesce(p_limite, 5), 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Alertas: escritas (RFS73, RFS75, RFS76), envio na plataforma e consulta (RFS74)
-- ---------------------------------------------------------------------------
create or replace function public.validar_alerta(p_frequencia text, p_canal text)
returns void
language plpgsql
immutable
as $$
begin
  if p_frequencia not in ('diaria', 'semanal', 'mensal') then
    raise exception 'Frequência inválida. Escolha: diaria, semanal ou mensal' using errcode = 'P0001';
  end if;
  if p_canal = 'email' then
    raise exception 'O envio por e-mail ainda não está disponível. Use a plataforma' using errcode = 'P0001';
  end if;
  if p_canal <> 'plataforma' then
    raise exception 'Canal inválido' using errcode = 'P0001';
  end if;
end;
$$;

-- RFS73 - comprador: peca compativel com uma lista; vendedor: passaportes incompletos do estoque.
-- Frequencia padrao conservadora (RNF05): semanal e mensal.
create or replace function public.criar_alerta(
  p_tipo text, p_lista_id bigint default null, p_frequencia text default null, p_canal text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frequencia text;
  v_canal text := coalesce(p_canal, 'plataforma');
  v_id bigint;
begin
  if p_tipo = 'peca compativel' then
    if public.perfil_atual() is distinct from 'Comprador' then
      raise exception 'O alerta de peça compatível é exclusivo do comprador' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.listas_desejos where id = p_lista_id and comprador_id = auth.uid()) then
      raise exception 'Lista de desejos não encontrada' using errcode = 'P0002';
    end if;
    v_frequencia := coalesce(p_frequencia, 'semanal');
  elsif p_tipo = 'passaporte incompleto' then
    if public.perfil_atual() is distinct from 'Vendedor' then
      raise exception 'O lembrete de passaporte incompleto é exclusivo do vendedor' using errcode = 'P0001';
    end if;
    v_frequencia := coalesce(p_frequencia, 'mensal');
  else
    raise exception 'Tipo de alerta inválido' using errcode = 'P0001';
  end if;

  perform public.validar_alerta(v_frequencia, v_canal);

  if exists (
    select 1 from public.alertas
     where usuario_id = auth.uid() and tipo = p_tipo and coalesce(lista_id, 0) = coalesce(case when p_tipo = 'peca compativel' then p_lista_id end, 0)
  ) then
    raise exception '%', case when p_tipo = 'peca compativel' then 'Já existe um alerta para esta lista de desejos'
                              else 'Você já tem um lembrete de passaportes incompletos' end
      using errcode = '23505';
  end if;

  insert into public.alertas (usuario_id, tipo, lista_id, frequencia, canal)
  values (auth.uid(), p_tipo, case when p_tipo = 'peca compativel' then p_lista_id end, v_frequencia, v_canal)
  returning id into v_id;

  perform public.registrar_evento_interno('alerta_criado', auth.uid(), 'plataforma', null, null, null,
                                          jsonb_build_object('tipo', p_tipo, 'frequencia', v_frequencia, 'alerta_id', v_id));
  return v_id;
end;
$$;

-- RFS75 - altera frequencia e canal
create or replace function public.editar_alerta(p_id bigint, p_frequencia text, p_canal text default 'plataforma')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.alertas where id = p_id and usuario_id = auth.uid();
  if not found then
    raise exception 'Alerta não encontrado' using errcode = 'P0002';
  end if;

  perform public.validar_alerta(p_frequencia, coalesce(p_canal, 'plataforma'));

  update public.alertas
     set frequencia = p_frequencia, canal = coalesce(p_canal, 'plataforma'), atualizado_em = now()
   where id = p_id;

  perform public.registrar_evento_interno('alerta_editado', auth.uid(), 'plataforma', null, null, null,
                                          jsonb_build_object('tipo', v_tipo, 'frequencia', p_frequencia));
end;
$$;

-- RFS75 - liga ou desliga o alerta com uma unica acao (RNF05: todo alerta e desligavel)
create or replace function public.definir_alerta_ativo(p_id bigint, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerta public.alertas%rowtype;
begin
  select * into v_alerta from public.alertas where id = p_id and usuario_id = auth.uid();
  if not found then
    raise exception 'Alerta não encontrado' using errcode = 'P0002';
  end if;
  if v_alerta.ativo = p_ativo then
    return;
  end if;

  update public.alertas
     set ativo = p_ativo,
         desativado_em = case when p_ativo then null else now() end,
         -- ao religar, pecas publicadas enquanto o alerta estava desligado nao viram uma enxurrada de avisos
         referencia_em = case when p_ativo then now() else referencia_em end,
         atualizado_em = now()
   where id = p_id;

  perform public.registrar_evento_interno(case when p_ativo then 'alerta_reativado' else 'alerta_desativado' end,
                                          auth.uid(), 'plataforma', null, null, null, jsonb_build_object('tipo', v_alerta.tipo, 'alerta_id', p_id));
end;
$$;

-- RFS76 - exclui o alerta definitivamente
create or replace function public.remover_alerta(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.alertas where id = p_id and usuario_id = auth.uid();
  if not found then
    raise exception 'Alerta não encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- Exclusao (direta ou pela remocao da lista) entra na taxa de desativacao quando o alerta estava ligado
create or replace function public.eventos_alerta_remocao_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.registrar_evento_interno('alerta_removido', null, 'plataforma', null, null, null,
                                          jsonb_build_object('tipo', old.tipo, 'ativo', old.ativo, 'alerta_id', old.id));
  return old;
end;
$$;

drop trigger if exists eventos_alerta_remocao_trg on public.alertas;
create trigger eventos_alerta_remocao_trg
  after delete on public.alertas
  for each row execute function public.eventos_alerta_remocao_trg();

-- Envio na plataforma: gera as notificacoes devidas do usuario autenticado, respeitando a frequencia.
-- Chamado quando o usuario abre a plataforma; um alerta so e enviado se houver novidade.
create or replace function public.processar_alertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alerta public.alertas%rowtype;
  v_lista public.listas_desejos%rowtype;
  v_itens jsonb;
  v_qtd integer;
  v_titulo text;
  v_mensagem text;
  v_link text;
  v_total integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  -- FOR UPDATE: chamadas simultaneas do mesmo usuario nao geram envio duplicado
  for v_alerta in
    select * from public.alertas a
     where a.usuario_id = auth.uid() and a.ativo
       and (a.ultimo_envio is null or a.ultimo_envio + public.alerta_intervalo(a.frequencia) <= now())
     order by a.id
     for update
  loop
    v_itens := null;

    if v_alerta.tipo = 'peca compativel' then
      select * into v_lista from public.listas_desejos where id = v_alerta.lista_id;
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'categoria', p.categoria, 'valor', p.valor_pretendido)
                       order by p.publicado_em, p.id)
        into v_itens
        from public.pecas p
       where public.peca_compativel(v_lista, p)
         and p.publicado_em > greatest(coalesce(v_alerta.ultimo_envio, v_alerta.referencia_em), v_alerta.referencia_em);

      if v_itens is not null then
        v_qtd := jsonb_array_length(v_itens);
        v_titulo := case when v_qtd = 1 then 'Nova peça compatível com "' || v_lista.nome || '"'
                         else v_qtd || ' novas peças compatíveis com "' || v_lista.nome || '"' end;
        v_mensagem := (select string_agg(i ->> 'nome', ' · ') from jsonb_array_elements(v_itens) i);
        v_link := '/dashboard/listas/' || v_lista.id;
      end if;
    else
      select jsonb_agg(jsonb_build_object('id', e.peca_id, 'nome', e.nome, 'pendencias', to_jsonb(e.pendencias)) order by e.nome)
        into v_itens
        from public.passaportes_incompletos_estoque() e;

      if v_itens is not null then
        v_qtd := jsonb_array_length(v_itens);
        v_titulo := case when v_qtd = 1 then '1 peça com passaporte incompleto' else v_qtd || ' peças com passaporte incompleto' end;
        v_mensagem := (
          select string_agg((i ->> 'nome') || ': falta ' ||
                            (select string_agg(x, ', ') from jsonb_array_elements_text(i -> 'pendencias') x), ' · ')
            from jsonb_array_elements(v_itens) i
        );
        v_link := '/dashboard/alertas';
      end if;
    end if;

    if v_itens is not null then
      insert into public.alerta_envios (alerta_id, usuario_id, titulo, mensagem, link, itens)
      values (v_alerta.id, auth.uid(), left(v_titulo, 200), v_mensagem, v_link, v_itens);
      update public.alertas set ultimo_envio = now() where id = v_alerta.id;
      perform public.registrar_evento_interno('alerta_enviado', auth.uid(), 'plataforma', null, null, null,
                                              jsonb_build_object('tipo', v_alerta.tipo));
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

-- Abrir a notificacao marca como lida e registra o acesso vindo de gatilho externo (alerta)
create or replace function public.abrir_notificacao(p_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_envio public.alerta_envios%rowtype;
  v_tipo text;
begin
  select * into v_envio from public.alerta_envios where id = p_id and usuario_id = auth.uid();
  if not found then
    raise exception 'Notificação não encontrada' using errcode = 'P0002';
  end if;

  update public.alerta_envios set lida_em = coalesce(lida_em, now()) where id = p_id;
  select tipo into v_tipo from public.alertas where id = v_envio.alerta_id;
  perform public.registrar_evento_interno('alerta_aberto', auth.uid(), 'alerta', null, null, null,
                                          jsonb_build_object('tipo', v_tipo));
  return v_envio.link;
end;
$$;

-- Administrador: taxa de desativacao dos alertas no periodo (desligados ou excluidos enquanto ligados / criados)
create or replace function public.resumo_alertas(p_inicio date default null, p_fim date default null)
returns table (tipo_alerta text, criados bigint, ativos bigint, desativados bigint, removidos bigint,
               envios bigint, abertos bigint, taxa_desativacao numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
    with ev as (
      select e.tipo as evento, e.dados ->> 'tipo' as tipo_a, e.dados ->> 'ativo' as estava_ativo, e.dados ->> 'alerta_id' as alerta
        from public.eventos_uso e
       where e.tipo in ('alerta_criado', 'alerta_desativado', 'alerta_removido', 'alerta_enviado', 'alerta_aberto')
         and (p_inicio is null or (e.criado_em at time zone 'America/Sao_Paulo')::date >= p_inicio)
         and (p_fim is null or (e.criado_em at time zone 'America/Sao_Paulo')::date <= p_fim)
    ),
    -- conta alertas distintos: desligar e religar varias vezes nao infla a taxa
    base as (
      select t.tipo_a,
             count(*) filter (where ev.evento = 'alerta_criado') as c,
             count(distinct ev.alerta) filter (where ev.evento = 'alerta_desativado') as d,
             count(distinct ev.alerta) filter (where ev.evento = 'alerta_removido' and ev.estava_ativo = 'true') as r,
             count(distinct ev.alerta) filter (
               where ev.evento = 'alerta_desativado' or (ev.evento = 'alerta_removido' and ev.estava_ativo = 'true')) as optout,
             count(*) filter (where ev.evento = 'alerta_enviado') as env,
             count(*) filter (where ev.evento = 'alerta_aberto') as ab
        from (values ('peca compativel'), ('passaporte incompleto')) as t (tipo_a)
        left join ev on ev.tipo_a = t.tipo_a
       group by t.tipo_a
    )
    -- limitada a 100%: alertas criados antes do periodo podem ser desligados dentro dele
    select b.tipo_a, b.c, (select count(*) from public.alertas a where a.tipo = b.tipo_a and a.ativo),
           b.d, b.r, b.env, b.ab, least(round(100.0 * b.optout / nullif(b.c, 0), 1), 100.0)
      from base b
     order by b.tipo_a;
end;
$$;

-- usada pelas views: quem consulta a view precisa poder executa-la
revoke all on function public.peca_compativel(public.listas_desejos, public.pecas) from public, anon;
grant execute on function public.peca_compativel(public.listas_desejos, public.pecas) to authenticated;
revoke all on function public.passaporte_pendencias(bigint) from public, anon, authenticated;
revoke all on function public.validar_lista_desejos(bigint, text, text[], numeric, numeric) from public, anon, authenticated;
revoke all on function public.validar_alerta(text, text) from public, anon, authenticated;
revoke all on function public.eventos_alerta_remocao_trg() from public, anon, authenticated;
revoke all on function public.passaportes_incompletos_estoque() from public, anon;
revoke all on function public.salvar_peca_lista(bigint, bigint) from public, anon;
revoke all on function public.criar_lista_desejos(text, text[], numeric, numeric, bigint) from public, anon;
revoke all on function public.editar_lista_desejos(bigint, text, text[], numeric, numeric) from public, anon;
revoke all on function public.remover_peca_lista(bigint, bigint) from public, anon;
revoke all on function public.remover_lista_desejos(bigint) from public, anon;
revoke all on function public.pecas_compativeis_lista(bigint) from public, anon;
revoke all on function public.demanda_listas_desejos() from public, anon;
revoke all on function public.pecas_mais_salvas(integer) from public, anon;
revoke all on function public.criar_alerta(text, bigint, text, text) from public, anon;
revoke all on function public.editar_alerta(bigint, text, text) from public, anon;
revoke all on function public.definir_alerta_ativo(bigint, boolean) from public, anon;
revoke all on function public.remover_alerta(bigint) from public, anon;
revoke all on function public.processar_alertas() from public, anon;
revoke all on function public.abrir_notificacao(bigint) from public, anon;
revoke all on function public.resumo_alertas(date, date) from public, anon;
grant execute on function public.passaportes_incompletos_estoque() to authenticated;
grant execute on function public.salvar_peca_lista(bigint, bigint) to authenticated;
grant execute on function public.criar_lista_desejos(text, text[], numeric, numeric, bigint) to authenticated;
grant execute on function public.editar_lista_desejos(bigint, text, text[], numeric, numeric) to authenticated;
grant execute on function public.remover_peca_lista(bigint, bigint) to authenticated;
grant execute on function public.remover_lista_desejos(bigint) to authenticated;
grant execute on function public.pecas_compativeis_lista(bigint) to authenticated;
grant execute on function public.demanda_listas_desejos() to authenticated;
grant execute on function public.pecas_mais_salvas(integer) to authenticated;
grant execute on function public.criar_alerta(text, bigint, text, text) to authenticated;
grant execute on function public.editar_alerta(bigint, text, text) to authenticated;
grant execute on function public.definir_alerta_ativo(bigint, boolean) to authenticated;
grant execute on function public.remover_alerta(bigint) to authenticated;
grant execute on function public.processar_alertas() to authenticated;
grant execute on function public.abrir_notificacao(bigint) to authenticated;
grant execute on function public.resumo_alertas(date, date) to authenticated;

notify pgrst, 'reload schema';
