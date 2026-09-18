/* =========================================================
   COMPRAS
   Registro de compras/gastos já realizados (materiais, insumos, manutenção,
   frete, etc.) — diferente do Financeiro "A pagar" (que é uma conta AINDA a
   pagar, com status pendente/pago), toda Compra cadastrada aqui já é um
   gasto que de fato saiu da conta da empresa. É essa peça que faltava pro
   "Saldo real" bater com o saldo de verdade do banco (ver saldoRealCaixa em
   10-financeiro.js) — antes, compras já feitas não apareciam em lugar
   nenhum do painel e "sumiam" do saldo sem explicação.
   ========================================================= */
let compraEditId = null;
// Comprovante da compra sendo criada/editada agora: { url, nome } depois de enviado
// pro Drive, ou null se não tem anexo.
let cpAnexo = null;

function atualizarPreviewAnexoCompra(){
  const uploadEl = document.getElementById('cpAnexoUpload');
  const previewEl = document.getElementById('cpAnexoPreviewWrap');
  if(cpAnexo && cpAnexo.url){
    document.getElementById('cpAnexoLink').href = cpAnexo.url;
    document.getElementById('cpAnexoNome').textContent = cpAnexo.nome || 'arquivo';
    previewEl.classList.remove('hidden');
    uploadEl.classList.add('hidden');
  } else {
    previewEl.classList.add('hidden');
    uploadEl.classList.remove('hidden');
  }
}
function removerAnexoCompra(){
  cpAnexo = null;
  const input = document.getElementById('cpAnexo');
  if(input) input.value = '';
  atualizarPreviewAnexoCompra();
}
// Envia o comprovante assim que a pessoa escolhe o arquivo — reaproveita a mesma ação
// genérica do backend já usada pelos anexos do Financeiro (uploadAnexoFinanceiro só
// guarda o arquivo no Drive e devolve o link; não é específica de nenhum tipo de dado).
function processarAnexoCompra(input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!/^(application\/pdf|image\/(png|jpeg|webp))$/.test(file.type)){
    alert('Envie um arquivo em PDF, JPG, PNG ou WEBP.');
    input.value = '';
    return;
  }
  if(file.size > 8 * 1024 * 1024){
    alert('O arquivo deve ter até 8MB.');
    input.value = '';
    return;
  }
  const txtEl = document.querySelector('#cpAnexoUpload .ph-txt');
  const txtOriginal = txtEl.innerHTML;
  txtEl.innerHTML = '<b>Enviando...</b>';
  const reader = new FileReader();
  reader.onload = function(e){
    const base64 = String(e.target.result).split(',')[1] || '';
    fetch(CONFIG.URL_API, {
      method: 'POST',
      body: JSON.stringify({
        token: CONFIG.TOKEN,
        sessao: sessaoAtual(),
        action: 'uploadAnexoFinanceiro',
        nomeArquivo: file.name,
        mimeType: file.type,
        conteudoBase64: base64
      })
    })
      .then(r => r.json())
      .then(resp => {
        txtEl.innerHTML = txtOriginal;
        if(sessaoInvalida(resp.erro)){ voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
        if(resp.erro){ alert('Não foi possível enviar o arquivo: ' + resp.erro); input.value = ''; return; }
        cpAnexo = { url: resp.url, nome: resp.nome || file.name };
        atualizarPreviewAnexoCompra();
      })
      .catch(err => {
        txtEl.innerHTML = txtOriginal;
        alert('Não foi possível enviar o arquivo agora — verifique sua internet.');
        input.value = '';
        console.error(err);
      });
  };
  reader.readAsDataURL(file);
}

function abrirFormCompra(id){
  compraEditId = id || null;
  const c = id ? state.compras.find(x => x.id === id) : {};
  document.getElementById('cpDescricao').value = c.descricao || '';
  document.getElementById('cpFornecedor').value = c.fornecedor || '';
  document.getElementById('cpCategoria').value = c.categoria || '';
  document.getElementById('cpValor').value = c.valor !== undefined ? fmtMoeda(c.valor) : '0,00';
  document.getElementById('cpData').value = c.data ? fmtDataExibir(c.data) : hojeStr();
  document.getElementById('cpFormaPagamento').value = c.formaPagamento || 'Pix';
  document.getElementById('cpObs').value = c.obs || '';
  document.getElementById('cpAnexo').value = '';
  cpAnexo = c.comprovanteUrl ? { url: c.comprovanteUrl, nome: c.comprovanteNome || 'comprovante' } : null;
  atualizarPreviewAnexoCompra();
  document.getElementById('formCompraTitulo').textContent = id ? 'Editar compra' : 'Nova compra';
  document.getElementById('formCompraWrap').classList.remove('hidden');
  document.getElementById('cpDescricao').focus();
}
function fecharFormCompra(){
  document.getElementById('formCompraWrap').classList.add('hidden');
  compraEditId = null;
}
function salvarCompra(){
  const descricao = document.getElementById('cpDescricao').value.trim();
  if(!descricao){ alert('Informe a descrição.'); return; }
  const valor = parseMoeda(document.getElementById('cpValor').value);
  if(!valor){ alert('Informe o valor da compra.'); return; }
  const data = document.getElementById('cpData').value.trim();
  if(!paraDataObj(data)){ alert('Informe uma data válida (dd/mm/aaaa).'); return; }
  const dados = {
    descricao,
    fornecedor: document.getElementById('cpFornecedor').value.trim(),
    categoria: document.getElementById('cpCategoria').value.trim(),
    valor,
    data,
    formaPagamento: document.getElementById('cpFormaPagamento').value,
    obs: document.getElementById('cpObs').value.trim(),
    comprovanteUrl: cpAnexo ? cpAnexo.url : '',
    comprovanteNome: cpAnexo ? cpAnexo.nome : ''
  };
  if(compraEditId){
    Object.assign(state.compras.find(x => x.id === compraEditId), dados);
  } else {
    dados.id = uid('compra');
    state.compras.push(dados);
  }
  marcarAlterado();
  fecharFormCompra();
  renderCompras();
}
function excluirCompra(id){
  if(!confirm('Excluir esta compra?\n\nVai pra Lixeira — dá pra restaurar por 30 dias.')) return;
  const c = state.compras.find(x => x.id === id);
  if(c) moverParaLixeira(c);
  marcarAlterado();
  renderCompras();
}

// "YYYY-MM" a partir da data de uma compra — mesma ideia de chaveMesFinanceiro (ver
// 10-financeiro.js), só que aqui em cima do campo "data" das compras (o financeiro usa
// "vencimento").
function chaveMesCompra(c){
  const d = paraDataObj(c.data);
  return d ? (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')) : null;
}
function mesesDisponiveisCompras(){
  const hoje = new Date();
  const chaves = new Set([hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0')]);
  comprasAtivos().forEach(c => { const k = chaveMesCompra(c); if(k) chaves.add(k); });
  return [...chaves].sort();
}
// Reconstrói as opções do filtro de mês das compras, preservando a seleção atual se ela
// ainda existir — mesmo padrão de preencherFiltroMesFin.
function preencherFiltroMesCompras(){
  const sel = document.getElementById('filtroMesCompras');
  if(!sel) return;
  const atual = sel.value;
  const chaves = mesesDisponiveisCompras();
  sel.innerHTML = '<option value="">Todos os meses</option>' + chaves.map(c => `<option value="${c}">${rotuloMesFinanceiro(c)}</option>`).join('');
  if(chaves.includes(atual)) sel.value = atual;
}
// Lista que respeita o filtro de mês atual — usada tanto pra desenhar a tabela quanto
// pra exportar, igual financeiroFiltradoAtual.
function comprasFiltradoAtual(){
  const mesAno = document.getElementById('filtroMesCompras').value;
  return comprasAtivos()
    .filter(c => !mesAno || chaveMesCompra(c) === mesAno)
    .sort((a,b) => (paraDataObj(b.data) || 0) - (paraDataObj(a.data) || 0));
}
function renderCompras(){
  const tbody = document.getElementById('corpoTabelaCompras');
  // A tabela/cards de Compras só existem depois que a seção Financeiro é montada — em
  // páginas/testes que ainda não têm esse HTML, sai sem erro.
  if(!tbody) return;
  preencherFiltroMesCompras();
  tbody.innerHTML = '';
  const lista = comprasFiltradoAtual();
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhuma compra registrada.</td></tr>';
  }
  lista.forEach(c => {
    const tr = document.createElement('tr');
    const anexo = c.comprovanteUrl ? `<a href="${esc(c.comprovanteUrl)}" target="_blank" rel="noopener" title="Abrir comprovante${c.comprovanteNome ? ': ' + esc(c.comprovanteNome) : ''}">🧾</a>` : '—';
    tr.innerHTML = `
      <td data-label="Descrição">${esc(c.descricao)}</td>
      <td data-label="Fornecedor">${esc(c.fornecedor)}</td>
      <td data-label="Categoria">${esc(c.categoria)}</td>
      <td data-label="Data">${fmtDataExibir(c.data)}</td>
      <td data-label="Valor">R$ ${fmtMoeda(c.valor)}</td>
      <td data-label="Forma de pagamento">${esc(c.formaPagamento)}</td>
      <td class="anexos-cell" data-label="Comprovante">${anexo}</td>
      <td class="acoes">
        <button class="btn-icon" onclick="abrirFormCompra('${c.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirCompra('${c.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
  renderCardsCompras();
}
function renderCardsCompras(){
  const el = document.getElementById('cardsResumoCompras');
  if(!el) return;
  const mesAno = document.getElementById('filtroMesCompras').value;
  const rotuloPeriodo = mesAno ? rotuloMesFinanceiro(mesAno) : 'todas as datas';
  const lista = comprasFiltradoAtual();
  const total = lista.reduce((s,c) => s + (c.valor || 0), 0);
  el.innerHTML = `
    <div class="card"><div class="label">Total em compras</div><div class="value red">R$ ${fmtMoeda(total)}</div><div class="sub">${esc(rotuloPeriodo)} · ${lista.length} compra${lista.length === 1 ? '' : 's'}</div></div>
  `;
}
