const crypto = require('crypto');

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_INFO = { name: 'pix30lances-mcp', version: '1.0.0' };

const TOOLS = [
  { name: 'pix30_health', description: 'Verifica se o serviço PIX30 e o PostgreSQL estão respondendo.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_auctions', description: 'Lista leilões e dados públicos, sem dados pessoais dos participantes.', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['ativo', 'encerrado', 'todos'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, additionalProperties: false } },
  { name: 'get_auction', description: 'Consulta dados públicos e totais de um leilão pelo UUID.', inputSchema: { type: 'object', properties: { auction_id: { type: 'string' } }, required: ['auction_id'], additionalProperties: false } },
  { name: 'get_auction_result', description: 'Consulta o resultado publicado de um leilão pelo UUID.', inputSchema: { type: 'object', properties: { auction_id: { type: 'string' } }, required: ['auction_id'], additionalProperties: false } },
  { name: 'check_bid_payment', description: 'Consulta no Asaas o status de pagamento de um lance pelo UUID. Retorna somente status, valor e data.', inputSchema: { type: 'object', properties: { bid_id: { type: 'string' } }, required: ['bid_id'], additionalProperties: false } }
];

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}
function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function authorized(req) {
  const expected = process.env.MCP_API_KEY;
  if (!expected || expected.length < 32) return false;
  const auth = req.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const supplied = bearer || req.get('x-api-key') || '';
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function toolResult(id, value) {
  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] } };
}

async function callTool(name, args, deps) {
  const pool = deps.pool;
  switch (name) {
    case 'pix30_health':
      await pool.query('SELECT 1');
      return { status: 'ok', service: 'pix30lances', database: 'connected', timestamp: new Date().toISOString() };

    case 'list_auctions': {
      const status = args.status || 'todos';
      if (!['ativo', 'encerrado', 'todos'].includes(status)) throw new Error('Filtro de status inválido.');
      const limit = Math.min(Math.max(Number.parseInt(args.limit, 10) || 20, 1), 50);
      const params = [];
      let where = '';
      if (status !== 'todos') { params.push(status); where = 'WHERE l.status = $1'; }
      params.push(limit);
      const sql = 'SELECT l.id, l.nome, l.descricao, l.foto_url, l.valor_meta, l.valor_arrecadado, l.data_inicio, l.data_fim, l.status, ' +
        "COUNT(DISTINCT CASE WHEN b.status_pix = 'confirmado' THEN b.usuario_id END)::int AS participantes_confirmados, " +
        "COALESCE(SUM(CASE WHEN b.status_pix = 'confirmado' THEN b.valor ELSE 0 END), 0) AS arrecadado_confirmado " +
        'FROM leiloes l LEFT JOIN lances b ON b.leilao_id = l.id ' + where +
        ' GROUP BY l.id ORDER BY l.data_inicio DESC LIMIT $' + params.length;
      const result = await pool.query(sql, params);
      return { count: result.rows.length, auctions: result.rows };
    }

    case 'get_auction': {
      if (!isUuid(args.auction_id)) throw new Error('auction_id precisa ser um UUID válido.');
      const result = await pool.query(
        "SELECT l.id, l.nome, l.descricao, l.foto_url, l.valor_meta, l.valor_arrecadado, l.data_inicio, l.data_fim, l.status, " +
        "COUNT(DISTINCT CASE WHEN b.status_pix = 'confirmado' THEN b.usuario_id END)::int AS participantes_confirmados, " +
        "COUNT(*) FILTER (WHERE b.status_pix = 'confirmado')::int AS lances_confirmados, " +
        "COALESCE(SUM(b.valor) FILTER (WHERE b.status_pix = 'confirmado'), 0) AS arrecadado_confirmado " +
        'FROM leiloes l LEFT JOIN lances b ON b.leilao_id = l.id WHERE l.id = $1 GROUP BY l.id',
        [args.auction_id]
      );
      if (!result.rows.length) throw new Error('Leilão não encontrado.');
      return result.rows[0];
    }

    case 'get_auction_result': {
      if (!isUuid(args.auction_id)) throw new Error('auction_id precisa ser um UUID válido.');
      const result = await pool.query(
        'SELECT r.leilao_id, le.nome AS leilao_nome, r.valor_vencedor, r.valor_final, r.meta_atingida, r.processado_em, ' +
        'CASE WHEN r.vencedor_id IS NOT NULL THEN u.nome ELSE NULL END AS vencedor_nome ' +
        'FROM resultados_leilao r JOIN leiloes le ON le.id = r.leilao_id ' +
        'LEFT JOIN usuarios u ON u.id = r.vencedor_id WHERE r.leilao_id = $1',
        [args.auction_id]
      );
      if (!result.rows.length) throw new Error('Resultado ainda não publicado ou leilão não encontrado.');
      return result.rows[0];
    }

    case 'check_bid_payment': {
      if (!isUuid(args.bid_id)) throw new Error('bid_id precisa ser um UUID válido.');
      const bid = await pool.query('SELECT asaas_order_id FROM lances WHERE id = $1', [args.bid_id]);
      if (!bid.rows.length) throw new Error('Lance não encontrado.');
      if (!bid.rows[0].asaas_order_id) return { status: 'pendente', hasPaymentOrder: false };
      const payment = await deps.asaas.checkPaymentStatus(bid.rows[0].asaas_order_id);
      if (!payment.success) throw new Error('Não foi possível consultar o pagamento no provedor.');
      return { status: payment.status, amount: payment.amount, paidAt: payment.paidAt || null, hasPaymentOrder: true };
    }

    default:
      throw new Error('Ferramenta MCP não encontrada.');
  }
}

function registerMcpEndpoint(app, dependencies) {
  app.post('/mcp', async (req, res) => {
    if (!process.env.MCP_API_KEY || process.env.MCP_API_KEY.length < 32) {
      return res.status(503).json({ error: 'MCP indisponível: configure MCP_API_KEY no ambiente do serviço.' });
    }
    if (!authorized(req)) return res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Não autorizado.' });

    const message = req.body;
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return res.status(400).json(rpcError(message?.id, -32600, 'Requisição JSON-RPC inválida.'));
    }
    if (message.method.startsWith('notifications/')) return res.status(202).end();

    const id = message.id;
    try {
      switch (message.method) {
        case 'initialize':
          return res.status(200).type('application/json').json({
            jsonrpc: '2.0', id,
            result: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: { tools: { listChanged: false } },
              serverInfo: SERVER_INFO,
              instructions: 'PIX30: servidor MCP de consultas somente leitura. Nenhuma ferramenta altera dados ou cria cobranças.'
            }
          });
        case 'ping':
          return res.status(200).json({ jsonrpc: '2.0', id, result: {} });
        case 'tools/list':
          return res.status(200).json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
        case 'tools/call': {
          const params = message.params || {};
          if (typeof params.name !== 'string') return res.status(200).json(rpcError(id, -32602, 'Nome da ferramenta ausente.'));
          try {
            const output = await callTool(params.name, params.arguments || {}, dependencies);
            return res.status(200).type('application/json').json(toolResult(id, output));
          } catch (error) {
            return res.status(200).json({
              jsonrpc: '2.0', id,
              result: { content: [{ type: 'text', text: error.message }], isError: true }
            });
          }
        }
        default:
          return res.status(200).json(rpcError(id, -32601, 'Método MCP não suportado.'));
      }
    } catch (error) {
      console.error('Erro no endpoint MCP:', error.message);
      return res.status(200).json(rpcError(id, -32603, 'Erro interno do servidor MCP.'));
    }
  });
  app.get('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST para o transporte MCP Streamable HTTP.' }));
}

module.exports = { registerMcpEndpoint };
