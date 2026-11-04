# Instalação, operação e contingência

## Ambiente local e de demonstração

Use Node.js 22.12 ou superior, npm, Chrome e um projeto Supabase de desenvolvimento. Na raiz, execute `npm ci`; em `backend`, execute `npm ci`. Copie `backend/.env.example` para `backend/.env` e preencha a URL e a chave pública do projeto. Não use `service_role` no frontend ou nos testes.

As migrações estão ordenadas no README. Em um ambiente existente, aplique somente as que faltam. A atualização da release 3 para a 4 começa em `backend/database/schema-release4.sql`. Não execute `seed.sql` novamente: ele é exclusivo da preparação do ambiente de demonstração. O arquivo `test-support.sql` deve ser instalado apenas nesse ambiente, atualizado para limpar também consignações e parcerias E2E.

Abra dois terminais:

```powershell
# Terminal 1: backend
cd backend
npm start

# Terminal 2: raiz
npm run dev -- --host 127.0.0.1
```

Abra `http://localhost:5173`. A API responde em `http://localhost:3000/api/health`. Durante Selenium e apresentação, use `npm start` na API, sem reinicialização automática. Não edite código nem aplique migrações enquanto os testes executam. As suítes compartilham contas e devem rodar sequencialmente.

## Publicação

Mantenha desenvolvimento e produção em projetos Supabase separados. Aplique as migrações de schema em ordem, sem seed e sem funções E2E. Configure as contas reais pelo administrador e use HTTPS. As políticas RLS e funções de banco continuam obrigatórias mesmo com a API publicada.

O frontend é gerado com `npm run build`. Configure `VITE_API_URL` antes do build para o endereço HTTPS da API. Hospede `dist/` em um serviço de arquivos estáticos com fallback de rotas para `index.html` (React Router). O backend é um serviço Node persistente: diretório `backend`, instalação `npm ci --omit=dev`, execução `npm start`, porta de `PORT` e `FRONTEND_URL` com a origem exata do frontend. Configure os valores de ambiente no provedor, não no Git. `VITE_*` é público e não deve conter segredos.

Verifique o healthcheck, login, abertura direta de `/dashboard`, imagem privada com autorização, acesso público apenas aos campos autorizados do passaporte e bloqueio de um comprador nas telas administrativas. Pagamentos permanecem simulados; publicar a aplicação não integra um gateway.

Nenhuma publicação em provedor pago ou troca de ambiente ocorre automaticamente. A URL definitiva e a homologação do grupo devem ser registradas na entrega.

### E-mail opcional

Depois de aplicar `schema-release4-email.sql`, configure no backend `MAIL_ENABLED=true`, `PUBLIC_APP_URL` (origem pública do frontend), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` e, quando exigidos, `SMTP_USER`/`SMTP_PASSWORD`. Porta 465 usa `SMTP_SECURE=true`; 587 usa `false` e exige STARTTLS. A validação de certificados permanece ligada. Veja a [documentação do transporte SMTP do Nodemailer](https://nodemailer.com/smtp).

Sem essa configuração, a opção de e-mail fica indisponível e os alertas da plataforma continuam funcionando. Reinicie apenas a API depois de configurar o transporte. O processamento acontece no acesso do usuário às notificações, não por um agendador autônomo. O usuário precisa escolher o canal e pode desligá-lo com uma ação.

`SMTP_ALLOW_LOCAL_PLAINTEXT=true` só funciona com host de loopback e destina-se ao SMTP local dos testes. A suíte inicia o servidor de captura automaticamente; não configure credenciais reais para executá-la. O [SMTP Server de teste](https://nodemailer.com/extras/smtp-server) não encaminha mensagens.

### Dependências

Os lockfiles incluem as correções disponíveis na validação da release. O Mocha mantém a versão principal utilizada pelo projeto, com overrides de `glob` e `minimatch` corrigidos; a regressão completa verifica a compatibilidade do runner. Use `npm ci` para reproduzir o conjunto validado e execute `npm audit` nos dois diretórios para conferir avisos posteriores.

## Recuperação e contingência (R5)

Antes de migrar um ambiente com dados reais, obtenha um backup consistente do banco e dos objetos do Storage pelos recursos disponíveis na conta. Registre a revisão Git e os scripts aplicados. Não suponha que restaurar somente o banco restaure as fotografias/documentos.

Se uma migração falhar, conserve a mensagem do SQL Editor, verifique se a transação foi revertida e corrija a causa antes de reaplicar. As migrações novas usam transação. Não apague tabelas nem reinicie o seed para resolver uma falha. Para voltar o código, use uma revisão conhecida compatível com o schema; alterações de banco devem ser corrigidas por nova migração revisada.

Se a API cair, leia o terminal ou o log, confira as variáveis e a conectividade com o Supabase e reinicie somente a API. Se o frontend perder a conexão, confirme as duas portas antes de trocar configurações. Interrupções do Supabase impedem os fluxos reais: avise o professor e use os registros de execução já obtidos, sem apresentar dados simulados como persistidos.

## Encerramento da release

Arquive o resultado de Selenium com data, revisão Git, ambiente e comando; atualize o DRE e o percentual efetivamente executado do cronograma. Registre falhas corrigidas e pendências no Status Report. Depois da revisão e integração pelo grupo, crie a tag no commit aprovado. Homologação, custos reais, riscos com pessoas e aceitação do professor dependem do grupo; este manual não os declara concluídos.
