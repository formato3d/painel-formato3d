/* =========================================================
   PRODUTOS
   ========================================================= */
let produtoEditId = null;
let fpFotoDataUrl = null;

function abrirFormProduto(id){
  produtoEditId = id || null;
  const p = id ? state.produtos.find(x => x.id === id) : {};
  document.getElementById('fpCodigo').value = id ? (p.codigo || '') : proximoCodigoProduto();
  document.getElementById('fpNome').value = p.nome || '';
  document.getElementById('fpCategoria').value = p.categoria || '';
  document.getElementById('fpPrecoCusto').value = p.precoCusto !== undefined ? fmtMoeda(p.precoCusto) : '';
  document.getElementById('fpPreco').value = p.preco !== undefined ? fmtMoeda(p.preco) : '0,00';
  document.getElementById('fpQuantidade').value = p.quantidade !== undefined ? p.quantidade : '';
  document.getElementById('fpAlertaEstoque').value = p.alertaEstoqueBaixo !== undefined ? p.alertaEstoqueBaixo : 5;
  document.getElementById('fpUnidade').value = p.unidade || 'un';
  document.getElementById('fpPeso').value = p.peso !== undefined && p.peso !== '' ? p.peso : '';
  document.getElementById('fpDescricao').value = p.descricao || '';
  document.getElementById('fpFoto').value = '';
  fpFotoDataUrl = p.foto || null;
  if(fpFotoDataUrl){
    document.getElementById('fpFotoPreview').src = fpFotoDataUrl;
    document.getElementById('fpFotoPreviewWrap').classList.remove('hidden');
    document.getElementById('fpFotoUpload').classList.add('hidden');
  } else {
    document.getElementById('fpFotoPreviewWrap').classList.add('hidden');
    document.getElementById('fpFotoUpload').classList.remove('hidden');
  }
  document.getElementById('formProdutoTitulo').textContent = id ? 'Editar produto' : 'Novo produto no estoque';
  document.getElementById('fpBtnSalvarProduto').textContent = id ? 'Salvar alterações' : 'Criar produto';
  document.getElementById('formProdutoWrap').classList.remove('hidden');
  document.getElementById('fpNome').focus();
}
function fecharFormProduto(){
  document.getElementById('formProdutoWrap').classList.add('hidden');
  produtoEditId = null;
}
function processarFotoProduto(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)){
    alert('Envie uma imagem em JPG, PNG ou WEBP.');
    input.value = '';
    return;
  }
  if(file.size > 5 * 1024 * 1024){
    alert('A imagem deve ter até 5MB.');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e){
    const img = new Image();
    img.onload = function(){
      comprimirImagemProduto(img, function(dataUrl){
        fpFotoDataUrl = dataUrl;
        document.getElementById('fpFotoPreview').src = dataUrl;
        document.getElementById('fpFotoPreviewWrap').classList.remove('hidden');
        document.getElementById('fpFotoUpload').classList.add('hidden');
      });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function comprimirImagemProduto(img, callback){
  const w = img.width, h = img.height;
  function gerar(maxDim, quality){
    let ww = w, hh = h;
    if(ww > hh && ww > maxDim){ hh = Math.round(hh * maxDim / ww); ww = maxDim; }
    else if(hh > maxDim){ ww = Math.round(ww * maxDim / hh); hh = maxDim; }
    const canvas = document.createElement('canvas');
    canvas.width = ww; canvas.height = hh;
    canvas.getContext('2d').drawImage(img, 0, 0, ww, hh);
    return canvas.toDataURL('image/jpeg', quality);
  }
  let maxDim = 480, quality = 0.75, tentativas = 0;
  let dataUrl = gerar(maxDim, quality);
  while(dataUrl.length > 45000 && tentativas < 8){
    if(quality > 0.35){ quality -= 0.1; } else { maxDim = Math.round(maxDim * 0.8); }
    dataUrl = gerar(maxDim, quality);
    tentativas++;
  }
  callback(dataUrl);
}
function removerFotoProduto(){
  fpFotoDataUrl = null;
  document.getElementById('fpFoto').value = '';
  document.getElementById('fpFotoPreviewWrap').classList.add('hidden');
  document.getElementById('fpFotoUpload').classList.remove('hidden');
}
function salvarProduto(){
  const nome = document.getElementById('fpNome').value.trim();
  if(!nome){ alert('Informe o nome do produto.'); return; }
  const dados = {
    codigo: document.getElementById('fpCodigo').value.trim() || proximoCodigoProduto(),
    nome,
    categoria: document.getElementById('fpCategoria').value,
    precoCusto: parseMoeda(document.getElementById('fpPrecoCusto').value),
    preco: parseMoeda(document.getElementById('fpPreco').value),
    quantidade: parseInt(document.getElementById('fpQuantidade').value, 10) || 0,
    alertaEstoqueBaixo: parseInt(document.getElementById('fpAlertaEstoque').value, 10) || 5,
    unidade: document.getElementById('fpUnidade').value.trim() || 'un',
    peso: parseFloat(document.getElementById('fpPeso').value) || 0,
    foto: fpFotoDataUrl || '',
    descricao: document.getElementById('fpDescricao').value.trim()
  };
  if(produtoEditId){
    Object.assign(state.produtos.find(x => x.id === produtoEditId), dados);
  } else {
    dados.id = uid('produto');
    state.produtos.push(dados);
  }
  marcarAlterado();
  fecharFormProduto();
  renderProdutos();
}
function excluirProduto(id){
  if(!confirm('Excluir este produto/serviço?\n\nVai pra Lixeira — dá pra restaurar por 30 dias.')) return;
  const p = state.produtos.find(x => x.id === id);
  if(p) moverParaLixeira(p);
  marcarAlterado();
  renderProdutos();
}
function renderProdutos(){
  const busca = (document.getElementById('buscaProduto').value || '').toLowerCase();
  const tbody = document.getElementById('corpoTabelaProdutos');
  tbody.innerHTML = '';
  const lista = produtosAtivos().filter(p =>
    !busca || p.nome.toLowerCase().includes(busca) || (p.codigo||'').toLowerCase().includes(busca) || (p.categoria||'').toLowerCase().includes(busca)
  );
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhum produto cadastrado ainda.</td></tr>';
  }
  lista.forEach(p => {
    const tr = document.createElement('tr');
    const temEstoque = p.quantidade !== undefined && p.quantidade !== '';
    const qtd = temEstoque ? Number(p.quantidade) : null;
    const alerta = p.alertaEstoqueBaixo !== undefined && p.alertaEstoqueBaixo !== '' ? Number(p.alertaEstoqueBaixo) : 5;
    const baixo = qtd !== null && qtd <= alerta;
    const foto = p.foto
      ? `<img src="${p.foto}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--line);">`
      : `<div class="placeholder-thumb"></div>`;
    tr.innerHTML = `<td>${foto}</td><td>${esc(p.codigo)}</td><td>${esc(p.nome)}</td><td>${esc(p.categoria || '—')}</td>
      <td>R$ ${fmtMoeda(p.precoCusto)}</td><td>R$ ${fmtMoeda(p.preco)}</td>
      <td>${qtd === null ? '—' : `<span class="badge ${baixo ? 'estoque-baixo' : 'estoque-ok'}">${qtd}</span>`}</td>
      <td class="acoes">
        <button class="btn-icon" onclick="abrirFormProduto('${p.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirProduto('${p.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('contagemProdutos').textContent = produtosAtivos().length;
}

