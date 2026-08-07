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

// Orçamento ainda ativo (não excluído) vinculado a um lançamento financeiro, se houver.
function orcamentoVinculado(f){
  if(!f || !f.orcamentoId) return null;
  return orcamentosAtivos().find(x => x.id === f.orcamentoId) || null;
}

/* =========================================================
   PARCELAMENTO AUTOMÁTICO
   Uma compra/venda parcelada é cadastrada uma única vez no formulário —
   o painel cria sozinho um lançamento pendente pra cada parcela, já com
   a data de vencimento certa, sem precisar repetir o cadastro N vezes.
   ========================================================= */
// Divide um valor total em N parcelas em centavos, sem perder (nem sobrar) centavo por
// causa de arredondamento — o resto de centavos é distribuído nas primeiras parcelas.
function dividirValorEmParcelas(total, n){
  const centavosTotal = Math.round((total || 0) * 100);
  const base = Math.floor(centavosTotal / n);
  const resto = centavosTotal - (base * n);
  const valores = [];
  for(let i = 0; i < n; i++){
    valores.push((base + (i < resto ? 1 : 0)) / 100);
  }
  return valores;
}
// Data de vencimento da parcela de índice "indice" (0 = a primeira, que usa a própria
// data base informada no formulário), conforme o intervalo escolhido.
function calcularVencimentoParcela(dataBase, indice, intervalo){
  if(indice === 0) return fmtDataExibir(dataBase);
  if(intervalo === 'quinzenal') return somarDias(dataBase, indice * 15);
  if(intervalo === 'semanal') return somarDias(dataBase, indice * 7);
  return somarMeses(dataBase, indice);
}
// Mostra/esconde os campos de nº de parcelas e intervalo, e ajusta os rótulos de
// Valor/Vencimento pra deixar claro que passam a ser "total" e "1ª parcela".
function alternarParcelamento(){
  const ligado = document.getElementById('ffParcelado').checked;
  document.getElementById('ffParceladoCampos').classList.toggle('hidden', !ligado);
  document.getElementById('ffValorLabel').textContent = ligado ? 'Valor total (R$) *' : 'Valor (R$) *';
  document.getElementById('ffVencimentoLabel').textContent = ligado ? 'Vencimento da 1ª parcela' : 'Vencimento';
  atualizarPreviewParcelas();
}
// Atualiza a prévia "Nx de R$ ..." conforme a pessoa preenche valor/vencimento/parcelas.
function atualizarPreviewParcelas(){
  const previewEl = document.getElementById('ffParcelaPreview');
  if(!previewEl) return;
  if(!document.getElementById('ffParcelado').checked) return;
  const n = parseInt(document.getElementById('ffParcelas').value, 10);
  const total = parseMoeda(document.getElementById('ffValor').value);
  const vencimentoBase = document.getElementById('ffVencimento').value.trim();
  if(!n || n < 2 || !total || !paraDataObj(vencimentoBase)){
    previewEl.textContent = 'Preencha valor total, vencimento da 1ª parcela e nº de parcelas.';
    return;
  }
  const intervalo = document.getElementById('ffIntervaloParcela').value;
  const valores = dividirValorEmParcelas(total, n);
  const primeiraDataFmt = calcularVencimentoParcela(vencimentoBase, 0, intervalo);
  const ultimaDataFmt = calcularVencimentoParcela(vencimentoBase, n - 1, intervalo);
  previewEl.textContent = n + 'x de R$ ' + fmtMoeda(valores[0]) + (valores[0] !== valores[n-1] ? ' (algumas de R$ ' + fmtMoeda(valores[n-1]) + ')' : '') + ' — de ' + primeiraDataFmt + ' até ' + ultimaDataFmt;
}
function abrirFormFinanceiro(id){
  financeiroEditId = id || null;
  const f = id ? state.financeiro.find(x => x.id === id) : {};
  atualizarSelectsClientes();
  document.getElementById('ffTipo').value = f.tipo || abaFinanceiroAtiva;
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

  // Cliente e valor de um lançamento vinculado a um orçamento são controlados pelo
  // orçamento (pra nunca ficarem desencontrados) — edite lá se precisar mudar.
  const o = orcamentoVinculado(f);
  const avisoEl = document.getElementById('ffVinculoAviso');
  const linkEl = document.getElementById('ffVinculoLink');
  document.getElementById('ffCliente').disabled = !!o;
  document.getElementById('ffValor').readOnly = !!o;
  document.getElementById('ffValor').classList.toggle('campo-travado', !!o);
  document.getElementById('ffCliente').classList.toggle('campo-travado', !!o);
  if(o){
    linkEl.textContent = 'Orçamento nº ' + o.numero;
    linkEl.onclick = function(ev){
      ev.preventDefault();
      fecharFormFinanceiro();
      mostrarAba('orcamentos');
      abrirFormOrcamento(o.id);
    };
    avisoEl.classList.remove('hidden');
  } else {
    avisoEl.classList.add('hidden');
  }

  // Parcelamento automático só é oferecido ao criar um lançamento novo — uma vez
  // criadas, as parcelas são independentes entre si (edita/paga/exclui cada uma
  // separadamente), então ao editar uma parcela existente só mostramos um aviso
  // informativo de qual parcela é essa, sem a opção de reparcelar.
  document.getElementById('ffParcelado').checked = false;
  document.getElementById('ffParcelas').value = '';
  document.getElementById('ffIntervaloParcela').value = 'mensal';
  document.getElementById('ffParceladoCampos').classList.add('hidden');
  document.getElementById('ffValorLabel').textContent = 'Valor (R$) *';
  document.getElementById('ffVencimentoLabel').textContent = 'Vencimento';
  document.getElementById('ffParceladoBloco').classList.toggle('hidden', !!id);
  const infoParcelaEl = document.getElementById('ffParcelaInfoAviso');
  if(f.parcelaTotal){
    document.getElementById('ffParcelaInfoTexto').textContent = f.parcelaNum + ' de ' + f.parcelaTotal;
    infoParcelaEl.classList.remove('hidden');
  } else {
    infoParcelaEl.classList.add('hidden');
  }

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
  const valorInformado = parseMoeda(document.getElementById('ffValor').value);
  const vencimentoInformado = document.getElementById('ffVencimento').value.trim();
  const dadosBase = {
    tipo: document.getElementById('ffTipo').value,
    descricao,
    categoria: document.getElementById('ffCategoria').value.trim(),
    clienteId: document.getElementById('ffCliente').value || null,
    status: document.getElementById('ffStatus').value,
    boletoUrl: ffAnexos.boleto ? ffAnexos.boleto.url : '',
    boletoNome: ffAnexos.boleto ? ffAnexos.boleto.nome : '',
    comprovanteUrl: ffAnexos.comprovante ? ffAnexos.comprovante.url : '',
    comprovanteNome: ffAnexos.comprovante ? ffAnexos.comprovante.nome : ''
  };

  // Parcelamento automático só é oferecido pra lançamentos novos (ver abrirFormFinanceiro).
  const parcelar = !financeiroEditId && document.getElementById('ffParcelado').checked;
  if(parcelar){
    const n = parseInt(document.getElementById('ffParcelas').value, 10);
    if(!n || n < 2){ alert('Informe o número de parcelas (mínimo 2).'); return; }
    if(!paraDataObj(vencimentoInformado)){ alert('Informe a data de vencimento da 1ª parcela.'); return; }
    if(!valorInformado){ alert('Informe o valor total a parcelar.'); return; }
    const intervalo = document.getElementById('ffIntervaloParcela').value;
    const valores = dividirValorEmParcelas(valorInformado, n);
    const grupoId = uid('parcelamento');
    for(let i = 0; i < n; i++){
      const item = Object.assign({}, dadosBase, {
        id: uid('financeiro'),
        valor: valores[i],
        vencimento: calcularVencimentoParcela(vencimentoInformado, i, intervalo),
        parcelamentoId: grupoId,
        parcelaNum: i + 1,
        parcelaTotal: n
      });
      // O anexo (boleto/comprovante) enviado no formulário vira só da 1ª parcela — as
      // demais nascem sem anexo, pra não repetir o mesmo arquivo em todas.
      if(i > 0){ item.boletoUrl = ''; item.boletoNome = ''; item.comprovanteUrl = ''; item.comprovanteNome = ''; }
      state.financeiro.push(item);
    }
  } else {
    const dados = Object.assign({}, dadosBase, {
      valor: valorInformado,
      vencimento: vencimentoInformado
    });
    if(financeiroEditId){
      Object.assign(state.financeiro.find(x => x.id === financeiroEditId), dados);
    } else {
      dados.id = uid('financeiro');
      state.financeiro.push(dados);
    }
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
// Alterna entre as sub-abas "A pagar" / "A receber" do Financeiro — cada uma mostra só os
// lançamentos daquele tipo, com filtro de mês/status e cards próprios. Chamada pelos botões
// da barra de abas e também de fora (ex.: verFinanceiroDoOrcamento, pra abrir já na aba certa).
let abaFinanceiroAtiva = 'pagar';
function mostrarAbaFinanceiro(tipo){
  abaFinanceiroAtiva = tipo;
  document.getElementById('subtabFinPagar').classList.toggle('active', tipo === 'pagar');
  document.getElementById('subtabFinReceber').classList.toggle('active', tipo === 'receber');
  renderFinanceiro();
}
// "YYYY-MM" a partir do vencimento de um lançamento — chave usada pelo filtro de mês.
function chaveMesFinanceiro(f){
  const d = paraDataObj(f.vencimento);
  return d ? (d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')) : null;
}
// Todo mês/ano que aparece em algum vencimento do financeiro (pagar + receber), pra popular
// o filtro de período — sempre inclui o mês atual, mesmo sem nenhum lançamento nele, pra dar
// pra escolher "este mês" mesmo numa base ainda vazia.
function mesesDisponiveisFinanceiro(){
  const hoje = new Date();
  const chaves = new Set([hoje.getFullYear() + '-' + String(hoje.getMonth()+1).padStart(2,'0')]);
  financeiroAtivos().forEach(f => { const c = chaveMesFinanceiro(f); if(c) chaves.add(c); });
  return [...chaves].sort();
}
function rotuloMesFinanceiro(chave){
  const [ano, mes] = chave.split('-').map(Number);
  return NOMES_MES_ABREV[mes-1] + '/' + ano;
}
// Reconstrói as opções do filtro de mês, preservando a seleção atual se ela ainda existir.
function preencherFiltroMesFin(){
  const sel = document.getElementById('filtroMesFin');
  const atual = sel.value;
  const chaves = mesesDisponiveisFinanceiro();
  sel.innerHTML = '<option value="">Todos os meses</option>' + chaves.map(c => `<option value="${c}">${rotuloMesFinanceiro(c)}</option>`).join('');
  if(chaves.includes(atual)) sel.value = atual;
}
// Lista que respeita os filtros atuais da tela: a sub-aba ativa (pagar/receber), o mês e o
// status escolhidos. Usada tanto pra desenhar a tabela quanto pra exportar — a planilha
// exportada é sempre exatamente o que está na tela.
function financeiroFiltradoAtual(){
  const mesAno = document.getElementById('filtroMesFin').value;
  const filtroStatus = document.getElementById('filtroStatusFin').value;
  return financeiroAtivos()
    .filter(f => f.tipo === abaFinanceiroAtiva)
    .filter(f => !filtroStatus || f.status === filtroStatus)
    .filter(f => !mesAno || chaveMesFinanceiro(f) === mesAno);
}
function renderFinanceiro(){
  preencherFiltroMesFin();
  const tbody = document.getElementById('corpoTabelaFinanceiro');
  tbody.innerHTML = '';
  const lista = financeiroFiltradoAtual();
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Nenhum lançamento encontrado.</td></tr>';
  }
  lista.forEach(f => {
    const tr = document.createElement('tr');
    tr.id = 'financeiro-linha-' + f.id;
    const vencido = estaVencido(f);
    const statusBadge = f.status === 'pago'
      ? '<span class="badge pago">Pago/Recebido</span>'
      : (vencido ? '<span class="badge vencido">Vencido</span>' : '<span class="badge pendente">Pendente</span>');
    const dessincronizado = financeiroDessincronizado(f);
    const avisoDessinc = dessincronizado
      ? ' <span class="badge desencontrado" title="O orçamento vinculado mudou depois desse pagamento já confirmado (valor ou cliente diferente do que foi cobrado) — confira e ajuste manualmente.">⚠ orçamento mudou</span>'
      : '';
    const anexos = `${f.boletoUrl ? `<a href="${esc(f.boletoUrl)}" target="_blank" rel="noopener" title="Abrir boleto${f.boletoNome ? ': ' + esc(f.boletoNome) : ''}">📄</a>` : ''}${f.comprovanteUrl ? `<a href="${esc(f.comprovanteUrl)}" target="_blank" rel="noopener" title="Abrir comprovante${f.comprovanteNome ? ': ' + esc(f.comprovanteNome) : ''}">🧾</a>` : ''}`;
    const parcelaBadge = f.parcelaTotal
      ? ` <span class="badge parcela" title="Parcela ${f.parcelaNum} de ${f.parcelaTotal} desta compra/venda">${f.parcelaNum}/${f.parcelaTotal}</span>`
      : '';
    tr.innerHTML = `
      <td>${esc(f.descricao)}${parcelaBadge}</td>
      <td>${esc(f.categoria)}</td>
      <td>${esc(nomeClienteOpcional(f.clienteId))}</td>
      <td>${fmtDataExibir(f.vencimento)}</td>
      <td>R$ ${fmtMoeda(f.valor)}</td>
      <td>${statusBadge}${avisoDessinc}</td>
      <td class="anexos-cell">${anexos || '—'}</td>
      <td class="acoes">
        <button class="btn-icon" onclick="alternarStatusFinanceiro('${f.id}')" title="Marcar como ${f.status === 'pendente' ? 'pago/recebido' : 'pendente'}">${f.status === 'pendente' ? '✓' : '↺'}</button>
        ${dessincronizado ? `<button class="btn-icon" onclick="atualizarFinanceiroComOrcamento('${f.id}')" title="Atualizar lançamento com os dados atuais do orçamento">🔄</button>` : ''}
        ${(f.tipo === 'receber' && f.status === 'pago') ? `<button class="btn-icon" onclick="abrirRecibo('${f.id}')" title="Gerar/imprimir recibo">🧾</button>` : ''}
        <button class="btn-icon" onclick="abrirFormFinanceiro('${f.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirFinanceiro('${f.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
  renderCardsFinanceiro();
}
// Mantém o lançamento financeiro (a "venda") em sincronia com o orçamento que o gerou —
// chamado sempre que o orçamento é salvo (ver salvarOrcamento em 08-orcamentos-modelos.js).
// Só atualiza sozinho enquanto o lançamento ainda está "pendente": depois que o
// pagamento foi confirmado, não sobrescreve mais um registro já reconciliado — nesse
// caso, se o orçamento mudar, o lançamento fica marcado como desencontrado (ver
// financeiroDessincronizado) pra revisão manual em vez de mudar sozinho por baixo dos panos.
function sincronizarFinanceiroComOrcamento(o){
  if(!o.financeiroGerado) return;
  const f = financeiroVinculadoAoOrcamento(o.id);
  if(!f || f.status === 'pago') return;
  f.valor = o.total;
  f.clienteId = o.clienteId;
}
// true quando um lançamento "a receber" vinculado a um orçamento já foi pago, mas o
// orçamento mudou depois (valor ou cliente diferente do que foi cobrado) — como pagamentos
// confirmados não são sobrescritos automaticamente, isso pede uma checada manual.
function financeiroDessincronizado(f){
  if(!f.orcamentoId || f.status !== 'pago') return false;
  const o = state.orcamentos.find(x => x.id === f.orcamentoId);
  if(!o || o.excluidoEm) return false;
  return f.valor !== o.total || f.clienteId !== o.clienteId;
}
// Botão "🔄" que aparece junto do aviso "orçamento mudou": corrige manualmente um lançamento
// já pago pra bater com o orçamento vinculado. Diferente de sincronizarFinanceiroComOrcamento
// (que só roda sozinha enquanto está pendente), essa ação é sempre explícita — mostra o que
// vai mudar e pede confirmação antes de sobrescrever um pagamento já confirmado.
function atualizarFinanceiroComOrcamento(financeiroId){
  const f = state.financeiro.find(x => x.id === financeiroId);
  if(!f || !f.orcamentoId) return;
  const o = state.orcamentos.find(x => x.id === f.orcamentoId);
  if(!o || o.excluidoEm){
    alert('O orçamento vinculado a este lançamento não foi encontrado — pode ter sido excluído.');
    return;
  }
  const mudaValor = f.valor !== o.total;
  const mudaCliente = f.clienteId !== o.clienteId;
  if(!mudaValor && !mudaCliente) return;
  const linhas = [];
  if(mudaValor) linhas.push('Valor: R$ ' + fmtMoeda(f.valor) + ' → R$ ' + fmtMoeda(o.total));
  if(mudaCliente) linhas.push('Cliente: ' + (nomeClienteOpcional(f.clienteId) || '(nenhum)') + ' → ' + (nomeClienteOpcional(o.clienteId) || '(nenhum)'));
  const confirmou = confirm(
    'Atualizar este lançamento pra bater com o orçamento nº ' + o.numero + '?\n\n' + linhas.join('\n') +
    '\n\nEssa conta já está marcada como paga/recebida — só confirme se o valor recebido de verdade mudou.'
  );
  if(!confirmou) return;
  f.valor = o.total;
  f.clienteId = o.clienteId;
  marcarAlterado();
  renderFinanceiro();
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
// Soma dos lançamentos pendentes de um tipo ("pagar"/"receber"), opcionalmente só
// os que vencem no mês/ano atual — usado nos cards pra separar "tudo que ainda vou
// receber/pagar, algum dia" da previsão do mês corrente.
function totalFinanceiroPendente(tipo, apenasMesAtual){
  const hoje = new Date();
  return financeiroAtivos()
    .filter(f => f.tipo === tipo && f.status === 'pendente')
    .filter(f => {
      if(!apenasMesAtual) return true;
      const d = paraDataObj(f.vencimento);
      return !!d && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    })
    .reduce((s,f) => s + f.valor, 0);
}
// Soma dos lançamentos pendentes de um tipo, dentro do período escolhido no filtro de mês da
// aba Financeiro ('' = todos os meses, ou uma chave "YYYY-MM" pra um mês específico).
function totalFinanceiroPeriodo(tipo, mesAno){
  return financeiroAtivos()
    .filter(f => f.tipo === tipo && f.status === 'pendente')
    .filter(f => !mesAno || chaveMesFinanceiro(f) === mesAno)
    .reduce((s,f) => s + f.valor, 0);
}
// Quantas contas vencidas (pendentes com vencimento no passado) tem de um tipo — não respeita
// o filtro de mês, porque "vencida" é sobre estar atrasada agora, independente do período em tela.
function vencidasPorTipo(tipo){
  return financeiroAtivos().filter(f => f.tipo === tipo && estaVencido(f)).length;
}
function renderCardsFinanceiro(){
  const mesAno = document.getElementById('filtroMesFin').value;
  const rotuloPeriodo = mesAno ? rotuloMesFinanceiro(mesAno) : 'todas as datas';
  const receber = totalFinanceiroPeriodo('receber', mesAno);
  const pagar = totalFinanceiroPeriodo('pagar', mesAno);
  const saldo = receber - pagar;
  document.getElementById('cardsResumoFinanceiro').innerHTML = `
    <div class="card"><div class="label">A receber</div><div class="value green">R$ ${fmtMoeda(receber)}</div><div class="sub">Pendente, ${esc(rotuloPeriodo)}</div></div>
    <div class="card"><div class="label">A pagar</div><div class="value red">R$ ${fmtMoeda(pagar)}</div><div class="sub">Pendente, ${esc(rotuloPeriodo)}</div></div>
    <div class="card"><div class="label">Saldo</div><div class="value ${saldo >= 0 ? 'green' : 'red'}">R$ ${fmtMoeda(saldo)}</div><div class="sub">A receber menos a pagar, ${esc(rotuloPeriodo)}</div></div>
  `;
  const vencidas = vencidasPorTipo(abaFinanceiroAtiva);
  const rotuloTipo = abaFinanceiroAtiva === 'pagar' ? 'a pagar' : 'a receber';
  document.getElementById('cardsTipoFinanceiro').innerHTML = `
    <div class="card"><div class="label">Vencidas (${rotuloTipo})</div><div class="value ${vencidas > 0 ? 'red' : ''}">${vencidas}</div><div class="sub">Contas ${rotuloTipo} pendentes com vencimento já passado</div></div>
  `;
}

