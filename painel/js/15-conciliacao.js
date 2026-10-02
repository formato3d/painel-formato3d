/* =========================================================
   CONCILIAÇÃO BANCÁRIA
   Importa o extrato do banco (.ofx ou .csv/.xlsx) e compara cada transação com o que já
   existe em Contas a pagar/receber (ver 10-financeiro.js) e Compras (ver 14-compras.js).
   Cada linha do extrato vira um de 3 grupos:
   - "conciliado": já tem uma conta PAGA/RECEBIDA (ou uma Compra) com valor e data bem
     próximos — só informativo, não tem ação.
   - "pendente_encontrado": tem uma conta PENDENTE com o mesmo valor — um clique confirma
     o pagamento usando a data que veio do banco como data efetiva (ver
     efetivarPagamentoFinanceiro_ em 10-financeiro.js).
   - "sem_correspondencia": nada parecido encontrado — um mini formulário cadastra direto
     no lugar certo (A pagar, A receber ou Compra).
   De propósito, tudo aqui (conciliacaoLinhas, o arquivo importado etc.) vive só na
   variável de memória da página — nunca é salvo em state/localStorage. O que o painel
   realmente guarda é sempre através de efetivarPagamentoFinanceiro_ ou de um novo
   lançamento/compra normal, exatamente como se tivesse sido cadastrado à mão.
   ========================================================= */

// Cada item: { data, descricaoBanco, valor (com sinal: + entrada, - saída), status
// ('conciliado'|'pendente_encontrado'|'sem_correspondencia'|'ignorado'), matchTipo
// ('receber'|'pagar'|'compra'|null), matchId, matchDescricao, cadastroAberto }
let conciliacaoLinhas = [];
// Linhas brutas (array de arrays) do CSV/Excel importado, aguardando a pessoa confirmar
// o mapeamento de colunas antes de processar.
let concLinhasBrutas = null;

const CONCILIACAO_TOLERANCIA_VALOR = 0.01;
const CONCILIACAO_TOLERANCIA_DIAS = 5;

function diferencaDiasConciliacao_(dataA, dataB){
  const a = paraDataObj(dataA), b = paraDataObj(dataB);
  if(!a || !b) return Infinity;
  return Math.abs((a - b) / (1000 * 60 * 60 * 24));
}

/* ---------- Leitura do arquivo (OFX ou CSV/Excel) ---------- */

function processarArquivoConciliacao(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const nome = file.name.toLowerCase();
  if(nome.endsWith('.ofx')){
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const linhas = parsearOfxConciliacao_(String(e.target.result));
        if(linhas.length === 0){ alert('Não encontrei nenhuma transação nesse arquivo OFX. Confira se é um extrato exportado do seu banco.'); input.value = ''; return; }
        iniciarConciliacaoComLinhas_(linhas);
      } catch(err){
        console.error(err);
        alert('Não consegui ler esse arquivo OFX. Confira se é um extrato exportado do seu banco.');
      }
      input.value = '';
    };
    reader.readAsText(file);
  } else if(nome.endsWith('.csv') || nome.endsWith('.xlsx') || nome.endsWith('.xls')){
    if(typeof XLSX === 'undefined'){
      alert('Não foi possível carregar a biblioteca de leitura de planilhas. Verifique sua internet e tente de novo.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const dados = new Uint8Array(e.target.result);
        const wb = XLSX.read(dados, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const linhasBrutas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
          .filter(linha => linha.some(cel => String(cel).trim() !== ''));
        if(linhasBrutas.length === 0){ alert('Esse arquivo parece estar vazio.'); input.value = ''; return; }
        iniciarMapeamentoCsvConciliacao_(linhasBrutas);
      } catch(err){
        console.error(err);
        alert('Não consegui ler esse arquivo. Confira se é um CSV ou planilha exportado do seu banco.');
      }
      input.value = '';
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Envie um arquivo .ofx, .csv ou .xlsx exportado do seu banco.');
    input.value = '';
  }
}

// Extrai transações (<STMTTRN>...</STMTTRN>) de um extrato OFX (formato semi-SGML usado
// por praticamente todo banco brasileiro pra exportar extrato).
function parsearOfxConciliacao_(texto){
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const linhas = [];
  blocos.forEach(bloco => {
    const fimIdx = bloco.search(/<\/STMTTRN>/i);
    const conteudo = fimIdx !== -1 ? bloco.slice(0, fimIdx) : bloco;
    const pegar = (tag) => {
      const m = conteudo.match(new RegExp('<' + tag + '>([^<\r\n]*)', 'i'));
      return m ? m[1].trim() : '';
    };
    const dtPosted = pegar('DTPOSTED');
    const trnAmt = pegar('TRNAMT');
    if(!dtPosted || !trnAmt) return;
    const ano = dtPosted.slice(0,4), mes = dtPosted.slice(4,6), dia = dtPosted.slice(6,8);
    if(!ano || !mes || !dia) return;
    // OFX usa notação padrão (ponto decimal), nunca o formato brasileiro — por isso usa
    // parseFloat direto em vez de parseMoeda (que ia interpretar errado o ponto).
    const valor = parseFloat(trnAmt.replace(',', '.'));
    if(isNaN(valor)) return;
    const memo = pegar('MEMO');
    const name = pegar('NAME');
    linhas.push({ data: dia + '/' + mes + '/' + ano, descricao: (name || memo || '(sem descrição)').trim(), valor });
  });
  return linhas;
}

/* ---------- Mapeamento de colunas (CSV/Excel) ---------- */

function iniciarMapeamentoCsvConciliacao_(linhasBrutas){
  concLinhasBrutas = linhasBrutas;
  document.getElementById('concCsvTemCabecalho').checked = true;
  const nCols = linhasBrutas.reduce((max, l) => Math.max(max, l.length), 0);
  const primeiraLinha = linhasBrutas[0] || [];
  const opcoesColuna = (sugestaoRegex) => {
    let sugerida = -1;
    for(let i = 0; i < nCols; i++){
      if(sugestaoRegex.test(String(primeiraLinha[i] || '').toLowerCase())){ sugerida = i; break; }
    }
    let html = '';
    for(let i = 0; i < nCols; i++){
      const rotulo = primeiraLinha[i] !== undefined && String(primeiraLinha[i]).trim() !== '' ? String(primeiraLinha[i]) : ('Coluna ' + (i+1));
      html += `<option value="${i}"${i === sugerida ? ' selected' : ''}>${esc(rotulo)}</option>`;
    }
    return html;
  };
  document.getElementById('concColData').innerHTML = opcoesColuna(/data|dt\b/);
  document.getElementById('concColDescricao').innerHTML = opcoesColuna(/descri|hist|memo|lan[çc]amento/);
  document.getElementById('concColValor').innerHTML = opcoesColuna(/valor|montante/);
  document.getElementById('concModoValor').value = 'sinal';
  document.getElementById('conciliacaoUploadBloco').classList.add('hidden');
  document.getElementById('conciliacaoResultadoBloco').classList.add('hidden');
  document.getElementById('conciliacaoMapeamento').classList.remove('hidden');
  atualizarPreviewMapeamentoConciliacao();
}
function cancelarMapeamentoCsvConciliacao(){
  concLinhasBrutas = null;
  document.getElementById('conciliacaoMapeamento').classList.add('hidden');
  document.getElementById('conciliacaoUploadBloco').classList.remove('hidden');
}
// Mostra as primeiras linhas do arquivo já destacando quais colunas foram escolhidas,
// pra pessoa confirmar visualmente antes de processar tudo.
function atualizarPreviewMapeamentoConciliacao(){
  const tabela = document.getElementById('concPreviewTabela');
  if(!tabela || !concLinhasBrutas) return;
  const temCabecalho = document.getElementById('concCsvTemCabecalho').checked;
  const colData = parseInt(document.getElementById('concColData').value, 10);
  const colDescricao = parseInt(document.getElementById('concColDescricao').value, 10);
  const colValor = parseInt(document.getElementById('concColValor').value, 10);
  const linhasPreview = (temCabecalho ? concLinhasBrutas.slice(1) : concLinhasBrutas).slice(0, 5);
  const destaca = (i, v) => (i === colData || i === colDescricao || i === colValor) ? `<b>${esc(String(v))}</b>` : esc(String(v));
  let html = '<thead><tr>';
  const nCols = concLinhasBrutas.reduce((max, l) => Math.max(max, l.length), 0);
  for(let i = 0; i < nCols; i++){
    html += `<th>${i === colData ? 'Data' : i === colDescricao ? 'Descrição' : i === colValor ? 'Valor' : ''}</th>`;
  }
  html += '</tr></thead><tbody>';
  linhasPreview.forEach(linha => {
    html += '<tr>' + Array.from({length: nCols}, (_, i) => `<td>${destaca(i, linha[i] !== undefined ? linha[i] : '')}</td>`).join('') + '</tr>';
  });
  html += '</tbody>';
  tabela.innerHTML = html;
}
function processarMapeamentoCsvConciliacao(){
  if(!concLinhasBrutas) return;
  const temCabecalho = document.getElementById('concCsvTemCabecalho').checked;
  const colData = parseInt(document.getElementById('concColData').value, 10);
  const colDescricao = parseInt(document.getElementById('concColDescricao').value, 10);
  const colValor = parseInt(document.getElementById('concColValor').value, 10);
  const modoValor = document.getElementById('concModoValor').value;
  const linhasDados = temCabecalho ? concLinhasBrutas.slice(1) : concLinhasBrutas;
  const linhas = [];
  linhasDados.forEach(linha => {
    const dataTxt = String(linha[colData] !== undefined ? linha[colData] : '').trim();
    const descricaoTxt = String(linha[colDescricao] !== undefined ? linha[colDescricao] : '').trim();
    const valorTxt = String(linha[colValor] !== undefined ? linha[colValor] : '').trim();
    if(!dataTxt || !valorTxt) return;
    const dataObj = paraDataObj(dataTxt);
    if(!dataObj) return;
    // parseMoeda espera o formato brasileiro (ponto = milhar, vírgula = decimal) — é o que
    // praticamente todo extrato de banco brasileiro usa em CSV/Excel.
    let valorAbs = Math.abs(parseMoeda(valorTxt));
    if(!valorAbs) return;
    let valor;
    if(modoValor === 'saida') valor = -valorAbs;
    else if(modoValor === 'entrada') valor = valorAbs;
    else valor = parseMoeda(valorTxt); // já vem com sinal
    linhas.push({ data: fmtDataExibir(dataTxt), descricao: descricaoTxt || '(sem descrição)', valor });
  });
  if(linhas.length === 0){ alert('Não encontrei nenhuma transação válida com essas colunas. Confira o mapeamento.'); return; }
  concLinhasBrutas = null;
  document.getElementById('conciliacaoMapeamento').classList.add('hidden');
  iniciarConciliacaoComLinhas_(linhas);
}

/* ---------- Conciliação (comparação com o que já existe no painel) ---------- */

function iniciarConciliacaoComLinhas_(linhasBanco){
  conciliacaoLinhas = linhasBanco
    .map(l => conciliarUmaLinhaBanco_(l))
    .sort((a,b) => (paraDataObj(b.data) || 0) - (paraDataObj(a.data) || 0));
  document.getElementById('conciliacaoUploadBloco').classList.add('hidden');
  document.getElementById('conciliacaoMapeamento').classList.add('hidden');
  document.getElementById('conciliacaoResultadoBloco').classList.remove('hidden');
  renderConciliacaoTabela();
}
function reiniciarConciliacao(){
  conciliacaoLinhas = [];
  concLinhasBrutas = null;
  document.getElementById('conciliacaoArquivo').value = '';
  document.getElementById('conciliacaoResultadoBloco').classList.add('hidden');
  document.getElementById('conciliacaoMapeamento').classList.add('hidden');
  document.getElementById('conciliacaoUploadBloco').classList.remove('hidden');
}
function conciliarUmaLinhaBanco_(l){
  const linha = { data: l.data, descricaoBanco: l.descricao, valor: l.valor, status: 'sem_correspondencia', matchTipo: null, matchId: null, matchDescricao: '', cadastroAberto: false };
  const valorAbs = Math.abs(l.valor);
  if(valorAbs < CONCILIACAO_TOLERANCIA_VALOR){ linha.status = 'ignorado'; return linha; }

  if(l.valor > 0){
    // ENTRADA de dinheiro: só pode ser uma conta "a receber".
    const pago = financeiroAtivos().find(f => f.tipo === 'receber' && f.status === 'pago' && Math.abs((f.valor||0) - valorAbs) < CONCILIACAO_TOLERANCIA_VALOR && diferencaDiasConciliacao_(f.dataPagamento, l.data) <= CONCILIACAO_TOLERANCIA_DIAS);
    if(pago){ linha.status = 'conciliado'; linha.matchTipo = 'receber'; linha.matchId = pago.id; linha.matchDescricao = pago.descricao; return linha; }
    const pendentes = financeiroAtivos().filter(f => f.tipo === 'receber' && f.status === 'pendente' && Math.abs((f.valor||0) - valorAbs) < CONCILIACAO_TOLERANCIA_VALOR);
    if(pendentes.length){
      pendentes.sort((a,b) => diferencaDiasConciliacao_(a.vencimento, l.data) - diferencaDiasConciliacao_(b.vencimento, l.data));
      linha.status = 'pendente_encontrado'; linha.matchTipo = 'receber'; linha.matchId = pendentes[0].id; linha.matchDescricao = pendentes[0].descricao;
    }
  } else {
    // SAÍDA de dinheiro: pode ser uma conta "a pagar" já cadastrada OU uma Compra.
    const pago = financeiroAtivos().find(f => f.tipo === 'pagar' && f.status === 'pago' && Math.abs((f.valor||0) - valorAbs) < CONCILIACAO_TOLERANCIA_VALOR && diferencaDiasConciliacao_(f.dataPagamento, l.data) <= CONCILIACAO_TOLERANCIA_DIAS);
    if(pago){ linha.status = 'conciliado'; linha.matchTipo = 'pagar'; linha.matchId = pago.id; linha.matchDescricao = pago.descricao; return linha; }
    const compra = comprasAtivos().find(c => Math.abs((c.valor||0) - valorAbs) < CONCILIACAO_TOLERANCIA_VALOR && diferencaDiasConciliacao_(c.data, l.data) <= CONCILIACAO_TOLERANCIA_DIAS);
    if(compra){ linha.status = 'conciliado'; linha.matchTipo = 'compra'; linha.matchId = compra.id; linha.matchDescricao = compra.descricao; return linha; }
    const pendentes = financeiroAtivos().filter(f => f.tipo === 'pagar' && f.status === 'pendente' && Math.abs((f.valor||0) - valorAbs) < CONCILIACAO_TOLERANCIA_VALOR);
    if(pendentes.length){
      pendentes.sort((a,b) => diferencaDiasConciliacao_(a.vencimento, l.data) - diferencaDiasConciliacao_(b.vencimento, l.data));
      linha.status = 'pendente_encontrado'; linha.matchTipo = 'pagar'; linha.matchId = pendentes[0].id; linha.matchDescricao = pendentes[0].descricao;
    }
  }
  return linha;
}

/* ---------- Ações de cada linha ---------- */

// Confirma que uma conta pendente é mesmo a transação do banco — reaproveita
// efetivarPagamentoFinanceiro_ (ver 10-financeiro.js), a mesma função usada pelo pop-up
// "Confirmar recebimento/pagamento", só que com a data que veio do extrato do banco.
function conciliacaoConfirmarPendente(idx){
  const linha = conciliacaoLinhas[idx];
  if(!linha) return;
  const f = state.financeiro.find(x => x.id === linha.matchId);
  if(!f){ alert('Esse lançamento não existe mais no painel.'); linha.status = 'sem_correspondencia'; renderConciliacaoTabela(); return; }
  const dataIso = linha.data; // já em dd/mm/aaaa
  if(!confirm('Confirmar "' + f.descricao + '" como ' + (f.tipo === 'receber' ? 'recebido' : 'pago') + ' em ' + dataIso + ', valor R$ ' + fmtMoeda(Math.abs(linha.valor)) + '?')) return;
  efetivarPagamentoFinanceiro_(f, { valorLiquido: Math.abs(linha.valor), data: dataIso, formaPagamento: f.formaPagamentoConfirmada || 'Outro', desconto: 0 });
  linha.status = 'conciliado';
  linha.matchDescricao = f.descricao;
  marcarAlterado();
  renderFinanceiro();
  renderOrcamentos();
  renderConciliacaoTabela();
}
function conciliacaoAbrirCadastro(idx){
  if(!conciliacaoLinhas[idx]) return;
  conciliacaoLinhas[idx].cadastroAberto = true;
  renderConciliacaoTabela();
}
function conciliacaoFecharCadastro(idx){
  if(!conciliacaoLinhas[idx]) return;
  conciliacaoLinhas[idx].cadastroAberto = false;
  renderConciliacaoTabela();
}
// Mostra/esconde Fornecedor (só faz sentido pra Compra) e Cliente (só faz sentido pra "A
// receber") conforme o destino escolhido, sem re-renderizar a linha inteira — assim não
// perde o que a pessoa já tiver digitado nos outros campos.
function conciliacaoAtualizarCamposDestino(idx){
  const destino = document.getElementById('concDestino_' + idx).value;
  const campoFornecedor = document.getElementById('concCampoFornecedor_' + idx);
  const campoCliente = document.getElementById('concCampoCliente_' + idx);
  if(campoFornecedor) campoFornecedor.classList.toggle('hidden', destino !== 'compra');
  if(campoCliente) campoCliente.classList.toggle('hidden', destino !== 'receber');
}
function conciliacaoSalvarCadastro(idx){
  const linha = conciliacaoLinhas[idx];
  if(!linha) return;
  const destino = document.getElementById('concDestino_' + idx).value;
  const descricao = document.getElementById('concDescricao_' + idx).value.trim();
  if(!descricao){ alert('Informe a descrição.'); return; }
  const categoria = document.getElementById('concCategoria_' + idx).value.trim();
  const valorAbs = Math.abs(linha.valor);

  if(destino === 'compra'){
    const fornecedor = document.getElementById('concFornecedor_' + idx).value.trim();
    const c = {
      id: uid('compra'),
      descricao,
      fornecedor,
      categoria,
      valor: valorAbs,
      data: linha.data,
      formaPagamento: 'Outro',
      obs: 'Cadastrado via conciliação bancária.',
      comprovanteUrl: '',
      comprovanteNome: ''
    };
    state.compras.push(c);
    linha.status = 'conciliado';
    linha.matchTipo = 'compra';
    linha.matchId = c.id;
    linha.matchDescricao = c.descricao;
    linha.cadastroAberto = false;
    marcarAlterado();
    renderCompras();
  } else {
    const elCliente = document.getElementById('concCliente_' + idx);
    const clienteId = (destino === 'receber' && elCliente) ? (elCliente.value || null) : null;
    const f = {
      id: uid('financeiro'),
      tipo: destino,
      descricao,
      categoria,
      clienteId,
      vencimento: linha.data,
      boletoUrl: '', boletoNome: '', comprovanteUrl: '', comprovanteNome: '',
      valor: valorAbs,
      status: 'pendente'
    };
    state.financeiro.push(f);
    efetivarPagamentoFinanceiro_(f, { valorLiquido: valorAbs, data: linha.data, formaPagamento: 'Outro', desconto: 0 });
    linha.status = 'conciliado';
    linha.matchTipo = destino;
    linha.matchId = f.id;
    linha.matchDescricao = f.descricao;
    linha.cadastroAberto = false;
    marcarAlterado();
    renderFinanceiro();
  }
  renderConciliacaoTabela();
}

/* ---------- Renderização ---------- */

function rotuloStatusConciliacao_(status){
  if(status === 'conciliado') return '<span class="badge pago">✓ Conciliado</span>';
  if(status === 'pendente_encontrado') return '<span class="badge pendente">⚠ Pendente encontrado</span>';
  if(status === 'ignorado') return '<span class="badge parcela">Ignorado</span>';
  return '<span class="badge vencido">Sem correspondência</span>';
}
function rotuloMatchTipo_(tipo){
  if(tipo === 'compra') return 'Compra';
  if(tipo === 'pagar') return 'Conta a pagar';
  return 'Conta a receber';
}
function renderFormCadastroConciliacao_(linha, idx){
  const destinoPadrao = linha.valor >= 0 ? 'receber' : 'pagar';
  const opcoesDestino = linha.valor >= 0
    ? `<option value="receber">A receber</option>`
    : `<option value="pagar">A pagar (conta)</option><option value="compra">Compra</option>`;
  const opcoesClientes = clientesAtivos().map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  return `
    <div class="form-card" style="margin:10px 0 0; box-shadow:none; border:1px dashed var(--line);">
      <div class="form-grid">
        <div class="field"><label>Destino</label><select id="concDestino_${idx}" onchange="conciliacaoAtualizarCamposDestino(${idx})">${opcoesDestino}</select></div>
        <div class="field"><label>Descrição</label><input id="concDescricao_${idx}" value="${esc(linha.descricaoBanco)}"></div>
        <div class="field"><label>Categoria</label><input id="concCategoria_${idx}"></div>
      </div>
      <div class="form-grid">
        <div class="field ${destinoPadrao === 'compra' ? '' : 'hidden'}" id="concCampoFornecedor_${idx}"><label>Fornecedor</label><input id="concFornecedor_${idx}"></div>
        <div class="field ${destinoPadrao === 'receber' ? '' : 'hidden'}" id="concCampoCliente_${idx}"><label>Cliente (opcional)</label><select id="concCliente_${idx}"><option value="">—</option>${opcoesClientes}</select></div>
      </div>
      <div class="form-actions">
        <button class="btn" onclick="conciliacaoSalvarCadastro(${idx})">Cadastrar como ${linha.valor >= 0 ? 'recebido' : 'pago/gasto'}</button>
        <button class="btn secondary" onclick="conciliacaoFecharCadastro(${idx})">Cancelar</button>
      </div>
    </div>`;
}
function renderConciliacaoTabela(){
  const tbody = document.getElementById('corpoTabelaConciliacao');
  if(!tbody) return;
  tbody.innerHTML = '';
  if(conciliacaoLinhas.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum arquivo importado ainda.</td></tr>';
  }
  conciliacaoLinhas.forEach((linha, idx) => {
    const tr = document.createElement('tr');
    const valorFmt = (linha.valor >= 0 ? '+ ' : '− ') + 'R$ ' + fmtMoeda(Math.abs(linha.valor));
    let acao = '—';
    if(linha.status === 'conciliado'){
      acao = `<span class="modal-sub" style="margin:0;">${esc(rotuloMatchTipo_(linha.matchTipo))}: ${esc(linha.matchDescricao)}</span>`;
    } else if(linha.status === 'pendente_encontrado'){
      acao = `<div style="display:flex; flex-direction:column; gap:6px; align-items:flex-start;">
        <span class="modal-sub" style="margin:0;">Parece ser: ${esc(linha.matchDescricao)}</span>
        <button class="btn-icon" style="width:auto; padding:4px 10px;" onclick="conciliacaoConfirmarPendente(${idx})">Confirmar com esta data</button>
      </div>`;
    } else if(linha.status === 'sem_correspondencia' && !linha.cadastroAberto){
      acao = `<button class="btn-icon" style="width:auto; padding:4px 10px;" onclick="conciliacaoAbrirCadastro(${idx})">+ Cadastrar</button>`;
    } else if(linha.status === 'sem_correspondencia' && linha.cadastroAberto){
      acao = 'Preencha abaixo ↓';
    }
    tr.innerHTML = `
      <td data-label="Data">${esc(linha.data)}</td>
      <td data-label="Descrição do banco">${esc(linha.descricaoBanco)}</td>
      <td data-label="Valor" style="color:${linha.valor >= 0 ? 'var(--green)' : 'var(--red)'};">${valorFmt}</td>
      <td data-label="Status">${rotuloStatusConciliacao_(linha.status)}</td>
      <td data-label="Ação">${acao}</td>`;
    tbody.appendChild(tr);
    if(linha.status === 'sem_correspondencia' && linha.cadastroAberto){
      const trForm = document.createElement('tr');
      trForm.innerHTML = `<td colspan="5">${renderFormCadastroConciliacao_(linha, idx)}</td>`;
      tbody.appendChild(trForm);
    }
  });
  renderCardsConciliacao();
}
function renderCardsConciliacao(){
  const el = document.getElementById('cardsResumoConciliacao');
  if(!el) return;
  const total = conciliacaoLinhas.length;
  if(total === 0){ el.innerHTML = ''; return; }
  const conciliados = conciliacaoLinhas.filter(l => l.status === 'conciliado').length;
  const pendentes = conciliacaoLinhas.filter(l => l.status === 'pendente_encontrado').length;
  const semCorrespondencia = conciliacaoLinhas.filter(l => l.status === 'sem_correspondencia').length;
  el.innerHTML = `
    <div class="card"><div class="label">Transações no arquivo</div><div class="value">${total}</div><div class="sub">importadas do extrato</div></div>
    <div class="card"><div class="label">Conciliadas</div><div class="value green">${conciliados}</div><div class="sub">já batem com o painel</div></div>
    <div class="card"><div class="label">Pendentes encontradas</div><div class="value">${pendentes}</div><div class="sub">contas no painel que parecem ser essas</div></div>
    <div class="card"><div class="label">Sem correspondência</div><div class="value ${semCorrespondencia > 0 ? 'red' : ''}">${semCorrespondencia}</div><div class="sub">ainda não cadastradas no painel</div></div>
  `;
}
