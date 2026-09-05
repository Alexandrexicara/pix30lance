const fs = require('fs');
let a = fs.readFileSync('admin.html', 'utf8');

a = a.replace('async function createAuction() {', 
  'async function createAuction() {\n  alert("Enviando dados... Aguarde!");');

a = a.replace(/alert\("Erro vídeo.*?return;/g, 
  'console.log("Sem vídeo, continuando..."); finalVideoUrl = null;');

a = a.replace('console.log("Leilão criado:", leilao);', 
  'console.log("Leilão criado:", leilao);\n    alert("Leilão criado com sucesso!");');

fs.writeFileSync('admin.html', a);
console.log('ALTERADO!');
