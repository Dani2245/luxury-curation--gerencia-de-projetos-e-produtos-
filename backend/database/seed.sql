-- Lastro - dados iniciais para desenvolvimento. Execute depois do schema.sql.
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

insert into public.pecas (nome, categoria, descricao, valor_pretendido, fotografias, vendedor_id, publicacao, status_passaporte)
select s.nome, s.categoria, s.descricao, s.valor, s.fotografias, p.id, s.publicacao, s.status_passaporte
from (values
  ('Omega Speedmaster Meteorite', 'relógio',
   'Cronógrafo em aço com mostrador de meteorito, caixa de 44 mm e certificado original do fabricante.',
   185000.00, array['/seed/omega-meteorite.jpeg'], 'publicada', 'valido'),
  ('Relógio de Bolso Prata Vintage', 'relógio',
   'Relógio de bolso em prata de lei, década de 1920, mecanismo manual revisado e corrente original.',
   42000.00, array['/seed/silver-watch.jpg'], 'publicada', 'em revisão'),
  ('The Shape of Speed — Edição Limitada', 'obra de arte',
   'Escultura em edição limitada inspirada na Fórmula 1, numerada e acompanhada de certificado do artista.',
   96000.00, array['/seed/shape-of-speed.webp'], 'publicada', 'valido'),
  ('Anel Solitário Art Déco', 'joia',
   'Anel em platina com diamante lapidação antiga de 1,2 ct, produzido na década de 1930.',
   128000.00, array[]::text[], 'pendente', 'em revisão')
) as s (nome, categoria, descricao, valor, fotografias, publicacao, status_passaporte)
cross join (select id from public.perfis where email = 'vendedor@lastro.com') p
where not exists (select 1 from public.pecas where vendedor_id = p.id);
