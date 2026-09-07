# Configuração de Variáveis de Ambiente no Render

## Variáveis de Ambiente Necessárias

Para que o sistema funcione corretamente no Render, você precisa configurar as seguintes variáveis de ambiente:

### 1. Credenciais PagBank (Opcional - sistema funciona em modo demo sem elas)
- `PAGBANK_API_ID`: ID da API do PagBank
- `PAGBANK_API_KEY`: Chave da API do PagBank  
- `PAGBANK_SANDBOX`: `true` para ambiente de teste, `false` para produção

### 2. Banco de Dados
- `DATABASE_URL`: String de conexão PostgreSQL (já configurada no Neon)

### 3. Cloudinary (Upload de imagens)
- `CLOUDINARY_CLOUD_NAME`: Nome do cloud Cloudinary
- `CLOUDINARY_API_KEY`: Chave da API Cloudinary
- `CLOUDINARY_API_SECRET`: Secret da API Cloudinary
- `CLOUDINARY_URL`: URL completa do Cloudinary

### 4. Configuração do Servidor
- `BASE_URL`: URL do seu aplicativo (ex: https://pix30lances.onrender.com)
- `PORT`: 3000

## Como Configurar no Render

1. Acesse o painel do Render: https://dashboard.render.com
2. Clique no seu serviço (web service)
3. Vá em "Environment" 
4. Adicione as variáveis de ambiente acima

## Nota Importante

O sistema funciona em **modo demonstração** se as credenciais do PagBank não estiverem configuradas corretamente. 

No modo demonstração:
- QR Codes são gerados para teste
- Pagamentos não são processados pelo PagBank
- Usuários devem usar "Confirmar manualmente" para testar o fluxo

Para produção, você precisa:
1. Criar conta no PagBank: https://pagseguro.uol.com.br/
2. Obter credenciais de API
3. Configurar as variáveis de ambiente no Render

## Teste

Após configurar as variáveis, reinicie o serviço no Render para que as mudanças tenham efeito.