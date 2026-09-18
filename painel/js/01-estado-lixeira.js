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
    // responsavel é o nome que aparece assinando os recibos gerados pelo painel.
    empresa:{ nome:'FORMATO 3D', subtitulo:'Impressão e Personalizados', cnpj:'67.905.742/0001-37', whatsapp:'(92) 98632-6919', cidadePadrao:'Manaus/AM', chavePix:'+5592986326919', nomePix:'MARIANA B COUTINHO', responsavel:'Camila Barroncas dos Santos' },
    proximoNumero: 1,
    seq:{ cliente:1, produto:1, orcamento:1, financeiro:1, modeloItem:1, filamento:1, recibo:1, parcelamento:1, compra:1 },
    // Número de revisão da planilha no servidor — usado só pra saber se algo mudou
    // desde a última vez que verificamos (evita re-renderizar a lista toda a cada
    // verificação periódica de 15s quando ninguém salvou nada de novo). Não trava
    // mais salvamento nenhum: quem garante que ninguém perde edição é a mesclagem por
    // registro (ver calcularAlteracoes_/salvarNoServidor). Nunca editado pela
    // interface, só lido/enviado no carregar/salvar.
    revisao: 0,
    clientes: [],
    produtos: [],
    orcamentos: [],
    financeiro: [],
    modelosItens: [],
    filamentos: [],
    compras: []
  };
}
let state = estadoPadrao();
let dirty = false;
let carregando = true;
let autoSaveTimer = null;
// Evita mandar dois salvamentos ao mesmo tempo (ex.: o autosave dispara bem na hora
// em que uma atualização em segundo plano também tenta reenviar algo pendente) — só
// controla concorrência local; a mesclagem por id no servidor já é segura de qualquer
// jeito, isso aqui é só pra não gastar duas chamadas de rede à toa.
let salvandoEmAndamento = false;
// Nº de falhas seguidas tentando SALVAR (não confundir com tentativasCarregamento,
// que é pra buscar) e o timer da próxima tentativa automática — sem isso, uma falha
// de rede no meio de um salvamento deixava a alteração parada, esperando a pessoa
// mexer em mais alguma coisa pra tentar de novo.
let tentativasSalvamento = 0;
let timerNovaTentativaSalvamento = null;
// Última cópia do estado que veio do servidor (ou que o servidor confirmou como
// mesclada, depois de um salvamento) — é contra ISSO que a gente compara pra saber o
// que ESTE aparelho de fato criou ou alterou desde a última sincronização (ver
// calcularAlteracoes_). Só o que mudou desde essa cópia é enviado ao salvar; tudo o
// mais fica intacto, não importa se outro aparelho mudou aquilo nesse meio-tempo —
// é essa separação que permite duas pessoas usando o painel ao mesmo tempo sem uma
// apagar o que a outra acabou de salvar.
let stateBaseline = null;

function uid(tipo){
  const n = state.seq[tipo] || 1;
  state.seq[tipo] = n + 1;
  // O contador (n) sozinho já bastava quando só um aparelho por vez mexia nos dados.
  // Agora que o salvamento mescla por id (ver calcularAlteracoes_/aplicarEstadoMesclado_)
  // em vez de sobrescrever tudo, dois aparelhos criando um registro ao mesmo tempo sem
  // saber um do outro podiam gerar o MESMO id (ex.: os dois com seq.cliente = 5 geram
  // "cli_5") — e um dos dois registros sumiria, mesclado por engano em cima do outro.
  // Juntar um pedaço do horário (em base36) com uma parte aleatória deixa a chance de
  // colisão desprezível, mesmo com dois aparelhos criando ao mesmo tempo.
  return tipo.slice(0,3) + '_' + n + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

// Compara dois valores por CONTEÚDO (não por referência) — usado por calcularAlteracoes_
// pra saber se um registro realmente mudou desde a última sincronização, sem depender da
// ordem em que as chaves de um objeto foram criadas (o que JSON.stringify não garante).
function igual_(a, b){
  if(a === b) return true;
  if(typeof a !== typeof b || a === null || b === null) return false;
  if(typeof a !== 'object') return false;
  if(Array.isArray(a) !== Array.isArray(b)) return false;
  const chavesA = Object.keys(a), chavesB = Object.keys(b);
  if(chavesA.length !== chavesB.length) return false;
  return chavesA.every(k => igual_(a[k], b[k]));
}

// Devolve só os registros de state[tipo] que são NOVOS (não existiam na última
// sincronização) ou que mudaram de conteúdo desde então — é só isso que precisa ser
// mandado ao servidor num salvamento (ver salvarNoServidor). Antes de existir essa
// separação, TODO salvamento mandava a lista inteira de cada tipo, e se outra pessoa
// tivesse alterado um desses registros nesse meio-tempo, essa alteração dela sumia
// (sobrescrita pela cópia antiga que este aparelho ainda tinha na tela).
function calcularAlteracoes_(tipo){
  const atuais = state[tipo] || [];
  if(!stateBaseline) return atuais.slice(); // ainda não sincronizou nenhuma vez — manda tudo
  const base = stateBaseline[tipo] || [];
  const basePorId = {};
  base.forEach(item => { basePorId[item.id] = item; });
  return atuais.filter(item => !igual_(basePorId[item.id], item));
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
function comprasAtivos(){ return (state.compras || []).filter(x => !x.excluidoEm); }

// Descrição amigável de um item excluído pra listar na tela de Lixeira.
function descreverItemLixeira(tipo, item){
  if(tipo === 'clientes') return item.nome || '(sem nome)';
  if(tipo === 'produtos') return item.nome || '(sem nome)';
  if(tipo === 'filamentos') return [item.cor, item.material].filter(Boolean).join(' — ') || '(sem nome)';
  if(tipo === 'orcamentos') return 'Orçamento nº ' + String(item.numero).padStart(4,'0') + ' — ' + nomeClienteOpcional(item.clienteId);
  if(tipo === 'financeiro') return item.descricao || '(sem descrição)';
  if(tipo === 'modelosItens') return item.descricao || '(sem descrição)';
  if(tipo === 'compras') return item.descricao || '(sem descrição)';
  return item.id;
}
const LIXEIRA_TIPOS = [
  { tipo: 'clientes', rotulo: 'Cliente' },
  { tipo: 'produtos', rotulo: 'Produto/serviço' },
  { tipo: 'filamentos', rotulo: 'Filamento' },
  { tipo: 'orcamentos', rotulo: 'Orçamento' },
  { tipo: 'financeiro', rotulo: 'Financeiro' },
  { tipo: 'modelosItens', rotulo: 'Modelo de item' },
  { tipo: 'compras', rotulo: 'Compra' }
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
    tr.innerHTML = `<td data-label="Tipo"><span class="badge">${esc(rotulo)}</span></td>
      <td data-label="Descrição">${esc(descreverItemLixeira(tipo, item))}</td>
      <td data-label="Excluído em">${dataExcFmt}</td>
      <td data-label="Dias até apagar de vez">${diasRestantes} dia${diasRestantes === 1 ? '' : 's'}</td>
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

// Cada ação registrada aqui (salvar um cadastro, excluir, confirmar pagamento etc.)
// já é uma ação COMPLETA e pronta pra ir pro servidor — nunca é chamada tecla-a-tecla
// enquanto a pessoa ainda está digitando num formulário (isso só acontece quando o
// formulário já foi confirmado). Por isso não precisa de um debounce longo esperando
// "a pessoa terminar de mexer": os 350ms aqui existem só pra juntar duas ações bem
// próximas (ex.: excluir dois itens em sequência rápida) num único envio, não pra
// fazer a pessoa esperar. A parte que REALMENTE evita perder informação é a linha
// salvarCacheLocal() logo abaixo: ela grava no navegador NA HORA, antes de qualquer
// rede, então mesmo que a aba feche/trave/perca sinal no meio do caminho, a próxima
// vez que o painel abrir NESTE aparelho ele encontra a alteração e reenvia sozinho
// (ver carregarCacheLocal/aplicarEstadoMesclado_ mais abaixo).
function marcarAlterado(){
  if(carregando) return;
  dirty = true;
  salvarCacheLocal();
  const el = document.getElementById('statusSalvo');
  el.textContent = 'salvando na planilha...';
  el.className = 'badge salvando';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(salvarNoServidor, 350);
}

// Botão "💾 Salvar" ao lado do "🔄 Atualizar": força o envio imediato de tudo que está
// registrado agora, sem esperar o pequeno debounce do autosave — pra quem quer ter
// certeza (visualmente) de que nada ficou pra trás antes de fechar a aba, por exemplo.
function salvarAgora(){
  if(configuracaoPendente()) return;
  clearTimeout(autoSaveTimer);
  dirty = true;
  salvarCacheLocal();
  const el = document.getElementById('statusSalvo');
  el.textContent = 'salvando na planilha...';
  el.className = 'badge salvando';
  salvarNoServidor();
}

function marcarSalvo(){
  dirty = false;
  tentativasSalvamento = 0;
  clearTimeout(timerNovaTentativaSalvamento);
  const el = document.getElementById('statusSalvo');
  const agora = new Date();
  el.textContent = 'salvo às ' + String(agora.getHours()).padStart(2,'0') + ':' + String(agora.getMinutes()).padStart(2,'0');
  el.className = 'badge salvo';
}

/* =========================================================
   CACHE LOCAL (localStorage)
   Guarda uma cópia dos dados no próprio navegador pra, da próxima vez que a
   pessoa entrar no painel nesse aparelho, a tela já aparecer preenchida na
   hora — sem esperar a resposta do servidor. A busca no servidor continua
   acontecendo em segundo plano pra confirmar ou trazer o que mudou.
   ========================================================= */
const CHAVE_CACHE_LOCAL = 'painelCacheEstado';
// Grava o "pendente" junto com os dados: true significa que, na hora em que isso foi
// salvo no navegador, ainda existia alguma alteração que NÃO tinha sido confirmada
// pelo servidor (dirty=true). É essa marca que permite recuperar sozinho uma edição
// feita bem antes de fechar a aba (ex.: bateria do celular acabou, navegador travou,
// aba foi fechada sem querer no meio do caminho) — ver carregarCacheLocal/
// aplicarEstadoMesclado_ logo abaixo.
function salvarCacheLocal(){
  try {
    localStorage.setItem(CHAVE_CACHE_LOCAL, JSON.stringify({ quando: new Date().toISOString(), pendente: dirty, state: state }));
  } catch(e){
    // Sem espaço no navegador (ou modo anônimo bloqueando localStorage) — não é
    // grave, é só uma otimização de velocidade; o painel continua funcionando
    // normalmente buscando os dados do servidor.
    console.warn('Não foi possível guardar o cache local dos dados:', e);
  }
}
// Mostra os dados salvos localmente na hora (sem esperar rede nenhuma). Devolve
// true se tinha cache pra mostrar. Quem chamar ainda deve buscar do servidor em
// seguida, pra confirmar/atualizar o que veio do cache.
function carregarCacheLocal(){
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE_LOCAL);
    if(!bruto) return false;
    const cache = JSON.parse(bruto);
    if(!cache || !cache.state) return false;
    state = Object.assign(estadoPadrao(), cache.state);
    carregando = false;
    const el = document.getElementById('statusSalvo');
    if(cache.pendente){
      // Esse cache foi gravado com uma alteração ainda não confirmada pelo servidor —
      // provavelmente a aba fechou/travou antes do autosave terminar. Marca "dirty"
      // JÁ AQUI (antes de carregarDoServidor rodar) pra aplicarEstadoMesclado_ não
      // substituir essa alteração pela versão do servidor: em vez disso, assim que a
      // baseline fresca chegar, ela reenvia essa alteração pendente sozinha.
      dirty = true;
      el.textContent = 'reenviando uma alteração pendente deste aparelho...';
      el.className = 'badge salvando';
    } else {
      el.textContent = 'mostrando dados salvos neste aparelho — atualizando...';
      el.className = 'badge';
    }
    renderTudo();
    return true;
  } catch(e){
    console.warn('Não foi possível ler o cache local dos dados:', e);
    return false;
  }
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

// Tipos de lista sincronizados com o servidor (mesma lista usada pra montar o
// salvamento e pra aplicar o que o servidor devolve de volta).
const TIPOS_SINCRONIZADOS = ['clientes', 'produtos', 'orcamentos', 'financeiro', 'modelosItens', 'filamentos', 'compras'];

function salvarNoServidor(){
  if(configuracaoPendente()) return;
  if(salvandoEmAndamento){
    // Já existe um salvamento em voo agora (ex.: o autosave disparou bem na hora em
    // que uma recuperação de alteração pendente também tentou mandar algo) — não
    // manda duas requisições ao mesmo tempo à toa; tenta de novo logo que a primeira
    // terminar (calcularAlteracoes_ é recalculado na hora, então nada fica de fora).
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(salvarNoServidor, 300);
    return;
  }
  // Manda só o que ESTE aparelho criou ou alterou desde a última sincronização (ver
  // calcularAlteracoes_) — nunca mais a lista inteira de cada tipo. É isso que permite
  // duas pessoas usando o painel ao mesmo tempo em aparelhos diferentes sem uma apagar
  // o que a outra acabou de salvar: o servidor mescla cada registro pelo próprio id
  // (ver salvarTudo/mesclarArrayPorId_ no Code.gs), então só existe risco de verdade
  // se as duas mexerem EXATAMENTE no mesmo registro ao mesmo tempo.
  clearTimeout(timerNovaTentativaSalvamento);
  salvandoEmAndamento = true;
  const alteracoes = {};
  TIPOS_SINCRONIZADOS.forEach(tipo => { alteracoes[tipo] = calcularAlteracoes_(tipo); });
  alteracoes.proximoNumero = state.proximoNumero;
  alteracoes.seq = state.seq;
  fetch(CONFIG.URL_API, {
    method: 'POST',
    body: JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), state: alteracoes })
  })
    .then(r => r.json())
    .then(resp => {
      salvandoEmAndamento = false;
      if(sessaoInvalida(resp.erro)){ voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
      if(resp.erro) throw new Error(resp.erro);
      // O servidor devolve o estado inteiro já mesclado (com o que outra pessoa possa
      // ter salvado nesse meio-tempo incluído) — aplica isso como a nova verdade.
      aplicarEstadoMesclado_(resp);
      marcarSalvo();
      salvarCacheLocal();
    })
    .catch(err => {
      salvandoEmAndamento = false;
      const el = document.getElementById('statusSalvo');
      el.textContent = 'não foi possível salvar agora — tentando de novo...';
      el.className = 'badge erro-salvar';
      console.error(err);
      // Tenta de novo sozinho, com espera crescente (2s, 4s, 8s... até 30s no máximo)
      // — a pessoa não precisa ficar de olho nem mexer em mais nada pra a alteração
      // pendente ser reenviada assim que a conexão voltar. Enquanto isso, o cache local
      // (já gravado em marcarAlterado/salvarAgora) garante que nada se perde mesmo que
      // a aba feche antes da conexão voltar (ver carregarCacheLocal).
      tentativasSalvamento++;
      const espera = Math.min(30000, 2000 * Math.pow(2, tentativasSalvamento - 1));
      clearTimeout(timerNovaTentativaSalvamento);
      timerNovaTentativaSalvamento = setTimeout(salvarNoServidor, espera);
    });
}

// Aplica um estado vindo do servidor (de um carregamento OU da resposta de um
// salvamento, que agora também devolve o estado mesclado) como a nova referência:
// atualiza a "baseline" (contra a qual calcularAlteracoes_ compara pra saber o que
// mudou) e, se não tiver uma edição pendente (dirty) nesse meio-tempo, também troca o
// que está na tela pela versão mais atual. Se a pessoa mexeu em mais alguma coisa
// enquanto o servidor respondia — incluindo uma alteração RECUPERADA do cache local
// que ainda não tinha sido confirmada (ver carregarCacheLocal) — não troca a tela
// agora (perderia o que ela acabou de digitar/o que estava pendente); em vez disso,
// manda essa alteração pendente pro servidor agora que já temos uma baseline fresca
// pra comparar, sem esperar a pessoa mexer em mais alguma coisa pra isso acontecer.
function aplicarEstadoMesclado_(dados){
  stateBaseline = JSON.parse(JSON.stringify(dados));
  if(dirty){
    salvarNoServidor();
    return;
  }
  state = Object.assign(estadoPadrao(), dados);
  carregando = false;
  renderTudo();
}

// Nº de falhas seguidas buscando do servidor (usado só pra calcular o tempo de
// espera até a próxima tentativa automática) e o timer dessa tentativa.
let tentativasCarregamento = 0;
let timerNovaTentativaCarregamento = null;
function carregarDoServidor(){
  if(configuracaoPendente()){
    document.getElementById('statusSalvo').textContent = 'painel não configurado — veja o guia de instalação';
    carregando = false;
    renderTudo();
    return;
  }
  clearTimeout(timerNovaTentativaCarregamento);
  fetch(CONFIG.URL_API + '?token=' + encodeURIComponent(CONFIG.TOKEN) + '&sessao=' + encodeURIComponent(sessaoAtual()))
    .then(r => r.json())
    .then(dados => {
      if(sessaoInvalida(dados.erro)){ voltarParaLogin('Sua sessão expirou — faça login novamente.'); return; }
      if(dados.erro) throw new Error(dados.erro);
      tentativasCarregamento = 0;
      // Liga a verificação periódica mesmo se a gente acabar não aplicando esses
      // dados agora (ver "dirty" abaixo) — sem isso, se a pessoa começasse a editar
      // bem rápido logo no primeiro carregamento, o painel nunca mais buscaria
      // atualizações sozinho.
      iniciarVerificacaoPeriodica();
      // Tem uma alteração pendente deste aparelho — uma edição sendo salva agora
      // (autosave em andamento) OU uma alteração RECUPERADA do cache local depois de
      // a aba ter fechado/travado antes de terminar de salvar (ver
      // carregarCacheLocal). Nos dois casos não troca o que está na tela por baixo dos
      // panos — aplicarEstadoMesclado_ já cuida de reenviar essa alteração pendente
      // usando esta baseline fresca, sem esperar a pessoa mexer em mais alguma coisa.
      if(dirty){ aplicarEstadoMesclado_(dados); return; }
      // Se já tínhamos carregado antes e a revisão não mudou, ninguém salvou nada novo
      // nesse meio-tempo — evita re-renderizar as listas à toa a cada verificação
      // periódica (o que resetaria filtros/scroll sem necessidade).
      const precisaAplicar = carregando || dados.revisao !== state.revisao;
      if(precisaAplicar){
        aplicarEstadoMesclado_(dados);
        salvarCacheLocal();
      }
      // Confirma "salvo às ..." mesmo quando não havia nada novo pra aplicar — é o que
      // limpa um aviso de "não foi possível atualizar" que tenha ficado de uma
      // tentativa anterior (ex.: depois de clicar em 🔄 atualizar agora).
      marcarSalvo();
    })
    .catch(err => {
      console.error(err);
      const el = document.getElementById('statusSalvo');
      // Se já tem dados na tela (vieram do cache local ou de um carregamento
      // anterior), a pessoa continua vendo e usando esses dados normalmente — só
      // avisa que não deu pra atualizar agora, sem travar numa tela de erro pedindo
      // F5. O painel tenta de novo sozinho, com um tempo de espera que vai
      // aumentando (5s, 10s, 20s... até no máximo 1min entre tentativas).
      el.textContent = carregando
        ? 'não foi possível carregar os dados agora — tentando de novo...'
        : 'não foi possível atualizar agora (mostrando os últimos dados salvos) — tentando de novo...';
      el.className = 'badge erro-salvar';
      // Uma vez que a verificação periódica (a cada 15s) já está ligada, ela mesma
      // cobre a próxima tentativa — não precisa de um timer próprio duplicado.
      if(!verificacaoPeriodicaAtiva){
        tentativasCarregamento++;
        const espera = Math.min(60000, 5000 * Math.pow(2, tentativasCarregamento - 1));
        timerNovaTentativaCarregamento = setTimeout(carregarDoServidor, espera);
      }
    });
}
// Botão "🔄" no cabeçalho — busca os dados mais recentes na hora, sem esperar o
// próximo ciclo automático (a cada 15s) nem o tempo de espera de uma tentativa
// anterior que tenha falhado.
function atualizarAgora(){
  tentativasCarregamento = 0;
  clearTimeout(timerNovaTentativaCarregamento);
  const el = document.getElementById('statusSalvo');
  el.textContent = 'atualizando...';
  el.className = 'badge';
  carregarDoServidor();
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
  var modais = ['usuariosWrap', 'formClienteWrap', 'formProdutoWrap', 'formFilamentoWrap', 'formOrcamentoWrap', 'modelosWrap', 'formFinanceiroWrap', 'formCompraWrap', 'confirmarPagamentoWrap'];
  for(var i = 0; i < modais.length; i++){
    var el = document.getElementById(modais[i]);
    if(el && !el.classList.contains('hidden')) return true;
  }
  var ativo = document.activeElement;
  if(ativo && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(ativo.tagName) !== -1) return true;
  return false;
}

/* =========================================================
   ÚLTIMA CHANCE AO FECHAR A ABA
   O aviso "sair mesmo, tem alteração não salva?" (ver beforeunload em
   02-auth-usuarios.js) já ajuda quando a pessoa fecha a aba de propósito, mas em
   celular é comum a aba ser encerrada pelo sistema (trocar de app, tela apagar,
   bateria acabar) sem esse aviso aparecer. "pagehide" dispara nesses casos também
   (ao contrário de "beforeunload", que muitos navegadores mobile ignoram) — usamos
   pra tentar mandar a alteração pendente pro servidor com navigator.sendBeacon, que o
   navegador entrega mesmo com a página sendo fechada (um fetch normal seria
   cancelado). É só mais uma tentativa, best-effort: quem garante de verdade que nada
   se perde é o cache local gravado na hora em marcarAlterado/salvarAgora — se nem o
   beacon nem o cache local conseguirem confirmar com o servidor agora, a próxima vez
   que o painel abrir neste aparelho encontra a alteração pendente e reenvia sozinho
   (ver carregarCacheLocal/aplicarEstadoMesclado_).
   ========================================================= */
window.addEventListener('pagehide', function(){
  if(!dirty || configuracaoPendente() || typeof navigator.sendBeacon !== 'function') return;
  try{
    const alteracoes = {};
    TIPOS_SINCRONIZADOS.forEach(tipo => { alteracoes[tipo] = calcularAlteracoes_(tipo); });
    alteracoes.proximoNumero = state.proximoNumero;
    alteracoes.seq = state.seq;
    const payload = JSON.stringify({ token: CONFIG.TOKEN, sessao: sessaoAtual(), state: alteracoes });
    navigator.sendBeacon(CONFIG.URL_API, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
  }catch(e){
    // Melhor deixar a aba fechar do que travar por causa disso — o cache local já
    // gravado cobre a recuperação da próxima vez que o painel abrir.
    console.warn('Não foi possível mandar o beacon de última chance ao fechar a aba:', e);
  }
});
