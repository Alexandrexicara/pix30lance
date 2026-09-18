# Instruções de Deploy no Render

## Problemas Corrigidos

1. **Erros JavaScript corrigidos**: Os arquivos `app.js` e `assets/app.js` foram corrigidos para evitar erros de elementos nulos
2. **Servidor corrigido**: Adicionada a importação do `PagBankService` que estava faltando
3. **Configuração Render**: Criado arquivo `render.yaml` para automação do deploy
4. **HTML corrigido**: Alterado para carregar o arquivo JavaScript correto (`assets/app.js`)

## Passos para Deploy no Render

### 1. Configurar Variáveis de Ambiente no Render

Acesse o painel do Render: https://dashboard.render.com

Configure as seguintes variáveis de ambiente no seu web service:

**Obrigatórias:**
- `DATABASE_URL`: Sua string de conexão PostgreSQL (do Neon)
- `PORT`: 3000
- `BASE_URL`: https://pix30lances.onrender.com

**Opcionais (para funcionalidades completas):**
- `ASAAS_API_KEY`: Chave da API do Asaas para pagamentos Pix
- `ASAAS_SANDBOX`: false (produção; use uma `ASAAS_API_KEY` da conta de produção)
- `CLOUDINARY_CLOUD_NAME`: Nome do cloud Cloudinary
- `CLOUDINARY_API_KEY`: Chave da API Cloudinary
- `CLOUDINARY_API_SECRET`: Secret da API Cloudinary
- `CLOUDINARY_URL`: URL completa do Cloudinary
- `ADMIN_WHATSAPP_PHONE`: Número WhatsApp para notificações (ex: 5511999999999)

### 2. Conectar Repositório GitHub

1. No painel do Render, clique em "New +"
2. Selecione "Web Service"
3. Conecte seu repositório GitHub: `Alexandrexicara/pix30lance`
4. Render detectará automaticamente o arquivo `render.yaml`

### 3. Build e Start

O arquivo `render.yaml` configura automaticamente:
- **Build Command**: `npm install`
- **Start Command**: `node server.js`

### 4. Aguardar Deploy

O Render irá:
1. Instalar as dependências
2. Iniciar o servidor
3. Configurar o banco de dados
4. Tornar a aplicação disponível em: https://pix30lances.onrender.com

## Troubleshooting

### Erro: Timeout de Conexão

Se você ainda tiver erros de timeout no Render:

1. **Verifique logs do Render**: Acesse "Logs" no painel do Render
2. **Verifique variáveis de ambiente**: Certifique-se que `DATABASE_URL` está configurada
3. **Verifique banco de dados**: Teste a conexão do Neon

### Erro: Elementos JavaScript Nulos

Isso foi corrigido nos arquivos JavaScript. Se persistir:
1. Limpe o cache do navegador
2. Verifique se o deploy atualizou os arquivos
3. Use o Console do navegador para ver erros específicos

### Servidor não inicia no Render

1. Verifique se `node_modules` está no `.gitignore` (deve estar)
2. Verifique se `package.json` tem o script `start` correto
3. Veja os logs de build no Render

## Modo Demonstração

O sistema funciona em modo demonstração sem as chaves de API:
- QR Codes são gerados para teste
- Pagamentos não são processados
- Use "Confirmar manualmente" para testar o fluxo

## Próximos Passos Após Deploy

1. Teste a aplicação em: https://pix30lances.onrender.com
2. Crie um leilão de teste no painel admin
3. Teste o fluxo de cadastro e lances
4. Configure as chaves de API para produção quando pronto

## Suporte

Se precisar de ajuda adicional:
- Verifique os logs no painel do Render
- Teste localmente com `node server.js`
- Verifique as variáveis de ambiente configuradas