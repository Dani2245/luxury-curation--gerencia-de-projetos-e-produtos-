-- Lastro - RNF06 (Registro de eventos de uso) e RFC16 (Links de compartilhamento do passaporte)
-- Execute depois de schema-rfc03-rfc04.sql. O script pode ser executado mais de uma vez.

-- ---------------------------------------------------------------------------
-- Eventos de uso (RNF06): data, origem e indicacao de gatilho externo.
-- Alimentam os indicadores de CS, growth e habito; leitura somente agregada.
-- ---------------------------------------------------------------------------
create table if not exists public.eventos_uso (
  id bigint generated always as identity primary key,
  tipo text not null,
  usuario_id uuid references public.perfis (id) on delete set null,
  origem text not null default 'plataforma',
  gatilho_externo boolean not null default false,
  peca_id bigint references public.pecas (id) on delete cascade,
  passaporte_id bigint references public.passaportes (id) on delete cascade,
  link_id bigint,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists eventos_uso_tipo_idx on public.eventos_uso (tipo, criado_em);
create index if not exists eventos_uso_passaporte_idx on public.eventos_uso (passaporte_id, criado_em);
create index if not exists eventos_uso_usuario_idx on public.eventos_uso (usuario_id, criado_em);

alter table public.eventos_uso enable row level security;
revoke all on public.eventos_uso from public, anon, authenticated;

-- Origens conhecidas; link, QR, alerta e e-mail sao gatilhos externos (modelo Hooked)
create or replace function public.evento_origem(p_origem text)
returns text
language sql
immutable
as $$
  select case
    when lower(trim(p_origem)) in ('link', 'qr', 'alerta', 'email') then lower(trim(p_origem))
    else 'plataforma'
  end
$$;

create or replace function public.registrar_evento_interno(
  p_tipo text, p_usuario uuid, p_origem text, p_peca_id bigint, p_passaporte_id bigint, p_link_id bigint, p_dados jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem text := public.evento_origem(p_origem);
begin
  insert into public.eventos_uso (tipo, usuario_id, origem, gatilho_externo, peca_id, passaporte_id, link_id, dados)
  values (p_tipo, p_usuario, v_origem, v_origem in ('link', 'qr', 'alerta', 'email'),
          p_peca_id, p_passaporte_id, p_link_id, coalesce(p_dados, '{}'::jsonb));
end;
$$;

-- Sessao iniciada pelo login (RF05: sessoes iniciadas sem gatilho externo)
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
end;
$$;

-- Consulta ao passaporte por usuario autenticado (RFS06). Conta uma consulta por usuario e passaporte
-- a cada 30 minutos, para que recarregar a pagina nao infle a North Star (passaportes vivos).
create or replace function public.registrar_consulta_passaporte(p_passaporte_id bigint, p_origem text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peca public.pecas%rowtype;
begin
  if auth.uid() is null then
    return;
  end if;

  select pc.* into v_peca
    from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
   where pp.id = p_passaporte_id;
  if not found or not public.pode_ver_peca(v_peca.id) then
    return;
  end if;

  -- serializa consultas simultaneas do mesmo usuario ao mesmo passaporte (ex.: duas requisicoes da mesma tela)
  perform pg_advisory_xact_lock(hashtext('consulta:' || auth.uid()::text || ':' || p_passaporte_id::text));

  if exists (
    select 1 from public.eventos_uso
     where tipo = 'passaporte_consulta' and usuario_id = auth.uid() and passaporte_id = p_passaporte_id
       and criado_em > now() - interval '30 minutes'
  ) then
    return;
  end if;

  perform public.registrar_evento_interno('passaporte_consulta', auth.uid(), p_origem, v_peca.id, p_passaporte_id, null,
                                          jsonb_build_object('dono', v_peca.proprietario_id = auth.uid()));
end;
$$;

-- Resumo agregado para o administrador (RNF06: relatorios exibem apenas dados agregados)
create or replace function public.resumo_eventos_uso(p_inicio date default null, p_fim date default null)
returns table (evento text, total bigint, com_gatilho_externo bigint, usuarios_distintos bigint)
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
    select e.tipo, count(*), count(*) filter (where e.gatilho_externo), count(distinct e.usuario_id)
      from public.eventos_uso e
     where (p_inicio is null or (e.criado_em at time zone 'America/Sao_Paulo')::date >= p_inicio)
       and (p_fim is null or (e.criado_em at time zone 'America/Sao_Paulo')::date <= p_fim)
     group by e.tipo
     order by e.tipo;
end;
$$;

-- Eventos de negocio registrados automaticamente a partir das entidades ja existentes
create or replace function public.eventos_passaporte_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peca public.pecas%rowtype;
begin
  select pc.* into v_peca
    from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
   where pp.id = new.passaporte_id;

  perform public.registrar_evento_interno('passaporte_' || new.tipo, new.autor_id, 'plataforma', v_peca.id, new.passaporte_id, null,
                                          jsonb_build_object('dono', new.autor_id is not null and new.autor_id = v_peca.proprietario_id));
  return new;
end;
$$;

drop trigger if exists eventos_passaporte_trg on public.passaporte_eventos;
create trigger eventos_passaporte_trg
  after insert on public.passaporte_eventos
  for each row execute function public.eventos_passaporte_trg();

create or replace function public.eventos_transacao_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_evento_interno('transacao_proposta', coalesce(new.registrada_por, new.comprador_id), 'plataforma',
                                            new.peca_id, null, null, jsonb_build_object('transacao_id', new.id));
  elsif new.status is distinct from old.status then
    perform public.registrar_evento_interno('transacao_' || new.status, auth.uid(), 'plataforma',
                                            new.peca_id, null, null, jsonb_build_object('transacao_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists eventos_transacao_trg on public.transacoes;
create trigger eventos_transacao_trg
  after insert or update of status on public.transacoes
  for each row execute function public.eventos_transacao_trg();

create or replace function public.eventos_peca_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_evento_interno('peca_cadastrada', new.vendedor_id, 'plataforma', new.id, null, null, '{}'::jsonb);
  elsif new.publicacao is distinct from old.publicacao and new.publicacao in ('publicada', 'rejeitada') then
    -- decisao da curadoria (metrica de protecao: pecas recusadas pela curadoria)
    perform public.registrar_evento_interno(case new.publicacao when 'publicada' then 'anuncio_publicado' else 'anuncio_rejeitado' end,
                                            auth.uid(), 'plataforma', new.id, null, null, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists eventos_peca_trg on public.pecas;
create trigger eventos_peca_trg
  after insert or update of publicacao on public.pecas
  for each row execute function public.eventos_peca_trg();

-- ---------------------------------------------------------------------------
-- Links de compartilhamento do passaporte (RFC16, RFS53 a RFS56)
-- ---------------------------------------------------------------------------
-- Campos que o dono pode tornar publicos. Nome, categoria, status, perito e assinatura sao sempre exibidos.
create or replace function public.campos_publicos_link()
returns text[]
language sql
immutable
as $$
  select array['descricao', 'fotografias', 'documentos', 'historico_proprietarios', 'historico_eventos',
               'identidade_proprietarios', 'valor']::text[]
$$;

create table if not exists public.passaporte_links (
  id bigint generated always as identity primary key,
  passaporte_id bigint not null references public.passaportes (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  -- RNF04: identidade do dono e valor ficam privados por padrao
  campos_publicos text[] not null
    default array['descricao', 'fotografias', 'documentos', 'historico_proprietarios', 'historico_eventos']::text[]
    check (campos_publicos <@ public.campos_publicos_link()),
  validade date,
  destinatario varchar(150),
  status text not null default 'ativo' check (status in ('ativo', 'revogado')),
  criado_por uuid not null references public.perfis (id) on delete cascade,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  revogado_em timestamptz
);
create index if not exists passaporte_links_passaporte_idx on public.passaporte_links (passaporte_id);
create index if not exists passaporte_links_criador_idx on public.passaporte_links (criado_por);

create table if not exists public.passaporte_link_acessos (
  id bigint generated always as identity primary key,
  link_id bigint not null references public.passaporte_links (id) on delete cascade,
  origem text not null check (origem in ('link', 'qr')),
  acessado_em timestamptz not null default now()
);
create index if not exists passaporte_link_acessos_idx on public.passaporte_link_acessos (link_id, acessado_em);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_uso_link_fk') then
    alter table public.eventos_uso
      add constraint eventos_uso_link_fk
      foreign key (link_id) references public.passaporte_links (id) on delete cascade;
  end if;
end;
$$;

-- Situacao calculada: o link so da acesso enquanto ativo, dentro da validade e com o criador ainda dono da peca
create or replace function public.link_situacao(p_link public.passaporte_links)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_link.status = 'revogado' then 'revogado'
    when p_link.validade is not null and p_link.validade < (now() at time zone 'America/Sao_Paulo')::date then 'expirado'
    when not exists (
      select 1 from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
       where pp.id = p_link.passaporte_id and pc.proprietario_id = p_link.criado_por
    ) then 'encerrado'
    else 'ativo'
  end
$$;

alter table public.passaporte_links enable row level security;
alter table public.passaporte_link_acessos enable row level security;

drop policy if exists passaporte_links_select on public.passaporte_links;
create policy passaporte_links_select on public.passaporte_links
  for select to authenticated using (criado_por = auth.uid());

drop policy if exists passaporte_link_acessos_select on public.passaporte_link_acessos;
create policy passaporte_link_acessos_select on public.passaporte_link_acessos
  for select to authenticated
  using (exists (select 1 from public.passaporte_links l where l.id = link_id and l.criado_por = auth.uid()));

revoke all on public.passaporte_links, public.passaporte_link_acessos from public, anon, authenticated;
grant select on public.passaporte_links, public.passaporte_link_acessos to authenticated;

-- Quem gerou ve os proprios links com os acessos (RFS54)
create or replace view public.vw_passaporte_links as
select
  l.id, l.passaporte_id, pp.peca_id, pc.nome as peca_nome, l.token, l.campos_publicos, l.validade, l.destinatario,
  l.status, public.link_situacao(l) as situacao, l.criado_em, l.atualizado_em, l.revogado_em,
  (select count(*) from public.passaporte_link_acessos a where a.link_id = l.id) as acessos,
  (select count(*) from public.passaporte_link_acessos a where a.link_id = l.id and a.origem = 'qr') as acessos_qr,
  (select max(a.acessado_em) from public.passaporte_link_acessos a where a.link_id = l.id) as ultimo_acesso
from public.passaporte_links l
join public.passaportes pp on pp.id = l.passaporte_id
join public.pecas pc on pc.id = pp.peca_id
where l.criado_por = auth.uid();

revoke all on public.vw_passaporte_links from anon;
grant select on public.vw_passaporte_links to authenticated;

create or replace function public.validar_campos_link(p_campos text[], p_validade date)
returns text[]
language plpgsql
stable
set search_path = public
as $$
begin
  if p_campos is null or not (p_campos <@ public.campos_publicos_link()) then
    raise exception 'Campo público inválido' using errcode = 'P0001';
  end if;
  if p_validade is not null and p_validade < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A validade não pode ser anterior a hoje' using errcode = 'P0001';
  end if;
  return array(select distinct c from unnest(p_campos) c order by c);
end;
$$;

-- RFS53 - o proprietario atual gera o link com os campos publicos escolhidos
create or replace function public.criar_link_passaporte(
  p_passaporte_id bigint, p_campos text[], p_validade date default null, p_destinatario text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_peca_id bigint;
  v_campos text[];
  v_id bigint;
begin
  select pp.peca_id into v_peca_id
    from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
   where pp.id = p_passaporte_id and pc.proprietario_id = auth.uid();
  if not found then
    raise exception 'Somente o proprietário da peça compartilha o passaporte' using errcode = 'P0001';
  end if;

  v_campos := public.validar_campos_link(p_campos, p_validade);

  insert into public.passaporte_links (passaporte_id, campos_publicos, validade, destinatario, criado_por)
  values (p_passaporte_id, v_campos, p_validade, nullif(left(trim(p_destinatario), 150), ''), auth.uid())
  returning id into v_id;

  perform public.registrar_evento_interno('link_gerado', auth.uid(), 'plataforma', v_peca_id, p_passaporte_id, v_id,
                                          jsonb_build_object('campos', to_jsonb(v_campos)));
  return v_id;
end;
$$;

-- RFS55 - altera os campos publicos e a validade
create or replace function public.editar_link_passaporte(p_id bigint, p_campos text[], p_validade date default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.passaporte_links%rowtype;
  v_campos text[];
  v_peca_id bigint;
begin
  select * into v_link from public.passaporte_links where id = p_id and criado_por = auth.uid();
  if not found then
    raise exception 'Link não encontrado' using errcode = 'P0002';
  end if;
  if v_link.status = 'revogado' then
    raise exception 'Link revogado não pode ser alterado' using errcode = 'P0001';
  end if;
  if public.link_situacao(v_link) = 'encerrado' then
    raise exception 'A peça mudou de proprietário e o link foi encerrado' using errcode = 'P0001';
  end if;

  v_campos := public.validar_campos_link(p_campos, p_validade);

  update public.passaporte_links
     set campos_publicos = v_campos, validade = p_validade, atualizado_em = now()
   where id = p_id;

  select peca_id into v_peca_id from public.passaportes where id = v_link.passaporte_id;
  perform public.registrar_evento_interno('link_editado', auth.uid(), 'plataforma', v_peca_id, v_link.passaporte_id, p_id,
                                          jsonb_build_object('campos', to_jsonb(v_campos)));
end;
$$;

-- RFS56 - revoga o link, que deixa de dar acesso na hora
create or replace function public.revogar_link_passaporte(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.passaporte_links%rowtype;
  v_peca_id bigint;
begin
  select * into v_link from public.passaporte_links where id = p_id and criado_por = auth.uid();
  if not found then
    raise exception 'Link não encontrado' using errcode = 'P0002';
  end if;
  if v_link.status = 'revogado' then
    raise exception 'O link já foi revogado' using errcode = 'P0001';
  end if;

  update public.passaporte_links
     set status = 'revogado', revogado_em = now(), atualizado_em = now()
   where id = p_id;

  select peca_id into v_peca_id from public.passaportes where id = v_link.passaporte_id;
  perform public.registrar_evento_interno('link_revogado', auth.uid(), 'plataforma', v_peca_id, v_link.passaporte_id, p_id, '{}'::jsonb);
end;
$$;

-- RFS54 - consulta publica pelo link ou QR, sem cadastro, somente com os campos publicos.
-- Cada acesso e registrado (principal canal de aquisicao do Plano de Growth).
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

revoke all on function public.registrar_evento_interno(text, uuid, text, bigint, bigint, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.eventos_passaporte_trg() from public, anon, authenticated;
revoke all on function public.eventos_transacao_trg() from public, anon, authenticated;
revoke all on function public.eventos_peca_trg() from public, anon, authenticated;
revoke all on function public.link_situacao(public.passaporte_links) from public, anon;
revoke all on function public.validar_campos_link(text[], date) from public, anon, authenticated;
revoke all on function public.registrar_sessao(text) from public, anon;
revoke all on function public.registrar_consulta_passaporte(bigint, text) from public, anon;
revoke all on function public.resumo_eventos_uso(date, date) from public, anon;
revoke all on function public.criar_link_passaporte(bigint, text[], date, text) from public, anon;
revoke all on function public.editar_link_passaporte(bigint, text[], date) from public, anon;
revoke all on function public.revogar_link_passaporte(bigint) from public, anon;
revoke all on function public.consultar_link_publico(text, text) from public;
grant execute on function public.link_situacao(public.passaporte_links) to authenticated;
grant execute on function public.registrar_sessao(text) to authenticated;
grant execute on function public.registrar_consulta_passaporte(bigint, text) to authenticated;
grant execute on function public.resumo_eventos_uso(date, date) to authenticated;
grant execute on function public.criar_link_passaporte(bigint, text[], date, text) to authenticated;
grant execute on function public.editar_link_passaporte(bigint, text[], date) to authenticated;
grant execute on function public.revogar_link_passaporte(bigint) to authenticated;
-- unica funcao liberada para visitantes sem cadastro
grant execute on function public.consultar_link_publico(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
