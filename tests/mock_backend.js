// Backend falso (Node http puro) que imita a API do Google Apps Script o suficiente
// pra testar o painel de ponta a ponta sem precisar de uma planilha real. Usado só
// pelos testes automatizados (tests/smoke.js) — nunca toca nos dados de produção.
//
// Espelha o novo salvarTudo() do Code.gs: o cliente manda só um DELTA (registros
// novos/alterados por tipo, não a lista inteira), o servidor mescla cada registro
// pelo id (sem apagar o que não veio no delta) e SEMPRE aceita — nunca mais rejeita
// com "dados_desatualizados". Isso é o que permite duas pessoas salvando ao mesmo
// tempo sem uma apagar o trabalho da outra.
const http = require('http');

const TIPOS = ['clientes', 'produtos', 'orcamentos', 'financeiro', 'modelosItens', 'filamentos', 'compras'];

function mesclarArrayPorId(atuais, alteracoes){
  const porId = {};
  (atuais || []).forEach(item => { porId[item.id] = item; });
  (alteracoes || []).forEach(item => { porId[item.id] = item; });
  const vistos = {};
  const resultado = [];
  (atuais || []).forEach(item => {
    if(!vistos[item.id]){ resultado.push(porId[item.id]); vistos[item.id] = true; }
  });
  (alteracoes || []).forEach(item => {
    if(!vistos[item.id]){ resultado.push(porId[item.id]); vistos[item.id] = true; }
  });
  return resultado;
}

function mesclarContadores(atual, recebido){
  const resultado = Object.assign({}, atual || {});
  Object.keys(recebido || {}).forEach(k => {
    resultado[k] = Math.max(Number(resultado[k]) || 0, Number(recebido[k]) || 0);
  });
  return resultado;
}

// Espelha garantirNumerosUnicos_ do Code.gs: se duas pessoas criaram orçamentos com o
// mesmo número (ex: as duas geraram "0009" antes de sincronizar), a segunda ocorrência
// é renumerada pro próximo número livre em vez de deixar dois orçamentos com o mesmo nº.
function garantirNumerosUnicos(orcamentos, proximoNumeroSugerido){
  let maior = Math.max(Number(proximoNumeroSugerido) || 1, 1) - 1;
  orcamentos.forEach(o => {
    const n = parseInt(o.numero, 10) || 0;
    if(n > maior) maior = n;
  });
  const usados = {};
  orcamentos.forEach(o => {
    const n = parseInt(o.numero, 10) || 0;
    if(!n) return;
    if(usados[n]){
      maior += 1;
      o.numero = String(maior).padStart(4, '0');
      usados[maior] = true;
    } else {
      usados[n] = true;
    }
  });
  return maior + 1;
}

function criarMockBackend(porta){
  let store = {
    clientes: [{id:'cli_1', nome:'Meire São Vicente Pallotti', telefone:'(92) 99999-0000', email:'', cidade:'Manaus/AM'}],
    produtos: [],
    orcamentos: [],
    financeiro: [],
    modelosItens: [],
    filamentos: [],
    compras: [],
    proximoNumero: 1,
    seq: {cliente:2, produto:1, orcamento:1, financeiro:1, compra:1}
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'GET') {
        res.end(JSON.stringify(Object.assign({}, store, {ok:true})));
        return;
      }
      if (req.method === 'POST') {
        let parsed;
        try { parsed = JSON.parse(body); } catch(e) { res.end(JSON.stringify({erro:'json inválido'})); return; }
        if (parsed.action === 'login') { res.end(JSON.stringify({ok:true, sessionToken:'sess-abc'})); return; }
        if (parsed.action === 'logout') { res.end(JSON.stringify({ok:true})); return; }
        if (parsed.action === 'listarUsuarios') { res.end(JSON.stringify({ok:true, usuarios:['felipe']})); return; }
        if (parsed.action === 'criarUsuario' || parsed.action === 'removerUsuario') { res.end(JSON.stringify({ok:true})); return; }
        const st = parsed.state || {};

        const novoStore = Object.assign({}, store);
        TIPOS.forEach(tipo => {
          if(tipo === 'orcamentos') return; // tratado à parte por causa da renumeração
          novoStore[tipo] = mesclarArrayPorId(store[tipo], st[tipo]);
        });

        const orcamentosFinal = mesclarArrayPorId(store.orcamentos, st.orcamentos);
        const proximoNumeroFinal = garantirNumerosUnicos(orcamentosFinal, st.proximoNumero);
        novoStore.orcamentos = orcamentosFinal;
        novoStore.proximoNumero = proximoNumeroFinal;
        novoStore.seq = mesclarContadores(store.seq, st.seq);

        store = novoStore;
        res.end(JSON.stringify(Object.assign({}, store, {ok:true, salvoEm: new Date().toISOString()})));
        return;
      }
      res.end(JSON.stringify({erro:'method not allowed'}));
    });
  });
  return new Promise(resolve => server.listen(porta, () => resolve(server)));
}

module.exports = { criarMockBackend };
