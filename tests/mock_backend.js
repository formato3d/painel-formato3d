// Backend falso (Node http puro) que imita a API do Google Apps Script o suficiente
// pra testar o painel de ponta a ponta sem precisar de uma planilha real. Usado só
// pelos testes automatizados (tests/smoke.js) — nunca toca nos dados de produção.
const http = require('http');

function criarMockBackend(porta){
  let store = {
    clientes: [{id:'cli_1', nome:'Meire São Vicente Pallotti', telefone:'(92) 99999-0000', email:'', cidade:'Manaus/AM'}],
    produtos: [],
    orcamentos: [],
    financeiro: [],
    modelosItens: [],
    filamentos: [],
    proximoNumero: 1,
    seq: {cliente:2, produto:1, orcamento:1, financeiro:1}
  };
  let revisao = 1;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'GET') {
        res.end(JSON.stringify(Object.assign({}, store, {revisao})));
        return;
      }
      if (req.method === 'POST') {
        let parsed;
        try { parsed = JSON.parse(body); } catch(e) { res.end(JSON.stringify({erro:'json inválido'})); return; }
        if (parsed.action === 'login') { res.end(JSON.stringify({ok:true, sessionToken:'sess-abc'})); return; }
        if (parsed.action === 'logout') { res.end(JSON.stringify({ok:true})); return; }
        if (parsed.action === 'listarUsuarios') { res.end(JSON.stringify({ok:true, usuarios:['felipe']})); return; }
        if (parsed.action === 'criarUsuario' || parsed.action === 'removerUsuario') { res.end(JSON.stringify({ok:true})); return; }
        const st = parsed.state;
        const recebida = parseInt(st.revisao, 10) || 0;
        if (recebida !== revisao) { res.end(JSON.stringify({erro:'dados_desatualizados', revisaoAtual: revisao})); return; }
        store = {
          clientes: st.clientes || [],
          produtos: st.produtos || [],
          orcamentos: st.orcamentos || [],
          financeiro: st.financeiro || [],
          modelosItens: st.modelosItens || [],
          filamentos: st.filamentos || [],
          proximoNumero: st.proximoNumero || 1,
          seq: st.seq || {cliente:1, produto:1, orcamento:1, financeiro:1}
        };
        revisao += 1;
        res.end(JSON.stringify({ok:true, salvoEm: new Date().toISOString(), revisao}));
        return;
      }
      res.end(JSON.stringify({erro:'method not allowed'}));
    });
  });
  return new Promise(resolve => server.listen(porta, () => resolve(server)));
}

module.exports = { criarMockBackend };
