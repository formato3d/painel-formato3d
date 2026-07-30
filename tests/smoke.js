// Suíte de fumaça (smoke test) do Painel Formato 3D.
// Roda o painel de verdade (painel/index.html) num Chromium headless, contra um
// backend falso local (mock_backend.js) — nunca toca na planilha real. Pensada
// pra rodar no GitHub Actions a cada push (ver .github/workflows/tests.yml).
const path = require('path');
const { chromium } = require('playwright');
const { criarMockBackend } = require('./mock_backend');

const PORTA = 8931;
let falhas = 0;
function assert(condicao, mensagem){
  if (condicao) {
    console.log('  ok - ' + mensagem);
  } else {
    console.error('  FALHOU - ' + mensagem);
    falhas++;
  }
}

(async () => {
  const server = await criarMockBackend(PORTA);
  const browser = await chromium.launch();
  const errosJs = [];
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on('pageerror', e => errosJs.push(e.message));

  const caminho = path.resolve(__dirname, '..', 'painel', 'index.html');
  const url = 'file://' + caminho + '?api=' + encodeURIComponent('http://localhost:' + PORTA + '/exec');
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem('sessaoToken', 'sess-abc');
    localStorage.setItem('sessaoUsuario', 'felipe');
  });
  await page.evaluate(() => { document.body.classList.add('autenticado'); carregarDoServidor(); });
  await page.waitForTimeout(600);

  console.log('Grupo: carregamento inicial');
  assert(await page.evaluate(() => document.body.classList.contains('autenticado')), 'painel autenticado após carregar sessão salva');
  assert(await page.evaluate(() => state.clientes.length === 1), 'carregou o cliente inicial do backend falso');

  console.log('Grupo: lixeira — cliente (excluir vira restaurável, não some de vez)');
  await page.evaluate(() => {
    state.clientes.push({id: uid('cliente'), nome: 'Cliente CI Teste', telefone:'', email:'', cidade:'Manaus/AM'});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.confirm = () => true;
    const c = state.clientes.find(x => x.nome === 'Cliente CI Teste');
    excluirCliente(c.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => clientesAtivos().every(c => c.nome !== 'Cliente CI Teste')), 'cliente excluído some da lista de ativos');
  assert(await page.evaluate(() => state.clientes.some(c => c.nome === 'Cliente CI Teste')), 'cliente excluído continua existindo nos dados (soft delete)');
  await page.evaluate(() => mostrarAba('lixeira'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.getElementById('corpoLixeira').textContent.includes('Cliente CI Teste')), 'cliente excluído aparece na tela de Lixeira');
  await page.evaluate(() => {
    const c = state.clientes.find(x => x.nome === 'Cliente CI Teste');
    restaurarItemLixeira('clientes', c.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => clientesAtivos().some(c => c.nome === 'Cliente CI Teste')), 'cliente volta a aparecer como ativo depois de restaurar');

  console.log('Grupo: lixeira — produto');
  await page.evaluate(() => {
    state.produtos.push({id: uid('produto'), codigo:'CI1', nome:'Produto CI Teste', categoria:'', precoCusto:1, preco:10, unidade:'un', peso:0, quantidade:5, alertaEstoqueBaixo:5, foto:'', descricao:''});
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    window.confirm = () => true;
    const p = state.produtos.find(x => x.nome === 'Produto CI Teste');
    excluirProduto(p.id);
  });
  await page.waitForTimeout(900);
  assert(await page.evaluate(() => produtosAtivos().every(p => p.nome !== 'Produto CI Teste')), 'produto excluído some da lista de ativos');
  await page.evaluate(() => mostrarAba('produtos'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !document.getElementById('corpoTabelaProdutos').textContent.includes('Produto CI Teste')), 'produto excluído não aparece na tabela de produtos');

  console.log('Grupo: orçamento parado (alerta de 5+ dias sem resposta)');
  await page.evaluate(() => {
    const clienteId = state.clientes[0].id;
    const dataPassada = new Date();
    dataPassada.setDate(dataPassada.getDate() - 8);
    const dataStr = String(dataPassada.getDate()).padStart(2,'0') + '/' + String(dataPassada.getMonth()+1).padStart(2,'0') + '/' + dataPassada.getFullYear();
    state.orcamentos.push({
      id: uid('orcamento'), numero: state.proximoNumero, clienteId, data: dataStr, validadeDias:'7',
      status:'Pendente', frete:0, desconto:0, total:200, obs:'', financeiroGerado:false,
      condicaoPagamento:'', formasPagamento:[], itens:[{ produtoId:null, cod:'X', descricao:'Item parado', qtd:1, valorUnit:200, custoUnit:50 }]
    });
    state.proximoNumero++;
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => mostrarAba('dashboard'));
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => !document.getElementById('boxOrcamentosParados').classList.contains('hidden')), 'alerta de orçamento parado aparece no dashboard');

  console.log('Grupo: relatórios');
  await page.evaluate(() => {
    const clienteId = state.clientes[0].id;
    const hoje = new Date();
    const dataStr = String(hoje.getDate()).padStart(2,'0') + '/' + String(hoje.getMonth()+1).padStart(2,'0') + '/' + hoje.getFullYear();
    state.orcamentos.push({
      id: uid('orcamento'), numero: state.proximoNumero, clienteId, data: dataStr, validadeDias:'7',
      status:'Aprovado', frete:0, desconto:0, total:150, obs:'', financeiroGerado:false,
      condicaoPagamento:'', formasPagamento:[], itens:[{ produtoId:null, cod:'X1', descricao:'Item Relatorio CI', qtd:2, valorUnit:75, custoUnit:20 }]
    });
    state.proximoNumero++;
    marcarAlterado();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => mostrarAba('relatorios'));
  await page.waitForTimeout(200);
  assert(await page.evaluate(() => document.getElementById('relTopProdutos').textContent.includes('Item Relatorio CI')), 'produto vendido aparece no relatório de mais vendidos');
  assert(await page.evaluate(() => document.getElementById('relVendasMes').children.length > 0), 'gráfico de vendas por mês renderizou barras');

  console.log('Grupo: exportar Excel não quebra mesmo sem a lib carregada');
  const exportResult = await page.evaluate(() => {
    try { exportarFinanceiroExcel(); return 'sem erro'; } catch(e) { return 'ERRO: ' + e.message; }
  });
  assert(exportResult === 'sem erro', 'exportarFinanceiroExcel() não lança exceção (' + exportResult + ')');

  console.log('Grupo: logout invalida sessão no servidor');
  let chamouLogout = false;
  await page.evaluate(() => {
    window.__logoutOk = false;
    const origFetch = window.fetch;
    window.fetch = function(u, opts){
      if(opts && opts.body){ try{ if(JSON.parse(opts.body).action === 'logout') window.__logoutOk = true; }catch(e){} }
      return origFetch(u, opts);
    };
    window.confirm = () => true;
    sair();
  });
  await page.waitForTimeout(300);
  chamouLogout = await page.evaluate(() => window.__logoutOk);
  assert(chamouLogout, 'sair() manda a ação "logout" pro backend');
  assert(await page.evaluate(() => !document.body.classList.contains('autenticado')), 'painel volta pra tela de login depois de sair');

  console.log('Grupo: nenhum erro de JS não tratado durante os testes');
  assert(errosJs.length === 0, 'sem erros de JavaScript no console (' + JSON.stringify(errosJs) + ')');

  await browser.close();
  server.close();

  console.log('\n' + (falhas === 0 ? 'TUDO OK ✅' : (falhas + ' verificação(ões) falharam ❌')));
  process.exit(falhas === 0 ? 0 : 1);
})().catch(err => {
  console.error('Erro inesperado rodando os testes:', err);
  process.exit(1);
});
