require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const PagBankService = require('./pagbank');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const port = process.env.PORT || 3000;

// Configure Cloudinary
if (process.env.CLOUDINARY_URL) {
  cloudinary.config(process.env.CLOUDINARY_URL);
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

// PostgreSQL connection pool (local or Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

// Initialize PagBank service
const pagbank = new PagBankService();

// Configure multer for file uploads (Cloudinary or fallback)
let storage;
if (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)) {
  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'pix30-leiloes',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'ogg', 'mov'],
      resource_type: 'auto'
    }
  });
} else {
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const fs = require('fs');
      const uploadDir = path.join(__dirname, 'public', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
}

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for videos
  fileFilter: function (req, file, cb) {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const allowedVideoTypes = /mp4|webm|ogg|mov/;
    const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) || 
                   allowedVideoTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedImageTypes.test(file.mimetype) || 
                   allowedVideoTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens (jpeg, jpg, png, gif, webp) ou vídeos (mp4, webm, ogg, mov) são permitidos'));
    }
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));
app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));

// Initialize database tables
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        telefone VARCHAR(20),
        senha_hash VARCHAR(255),
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leiloes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome VARCHAR(255) NOT NULL,
        descricao TEXT,
        foto_url VARCHAR(500),
        foto_url_2 VARCHAR(500),
        foto_url_3 VARCHAR(500),
        foto_url_4 VARCHAR(500),
        foto_url_5 VARCHAR(500),
        video_url VARCHAR(500),
        valor_meta DECIMAL(10,2) NOT NULL,
        valor_arrecadado DECIMAL(10,2) DEFAULT 0,
        data_inicio TIMESTAMP NOT NULL,
        data_fim TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'ativo',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leilao_id UUID REFERENCES leiloes(id) ON DELETE CASCADE,
        usuario_id UUID REFERENCES usuarios(id),
        valor DECIMAL(10,2) NOT NULL,
        status_pix VARCHAR(20) DEFAULT 'pendente',
        pix_confirmado_em TIMESTAMP,
        pagbank_order_id VARCHAR(255),
        qr_code_string TEXT,
        qr_code_image TEXT,
        copy_paste_code TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(leilao_id, usuario_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auditoria_lances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lance_id UUID REFERENCES lances(id),
        acao VARCHAR(50) NOT NULL,
        detalhes TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS resultados_leilao (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leilao_id UUID REFERENCES leiloes(id) UNIQUE,
        vencedor_id UUID REFERENCES usuarios(id),
        lance_vencedor_id UUID REFERENCES lances(id),
        valor_vencedor DECIMAL(10,2),
        valor_final DECIMAL(10,2),
        meta_atingida BOOLEAN,
        processado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✓ Tabelas do banco de dados criadas/verificadas');
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
  }
}

// API Routes

// Get all active auctions
app.get('/api/leiloes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l.*,
        COUNT(DISTINCT lance.usuario_id) as participantes,
        COALESCE(SUM(CASE WHEN lance.status_pix = 'confirmado' THEN lance.valor ELSE 0 END), 0) as arrecadado_real
      FROM leiloes l
      LEFT JOIN lances lance ON l.id = lance.leilao_id
      WHERE l.status = 'ativo'
      GROUP BY l.id
      ORDER BY l.data_inicio DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single auction with details
app.get('/api/leiloes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        l.*,
        COUNT(DISTINCT lance.usuario_id) as participantes,
        COALESCE(SUM(CASE WHEN lance.status_pix = 'confirmado' THEN lance.valor ELSE 0 END), 0) as arrecadado_real
      FROM leiloes l
      LEFT JOIN lances lance ON l.id = lance.leilao_id
      WHERE l.id = $1
      GROUP BY l.id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leilão não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new auction (admin)
app.post('/api/leiloes', async (req, res) => {
  try {
    const { nome, descricao, foto_url, foto_url_2, foto_url_3, foto_url_4, foto_url_5, video_url, valor_meta, data_inicio } = req.body;
    
    // Calculate end date (30 days from start)
    const data_fim = new Date(data_inicio);
    data_fim.setDate(data_fim.getDate() + 30);
    
    const result = await pool.query(`
      INSERT INTO leiloes (nome, descricao, foto_url, foto_url_2, foto_url_3, foto_url_4, foto_url_5, video_url, valor_meta, data_inicio, data_fim)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [nome, descricao, foto_url, foto_url_2, foto_url_3, foto_url_4, foto_url_5, video_url, valor_meta, data_inicio, data_fim]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
app.post('/api/usuarios', async (req, res) => {
  try {
    const { nome, email, telefone } = req.body;
    const result = await pool.query(`
      INSERT INTO usuarios (nome, email, telefone)
      VALUES ($1, $2, $3)
      ON CONFLICT (email) DO UPDATE SET nome = $1, telefone = $3
      RETURNING *
    `, [nome, email, telefone]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place a bid with PagBank integration
app.post('/api/lances', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { leilao_id, usuario_id, valor } = req.body;
    
    // Check if auction is still active (only checks date, NOT meta percentage)
    const leilao = await client.query(
      'SELECT status, data_fim, nome, valor_meta, valor_arrecadado FROM leiloes WHERE id = $1',
      [leilao_id]
    );
    
    if (leilao.rows.length === 0) {
      throw new Error('Leilão não encontrado');
    }
    
    if (leilao.rows[0].status !== 'ativo') {
      throw new Error('Leilão não está mais ativo');
    }
    
    // Only check date - auction continues even if meta is reached
    if (new Date() > new Date(leilao.rows[0].data_fim)) {
      throw new Error('Leilão já encerrado após 30 dias');
    }
    
    // Check if user already has a bid for this auction
    const existingBid = await client.query(
      'SELECT id FROM lances WHERE leilao_id = $1 AND usuario_id = $2',
      [leilao_id, usuario_id]
    );
    
    let lanceId;
    let lanceData;
    
    if (existingBid.rows.length > 0) {
      // Update existing bid
      const updateResult = await client.query(`
        UPDATE lances 
        SET valor = $3, status_pix = 'pendente', pix_confirmado_em = NULL, 
            pagbank_order_id = NULL, qr_code_string = NULL, qr_code_image = NULL, copy_paste_code = NULL
        WHERE id = $1
        RETURNING *
      `, [existingBid.rows[0].id, leilao_id, valor]);
      lanceId = updateResult.rows[0].id;
      lanceData = updateResult.rows[0];
    } else {
      // Create new bid
      const insertResult = await client.query(`
        INSERT INTO lances (leilao_id, usuario_id, valor)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [leilao_id, usuario_id, valor]);
      lanceId = insertResult.rows[0].id;
      lanceData = insertResult.rows[0];
    }
    
    // Generate Pix payment with PagBank
    const description = `Lance no leilão: ${leilao.rows[0].nome}`;
    const referenceId = `lance-${lanceId}`;
    
    const pixPayment = await pagbank.generatePixPayment(valor, description, referenceId);
    
    if (!pixPayment.success) {
      throw new Error(`Erro ao gerar pagamento Pix: ${pixPayment.error}`);
    }
    
    // Update bid with PagBank data
    const updatedBid = await client.query(`
      UPDATE lances 
      SET pagbank_order_id = $2, qr_code_string = $3, qr_code_image = $4, copy_paste_code = $5
      WHERE id = $1
      RETURNING *
    `, [lanceId, pixPayment.orderId, pixPayment.qrCodeString, pixPayment.qrCodeImage, pixPayment.copyPasteCode]);
    
    // Log to audit
    await client.query(`
      INSERT INTO auditoria_lances (lance_id, acao, detalhes)
      VALUES ($1, 'criado', $2)
    `, [lanceId, `Lance de R$ ${valor} criado/alterado com PagBank order ${pixPayment.orderId}`]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      lanceId: lanceId,
      orderId: pixPayment.orderId,
      qrCodeImage: pixPayment.qrCodeImage,
      copyPasteCode: pixPayment.copyPasteCode,
      valor: valor,
      expiresAt: pixPayment.expiresAt
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Check payment status via PagBank
app.get('/api/lances/:id/check-payment', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get bid with PagBank order ID
    const bid = await pool.query(
      'SELECT pagbank_order_id, status_pix FROM lances WHERE id = $1',
      [id]
    );
    
    if (bid.rows.length === 0) {
      return res.status(404).json({ error: 'Lance não encontrado' });
    }
    
    if (!bid.rows[0].pagbank_order_id) {
      return res.json({ status: bid.rows[0].status_pix, hasOrder: false });
    }
    
    // Check status with PagBank
    const statusCheck = await pagbank.checkPaymentStatus(bid.rows[0].pagbank_order_id);
    
    if (!statusCheck.success) {
      return res.status(500).json({ error: statusCheck.error });
    }
    
    // If payment is confirmed, update database
    if (statusCheck.status === 'confirmado' && bid.rows[0].status_pix !== 'confirmado') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        await client.query(`
          UPDATE lances 
          SET status_pix = 'confirmado', pix_confirmado_em = $2
          WHERE id = $1
        `, [id, statusCheck.paidAt]);
        
        // Log to audit
        await client.query(`
          INSERT INTO auditoria_lances (lance_id, acao, detalhes)
          VALUES ($1, 'pix_confirmado', 'Pagamento Pix confirmado via PagBank webhook')
        `, [id]);
        
        // Update auction total
        await client.query(`
          UPDATE leiloes 
          SET valor_arrecadado = (
            COALESCE(SUM(CASE WHEN status_pix = 'confirmado' THEN valor ELSE 0 END), 0)
          )
          WHERE id = (SELECT leilao_id FROM lances WHERE id = $1)
        `, [id]);
        
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao atualizar status:', error);
      } finally {
        client.release();
      }
    }
    
    res.json({ 
      status: statusCheck.status, 
      hasOrder: true,
      amount: statusCheck.amount,
      paidAt: statusCheck.paidAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual confirm Pix payment (fallback)
app.post('/api/lances/:id/confirmar-pix', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    const result = await client.query(`
      UPDATE lances 
      SET status_pix = 'confirmado', pix_confirmado_em = CURRENT_TIMESTAMP
      WHERE id = $1 AND status_pix = 'pendente'
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      throw new Error('Lance não encontrado ou já confirmado');
    }
    
    // Log to audit
    await client.query(`
      INSERT INTO auditoria_lances (lance_id, acao, detalhes)
      VALUES ($1, 'pix_confirmado', 'Pagamento Pix confirmado manualmente')
    `, [id]);
    
    // Update auction total
    await client.query(`
      UPDATE leiloes 
      SET valor_arrecadado = (
        COALESCE(SUM(CASE WHEN status_pix = 'confirmado' THEN valor ELSE 0 END), 0)
      )
      WHERE id = $1
    `, [result.rows[0].leilao_id]);
    
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// PagBank webhook endpoint
app.post('/api/pagbank/webhook', async (req, res) => {
  try {
    const notificationData = req.body;
    
    // Process webhook
    const webhookResult = await pagbank.handleWebhook(notificationData);
    
    if (!webhookResult.success) {
      console.error('Erro ao processar webhook:', webhookResult.error);
      return res.status(400).json({ error: webhookResult.error });
    }
    
    // Find bid by PagBank order ID
    const bid = await pool.query(
      'SELECT id FROM lances WHERE pagbank_order_id = $1',
      [webhookResult.orderId]
    );
    
    if (bid.rows.length === 0) {
      console.log('Nenhum lance encontrado para order ID:', webhookResult.orderId);
      return res.json({ received: true, processed: false });
    }
    
    // Update bid status if payment is confirmed
    if (webhookResult.status === 'confirmado') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        await client.query(`
          UPDATE lances 
          SET status_pix = 'confirmado', pix_confirmado_em = $2
          WHERE id = $1 AND status_pix != 'confirmado'
        `, [bid.rows[0].id, webhookResult.paidAt]);
        
        // Log to audit
        await client.query(`
          INSERT INTO auditoria_lances (lance_id, acao, detalhes)
          VALUES ($1, 'pix_confirmado', 'Pagamento Pix confirmado via PagBank webhook')
        `, [bid.rows[0].id]);
        
        // Update auction total
        await client.query(`
          UPDATE leiloes 
          SET valor_arrecadado = (
            COALESCE(SUM(CASE WHEN status_pix = 'confirmado' THEN valor ELSE 0 END), 0)
          )
          WHERE id = (SELECT leilao_id FROM lances WHERE id = $1)
        `, [bid.rows[0].id]);
        
        await client.query('COMMIT');
        console.log('Pagamento confirmado via webhook para lance:', bid.rows[0].id);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Erro ao atualizar status via webhook:', error);
      } finally {
        client.release();
      }
    }
    
    res.json({ received: true, processed: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's bids
app.get('/api/usuarios/:id/lances', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT 
        l.*,
        leil.nome as leilao_nome,
        leil.foto_url,
        leil.data_fim,
        leil.status as leilao_status,
        leil.valor_meta,
        CASE 
          WHEN leil.status = 'encerrado' THEN (
            SELECT valor_vencedor FROM resultados_leilao WHERE leilao_id = leil.id
          )
          ELSE NULL
        END as valor_vencedor
      FROM lances l
      JOIN leiloes leil ON l.leilao_id = leil.id
      WHERE l.usuario_id = $1
      ORDER BY l.criado_em DESC
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Calculate auction winner (runs when auction ends)
app.post('/api/leiloes/:id/calcular-vencedor', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Get all confirmed bids for this auction
    const lances = await client.query(`
      SELECT valor, usuario_id, id
      FROM lances
      WHERE leilao_id = $1 AND status_pix = 'confirmado'
      ORDER BY valor ASC
    `, [id]);
    
    if (lances.rows.length === 0) {
      throw new Error('Não há lances confirmados para este leilão');
    }
    
    // Count occurrences of each bid value
    const valorCount = {};
    lances.rows.forEach(lance => {
      valorCount[lance.valor] = (valorCount[lance.valor] || 0) + 1;
    });
    
    // Find the lowest unique bid
    let menorLanceUnico = null;
    let vencedor = null;
    let lanceVencedorId = null;
    
    for (const lance of lances.rows) {
      if (valorCount[lance.valor] === 1) {
        menorLanceUnico = lance.valor;
        vencedor = lance.usuario_id;
        lanceVencedorId = lance.id;
        break;
      }
    }
    
    // Get auction details
    const leilao = await client.query(
      'SELECT valor_meta, valor_arrecadado FROM leiloes WHERE id = $1',
      [id]
    );
    
    const valorMeta = parseFloat(leilao.rows[0].valor_meta);
    const valorArrecadado = parseFloat(leilao.rows[0].valor_arrecadado);
    const metaAtingida = valorArrecadado >= valorMeta;
    
    let valorFinal = menorLanceUnico;
    
    // Apply 70% rule if meta not reached
    if (!metaAtingida && menorLanceUnico !== null) {
      valorFinal = valorArrecadado * 0.70;
    }
    
    // Update auction status
    await client.query(
      'UPDATE leiloes SET status = $1 WHERE id = $2',
      ['encerrado', id]
    );
    
    // Store result
    const resultado = await client.query(`
      INSERT INTO resultados_leilao (leilao_id, vencedor_id, lance_vencedor_id, valor_vencedor, valor_final, meta_atingida)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, vencedor, lanceVencedorId, menorLanceUnico, valorFinal, metaAtingida]);
    
    await client.query('COMMIT');
    res.json(resultado.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Get auction result
app.get('/api/leiloes/:id/resultado', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT r.*, u.nome as vencedor_nome
      FROM resultados_leilao r
      LEFT JOIN usuarios u ON r.vencedor_id = u.id
      WHERE r.leilao_id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resultado não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all auctions with stats
app.get('/api/admin/leiloes', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l.*,
        COUNT(DISTINCT lance.usuario_id) as participantes,
        COALESCE(SUM(CASE WHEN lance.status_pix = 'confirmado' THEN lance.valor ELSE 0 END), 0) as arrecadado_real,
        r.valor_vencedor,
        r.meta_atingida
      FROM leiloes l
      LEFT JOIN lances lance ON l.id = lance.leilao_id
      LEFT JOIN resultados_leilao r ON l.id = r.leilao_id
      GROUP BY l.id, r.valor_vencedor, r.meta_atingida
      ORDER BY l.data_inicio DESC
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Erro ao buscar leilões admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all bids
app.get('/api/admin/lances', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        l.*,
        u.nome,
        le.nome as leilao_nome
      FROM lances l
      LEFT JOIN usuarios u ON l.usuario_id = u.id
      LEFT JOIN leiloes le ON l.leilao_id = le.id
      ORDER BY l.criado_em DESC
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error('Erro ao buscar lances admin:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload product image
app.post('/api/upload', upload.single('foto'), (req, res) => {
  try {
    console.log('Upload iniciado');
    if (!req.file) {
      console.error('Nenhum arquivo enviado');
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    
    console.log('Arquivo recebido:', req.file);
    
    let fotoUrl;
    if (req.file.path) {
      fotoUrl = req.file.path;
    } else if (req.file.secure_url) {
      fotoUrl = req.file.secure_url;
    } else {
      fotoUrl = `/uploads/${req.file.filename}`;
    }
    
    console.log('URL gerada:', fotoUrl);
    res.json({ success: true, fotoUrl: fotoUrl });
  } catch (error) {
    console.error('Erro no upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload product video
app.post('/api/upload-video', upload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    
    let videoUrl;
    if (req.file.path) {
      videoUrl = req.file.path;
    } else if (req.file.secure_url) {
      videoUrl = req.file.secure_url;
    } else {
      videoUrl = `/uploads/${req.file.filename}`;
    }
    
    res.json({ success: true, videoUrl: videoUrl });
  } catch (error) {
    console.error('Erro no upload de vídeo:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`✓ Servidor rodando em http://localhost:${port}`);
  });
});
