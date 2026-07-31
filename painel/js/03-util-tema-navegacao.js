/* =========================================================
   UTILITÁRIOS
   ========================================================= */
function fmtMoeda(v){
  return (v || 0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function parseMoeda(str){
  if(!str) return 0;
  str = String(str).replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',', '.');
  const v = parseFloat(str);
  return isNaN(v) ? 0 : v;
}
function hojeStr(){
  const h = new Date();
  return String(h.getDate()).padStart(2,'0') + '/' + String(h.getMonth()+1).padStart(2,'0') + '/' + h.getFullYear();
}
function paraDataObj(valor){
  if(!valor) return null;
  const str = String(valor);
  // formato DD/MM/YYYY (usado internamente pelo app)
  if(str.indexOf('/') !== -1){
    const p = str.split('/');
    if(p.length !== 3) return null;
    const d = new Date(parseInt(p[2],10), parseInt(p[1],10)-1, parseInt(p[0],10));
    return isNaN(d.getTime()) ? null : d;
  }
  // formato ISO (YYYY-MM-DD ou com horário) — pode vir da planilha quando o Google Sheets
  // converte o texto da data em um valor de data real. Usa os componentes de data
  // (sem fuso horário) pra não variar o dia exibido.
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m){
    const d = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function fmtDataExibir(valor){
  const d = paraDataObj(valor);
  if(!d) return esc(valor);
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}
function somarDias(valor, dias){
  const d = paraDataObj(valor);
  if(!d) return '';
  d.setDate(d.getDate() + (parseInt(dias,10) || 0));
  return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear();
}
function esc(s){
  return (s === undefined || s === null) ? '' : String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function proximoCodigoProduto(){
  const usados = new Set();
  state.produtos.forEach(p => { const n = parseInt(p.codigo,10); if(!isNaN(n)) usados.add(n); });
  let n = 1;
  while(usados.has(n)) n++;
  return String(n).padStart(3,'0');
}

/* =========================================================
   VALOR POR EXTENSO (usado no recibo)
   ========================================================= */
function valorPorExtenso(valor){
  const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
  const DEZ_A_DEZENOVE = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

  function ateNoveNoveNove(n){
    if(n === 0) return '';
    if(n === 100) return 'cem';
    const partes = [];
    const c = Math.floor(n/100), resto = n % 100;
    if(c) partes.push(CENTENAS[c]);
    if(resto >= 10 && resto < 20){
      partes.push(DEZ_A_DEZENOVE[resto-10]);
    } else if(resto > 0){
      const d = Math.floor(resto/10), u = resto % 10;
      const pd = [];
      if(d) pd.push(DEZENAS[d]);
      if(u) pd.push(UNIDADES[u]);
      partes.push(pd.join(' e '));
    }
    return partes.join(' e ');
  }
  function nomePlural(n, singular, plural){ return n === 1 ? singular : plural; }
  function inteiroPorExtenso(n){
    if(n === 0) return 'zero';
    const bilhoes = Math.floor(n / 1000000000);
    const milhoes = Math.floor((n % 1000000000) / 1000000);
    const milhares = Math.floor((n % 1000000) / 1000);
    const centenas = n % 1000;
    const grupos = [];
    if(bilhoes) grupos.push(ateNoveNoveNove(bilhoes) + ' ' + nomePlural(bilhoes, 'bilhão', 'bilhões'));
    if(milhoes) grupos.push(ateNoveNoveNove(milhoes) + ' ' + nomePlural(milhoes, 'milhão', 'milhões'));
    if(milhares) grupos.push(milhares === 1 ? 'mil' : ateNoveNoveNove(milhares) + ' mil');
    if(centenas) grupos.push(ateNoveNoveNove(centenas));
    if(grupos.length === 1) return grupos[0];
    // Regra tradicional: usa "e" antes do último grupo quando ele é < 100 (ou é uma centena "redonda"); senão usa vírgula.
    const usaE = centenas > 0 && (centenas < 100 || centenas % 100 === 0);
    if(usaE) return grupos.slice(0, -1).join(', ') + ' e ' + grupos[grupos.length - 1];
    return grupos.join(', ');
  }

  valor = Math.round((Number(valor) || 0) * 100) / 100;
  const negativo = valor < 0;
  valor = Math.abs(valor);
  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);
  let texto = '';
  if(reais > 0 || centavos === 0) texto += inteiroPorExtenso(reais) + ' ' + nomePlural(reais, 'real', 'reais');
  if(centavos > 0){
    if(reais > 0) texto += ' e ';
    texto += inteiroPorExtenso(centavos) + ' ' + nomePlural(centavos, 'centavo', 'centavos');
  }
  texto = texto.charAt(0).toUpperCase() + texto.slice(1);
  return negativo ? 'Menos ' + texto.charAt(0).toLowerCase() + texto.slice(1) : texto;
}

/* =========================================================
   TEMA (claro / escuro)
   ========================================================= */
function aplicarTema(tema){
  document.documentElement.setAttribute('data-theme', tema);
  const btn = document.getElementById('btnTema');
  if(btn){
    btn.textContent = tema === 'dark' ? '☀️' : '🌙';
    btn.title = tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
  }
  try{ localStorage.setItem('formato3d_tema', tema); }catch(e){}
}
function alternarTema(){
  const atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  aplicarTema(atual === 'dark' ? 'light' : 'dark');
}
(function inicializarTema(){
  const atual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const btn = document.getElementById('btnTema');
  if(btn){
    btn.textContent = atual === 'dark' ? '☀️' : '🌙';
    btn.title = atual === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro';
  }
})();

/* =========================================================
   NAVEGAÇÃO
   ========================================================= */
function mostrarAba(nome){
  document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('tab-' + nome).classList.remove('hidden');
  document.querySelectorAll('.navtab').forEach(b => b.classList.remove('active'));
  document.getElementById('navtab-' + nome).classList.add('active');
  if(nome === 'dashboard') renderDashboard();
  if(nome === 'calc3d') calcularOrcamento3D();
  if(nome === 'clientes') renderClientes();
  if(nome === 'filamentos') renderFilamentos();
  if(nome === 'relatorios') renderRelatorios();
  if(nome === 'lixeira') renderLixeira();
}

function renderTudo(){
  renderClientes();
  renderProdutos();
  renderFilamentos();
  renderOrcamentos();
  renderFinanceiro();
  renderDashboard();
  renderLixeira();
  atualizarSelectsClientes();
  document.getElementById('proximoNumeroLabel').textContent = String(state.proximoNumero).padStart(4,'0');
}

