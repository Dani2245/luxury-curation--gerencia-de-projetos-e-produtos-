-- RFC21: copia opcional por email, com fila persistente e opt-out.
-- O processamento segue o acesso do usuario; nao exige service_role nem senha de conta.
begin;
create or replace function public.validar_alerta(p_frequencia text,p_canal text) returns void language plpgsql immutable as $$
begin
 if p_frequencia is null or p_frequencia not in ('diaria','semanal','mensal') then raise exception 'Frequencia invalida' using errcode='P0001'; end if;
 if p_canal is null or p_canal not in ('plataforma','email') then raise exception 'Canal invalido' using errcode='P0001'; end if;
end; $$;
create table if not exists public.alerta_email_fila (
 envio_id bigint primary key references public.alerta_envios(id) on delete cascade,
 usuario_id uuid not null references public.perfis(id) on delete cascade,
 status text not null default 'pendente' check(status in ('pendente','enviando','enviado','falhou','cancelado')),
 tentativas integer not null default 0, reserva uuid, reservado_em timestamptz,
 enviado_em timestamptz, erro text, criado_em timestamptz not null default now()
);
alter table public.alerta_email_fila enable row level security;
drop policy if exists email_proprio on public.alerta_email_fila;
create policy email_proprio on public.alerta_email_fila for select to authenticated using(usuario_id=auth.uid());
revoke all on public.alerta_email_fila from public,anon,authenticated;
grant select on public.alerta_email_fila to authenticated;
create or replace function public.enfileirar_email_alerta() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from public.alertas where id=new.alerta_id and ativo and canal='email') then
   insert into public.alerta_email_fila(envio_id,usuario_id) values(new.id,new.usuario_id) on conflict do nothing;
 end if;return new;
end; $$;
create or replace function public.cancelar_email_alerta() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not new.ativo or new.canal<>'email' then
   update public.alerta_email_fila f set status='cancelado',reserva=null where f.status in ('pendente','falhou','enviando')
   and exists(select 1 from public.alerta_envios e where e.id=f.envio_id and e.alerta_id=new.id);
 end if;return new;
end; $$;
revoke all on function public.enfileirar_email_alerta(),public.cancelar_email_alerta() from public,anon,authenticated;
drop trigger if exists alerta_email_enfileirar on public.alerta_envios;
create trigger alerta_email_enfileirar after insert on public.alerta_envios for each row execute function public.enfileirar_email_alerta();
drop trigger if exists alerta_email_cancelar on public.alertas;
create trigger alerta_email_cancelar after update of ativo,canal on public.alertas for each row execute function public.cancelar_email_alerta();

create or replace function public.reservar_emails_alertas() returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ids bigint[]; v_reserva uuid:=extensions.gen_random_uuid(); v_result jsonb;
begin
 if auth.uid() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
 select array_agg(envio_id) into v_ids from (
   select f.envio_id from public.alerta_email_fila f join public.alerta_envios e on e.id=f.envio_id join public.alertas a on a.id=e.alerta_id
   where f.usuario_id=auth.uid() and a.ativo and a.canal='email' and
    (f.status='pendente' or (f.status='enviando' and f.reservado_em<now()-interval '10 minutes'))
   order by f.envio_id limit 5 for update of f skip locked
 ) q;
 update public.alerta_email_fila set status='enviando',reserva=v_reserva,reservado_em=now(),tentativas=tentativas+1 where envio_id=any(v_ids);
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'reserva',f.reserva,'titulo',e.titulo,'mensagem',e.mensagem,'link',e.link)),'[]'::jsonb) into v_result
 from public.alerta_email_fila f join public.alerta_envios e on e.id=f.envio_id where f.envio_id=any(v_ids);
 return v_result;
end; $$;
create or replace function public.finalizar_email_alerta(p_envio bigint,p_reserva uuid,p_sucesso boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or p_sucesso is null then raise exception 'Acesso negado' using errcode='42501'; end if;
 update public.alerta_email_fila set status=case when p_sucesso then 'enviado' else 'falhou' end,
   enviado_em=case when p_sucesso then now() end,erro=case when p_sucesso then null else 'O servidor de email nao confirmou a entrega. Tente novamente.' end,reserva=null
 where envio_id=p_envio and usuario_id=auth.uid() and reserva=p_reserva and status='enviando';
end; $$;
create or replace function public.repetir_emails_falhos() returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Acesso negado' using errcode='42501'; end if;
 update public.alerta_email_fila f set status='pendente',erro=null where f.usuario_id=auth.uid() and f.status='falhou'
   and exists(select 1 from public.alerta_envios e join public.alertas a on a.id=e.alerta_id where e.id=f.envio_id and a.ativo and a.canal='email');
end; $$;
revoke all on function public.reservar_emails_alertas(),public.finalizar_email_alerta(bigint,uuid,boolean),public.repetir_emails_falhos() from public,anon;
grant execute on function public.reservar_emails_alertas(),public.finalizar_email_alerta(bigint,uuid,boolean),public.repetir_emails_falhos() to authenticated;
notify pgrst,'reload schema';
commit;
