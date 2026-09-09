const axios = require('axios');
const QRCode = require('qrcode');

const ASAAS_PRODUCTION_URL = 'https://api.asaas.com/v3';
const ASAAS_SANDBOX_URL = 'https://sandbox.asaas.com/v3';

class AsaasService {
  constructor() {
    this.apiKey = process.env.ASAAS_API_KEY;
    this.isSandbox = process.env.ASAAS_SANDBOX === 'true';
    this.baseUrl = this.isSandbox ? ASAAS_SANDBOX_URL : ASAAS_PRODUCTION_URL;

    if (!this.apiKey) {
      console.warn('⚠️ ASAAS_API_KEY não configurada.');
    }
  }

  getAuthHeaders() {
    return {
      'access_token': this.apiKey,
      'Content-Type': 'application/json'
    };
  }

  async generatePixPayment(amount, description, referenceId) {
    try {
      const valor = Number(amount);

      if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error('Valor do Pix inválido.');
      }

      console.log('==========================================');
      console.log('💰 CRIANDO PIX ASAAS');
      console.log('Valor:', valor);
      console.log('Descrição:', description);
      console.log('Referência:', referenceId);
      console.log('Sandbox:', this.isSandbox);
      console.log('==========================================');

      if (!description || description.trim() === '') {
        throw new Error('Descrição não pode ser vazia.');
      }

      if (!referenceId || referenceId.trim() === '') {
        throw new Error('Referência não pode ser vazia.');
      }

      // Criar customer temporário para o pagamento
      const customerPayload = {
        name: 'Cliente Leilão',
        email: `cliente-${referenceId}@temp.com`,
        phone: '11999999999',
        cpfCnpj: '00000000000'
      };

      const customerResponse = await axios.post(
        `${this.baseUrl}/customers`,
        customerPayload,
        {
          headers: this.getAuthHeaders(),
          timeout: 60000
        }
      );

      const customerId = customerResponse.data.id;

      // Criar cobrança no Asaas
      const payload = {
        billingType: 'PIX',
        customer: customerId,
        value: valor,
        description: description,
        externalReference: referenceId,
        dueDate: new Date(Date.now() + 60 * 60 * 1000).toISOString().split('T')[0]
      };

      console.log('Payload enviado:', JSON.stringify(payload, null, 2));

      const response = await axios.post(
        `${this.baseUrl}/payments`,
        payload,
        {
          headers: this.getAuthHeaders(),
          timeout: 60000
        }
      );

      const paymentData = response.data;

      console.log('✅ Pagamento Asaas criado:', paymentData.id);

      if (!paymentData.id) {
        throw new Error('Asaas não retornou ID do pagamento.');
      }

      // Gerar QR Code Pix
      const qrCodeResponse = await axios.get(
        `${this.baseUrl}/payments/${paymentData.id}/pixQrCode`,
        {
          headers: this.getAuthHeaders(),
          timeout: 60000
        }
      );

      const qrCodeData = qrCodeResponse.data;

      if (!qrCodeData.encodedImage) {
        throw new Error('Asaas não retornou QR Code.');
      }

      // O Asaas já retorna o QR Code em base64
      const qrCodeImage = qrCodeData.encodedImage;
      const copyPasteCode = qrCodeData.payload;

      return {
        success: true,
        orderId: paymentData.id,
        chargeId: paymentData.id,
        status: this.mapAsaasStatus(paymentData.status),
        qrCodeString: copyPasteCode,
        copyPasteCode: copyPasteCode,
        qrCodeImage: qrCodeImage,
        amount: valor,
        amountCents: Math.round(valor * 100),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      };

    } catch (error) {
      console.error('❌ ERRO AO GERAR PIX ASAAS');
      console.error(error.response?.data || error.message);

      let errorMessage = 'Erro desconhecido ao gerar pagamento Pix.';

      if (error.response?.data?.errors) {
        errorMessage = error.response.data.errors
          .map(e => e.description || e.message)
          .join(' | ');
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async checkPaymentStatus(paymentId) {
    try {
      if (!paymentId) {
        throw new Error('paymentId não informado.');
      }

      const response = await axios.get(
        `${this.baseUrl}/payments/${paymentId}`,
        {
          headers: this.getAuthHeaders(),
          timeout: 60000
        }
      );

      const paymentData = response.data;

      return {
        success: true,
        status: this.mapAsaasStatus(paymentData.status),
        asaasStatus: paymentData.status,
        orderId: paymentData.id,
        chargeId: paymentData.id,
        amount: paymentData.value,
        paidAt: paymentData.paymentDate || null
      };

    } catch (error) {
      console.error('❌ ERRO AO CONSULTAR PIX:', error.response?.data || error.message);

      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  mapAsaasStatus(status) {
    const statusMap = {
      PENDING: 'pendente',
      CONFIRMED: 'confirmado',
      RECEIVED: 'confirmado',
      RECEIVED_IN_CASH: 'confirmado',
      OVERDUE: 'cancelado',
      CANCELED: 'cancelado',
      REFUNDED: 'cancelado'
    };

    return statusMap[status] || 'pendente';
  }

  async handleWebhook(notificationData) {
    try {
      console.log('📩 WEBHOOK ASAAS RECEBIDO:', JSON.stringify(notificationData, null, 2));

      const paymentId = notificationData?.payment?.id || notificationData?.payment?.id;

      if (!paymentId) {
        console.warn('⚠️ Webhook recebido sem payment_id.');
        return {
          success: true,
          orderId: null,
          chargeId: null,
          status: 'pendente',
          amount: null,
          paidAt: null
        };
      }

      const statusCheck = await this.checkPaymentStatus(paymentId);

      if (!statusCheck.success) {
        throw new Error('Não foi possível consultar o pagamento no Asaas.');
      }

      return {
        success: true,
        orderId: statusCheck.orderId,
        chargeId: statusCheck.chargeId,
        status: statusCheck.status,
        asaasStatus: statusCheck.asaasStatus,
        amount: statusCheck.amount,
        paidAt: statusCheck.paidAt
      };

    } catch (error) {
      console.error('❌ ERRO AO PROCESSAR WEBHOOK ASAAS:', error.message);

      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = AsaasService;
