/* =========================================================
   CLIENTES
   ========================================================= */
let clienteEditId = null;

function abrirFormCliente(id){
  clienteEditId = id || null;
  const c = id ? state.clientes.find(x => x.id === id) : {};
  document.getElementById('fcNome').value = c.nome || '';
  document.getElementById('fcTelefone').value = c.telefone || '';
  document.getElementById('fcEmail').value = c.email || '';
  document.getElementById('fcCidade').value = c.cidade || state.empresa.cidadePadrao || '';
  document.getElementById('fcEndereco').value = c.endereco || '';
  document.getElementById('fcObs').value = c.obs || '';
  document.getElementById('formClienteTitulo').textContent = id ? 'Editar cliente' : 'Novo cliente';
  document.getElementById('formClienteWrap').classList.remove('hidden');
  document.getElementById('fcNome').focus();
}
function fecharFormCliente(){
  document.getElementById('formClienteWrap').classList.add('hidden');
  clienteEditId = null;
}
function salvarCliente(){
  const nome = document.getElementById('fcNome').value.trim();
  if(!nome){ alert('Informe o nome do cliente.'); return; }
  const dados = {
    nome,
    telefone: document.getElementById('fcTelefone').value.trim(),
    email: document.getElementById('fcEmail').value.trim(),
    cidade: document.getElementById('fcCidade').value.trim(),
    endereco: document.getElementById('fcEndereco').value.trim(),
    obs: document.getElementById('fcObs').value.trim()
  };
  if(clienteEditId){
    Object.assign(state.clientes.find(x => x.id === clienteEditId), dados);
  } else {
    dados.id = uid('cliente');
    state.clientes.push(dados);
  }
  marcarAlterado();
  fecharFormCliente();
  renderClientes();
  atualizarSelectsClientes();
}
function excluirCliente(id){
  const usado = state.orcamentos.some(o => o.clienteId === id);
  if(!confirm((usado ? 'Este cliente está vinculado a orçamentos. Excluir mesmo assim?' : 'Excluir este cliente?') + '\n\nVai pra Lixeira — dá pra restaurar por 30 dias.')) return;
  const c = state.clientes.find(x => x.id === id);
  if(c) moverParaLixeira(c);
  marcarAlterado();
  renderClientes();
  atualizarSelectsClientes();
}
// Histórico de compras do cliente: pedidos aprovados/concluídos, total gasto e data do último pedido.
function historicoCliente(clienteId){
  const pedidos = orcamentosAtivos().filter(o => o.clienteId === clienteId && (o.status === 'Aprovado' || o.status === 'Concluído'));
  const total = pedidos.reduce((s, o) => s + (o.total || 0), 0);
  const ultimo = pedidos.reduce((max, o) => (!max || o.data > max) ? o.data : max, null);
  return { qtd: pedidos.length, total, ultimo };
}
function renderClientes(){
  const busca = (document.getElementById('buscaCliente').value || '').toLowerCase();
  const tbody = document.getElementById('corpoTabelaClientes');
  tbody.innerHTML = '';
  const lista = clientesAtivos().filter(c =>
    !busca || c.nome.toLowerCase().includes(busca) || (c.telefone||'').includes(busca) || (c.email||'').toLowerCase().includes(busca)
  );
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum cliente cadastrado ainda.</td></tr>';
  }
  lista.forEach(c => {
    const h = historicoCliente(c.id);
    const historicoTxt = h.qtd
      ? `<b>${h.qtd}</b> pedido${h.qtd > 1 ? 's' : ''} · R$ ${fmtMoeda(h.total)}${h.ultimo ? ' · último em ' + fmtDataExibir(h.ultimo) : ''}`
      : '<span style="color:var(--gray)">Sem pedidos ainda</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(c.nome)}</td><td>${esc(c.telefone)}</td><td>${esc(c.email)}</td><td>${esc(c.cidade)}</td><td>${historicoTxt}</td>
      <td class="acoes">
        <button class="btn-icon" onclick="abrirFormCliente('${c.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirCliente('${c.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('contagemClientes').textContent = clientesAtivos().length;
}
function atualizarSelectsClientes(){
  const selects = [document.getElementById('foCliente'), document.getElementById('ffCliente')];
  selects.forEach(sel => {
    if(!sel) return;
    const atual = sel.value;
    const isFin = sel.id === 'ffCliente';
    sel.innerHTML = (isFin ? '<option value="">—</option>' : '<option value="">Selecione um cliente...</option>') +
      clientesAtivos().map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    sel.value = atual;
  });
}

