# MCP do PIX30

O servidor MCP fica no mesmo processo Node/Express do PIX30 e usa transporte HTTP stateless em `POST /mcp`. Não cria outro serviço nem outro banco.

## Configuração obrigatória no Render

Crie a variável de ambiente `MCP_API_KEY` com um segredo aleatório de pelo menos 32 caracteres. Não coloque essa chave no Git, no frontend ou em arquivos públicos.

Exemplo para gerar uma chave:
- PowerShell: `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))`
- Git Bash: `openssl rand -base64 48`

Depois de salvar a variável no Render, faça um novo deploy. O endpoint retorna 503 enquanto a chave não estiver configurada e 401 para chamadas sem chave válida.

## Conexão

- URL: `https://pix30lances.onrender.com/mcp`
- Transporte: MCP Streamable HTTP, modo stateless (POST JSON-RPC)
- Autenticação: `Authorization: Bearer SUA_MCP_API_KEY` (também aceita `x-api-key`)

## Ferramentas disponíveis

- `pix30_health`: saúde do serviço e conexão PostgreSQL.
- `list_auctions`: lista leilões com dados públicos e totais agregados.
- `get_auction`: detalhes públicos de um leilão.
- `get_auction_result`: resultado publicado.
- `check_bid_payment`: consulta o status de pagamento no Asaas por UUID do lance, sem retornar dados pessoais.

Todas as ferramentas são somente leitura. O MCP não cria cobranças, não altera lances, não encerra leilões e não apaga registros.

## Inicialização JSON-RPC

Envie `initialize` com `jsonrpc: "2.0"`, `id` e `params.protocolVersion`. Em seguida envie `notifications/initialized` e use `tools/list` ou `tools/call`. As chamadas devem incluir o cabeçalho de autenticação.
