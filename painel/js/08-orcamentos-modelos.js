/* =========================================================
   ORÇAMENTOS
   ========================================================= */
let orcamentoEditId = null;

function abrirFormOrcamento(id){
  if(clientesAtivos().length === 0){
    alert('Cadastre pelo menos um cliente antes de criar um orçamento.');
    mostrarAba('clientes');
    return;
  }
  orcamentoEditId = id || null;
  const o = id ? state.orcamentos.find(x => x.id === id) : null;
  atualizarSelectsClientes();
  document.getElementById('foCliente').value = o ? o.clienteId : '';
  document.getElementById('foData').value = o ? fmtDataExibir(o.data) : hojeStr();
  document.getElementById('foValidade').value = o ? o.validadeDias : '7';
  document.getElementById('foStatus').value = o ? o.status : 'Pendente';
  document.getElementById('foFrete').value = o ? fmtMoeda(o.frete) : '0,00';
  document.getElementById('foDesconto').value = o ? fmtMoeda(o.desconto) : '0,00';
  document.getElementById('foObs').value = o ? o.obs : 'Produção iniciada após aprovação da arte.\nObrigado pela preferência!';
  const condicoesFixas = ['À vista', '50% no pedido e 50% na entrega', '100% na entrega'];
  const condSalva = o ? (o.condicaoPagamento || 'À vista') : 'À vista';
  if(condicoesFixas.includes(condSalva)){
    document.getElementById('foCondicaoPagamento').value = condSalva;
    document.getElementById('foCondicaoOutro').value = '';
  } else {
    document.getElementById('foCondicaoPagamento').value = 'outro';
    document.getElementById('foCondicaoOutro').value = condSalva;
  }
  alternarCondicaoOutro();
  const formasSalvas = o ? (o.formasPagamento || []) : [];
  document.querySelectorAll('.fo-forma-pag').forEach(chk => { chk.checked = formasSalvas.includes(chk.value); });
  document.getElementById('corpoItensOrc').innerHTML = '';
  if(o && o.itens.length){
    o.itens.forEach(it => adicionarItemOrc(it));
  } else {
    adicionarItemOrc();
  }
  document.getElementById('formOrcamentoTitulo').textContent = id ? ('Editar orçamento nº ' + o.numero) : 'Novo orçamento';
  document.getElementById('formOrcamentoWrap').classList.remove('hidden');
  atualizarTotalOrc();
}
function fecharFormOrcamento(){
  document.getElementById('formOrcamentoWrap').classList.add('hidden');
  orcamentoEditId = null;
}
function alternarCondicaoOutro(){
  const sel = document.getElementById('foCondicaoPagamento');
  const outro = document.getElementById('foCondicaoOutro');
  if(sel.value === 'outro'){ outro.classList.remove('hidden'); } else { outro.classList.add('hidden'); }
}
function opcoesProdutosHtml(selecionadoId){
  let html = '<option value="">Outro (digitar manualmente)</option>';
  let lista = produtosAtivos();
  // Se o item já usava um produto que depois foi pra lixeira, mantém ele na lista
  // (só pra essa seleção) pra não perder a referência ao editar o orçamento.
  if(selecionadoId && !lista.some(p => p.id === selecionadoId)){
    const trashed = state.produtos.find(p => p.id === selecionadoId);
    if(trashed) lista = lista.concat([trashed]);
  }
  lista.forEach(p => {
    html += `<option value="${p.id}" ${p.id === selecionadoId ? 'selected' : ''}>${esc(p.codigo)} - ${esc(p.nome)}</option>`;
  });
  return html;
}
function adicionarItemOrc(item){
  const tr = document.createElement('tr');
  const produtoId = item ? item.produtoId : '';
  const cod = item ? (item.cod || '') : '';
  const desc = item ? item.descricao : '';
  const qtd = item ? item.qtd : 1;
  const valorUnit = item ? fmtMoeda(item.valorUnit) : '0,00';
  const custoUnit = item ? fmtMoeda(item.custoUnit || 0) : '0,00';
  tr.innerHTML = `
    <td class="cod-cell"><input class="it-cod" value="${esc(cod)}" readonly></td>
    <td>
      <select class="it-produto" onchange="preencherItemDoProduto(this)">${opcoesProdutosHtml(produtoId)}</select>
      <input class="it-desc" style="margin-top:4px;" value="${esc(desc)}" placeholder="Descrição">
    </td>
    <td class="qtd-col"><input class="it-qtd" value="${qtd}" oninput="atualizarTotalOrc()"></td>
    <td class="valor-col"><input class="it-valor" value="${valorUnit}" oninput="atualizarTotalOrc()"></td>
    <td class="custo-col"><input class="it-custo" value="${custoUnit}" oninput="atualizarTotalOrc()" title="Custo unitário (não aparece no orçamento impresso)"></td>
    <td class="total-item">R$ 0,00</td>
    <td class="acoes-col">
      <button type="button" class="salvar-modelo" onclick="salvarItemComoModelo(this)" title="Salvar como modelo">💾</button>
      <button type="button" class="del" onclick="this.closest('tr').remove(); atualizarTotalOrc();" title="Remover">✕</button>
    </td>
  `;
  document.getElementById('corpoItensOrc').appendChild(tr);
  if(produtoId){
    const opt = tr.querySelector('.it-produto');
    opt.value = produtoId;
  }
  atualizarTotalOrc();
}
function preencherItemDoProduto(select){
  const tr = select.closest('tr');
  const produto = state.produtos.find(p => p.id === select.value);
  if(produto){
    tr.querySelector('.it-cod').value = produto.codigo;
    tr.querySelector('.it-desc').value = produto.nome;
    tr.querySelector('.it-valor').value = fmtMoeda(produto.preco);
    tr.querySelector('.it-custo').value = fmtMoeda(produto.precoCusto || 0);
  } else {
    tr.querySelector('.it-cod').value = '';
  }
  atualizarTotalOrc();
}
function atualizarTotalOrc(){
  let soma = 0;
  let somaCusto = 0;
  document.querySelectorAll('#corpoItensOrc tr').forEach(tr => {
    const qtd = parseFloat((tr.querySelector('.it-qtd').value || '0').replace(',', '.')) || 0;
    const valorUnit = parseMoeda(tr.querySelector('.it-valor').value);
    const custoUnit = parseMoeda(tr.querySelector('.it-custo').value);
    const total = qtd * valorUnit;
    tr.querySelector('.total-item').textContent = 'R$ ' + fmtMoeda(total);
    soma += total;
    somaCusto += qtd * custoUnit;
  });
  const frete = parseMoeda(document.getElementById('foFrete').value);
  const desconto = parseMoeda(document.getElementById('foDesconto').value);
  const totalGeral = soma + frete - desconto;
  document.getElementById('foTotalGeral').textContent = 'R$ ' + fmtMoeda(totalGeral);

  const lucro = totalGeral - somaCusto;
  const margemPct = totalGeral > 0 ? (lucro / totalGeral) * 100 : 0;
  const elCusto = document.getElementById('foCustoTotal');
  const elLucro = document.getElementById('foLucroTotal');
  const elMargem = document.getElementById('foMargemPct');
  if(elCusto){
    elCusto.textContent = 'R$ ' + fmtMoeda(somaCusto);
    elLucro.textContent = 'R$ ' + fmtMoeda(lucro);
    elLucro.parentElement.classList.toggle('negativo', lucro < 0);
    elMargem.textContent = margemPct.toFixed(1).replace('.', ',') + '%';
  }
  return totalGeral;
}

/* =========================================================
   MODELOS DE ITENS (itens reutilizáveis pro orçamento)
   ========================================================= */
function abrirModelos(){
  document.getElementById('modelosWrap').classList.remove('hidden');
  document.getElementById('formNovoModelo').reset();
  renderModelosLista();
}
function fecharModelos(){
  document.getElementById('modelosWrap').classList.add('hidden');
}
function renderModelosLista(){
  const ul = document.getElementById('modelosLista');
  const lista = modelosAtivos();
  if(!lista.length){
    ul.innerHTML = '<li>Nenhum modelo salvo ainda.</li>';
    return;
  }
  ul.innerHTML = lista.map(m => `
    <li onclick="usarModelo('${m.id}')">
      <div class="m-info"><b>${esc(m.descricao)}</b><small>R$ ${fmtMoeda(m.valorUnit)}${m.custoUnit ? ' · custo R$ ' + fmtMoeda(m.custoUnit) : ''}</small></div>
      <button type="button" onclick="event.stopPropagation(); removerModelo('${m.id}')" title="Excluir modelo">✕</button>
    </li>
  `).join('');
}
function usarModelo(id){
  const m = (state.modelosItens || []).find(x => x.id === id);
  if(!m) return;
  adicionarItemOrc({ produtoId: null, cod: '', descricao: m.descricao, qtd: 1, valorUnit: m.valorUnit, custoUnit: m.custoUnit || 0 });
  fecharModelos();
}
function salvarNovoModelo(ev){
  ev.preventDefault();
  const descricao = document.getElementById('modeloDescricao').value.trim();
  if(!descricao) return false;
  const valorUnit = parseMoeda(document.getElementById('modeloValorUnit').value);
  const custoUnit = parseMoeda(document.getElementById('modeloCustoUnit').value);
  if(!state.modelosItens) state.modelosItens = [];
  state.modelosItens.push({ id: uid('modeloItem'), descricao, valorUnit, custoUnit });
  marcarAlterado();
  document.getElementById('formNovoModelo').reset();
  renderModelosLista();
  return false;
}
function removerModelo(id){
  if(!confirm('Excluir este modelo de item?\n\nVai pra Lixeira — dá pra restaurar por 30 dias.')) return;
  const m = (state.modelosItens || []).find(x => x.id === id);
  if(m) moverParaLixeira(m);
  marcarAlterado();
  renderModelosLista();
}
// Botão 💾 em cada linha de item: salva a descrição/valor/custo atuais como um novo modelo.
function salvarItemComoModelo(btn){
  const tr = btn.closest('tr');
  const descricao = tr.querySelector('.it-desc').value.trim();
  if(!descricao){ alert('Preencha a descrição do item antes de salvar como modelo.'); return; }
  const valorUnit = parseMoeda(tr.querySelector('.it-valor').value);
  const custoUnit = parseMoeda(tr.querySelector('.it-custo').value);
  if(!state.modelosItens) state.modelosItens = [];
  state.modelosItens.push({ id: uid('modeloItem'), descricao, valorUnit, custoUnit });
  marcarAlterado();
  btn.textContent = '✅';
  setTimeout(() => { btn.textContent = '💾'; }, 1200);
}
function salvarOrcamento(){
  const clienteId = document.getElementById('foCliente').value;
  if(!clienteId){ alert('Selecione o cliente.'); return; }
  const linhas = Array.from(document.querySelectorAll('#corpoItensOrc tr'));
  if(linhas.length === 0){ alert('Adicione pelo menos um item.'); return; }
  const itens = linhas.map(tr => ({
    produtoId: tr.querySelector('.it-produto').value || null,
    cod: tr.querySelector('.it-cod').value.trim(),
    descricao: tr.querySelector('.it-desc').value.trim(),
    qtd: parseFloat((tr.querySelector('.it-qtd').value || '0').replace(',', '.')) || 0,
    valorUnit: parseMoeda(tr.querySelector('.it-valor').value),
    custoUnit: parseMoeda(tr.querySelector('.it-custo').value)
  })).filter(it => it.descricao);
  if(itens.length === 0){ alert('Preencha a descrição de pelo menos um item.'); return; }

  const condSel = document.getElementById('foCondicaoPagamento').value;
  let condicaoPagamento;
  if(condSel === 'outro'){
    condicaoPagamento = document.getElementById('foCondicaoOutro').value.trim();
    if(!condicaoPagamento){ alert('Digite a condição de pagamento combinada.'); return; }
  } else {
    condicaoPagamento = condSel;
  }
  const formasPagamento = Array.from(document.querySelectorAll('.fo-forma-pag:checked')).map(c => c.value);

  const total = atualizarTotalOrc();
  const dados = {
    clienteId,
    data: document.getElementById('foData').value.trim() || hojeStr(),
    validadeDias: document.getElementById('foValidade').value.trim() || '7',
    status: document.getElementById('foStatus').value,
    itens,
    frete: parseMoeda(document.getElementById('foFrete').value),
    desconto: parseMoeda(document.getElementById('foDesconto').value),
    obs: document.getElementById('foObs').value,
    condicaoPagamento,
    formasPagamento,
    total
  };

  let orc;
  if(orcamentoEditId){
    orc = state.orcamentos.find(x => x.id === orcamentoEditId);
    Object.assign(orc, dados);
  } else {
    dados.id = uid('orcamento');
    dados.numero = String(state.proximoNumero).padStart(4,'0');
    dados.financeiroGerado = false;
    dados.estoqueBaixado = false;
    state.proximoNumero++;
    state.orcamentos.push(dados);
    orc = dados;
  }
  confirmarVendaSeNecessario(orc);
  sincronizarFinanceiroComOrcamento(orc);
  marcarAlterado();
  fecharFormOrcamento();
  renderOrcamentos();
  renderProdutos();
  renderFinanceiro();
  document.getElementById('proximoNumeroLabel').textContent = String(state.proximoNumero).padStart(4,'0');
}
// Considera a venda "confirmada" quando o orçamento está Aprovado ou Concluído (mesmo
// critério já usado nos relatórios e no cálculo de lucro do mês). Na primeira vez que
// isso acontece, dá baixa no estoque dos produtos vinculados aos itens — a flag
// "estoqueBaixado" evita descontar de novo se o orçamento for salvo outras vezes
// (ex.: editar uma observação depois de já Aprovado).
function confirmarVendaSeNecessario(o){
  if(o.estoqueBaixado) return;
  if(o.status === 'Aprovado' || o.status === 'Concluído'){
    baixarEstoqueOrcamento(o);
    o.estoqueBaixado = true;
  }
}
function excluirOrcamento(id){
  if(!confirm('Excluir este orçamento?\n\nVai pra Lixeira — dá pra restaurar por 30 dias.')) return;
  const o = state.orcamentos.find(x => x.id === id);
  if(o) moverParaLixeira(o);
  marcarAlterado();
  renderOrcamentos();
}
function nomeCliente(clienteId){
  const c = state.clientes.find(x => x.id === clienteId);
  return c ? c.nome : '(cliente removido)';
}
function badgeStatusOrc(status){
  const map = {'Pendente':'pendente','Aprovado':'aprovado','Recusado':'recusado','Concluído':'concluido'};
  return `<span class="badge ${map[status]||'pendente'}">${esc(status)}</span>`;
}
function renderOrcamentos(){
  const filtro = document.getElementById('filtroStatusOrc').value;
  const tbody = document.getElementById('corpoTabelaOrcamentos');
  tbody.innerHTML = '';
  const lista = orcamentosAtivos().filter(o => !filtro || o.status === filtro).slice().reverse();
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum orçamento encontrado.</td></tr>';
  }
  lista.forEach(o => {
    const tr = document.createElement('tr');
    const podeGerarConta = o.status === 'Aprovado' && !o.financeiroGerado;
    tr.innerHTML = `<td>${esc(o.numero)}</td><td>${fmtDataExibir(o.data)}</td><td>${esc(nomeCliente(o.clienteId))}</td><td>R$ ${fmtMoeda(o.total)}</td><td>${badgeStatusOrc(o.status)}</td>
      <td class="acoes">
        ${podeGerarConta ? `<button class="btn-icon" onclick="gerarContaReceber('${o.id}')" title="Gerar conta a receber">R$+</button>` : ''}
        <button class="btn-icon" onclick="imprimirOrcamento('${o.id}')" title="Imprimir / PDF">🖨</button>
        <button class="btn-icon" onclick="enviarOrcamentoWhatsApp('${o.id}')" title="Enviar por WhatsApp">📲</button>
        <button class="btn-icon" onclick="abrirFormOrcamento('${o.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirOrcamento('${o.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
}
function gerarContaReceber(orcId){
  const o = state.orcamentos.find(x => x.id === orcId);
  if(!o || o.financeiroGerado) return;
  state.financeiro.push({
    id: uid('financeiro'),
    tipo: 'receber',
    descricao: 'Orçamento nº ' + o.numero + ' - ' + nomeCliente(o.clienteId),
    valor: o.total,
    vencimento: somarDias(o.data, o.validadeDias) || fmtDataExibir(o.data),
    categoria: 'Orçamento',
    clienteId: o.clienteId,
    orcamentoId: o.id,
    status: 'pendente'
  });
  o.financeiroGerado = true;
  const jaTinhaBaixado = o.estoqueBaixado;
  confirmarVendaSeNecessario(o);
  marcarAlterado();
  renderOrcamentos();
  renderFinanceiro();
  renderProdutos();
  const avisoEstoque = (!jaTinhaBaixado && o.estoqueBaixado) ? '\n\nBaixa de estoque feita automaticamente para os produtos desse orçamento.' : '';
  alert('Conta a receber gerada no Financeiro para o orçamento nº ' + o.numero + '.' + avisoEstoque);
}

