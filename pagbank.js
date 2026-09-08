




const axios = require('axios');
const QRCode = require('qrcode');

const PAGBANK_SANDBOX_URL = 'https://sandbox.api.pagseguro.com';
const PAGBANK_PRODUCTION_URL = 'https://api.pagseguro.com';

class PagBankService {
  constructor() {
    this.apiKey = process.env.PAGBANK_API_KEY;

    this.isSandbox = process.env.PAGBANK_SANDBOX === 'true';

    this.baseUrl = this.isSandbox
      ? PAGBANK_SANDBOX_URL
      : PAGBANK_PRODUCTION_URL;

    if (!this.apiKey) {
      console.warn(
        '⚠️ PAGBANK_API_KEY não configurada nas variáveis de ambiente.'
      );
    }
  }

  getAuthHeaders() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
  }

  /**
   * Cria um pagamento PIX no PagBank
   */
  async generatePixPayment(amount, description, referenceId) {
    try {
      const valor = Number(amount);

      if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error('Valor do Pix inválido.');
      }

      // PagBank recebe o valor em CENTAVOS
      const valorCentavos = Math.round(valor * 100);

      // Expiração do PIX: 1 hora
      const expirationDate = new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString();

      const baseUrl = process.env.BASE_URL;

      if (!baseUrl) {
        throw new Error(
          'BASE_URL não configurada. Configure a URL pública do servidor.'
        );
      }

      if (!baseUrl.startsWith('https://')) {
        console.warn(
          '⚠️ BASE_URL não está usando HTTPS. Em produção, utilize HTTPS.'
        );
      }

      const payload = {
        reference_id: referenceId,

        notification_urls: [
          `${baseUrl}/api/pagbank/webhook`
        ],

        charges: [
          {
            reference_id: referenceId,

            description: description,

            amount: {
              value: valorCentavos,
              currency: 'BRL'
            },

            payment_method: {
              type: 'PIX',

              pix: {
                expiration_date: expirationDate
              }
            }
          }
        ]
      };

      console.log('==========================================');
      console.log('💰 CRIANDO PIX PAGBANK');
      console.log('Valor:', valor);
      console.log('Centavos:', valorCentavos);
      console.log('Referência:', referenceId);
      console.log('Sandbox:', this.isSandbox);
      console.log('==========================================');

      const response = await axios.post(
        `${this.baseUrl}/orders`,
        payload,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000
        }
      );

      const orderData = response.data;

      console.log(
        '✅ Pedido PagBank criado:',
        orderData.id
      );

      const charge = orderData.charges?.[0];

      if (!charge) {
        console.error(
          'Resposta PagBank sem charge:',
          JSON.stringify(orderData, null, 2)
        );

        throw new Error(
          'PagBank não retornou a cobrança PIX.'
        );
      }

      const qrCodeText = charge.qr_code?.text;

      if (!qrCodeText) {
        console.error(
          'Resposta PagBank sem QR Code:',
          JSON.stringify(orderData, null, 2)
        );

        throw new Error(
          'PagBank não retornou o código PIX.'
        );
      }

      /*
       * Gera a imagem do QR Code localmente
       * usando o código PIX retornado pelo PagBank.
       */
      const qrCodeImage = await QRCode.toDataURL(
        qrCodeText,
        {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 500
        }
      );

      return {
        success: true,

        orderId: orderData.id,

        chargeId: charge.id,

        status: this.mapPagBankStatus(
          charge.status
        ),

        qrCodeString: qrCodeText,

        copyPasteCode: qrCodeText,

        qrCodeImage: qrCodeImage,

        amount: valor,

        amountCents: valorCentavos,

        expiresAt: expirationDate
      };

    } catch (error) {

      console.error(
        '❌ ERRO AO GERAR PIX PAGBANK'
      );

      console.error(
        error.response?.data ||
        error.message
      );

      let errorMessage =
        'Erro desconhecido ao gerar pagamento Pix.';

      if (
        error.response?.data?.error_messages?.length
      ) {
        errorMessage =
          error.response.data.error_messages
            .map(item =>
              item.description ||
              item.message ||
              JSON.stringify(item)
            )
            .join(' | ');
      } else if (
        error.response?.data?.message
      ) {
        errorMessage =
          error.response.data.message;
      } else if (
        error.response?.data?.error
      ) {
        errorMessage =
          error.response.data.error;
      } else if (
        error.message
      ) {
        errorMessage =
          error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Consulta o pedido no PagBank
   */
  async checkPaymentStatus(orderId) {
    try {
      if (!orderId) {
        throw new Error(
          'orderId não informado.'
        );
      }

      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}`,
        {
          headers: this.getAuthHeaders(),
          timeout: 30000
        }
      );

      const orderData = response.data;

      const charge =
        orderData.charges?.[0];

      const pagBankStatus =
        charge?.status ||
        orderData.status;

      return {
        success: true,

        status:
          this.mapPagBankStatus(
            pagBankStatus
          ),

        pagBankStatus,

        orderId:
          orderData.id,

        chargeId:
          charge?.id || null,

        amount:
          charge?.amount?.value != null
            ? Number(charge.amount.value) / 100
            : null,

        paidAt:
          charge?.paid_at ||
          null
      };

    } catch (error) {

      console.error(
        '❌ ERRO AO CONSULTAR PIX:',
        error.response?.data ||
        error.message
      );

      return {
        success: false,

        error:
          error.response?.data ||
          error.message
      };
    }
  }

  /**
   * Consulta uma cobrança diretamente
   */
  async checkChargeStatus(chargeId) {
    try {
      if (!chargeId) {
        throw new Error(
          'chargeId não informado.'
        );
      }

      const response = await axios.get(
        `${this.baseUrl}/charges/${chargeId}`,
        {
          headers: this.getAuthHeaders(),
          timeout: 60000
        }
      );

      const charge =
        response.data;

      return {
        success: true,

        status:
          this.mapPagBankStatus(
            charge.status
          ),

        pagBankStatus:
          charge.status,

        chargeId:
          charge.id,

        amount:
          charge.amount?.value != null
            ? Number(charge.amount.value) / 100
            : null,

        paidAt:
          charge.paid_at ||
          null,

        orderId:
          charge.metadata?.ps_order_id ||
          null,

        referenceId:
          charge.reference_id ||
          null
      };

    } catch (error) {

      console.error(
        '❌ ERRO AO CONSULTAR COBRANÇA:',
        error.response?.data ||
        error.message
      );

      return {
        success: false,

        error:
          error.response?.data ||
          error.message
      };
    }
  }

  /**
   * Converte os status do PagBank
   * para os status utilizados pelo sistema.
   */
  mapPagBankStatus(status) {

    const statusMap = {

      WAITING:
        'pendente',

      PAID:
        'confirmado',

      DECLINED:
        'cancelado',

      CANCELED:
        'cancelado',

      IN_ANALYSIS:
        'pendente',

      AUTHORIZED:
        'pendente'
    };

    return (
      statusMap[status] ||
      'pendente'
    );
  }

  /**
   * Processa a notificação enviada pelo PagBank.
   *
   * IMPORTANTE:
   * O webhook NÃO confia simplesmente
   * no conteúdo recebido.
   *
   * Ele consulta novamente o PagBank
   * para confirmar o pagamento.
   */
  async handleWebhook(notificationData) {
    try {

      console.log(
        '📩 WEBHOOK PAGBANK RECEBIDO:',
        JSON.stringify(
          notificationData,
          null,
          2
        )
      );

      const orderId =
        notificationData?.order_id ||
        notificationData?.order?.id ||
        null;

      const chargeId =
        notificationData?.charge_id ||
        notificationData?.charge?.id ||
        null;

      /*
       * Primeiro tenta pelo pedido.
       */
      if (orderId) {

        const statusCheck =
          await this.checkPaymentStatus(
            orderId
          );

        if (!statusCheck.success) {
          throw new Error(
            'Não foi possível consultar o pedido no PagBank.'
          );
        }

        return {
          success: true,

          orderId:
            statusCheck.orderId,

          chargeId:
            statusCheck.chargeId,

          status:
            statusCheck.status,

          pagBankStatus:
            statusCheck.pagBankStatus,

          amount:
            statusCheck.amount,

          paidAt:
            statusCheck.paidAt
        };
      }

      /*
       * Se vier somente charge_id,
       * consulta diretamente a cobrança.
       */
      if (chargeId) {

        const statusCheck =
          await this.checkChargeStatus(
            chargeId
          );

        if (!statusCheck.success) {
          throw new Error(
            'Não foi possível consultar a cobrança no PagBank.'
          );
        }

        return {
          success: true,

          orderId:
            statusCheck.orderId,

          chargeId:
            statusCheck.chargeId,

          status:
            statusCheck.status,

          pagBankStatus:
            statusCheck.pagBankStatus,

          amount:
            statusCheck.amount,

          paidAt:
            statusCheck.paidAt,

          referenceId:
            statusCheck.referenceId
        };
      }

      /*
       * Alguns eventos podem não trazer
       * order_id nem charge_id.
       *
       * Nesse caso não confirmamos nada.
       */
      console.warn(
        '⚠️ Webhook recebido sem order_id/charge_id.'
      );

      return {
        success: true,

        orderId: null,

        chargeId: null,

        status: 'pendente',

        amount: null,

        paidAt: null
      };

    } catch (error) {

      console.error(
        '❌ ERRO AO PROCESSAR WEBHOOK PAGBANK:',
        error.message
      );

      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = PagBankService;