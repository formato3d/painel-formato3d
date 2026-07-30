/* =========================================================
   ESTOQUE DE FILAMENTO (manual)
   ========================================================= */
let filamentoEditId = null;

function abrirFormFilamento(id){
  filamentoEditId = id || null;
  const f = id ? state.filamentos.find(x => x.id === id) : {};
  document.getElementById('ffCor').value = (f && f.cor) || '';
  document.getElementById('ffMaterial').value = (f && f.material) || '';
  document.getElementById('ffQuantidadeGramas').value = (f && f.quantidadeGramas !== undefined) ? f.quantidadeGramas : '';
  document.getElementById('ffAlertaBaixo').value = (f && f.alertaBaixoGramas !== undefined) ? f.alertaBaixoGramas : '';
  document.getElementById('formFilamentoTitulo').textContent = id ? 'Editar filamento' : 'Novo filamento';
  document.getElementById('ffBtnSalvar').textContent = id ? 'Salvar alterações' : 'Criar filamento';
  document.getElementById('formFilamentoWrap').classList.remove('hidden');
  document.getElementById('ffCor').focus();
}
function fecharFormFilamento(){
  document.getElementById('formFilamentoWrap').classList.add('hidden');
  filamentoEditId = null;
}
function salvarFilamento(){
  const cor = document.getElementById('ffCor').value.trim();
  if(!cor){ alert('Informe a cor do filamento.'); return; }
  const dados = {
    cor,
    material: document.getElementById('ffMaterial').value,
    quantidadeGramas: parseInt(document.getElementById('ffQuantidadeGramas').value, 10) || 0,
    alertaBaixoGramas: parseInt(document.getElementById('ffAlertaBaixo').value, 10) || 200
  };
  if(filamentoEditId){
    Object.assign(state.filamentos.find(x => x.id === filamentoEditId), dados);
  } else {
    dados.id = uid('filamento');
    state.filamentos.push(dados);
  }
  marcarAlterado();
  fecharFormFilamento();
  renderFilamentos();
}
function excluirFilamento(id){
  if(!confirm('Excluir este filamento do estoque?\n\nVai pra Lixeira — dá pra restaurar por 30 dias.')) return;
  const f = state.filamentos.find(x => x.id === id);
  if(f) moverParaLixeira(f);
  marcarAlterado();
  renderFilamentos();
}
function renderFilamentos(){
  const buscaEl = document.getElementById('buscaFilamento');
  const busca = (buscaEl ? buscaEl.value : '').toLowerCase();
  const tbody = document.getElementById('corpoTabelaFilamentos');
  if(!tbody) return;
  tbody.innerHTML = '';
  const lista = filamentosAtivos().filter(f =>
    !busca || (f.cor||'').toLowerCase().includes(busca) || (f.material||'').toLowerCase().includes(busca)
  );
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhum filamento cadastrado ainda.</td></tr>';
  }
  lista.forEach(f => {
    const tr = document.createElement('tr');
    const qtd = Number(f.quantidadeGramas) || 0;
    const alerta = f.alertaBaixoGramas !== undefined && f.alertaBaixoGramas !== '' ? Number(f.alertaBaixoGramas) : 200;
    const baixo = qtd <= alerta;
    tr.innerHTML = `<td>${esc(f.cor)}</td><td>${esc(f.material || '—')}</td>
      <td><span class="badge ${baixo ? 'estoque-baixo' : 'estoque-ok'}">${qtd} g</span></td>
      <td class="acoes">
        <button class="btn-icon" onclick="abrirFormFilamento('${f.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirFilamento('${f.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('contagemFilamentos').textContent = filamentosAtivos().length;
}

