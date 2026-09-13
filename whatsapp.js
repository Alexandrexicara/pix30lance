const axios = require('axios');

class WhatsAppService {
  constructor() {
    this.apiKey = process.env.WHATSAPP_API_KEY;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.baseUrl = 'https://graph.facebook.com/v18.0';

    if (!this.apiKey || !this.phoneNumberId) {
      console.warn('⚠️ WHATSAPP_API_KEY ou WHATSAPP_PHONE_NUMBER_ID não configurados. Notificações por WhatsApp estarão desabilitadas.');
    }
  }

  async sendMessage(phoneNumber, message) {
    if (!this.apiKey || !this.phoneNumberId) {
      console.log('📱 Simulação de envio WhatsApp:', { phoneNumber, message });
      return { success: true, simulated: true };
    }

    try {
      // Limpar número de telefone (remover caracteres não numéricos)
      const cleanPhone = phoneNumber.replace(/\D/g, '');

      // Adicionar código do país Brasil se não tiver
      const formattedPhone = cleanPhone.length === 11 ? `55${cleanPhone}` : cleanPhone;

      const response = await axios.post(
        `${this.baseUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: {
            body: message
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ Mensagem WhatsApp enviada:', response.data);
      return { success: true, data: response.data };

    } catch (error) {
      console.error('❌ Erro ao enviar mensagem WhatsApp:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  async notifyWinner(user, auction, winningBid, prizeInfo) {
    const message = `
🏆 PARABÉNS! VOCÊ VENCEU O LEILÃO!

📦 Produto: ${auction.nome}
💰 Seu lance vencedor: R$ ${winningBid.valor.toFixed(2)}
🎯 Prêmio: ${prizeInfo}

Obrigado por participar do PIX30!

Para mais informações, entre em contato com o suporte.
    `.trim();

    return await this.sendMessage(user.telefone, message);
  }

  async notifyAdmin(auction, winner, winningBid, prizeInfo) {
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;

    if (!adminPhone) {
      console.log('⚠️ ADMIN_WHATSAPP_PHONE não configurado');
      return { success: false, error: 'Admin phone not configured' };
    }

    const message = `
📊 LEILÃO FINALIZADO - NOVO VENCEDOR

📦 Produto: ${auction.nome}
👤 Vencedor: ${winner.nome} (${winner.email})
📱 Telefone: ${winner.telefone}
💰 Lance vencedor: R$ ${winningBid.valor.toFixed(2)}
🎯 Prêmio: ${prizeInfo}
📊 Meta atingida: ${prizeInfo.includes('produto') ? 'SIM' : 'NÃO (70% do arrecadado)'}

Verifique no painel administrativo para mais detalhes.
    `.trim();

    return await this.sendMessage(adminPhone, message);
  }
}

module.exports = WhatsAppService;
