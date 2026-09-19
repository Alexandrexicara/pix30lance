require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const AsaasService = require('./asaas');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Support both export formats used by multer-storage-cloudinary versions.
let CloudinaryStorage;
try {
  const cloudinaryStorageModule = require('multer-storage-cloudinary');
  CloudinaryStorage = cloudinaryStorageModule.CloudinaryStorage || cloudinaryStorageModule;
} catch (error) {
  console.log('multer-storage-cloudinary não disponível, usando storage local');
  CloudinaryStorage = null;
}

const app = express();
const port = process.env.PORT || 3000;

// Configure Cloudinary
try {
  if (process.env.CLOUDINARY_URL) {
    console.log('CLOUDINARY_URL encontrada:', process.env.CLOUDINARY_URL.substring(0, 20) + '...');
    cloudinary.config(process.env.CLOUDINARY_URL);
    console.log('Cloudinary configurado com URL');
  } else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('Cloudinary configurado com credenciais separadas');
  } else {
    console.error('Cloudinary não configurado - variáveis de ambiente não encontradas');
    console.error('CLOUDINARY_URL:', process.env.CLOUDINARY_URL ? 'presente' : 'ausente');
    console.error('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME ? 'presente' : 'ausente');
    console.error('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'presente' : 'ausente');
    console.error('CLOUDINARY_API_SECRET:', process.env.CLOUDINARY_API_SECRET ? 'presente' : 'ausente');
  }
} catch (error) {
  console.error('Erro ao configurar Cloudinary:', error);
}

// PostgreSQL connection pool (local or Neon)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

// Initialize Asaas service
const asaas = new AsaasService();

// Sistema de notificações via WhatsApp link (wa.me)
function generateWhatsAppLink(phone, message) {
  const cleanPhone = phone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
}

// Configure multer for file uploads (Cloudinary only - no local fallback)
let storage;
try {
  if (CloudinaryStorage && (process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET))) {
    console.log('Configurando CloudinaryStorage...');
    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'pix30-leiloes',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        resource_type: 'image'
      }
    });
    console.log('CloudinaryStorage configurado com sucesso');
  } else {
    console.log('Cloudinary não configurado ou CloudinaryStorage não disponível, usando storage local');
    const fs = require('fs');
    const path = require('path');

    // Criar diretório de uploads se não existir
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      }
    });
  }
} catch (error) {
  console.error('Erro ao configurar storage:', error);
  console.error('Usando storage local como fallback');

  const fs = require('fs');
  const path = require('path');

  // Criar diretório de uploads se não existir
  const uploadDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    }
  });
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for images
  fileFilter: function (req, file, cb) {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedImageTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedImageTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens (jpeg, jpg, png, gif, webp) são permitidas'));
    }
  }
});

app.use(cors({
  origin: ['https://pix30lances.onrender.com', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
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
        cpf_cnpj VARCHAR(20),
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
        valor_meta DECIMAL(10,2) NOT NULL,
        valor_arrecadado DECIMAL(10,2) DEFAULT 0,
        data_inicio TIMESTAMP NOT NULL,
        data_fim TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'ativo',
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS carrossel_topo (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        imagem_url_1 VARCHAR(1000),
        imagem_url_2 VARCHAR(1000),
        imagem_url_3 VARCHAR(1000),
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add missing columns if they don't exist (for existing tables)
    try {
      await pool.query(`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS foto_url_2 VARCHAR(500)`);
      await pool.query(`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS foto_url_3 VARCHAR(500)`);
      await pool.query(`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS foto_url_4 VARCHAR(500)`);
      await pool.query(`ALTER TABLE leiloes ADD COLUMN IF NOT EXISTS foto_url_5 VARCHAR(500)`);
      console.log('✓ Colunas adicionadas à tabela leiloes');
    } catch (error) {
      console.log('Nota: Colunas podem já existir ou erro ao adicionar:', error.message);
    }

    try {
      await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(20)`);
      console.log('✓ Coluna cpf_cnpj adicionada à tabela usuarios');
    } catch (error) {
      console.log('Nota: Coluna cpf_cnpj pode já existir ou erro ao adicionar:', error.message);
    }

    // Remover restrição UNIQUE para permitir múltiplos lances por usuário
    try {
      await pool.query(`
        ALTER TABLE lances DROP CONSTRAINT IF EXISTS lances_leilao_id_usuario_id_key
      `);
      console.log('✓ Restrição UNIQUE removida da tabela lances - múltiplos lances permitidos');
    } catch (error) {
      console.log('Nota: Restrição pode não existir ou erro ao remover:', error.message);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        leilao_id UUID REFERENCES leiloes(id) ON DELETE CASCADE,
        usuario_id UUID REFERENCES usuarios(id),
        valor DECIMAL(10,2) NOT NULL,
        status_pix VARCHAR(20) DEFAULT 'pendente',
        pix_confirmado_em TIMESTAMP,
        asaas_order_id VARCHAR(255),
        qr_code_string TEXT,
        qr_code_image TEXT,
        copy_paste_code TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // CREATE TABLE IF NOT EXISTS não adiciona colunas em tabelas existentes.
    await pool.query(`
      ALTER TABLE lances
        ADD COLUMN IF NOT EXISTS status_pix VARCHAR(20) DEFAULT 'pendente',
        ADD COLUMN IF NOT EXISTS pix_confirmado_em TIMESTAMP,
        ADD COLUMN IF NOT EXISTS asaas_order_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS qr_code_string TEXT,
        ADD COLUMN IF NOT EXISTS qr_code_image TEXT,
        ADD COLUMN IF NOT EXISTS copy_paste_code TEXT
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

app.get('/api/carrossel-topo', async (req, res) => {
  try {
    const result = await pool.query('SELECT imagem_url_1, imagem_url_2, imagem_url_3 FROM carrossel_topo WHERE id = 1');
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/carrossel-topo', async (req, res) => {
  try {
    const urls = [req.body.imagem_url_1, req.body.imagem_url_2, req.body.imagem_url_3];
    if (urls.some(url => url && !/^https?:\/\//i.test(url))) {
      return res.status(400).json({ error: 'Cada imagem precisa ser uma URL http ou https válida.' });
    }

    const result = await pool.query(`
      INSERT INTO carrossel_topo (id, imagem_url_1, imagem_url_2, imagem_url_3, atualizado_em)
      VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        imagem_url_1 = EXCLUDED.imagem_url_1,
        imagem_url_2 = EXCLUDED.imagem_url_2,
        imagem_url_3 = EXCLUDED.imagem_url_3,
        atualizado_em = CURRENT_TIMESTAMP
      RETURNING imagem_url_1, imagem_url_2, imagem_url_3
    `, urls);
    res.json({ success: true, ...result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new auction (admin)
app.post('/api/leiloes', async (req, res) => {
  try {
    const { nome, descricao, foto_url, foto_url_2, foto_url_3, foto_url_4, foto_url_5, valor_meta, data_inicio } = req.body;

    if (!nome || !descricao || !Number.isFinite(Number(valor_meta)) || Number(valor_meta) <= 0 || !data_inicio) {
      return res.status(400).json({ error: 'Preencha nome, descrição, valor da meta e data de início.' });
    }
    
    // Calculate end date (30 days from start)
    const data_fim = new Date(data_inicio);
    if (Number.isNaN(data_fim.getTime())) {
      return res.status(400).json({ error: 'A data de início é inválida.' });
    }
    data_fim.setDate(data_fim.getDate() + 30);
    
    const result = await pool.query(`
      INSERT INTO leiloes (nome, descricao, foto_url, foto_url_2, foto_url_3, foto_url_4, foto_url_5, valor_meta, data_inicio, data_fim)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [nome, descricao, foto_url, foto_url_2, foto_url_3, foto_url_4, foto_url_5, valor_meta, data_inicio, data_fim]);
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
app.post('/api/usuarios', async (req, res) => {
  try {
    const { nome, email, telefone, cpf_cnpj } = req.body;
    
    console.log('Criando/atualizando usuário:', { nome, email, telefone, cpf_cnpj });
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    );
    
    let result;
    if (existingUser.rows.length > 0) {
      // Update existing user
      console.log('Usuário existente encontrado, atualizando...');
      result = await pool.query(`
        UPDATE usuarios 
        SET nome = $1, telefone = $2, cpf_cnpj = $3
        WHERE email = $4
        RETURNING *
      `, [nome, telefone, cpf_cnpj, email]);
    } else {
      // Create new user
      console.log('Criando novo usuário...');
      result = await pool.query(`
        INSERT INTO usuarios (nome, email, telefone, cpf_cnpj)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [nome, email, telefone, cpf_cnpj]);
    }
    
    console.log('Usuário salvo:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar/atualizar usuário:', error);
    res.status(500).json({ error: error.message });
  }
});

// Place a bid with Asaas integration
app.post('/api/lances', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('=== POST /api/lances ===');
    console.log('Body:', req.body);
    console.log('BASE_URL:', process.env.BASE_URL);
    console.log('ASAAS_API_KEY:', process.env.ASAAS_API_KEY ? 'configured' : 'NOT configured');

    const { leilao_id, usuario_id, valor } = req.body;
    const valorLance = Number(valor);

    if (!Number.isFinite(valorLance) || valorLance < 5) {
      throw new Error('O valor do lance deve ser de no mínimo R$ 5,00, que é o valor mínimo aceito pelo Asaas.');
    }
    
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

    // Create new bid (allow multiple bids per user)
    const insertResult = await client.query(`
      INSERT INTO lances (leilao_id, usuario_id, valor)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [leilao_id, usuario_id, valorLance]);
    const lanceId = insertResult.rows[0].id;
    const lanceData = insertResult.rows[0];
    
    // Generate Pix payment with Asaas
    const description = `Lance no leilão: ${leilao.rows[0].nome}`;
    const referenceId = `lance-${lanceId}`;

    // Get user data for Asaas customer creation
    const userData = await client.query(
      'SELECT nome, email, telefone, cpf_cnpj FROM usuarios WHERE id = $1',
      [usuario_id]
    );

    const customerData = userData.rows[0] || null;

    // A cobrança Pix é exatamente o valor informado no lance, nunca o valor da meta/prêmio.
    const pixPayment = await asaas.generatePixPayment(valorLance, description, referenceId, customerData);
    
    if (!pixPayment.success) {
      const error = new Error(`Erro ao gerar pagamento Pix: ${pixPayment.error}`);
      error.paymentSetupError = /pix.*disponível|conta.*aprovada|approved|account/i.test(pixPayment.error);
      throw error;
    }
    
    // If demo payment, mark it for immediate confirmation
    const isDemo = pixPayment.demo || false;
    
    // Update bid with Asaas data
    const updatedBid = await client.query(`
      UPDATE lances 
      SET asaas_order_id = $2, qr_code_string = $3, qr_code_image = $4, copy_paste_code = $5
      WHERE id = $1
      RETURNING *
    `, [lanceId, pixPayment.orderId, pixPayment.qrCodeString, pixPayment.qrCodeImage, pixPayment.copyPasteCode]);
    
    // Log to audit
    await client.query(`
      INSERT INTO auditoria_lances (lance_id, acao, detalhes)
      VALUES ($1, 'criado', $2)
    `, [lanceId, `Lance de R$ ${valorLance} criado/alterado com Asaas order ${pixPayment.orderId}`]);
    
    await client.query('COMMIT');
    
    res.json({ 
      success: true, 
      lanceId: lanceId,
      orderId: pixPayment.orderId,
      qrCodeImage: pixPayment.qrCodeImage,
      copyPasteCode: pixPayment.copyPasteCode,
      valor: valorLance,
      expiresAt: pixPayment.expiresAt,
      demo: isDemo
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(error.paymentSetupError ? 503 : 500).json({
      error: error.paymentSetupError
        ? 'O pagamento Pix está indisponível porque a conta Asaas ainda não foi aprovada. Configure uma conta aprovada ou use o ambiente Sandbox para testes.'
        : error.message
    });
  } finally {
    client.release();
  }
});

// Check payment status via Asaas
app.get('/api/lances/:id/check-payment', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get bid with Asaas order ID
    const bid = await pool.query(
      'SELECT asaas_order_id, status_pix FROM lances WHERE id = $1',
      [id]
    );
    
    if (bid.rows.length === 0) {
      return res.status(404).json({ error: 'Lance não encontrado' });
    }
    
    if (!bid.rows[0].asaas_order_id) {
      return res.json({ status: bid.rows[0].status_pix, hasOrder: false });
    }
    
    // Check status with Asaas
    const statusCheck = await asaas.checkPaymentStatus(bid.rows[0].asaas_order_id);
    
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
          VALUES ($1, 'pix_confirmado', 'Pagamento Pix confirmado via Asaas webhook')
        `, [id]);
        
        // Update auction total
        await client.query(`
          UPDATE leiloes 
          SET valor_arrecadado = (
            SELECT COALESCE(SUM(valor), 0)
            FROM lances
            WHERE leilao_id = (SELECT leilao_id FROM lances WHERE id = $1)
              AND status_pix = 'confirmado'
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
        SELECT COALESCE(SUM(valor), 0)
        FROM lances
        WHERE leilao_id = $1 AND status_pix = 'confirmado'
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

// Asaas webhook endpoint
app.post('/api/asaas/webhook', async (req, res) => {
  try {
    const notificationData = req.body;
    
    // Process webhook
    const webhookResult = await asaas.handleWebhook(notificationData);
    
    if (!webhookResult.success) {
      console.error('Erro ao processar webhook:', webhookResult.error);
      return res.status(400).json({ error: webhookResult.error });
    }
    
    // Find bid by Asaas order ID
    const bid = await pool.query(
      'SELECT id FROM lances WHERE asaas_order_id = $1',
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
          VALUES ($1, 'pix_confirmado', 'Pagamento Pix confirmado via Asaas webhook')
        `, [bid.rows[0].id]);
        
        // Update auction total
        await client.query(`
          UPDATE leiloes 
          SET valor_arrecadado = (
            SELECT COALESCE(SUM(valor), 0)
            FROM lances
            WHERE leilao_id = (SELECT leilao_id FROM lances WHERE id = $1)
              AND status_pix = 'confirmado'
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

// Admin: Get all bids for all auctions
app.get('/api/admin/lances', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        l.id,
        l.valor,
        l.status_pix,
        l.criado_em,
        l.pix_confirmado_em,
        u.nome as usuario_nome,
        u.email as usuario_email,
        u.telefone as usuario_telefone,
        u.cpf_cnpj as usuario_cpf_cnpj,
        leil.nome as leilao_nome,
        leil.status as leilao_status,
        leil.data_fim
      FROM lances l
      JOIN usuarios u ON l.usuario_id = u.id
      JOIN leiloes leil ON l.leilao_id = leil.id
      ORDER BY l.criado_em DESC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get bids for specific auction
app.get('/api/admin/leiloes/:id/lances', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT
        l.id,
        l.valor,
        l.status_pix,
        l.criado_em,
        l.pix_confirmado_em,
        u.nome as usuario_nome,
        u.email as usuario_email,
        u.telefone as usuario_telefone,
        u.cpf_cnpj as usuario_cpf_cnpj
      FROM lances l
      JOIN usuarios u ON l.usuario_id = u.id
      WHERE l.leilao_id = $1
      ORDER BY l.valor ASC, l.criado_em ASC
    `, [id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get winner notifications
app.get('/api/admin/notificacoes-vencedores', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.lance_id,
        a.acao,
        a.detalhes,
        a.criado_em,
        l.valor as lance_valor,
        l.leilao_id,
        u.nome as usuario_nome,
        u.telefone as usuario_telefone,
        leil.nome as leilao_nome
      FROM auditoria_lances a
      JOIN lances l ON a.lance_id = l.id
      JOIN usuarios u ON l.usuario_id = u.id
      JOIN leiloes leil ON l.leilao_id = leil.id
      WHERE a.acao = 'vencedor_notificado'
      ORDER BY a.criado_em DESC
    `);

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
      'SELECT valor_meta, valor_arrecadado, nome FROM leiloes WHERE id = $1',
      [id]
    );

    const valorMeta = parseFloat(leilao.rows[0].valor_meta);
    const valorArrecadado = parseFloat(leilao.rows[0].valor_arrecadado);
    const metaAtingida = valorArrecadado >= valorMeta;
    const auctionName = leilao.rows[0].nome;

    let valorFinal = menorLanceUnico;

    // Apply 70% rule if meta not reached
    if (!metaAtingida && menorLanceUnico !== null) {
      valorFinal = valorArrecadado * 0.70;
    }

    // Determine prize info
    const prizeInfo = metaAtingida
      ? `O produto ${auctionName}`
      : `R$ ${valorFinal.toFixed(2)} (70% do valor arrecadado)`;

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

    // Send WhatsApp notifications if there's a winner (via wa.me links)
    if (vencedor && menorLanceUnico !== null) {
      try {
        // Get winner details
        const winnerDetails = await client.query(
          'SELECT nome, email, telefone FROM usuarios WHERE id = $1',
          [vencedor]
        );

        if (winnerDetails.rows.length > 0) {
          const winner = winnerDetails.rows[0];

          // Generate WhatsApp message for winner
          const winnerMessage = `
🏆 PARABÉNS! VOCÊ VENCEU O LEILÃO!

📦 Produto: ${auctionName}
💰 Seu lance vencedor: R$ ${menorLanceUnico.toFixed(2)}
🎯 Prêmio: ${prizeInfo}

Obrigado por participar do PIX30!
          `.trim();

          const winnerWhatsAppLink = generateWhatsAppLink(winner.telefone, winnerMessage);

          // Generate WhatsApp message for admin
          const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || '5511999999999';
          const adminMessage = `
📊 LEILÃO FINALIZADO - NOVO VENCEDOR

📦 Produto: ${auctionName}
👤 Vencedor: ${winner.nome} (${winner.email})
📱 Telefone: ${winner.telefone}
💰 Lance vencedor: R$ ${menorLanceUnico.toFixed(2)}
🎯 Prêmio: ${prizeInfo}
📊 Meta atingida: ${prizeInfo.includes('produto') ? 'SIM' : 'NÃO (70% do arrecadado)'}

Verifique no painel administrativo para mais detalhes.
          `.trim();

          const adminWhatsAppLink = generateWhatsAppLink(adminPhone, adminMessage);

          // Store notification in database
          await client.query(`
            INSERT INTO auditoria_lances (lance_id, acao, detalhes)
            VALUES ($1, 'vencedor_notificado', $2)
          `, [lanceVencedorId, JSON.stringify({
            winner: winner.nome,
            winnerPhone: winner.telefone,
            winnerWhatsAppLink: winnerWhatsAppLink,
            adminWhatsAppLink: adminWhatsAppLink,
            prizeInfo: prizeInfo
          })]);

          console.log('📱 Links WhatsApp gerados para o vencedor e admin');
          console.log('📱 Link para vencedor:', winnerWhatsAppLink);
          console.log('📱 Link para admin:', adminWhatsAppLink);
        }
      } catch (whatsappError) {
        console.error('Erro ao gerar links WhatsApp:', whatsappError.message);
        // Don't fail the whole process if WhatsApp fails
      }
    }

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

// Admin: Renew auction (extend end date by 30 days)
app.post('/api/admin/leiloes/:id/renovar', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE leiloes 
      SET data_fim = data_fim + INTERVAL '30 days',
          status = 'ativo'
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Leilão não encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao renovar leilão:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete auction
app.delete('/api/admin/leiloes/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    // Delete related records first
    await client.query('DELETE FROM auditoria_lances WHERE lance_id IN (SELECT id FROM lances WHERE leilao_id = $1)', [id]);
    await client.query('DELETE FROM resultados_leilao WHERE leilao_id = $1', [id]);
    await client.query('DELETE FROM lances WHERE leilao_id = $1', [id]);
    
    // Delete the auction
    const result = await client.query('DELETE FROM leiloes WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Leilão não encontrado' });
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Leilão deletado com sucesso' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao deletar leilão:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
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
app.post('/api/upload', (req, res, next) => {
  upload.single('foto')(req, res, error => {
    if (error) {
      console.error('Erro ao processar arquivo:', error);
      const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        error: error.message || 'Não foi possível processar a imagem.'
      });
    }
    next();
  });
}, (req, res) => {
  try {
    console.log('=== UPLOAD INICIADO ===');
    console.log('Headers:', req.headers['content-type']);
    console.log('Cloudinary configurado:', !!cloudinary.config().cloud_name);

    if (!req.file) {
      console.error('Nenhum arquivo enviado');
      return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
    }

    console.log('Arquivo recebido:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      filename: req.file.filename,
      secure_url: req.file.secure_url
    });

    let fotoUrl;
    if (req.file.secure_url) {
      fotoUrl = req.file.secure_url;
      console.log('Usando URL do Cloudinary:', fotoUrl);
    } else if (typeof req.file.path === 'string' && /^https?:\/\//i.test(req.file.path)) {
      fotoUrl = req.file.path;
      console.log('Usando URL do storage remoto:', fotoUrl);
    } else if (req.file.filename) {
      fotoUrl = `/uploads/${req.file.filename}`;
      console.log('Usando caminho relativo:', fotoUrl);
    } else if (req.file.path) {
      fotoUrl = req.file.path;
      console.log('Usando caminho informado pelo storage:', fotoUrl);
    }

    // O disco local do Render é temporário; não salve caminhos /uploads em produção.
    if (!fotoUrl || !/^https?:\/\//i.test(fotoUrl)) {
      console.error('Upload não persistente: configure o Cloudinary no Render.');
      return res.status(503).json({
        success: false,
        error: 'O armazenamento permanente de imagens não está configurado. Informe CLOUDINARY_URL ou as três variáveis do Cloudinary no Render.'
      });
    }

    console.log('URL final:', fotoUrl);
    res.json({ success: true, fotoUrl: fotoUrl });
  } catch (error) {
    console.error('Erro no upload:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
initDatabase().then(() => {
  app.listen(port, () => {
    console.log(`✓ Servidor rodando em http://localhost:${port}`);
  });
});
