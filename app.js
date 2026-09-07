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
function startCarouselAutoAdvance(auctionId) {
  if (carouselStates[auctionId]?.interval) {
    clearInterval(carouselStates[auctionId].interval);
  }
  carouselStates[auctionId] = carouselStates[auctionId] || {};
  carouselStates[auctionId].interval = setInterval(() => {
    moveCarousel(auctionId, 1);
  }, 3000);
}
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
              ) : '📱'
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
    auctions.forEach(a => {
      updateCountdown(a.data_fim, `countdown-${a.id}`);
    });
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
              </div>` : `<img src="${photos[0]}" alt="${auction.nome}">`)
            : '📱'
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
    if (document.querySelector('.detail-carousel') && photos.length > 1) {
      carouselStates[`${auction.id}-detail`] = { currentIndex: 0, totalSlides: photos.length, interval: null };
      startCarouselAutoAdvance(`${auction.id}-detail`);
    }
    document.getElementById('bidForm').onsubmit = handleBidSubmit;
  } catch (error) {
    console.error('Erro ao carregar detalhes:', error);
    alert('Erro ao carregar detalhes do leilão.');
  }
}

// ✅ FUNÇÃO ENVIAR LANCE — COM DEBUG CORRIGIDO
async function handleBidSubmit(e) {
  e.preventDefault();
  const bidAmount = parseFloat(document.getElementById('bidAmount').value);

  // VALIDAÇÃO ANTES DE TUDO
  if (isNaN(bidAmount) || bidAmount < 0.01) {
    alert('Por favor, informe um valor válido. Mínimo: R$ 0,01');
    return;
  }

  if (!currentUser) {
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

    // ✅ MOSTRA ERRO REAL DO SERVIDOR
    const text = await response.text();
    console.log('📡 Resposta bruta do servidor:', text);

    try {
      const result = JSON.parse(text);
      if (result.error) {
        alert(result.error);
        return;
      }
      currentBidId = result.lanceId;
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
      document.getElementById('closePixModal').onclick = () => closeModal('pixModal');
      document.getElementById('copyPix').onclick = copyPixCode;
      if (!isDemo) document.getElementById('checkPayment').onclick = checkPaymentStatus;
      document.getElementById('confirmPix').onclick = confirmPixPayment;
      startPaymentCheck();
    } catch (parseErr) {
      alert(`❌ Erro ${response.status}\n\nServidor retornou:\n${text.substring(0,500)}`);
    }
  } catch (netErr) {
    alert('❌ Sem conexão com o servidor.');
    console.error(netErr);
  }
}

let paymentCheckInterval = null;
async function copyPixCode() {
  const pixCode = document.getElementById('pixCode').textContent;
  try { await navigator.clipboard.writeText(pixCode); alert('Código Pix copiado!'); }
  catch { alert('Copie o código Pix manualmente.'); }
}
async function checkPaymentStatus() {
  if (!currentBidId) return;
  try {
    const res = await fetch(`${API_BASE}/lances/${currentBidId}/check-payment`);
    const r = await res.json();
    if (r.status === 'confirmado') {
      stopPaymentCheck();
      alert('✓ Pagamento confirmado!');
      closeModal('pixModal');
      if (currentAuctionId) openAuction(currentAuctionId);
    } else {
      alert(`Status: ${r.status}. Ainda não confirmado.`);
    }
  } catch(e) { console.error(e); }
}
function startPaymentCheck() {
  stopPaymentCheck();
  paymentCheckInterval = setInterval(async () => {
    if (!currentBidId) return stopPaymentCheck();
    try {
      const r = await fetch(`${API_BASE}/lances/${currentBidId}/check-payment`).then(x => x.json());
      if (r.status === 'confirmado') {
        stopPaymentCheck();
        alert('✓ Pagamento confirmado!');
        closeModal('pixModal');
        if (currentAuctionId) openAuction(currentAuctionId);
      }
    } catch(e) {}
  }, 10000);
}
function stopPaymentCheck() {
  if (paymentCheckInterval) { clearInterval(paymentCheckInterval); paymentCheckInterval = null; }
}
async function confirmPixPayment() {
  if (!currentBidId) return alert('Nenhum lance.');
  stopPaymentCheck();
  try {
    const r = await fetch(`${API_BASE}/lances/${currentBidId}/confirmar-pix`, {method:'POST'}).then(x => x.json());
    if (r.error) return alert(r.error);
    alert('✓ Confirmado!');
    closeModal('pixModal');
    if (currentAuctionId) openAuction(currentAuctionId);
  } catch(e) { alert('Erro.'); }
}
function openMyBids() {
  const t = document.getElementById('myBidsModalTitle'); if(t) t.textContent = 'Meus Lances e Participações';
  const b = document.getElementById('userFormSubmit'); if(b) b.textContent = 'Ver meus lances';
  document.getElementById('myBidsModal').classList.add('show');
  document.getElementById('overlay').classList.add('show');
  if(currentUser) loadMyBids();
}
function openRegistrationWithBid(bidAmount) {
  let input = document.getElementById('pendingBidAmount');
  if(!input) { input = document.createElement('input'); input.type='hidden'; input.id='pendingBidAmount'; document.body.appendChild(input); }
  input.value = bidAmount;
  const t = document.getElementById('myBidsModalTitle'); if(t) t.textContent = 'Cadastre-se para continuar';
  const b = document.getElementById('userFormSubmit'); if(b) b.textContent = 'Cadastrar e continuar';
  document.getElementById('myBidsModal').classList.add('show');
  document.getElementById('overlay').classList.add('show');
}
async function loadMyBids() {
  if(!currentUser) return;
  try {
    const bids = await (await fetch(`${API_BASE}/usuarios/${currentUser.id}/lances`)).json();
    const c = document.getElementById('myBidsContent');
    if(!bids.length) return c.innerHTML = '<p class="no-bids">Você ainda não participou.</p>';
    c.innerHTML = `
      <div class="user-info"><p><strong>Nome:</strong> ${currentUser.nome}</p><p><strong>E-mail:</strong> ${currentUser.email}</p></div>
      <div class="bids-list">${bids.map(b => `
        <div class="bid-item">
          <div class="bid-header"><strong>${b.leilao_nome}</strong><span class="status ${b.status_pix}">${b.status_pix}</span></div>
          <div class="bid-details">
            <p>Valor do lance: <strong>${money(b.valor)}</strong></p>
            <p>Data: ${formatDate(b.criado_em)}</p>
            ${b.leilao_status === 'encerrado' 
              ? `<p class="result">${b.valor_vencedor === b.valor ? '🏆 VOCÊ VENCEU!' : '❌ Não venceu'}</p>` 
              : `<p class="time-left">Tempo restante: <span id="bid-countdown-${b.id}"></span></p>`
            }
          </div>
        </div>
      `).join('')}</div>
    `;
    bids.forEach(b => { if(b.leilao_status !== 'encerrado') updateCountdown(b.data_fim, `bid-countdown-${b.id}`); });
  } catch { document.getElementById('myBidsContent').innerHTML = '<p class="error">Erro ao carregar.</p>'; }
}
async function handleUserSubmit(e) {
  e.preventDefault();
  const nome = document.getElementById('userName').value;
  const email = document.getElementById('userEmail').value;
  const telefone = document.getElementById('userPhone').value;
  try {
    const user = await (await fetch(`${API_BASE}/usuarios`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({nome,email,telefone})
    })).json();
    if(user.error) return alert(user.error);
    currentUser = user;
    localStorage.setItem('pix30-user', JSON.stringify(user));
    const pending = document.getElementById('pendingBidAmount')?.value;
    if(pending && currentAuctionId) {
      document.getElementById('pendingBidAmount').remove();
      closeModal('myBidsModal');
      alert('✅ Cadastro feito! Enviando lance...');
      openAuction(currentAuctionId);
      const tentar = setInterval(() => {
        const inp = document.getElementById('bidAmount');
        const frm = document.getElementById('bidForm');
        if(inp && frm) {
          clearInterval(tentar);
          inp.value = pending;
          handleBidSubmit({preventDefault:()=>{}});
        }
      }, 100);
    } else loadMyBids();
  } catch { alert('Erro ao cadastrar.'); }
}
function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
  document.getElementById('overlay').classList.remove('show');
  if(modalId === 'pixModal') stopPaymentCheck();
  Object.keys(carouselStates).forEach(k => {
    if(carouselStates[k]?.interval) { clearInterval(carouselStates[k].interval); carouselStates[k].interval = null; }
  });
}
document.getElementById('openMyBids').onclick = openMyBids;
document.getElementById('closeMyBids').onclick = () => closeModal('myBidsModal');
document.getElementById('closeAuctionModal').onclick = () => closeModal('auctionModal');
document.getElementById('overlay').onclick = () => { closeModal('auctionModal'); closeModal('myBidsModal'); closeModal('pixModal'); };
document.getElementById('userForm').onsubmit = handleUserSubmit;
loadAuctions();
