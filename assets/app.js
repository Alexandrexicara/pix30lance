const API_BASE = '/api';

let currentUser = JSON.parse(localStorage.getItem('pix30-user') || 'null');
let currentAuctionId = null;
let currentBidId = null;

const money = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = d => new Date(d).toLocaleDateString('pt-BR');

// Countdown timer
function updateCountdown(endDate, elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const update = () => {
    const now = new Date().getTime();
    const end = new Date(endDate).getTime();
    const distance = end - now;
    
    if (distance < 0) {
      element.innerHTML = '<span class="ended">LEILÃO ENCERRADO</span>';
      return;
    }
    
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    
    element.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  };
  
  update();
  setInterval(update, 1000);
}

// Load auctions
async function loadAuctions() {
  try {
    const response = await fetch(`${API_BASE}/leiloes`);
    const auctions = await response.json();
    
    const el = document.getElementById('auctions');
    if (auctions.length === 0) {
      el.innerHTML = '<p class="no-auctions">Nenhum leilão ativo no momento.</p>';
      return;
    }
    
    el.innerHTML = auctions.map(a => {
      const percentMeta = Math.min((a.arrecadado_real / a.valor_meta) * 100, 100).toFixed(1);
      return `
        <article class="product auction-card" data-id="${a.id}">
          <div class="product-img">
            ${a.video_url ? 
              `<video src="${a.video_url}" muted loop onmouseover="this.play()" onmouseout="this.pause()"></video>` : 
              (a.foto_url ? `<img src="${a.foto_url}" alt="${a.nome}">` : '📱')
            }
          </div>
          <div class="product-body">
            <span class="tag">Leilão 30 dias</span>
            <h3>${a.nome}</h3>
            <p class="desc">${a.descricao || 'Participe deste leilão!'}</p>
            <div class="auction-stats">
              <div class="stat">
                <span>Meta</span>
                <strong>${money(a.valor_meta)}</strong>
              </div>
              <div class="stat">
                <span>Arrecadado</span>
                <strong>${money(a.arrecadado_real)}</strong>
              </div>
              <div class="stat">
                <span>Participantes</span>
                <strong>${a.participantes || 0}</strong>
              </div>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percentMeta}%"></div>
            </div>
            <p class="meta-percent">${percentMeta}% da meta atingida</p>
            <p class="warning">⏰ O leilão encerra em 30 dias, independente da meta atingida</p>
            <button class="btn primary" onclick="openAuction('${a.id}')">Participar do leilão</button>
          </div>
        </article>
      `;
    }).join('');
    
    // Start countdowns
    auctions.forEach(a => {
      updateCountdown(a.data_fim, `countdown-${a.id}`);
    });
  } catch (error) {
    console.error('Erro ao carregar leilões:', error);
    document.getElementById('auctions').innerHTML = '<p class="error">Erro ao carregar leilões. Tente novamente mais tarde.</p>';
  }
}

// Open auction details
async function openAuction(auctionId) {
  currentAuctionId = auctionId;
  
  try {
    const response = await fetch(`${API_BASE}/leiloes/${auctionId}`);
    const auction = await response.json();
    
    const percentMeta = Math.min((auction.arrecadado_real / auction.valor_meta) * 100, 100).toFixed(1);
    
    const details = document.getElementById('auctionDetails');
    details.innerHTML = `
      <div class="auction-detail">
        <div class="auction-header">
          <p class="eyebrow">LEILÃO ATIVO</p>
          <h2>${auction.nome}</h2>
          <div id="countdown-${auction.id}" class="countdown"></div>
        </div>
        
        <div class="auction-image">
          ${auction.video_url ? 
            `<video src="${auction.video_url}" controls autoplay muted loop></video>` : 
            (auction.foto_url ? `<img src="${auction.foto_url}" alt="${auction.nome}">` : '📱')
          }
        </div>
        
        <div class="auction-info">
          <p class="desc">${auction.descricao || ''}</p>
          
          <div class="auction-stats">
            <div class="stat">
              <span>Meta do leilão</span>
              <strong>${money(auction.valor_meta)}</strong>
            </div>
            <div class="stat">
              <span>Arrecadado</span>
              <strong>${money(auction.arrecadado_real)}</strong>
            </div>
            <div class="stat">
              <span>Participantes</span>
              <strong>${auction.participantes || 0}</strong>
            </div>
          </div>
          
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentMeta}%"></div>
          </div>
          <p class="meta-percent">${percentMeta}% da meta atingida</p>
          <p class="warning">⏰ O leilão encerra em 30 dias, independente da meta atingida</p>
          
          <div class="bid-section">
            <h3>Dê seu menor lance único</h3>
            <p class="warning">⚠️ Você NÃO está comprando o produto. Este é o valor do seu lance para participar do leilão.</p>
            
            <form id="bidForm">
              <label>Valor do lance (R$)
                <input type="number" step="0.01" min="0.01" id="bidAmount" required placeholder="Ex: 10.00">
              </label>
              <button type="submit" class="btn primary full">Fazer lance via Pix</button>
            </form>
          </div>
          
          <div class="auction-rules">
            <h4>Regras deste leilão:</h4>
            <ul>
              <li>Duração: 30 dias</li>
              <li>Vence o menor lance único</li>
              <li>Meta: ${money(auction.valor_meta)}</li>
              <li>Se a meta não for atingida, o vencedor recebe 70% do arrecadado</li>
            </ul>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('auctionModal').classList.add('show');
    document.getElementById('overlay').classList.add('show');
    
    updateCountdown(auction.data_fim, `countdown-${auction.id}`);
    
    document.getElementById('bidForm').onsubmit = handleBidSubmit;
  } catch (error) {
    console.error('Erro ao carregar detalhes:', error);
    alert('Erro ao carregar detalhes do leilão.');
  }
}

// Handle bid submission
async function handleBidSubmit(e) {
  e.preventDefault();
  
  if (!currentUser) {
    alert('Por favor, cadastre seus dados primeiro.');
    openMyBids();
    return;
  }
  
  const bidAmount = parseFloat(document.getElementById('bidAmount').value);
  
  if (isNaN(bidAmount) || bidAmount <= 0) {
    alert('Por favor, informe um valor válido para o lance.');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/lances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leilao_id: currentAuctionId,
        usuario_id: currentUser.id,
        valor: bidAmount
      })
    });
    
    const result = await response.json();
    
    if (result.error) {
      alert(result.error);
      return;
    }
    
    currentBidId = result.lanceId;
    
    // Show QR Code from PagBank
    const pixModal = document.getElementById('pixModal');
    const pixContent = pixModal.querySelector('.modal-box');
    
    pixContent.innerHTML = `
      <button class="modal-close" id="closePixModal">✕</button>
      <p class="eyebrow">PAGAMENTO PIX</p>
      <h2>Pague seu lance via Pix</h2>
      <div class="qr-code-container">
        ${result.qrCodeImage ? `<img src="${result.qrCodeImage}" alt="QR Code Pix" class="qr-code-image">` : ''}
      </div>
      <div class="pix-code" id="pixCode">${result.copyPasteCode || 'Carregando...'}</div>
      <p>Valor do lance: <strong id="pixAmount">${money(bidAmount)}</strong></p>
      <p class="warning">⚠️ Você NÃO está comprando o produto. Este é o valor do seu lance para participar do leilão.</p>
      <p class="expires">⏰ Expira em: ${new Date(result.expiresAt).toLocaleTimeString('pt-BR')}</p>
      <button class="btn primary full" id="copyPix">Copiar código Pix</button>
      <button class="btn ghost full" id="checkPayment">Verificar pagamento</button>
      <button class="btn ghost full" id="confirmPix">Confirmar manualmente</button>
    `;
    
    document.getElementById('auctionModal').classList.remove('show');
    pixModal.classList.add('show');
    document.getElementById('overlay').classList.add('show');
    
    // Re-attach event listeners
    document.getElementById('closePixModal').onclick = () => closeModal('pixModal');
    document.getElementById('copyPix').onclick = copyPixCode;
    document.getElementById('checkPayment').onclick = checkPaymentStatus;
    document.getElementById('confirmPix').onclick = confirmPixPayment;
    
    // Auto-check payment status every 10 seconds
    startPaymentCheck();
  } catch (error) {
    console.error('Erro ao fazer lance:', error);
    alert('Erro ao fazer lance. Tente novamente.');
  }
}

let paymentCheckInterval = null;

// Copy Pix code
async function copyPixCode() {
  const pixCode = document.getElementById('pixCode').textContent;
  try {
    await navigator.clipboard.writeText(pixCode);
    alert('Código Pix copiado!');
  } catch {
    alert('Copie o código Pix manualmente.');
  }
}

// Check payment status
async function checkPaymentStatus() {
  if (!currentBidId) return;
  
  try {
    const response = await fetch(`${API_BASE}/lances/${currentBidId}/check-payment`);
    const result = await response.json();
    
    if (result.error) {
      console.error('Erro ao verificar pagamento:', result.error);
      return;
    }
    
    if (result.status === 'confirmado') {
      stopPaymentCheck();
      alert('✓ Pagamento Pix confirmado automaticamente! Seu lance está válido.');
      closeModal('pixModal');
      
      // Reload auction details
      if (currentAuctionId) {
        openAuction(currentAuctionId);
      }
    } else {
      alert(`Status atual: ${result.status}. O pagamento ainda não foi confirmado.`);
    }
  } catch (error) {
    console.error('Erro ao verificar pagamento:', error);
  }
}

// Start automatic payment check
function startPaymentCheck() {
  stopPaymentCheck(); // Clear any existing interval
  
  paymentCheckInterval = setInterval(async () => {
    if (!currentBidId) {
      stopPaymentCheck();
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/lances/${currentBidId}/check-payment`);
      const result = await response.json();
      
      if (result.status === 'confirmado') {
        stopPaymentCheck();
        alert('✓ Pagamento Pix confirmado automaticamente! Seu lance está válido.');
        closeModal('pixModal');
        
        if (currentAuctionId) {
          openAuction(currentAuctionId);
        }
      }
    } catch (error) {
      console.error('Erro ao verificar pagamento:', error);
    }
  }, 10000); // Check every 10 seconds
}

// Stop payment check
function stopPaymentCheck() {
  if (paymentCheckInterval) {
    clearInterval(paymentCheckInterval);
    paymentCheckInterval = null;
  }
}

// Confirm Pix payment (manual fallback)
async function confirmPixPayment() {
  if (!currentBidId) {
    alert('Nenhum lance para confirmar.');
    return;
  }
  
  stopPaymentCheck();
  
  try {
    const response = await fetch(`${API_BASE}/lances/${currentBidId}/confirmar-pix`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.error) {
      alert(result.error);
      return;
    }
    
    alert('✓ Pagamento Pix confirmado manualmente! Seu lance está válido.');
    closeModal('pixModal');
    
    // Reload auction details
    if (currentAuctionId) {
      openAuction(currentAuctionId);
    }
  } catch (error) {
    console.error('Erro ao confirmar Pix:', error);
    alert('Erro ao confirmar pagamento. Tente novamente.');
  }
}

// Open my bids modal
function openMyBids() {
  document.getElementById('myBidsModal').classList.add('show');
  document.getElementById('overlay').classList.add('show');
  
  if (currentUser) {
    loadMyBids();
  }
}

// Load user's bids
async function loadMyBids() {
  if (!currentUser) return;
  
  try {
    const response = await fetch(`${API_BASE}/usuarios/${currentUser.id}/lances`);
    const bids = await response.json();
    
    const content = document.getElementById('myBidsContent');
    
    if (bids.length === 0) {
      content.innerHTML = '<p class="no-bids">Você ainda não participou de nenhum leilão.</p>';
      return;
    }
    
    content.innerHTML = `
      <div class="user-info">
        <p><strong>Nome:</strong> ${currentUser.nome}</p>
        <p><strong>E-mail:</strong> ${currentUser.email}</p>
      </div>
      <div class="bids-list">
        ${bids.map(b => `
          <div class="bid-item">
            <div class="bid-header">
              <strong>${b.leilao_nome}</strong>
              <span class="status ${b.status_pix}">${b.status_pix}</span>
            </div>
            <div class="bid-details">
              <p>Valor do lance: <strong>${money(b.valor)}</strong></p>
              <p>Data: ${formatDate(b.criado_em)}</p>
              ${b.leilao_status === 'encerrado' ? `
                <p class="result">
                  ${b.valor_vencedor === b.valor ? '🏆 VOCÊ VENCEU!' : '❌ Você não venceu este leilão'}
                </p>
              ` : `
                <p class="time-left">Tempo restante: <span id="bid-countdown-${b.id}"></span></p>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    
    // Start countdowns for active auctions
    bids.forEach(b => {
      if (b.leilao_status !== 'encerrado') {
        updateCountdown(b.data_fim, `bid-countdown-${b.id}`);
      }
    });
  } catch (error) {
    console.error('Erro ao carregar lances:', error);
    document.getElementById('myBidsContent').innerHTML = '<p class="error">Erro ao carregar seus lances.</p>';
  }
}

// Handle user registration
async function handleUserSubmit(e) {
  e.preventDefault();
  
  const nome = document.getElementById('userName').value;
  const email = document.getElementById('userEmail').value;
  const telefone = document.getElementById('userPhone').value;
  
  try {
    const response = await fetch(`${API_BASE}/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, telefone })
    });
    
    const user = await response.json();
    
    if (user.error) {
      alert(user.error);
      return;
    }
    
    currentUser = user;
    localStorage.setItem('pix30-user', JSON.stringify(user));
    
    loadMyBids();
  } catch (error) {
    console.error('Erro ao cadastrar usuário:', error);
    alert('Erro ao cadastrar. Tente novamente.');
  }
}

// Modal controls
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
}

// Event listeners
document.getElementById('openMyBids').onclick = openMyBids;
document.getElementById('closeMyBids').onclick = () => closeModal('myBidsModal');
document.getElementById('closeAuctionModal').onclick = () => closeModal('auctionModal');
document.getElementById('closePixModal').onclick = () => closeModal('pixModal');
document.getElementById('overlay').onclick = () => {
  closeModal('auctionModal');
  closeModal('myBidsModal');
  closeModal('pixModal');
};

document.getElementById('userForm').onsubmit = handleUserSubmit;
document.getElementById('copyPix').onclick = async () => {
  const pixCode = document.getElementById('pixCode').textContent;
  try {
    await navigator.clipboard.writeText(pixCode);
    alert('Chave Pix copiada!');
  } catch {
    alert('Copie a chave Pix manualmente.');
  }
};
document.getElementById('confirmPix').onclick = confirmPixPayment;

// Initialize
loadAuctions();
