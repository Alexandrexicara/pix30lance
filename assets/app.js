const API_BASE = '/api';

let currentUser = JSON.parse(localStorage.getItem('pix30-user') || 'null');
let currentAuctionId = null;
let currentBidId = null;

const money = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = d => new Date(d).toLocaleDateString('pt-BR');

// Carousel functions
const carouselStates = {};

function moveCarousel(auctionId, direction) {
  if (!carouselStates[auctionId]) {
    const container = document.querySelector(`[data-auction-id="${auctionId}"]`);
    const slides = container.querySelectorAll('.carousel-slide');
    carouselStates[auctionId] = { currentIndex: 0, totalSlides: slides.length };
  }
  
  const state = carouselStates[auctionId];
  state.currentIndex = (state.currentIndex + direction + state.totalSlides) % state.totalSlides;
  updateCarousel(auctionId);
}

function goToSlide(auctionId, index) {
  if (!carouselStates[auctionId]) {
    const container = document.querySelector(`[data-auction-id="${auctionId}"]`);
    const slides = container.querySelectorAll('.carousel-slide');
    carouselStates[auctionId] = { currentIndex: 0, totalSlides: slides.length };
  }
  
  carouselStates[auctionId].currentIndex = index;
  updateCarousel(auctionId);
}

function updateCarousel(auctionId) {
  const container = document.querySelector(`[data-auction-id="${auctionId}"]`);
  if (!container) return;
  
  const state = carouselStates[auctionId];
  const slides = container.querySelectorAll('.carousel-slide');
  const indicators = container.querySelectorAll('.indicator');
  
  slides.forEach((slide, index) => {
    slide.classList.toggle('active', index === state.currentIndex);
  });
  
  indicators.forEach((indicator, index) => {
    indicator.classList.toggle('active', index === state.currentIndex);
  });
}

// Auto-advance carousel every 3 seconds
function startCarouselAutoAdvance(auctionId) {
  if (carouselStates[auctionId]?.interval) {
    clearInterval(carouselStates[auctionId].interval);
  }
  
  carouselStates[auctionId] = carouselStates[auctionId] || {};
  carouselStates[auctionId].interval = setInterval(() => {
    moveCarousel(auctionId, 1);
  }, 3000);
}

// Initialize carousels after loading auctions
function initCarousels() {
  const containers = document.querySelectorAll('.carousel-container');
  containers.forEach(container => {
    const auctionId = container.dataset.auctionId;
    const slides = container.querySelectorAll('.carousel-slide');
    
    if (slides.length > 1) {
      carouselStates[auctionId] = { 
        currentIndex: 0, 
        totalSlides: slides.length,
        interval: null
      };
      startCarouselAutoAdvance(auctionId);
    }
  });
}

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
      const photos = [a.foto_url, a.foto_url_2, a.foto_url_3, a.foto_url_4, a.foto_url_5].filter(url => url);
      
      return `
        <article class="product auction-card" data-id="${a.id}">
          <div class="product-img">
            ${photos.length > 0 ? 
              (photos.length > 1 ? 
                `<div class="carousel-container" data-auction-id="${a.id}">
                  <div class="carousel-slides">
                    ${photos.map((photo, index) => `
                      <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                        <img src="${photo}" alt="${a.nome} - Foto ${index + 1}">
                      </div>
                    `).join('')}
                  </div>
                  <button class="carousel-btn prev" onclick="moveCarousel('${a.id}', -1)">❮</button>
                  <button class="carousel-btn next" onclick="moveCarousel('${a.id}', 1)">❯</button>
                  <div class="carousel-indicators">
                    ${photos.map((_, index) => `
                      <span class="indicator ${index === 0 ? 'active' : ''}" onclick="goToSlide('${a.id}', ${index})"></span>
                    `).join('')}
                  </div>
                </div>` : 
                `<img src="${photos[0]}" alt="${a.nome}">`
              ) : 
              '📱'
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
    
    // Initialize carousels
    initCarousels();
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
    const photos = [auction.foto_url, auction.foto_url_2, auction.foto_url_3, auction.foto_url_4, auction.foto_url_5].filter(url => url);
    
    details.innerHTML = `
      <div class="auction-detail">
        <div class="auction-header">
          <p class="eyebrow">LEILÃO ATIVO</p>
          <h2>${auction.nome}</h2>
          <div id="countdown-${auction.id}" class="countdown"></div>
        </div>
        
        <div class="auction-image">
          ${photos.length > 0 ? 
            (photos.length > 1 ? 
              `<div class="carousel-container detail-carousel" data-auction-id="${auction.id}-detail">
                <div class="carousel-slides">
                  ${photos.map((photo, index) => `
                    <div class="carousel-slide ${index === 0 ? 'active' : ''}">
                      <img src="${photo}" alt="${auction.nome} - Foto ${index + 1}">
                    </div>
                  `).join('')}
                </div>
                <button class="carousel-btn prev" onclick="moveCarousel('${auction.id}-detail', -1)">❮</button>
                <button class="carousel-btn next" onclick="moveCarousel('${auction.id}-detail', 1)">❯</button>
                <div class="carousel-indicators">
                  ${photos.map((_, index) => `
                    <span class="indicator ${index === 0 ? 'active' : ''}" onclick="goToSlide('${auction.id}-detail', ${index})"></span>
                  `).join('')}
                </div>
              </div>` : 
              `<img src="${photos[0]}" alt="${auction.nome}">`
            ) : 
            '📱'
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
    
    // Initialize detail carousel if exists
    const detailCarousel = document.querySelector('.detail-carousel');
    if (detailCarousel && photos.length > 1) {
      const auctionId = `${auction.id}-detail`;
      carouselStates[auctionId] = { 
        currentIndex: 0, 
        totalSlides: photos.length,
        interval: null
      };
      startCarouselAutoAdvance(auctionId);
    }
    
    document.getElementById('bidForm').onsubmit = handleBidSubmit;
  } catch (error) {
    console.error('Erro ao carregar detalhes:', error);
    alert('Erro ao carregar detalhes do leilão.');
  }
}

// Handle bid submission
async function handleBidSubmit(e) {
  e.preventDefault();
  
  const bidAmount = parseFloat(document.getElementById('bidAmount').value);
  
  if (isNaN(bidAmount) || bidAmount <= 0) {
    alert('Por favor, informe um valor válido para o lance (maior que R$ 0,00).');
    return;
  }
  
  if (bidAmount < 0.01) {
    alert('O valor mínimo do lance é R$ 0,01.');
    return;
  }
  
  // Se usuário não estiver cadastrado, pede cadastro
  if (!currentUser) {
    // Abre modal de cadastro com valor do lance salvo
    document.getElementById('pendingBidAmount').value = bidAmount;
    closeModal('auctionModal');
    openRegistrationWithBid(bidAmount);
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
    
    const isDemo = result.demo || false;
    const demoWarning = isDemo ? `<p class="demo-warning">⚠️ <strong>MODO DEMONSTRAÇÃO:</strong> Pagamentos não são processados pelo PagBank. Use "Confirmar manualmente" para testar.</p>` : '';
    
    pixContent.innerHTML = `
      <button class="modal-close" id="closePixModal">✕</button>
      <p class="eyebrow">PAGAMENTO PIX</p>
      <h2>Pague seu lance via Pix</h2>
      ${demoWarning}
      <div class="qr-code-container">
        ${result.qrCodeImage ? `<img src="${result.qrCodeImage}" alt="QR Code Pix" class="qr-code-image">` : ''}
      </div>
      <div class="pix-code" id="pixCode">${result.copyPasteCode || 'Carregando...'}</div>
      <p>Valor do lance: <strong id="pixAmount">${money(bidAmount)}</strong></p>
      <p class="warning">⚠️ Você NÃO está comprando o produto. Este é o valor do seu lance para participar do leilão.</p>
      <p class="expires">⏰ Expira em: ${new Date(result.expiresAt).toLocaleTimeString('pt-BR')}</p>
      <button class="btn primary full" id="copyPix">Copiar código Pix</button>
      ${!isDemo ? `<button class="btn ghost full" id="checkPayment">Verificar pagamento</button>` : ''}
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
  // Reset modal title and button for normal use
  const modalTitle = document.getElementById('myBidsModalTitle');
  if (modalTitle) {
    modalTitle.textContent = 'Meus Lances e Participações';
  }
  
  const submitBtn = document.getElementById('userFormSubmit');
  if (submitBtn) {
    submitBtn.textContent = 'Ver meus lances';
  }
  
  document.getElementById('myBidsModal').classList.add('show');
  document.getElementById('overlay').classList.add('show');
  
  if (currentUser) {
    loadMyBids();
  }
}

// Open registration modal with pending bid
function openRegistrationWithBid(bidAmount) {
  // Set pending bid amount
  if (!document.getElementById('pendingBidAmount')) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.id = 'pendingBidAmount';
    input.value = bidAmount;
    document.body.appendChild(input);
  } else {
    document.getElementById('pendingBidAmount').value = bidAmount;
  }
  
  // Change modal title to indicate registration
  const modalTitle = document.getElementById('myBidsModalTitle');
  if (modalTitle) {
    modalTitle.textContent = 'Cadastre-se para continuar';
  }
  
  // Change button text
  const submitBtn = document.getElementById('userFormSubmit');
  if (submitBtn) {
    submitBtn.textContent = 'Cadastrar e continuar';
  }
  
  // Show user form
  document.getElementById('myBidsModal').classList.add('show');
  document.getElementById('overlay').classList.add('show');
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
    
    // Check if there's a pending bid
    const pendingBidInput = document.getElementById('pendingBidAmount');
    const pendingBidAmount = pendingBidInput?.value;
    
    if (pendingBidAmount && currentAuctionId) {
      // Remove pending bid input
      if (pendingBidInput) {
        pendingBidInput.remove();
      }
      
      // Close registration modal
      closeModal('myBidsModal');
      
      // Show loading message
      alert('✅ Cadastro realizado! Agora vamos processar seu lance...');
      
      // Reopen auction modal and submit the bid
      openAuction(currentAuctionId);
      
      // Wait a moment for the modal to load, then submit the bid
      setTimeout(() => {
        const bidInput = document.getElementById('bidAmount');
        if (bidInput) {
          bidInput.value = pendingBidAmount;
          // Auto-submit the form
          const bidForm = document.getElementById('bidForm');
          if (bidForm) {
            handleBidSubmit({ preventDefault: () => {} });
          }
        }
      }, 500);
    } else {
      // Just load bids if no pending bid
      loadMyBids();
    }
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
