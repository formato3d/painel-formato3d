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
   PARCELAS INTERNAS — helpers de leitura
   Diferente do "parcelamento automático" abaixo (que cria vários LANÇAMENTOS
   separados), isso é UM lançamento só que guarda, dentro de si (f.parcelas), o jeito
   como o valor total vai ser recebido/pago em partes — ex.: 50% no fechamento + 50%
   na entrega. Cada parte tem seu próprio valor, vencimento, status e comprovante,
   mas continua aparecendo como UMA linha na tabela (com o detalhamento embaixo).
   Lançamentos antigos (sem f.parcelas) continuam funcionando exatamente como sempre
   — todas essas funções caem de volta no comportamento de hoje quando não há parcelas.
   ========================================================= */
function temParcelas(f){ return !!(f && f.parcelas && f.parcelas.length); }
function parcelasPagas(f){ return temParcelas(f) ? f.parcelas.filter(p => p.status === 'pago') : []; }
function parcelasPendentes(f){ return temParcelas(f) ? f.parcelas.filter(p => p.status !== 'pago') : []; }
// Valor total do lançamento: soma das parcelas quando tem, senão o campo valor de sempre.
function valorTotalEntry(f){
  return temParcelas(f) ? f.parcelas.reduce((s,p) => s + (p.valor || 0), 0) : (f.valor || 0);
}
// Quanto já entrou/saiu de verdade (parcelas já pagas, ou o valor inteiro se o
// lançamento simples já está pago) — é o que conta pros cards de Saídas/Recebido/Saldo.
function valorEfetivadoEntry(f){
  if(temParcelas(f)) return parcelasPagas(f).reduce((s,p) => s + (p.valor || 0), 0);
  return f.status === 'pago' ? (f.valor || 0) : 0;
}
// Quanto ainda falta receber/pagar desse lançamento.
function valorPendenteEntry(f){
  return Math.max(0, valorTotalEntry(f) - valorEfetivadoEntry(f));
}
// 'pendente' (nenhuma parcela paga) / 'parcial' (algumas) / 'pago' (todas) — pra
// lançamentos sem parcelas, continua sendo só o f.status de sempre (pendente/pago).
function statusResumoEntry(f){
  if(!temParcelas(f)) return f.status === 'pago' ? 'pago' : 'pendente';
  const pagasN = parcelasPagas(f).length, total = f.parcelas.length;
  if(pagasN === 0) return 'pendente';
  if(pagasN === total) return 'pago';
  return 'parcial';
}
// Vencimento "que importa agora" pra ordenar/filtrar/avisar: a data da próxima parcela
// ainda pendente (a mais próxima) — ou, se já estiver tudo pago, a última data só de
// referência. Lançamento sem parcelas usa o campo vencimento de sempre.
function vencimentoEfetivoEntry(f){
  if(!temParcelas(f)) return f.vencimento;
  const pendentes = parcelasPendentes(f).filter(p => p.vencimento);
  const lista = pendentes.length ? pendentes : f.parcelas.filter(p => p.vencimento);
  if(!lista.length) return f.vencimento || '';
  const comparador = pendentes.length
    ? (a,b) => paraDataObj(a.vencimento) - paraDataObj(b.vencimento) // próxima pendente: a mais próxima primeiro
    : (a,b) => paraDataObj(b.vencimento) - paraDataObj(a.vencimento); // tudo pago: a última, só de referência
  return lista.slice().sort(comparador)[0].vencimento;
}
// Data efetiva "resumo": só existe uma data única quando o lançamento está 100% pago
// (a data da última parcela paga, ou a dataPagamento de sempre se não tem parcelas).
// Um lançamento "parcial" não tem uma única data efetiva — ver statusBadge na tabela.
function dataPagamentoEfetivaEntry(f){
  if(!temParcelas(f)) return (f.status === 'pago' && f.dataPagamento) ? f.dataPagamento : '';
  const pagas = parcelasPagas(f).filter(p => p.dataPagamento);
  if(!pagas.length) return '';
  return pagas.slice().sort((a,b) => paraDataObj(b.dataPagamento) - paraDataObj(a.dataPagamento))[0].dataPagamento;
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

/* =========================================================
   PARCELAS INTERNAS — edição no formulário
   O detalhamento (valor/vencimento/status/comprovante de cada parte) fica em
   ffParcelasEdit enquanto o formulário está aberto; só vira state.financeiro de
   verdade quando a pessoa clica em Salvar (igual ao resto do formulário). Dá pra
   ligar/desligar e editar tanto numa conta nova quanto numa já existente.
   ========================================================= */
let ffParcelasEdit = [];
function parcelaEditVazia(){
  return { id: uid('parcela'), valor: 0, vencimento: '', status: 'pendente', dataPagamento: '', comprovanteUrl: '', comprovanteNome: '' };
}
// Mostra/trava os campos principais (Valor, Vencimento, Status, Data efetiva, anexo de
// comprovante da conta) conforme a conta está vinculada a um orçamento e/ou usando
// parcelas internas — chamada sempre que um desses dois fatores muda.
function atualizarEstadoCamposPrincipaisFF(){
  const o = financeiroEditId ? orcamentoVinculado(state.financeiro.find(x => x.id === financeiroEditId)) : null;
  const usaParcelas = document.getElementById('ffUsarParcelas').checked;
  const valorTravado = !!o || usaParcelas;
  document.getElementById('ffValor').readOnly = valorTravado;
  document.getElementById('ffValor').classList.toggle('campo-travado', valorTravado);
  document.getElementById('ffCliente').disabled = !!o;
  document.getElementById('ffCliente').classList.toggle('campo-travado', !!o);
  // Vencimento, Status e Data efetiva "da conta inteira" só fazem sentido pra um
  // pagamento único — com parcelas internas, cada parte tem os seus.
  document.getElementById('ffVencimentoCampo').classList.toggle('hidden', usaParcelas);
  document.getElementById('ffStatusDataCampos').classList.toggle('hidden', usaParcelas);
  document.getElementById('ffAnexoComprovanteCampo').classList.toggle('hidden', usaParcelas);
  document.getElementById('ffParcelasResumoStatus').classList.toggle('hidden', !usaParcelas);
}
// Liga/desliga o uso de parcelas internas nesta conta.
function alternarUsoParcelas(){
  const ligado = document.getElementById('ffUsarParcelas').checked;
  if(ligado && ffParcelasEdit.length === 0){
    // Semeia com 2 parcelas de 50/50 a partir do que já foi digitado em Valor/Vencimento,
    // pro caso mais comum (ex.: sinal + entrega) — a pessoa ajusta valores/datas depois.
    const total = parseMoeda(document.getElementById('ffValor').value);
    const vencBase = document.getElementById('ffVencimento').value.trim();
    const valores = dividirValorEmParcelas(total, 2);
    ffParcelasEdit = [
      Object.assign(parcelaEditVazia(), { valor: valores[0], vencimento: vencBase && paraDataObj(vencBase) ? vencBase : hojeStr() }),
      Object.assign(parcelaEditVazia(), { valor: valores[1], vencimento: '' })
    ];
  } else if(!ligado && ffParcelasEdit.length > 0){
    const temAlgumaCoisa = ffParcelasEdit.some(p => p.valor || p.vencimento);
    if(temAlgumaCoisa && !confirm('Desligar vai descartar as parcelas preenchidas aqui (só muda de verdade se você clicar em Salvar depois).\n\nContinuar?')){
      document.getElementById('ffUsarParcelas').checked = true;
      return;
    }
    ffParcelasEdit = [];
  }
  document.getElementById('ffParcelasInternasCampos').classList.toggle('hidden', !ligado);
  atualizarEstadoCamposPrincipaisFF();
  renderFfParcelasLista();
}
function adicionarParcelaEdit(){
  ffParcelasEdit.push(parcelaEditVazia());
  renderFfParcelasLista();
}
function removerParcelaEdit(i){
  const p = ffParcelasEdit[i];
  if((p.valor || p.vencimento) && !confirm('Remover esta parcela do detalhamento?')) return;
  ffParcelasEdit.splice(i, 1);
  renderFfParcelasLista();
}
function atualizarParcelaCampo(i, campo, valor){
  if(!ffParcelasEdit[i]) return;
  ffParcelasEdit[i][campo] = campo === 'valor' ? parseMoeda(valor) : valor.trim();
  atualizarPreviewParcelasInternas();
}
function alternarStatusParcelaEdit(i){
  if(!ffParcelasEdit[i]) return;
  const status = document.getElementById('ffParcStatus_' + i).value;
  ffParcelasEdit[i].status = status;
  if(status === 'pago' && !ffParcelasEdit[i].dataPagamento){
    ffParcelasEdit[i].dataPagamento = hojeStr();
  }
  renderFfParcelasLista();
}
function removerAnexoParcelaEdit(i){
  ffParcelasEdit[i].comprovanteUrl = '';
  ffParcelasEdit[i].comprovanteNome = '';
  renderFfParcelasLista();
}
// Envia o comprovante de UMA parcela (mesmo endpoint/limites do anexo da conta inteira).
function processarAnexoParcela(input, i){
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
  const txtEl = document.querySelector('#ffParcAnexoUpload_' + i + ' .ph-txt');
  const txtOriginal = txtEl ? txtEl.innerHTML : '';
  if(txtEl) txtEl.innerHTML = '<b>Enviando...</b>';
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
        if(sessaoInvalida(resp.erro)){ voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
        if(resp.erro){ alert('Não foi possível enviar o arquivo: ' + resp.erro); input.value = ''; if(txtEl) txtEl.innerHTML = txtOriginal; return; }
        ffParcelasEdit[i].comprovanteUrl = resp.url;
        ffParcelasEdit[i].comprovanteNome = resp.nome || file.name;
        renderFfParcelasLista();
      })
      .catch(err => {
        if(txtEl) txtEl.innerHTML = txtOriginal;
        alert('Não foi possível enviar o arquivo agora — verifique sua internet.');
        input.value = '';
        console.error(err);
      });
  };
  reader.readAsDataURL(file);
}
// Soma das parcelas digitadas — vira o Valor (R$) mostrado (travado) lá em cima, e,
// se a conta estiver vinculada a um orçamento, compara com o total dele pra avisar
// se ainda não bate (o salvar bloqueia nesse caso — ver salvarFinanceiro).
function atualizarPreviewParcelasInternas(){
  const total = ffParcelasEdit.reduce((s,p) => s + (p.valor || 0), 0);
  document.getElementById('ffValor').value = fmtMoeda(total);
  const previewEl = document.getElementById('ffParcelasTotalPreview');
  if(!previewEl) return;
  const f = financeiroEditId ? state.financeiro.find(x => x.id === financeiroEditId) : null;
  const o = orcamentoVinculado(f);
  const pagasN = ffParcelasEdit.filter(p => p.status === 'pago').length;
  let texto = 'Total das parcelas: R$ ' + fmtMoeda(total) + ' (' + pagasN + ' de ' + ffParcelasEdit.length + ' já paga' + (ffParcelasEdit.length === 1 ? '' : 's') + ')';
  if(o && Math.round(total * 100) !== Math.round(o.total * 100)){
    texto += ' ⚠ não bate com o total do orçamento nº ' + o.numero + ' (R$ ' + fmtMoeda(o.total) + ') — ajuste antes de salvar.';
  }
  previewEl.textContent = texto;
  const resumoEl = document.getElementById('ffParcelasResumoTexto');
  if(resumoEl){
    resumoEl.textContent = pagasN === 0 ? 'Pendente' : (pagasN === ffParcelasEdit.length ? 'Pago' : 'Parcial');
  }
}
function renderFfParcelasLista(){
  const cont = document.getElementById('ffParcelasLista');
  cont.innerHTML = ffParcelasEdit.map((p, i) => `
    <div class="ff-parcela-linha">
      <div class="ff-parcela-linha-topo">
        <span class="ff-parcela-num">Parcela ${i+1}</span>
        <div class="field"><label>Valor (R$)</label><input id="ffParcValor_${i}" value="${fmtMoeda(p.valor)}" oninput="atualizarParcelaCampo(${i},'valor',this.value)"></div>
        <div class="field"><label>Vencimento</label><input id="ffParcVenc_${i}" placeholder="dd/mm/aaaa" value="${esc(p.vencimento)}" oninput="atualizarParcelaCampo(${i},'vencimento',this.value)"></div>
        <div class="field"><label>Status</label>
          <select id="ffParcStatus_${i}" onchange="alternarStatusParcelaEdit(${i})">
            <option value="pendente" ${p.status !== 'pago' ? 'selected' : ''}>Pendente</option>
            <option value="pago" ${p.status === 'pago' ? 'selected' : ''}>Pago/Recebido</option>
          </select>
        </div>
        <button type="button" class="btn-icon danger" onclick="removerParcelaEdit(${i})" title="Remover parcela">✕</button>
      </div>
      ${p.status === 'pago' ? `
      <div class="ff-parcela-linha-baixo">
        <div class="field"><label>Data do pagamento</label><input id="ffParcData_${i}" placeholder="dd/mm/aaaa" value="${esc(p.dataPagamento)}" oninput="atualizarParcelaCampo(${i},'dataPagamento',this.value)"></div>
        <div class="field">
          <label>Comprovante desta parcela</label>
          ${p.comprovanteUrl ? `
            <div class="file-preview">
              <a href="${esc(p.comprovanteUrl)}" target="_blank" rel="noopener">🧾 ${esc(p.comprovanteNome || 'comprovante')}</a>
              <button type="button" onclick="removerAnexoParcelaEdit(${i})">Remover</button>
            </div>` : `
            <div class="file-upload" id="ffParcAnexoUpload_${i}">
              <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onchange="processarAnexoParcela(this,${i})">
              <div class="ph-txt"><b>Anexar comprovante</b><br>PDF, JPG, PNG ou WEBP até 8MB</div>
            </div>`}
        </div>
      </div>` : ''}
    </div>
  `).join('') || '<p class="ff-parcela-vazio">Nenhuma parcela ainda — clique em "+ Adicionar parcela".</p>';
  atualizarPreviewParcelasInternas();
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
  // Se já tem data de pagamento registrada, mostra ela. Se já tá pago mas essa data nunca
  // foi preenchida (lançamentos antigos), sugere hoje — a pessoa ainda pode trocar antes de salvar.
  document.getElementById('ffDataPagamento').value = f.dataPagamento ? fmtDataExibir(f.dataPagamento) : (f.status === 'pago' ? hojeStr() : '');
  document.getElementById('ffAnexoBoleto').value = '';
  document.getElementById('ffAnexoComprovante').value = '';
  ffAnexos.boleto = f.boletoUrl ? { url: f.boletoUrl, nome: f.boletoNome || 'boleto' } : null;
  ffAnexos.comprovante = f.comprovanteUrl ? { url: f.comprovanteUrl, nome: f.comprovanteNome || 'comprovante' } : null;
  atualizarPreviewAnexo('boleto');
  atualizarPreviewAnexo('comprovante');

  // Parcelas internas (uma conta só, recebida/paga em partes — ver bloco acima). Se o
  // lançamento já tem (f.parcelas), carrega uma CÓPIA pra editar (cancelar não mexe no
  // que já estava salvo); senão começa desligado/vazio.
  ffParcelasEdit = temParcelas(f) ? JSON.parse(JSON.stringify(f.parcelas)) : [];
  document.getElementById('ffUsarParcelas').checked = ffParcelasEdit.length > 0;
  document.getElementById('ffParcelasInternasCampos').classList.toggle('hidden', ffParcelasEdit.length === 0);
  renderFfParcelasLista(); // já atualiza o Valor total e o "Status geral" a partir de ffParcelasEdit

  // Cliente e valor de um lançamento vinculado a um orçamento são controlados pelo
  // orçamento (pra nunca ficarem desencontrados) — edite lá se precisar mudar.
  const o = orcamentoVinculado(f);
  const avisoEl = document.getElementById('ffVinculoAviso');
  const linkEl = document.getElementById('ffVinculoLink');
  atualizarEstadoCamposPrincipaisFF();
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
// Preenche a Data efetiva com hoje quando o Status muda pra Pago/Recebido na tela, só por
// conveniência — a pessoa ainda pode trocar a data antes de salvar. Não mexe se a pessoa
// já tinha preenchido alguma data ali.
function atualizarCampoDataPagamento(){
  const status = document.getElementById('ffStatus').value;
  const campo = document.getElementById('ffDataPagamento');
  if(status === 'pago' && !campo.value.trim()){
    campo.value = hojeStr();
  }
}
function salvarFinanceiro(){
  const descricao = document.getElementById('ffDescricao').value.trim();
  if(!descricao){ alert('Informe a descrição.'); return; }
  const valorInformado = parseMoeda(document.getElementById('ffValor').value);
  const vencimentoInformado = document.getElementById('ffVencimento').value.trim();

  const parcelarAutomatico = !financeiroEditId && document.getElementById('ffParcelado').checked;
  const usarParcelasInternas = document.getElementById('ffUsarParcelas').checked && ffParcelasEdit.length > 0;
  if(parcelarAutomatico && usarParcelasInternas){
    alert('Escolha só uma das duas opções de parcelamento: "Parcelar esta conta automaticamente" (cria várias contas separadas) OU "Receber/pagar em partes" (uma conta só, com o detalhamento dentro). Desligue uma delas antes de salvar.');
    return;
  }

  // Parcelas internas: valida cada parte (valor, vencimento, e data de pagamento de
  // quem já está marcada como paga) antes de calcular o total/status/vencimento
  // "resumo" que vão pros campos de sempre do lançamento (ver helpers no topo do arquivo).
  let parcelasFinal = null;
  if(usarParcelasInternas){
    for(let i = 0; i < ffParcelasEdit.length; i++){
      const p = ffParcelasEdit[i];
      if(!p.valor || p.valor <= 0){ alert('Informe o valor da parcela ' + (i+1) + '.'); return; }
      if(!paraDataObj(p.vencimento)){ alert('Informe uma data de vencimento válida pra parcela ' + (i+1) + '.'); return; }
      if(p.status === 'pago' && !paraDataObj(p.dataPagamento)) p.dataPagamento = hojeStr();
    }
    const totalParcelas = ffParcelasEdit.reduce((s,p) => s + (p.valor || 0), 0);
    const oAtual = financeiroEditId ? orcamentoVinculado(state.financeiro.find(x => x.id === financeiroEditId)) : null;
    if(oAtual && Math.round(totalParcelas * 100) !== Math.round(oAtual.total * 100)){
      alert('A soma das parcelas (R$ ' + fmtMoeda(totalParcelas) + ') não bate com o total do orçamento nº ' + oAtual.numero + ' (R$ ' + fmtMoeda(oAtual.total) + '). Ajuste antes de salvar.');
      return;
    }
    parcelasFinal = ffParcelasEdit.map((p, i) => Object.assign({}, p, { numero: i + 1 }));
  }

  const dadosBase = {
    tipo: document.getElementById('ffTipo').value,
    descricao,
    categoria: document.getElementById('ffCategoria').value.trim(),
    clienteId: document.getElementById('ffCliente').value || null,
    boletoUrl: ffAnexos.boleto ? ffAnexos.boleto.url : '',
    boletoNome: ffAnexos.boleto ? ffAnexos.boleto.nome : '',
    comprovanteUrl: ffAnexos.comprovante ? ffAnexos.comprovante.url : '',
    comprovanteNome: ffAnexos.comprovante ? ffAnexos.comprovante.nome : ''
  };
  if(usarParcelasInternas){
    const statusCalc = statusResumoEntry({ parcelas: parcelasFinal });
    // O campo "status" de sempre só entende pendente/pago — "parcial" é calculado na
    // hora (ver statusResumoEntry) a partir de f.parcelas, não fica salvo aqui.
    dadosBase.status = statusCalc === 'pago' ? 'pago' : 'pendente';
    dadosBase.dataPagamento = statusCalc === 'pago' ? (dataPagamentoEfetivaEntry({ parcelas: parcelasFinal }) || '') : '';
    dadosBase.parcelas = parcelasFinal;
    dadosBase.valor = parcelasFinal.reduce((s,p) => s + (p.valor || 0), 0);
    dadosBase.vencimento = vencimentoEfetivoEntry({ parcelas: parcelasFinal }) || '';
  } else {
    dadosBase.status = document.getElementById('ffStatus').value;
    // Data efetiva (data que realmente foi pago/recebido) — só faz sentido quando o
    // status é Pago/Recebido; se a pessoa não informar, assume hoje. Voltando pra
    // Pendente, limpa (fica igual ao que já acontece no botão de desfazer pagamento).
    dadosBase.dataPagamento = dadosBase.status === 'pago' ? (document.getElementById('ffDataPagamento').value.trim() || hojeStr()) : '';
    dadosBase.parcelas = [];
    dadosBase.valor = valorInformado;
    dadosBase.vencimento = vencimentoInformado;
  }

  // Parcelamento automático só é oferecido pra lançamentos novos (ver abrirFormFinanceiro).
  const parcelar = parcelarAutomatico;
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
    if(financeiroEditId){
      const alvo = state.financeiro.find(x => x.id === financeiroEditId);
      Object.assign(alvo, dadosBase);
      // Trocar pra "sem parcelas" precisa apagar o que tinha antes (dadosBase.parcelas
      // já vem [] nesse caso) — Object.assign acima já cobre isso.
    } else {
      dadosBase.id = uid('financeiro');
      state.financeiro.push(dadosBase);
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
// Clicar no ✓ de uma conta pendente abre o pop-up de confirmação (valor, data do
// pagamento, forma de pagamento — ver abrirConfirmarPagamento); clicar no ↺ de uma conta
// já paga volta direto pra pendente, sem precisar confirmar de novo (é só desfazer).
function alternarStatusFinanceiro(id){
  const f = state.financeiro.find(x => x.id === id);
  if(!f) return;
  // Contas com parcelas internas não têm um ✓/↺ único — cada parte é marcada
  // separadamente na linha dela (ver alternarStatusParcela).
  if(temParcelas(f)) return;
  if(f.status === 'pago'){
    if(f.valorOriginal !== undefined){ f.valor = f.valorOriginal; delete f.valorOriginal; }
    delete f.dataPagamento;
    delete f.formaPagamentoConfirmada;
    delete f.descontoMaquininha;
    delete f.totalOrcamentoNoPagamento;
    f.status = 'pendente';
    desfazerConclusaoOrcamentoVinculado_(f);
    marcarAlterado();
    renderFinanceiro();
    renderOrcamentos();
    return;
  }
  abrirConfirmarPagamento(id);
}
// Quando o pagamento de uma venda vinculada a um orçamento é desfeito (volta pra
// pendente), o orçamento some de "Concluído" e volta pra "Aprovado" — só mexe se
// ainda estiver Concluído, pra não sobrescrever um status que a pessoa já tenha
// trocado manualmente por outro motivo.
function desfazerConclusaoOrcamentoVinculado_(f){
  if(!f.orcamentoId) return;
  const o = state.orcamentos.find(x => x.id === f.orcamentoId);
  if(!o || o.excluidoEm || o.status !== 'Concluído') return;
  o.status = 'Aprovado';
}
// Quando o pagamento de uma venda vinculada a um orçamento é confirmado, o orçamento
// passa a "Concluído" automaticamente na aba de Orçamentos — sem precisar editar os
// dois lugares à mão pra manter tudo consistente.
function concluirOrcamentoVinculado_(f){
  if(!f.orcamentoId) return;
  const o = state.orcamentos.find(x => x.id === f.orcamentoId);
  if(!o || o.excluidoEm || o.status === 'Concluído') return;
  o.status = 'Concluído';
  confirmarVendaSeNecessario(o);
}

/* =========================================================
   POP-UP DE CONFIRMAÇÃO DE PAGAMENTO/RECEBIMENTO
   Em vez de marcar como pago na hora com um clique só, pede pra conferir/ajustar valor,
   data e forma de pagamento — e, se for cartão de crédito numa conta a receber, permite
   informar o desconto da maquininha (juros), que já é abatido do valor registrado como
   recebido (fica certo no Saldo real desde a hora que é confirmado).
   ========================================================= */
let confirmarPagamentoId = null;
// Quando o pagamento é de UMA parcela interna (não da conta inteira), guarda o id dela
// aqui — ver alternarStatusParcela. null = é a conta inteira (comportamento de sempre).
let confirmarPagamentoParcelaId = null;
function abrirConfirmarPagamento(id, parcelaId){
  const f = state.financeiro.find(x => x.id === id);
  if(!f) return;
  confirmarPagamentoId = id;
  confirmarPagamentoParcelaId = parcelaId || null;
  const p = parcelaId ? (f.parcelas || []).find(x => x.id === parcelaId) : null;
  const alvoValor = p ? p.valor : f.valor;
  const sufixoTitulo = p ? (' — parcela ' + (f.parcelas.findIndex(x => x.id === p.id) + 1) + '/' + f.parcelas.length) : '';
  document.getElementById('confirmarPagamentoTitulo').textContent = (f.tipo === 'receber' ? 'Confirmar recebimento' : 'Confirmar pagamento') + sufixoTitulo;
  document.getElementById('confirmarPagamentoSub').textContent = (f.descricao || '') + ' — valor da ' + (p ? 'parcela' : 'conta') + ': R$ ' + fmtMoeda(alvoValor);
  document.getElementById('cfValor').value = fmtMoeda(alvoValor);
  document.getElementById('cfData').value = hojeStr();
  document.getElementById('cfFormaPagamento').value = 'Pix';
  document.getElementById('cfDesconto').value = '0,00';
  alternarDescontoConfirmarPagamento();
  document.getElementById('confirmarPagamentoWrap').classList.remove('hidden');
}
function fecharConfirmarPagamento(){
  document.getElementById('confirmarPagamentoWrap').classList.add('hidden');
  confirmarPagamentoId = null;
  confirmarPagamentoParcelaId = null;
}
// O desconto da maquininha só faz sentido pra dinheiro que está ENTRANDO (conta a
// receber) via cartão de crédito — é a taxa que a operadora desconta antes de cair na
// conta. Em qualquer outro caso (outra forma de pagamento, ou uma conta a pagar) o
// bloco fica escondido.
function alternarDescontoConfirmarPagamento(){
  const f = confirmarPagamentoId ? state.financeiro.find(x => x.id === confirmarPagamentoId) : null;
  const mostra = !!f && f.tipo === 'receber' && document.getElementById('cfFormaPagamento').value === 'Cartão de crédito';
  document.getElementById('cfDescontoBloco').classList.toggle('hidden', !mostra);
  atualizarPreviewDescontoConfirmarPagamento();
}
function atualizarPreviewDescontoConfirmarPagamento(){
  const previewEl = document.getElementById('cfDescontoPreview');
  if(!previewEl) return;
  if(document.getElementById('cfDescontoBloco').classList.contains('hidden')){ previewEl.textContent = ''; return; }
  const valor = parseMoeda(document.getElementById('cfValor').value);
  const desconto = parseMoeda(document.getElementById('cfDesconto').value);
  previewEl.textContent = desconto > 0 ? ('Valor líquido que entra no Saldo real: R$ ' + fmtMoeda(Math.max(0, valor - desconto))) : '';
}
// Efetiva de verdade um lançamento financeiro como pago/recebido — é o motor por trás
// do pop-up de confirmação (confirmarPagamentoSalvar) e também é reaproveitado pela
// Conciliação bancária (ver 15-conciliacao.js), pra garantir que confirmar um pagamento
// a partir do extrato do banco siga exatamente as mesmas regras (valorOriginal
// preservado, "foto" do orçamento vinculado, status do orçamento atualizado etc.) em vez
// de duplicar essa lógica em outro lugar.
function efetivarPagamentoFinanceiro_(f, { valorLiquido, data, formaPagamento, desconto }){
  if(f.valorOriginal === undefined) f.valorOriginal = f.valor;
  f.valor = valorLiquido;
  f.status = 'pago';
  f.dataPagamento = data;
  f.formaPagamentoConfirmada = formaPagamento;
  f.descontoMaquininha = desconto || 0;
  // "Foto" do total do orçamento no exato momento do pagamento — ver financeiroDessincronizado.
  if(f.orcamentoId){
    const oVinculado = state.orcamentos.find(x => x.id === f.orcamentoId);
    if(oVinculado) f.totalOrcamentoNoPagamento = oVinculado.total;
  }
  concluirOrcamentoVinculado_(f);
}
// Mesma ideia de efetivarPagamentoFinanceiro_, mas aplicada a UMA parcela interna (p)
// dentro da conta (f) — e, no final, recalcula o status geral da conta
// (pendente/parcial/pago) e sincroniza o orçamento vinculado só quando a conta
// INTEIRA terminar de ser paga (não a cada parcela).
function efetivarPagamentoParcela_(f, p, { valorLiquido, data, formaPagamento, desconto }){
  if(p.valorOriginal === undefined) p.valorOriginal = p.valor;
  p.valor = valorLiquido;
  p.status = 'pago';
  p.dataPagamento = data;
  p.formaPagamentoConfirmada = formaPagamento;
  p.descontoMaquininha = desconto || 0;
  sincronizarEntryAposParcela_(f);
}
function desfazerPagamentoParcela_(f, p){
  if(p.valorOriginal !== undefined){ p.valor = p.valorOriginal; delete p.valorOriginal; }
  delete p.dataPagamento;
  delete p.formaPagamentoConfirmada;
  delete p.descontoMaquininha;
  p.status = 'pendente';
  sincronizarEntryAposParcela_(f);
}
// Depois de pagar/desfazer uma parcela, recalcula os campos "resumo" da conta (status
// legado só entende pendente/pago — "parcial" é só pra UI, ver statusResumoEntry) e
// conclui/desfaz o orçamento vinculado igual já acontecia pro pagamento de conta inteira.
function sincronizarEntryAposParcela_(f){
  const statusR = statusResumoEntry(f);
  f.status = statusR === 'pago' ? 'pago' : 'pendente';
  f.dataPagamento = statusR === 'pago' ? (dataPagamentoEfetivaEntry(f) || '') : '';
  if(statusR === 'pago'){
    if(f.orcamentoId){
      const o = state.orcamentos.find(x => x.id === f.orcamentoId);
      if(o) f.totalOrcamentoNoPagamento = o.total;
    }
    concluirOrcamentoVinculado_(f);
  } else {
    desfazerConclusaoOrcamentoVinculado_(f);
  }
}
// Clicar no ✓/↺ de UMA parcela dentro do detalhamento de uma conta (ver renderFinanceiro).
function alternarStatusParcela(entryId, parcelaId){
  const f = state.financeiro.find(x => x.id === entryId);
  if(!f) return;
  const p = (f.parcelas || []).find(x => x.id === parcelaId);
  if(!p) return;
  if(p.status === 'pago'){
    desfazerPagamentoParcela_(f, p);
    marcarAlterado();
    renderFinanceiro();
    renderOrcamentos();
    return;
  }
  abrirConfirmarPagamento(entryId, parcelaId);
}
function confirmarPagamentoSalvar(){
  const f = state.financeiro.find(x => x.id === confirmarPagamentoId);
  if(!f) return;
  const valorInformado = parseMoeda(document.getElementById('cfValor').value);
  if(!valorInformado){ alert('Informe o valor.'); return; }
  const dataInformada = document.getElementById('cfData').value.trim();
  if(!paraDataObj(dataInformada)){ alert('Informe uma data válida (dd/mm/aaaa).'); return; }
  const formaPagamento = document.getElementById('cfFormaPagamento').value;
  const mostraDesconto = !document.getElementById('cfDescontoBloco').classList.contains('hidden');
  const desconto = mostraDesconto ? parseMoeda(document.getElementById('cfDesconto').value) : 0;
  const valorLiquido = Math.max(0, valorInformado - desconto);

  let statusFinalPago = true;
  if(confirmarPagamentoParcelaId){
    const p = (f.parcelas || []).find(x => x.id === confirmarPagamentoParcelaId);
    if(!p) return;
    efetivarPagamentoParcela_(f, p, { valorLiquido, data: dataInformada, formaPagamento, desconto });
    statusFinalPago = statusResumoEntry(f) === 'pago';
  } else {
    efetivarPagamentoFinanceiro_(f, { valorLiquido, data: dataInformada, formaPagamento, desconto });
  }

  const ehReceber = f.tipo === 'receber';
  marcarAlterado();
  fecharConfirmarPagamento();
  renderFinanceiro();
  renderOrcamentos();
  // Pagamento de uma venda (conta a receber) confirmado agora — oferece gerar o recibo na
  // hora. Só oferece quando a conta termina de ser paga (não a cada parcela parcial).
  if(ehReceber && statusFinalPago){
    if(confirm('Pagamento confirmado!\n\nDeseja gerar o recibo agora?')) abrirRecibo(f.id);
  }
}
// Vencido = tem parte pendente com vencimento já passado. Numa conta com parcelas
// internas, olha a próxima parcela pendente (vencimentoEfetivoEntry); sem parcelas, é
// o comportamento de sempre.
function estaVencido(f){
  if(statusResumoEntry(f) === 'pago') return false;
  const venc = vencimentoEfetivoEntry(f);
  if(!venc) return false;
  const d = paraDataObj(venc);
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
  document.getElementById('subtabFinCompras').classList.toggle('active', tipo === 'compras');
  const elSubtabConc = document.getElementById('subtabFinConciliacao');
  if(elSubtabConc) elSubtabConc.classList.toggle('active', tipo === 'conciliacao');
  // "Compras" é uma seção própria — campos e tabela diferentes de Financeiro (ver
  // 14-compras.js) — então em vez de reaproveitar a tabela/formulário de Contas a
  // pagar/receber, mostra o bloco certo e esconde o outro. "Conciliação" (ver
  // 15-conciliacao.js) é uma terceira seção própria, sem nada a ver com as duas.
  document.getElementById('blocoContasFinanceiro').classList.toggle('hidden', tipo === 'compras' || tipo === 'conciliacao');
  document.getElementById('blocoCompras').classList.toggle('hidden', tipo !== 'compras');
  const elBlocoConc = document.getElementById('blocoConciliacao');
  if(elBlocoConc) elBlocoConc.classList.toggle('hidden', tipo !== 'conciliacao');
  // A barra de filtros/botões de Contas a pagar/receber (mês, status, "+ Nova conta" etc.)
  // só faz sentido pra essas duas — na Conciliação ela só ocuparia espaço sem servir pra nada.
  const elTopo = document.getElementById('painelTopoFinanceiro');
  if(elTopo) elTopo.classList.toggle('hidden', tipo === 'conciliacao');
  if(tipo === 'compras'){
    renderCompras();
  } else if(tipo === 'conciliacao'){
    if(typeof renderConciliacaoTabela === 'function') renderConciliacaoTabela();
  } else {
    renderFinanceiro();
  }
}
// "YYYY-MM" a partir do vencimento de um lançamento — chave usada pelo filtro de mês.
function chaveMesFinanceiro(f){
  const d = paraDataObj(vencimentoEfetivoEntry(f));
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
// Ordenação da tabela de A pagar/A receber: clicar num cabeçalho ordena por aquela coluna
// (crescente); clicar de novo na mesma coluna inverte pra decrescente. Fica só na memória
// (não é salvo), reseta ao recarregar a página.
let financeiroOrdenacao = { campo: null, dir: 1 };
function ordenarFinanceiroPor(campo){
  if(financeiroOrdenacao.campo === campo){
    financeiroOrdenacao.dir *= -1;
  } else {
    financeiroOrdenacao.campo = campo;
    financeiroOrdenacao.dir = 1;
  }
  renderFinanceiro();
}
// Valor comparável de cada linha pra uma coluna de ordenação — null significa "sem valor"
// (ex: Data efetiva de uma conta ainda pendente), que sempre vai pro final da lista,
// nas duas direções, em vez de virar bagunça misturado com data mais antiga/mais nova.
function valorOrdenacaoFinanceiro_(f, campo){
  switch(campo){
    case 'descricao': return (f.descricao || '').toLowerCase();
    case 'categoria': return (f.categoria || '').toLowerCase();
    case 'cliente': return nomeClienteOpcional(f.clienteId).toLowerCase();
    case 'vencimento': return paraDataObj(vencimentoEfetivoEntry(f));
    case 'dataEfetiva': { const dt = dataPagamentoEfetivaEntry(f); return dt ? paraDataObj(dt) : null; }
    case 'valor': return valorTotalEntry(f);
    case 'status': return statusResumoEntry(f) === 'pago' ? 1 : (statusResumoEntry(f) === 'parcial' ? 0.5 : 0);
    default: return null;
  }
}
function atualizarIndicadoresOrdenacaoFinanceiro_(){
  ['descricao','categoria','cliente','vencimento','dataEfetiva','valor','status'].forEach(campo => {
    const el = document.getElementById('sortIndFin-' + campo);
    if(!el) return;
    el.textContent = financeiroOrdenacao.campo === campo ? (financeiroOrdenacao.dir === 1 ? '▲' : '▼') : '';
  });
}
// Lista que respeita os filtros atuais da tela: a sub-aba ativa (pagar/receber), o mês, o
// status, a busca por descrição/categoria, o cliente e a faixa de vencimento escolhidos.
// Usada tanto pra desenhar a tabela quanto pra exportar — a planilha exportada é sempre
// exatamente o que está na tela (já ordenada do jeito que a pessoa escolheu).
function financeiroFiltradoAtual(){
  const mesAno = document.getElementById('filtroMesFin').value;
  const filtroStatus = document.getElementById('filtroStatusFin').value;
  const elBusca = document.getElementById('filtroBuscaFin');
  const busca = elBusca ? elBusca.value.trim().toLowerCase() : '';
  const elCliente = document.getElementById('filtroClienteFin');
  const clienteId = elCliente ? elCliente.value : '';
  const elVencDe = document.getElementById('filtroVencimentoDe');
  const elVencAte = document.getElementById('filtroVencimentoAte');
  const vencDe = elVencDe ? paraDataObj(elVencDe.value.trim()) : null;
  const vencAte = elVencAte ? paraDataObj(elVencAte.value.trim()) : null;
  return financeiroAtivos()
    .filter(f => f.tipo === abaFinanceiroAtiva)
    .filter(f => !filtroStatus || statusResumoEntry(f) === filtroStatus)
    .filter(f => !mesAno || chaveMesFinanceiro(f) === mesAno)
    .filter(f => !busca || (f.descricao||'').toLowerCase().includes(busca) || (f.categoria||'').toLowerCase().includes(busca))
    .filter(f => !clienteId || f.clienteId === clienteId)
    .filter(f => {
      if(!vencDe && !vencAte) return true;
      const d = paraDataObj(vencimentoEfetivoEntry(f));
      if(!d) return false;
      if(vencDe && d < vencDe) return false;
      if(vencAte && d > vencAte) return false;
      return true;
    })
    .sort((a,b) => {
      if(!financeiroOrdenacao.campo) return 0;
      const va = valorOrdenacaoFinanceiro_(a, financeiroOrdenacao.campo);
      const vb = valorOrdenacaoFinanceiro_(b, financeiroOrdenacao.campo);
      if(va === null && vb === null) return 0;
      if(va === null) return 1;
      if(vb === null) return -1;
      if(va < vb) return -1 * financeiroOrdenacao.dir;
      if(va > vb) return 1 * financeiroOrdenacao.dir;
      return 0;
    });
}
function renderFinanceiro(){
  preencherFiltroMesFin();
  atualizarIndicadoresOrdenacaoFinanceiro_();
  const tbody = document.getElementById('corpoTabelaFinanceiro');
  tbody.innerHTML = '';
  const lista = financeiroFiltradoAtual();
  if(lista.length === 0){
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Nenhum lançamento encontrado.</td></tr>';
  }
  lista.forEach(f => {
    const tr = document.createElement('tr');
    tr.id = 'financeiro-linha-' + f.id;
    const comParcelas = temParcelas(f);
    const statusR = statusResumoEntry(f);
    const vencido = estaVencido(f);
    const detalhePagamento = statusR === 'pago' && !comParcelas && (f.dataPagamento || f.formaPagamentoConfirmada)
      ? [f.dataPagamento ? ('em ' + fmtDataExibir(f.dataPagamento)) : '', f.formaPagamentoConfirmada || '', f.descontoMaquininha ? ('desconto de R$ ' + fmtMoeda(f.descontoMaquininha) + ' na maquininha') : ''].filter(Boolean).join(' · ')
      : '';
    const statusBadge = statusR === 'pago'
      ? `<span class="badge pago"${detalhePagamento ? ` title="${esc(detalhePagamento)}"` : ''}>Pago/Recebido</span>`
      : statusR === 'parcial'
        ? `<span class="badge parcial" title="${esc(parcelasPagas(f).length + ' de ' + f.parcelas.length + ' parcelas pagas — falta R$ ' + fmtMoeda(valorPendenteEntry(f)))}">Parcial</span>`
        : (vencido ? '<span class="badge vencido">Vencido</span>' : '<span class="badge pendente">Pendente</span>');
    const dessincronizado = financeiroDessincronizado(f);
    const avisoDessinc = dessincronizado
      ? ' <span class="badge desencontrado" title="O orçamento vinculado mudou depois desse pagamento já confirmado (valor ou cliente diferente do que foi cobrado) — confira e ajuste manualmente.">⚠ orçamento mudou</span>'
      : '';
    const anexos = `${f.boletoUrl ? `<a href="${esc(f.boletoUrl)}" target="_blank" rel="noopener" title="Abrir boleto${f.boletoNome ? ': ' + esc(f.boletoNome) : ''}">📄</a>` : ''}${f.comprovanteUrl ? `<a href="${esc(f.comprovanteUrl)}" target="_blank" rel="noopener" title="Abrir comprovante${f.comprovanteNome ? ': ' + esc(f.comprovanteNome) : ''}">🧾</a>` : ''}`;
    const parcelaBadge = f.parcelaTotal
      ? ` <span class="badge parcela" title="Parcela ${f.parcelaNum} de ${f.parcelaTotal} desta compra/venda">${f.parcelaNum}/${f.parcelaTotal}</span>`
      : '';
    const parcelasBadge = comParcelas
      ? ` <span class="badge parcelas-internas" title="Essa conta é recebida/paga em ${f.parcelas.length} partes — veja o detalhamento abaixo">${f.parcelas.length}x</span>`
      : '';
    // Data em que a transação foi efetivamente concluída — diferente do Vencimento (a data
    // combinada/prevista lá no orçamento). Numa conta com parcelas, só existe uma data única
    // quando TODAS as partes já foram pagas; "parcial" mostra quantas já foram.
    const dataPagamentoTxt = comParcelas
      ? (statusR === 'pago' ? fmtDataExibir(dataPagamentoEfetivaEntry(f)) : (statusR === 'parcial' ? (parcelasPagas(f).length + '/' + f.parcelas.length + ' pagas') : '—'))
      : (statusR === 'pago' && f.dataPagamento ? fmtDataExibir(f.dataPagamento) : '—');
    tr.innerHTML = `
      <td data-label="Descrição">${esc(f.descricao)}${parcelaBadge}${parcelasBadge}</td>
      <td data-label="Categoria">${esc(f.categoria)}</td>
      <td data-label="Cliente">${esc(nomeClienteOpcional(f.clienteId))}</td>
      <td data-label="Vencimento">${fmtDataExibir(vencimentoEfetivoEntry(f))}</td>
      <td data-label="Data efetiva">${dataPagamentoTxt}</td>
      <td data-label="Valor">R$ ${fmtMoeda(valorTotalEntry(f))}</td>
      <td data-label="Status">${statusBadge}${avisoDessinc}</td>
      <td class="anexos-cell" data-label="Anexos">${anexos || '—'}</td>
      <td class="acoes">
        ${comParcelas ? '' : `<button class="btn-icon" onclick="alternarStatusFinanceiro('${f.id}')" title="Marcar como ${f.status === 'pendente' ? 'pago/recebido' : 'pendente'}">${f.status === 'pendente' ? '✓' : '↺'}</button>`}
        ${dessincronizado ? `<button class="btn-icon" onclick="atualizarFinanceiroComOrcamento('${f.id}')" title="Atualizar lançamento com os dados atuais do orçamento">🔄</button>` : ''}
        ${(f.tipo === 'receber' && statusR === 'pago') ? `<button class="btn-icon" onclick="abrirRecibo('${f.id}')" title="Gerar/imprimir recibo">🧾</button>` : ''}
        <button class="btn-icon" onclick="abrirFormFinanceiro('${f.id}')" title="Editar">✎</button>
        <button class="btn-icon danger" onclick="excluirFinanceiro('${f.id}')" title="Excluir">✕</button>
      </td>`;
    tbody.appendChild(tr);
    if(comParcelas){
      f.parcelas.forEach((p, idx) => tbody.appendChild(linhaParcelaFinanceiro_(f, p, idx)));
    }
  });
  renderCardsFinanceiro();
}
// Uma linha de detalhamento (sub-linha) embaixo da conta, pra cada parcela interna —
// mesmas colunas da linha principal, só que com os dados daquela parte específica.
function linhaParcelaFinanceiro_(f, p, idx){
  const tr = document.createElement('tr');
  tr.className = 'financeiro-linha-parcela';
  const pago = p.status === 'pago';
  const parcelaVencida = !pago && (() => { const d = paraDataObj(p.vencimento); if(!d) return false; const hoje = new Date(); hoje.setHours(0,0,0,0); return d < hoje; })();
  const statusBadge = pago ? '<span class="badge pago">Pago/Recebido</span>' : (parcelaVencida ? '<span class="badge vencido">Vencido</span>' : '<span class="badge pendente">Pendente</span>');
  const detalhe = pago && (p.dataPagamento || p.formaPagamentoConfirmada)
    ? [p.dataPagamento ? ('em ' + fmtDataExibir(p.dataPagamento)) : '', p.formaPagamentoConfirmada || '', p.descontoMaquininha ? ('desconto de R$ ' + fmtMoeda(p.descontoMaquininha) + ' na maquininha') : ''].filter(Boolean).join(' · ')
    : '';
  const anexo = p.comprovanteUrl ? `<a href="${esc(p.comprovanteUrl)}" target="_blank" rel="noopener" title="Abrir comprovante${p.comprovanteNome ? ': ' + esc(p.comprovanteNome) : ''}">🧾</a>` : '—';
  tr.innerHTML = `
    <td data-label="Descrição">↳ Parcela ${idx+1}/${f.parcelas.length}</td>
    <td data-label="Categoria"></td>
    <td data-label="Cliente"></td>
    <td data-label="Vencimento">${fmtDataExibir(p.vencimento)}</td>
    <td data-label="Data efetiva">${pago && p.dataPagamento ? fmtDataExibir(p.dataPagamento) : '—'}</td>
    <td data-label="Valor">R$ ${fmtMoeda(p.valor)}</td>
    <td data-label="Status"${detalhe ? ` title="${esc(detalhe)}"` : ''}>${statusBadge}</td>
    <td class="anexos-cell" data-label="Anexos">${anexo}</td>
    <td class="acoes">
      <button class="btn-icon" onclick="alternarStatusParcela('${f.id}','${p.id}')" title="Marcar como ${pago ? 'pendente' : 'pago/recebido'}">${pago ? '↺' : '✓'}</button>
    </td>`;
  return tr;
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
// Valor "bruto" recebido — o valor que de fato bate com o total do orçamento, somando
// de volta o desconto da maquininha (se teve) ao valor líquido guardado em f.valor. Usado
// só pra MOSTRAR o de/para em atualizarFinanceiroComOrcamento, não mais pra detectar
// desencontro (ver financeiroDessincronizado).
function valorBrutoRecebido(f){
  return (f.valor || 0) + (f.descontoMaquininha || 0);
}
// true quando um lançamento "a receber" vinculado a um orçamento já foi pago, mas o
// orçamento MUDOU DEPOIS que o pagamento foi confirmado (valor ou cliente diferente do que
// foi cobrado na hora) — como pagamentos confirmados não são sobrescritos automaticamente,
// isso pede uma checada manual.
//
// A comparação de valor usa f.totalOrcamentoNoPagamento — uma "foto" do total do orçamento
// tirada no exato momento em que o pagamento foi confirmado (ver confirmarPagamentoSalvar) —
// em vez de tentar reconstituir o bruto a partir do valor líquido recebido. Isso importa
// porque o valor realmente recebido no cartão quase nunca bate centavo a centavo com o total
// do orçamento (taxa da maquininha varia por bandeira/parcelamento e nem sempre é digitada
// certinha no desconto na hora de confirmar) — isso é normal e não é um desencontro de
// verdade. O que É um desencontro de verdade é o orçamento ter sido alterado DEPOIS do
// pagamento já confirmado, e é exatamente isso que essa comparação pega.
// Lançamentos pagos antes dessa mudança (sem a "foto" salva) não têm como comparar o valor
// com segurança, então só continuam checando o cliente.
function financeiroDessincronizado(f){
  if(!f.orcamentoId || f.status !== 'pago') return false;
  const o = state.orcamentos.find(x => x.id === f.orcamentoId);
  if(!o || o.excluidoEm) return false;
  if(f.clienteId !== o.clienteId) return true;
  if(f.totalOrcamentoNoPagamento === undefined) return false;
  return Math.round(o.total * 100) !== Math.round(f.totalOrcamentoNoPagamento * 100);
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
  const brutoAtual = valorBrutoRecebido(f);
  const mudaValor = Math.round(brutoAtual * 100) !== Math.round(o.total * 100);
  const mudaCliente = f.clienteId !== o.clienteId;
  if(!mudaValor && !mudaCliente) return;
  const linhas = [];
  if(mudaValor) linhas.push('Valor: R$ ' + fmtMoeda(brutoAtual) + ' → R$ ' + fmtMoeda(o.total) + (f.descontoMaquininha ? ' (o desconto da maquininha de R$ ' + fmtMoeda(f.descontoMaquininha) + ' continua sendo descontado)' : ''));
  if(mudaCliente) linhas.push('Cliente: ' + (nomeClienteOpcional(f.clienteId) || '(nenhum)') + ' → ' + (nomeClienteOpcional(o.clienteId) || '(nenhum)'));
  const confirmou = confirm(
    'Atualizar este lançamento pra bater com o orçamento nº ' + o.numero + '?\n\n' + linhas.join('\n') +
    '\n\nEssa conta já está marcada como paga/recebida — só confirme se o valor recebido de verdade mudou.'
  );
  if(!confirmou) return;
  // Mantém o desconto da maquininha já aplicado: o que muda é o valor bruto do
  // orçamento, o valor líquido recebido continua sendo o bruto novo menos esse desconto.
  f.valor = Math.max(0, o.total - (f.descontoMaquininha || 0));
  f.clienteId = o.clienteId;
  f.totalOrcamentoNoPagamento = o.total; // atualiza a "foto" pra não continuar desencontrado
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
  const valorRecibo = valorTotalEntry(f);
  document.getElementById('reValorNum').textContent = 'R$ ' + fmtMoeda(valorRecibo);
  document.getElementById('reValorExtenso').textContent = valorPorExtenso(valorRecibo);
  const pagoPor = nomeClienteOpcional(f.clienteId) || 'Cliente';
  document.getElementById('rePagoPor').textContent = pagoPor;
  document.getElementById('reFormaPagamento').textContent = (o && o.formasPagamento && o.formasPagamento.length) ? o.formasPagamento.join(', ') : '—';
  document.getElementById('reReferente').textContent = f.descricao || '';
  document.getElementById('reTexto').textContent = 'Recebi de ' + pagoPor + ' a importância de R$ ' + fmtMoeda(valorRecibo) + ' (' + valorPorExtenso(valorRecibo).toLowerCase() + '), referente a ' + (f.descricao || 'pagamento') + '. Para clareza firmo o presente recibo.';
  document.getElementById('reResponsavel').textContent = state.empresa.responsavel || state.empresa.nome;
  document.getElementById('reAssinaturaDoc').textContent = state.empresa.nome + ' · CNPJ ' + (state.empresa.cnpj || '');

  document.getElementById('printAreaRecibo').classList.add('ativo');
  document.getElementById('printArea').classList.remove('ativo');
  const areaCatalogoRecibo = document.getElementById('printAreaCatalogo');
  if(areaCatalogoRecibo) areaCatalogoRecibo.classList.remove('ativo');
  document.body.classList.add('modo-impressao');
  window.print();
}
// Soma dos lançamentos pendentes de um tipo ("pagar"/"receber"), opcionalmente só
// os que vencem no mês/ano atual — usado nos cards pra separar "tudo que ainda vou
// receber/pagar, algum dia" da previsão do mês corrente.
function totalFinanceiroPendente(tipo, apenasMesAtual){
  const hoje = new Date();
  return financeiroAtivos()
    .filter(f => f.tipo === tipo && valorPendenteEntry(f) > 0)
    .filter(f => {
      if(!apenasMesAtual) return true;
      const d = paraDataObj(vencimentoEfetivoEntry(f));
      return !!d && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
    })
    .reduce((s,f) => s + valorPendenteEntry(f), 0);
}
// Soma dos lançamentos pendentes de um tipo, dentro do período escolhido no filtro de mês da
// aba Financeiro ('' = todos os meses, ou uma chave "YYYY-MM" pra um mês específico). Numa
// conta com parcelas internas, soma só a parte que ainda falta (valorPendenteEntry).
function totalFinanceiroPeriodo(tipo, mesAno){
  return financeiroAtivos()
    .filter(f => f.tipo === tipo && valorPendenteEntry(f) > 0)
    .filter(f => !mesAno || chaveMesFinanceiro(f) === mesAno)
    .reduce((s,f) => s + valorPendenteEntry(f), 0);
}
// Quantas contas vencidas (pendentes com vencimento no passado) tem de um tipo — não respeita
// o filtro de mês, porque "vencida" é sobre estar atrasada agora, independente do período em tela.
function vencidasPorTipo(tipo){
  return financeiroAtivos().filter(f => f.tipo === tipo && estaVencido(f)).length;
}
// Saldo REAL de caixa: soma de tudo que já entrou de verdade (contas a receber já
// marcadas como pagas/recebidas) menos tudo que já saiu de verdade — contas a pagar já
// pagas mais toda Compra registrada (que, por definição, já é um gasto realizado; ver
// 14-compras.js). Diferente do card "Saldo previsto" (só a diferença entre pendências,
// uma previsão), este é pensado pra bater com o saldo de verdade da conta bancária da
// empresa — é o que resolve compras que "somem" do saldo sem aparecer em lugar nenhum.
function totalRecebidoReal(){
  return financeiroAtivos().filter(f => f.tipo === 'receber').reduce((s,f) => s + valorEfetivadoEntry(f), 0);
}
function totalPagoReal(){
  return financeiroAtivos().filter(f => f.tipo === 'pagar').reduce((s,f) => s + valorEfetivadoEntry(f), 0);
}
function totalComprasReal(){
  return comprasAtivos().reduce((s,c) => s + (c.valor || 0), 0);
}
function saldoRealCaixa(){
  return totalRecebidoReal() - totalPagoReal() - totalComprasReal();
}
// Tudo que já saiu de verdade da conta: contas a pagar já pagas + toda Compra
// registrada (compras já são, por definição, um gasto realizado).
function totalSaidasReal(){
  return totalPagoReal() + totalComprasReal();
}
// Cards simples e diretos, sempre desde o início (não filtram por mês): Saídas (o que já
// saiu), Recebido (o que já entrou) e Saldo (a diferença) — a mesma conta do saldo real de
// caixa, só que separada em 3 números fáceis de ler em vez de misturar previsto com real.
function renderCardsFinanceiro(){
  const saidas = totalSaidasReal();
  const recebido = totalRecebidoReal();
  const saldo = saldoRealCaixa();
  document.getElementById('cardsResumoFinanceiro').innerHTML = `
    <div class="card"><div class="label">Saídas</div><div class="value red">R$ ${fmtMoeda(saidas)}</div><div class="sub">Contas pagas + compras, desde o início</div></div>
    <div class="card"><div class="label">Recebido</div><div class="value green">R$ ${fmtMoeda(recebido)}</div><div class="sub">Contas a receber já recebidas, desde o início</div></div>
    <div class="card"><div class="label">Saldo</div><div class="value ${saldo >= 0 ? 'green' : 'red'}">R$ ${fmtMoeda(saldo)}</div><div class="sub">Recebido menos saídas — bate com o saldo do banco</div></div>
  `;
  const vencidas = vencidasPorTipo(abaFinanceiroAtiva);
  const rotuloTipo = abaFinanceiroAtiva === 'pagar' ? 'a pagar' : 'a receber';
  document.getElementById('cardsTipoFinanceiro').innerHTML = `
    <div class="card"><div class="label">Vencidas (${rotuloTipo})</div><div class="value ${vencidas > 0 ? 'red' : ''}">${vencidas}</div><div class="sub">Contas ${rotuloTipo} pendentes com vencimento já passado</div></div>
  `;
}
