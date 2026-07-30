/* =========================================================
   FINANCEIRO
   ========================================================= */
let financeiroEditId = null;

function abrirFormFinanceiro(id){
  financeiroEditId = id || null;
  const f = id ? state.financeiro.find(x => x.id === id) : {};
  atualizarSelectsClientes();
  document.getElementById('ffTipo').value = f.tipo || 'receber';
  document.getElementById('ffDescricao').value = f.descricao || '';
  document.getElementById('ffValor').value = f.valor !== undefined ? fmtMoeda(f.valor) : '0,00';
  document.getElementById('ffVencimento').value = f.vencimento ? fmtDataExibir(f.vencimento) : hojeStr();
  document.getElementById('ffCategoria').value = f.categoria || '';
  document.getElementById('ffCliente').value = f.clienteId || '';
  document.getElementById('ffStatus').value = f.status || 'pendente';
  document.getElementById('formFinanceiroTitulo').textContent = id ? 'Editar conta' : 'Nova conta';
  document.getElementById('formFinanceiroWrap').classList.remove('hidden');
  document.getElementById('ffDescricao').focus();
}
function fecharFormFinanceiro(){
  document.getElementById('formFinanceiroWrap').classList.add('hidden');
  financeiroEditId = null;
}
function salvarFinanceiro(){
  const descricao = document.getElementById('ffDescricao').value.trim();
  if(!descricao){ alert('Informe a descrição.'); return; }
  const dados = {
    tipo: document.getElementById('ffTipo').value,
    descricao,
    valor: parseMoeda(document.getElementById('ffValor').value),
    vencimento: document.getElementById('ffVencimento').value.trim(),
    categoria: document.getElementById('ffCategoria').value.trim(),
    clienteId: document.getElementById('ffCliente').value || null,
    status: document.getElementById('ffStatus').value
  };
  if(financeiroEditId){
    Object.assign(state.financeiro.find(x => x.id === financeiroEditId), dados);
  } else {
    dados.id = uid('financeiro');
    state.financeiro.push(dados);
  }
  marcarAlterado();
  fecharFormFinanceiro();
  renderFinanceiro();
}
function excluirFinanceiro(id){
  if(!confirm('Excluir este lançamento?\n\nVai pra Lixeira — dá pra restaurar por 30 dias.')) return;
  const f = state.financeiro.find(x => x.id === id);
  if(f) moverParaLixeira(f);
  marcarAlterado();
  renderFinanceiro();
}
function alternarStatusFinanceiro(id){
  const f = state.financeiro.find(x => x.id === id);
  if(!f) return;
  f.status = f.status === 'pendente' ? 'pago' : 'pendente';
  marcarAlterado();
  renderFinanceiro();
}
function estaVencido(f){
  if(f.status !== 'pendente' || !f.vencimento) return false;
  const d = paraDataObj(f.vencimento);
  if(!d) return false;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  return d < hoje;
}
function renderFinanceiro(){
  const filtroTipo = document.getElementById('filtroTipoFin').value;
  const filtroStatus = document.getElementById('filtroStatusFin').value;
  const tbody = document.getElementById('corpoTabelaFinanceiro');
  tbody.innerHTML = '';
  const lista = financeiroAtivos().filter(f => (!filtroTipo || f.tipo === filtroTipo) && (!filtroStatus || f.status === filtroStatus));
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhum lançamento encontrado.</td></tr>';
  }
  lista.forEach(f => {
    const tr = document.createElement('tr');
    const vencido = estaVencido(f);
    const statusBadge = f.status === 'pago'
      ? '<span class="badge pago">Pago/Recebido</span>'
      : (vencido ? '<span class="badge vencido">Vencido</span>' : '<span class="badge pendente">Pendente</span>');
    tr.innerHTML = `
      <td><span class="badge ${f.tipo}">${f.tipo === 'pagar' ? 'A pagar' : 'A receber'}</span></td>
      <td>${esc(f.descricao)}</td>
      <td>${esc(f.categoria)}</td>
      <td>${esc(nomeClienteOpcional(f.clienteId))}</td>
      <td>${fmtDataExibir(f.vencimento)}</td>
      <td>R$ ${fmtMoeda(f.valor)}</td>
      <td>${statusBadge}</td>
      <td class="acoes">
        <button class="btn-icon" onclick="alternarStatusFinanceiro('${f.id}')" title="Marcar como ${f.status === 'pendente' ? 'pago/recebido' : 'pendente'}">${f.status === 'pendente' ? '✓' : '↺'}</button>
        <button class="btn-icon" onclick="abrirFormFinanceiro('${f.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirFinanceiro('${f.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
  renderCardsFinanceiro();
}
function nomeClienteOpcional(clienteId){
  if(!clienteId) return '';
  const c = state.clientes.find(x => x.id === clienteId);
  return c ? c.nome : '';
}
// Custo total dos itens de um orçamento (base pro cálculo de lucro/margem).
function custoTotalOrcamento(o){
  return (o.itens || []).reduce((s, it) => s + (it.qtd || 0) * (it.custoUnit || 0), 0);
}
// Lucro real de um orçamento já vendido: total cobrado menos custo dos itens.
function lucroOrcamento(o){
  return (o.total || 0) - custoTotalOrcamento(o);
}
// Lucro do mês atual, considerando só orçamentos Aprovados/Concluídos (vendas confirmadas).
function lucroDoMes(){
  const hoje = new Date();
  return orcamentosAtivos()
    .filter(o => (o.status === 'Aprovado' || o.status === 'Concluído'))
    .filter(o => { const d = paraDataObj(o.data); return d && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear(); })
    .reduce((s,o) => s + lucroOrcamento(o), 0);
}
function renderCardsFinanceiro(){
  const receberPendente = financeiroAtivos().filter(f => f.tipo === 'receber' && f.status === 'pendente').reduce((s,f) => s + f.valor, 0);
  const pagarPendente = financeiroAtivos().filter(f => f.tipo === 'pagar' && f.status === 'pendente').reduce((s,f) => s + f.valor, 0);
  const saldo = receberPendente - pagarPendente;
  const vencidos = financeiroAtivos().filter(estaVencido).length;
  const lucro = lucroDoMes();
  document.getElementById('cardsFinanceiro').innerHTML = `
    <div class="card"><div class="label">A receber (pendente)</div><div class="value green">R$ ${fmtMoeda(receberPendente)}</div></div>
    <div class="card"><div class="label">A pagar (pendente)</div><div class="value red">R$ ${fmtMoeda(pagarPendente)}</div></div>
    <div class="card"><div class="label">Saldo previsto</div><div class="value ${saldo >= 0 ? 'green' : 'red'}">R$ ${fmtMoeda(saldo)}</div></div>
    <div class="card"><div class="label">Contas vencidas</div><div class="value ${vencidos > 0 ? 'red' : ''}">${vencidos}</div></div>
    <div class="card"><div class="label">Lucro do mês (vendas aprovadas)</div><div class="value ${lucro >= 0 ? 'green' : 'red'}">R$ ${fmtMoeda(lucro)}</div><div class="sub">Total cobrado menos custo dos itens</div></div>
  `;
}

