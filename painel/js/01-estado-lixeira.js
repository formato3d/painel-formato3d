/* =========================================================
   ESTADO / PERSISTÊNCIA
   (interface hospedada no GitHub Pages, dados na Planilha Google
   via uma API feita em Google Apps Script — veja CONFIG abaixo)
   ========================================================= */

// A URL da API pode vir por parâmetro na própria URL do site (?api=...&token=...),
// pra não precisar editar este arquivo depois de publicar o Apps Script.
// Se não vier por parâmetro, usa os valores fixos abaixo como padrão.
const _params = new URLSearchParams(window.location.search);
const CONFIG = {
  URL_API: _params.get('api') || 'https://script.google.com/macros/s/AKfycby097cQ9T6xSvAPap39NJMl3dKK4qOElg5LFfZpQyKY1oQrWKqf29h1LkADBK9HzELS/exec',
  TOKEN: _params.get('token') || 'KFK-61rlTHp5hqH5UviaP6ujLmUbZWLh'
};

function estadoPadrao(){
  return {
    // Chave Pix (Banco Inter) — chave telefone, no formato exigido pelo BR Code (+55DDDNUMERO).
    // nomePix é o nome do titular da conta cadastrado no banco (aparece no QR Code) — precisa
    // bater com o nome real da conta Pix, senão alguns apps de banco mostram aviso de divergência.
    // (nome, cnpj e whatsapp abaixo funcionam do mesmo jeito: editados direto no código.)
    empresa:{ nome:'FORMATO 3D', subtitulo:'Impressão e Personalizados', cnpj:'67.905.742/0001-37', whatsapp:'(92) 98632-6919', cidadePadrao:'Manaus/AM', chavePix:'+5592986326919', nomePix:'MARIANA B COUTINHO' },
    proximoNumero: 1,
    seq:{ cliente:1, produto:1, orcamento:1, financeiro:1, modeloItem:1, filamento:1 },
    // Número de revisão da planilha no servidor — usado só pra detectar quando esta aba
    // ficou desatualizada (outra aba/dispositivo salvou algo mais novo). Nunca editado
    // pela interface, só lido/enviado no carregar/salvar.
    revisao: 0,
    clientes: [],
    produtos: [],
    orcamentos: [],
    financeiro: [],
    modelosItens: [],
    filamentos: []
  };
}
let state = estadoPadrao();
let dirty = false;
let carregando = true;
let autoSaveTimer = null;
// Fica true quando o servidor recusa um salvamento por a página estar desatualizada
// (outra aba/dispositivo salvou algo mais novo nesse meio-tempo) — trava novos
// salvamentos automáticos até a pessoa recarregar a página, pra não arriscar
// sobrescrever por cima do que foi salvo depois.
let bloqueadoPorConflito = false;

function uid(tipo){
  const n = state.seq[tipo] || 1;
  state.seq[tipo] = n + 1;
  return tipo.slice(0,3) + '_' + n;
}

/* =========================================================
   LIXEIRA (exclusão reversível)
   Em vez de apagar um registro na hora, marcamos "excluidoEm" com
   a data/hora e escondemos ele das telas normais. Ele fica disponível
   pra restaurar na aba Lixeira por 30 dias — depois disso o backend
   apaga permanentemente sozinho (ver Code.gs, rodarTarefasDiarias).
   ========================================================= */
const DIAS_LIXEIRA = 30;
function moverParaLixeira(item){
  item.excluidoEm = new Date().toISOString();
}
function clientesAtivos(){ return state.clientes.filter(x => !x.excluidoEm); }
function produtosAtivos(){ return state.produtos.filter(x => !x.excluidoEm); }
function filamentosAtivos(){ return (state.filamentos || []).filter(x => !x.excluidoEm); }
function orcamentosAtivos(){ return state.orcamentos.filter(x => !x.excluidoEm); }
function financeiroAtivos(){ return state.financeiro.filter(x => !x.excluidoEm); }
function modelosAtivos(){ return (state.modelosItens || []).filter(x => !x.excluidoEm); }

// Descrição amigável de um item excluído pra listar na tela de Lixeira.
function descreverItemLixeira(tipo, item){
  if(tipo === 'clientes') return item.nome || '(sem nome)';
  if(tipo === 'produtos') return item.nome || '(sem nome)';
  if(tipo === 'filamentos') return [item.cor, item.material].filter(Boolean).join(' — ') || '(sem nome)';
  if(tipo === 'orcamentos') return 'Orçamento nº ' + String(item.numero).padStart(4,'0') + ' — ' + nomeClienteOpcional(item.clienteId);
  if(tipo === 'financeiro') return item.descricao || '(sem descrição)';
  if(tipo === 'modelosItens') return item.descricao || '(sem descrição)';
  return item.id;
}
const LIXEIRA_TIPOS = [
  { tipo: 'clientes', rotulo: 'Cliente' },
  { tipo: 'produtos', rotulo: 'Produto/serviço' },
  { tipo: 'filamentos', rotulo: 'Filamento' },
  { tipo: 'orcamentos', rotulo: 'Orçamento' },
  { tipo: 'financeiro', rotulo: 'Financeiro' },
  { tipo: 'modelosItens', rotulo: 'Modelo de item' }
];
function renderLixeira(){
  const corpo = document.getElementById('corpoLixeira');
  if(!corpo) return;
  const itens = [];
  LIXEIRA_TIPOS.forEach(({tipo, rotulo}) => {
    (state[tipo] || []).forEach(item => {
      if(item.excluidoEm) itens.push({ tipo, rotulo, item });
    });
  });
  itens.sort((a,b) => new Date(b.item.excluidoEm) - new Date(a.item.excluidoEm));
  document.getElementById('contagemLixeira').textContent = itens.length;
  if(itens.length === 0){
    corpo.innerHTML = '<tr class="empty-row"><td colspan="5">A lixeira está vazia.</td></tr>';
    return;
  }
  corpo.innerHTML = '';
  const agora = new Date();
  itens.forEach(({tipo, rotulo, item}) => {
    const dataExc = new Date(item.excluidoEm);
    const diasPassados = Math.floor((agora - dataExc) / (1000*60*60*24));
    const diasRestantes = Math.max(0, DIAS_LIXEIRA - diasPassados);
    const dataExcFmt = String(dataExc.getDate()).padStart(2,'0') + '/' + String(dataExc.getMonth()+1).padStart(2,'0') + '/' + dataExc.getFullYear();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="badge">${esc(rotulo)}</span></td>
      <td>${esc(descreverItemLixeira(tipo, item))}</td>
      <td>${dataExcFmt}</td>
      <td>${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}</td>
      <td class="acoes"><button class="btn-icon" onclick="restaurarItemLixeira('${tipo}','${item.id}')" title="Restaurar">↺ Restaurar</button></td>`;
    corpo.appendChild(tr);
  });
}
function restaurarItemLixeira(tipo, id){
  const item = (state[tipo] || []).find(x => x.id === id);
  if(!item) return;
  delete item.excluidoEm;
  marcarAlterado();
  renderTudo();
  renderLixeira();
}

function marcarAlterado(){
  if(carregando || bloqueadoPorConflito) return;
  dirty = true;
  const el = document.getElementById('statusSalvo');
  el.textContent = 'salvando na planilha...';
  el.classList.add('dirty');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(salvarNoServidor, 800);
}

function marcarSalvo(){
  dirty = false;
  // Estado confirmado em dia com o servidor — se um novo conflito acontecer mais
  // tarde, o aviso deve poder aparecer de novo.
  window.__avisoDadosDesatualizadosMostrado = false;
  const el = document.getElementById('statusSalvo');
  const agora = new Date();
  el.textContent = 'salvo às ' + String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');
  el.classList.remove('dirty');
}

function configuracaoPendente(){
  return !CONFIG.URL_API || CONFIG.URL_API.indexOf('COLE_AQUI') !== -1;
}

function sessaoAtual(){
  return localStorage.getItem('sessaoToken') || '';
}

function sessaoInvalida(erro){
  return erro === 'não autenticado' || erro === 'sessão expirada' || erro === 'sessão inválida';
}

function salvarNoServidor(){
  if(configuracaoPendente()) return;
  fetch(CONFIG.URL_API, {
    method: 'POST',
    body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), state: JSON.parse(JSON.stringify(state)) })
  })
    .then(r => r.json())
    .then(resp => {
      if(sessaoInvalida(resp.erro)){ voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
      if(resp.erro === 'dados_desatualizados'){ avisarDadosDesatualizados(); return; }
      if(resp.erro) throw new Error(resp.erro);
      state.revisao = resp.revisao;
      marcarSalvo();
    })
    .catch(err => {
      const el = document.getElementById('statusSalvo');
      el.textContent = 'não foi possível salvar agora — verifique sua internet';
      el.classList.add('dirty');
      console.error(err);
    });
}

// Chamado quando o servidor recusa salvar por causa de uma revisão desatualizada —
// ou seja, essa aba carregou os dados antes de alguém (outra aba, outro celular, outro
// usuário) ter salvo algo mais novo. Em vez de arriscar sobrescrever esses dados mais
// novos, avisamos e buscamos a versão atual sozinhos (sem precisar de F5) — mas a
// alteração que a pessoa tentou salvar agora precisa ser repetida, porque ela não foi
// gravada. Com a verificação periódica (iniciarVerificacaoPeriodica) isso deve ficar
// raro — só acontece se duas edições caírem quase ao mesmo tempo, antes da próxima
// verificação automática.
function avisarDadosDesatualizados(){
  clearTimeout(autoSaveTimer);
  bloqueadoPorConflito = true;
  const el = document.getElementById('statusSalvo');
  el.textContent = 'dados desatualizados — atualizando...';
  el.classList.add('dirty');
  if(!window.__avisoDadosDesatualizadosMostrado){
    window.__avisoDadosDesatualizadosMostrado = true;
    alert('Estes dados foram alterados em outra aba, outro celular ou por outra pessoa ao mesmo tempo.\n\nPra não apagar por cima essas mudanças, a última alteração feita aqui não foi salva — o painel vai atualizar sozinho com a versão mais recente. Só é preciso repetir essa última alteração.');
  }
  // Busca a versão mais recente automaticamente — não deixa a pessoa travada
  // esperando um F5 manual.
  carregarDoServidor();
}

function carregarDoServidor(){
  if(configuracaoPendente()){
    document.getElementById('statusSalvo').textContent = 'painel não configurado — veja o guia de instalação';
    carregando = false;
    renderTudo();
    return;
  }
  fetch(CONFIG.URL_API + '?token=' + encodeURIComponent(CONFIG.TOKEN) + '&sessao=' + encodeURIComponent(sessaoAtual()))
    .then(r => r.json())
    .then(dados => {
      if(sessaoInvalida(dados.erro)){ voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
      if(dados.erro) throw new Error(dados.erro);
      // Se já tínhamos carregado antes e a revisão não mudou, ninguém salvou nada novo
      // nesse meio-tempo — evita re-renderizar as listas à toa a cada verificação
      // periódica (o que resetaria filtros/scroll sem necessidade).
      if(!carregando && dados.revisao === state.revisao) return;
      state = Object.assign(estadoPadrao(), dados);
      carregando = false;
      // Qualquer bloqueio anterior por dados desatualizados fica resolvido: acabamos
      // de buscar a versão mais recente da planilha.
      bloqueadoPorConflito = false;
      renderTudo();
      marcarSalvo();
      iniciarVerificacaoPeriodica();
    })
    .catch(err => {
      document.getElementById('statusSalvo').textContent = 'erro ao carregar os dados — recarregue a página';
      console.error(err);
    });
}

// Enquanto o painel está aberto, outros dispositivos/abas podem estar salvando dados
// novos (um cliente, um produto, um orçamento). Sem isso, essa aba só veria as
// mudanças se a pessoa desse F5 na mão — e é exatamente esse o problema de "não
// atualiza pro outro dispositivo" que apareceu testando em dois navegadores.
// Aqui a gente verifica periodicamente se a planilha mudou e, se mudou, recarrega
// sozinho — mas só quando é seguro fazer isso (ver existeEdicaoEmAndamento).
let verificacaoPeriodicaAtiva = false;
function iniciarVerificacaoPeriodica(){
  if(verificacaoPeriodicaAtiva) return;
  verificacaoPeriodicaAtiva = true;
  setInterval(verificarAtualizacoesPeriodicamente, 15000);
  // Ao voltar pra essa aba (ex.: alternando entre dois navegadores/dispositivos pra
  // comparar), verifica na hora em vez de esperar até 15s do próximo ciclo.
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible') verificarAtualizacoesPeriodicamente();
  });
}

function verificarAtualizacoesPeriodicamente(){
  if(configuracaoPendente() || carregando || dirty) return;
  if(existeEdicaoEmAndamento()) return;
  carregarDoServidor();
}

// Não atualiza sozinho por baixo dos pés de quem está no meio de um cadastro: se
// algum formulário (cliente, produto, orçamento, financeiro, filamento, modelo,
// usuários) está aberto, ou se a pessoa está digitando em algum campo, a verificação
// periódica espera a próxima vez.
function existeEdicaoEmAndamento(){
  var modais = ['usuariosWrap', 'formClienteWrap', 'formProdutoWrap', 'formFilamentoWrap', 'formOrcamentoWrap', 'modelosWrap', 'formFinanceiroWrap'];
  for(var i = 0; i < modais.length; i++){
    var el = document.getElementById(modais[i]);
    if(el && !el.classList.contains('hidden')) return true;
  }
  var ativo = document.activeElement;
  if(ativo && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(ativo.tagName) !== -1) return true;
  return false;
}

