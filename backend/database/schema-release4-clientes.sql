-- RFC14, RFC15 e RF03: regras iniciais documentadas em docs/RELEASE4.md.
-- Indicadores derivados; nao expoe o log individual de eventos ao administrador (RNF06).
begin;
create table if not exists public.health_config (
  id boolean primary key default true check(id),
  peso_atividade integer not null default 40 check(peso_atividade between 0 and 100),
  peso_passaporte integer not null default 30 check(peso_passaporte between 0 and 100),
  peso_fluxo integer not null default 30 check(peso_fluxo between 0 and 100),
  dias_meta integer not null default 3 check(dias_meta between 1 and 30),
  limite_atencao integer not null default 40 check(limite_atencao between 1 and 98),
  limite_saudavel integer not null default 70 check(limite_saudavel between 2 and 100),
  atualizado_em timestamptz not null default now(),
  check(peso_atividade+peso_passaporte+peso_fluxo=100), check(limite_atencao<limite_saudavel)
);
insert into public.health_config(id) values(true) on conflict do nothing;
create table if not exists public.health_config_historico (
  id bigint generated always as identity primary key, anterior jsonb not null, atual jsonb not null,
  motivo text not null, autor_id uuid not null references public.perfis(id), criado_em timestamptz not null default now()
);
alter table public.health_config enable row level security;
alter table public.health_config_historico enable row level security;
drop policy if exists health_config_leitura on public.health_config;
create policy health_config_leitura on public.health_config for select to authenticated using(true);
drop policy if exists health_config_historico_admin on public.health_config_historico;
create policy health_config_historico_admin on public.health_config_historico for select to authenticated using(public.is_admin());
revoke all on public.health_config,public.health_config_historico from public,anon,authenticated;
grant select on public.health_config,public.health_config_historico to authenticated;

create or replace function public.configurar_health(p_atividade integer,p_passaporte integer,p_fluxo integer,p_dias integer,p_atencao integer,p_saudavel integer,p_motivo text)
returns void language plpgsql security definer set search_path=public as $$
declare v_antes jsonb; v_depois jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_atividade is null or p_passaporte is null or p_fluxo is null or p_dias is null or p_atencao is null or p_saudavel is null
    or p_atividade not between 0 and 100 or p_passaporte not between 0 and 100 or p_fluxo not between 0 and 100
    or p_atividade+p_passaporte+p_fluxo<>100 or p_dias not between 1 and 30 or p_atencao not between 1 and 98
    or p_saudavel not between 2 and 100 or p_atencao>=p_saudavel or coalesce(length(trim(p_motivo)),0) not between 1 and 500 then
    raise exception 'Pesos devem somar 100, faixas devem ser crescentes e justificativa e obrigatoria' using errcode='P0001'; end if;
  select to_jsonb(c) into v_antes from public.health_config c where id for update;
  update public.health_config set peso_atividade=p_atividade,peso_passaporte=p_passaporte,peso_fluxo=p_fluxo,dias_meta=p_dias,
    limite_atencao=p_atencao,limite_saudavel=p_saudavel,atualizado_em=now() where id returning to_jsonb(health_config.*) into v_depois;
  insert into public.health_config_historico(anterior,atual,motivo,autor_id) values(v_antes,v_depois,trim(p_motivo),auth.uid());
end; $$;

create or replace function public.onboarding_vendedor() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_pecas jsonb;
begin
  if public.perfil_atual() is distinct from 'Vendedor' then raise exception 'Acesso exclusivo do vendedor' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'privada',p.privada,'publicacao',p.publicacao,'vendida',p.vendida,
    'fotografias',cardinality(p.fotografias)>0,
    'laudo',exists(select 1 from public.laudos l where l.peca_id=p.id) or exists(select 1 from public.passaporte_documentos d where d.passaporte_id=pp.id and d.tipo='laudo'),
    'notaFiscal',exists(select 1 from public.passaporte_documentos d where d.passaporte_id=pp.id and d.tipo='nota fiscal'),
    'passaporte',pp.id is not null,'pendencias',public.passaporte_pendencias(p.id)) order by p.criado_em,p.id),'[]'::jsonb)
  into v_pecas from public.pecas p left join public.passaportes pp on pp.peca_id=p.id where p.vendedor_id=auth.uid();
  return jsonb_build_object('pecas',v_pecas);
end; $$;

-- Funcao interna sem permissao de chamada direta. Agrega sinais por conta, para calculo.
create or replace function public.health_sinais(p_inicio date,p_fim date)
returns table(usuario_id uuid,perfil text,coorte text,dias_ativos integer,uso_passaporte boolean,fluxo_concluido boolean,pontuacao numeric,faixa text)
language sql stable security definer set search_path=public as $$
with sinais as (
 select p.id,p.perfil,to_char(p.criado_em at time zone 'America/Sao_Paulo','YYYY-MM') coorte,
 count(distinct (e.criado_em at time zone 'America/Sao_Paulo')::date) filter(where e.tipo='sessao_inicio')::integer dias,
 coalesce(bool_or(e.tipo in ('passaporte_consulta','passaporte_emissao','passaporte_atualizacao','laudo_consulta','laudo_assinado')),false) passaporte,
 coalesce(bool_or(case p.perfil
   when 'Vendedor' then e.tipo in ('peca_cadastrada','link_gerado','transacao_aceita')
   when 'Comprador' then e.tipo in ('colecao_item_criado','colecao_item_atualizado','transacao_confirmada','peca_salva')
   when 'Perito' then e.tipo in ('laudo_assinado','passaporte_emissao') else false end),false) fluxo
 from public.perfis p left join public.eventos_uso e on e.usuario_id=p.id
   and e.criado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo'
   and e.criado_em<(p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
 where p.perfil in ('Vendedor','Comprador','Perito') and p.criado_em<(p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
 group by p.id
), scores as (
 select s.*,round(c.peso_atividade*least(s.dias::numeric/c.dias_meta,1)+case when s.passaporte then c.peso_passaporte else 0 end+case when s.fluxo then c.peso_fluxo else 0 end,1) score,
 c.limite_atencao,c.limite_saudavel from sinais s cross join public.health_config c
)
select id,perfil,coorte,dias,passaporte,fluxo,score,
case when score>=limite_saudavel then 'saudavel' when score>=limite_atencao then 'atencao' else 'risco' end from scores
$$;
revoke all on function public.health_sinais(date,date) from public,anon,authenticated;

create or replace function public.meu_health() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb; v_fim date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
  select jsonb_build_object('pontuacao',s.pontuacao,'faixa',s.faixa,'diasAtivos',s.dias_ativos,'usoPassaporte',s.uso_passaporte,'fluxoConcluido',s.fluxo_concluido,
    'inicio',v_fim-29,'fim',v_fim,'config',(select to_jsonb(c) from public.health_config c)) into v_result
  from public.health_sinais(v_fim-29,v_fim) s where s.usuario_id=auth.uid();
  return v_result;
end; $$;

create or replace function public.relatorio_saude_base(p_inicio date,p_fim date,p_perfil text default null,p_coorte text default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_result jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado' using errcode='42501'; end if;
  if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim>(now() at time zone 'America/Sao_Paulo')::date or p_fim-p_inicio>365
    or (p_perfil is not null and p_perfil not in ('Vendedor','Comprador','Perito')) or (p_coorte is not null and p_coorte !~ '^\d{4}-(0[1-9]|1[0-2])$') then
    raise exception 'Informe periodo de ate 366 dias, perfil e coorte validos' using errcode='P0001'; end if;
  with base as (select * from public.health_sinais(p_inicio,p_fim) where (p_perfil is null or perfil=p_perfil) and (p_coorte is null or coorte=p_coorte)),
  grupos as (select perfil,faixa,count(*) quantidade,round(avg(pontuacao),1) media from base group by perfil,faixa)
  select jsonb_build_object('inicio',p_inicio,'fim',p_fim,'total',(select count(*) from base),'ativos',(select count(*) from base where dias_ativos>0),
    'media',(select round(avg(pontuacao),1) from base),'grupos',coalesce((select jsonb_agg(to_jsonb(g) order by perfil,faixa) from grupos g),'[]'::jsonb),
    'config',(select to_jsonb(c) from public.health_config c)) into v_result;
  return v_result;
end; $$;
revoke all on function public.configurar_health(integer,integer,integer,integer,integer,integer,text),public.onboarding_vendedor(),public.meu_health(),public.relatorio_saude_base(date,date,text,text) from public,anon;
grant execute on function public.configurar_health(integer,integer,integer,integer,integer,integer,text),public.onboarding_vendedor(),public.meu_health(),public.relatorio_saude_base(date,date,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
