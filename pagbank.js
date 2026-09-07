const axios = require('axios');
const QRCode = require('qrcode');

// PagBank API Configuration
const PAGBANK_SANDBOX_URL = 'https://sandbox.api.pagseguro.com';
const PAGBANK_PRODUCTION_URL = 'https://api.pagseguro.com';

class PagBankService {
  constructor() {
    this.apiId = process.env.PAGBANK_API_ID;
    this.apiKey = process.env.PAGBANK_API_KEY;
    this.isSandbox = process.env.PAGBANK_SANDBOX === 'true';
    this.baseUrl = this.isSandbox ? PAGBANK_SANDBOX_URL : PAGBANK_PRODUCTION_URL;
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  // Generate QR Code for Pix payment
  async generatePixPayment(amount, description, referenceId) {
    try {
      // Check if credentials are configured
      if (!this.apiKey || !this.apiId) {
        console.warn('Credenciais PagBank não configuradas, usando modo demonstração');
        return this.generateDemoPayment(amount, description, referenceId);
      }

      const payload = {
        amount: {
          value: amount.toFixed(2),
          currency: 'BRL'
        },
        description: description,
        payment_method: {
          type: 'PIX',
          pix: {
            expires_in: 3600 // 1 hour
          }
        },
        reference_id: referenceId,
        notification_urls: [`${process.env.BASE_URL || 'http://localhost:3000'}/api/pagbank/webhook`]
      };

      const response = await axios.post(
        `${this.baseUrl}/orders`,
        payload,
        { headers: this.getAuthHeaders() }
      );

      const orderData = response.data;
      
      // Extract QR Code data
      const qrCodeData = orderData.qr_codes?.[0];
      
      if (!qrCodeData) {
        throw new Error('QR Code não gerado pela API PagBank');
      }

      // Generate QR Code image
      const qrCodeImage = await QRCode.toDataURL(qrCodeData.encoded_image);

      return {
        success: true,
        orderId: orderData.id,
        qrCodeString: qrCodeData.encoded_image,
        qrCodeImage: qrCodeImage,
        copyPasteCode: qrCodeData.copy_and_paste,
        amount: amount,
        expiresAt: new Date(Date.now() + 3600000).toISOString()
      };
    } catch (error) {
      console.error('Erro ao gerar pagamento Pix:', error.response?.data || error.message);
      
      // Se for erro de credenciais, usar modo demonstração
      if (error.response?.status === 401 || error.message?.includes('credential')) {
        console.warn('Erro de credenciais PagBank, usando modo demonstração');
        return this.generateDemoPayment(amount, description, referenceId);
      }
      
      const errorMessage = error.response?.data?.error_messages?.[0]?.description || 
                          error.response?.data?.message || 
                          error.message || 
                          'Erro desconhecido ao gerar pagamento Pix';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // Generate demo payment for testing when PagBank is not configured
  async generateDemoPayment(amount, description, referenceId) {
    try {
      // Generate a demo QR code
      const demoPixString = `00020126580014BR.GOV.BCB.PIX0136${referenceId}5204000053039865404${amount.toFixed(2).replace('.', '')}5802BR5925PIX30_LEILAO_DEMONSTRACAO6009SAO_PAULO62070503***6304`;
      const qrCodeImage = await QRCode.toDataURL(demoPixString);

      return {
        success: true,
        orderId: `demo-${referenceId}-${Date.now()}`,
        qrCodeString: demoPixString,
        qrCodeImage: qrCodeImage,
        copyPasteCode: demoPixString,
        amount: amount,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        demo: true // Flag to indicate this is a demo payment
      };
    } catch (error) {
      console.error('Erro ao gerar pagamento demonstração:', error.message);
      return {
        success: false,
        error: 'Erro ao gerar pagamento demonstração'
      };
    }
  }

  // Check payment status
  async checkPaymentStatus(orderId) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}`,
        { headers: this.getAuthHeaders() }
      );

      const orderData = response.data;
      
      return {
        success: true,
        status: this.mapPagBankStatus(orderData.status),
        orderId: orderData.id,
        amount: orderData.amount?.value,
        paidAt: orderData.charges?.[0]?.payment_response?.received_at
      };
    } catch (error) {
      console.error('Erro ao verificar status do pagamento:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  // Map PagBank status to our status
  mapPagBankStatus(pagBankStatus) {
    const statusMap = {
      'PAID': 'confirmado',
      'WAITING_PAYMENT': 'pendente',
      'REJECTED': 'cancelado',
      'CANCELED': 'cancelado',
      'IN_ANALYSIS': 'pendente'
    };
    
    return statusMap[pagBankStatus] || 'pendente';
  }

  // Webhook handler for payment notifications
  async handleWebhook(notificationData) {
    try {
      const orderId = notificationData.order_id;
      
      // Get full order details
      const statusCheck = await this.checkPaymentStatus(orderId);
      
      if (!statusCheck.success) {
        throw new Error('Erro ao verificar status do pagamento');
      }

      return {
        success: true,
        orderId: orderId,
        status: statusCheck.status,
        amount: statusCheck.amount,
        paidAt: statusCheck.paidAt
      };
    } catch (error) {
      console.error('Erro ao processar webhook:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PagBankService;
