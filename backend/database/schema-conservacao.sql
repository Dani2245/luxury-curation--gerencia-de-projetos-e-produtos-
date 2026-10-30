-- RFC21: lembrete de atualizar o estado de conservacao das pecas da colecao privada (RFC23).
-- Corrige tambem a taxa de desativacao do resumo de alertas quando nenhum alerta foi criado no periodo.
-- Executar depois de schema-habito.sql. Aditivo: pode ser executado mais de uma vez.
begin;

alter table public.alertas drop constraint if exists alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check check (tipo in ('peca compativel', 'passaporte incompleto', 'conservacao'));

-- pecas da colecao do usuario cujo estado de conservacao nao e atualizado ha mais de 90 dias
create or replace function public.conservacao_pendente()
returns table (item_id bigint, nome text, estado text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.nome::text, i.estado_conservacao, i.atualizado_em
    from public.colecao_itens i
   where i.proprietario_id = auth.uid() and i.atualizado_em < now() - interval '90 days'
   order by i.atualizado_em, i.id;
$$;
revoke all on function public.conservacao_pendente() from public, anon;
grant execute on function public.conservacao_pendente() to authenticated;

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
  elsif p_tipo = 'conservacao' then
    if public.perfil_atual() is distinct from 'Comprador' then
      raise exception 'O lembrete de conservação é exclusivo do comprador, para a coleção privada' using errcode = 'P0001';
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
    raise exception '%', case p_tipo when 'peca compativel' then 'Já existe um alerta para esta lista de desejos'
                                     when 'conservacao' then 'Você já tem um lembrete de conservação'
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
    elsif v_alerta.tipo = 'conservacao' then
      select jsonb_agg(jsonb_build_object('id', c.item_id, 'nome', c.nome, 'estado', c.estado, 'atualizadoEm', c.atualizado_em)
                       order by c.atualizado_em)
        into v_itens
        from public.conservacao_pendente() c;

      if v_itens is not null then
        v_qtd := jsonb_array_length(v_itens);
        v_titulo := case when v_qtd = 1 then '1 peça da coleção para atualizar o estado de conservação'
                         else v_qtd || ' peças da coleção para atualizar o estado de conservação' end;
        v_mensagem := (select string_agg((i ->> 'nome') || ' (estado: ' || (i ->> 'estado') || ')', ' · ') from jsonb_array_elements(v_itens) i);
        v_link := '/dashboard/colecao';
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
                                              jsonb_build_object('tipo', v_alerta.tipo, 'alerta_id', v_alerta.id));
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

-- Resumo dos alertas com o novo tipo. least() ignora nulo: sem alertas criados no periodo, a taxa fica sem valor (e nao 100%)
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
        from (values ('peca compativel'), ('passaporte incompleto'), ('conservacao')) as t (tipo_a)
        left join ev on ev.tipo_a = t.tipo_a
       group by t.tipo_a
    )
    -- limitada a 100%: alertas criados antes do periodo podem ser desligados dentro dele
    select b.tipo_a, b.c, (select count(*) from public.alertas a where a.tipo = b.tipo_a and a.ativo),
           b.d, b.r, b.env, b.ab,
           case when b.c = 0 then null else least(round(100.0 * b.optout / b.c, 1), 100.0) end
      from base b
     order by b.tipo_a;
end;
$$;

notify pgrst, 'reload schema';
commit;
