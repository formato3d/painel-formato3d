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

