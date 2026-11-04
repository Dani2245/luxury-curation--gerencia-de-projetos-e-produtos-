-- Suporte operacional aos experimentos X1-X5; não cria resultados de campo.
-- Aplicar após schema-release3.sql.
begin;
create table if not exists public.growth_evidencias (
  id bigint generated always as identity primary key,
  experimento text not null check(experimento in ('X1','X2','X3','X4')),
  participante text not null check(length(trim(participante)) between 1 and 100),
  ocorrido_em date not null,
  resultado text not null check(resultado in ('pendente','aceitou','recusou','leitura realizada','diagnóstico realizado')),
  observacao text not null check(length(trim(observacao)) between 1 and 2000),
  referencia text check(length(referencia) <= 500),
  demonstracao boolean not null default true,
  leitura jsonb not null default '{}',
  indicacao_id bigint references public.indicacoes(id) on delete restrict,
  laudo_id bigint references public.laudos(id) on delete restrict,
  criado_por uuid not null references public.perfis(id) on delete restrict,
  criado_em timestamptz not null default now(),
  anulada_em timestamptz,
  motivo_anulacao text
);
create unique index if not exists growth_evidencia_participante on public.growth_evidencias(experimento, lower(participante), demonstracao) where anulada_em is null;
alter table public.growth_evidencias enable row level security;
drop policy if exists evidencias_admin on public.growth_evidencias;
create policy evidencias_admin on public.growth_evidencias for select to authenticated using(public.is_admin());
revoke all on public.growth_evidencias from public, anon, authenticated;
grant select on public.growth_evidencias to authenticated;

create or replace function public.registrar_evidencia_growth(p_dados jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_x text := p_dados->>'experimento'; v_resultado text := p_dados->>'resultado';
  v_data date := (p_dados->>'ocorridoEm')::date; v_ind bigint := (p_dados->>'indicacaoId')::bigint;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if v_x is null or v_resultado is null or not (
    (v_x in ('X1','X3') and v_resultado in ('pendente','aceitou','recusou')) or
    (v_x = 'X2' and v_resultado = 'leitura realizada') or
    (v_x = 'X4' and v_resultado in ('pendente','recusou','diagnóstico realizado'))) then
    raise exception 'Resultado incompatível com o experimento' using errcode = 'P0001'; end if;
  if v_data is null or v_data > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe uma data válida, sem antecipar resultados' using errcode = 'P0001'; end if;
  if coalesce(length(trim(p_dados->>'participante')),0) not between 1 and 100 or coalesce(length(trim(p_dados->>'observacao')),0) not between 1 and 2000 then
    raise exception 'Informe participante e observação da evidência' using errcode = 'P0001'; end if;
  if v_x = 'X4' and (v_ind is null or not exists(select 1 from public.indicacoes i join public.perfis p on p.id = i.indicador_id
    where i.id = v_ind and i.perfil = 'vendedor' and p.perfil = 'Perito' and (i.criado_em at time zone 'America/Sao_Paulo')::date <= v_data)) then
    raise exception 'Selecione uma indicação de vendedor feita por perito, anterior ao diagnóstico' using errcode = 'P0001'; end if;
  if v_x <> 'X4' and v_ind is not null then raise exception 'Indicação é utilizada no X4' using errcode = 'P0001'; end if;
  if p_dados->>'laudoId' is not null and (v_x <> 'X3' or not exists(select 1 from public.laudos l where l.id = (p_dados->>'laudoId')::bigint and l.assinatura = public.laudo_assinar(l.id))) then
    raise exception 'Laudo piloto inválido' using errcode = 'P0001'; end if;
  if v_x = 'X2' and (jsonb_typeof(p_dados->'leitura') is distinct from 'object' or exists(
    select 1 from unnest(array['procedencia','conservacao','assinante','semAjuda']) k where jsonb_typeof(p_dados->'leitura'->k) is distinct from 'boolean')) then
    raise exception 'Registre os quatro critérios da leitura' using errcode = 'P0001'; end if;
  insert into public.growth_evidencias(experimento, participante, ocorrido_em, resultado, observacao, referencia, demonstracao, leitura, indicacao_id, laudo_id, criado_por)
    values(v_x, trim(p_dados->>'participante'), v_data, v_resultado, trim(p_dados->>'observacao'), nullif(trim(p_dados->>'referencia'),''),
      coalesce((p_dados->>'demonstracao')::boolean,true), coalesce(p_dados->'leitura','{}'), v_ind, (p_dados->>'laudoId')::bigint, auth.uid()) returning id into v_id;
  perform public.registrar_evento_interno('growth_evidencia_registrada', auth.uid(), 'plataforma', null, null, null,
    jsonb_build_object('experimento', v_x, 'evidencia_id', v_id, 'demonstracao', coalesce((p_dados->>'demonstracao')::boolean,true)));
  return v_id;
end;
$$;
create or replace function public.anular_evidencia_growth(p_id bigint, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if coalesce(length(trim(p_motivo)),0) not between 1 and 500 then raise exception 'Informe o motivo da anulação' using errcode = 'P0001'; end if;
  update public.growth_evidencias set anulada_em = now(), motivo_anulacao = trim(p_motivo) where id = p_id and anulada_em is null;
  if not found then raise exception 'Evidência não encontrada ou já anulada' using errcode = 'P0002'; end if;
end;
$$;
create or replace function public.resumo_pilotos_growth(p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb; v_x5 jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  if p_inicio is null or p_fim is null or p_inicio > p_fim then raise exception 'Período inválido' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]') into v_res from (
    select e.experimento, count(*) as total, count(*) filter(where e.resultado in ('aceitou','diagnóstico realizado') or
      (e.experimento = 'X2' and e.leitura @> '{"procedencia":true,"conservacao":true,"assinante":true,"semAjuda":true}')) as positivos,
      round(avg(e.ocorrido_em - (i.criado_em at time zone 'America/Sao_Paulo')::date) filter(where e.experimento = 'X4' and e.resultado = 'diagnóstico realizado'),2) as dias_ate_diagnostico
    from public.growth_evidencias e left join public.indicacoes i on i.id = e.indicacao_id
    where not e.demonstracao and e.anulada_em is null and e.ocorrido_em between p_inicio and p_fim group by e.experimento
  ) s;
  select jsonb_build_object('a', count(*) filter(where versao_pagina = 'a'), 'b', count(*) filter(where versao_pagina = 'b'),
    'interesseBolsas', count(*) filter(where 'bolsa' = any(categorias)),
    'variacaoPercentual', round(100.0 * (count(*) filter(where versao_pagina = 'b') - count(*) filter(where versao_pagina = 'a')) / nullif(count(*) filter(where versao_pagina = 'a'),0),2)) into v_x5
    from public.lista_espera where perfil = 'comprador' and versao_pagina in ('a','b') and email not like 'e2e-%'
    and criado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and criado_em < (p_fim + 1)::timestamp at time zone 'America/Sao_Paulo';
  return jsonb_build_object('evidencias', v_res, 'x5', v_x5);
end;
$$;

-- O grupo escolhe um link já compartilhado pelo proprietário; não há exemplo real inventado.
create table if not exists public.growth_exemplo (
  id boolean primary key default true check(id),
  link_id bigint not null references public.passaporte_links(id) on delete restrict,
  nivel_verificacao text not null check(length(trim(nivel_verificacao)) between 1 and 500),
  estado_conservacao text not null check(length(trim(estado_conservacao)) between 1 and 500)
);
alter table public.growth_exemplo enable row level security;
revoke all on public.growth_exemplo from public, anon, authenticated;
grant select on public.growth_exemplo to authenticated;
drop policy if exists exemplo_admin on public.growth_exemplo;
create policy exemplo_admin on public.growth_exemplo for select to authenticated using(public.is_admin());
create or replace function public.configurar_exemplo_growth(p_token text, p_nivel text, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
declare v_link public.passaporte_links%rowtype;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode = '42501'; end if;
  select * into v_link from public.passaporte_links where token = p_token;
  if not found or public.link_situacao(v_link) <> 'ativo' then raise exception 'Use um link de passaporte ativo, autorizado pelo proprietário' using errcode = 'P0001'; end if;
  if not ('documentos' = any(v_link.campos_publicos) and 'historico_proprietarios' = any(v_link.campos_publicos)) then
    raise exception 'O exemplo precisa permitir documentos e histórico de procedência no link' using errcode = 'P0001'; end if;
  if coalesce(length(trim(p_nivel)),0) not between 1 and 500 or coalesce(length(trim(p_estado)),0) not between 1 and 500 then
    raise exception 'Declare o nível de verificação e o estado de conservação' using errcode = 'P0001'; end if;
  insert into public.growth_exemplo(id, link_id, nivel_verificacao, estado_conservacao) values(true, v_link.id, trim(p_nivel), trim(p_estado))
    on conflict(id) do update set link_id = excluded.link_id, nivel_verificacao = excluded.nivel_verificacao, estado_conservacao = excluded.estado_conservacao;
end;
$$;
create or replace function public.consultar_exemplo_growth()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('token', l.token, 'nivelVerificacao', e.nivel_verificacao, 'estadoConservacao', e.estado_conservacao)
    from public.growth_exemplo e join public.passaporte_links l on l.id = e.link_id where public.link_situacao(l) = 'ativo';
$$;
revoke all on function public.registrar_evidencia_growth(jsonb), public.anular_evidencia_growth(bigint,text), public.resumo_pilotos_growth(date,date),
  public.configurar_exemplo_growth(text,text,text), public.consultar_exemplo_growth() from public, anon;
grant execute on function public.registrar_evidencia_growth(jsonb), public.anular_evidencia_growth(bigint,text), public.resumo_pilotos_growth(date,date),
  public.configurar_exemplo_growth(text,text,text), public.consultar_exemplo_growth() to authenticated;
grant execute on function public.consultar_exemplo_growth() to anon;
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
    select count(distinct indicacao_id) into v from public.growth_evidencias where experimento = 'X4' and resultado = 'diagnóstico realizado' and not demonstracao and anulada_em is null and ocorrido_em between p_inicio and p_fim;
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
update public.indicador_formulas set descricao = 'Vendedores indicados por peritos que chegaram ao diagnóstico no período, excluindo demonstrações e evidências anuladas' where chave = 'indicacoes_vendedor';
update public.indicadores set nome = 'Vendedores indicados com diagnóstico' where codigo = 'A4' and formula = 'indicacoes_vendedor';
notify pgrst, 'reload schema';
commit;
