-- Habito: colecao privada (RFC23), exportacao dos dados do proprietario (RNF05), avaliacoes e reputacao (RFC24)
-- e relatorio de indicadores do habito (RF05). Executar depois de schema-growth.sql. Aditivo: pode ser executado mais de uma vez.
begin;

-- ===================================================================================================
-- RFC23: colecao privada
-- ===================================================================================================
create table if not exists public.colecao_itens (
  id bigint generated always as identity primary key,
  proprietario_id uuid not null references public.perfis (id) on delete cascade,
  nome varchar(256) not null check (length(trim(nome)) > 0),
  categoria text not null check (categoria in ('obra de arte', 'joia', 'relógio', 'bolsa')),
  fotografias text[] not null default '{}',
  documentos text[] not null default '{}' check (documentos <@ array['nota fiscal', 'laudo', 'certificado']::text[]),
  estado_conservacao text not null check (estado_conservacao in ('excelente', 'muito bom', 'bom', 'regular', 'precisa de restauro')),
  ultima_manutencao date,
  valor_referencia numeric(14, 2) check (valor_referencia is null or valor_referencia > 0),
  visibilidade text not null default 'privado' check (visibilidade in ('privado', 'público')),
  status text not null default 'registrado' check (status in ('rascunho', 'registrado', 'passaporte solicitado')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists colecao_itens_proprietario_idx on public.colecao_itens (proprietario_id);
create table if not exists public.colecao_historico (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.colecao_itens (id) on delete cascade,
  descricao text not null,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
alter table public.colecao_itens enable row level security;
alter table public.colecao_historico enable row level security;
drop policy if exists colecao_itens_select on public.colecao_itens;
create policy colecao_itens_select on public.colecao_itens for select to authenticated using (proprietario_id = auth.uid());
drop policy if exists colecao_historico_select on public.colecao_historico;
create policy colecao_historico_select on public.colecao_historico for select to authenticated
  using (exists (select 1 from public.colecao_itens i where i.id = item_id and i.proprietario_id = auth.uid()));
revoke all on public.colecao_itens, public.colecao_historico from public, anon, authenticated;
grant select on public.colecao_itens, public.colecao_historico to authenticated;

-- o que falta para o passaporte da peca: fotografias, nota fiscal, laudo e certificado
create or replace function public.colecao_pendencias(p_fotos text[], p_docs text[])
returns text[] language sql immutable as $$
  select array_remove(array[
    case when coalesce(cardinality(p_fotos), 0) = 0 then 'fotografias' end,
    case when not ('nota fiscal' = any (coalesce(p_docs, '{}'))) then 'nota fiscal' end,
    case when not ('laudo' = any (coalesce(p_docs, '{}'))) then 'laudo' end,
    case when not ('certificado' = any (coalesce(p_docs, '{}'))) then 'certificado' end
  ], null);
$$;
grant execute on function public.colecao_pendencias(text[], text[]) to authenticated;

-- RFS82: so o proprietario ve a colecao, com o estado, a ultima atualizacao e o que falta para o passaporte
create or replace view public.vw_colecao as
select i.*, public.colecao_pendencias(i.fotografias, i.documentos) as pendencias
  from public.colecao_itens i
 where i.proprietario_id = auth.uid();
grant select on public.vw_colecao to authenticated;

create or replace function public.validar_item_colecao(p_nome text, p_categoria text, p_estado text, p_documentos text[], p_visibilidade text, p_valor numeric)
returns void language plpgsql immutable as $$
begin
  if coalesce(length(trim(p_nome)), 0) not between 1 and 256 then raise exception 'Informe o nome da peça' using errcode = 'P0001'; end if;
  if p_categoria is null or p_categoria not in ('obra de arte', 'joia', 'relógio', 'bolsa') then raise exception 'Categoria inválida' using errcode = 'P0001'; end if;
  if p_estado is null or p_estado not in ('excelente', 'muito bom', 'bom', 'regular', 'precisa de restauro') then
    raise exception 'Informe o estado de conservação' using errcode = 'P0001';
  end if;
  if not coalesce(p_documentos, '{}') <@ array['nota fiscal', 'laudo', 'certificado']::text[] then raise exception 'Documento inválido' using errcode = 'P0001'; end if;
  if coalesce(p_visibilidade, 'privado') not in ('privado', 'público') then raise exception 'Visibilidade inválida' using errcode = 'P0001'; end if;
  if p_valor is not null and p_valor <= 0 then raise exception 'O valor de referência deve ser maior que zero' using errcode = 'P0001'; end if;
end;
$$;

-- RFS81: registra uma peca propria (privada por padrao)
create or replace function public.criar_item_colecao(
  p_nome text, p_categoria text, p_estado text, p_fotografias text[] default '{}', p_documentos text[] default '{}',
  p_ultima_manutencao date default null, p_valor numeric default null, p_visibilidade text default 'privado', p_rascunho boolean default false
)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if public.perfil_atual() is distinct from 'Comprador' then raise exception 'Somente o comprador mantém uma coleção privada' using errcode = '42501'; end if;
  perform public.validar_item_colecao(p_nome, p_categoria, p_estado, p_documentos, p_visibilidade, p_valor);
  if p_ultima_manutencao > current_date then raise exception 'A data da última manutenção não pode estar no futuro' using errcode = 'P0001'; end if;
  insert into public.colecao_itens (proprietario_id, nome, categoria, estado_conservacao, fotografias, documentos, ultima_manutencao, valor_referencia, visibilidade, status)
  values (auth.uid(), trim(p_nome), p_categoria, p_estado, coalesce(p_fotografias, '{}'), coalesce(p_documentos, '{}'), p_ultima_manutencao, p_valor,
          coalesce(p_visibilidade, 'privado'), case when p_rascunho then 'rascunho' else 'registrado' end)
  returning id into v_id;
  insert into public.colecao_historico (item_id, descricao) values (v_id, case when p_rascunho then 'Importada da planilha como rascunho' else 'Peça registrada na coleção' end);
  perform public.registrar_evento_interno('colecao_item_criado', auth.uid(), 'plataforma', null, null, null,
    jsonb_build_object('item_id', v_id, 'importado', p_rascunho));
  return v_id;
end;
$$;

-- RFS83: atualiza fotos, documentos e estado; cada atualizacao vai para o historico
create or replace function public.editar_item_colecao(
  p_id bigint, p_nome text, p_categoria text, p_estado text, p_fotografias text[], p_documentos text[],
  p_ultima_manutencao date, p_valor numeric, p_visibilidade text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_i public.colecao_itens%rowtype; v_mudou text[] := '{}';
begin
  select * into v_i from public.colecao_itens where id = p_id for update;
  if not found or v_i.proprietario_id <> auth.uid() then raise exception 'Peça não encontrada na sua coleção' using errcode = 'P0002'; end if;
  perform public.validar_item_colecao(p_nome, p_categoria, p_estado, p_documentos, p_visibilidade, p_valor);
  if p_ultima_manutencao > current_date then raise exception 'A data da última manutenção não pode estar no futuro' using errcode = 'P0001'; end if;
  if v_i.estado_conservacao is distinct from p_estado then v_mudou := v_mudou || ('estado: ' || v_i.estado_conservacao || ' → ' || p_estado); end if;
  if v_i.fotografias is distinct from coalesce(p_fotografias, '{}') then v_mudou := v_mudou || 'fotografias'::text; end if;
  if v_i.documentos is distinct from coalesce(p_documentos, '{}') then v_mudou := v_mudou || 'documentos'::text; end if;
  if v_i.ultima_manutencao is distinct from p_ultima_manutencao then v_mudou := v_mudou || 'manutenção'::text; end if;
  if v_i.nome is distinct from trim(p_nome) or v_i.categoria is distinct from p_categoria
     or v_i.valor_referencia is distinct from p_valor or v_i.visibilidade is distinct from p_visibilidade then
    v_mudou := v_mudou || 'dados da peça'::text;
  end if;
  update public.colecao_itens set nome = trim(p_nome), categoria = p_categoria, estado_conservacao = p_estado,
    fotografias = coalesce(p_fotografias, '{}'), documentos = coalesce(p_documentos, '{}'), ultima_manutencao = p_ultima_manutencao,
    valor_referencia = p_valor, visibilidade = coalesce(p_visibilidade, 'privado'),
    status = case when status = 'rascunho' then 'registrado' else status end, atualizado_em = now()
  where id = p_id;
  insert into public.colecao_historico (item_id, descricao, dados)
  values (p_id, 'Atualização: ' || coalesce(nullif(array_to_string(v_mudou, ', '), ''), 'sem alterações'), jsonb_build_object('estado', p_estado));
  perform public.registrar_evento_interno('colecao_item_atualizado', auth.uid(), 'plataforma', null, null, null, jsonb_build_object('item_id', p_id));
end;
$$;

-- Cada peca pode virar passaporte quando o dono quiser: o pedido fica registrado para a curadoria
create or replace function public.solicitar_passaporte_item(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_i public.colecao_itens%rowtype;
begin
  select * into v_i from public.colecao_itens where id = p_id for update;
  if not found or v_i.proprietario_id <> auth.uid() then raise exception 'Peça não encontrada na sua coleção' using errcode = 'P0002'; end if;
  if v_i.status = 'passaporte solicitado' then raise exception 'O passaporte desta peça já foi solicitado' using errcode = 'P0001'; end if;
  update public.colecao_itens set status = 'passaporte solicitado', atualizado_em = now() where id = p_id;
  insert into public.colecao_historico (item_id, descricao) values (p_id, 'Passaporte solicitado à curadoria');
end;
$$;

-- RFS84: exclui uma peca sem passaporte solicitado (nem anuncio)
create or replace function public.remover_item_colecao(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_i public.colecao_itens%rowtype;
begin
  select * into v_i from public.colecao_itens where id = p_id for update;
  if not found or v_i.proprietario_id <> auth.uid() then raise exception 'Peça não encontrada na sua coleção' using errcode = 'P0002'; end if;
  if v_i.status = 'passaporte solicitado' then
    raise exception 'A peça com passaporte solicitado não pode ser excluída' using errcode = 'P0001';
  end if;
  delete from public.colecao_itens where id = p_id;
end;
$$;

-- RNF05: o proprietario exporta a propria colecao e os passaportes das pecas que possui
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
        'documentos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', d.tipo, 'titulo', d.titulo, 'hash', d.hash_sha256) order by d.id), '[]'::jsonb)
                         from public.passaporte_documentos d where d.passaporte_id = pp.id),
        'eventos', (select coalesce(jsonb_agg(jsonb_build_object('data', e.criado_em, 'tipo', e.tipo, 'descricao', e.descricao) order by e.id), '[]'::jsonb)
                      from public.passaporte_eventos e where e.passaporte_id = pp.id)) order by pp.id)
      from public.passaportes pp join public.pecas pc on pc.id = pp.peca_id
     where pc.proprietario_id = auth.uid()), '[]'::jsonb)
  );
end;
$$;

-- ===================================================================================================
-- RFC24: avaliacoes e reputacao
-- ===================================================================================================
create table if not exists public.avaliacoes (
  id bigint generated always as identity primary key,
  transacao_id bigint not null references public.transacoes (id) on delete cascade,
  avaliador_id uuid not null references public.perfis (id) on delete cascade,
  avaliado_id uuid not null references public.perfis (id) on delete cascade,
  nota smallint not null check (nota between 1 and 5),
  comentario varchar(1000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  removida_em timestamptz,
  motivo_remocao text,
  unique (transacao_id, avaliador_id)
);
alter table public.avaliacoes enable row level security;
drop policy if exists avaliacoes_select on public.avaliacoes;
create policy avaliacoes_select on public.avaliacoes for select to authenticated using (true);
revoke all on public.avaliacoes from public, anon, authenticated;
grant select on public.avaliacoes to authenticated;

-- RFS86: avaliacoes visiveis (as removidas ficam so para o administrador e o autor)
create or replace view public.vw_avaliacoes as
select a.id, a.transacao_id, p.nome as peca_nome, a.avaliador_id, av.nome as avaliador_nome, a.avaliado_id, ad.nome as avaliado_nome,
       a.nota, a.comentario, a.criado_em, a.atualizado_em, a.removida_em, a.motivo_remocao,
       a.criado_em > now() - interval '7 days' as editavel
  from public.avaliacoes a
  join public.transacoes t on t.id = a.transacao_id join public.pecas p on p.id = t.peca_id
  join public.perfis av on av.id = a.avaliador_id join public.perfis ad on ad.id = a.avaliado_id
 where a.removida_em is null or public.is_admin() or a.avaliador_id = auth.uid();
grant select on public.vw_avaliacoes to authenticated;

-- RFS85: nota de 1 a 5 e comentario, liberados so apos a transacao concluida, uma vez por parte
create or replace function public.criar_avaliacao(p_transacao bigint, p_nota integer, p_comentario text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_t public.transacoes%rowtype; v_avaliado uuid; v_id bigint;
begin
  select * into v_t from public.transacoes where id = p_transacao;
  if not found or auth.uid() not in (v_t.comprador_id, v_t.vendedor_id) then raise exception 'Transação não encontrada' using errcode = 'P0002'; end if;
  if v_t.status <> 'confirmada' then raise exception 'A avaliação só é liberada depois da transação concluída' using errcode = 'P0001'; end if;
  if p_nota is null or p_nota not between 1 and 5 then raise exception 'A nota deve ser de 1 a 5' using errcode = 'P0001'; end if;
  if length(coalesce(p_comentario, '')) > 1000 then raise exception 'Comentário: máximo de 1000 caracteres' using errcode = 'P0001'; end if;
  if exists (select 1 from public.avaliacoes where transacao_id = p_transacao and avaliador_id = auth.uid()) then
    raise exception 'Você já avaliou esta transação' using errcode = '23505';
  end if;
  v_avaliado := case when auth.uid() = v_t.comprador_id then v_t.vendedor_id else v_t.comprador_id end;
  insert into public.avaliacoes (transacao_id, avaliador_id, avaliado_id, nota, comentario)
  values (p_transacao, auth.uid(), v_avaliado, p_nota, nullif(trim(p_comentario), ''))
  returning id into v_id;
  perform public.registrar_evento_interno('avaliacao_criada', auth.uid(), 'plataforma', v_t.peca_id, null, null, jsonb_build_object('avaliacao_id', v_id));
  return v_id;
end;
$$;

-- RFS87: o autor altera o comentario em ate 7 dias
create or replace function public.editar_avaliacao(p_id bigint, p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare v_a public.avaliacoes%rowtype;
begin
  select * into v_a from public.avaliacoes where id = p_id for update;
  if not found or v_a.avaliador_id <> auth.uid() then raise exception 'Avaliação não encontrada' using errcode = 'P0002'; end if;
  if v_a.removida_em is not null then raise exception 'A avaliação foi removida pelo administrador' using errcode = 'P0001'; end if;
  if v_a.criado_em < now() - interval '7 days' then raise exception 'O comentário só pode ser alterado em até 7 dias' using errcode = 'P0001'; end if;
  if length(coalesce(p_comentario, '')) > 1000 then raise exception 'Comentário: máximo de 1000 caracteres' using errcode = 'P0001'; end if;
  update public.avaliacoes set comentario = nullif(trim(p_comentario), ''), atualizado_em = now() where id = p_id;
end;
$$;

-- RFS88: o administrador remove avaliacao ofensiva ou contraria as regras, com o motivo registrado
create or replace function public.remover_avaliacao(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Somente o administrador remove avaliações' using errcode = '42501'; end if;
  if coalesce(length(trim(p_motivo)), 0) not between 1 and 500 then raise exception 'Informe o motivo da remoção' using errcode = 'P0001'; end if;
  update public.avaliacoes set removida_em = now(), motivo_remocao = trim(p_motivo) where id = p_id and removida_em is null;
  if not found then raise exception 'Avaliação não encontrada' using errcode = 'P0002'; end if;
end;
$$;

-- reputacao: nota media e quantidade de avaliacoes recebidas (sem as removidas)
create or replace function public.reputacao(p_usuario uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('media', round(avg(nota), 1), 'total', count(*))
    from public.avaliacoes where avaliado_id = p_usuario and removida_em is null;
$$;

-- transacoes concluidas do usuario que ele ainda nao avaliou
create or replace function public.avaliacoes_pendentes()
returns table (transacao_id bigint, peca_nome text, contraparte_nome text, confirmada_em timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, p.nome::text, case when t.comprador_id = auth.uid() then v.nome else c.nome end::text, t.confirmada_em
    from public.transacoes t join public.pecas p on p.id = t.peca_id
    join public.perfis c on c.id = t.comprador_id join public.perfis v on v.id = t.vendedor_id
   where t.status = 'confirmada' and auth.uid() in (t.comprador_id, t.vendedor_id)
     and not exists (select 1 from public.avaliacoes a where a.transacao_id = t.id and a.avaliador_id = auth.uid())
   order by t.confirmada_em desc;
$$;

-- ===================================================================================================
-- RF05: relatorio de indicadores do habito, por coorte (mes de entrada)
-- ===================================================================================================
create or replace function public.relatorio_habito(p_inicio date, p_fim date, p_perfil text, p_coorte text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  t0 timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  t1 timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  semanas integer := greatest(1, ceil((p_fim - p_inicio + 1) / 7.0)::integer);
  meses integer := greatest(1, (extract(year from age(p_fim, p_inicio)) * 12 + extract(month from age(p_fim, p_inicio)))::integer + 1);
  v_r jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim then raise exception 'Informe um período válido' using errcode = 'P0001'; end if;
  if p_perfil is null or p_perfil not in ('comprador', 'proprietário', 'vendedor') then raise exception 'Escolha o perfil: comprador, proprietário ou vendedor' using errcode = 'P0001'; end if;
  if p_coorte is not null and p_coorte !~ '^\d{4}-\d{2}$' then raise exception 'Coorte inválida: use AAAA-MM' using errcode = 'P0001'; end if;

  with base as (
    select p.id, p.criado_em, to_char(p.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as coorte
      from public.perfis p
     where p.criado_em < t1
       and case p_perfil
             when 'comprador' then p.perfil = 'Comprador'
             when 'vendedor' then p.perfil = 'Vendedor'
             else exists (select 1 from public.colecao_itens i where i.proprietario_id = p.id)
                  or exists (select 1 from public.pecas pc where pc.proprietario_id = p.id and pc.vendida)
           end
  ),
  ev as (
    select e.* from public.eventos_uso e join base b on b.id = e.usuario_id
  ),
  por_usuario as (
    select b.id, b.coorte, b.criado_em,
      (select count(distinct date_trunc('week', e.criado_em at time zone 'America/Sao_Paulo')) from ev e
        where e.usuario_id = b.id and e.tipo = 'sessao_inicio' and e.criado_em >= t0 and e.criado_em < t1) as semanas_ativas,
      (select count(distinct date_trunc('month', e.criado_em at time zone 'America/Sao_Paulo')) from ev e
        where e.usuario_id = b.id and e.tipo in ('passaporte_atualizacao', 'colecao_item_atualizado') and e.criado_em >= t0 and e.criado_em < t1) as meses_atualizando,
      (select min(e.criado_em) from ev e where e.usuario_id = b.id
        and e.tipo in ('lista_desejos_criada', 'peca_salva', 'colecao_item_criado', 'avaliacao_criada', 'peca_cadastrada', 'alerta_criado')) as primeiro_investimento
      from base b
     where p_coorte is null or b.coorte = p_coorte
  ),
  linhas as (
    select u.coorte,
      count(*) as usuarios,
      round(100.0 * count(*) filter (where case when p_perfil = 'proprietário' then u.meses_atualizando >= meses else u.semanas_ativas >= semanas end)
            / nullif(count(*), 0), 1) as habituais,
      round(avg(extract(epoch from (u.primeiro_investimento - u.criado_em)) / 86400.0)::numeric, 1) as dias_primeiro_investimento,
      (select round(100.0 * count(*) filter (where not e.gatilho_externo) / nullif(count(*), 0), 1)
         from ev e join por_usuario x on x.id = e.usuario_id
        where x.coorte = u.coorte and e.tipo = 'sessao_inicio' and e.criado_em >= t0 and e.criado_em < t1) as sessoes_sem_gatilho,
      (select count(*) from ev e join por_usuario x on x.id = e.usuario_id
        where x.coorte = u.coorte and e.tipo in ('passaporte_atualizacao', 'colecao_item_atualizado')
          and e.criado_em >= t1 - interval '90 days' and e.criado_em < t1) as atualizados_90d,
      (select count(*) from ev e join por_usuario x on x.id = e.usuario_id
        where x.coorte = u.coorte and e.tipo in ('passaporte_consulta', 'sessao_inicio') and e.origem in ('link', 'qr')
          and e.criado_em >= t0 and e.criado_em < t1) as consultas_link,
      (select case when count(*) = 0 then null
                   else least(round(100.0 * count(distinct e.dados ->> 'alerta_id') filter (where e.tipo = 'alerta_desativado' or (e.tipo = 'alerta_removido' and e.dados ->> 'ativo' = 'true'))
                        / nullif(count(*) filter (where e.tipo = 'alerta_criado'), 0), 1), 100) end
         from ev e join por_usuario x on x.id = e.usuario_id
        where x.coorte = u.coorte and e.tipo in ('alerta_criado', 'alerta_desativado', 'alerta_removido')
          and e.criado_em >= t0 and e.criado_em < t1) as desativacao_alertas
      from por_usuario u
     group by u.coorte
  )
  select jsonb_build_object(
    'perfil', p_perfil,
    'coortes', coalesce(jsonb_agg(jsonb_build_object(
      'coorte', coorte, 'usuarios', usuarios, 'habituais', habituais, 'diasPrimeiroInvestimento', dias_primeiro_investimento,
      'sessoesSemGatilho', sessoes_sem_gatilho, 'atualizados90d', atualizados_90d, 'consultasLink', consultas_link,
      'desativacaoAlertas', desativacao_alertas) order by coorte), '[]'::jsonb),
    'consultasLinkAnonimas', (select count(*) from public.eventos_uso where tipo = 'passaporte_consulta_link' and criado_em >= t0 and criado_em < t1)
  ) into v_r from linhas;
  return v_r;
end;
$$;

revoke all on function public.criar_item_colecao(text, text, text, text[], text[], date, numeric, text, boolean),
  public.editar_item_colecao(bigint, text, text, text, text[], text[], date, numeric, text), public.solicitar_passaporte_item(bigint),
  public.remover_item_colecao(bigint), public.exportar_dados_proprietario(), public.criar_avaliacao(bigint, integer, text),
  public.editar_avaliacao(bigint, text), public.remover_avaliacao(bigint, text), public.reputacao(uuid), public.avaliacoes_pendentes(),
  public.relatorio_habito(date, date, text, text) from public, anon;
grant execute on function public.criar_item_colecao(text, text, text, text[], text[], date, numeric, text, boolean),
  public.editar_item_colecao(bigint, text, text, text, text[], text[], date, numeric, text), public.solicitar_passaporte_item(bigint),
  public.remover_item_colecao(bigint), public.exportar_dados_proprietario(), public.criar_avaliacao(bigint, integer, text),
  public.editar_avaliacao(bigint, text), public.remover_avaliacao(bigint, text), public.reputacao(uuid), public.avaliacoes_pendentes(),
  public.relatorio_habito(date, date, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
