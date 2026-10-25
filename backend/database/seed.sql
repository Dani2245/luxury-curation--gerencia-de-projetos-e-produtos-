-- Lastro - dados iniciais para desenvolvimento. Execute depois de schema.sql e schema-rfc03-rfc04.sql.
-- Usuarios de teste (senha de desenvolvimento: Lastro@2026):
--   admin@lastro.com     Administrador
--   vendedor@lastro.com  Vendedor
--   comprador@lastro.com Comprador
--   perito@lastro.com    Perito
-- O script pode ser executado mais de uma vez.

do $$
declare
  v_usuario record;
begin
  for v_usuario in
    select * from (values
      ('admin@lastro.com', 'Helena Duarte', 'Administrador'),
      ('vendedor@lastro.com', 'Rafael Moreira', 'Vendedor'),
      ('comprador@lastro.com', 'Beatriz Almeida', 'Comprador'),
      ('perito@lastro.com', 'Carlos Menezes', 'Perito')
    ) as t (email, nome, perfil)
  loop
    if not exists (select 1 from auth.users where email = v_usuario.email) then
      perform public.criar_usuario_interno(v_usuario.email, 'Lastro@2026', v_usuario.nome, v_usuario.perfil);
    end if;
  end loop;
end;
$$;

insert into public.pecas (nome, categoria, descricao, valor_pretendido, fotografias, vendedor_id, publicacao)
select s.nome, s.categoria, s.descricao, s.valor, s.fotografias, p.id, s.publicacao
from (values
  ('Omega Speedmaster Meteorite', 'relógio',
   'Cronógrafo em aço com mostrador de meteorito, caixa de 44 mm e certificado original do fabricante.',
   185000.00, array['/seed/omega-meteorite.jpeg'], 'publicada'),
  ('Relógio de Bolso Prata Vintage', 'relógio',
   'Relógio de bolso em prata de lei, década de 1920, mecanismo manual revisado e corrente original.',
   42000.00, array['/seed/silver-watch.jpg'], 'publicada'),
  ('The Shape of Speed — Edição Limitada', 'obra de arte',
   'Escultura em edição limitada inspirada na Fórmula 1, numerada e acompanhada de certificado do artista.',
   96000.00, array['/seed/shape-of-speed.webp'], 'publicada'),
  ('Anel Solitário Art Déco', 'joia',
   'Anel em platina com diamante lapidação antiga de 1,2 ct, produzido na década de 1930.',
   128000.00, array[]::text[], 'pendente')
) as s (nome, categoria, descricao, valor, fotografias, publicacao)
cross join (select id from public.perfis where email = 'vendedor@lastro.com') p
where not exists (select 1 from public.pecas where vendedor_id = p.id);

-- Passaportes de exemplo emitidos pelo perito de teste (documentos de exemplo, sem arquivo no storage)
do $$
declare
  v_perito uuid;
  v_peca record;
begin
  select id into v_perito from public.perfis where email = 'perito@lastro.com';

  for v_peca in
    select p.id, p.nome from public.pecas p
    join public.perfis v on v.id = p.vendedor_id and v.email = 'vendedor@lastro.com'
    where p.nome in ('Omega Speedmaster Meteorite', 'Relógio de Bolso Prata Vintage', 'The Shape of Speed — Edição Limitada')
      and not exists (select 1 from public.passaportes pp where pp.peca_id = p.id)
  loop
    perform public.emitir_passaporte_interno(
      v_perito,
      v_peca.id,
      case when v_peca.nome = 'Relógio de Bolso Prata Vintage' then 'em revisão' else 'valido' end,
      jsonb_build_array(
        jsonb_build_object('tipo', 'certificado', 'titulo', 'Certificado de autenticidade',
          'arquivo_path', 'seed/certificado-' || v_peca.id || '.pdf', 'mime', 'application/pdf',
          'hash_sha256', encode(extensions.digest('seed-certificado-' || v_peca.id, 'sha256'), 'hex')),
        jsonb_build_object('tipo', 'laudo', 'titulo', 'Laudo pericial', 'descricao', 'Análise de autenticidade e estado de conservação',
          'arquivo_path', 'seed/laudo-' || v_peca.id || '.pdf', 'mime', 'application/pdf',
          'hash_sha256', encode(extensions.digest('seed-laudo-' || v_peca.id, 'sha256'), 'hex'))
      ),
      case when v_peca.nome = 'Omega Speedmaster Meteorite' then array['Colecionador particular (Genebra)'] else '{}'::text[] end
    );
  end loop;
end;
$$;

select (select count(*) from public.perfis) as perfis, (select count(*) from public.pecas) as pecas,
       (select count(*) from public.passaportes) as passaportes;
