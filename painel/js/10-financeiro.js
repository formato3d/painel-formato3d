/* =========================================================
   FINANCEIRO
   ========================================================= */
let financeiroEditId = null;
// Anexos (boleto/comprovante) da conta que está sendo criada/editada no formulário.
// Cada chave guarda { url, nome } depois de enviado pro Drive, ou null se não tem anexo.
let ffAnexos = { boleto: null, comprovante: null };

// Prefixo dos ids no HTML pra cada tipo de anexo (ffAnexoBoleto... / ffAnexoComprovante...).
function prefixoAnexoEl(tipo){
  return tipo === 'boleto' ? 'ffAnexoBoleto' : 'ffAnexoComprovante';
}
function atualizarPreviewAnexo(tipo){
  const pref = prefixoAnexoEl(tipo);
  const dados = ffAnexos[tipo];
  const uploadEl = document.getElementById(pref + 'Upload');
  const previewEl = document.getElementById(pref + 'PreviewWrap');
  if(dados && dados.url){
    document.getElementById(pref + 'Link').href = dados.url;
    document.getElementById(pref + 'Nome').textContent = dados.nome || 'arquivo';
    previewEl.classList.remove('hidden');
    uploadEl.classList.add('hidden');
  } else {
    previewEl.classList.add('hidden');
    uploadEl.classList.remove('hidden');
  }
}
function removerAnexoFinanceiro(tipo){
  ffAnexos[tipo] = null;
  const input = document.getElementById(prefixoAnexoEl(tipo));
  if(input) input.value = '';
  atualizarPreviewAnexo(tipo);
}
// Envia o arquivo (boleto ou comprovante) pro servidor assim que a pessoa escolhe —
// fica salvo no Drive na hora, e só o link é guardado no formulário até "Salvar".
function processarAnexoFinanceiro(input, tipo){
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
  const pref = prefixoAnexoEl(tipo);
  const txtEl = document.querySelector('#' + pref + 'Upload .ph-txt');
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
        ffAnexos[tipo] = { url: resp.url, nome: resp.nome || file.name };
        atualizarPreviewAnexo(tipo);
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
  document.getElementById('ffAnexoBoleto').value = '';
  document.getElementById('ffAnexoComprovante').value = '';
  ffAnexos.boleto = f.boletoUrl ? { url: f.boletoUrl, nome: f.boletoNome || 'boleto' } : null;
  ffAnexos.comprovante = f.comprovanteUrl ? { url: f.comprovanteUrl, nome: f.comprovanteNome || 'comprovante' } : null;
  atualizarPreviewAnexo('boleto');
  atualizarPreviewAnexo('comprovante');
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
    status: document.getElementById('ffStatus').value,
    boletoUrl: ffAnexos.boleto ? ffAnexos.boleto.url : '',
    boletoNome: ffAnexos.boleto ? ffAnexos.boleto.nome : '',
    comprovanteUrl: ffAnexos.comprovante ? ffAnexos.comprovante.url : '',
    comprovanteNome: ffAnexos.comprovante ? ffAnexos.comprovante.nome : ''
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
  const vaiParaPago = f.status !== 'pago';
  f.status = vaiParaPago ? 'pago' : 'pendente';
  marcarAlterado();
  renderFinanceiro();
  // Pagamento de uma venda (conta a receber) confirmado agora — oferece gerar o recibo na hora.
  if(vaiParaPago && f.tipo === 'receber'){
    if(confirm('Pagamento confirmado!\n\nDeseja gerar o recibo agora?')) abrirRecibo(f.id);
  }
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Nenhum lançamento encontrado.</td></tr>';
  }
  lista.forEach(f => {
    const tr = document.createElement('tr');
    const vencido = estaVencido(f);
    const statusBadge = f.status === 'pago'
      ? '<span class="badge pago">Pago/Recebido</span>'
      : (vencido ? '<span class="badge vencido">Vencido</span>' : '<span class="badge pendente">Pendente</span>');
    const anexos = `${f.boletoUrl ? `<a href="${esc(f.boletoUrl)}" target="_blank" rel="noopener" title="Abrir boleto${f.boletoNome ? ': ' + esc(f.boletoNome) : ''}">📄</a>` : ''}${f.comprovanteUrl ? `<a href="${esc(f.comprovanteUrl)}" target="_blank" rel="noopener" title="Abrir comprovante${f.comprovanteNome ? ': ' + esc(f.comprovanteNome) : ''}">🧾</a>` : ''}`;
    tr.innerHTML = `
      <td><span class="badge ${f.tipo}">${f.tipo === 'pagar' ? 'A pagar' : 'A receber'}</span></td>
      <td>${esc(f.descricao)}</td>
      <td>${esc(f.categoria)}</td>
      <td>${esc(nomeClienteOpcional(f.clienteId))}</td>
      <td>${fmtDataExibir(f.vencimento)}</td>
      <td>R$ ${fmtMoeda(f.valor)}</td>
      <td>${statusBadge}</td>
      <td class="anexos-cell">${anexos || '—'}</td>
      <td class="acoes">
        <button class="btn-icon" onclick="alternarStatusFinanceiro('${f.id}')" title="Marcar como ${f.status === 'pendente' ? 'pago/recebido' : 'pendente'}">${f.status === 'pendente' ? '✓' : '↺'}</button>
        ${(f.tipo === 'receber' && f.status === 'pago') ? `<button class="btn-icon" onclick="abrirRecibo('${f.id}')" title="Gerar/imprimir recibo">🧾</button>` : ''}
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
/* =========================================================
   RECIBO (impressão/PDF de um pagamento recebido)
   ========================================================= */
function proximoNumeroRecibo(){
  if(!state.seq.recibo) state.seq.recibo = 1;
  const n = state.seq.recibo;
  state.seq.recibo = n + 1;
  return String(n).padStart(4,'0');
}
function abrirRecibo(id){
  const f = state.financeiro.find(x => x.id === id);
  if(!f) return;
  if(!f.reciboNumero){
    f.reciboNumero = proximoNumeroRecibo();
    marcarAlterado();
  }
  const o = f.orcamentoId ? state.orcamentos.find(x => x.id === f.orcamentoId) : null;

  document.getElementById('reLogoImg').src = document.getElementById('poLogoImg').src;
  document.getElementById('reCnpj').textContent = state.empresa.cnpj || '';
  document.getElementById('reWhatsapp').textContent = state.empresa.whatsapp || '';
  document.getElementById('reNumero').textContent = f.reciboNumero;
  document.getElementById('reData').textContent = hojeStr();
  document.getElementById('reValorNum').textContent = 'R$ ' + fmtMoeda(f.valor);
  document.getElementById('reValorExtenso').textContent = valorPorExtenso(f.valor);
  const pagoPor = nomeClienteOpcional(f.clienteId) || 'Cliente';
  document.getElementById('rePagoPor').textContent = pagoPor;
  document.getElementById('reFormaPagamento').textContent = (o && o.formasPagamento && o.formasPagamento.length) ? o.formasPagamento.join(', ') : '—';
  document.getElementById('reReferente').textContent = f.descricao || '';
  document.getElementById('reTexto').textContent = 'Recebi de ' + pagoPor + ' a importância de R$ ' + fmtMoeda(f.valor) + ' (' + valorPorExtenso(f.valor).toLowerCase() + '), referente a ' + (f.descricao || 'pagamento') + '. Para clareza firmo o presente recibo.';
  document.getElementById('reResponsavel').textContent = state.empresa.responsavel || state.empresa.nome;
  document.getElementById('reAssinaturaDoc').textContent = state.empresa.nome + ' · CNPJ ' + (state.empresa.cnpj || '');

  document.getElementById('printAreaRecibo').classList.add('ativo');
  document.getElementById('printArea').classList.remove('ativo');
  document.body.classList.add('modo-impressao');
  window.print();
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

