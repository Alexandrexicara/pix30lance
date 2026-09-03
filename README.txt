PIX30 — PLATAFORMA DE LEILÃO REVERSO
======================================

Plataforma de leilão reverso de menor lance único com duração de 30 dias e pagamento via Pix integrado com PagBank.

ARQUIVOS
- index.html (página principal com leilões)
- admin.html (painel administrativo)
- regras.html (termos e regras completas)
- server.js (backend Node.js com API)
- pagbank.js (integração API PagBank)
- package.json (dependências do projeto)
- .env (configurações de ambiente)
- assets/style.css (estilos)
- assets/app.js (lógica frontend)

REQUISITOS
- Node.js (v14 ou superior)
- PostgreSQL (usando Neon)
- Credenciais API PagBank

INSTALAÇÃO

1. Configurar Banco de Dados Neon:
   - Crie uma conta em https://neon.tech
   - Crie um novo projeto PostgreSQL
   - Copie a string de conexão (DATABASE_URL)

2. Configurar API PagBank:
   - Obtenha suas credenciais no painel PagBank
   - API ID e API Key (sandbox ou produção)

3. Configurar Variáveis de Ambiente:
   - Abra o arquivo .env
   - Substitua DATABASE_URL pela sua string do Neon
   - Substitua PAGBANK_API_ID e PAGBANK_API_KEY pelas suas credenciais
   - Configure PAGBANK_SANDBOX=true para testes, false para produção

4. Instalar Dependências:
   npm install

5. Iniciar o Servidor:
   npm start

   O servidor rodará em http://localhost:3000

COMO USAR

PAINEL ADMINISTRATIVO
1. Acesse http://localhost:3000/admin.html
2. Crie novos leilões informando:
   - Nome do produto
   - Descrição
   - URL da foto
   - Valor meta
   - Data de início
3. Acompanhe arrecadação e participantes
4. Ao final de 30 dias, clique em "Calcular Vencedor"

PARTICIPANTES
1. Acesse http://localhost:3000
2. Cadastre seus dados (nome, e-mail, telefone)
3. Escolha um leilão ativo
4. Informe o valor do seu lance
5. Pague via Pix usando o QR Code gerado automaticamente
6. O sistema verifica o pagamento automaticamente a cada 10 segundos
7. Acompanhe o resultado em "Meus Lances"

INTEGRAÇÃO PAGBANK

A plataforma está integrada com a API PagBank para:
- Geração automática de QR Code Pix
- Verificação automática de status de pagamento
- Webhook para notificações de pagamento
- Confirmação manual como fallback

Funcionalidades:
- QR Code Pix gerado automaticamente para cada lance
- Verificação automática de pagamento a cada 10 segundos
- Webhook para confirmação em tempo real
- Opção de confirmação manual se necessário
- Suporte a ambiente sandbox para testes

REGRA DO LEILÃO
- Cada leilão dura 30 dias
- O vencedor é quem der o MENOR LANCE ÚNICO
- Valor único = valor escolhido por apenas uma pessoa
- Se a meta for atingida, o vencedor recebe o produto
- Se a meta NÃO for atingida, o vencedor recebe 70% do arrecadado

EXEMPLO
- João: R$ 5,00
- Maria: R$ 5,00 (repetido, não vence)
- Carlos: R$ 8,00 (único, menor valor → VENCE)
- Pedro: R$ 10,00 (único, mas maior que R$ 8,00)

API ENDPOINTS

GET /api/leiloes - Listar leilões ativos
GET /api/leiloes/:id - Detalhes de um leilão
POST /api/leiloes - Criar novo leilão (admin)
POST /api/usuarios - Criar/atualizar usuário
POST /api/lances - Dar lance (gera QR Code Pix via PagBank)
GET /api/lances/:id/check-payment - Verificar status pagamento PagBank
POST /api/lances/:id/confirmar-pix - Confirmar pagamento manualmente
POST /api/pagbank/webhook - Webhook PagBank para notificações
GET /api/usuarios/:id/lances - Lances do usuário
POST /api/leiloes/:id/calcular-vencedor - Calcular vencedor
GET /api/leiloes/:id/resultado - Resultado do leilão
GET /api/admin/leiloes - Todos os leilões (admin)

SEGURANÇA
- O cálculo do vencedor é realizado no servidor
- Histórico de auditoria para todos os lances
- Proteção contra alterações não autorizadas
- Validação de pagamento via API PagBank
- Webhook seguro para notificações

IMPORTANTE
- Configure suas credenciais PagBank no arquivo .env
- Use PAGBANK_SANDBOX=true para testes iniciais
- Configure o webhook no painel PagBank para produção
- Mantenha o arquivo .env seguro e não o compartilhe
- O QR Code Pix expira em 1 hora após geração

SUPORTE
Para dúvidas ou problemas, consulte a documentação PagBank ou entre em contato com o suporte.
