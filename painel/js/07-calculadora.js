// =========================================================
// CALCULADORA 3D (v2)
// ---------------------------------------------------------
// - "Esta peça": campos que mudam a cada produto/pedido.
// - "Configurações fixas": filamento, impressora, energia, seu
// trabalho, custos do mês e taxas. Ficam salvas SÓ neste
// navegador (localStorage, chave c3:config). Não toca na
// planilha nem em nenhum outro dado do painel.
// - Preço = custo total ÷ (1 − taxa embutida − imposto − margem).
// A margem é sobre o PREÇO FINAL (lucro de verdade).
// - Este arquivo monta a própria tela dentro de #tab-calc3d,
// então o index.html não precisa ser alterado.
// =========================================================

const C3_KEY = 'c3:config';
const C3_FIXOS = {
  c3Fil: '120,00', c3Watts: '150', c3Kwh: '1,20', c3Maq: '4805,00', c3Vida: '5000',
  c3Manut: '0,30', c3Falha: '10', c3Hora: '27,30', c3FixoMes: '100,00', c3HorasMes: '200',
  c3MesasDia: '2', c3Taxa: '3,09', c3TaxaFixa: '0,00', c3Imp: '0',
  c3Deb: '0,89', c3C1: '3,09', c3C2: '5,79', c3C3: '6,09'
};
const C3_PECA = {
  c3Nome: '', c3PorMesa: '1', c3Pedido: '1', c3Gramas: '', c3Horas: '', c3Min: '',
  c3Trab: '', c3Insumos: '', c3Emb: '', c3Margem: '40', c3Pretendido: ''
};

function c3Num(id){
  const el = document.getElementById(id);
  if(!el) return 0;
  // aceita "1,5", "1.5", "1.000" e "1.000,50"
  let t = String(el.value).trim().replace(/[^0-9,.-]/g, '');
  if(t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const v = parseFloat(t);
  return isFinite(v) && v > 0 ? v : 0;
}
function c3R(v){ return 'R$ ' + fmtMoeda(v); }
function c3Pct(v, casas){
  return (v || 0).toLocaleString('pt-BR', {minimumFractionDigits: casas || 0, maximumFractionDigits: casas == null ? 1 : casas}) + '%';
}
function c3Set(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }

function c3Campo(id, rotulo, dica, pre, suf, area){
  return '<div class="field"><label>' + rotulo + (area ? ' <span class="c3-tag">' + area + '</span>' : '') +
    (dica ? '<small class="c3-dica">' + dica + '</small>' : '') + '</label>' +
    '<div class="c3-in">' + (pre ? '<span>' + pre + '</span>' : '') +
    '<input id="' + id + '" inputmode="decimal" placeholder="0" oninput="calcularOrcamento3D()">' +
    (suf ? '<span>' + suf + '</span>' : '') + '</div></div>';
}

function c3MontarTela(){
  const sec = document.getElementById('tab-calc3d');
  if(!sec || sec.dataset.c3) return;
  sec.dataset.c3 = '1';
  const C = c3Campo;
  sec.innerHTML = `
    <div class="panel-header"><h2 class="section-title">🧮 Calculadora 3D</h2></div>
    <p class="modal-sub" style="margin-top:-8px;">Preencha "Esta peça" para cada produto. As configurações fixas ficam salvas neste navegador. O preço já cobre filamento, energia, desgaste, manutenção, falhas, seu tempo, custos do mês, taxas e o lucro.</p>
    <div class="calc-wrap">
      <div class="c3-col">
        <div class="box c3-main">
          <h3>Esta peça</h3>
          <div class="c3-grid">
            <div class="field"><label>Nome da peça <span class="c3-tag">Peça</span></label><div class="c3-in"><input id="c3Nome" placeholder="Ex: Chaveiro" oninput="calcularOrcamento3D()"></div></div>
            ${C('c3PorMesa','Peças por mesa','quantas saem na mesma impressão','','un','Peça')}
            ${C('c3Pedido','Quantidade do pedido','1 para venda avulsa','','un','Pedido')}
            ${C('c3Gramas','Filamento gasto','da mesa inteira, do fatiador','','g','Material')}
            <div class="field"><label>Tempo de impressão <span class="c3-tag">Impressão</span><small class="c3-dica">da mesa inteira</small></label>
              <div class="c3-dupla"><div class="c3-in"><input id="c3Horas" inputmode="decimal" placeholder="0" oninput="calcularOrcamento3D()"><span>h</span></div><div class="c3-in"><input id="c3Min" inputmode="decimal" placeholder="0" oninput="calcularOrcamento3D()"><span>min</span></div></div></div>
            ${C('c3Trab','Tempo de trabalho por mesa','fatiar, tirar da mesa, limpar, embalar','','min','Trabalho')}
            ${C('c3Insumos','Outros insumos','por peça: argola, ímã, parafuso, tinta','R$','','Material')}
            ${C('c3Emb','Embalagem','por peça','R$','','Material')}
            ${C('c3Margem','Margem de lucro','sobre o preço final','','%','Venda')}
            ${C('c3Pretendido','Preço que pretende cobrar','opcional, para conferir','R$','','Venda')}
          </div>
        </div>

        <details class="box c3-fixos" id="c3Fixos">
          <summary><b>Configurações fixas</b><small class="c3-dica">Filamento, impressora, energia, seu trabalho, custos do mês e taxas. Mude só quando algo mudar.</small></summary>
          <h4>Material</h4>
          <div class="c3-grid">${C('c3Fil','Preço do filamento','por kg, com frete','R$','/kg')}</div>
          <h4>Impressora e energia</h4>
          <div class="c3-grid">
            <div class="field"><label>Modelo da impressora</label><select id="c3Modelo" onchange="aplicarModeloImpressora()"><option value="">Selecionar modelo</option><option value="150">Bambu Lab A1</option><option value="outro">Outro / não sei</option></select></div>
            ${C('c3Watts','Consumo médio','PLA ≈ 100–150 W','','W')}
            ${C('c3Kwh','Tarifa de energia','conta de luz ÷ kWh','R$','/kWh')}
            ${C('c3Maq','Valor da impressora','com acessórios','R$','')}
            ${C('c3Vida','Vida útil estimada','horas de impressão','','h')}
            <div class="field"><label>Depreciação por hora<small class="c3-dica">calculada: valor ÷ vida útil</small></label><div class="c3-in c3-trav"><input id="c3Deprec" readonly tabindex="-1"></div></div>
            ${C('c3Manut','Manutenção','bico, mesa, correias, graxa','R$','/h')}
            ${C('c3Falha','Taxa de falha','impressões perdidas','','%')}
          </div>
          <h4>Seu trabalho e custos do mês</h4>
          <div class="c3-grid">
            ${C('c3Hora','Valor da sua hora','meta do mês ÷ horas trabalhadas','R$','/h')}
            ${C('c3FixoMes','Custos fixos do mês','MEI/DAS, internet, ferramentas','R$','')}
            ${C('c3HorasMes','Horas impressas por mês','para dividir os fixos','','h')}
            ${C('c3MesasDia','Mesas por dia','para estimar o prazo','','mesas')}
          </div>
          <h4>Venda</h4>
          <div class="c3-grid">
            ${C('c3Taxa','Taxa embutida no preço','maquininha, Shopee, ML','','%')}
            ${C('c3TaxaFixa','Taxa fixa por venda','','R$','')}
            ${C('c3Imp','Imposto sobre venda','MEI: 0 (já está no DAS)','','%')}
          </div>
          <h4>Taxas do cartão (repassar ao cliente)</h4>
          <div class="c3-grid">
            ${C('c3Deb','Débito','','','%')}${C('c3C1','Crédito 1x','','','%')}${C('c3C2','Crédito 2x','','','%')}${C('c3C3','Crédito 3x','','','%')}
          </div>
        </details>

        <div class="form-actions c3-acoes">
          <button class="btn" type="button" onclick="c3NovaPeca()" title="Limpa só os campos de Esta peça. As configurações fixas continuam como estão.">Limpar esta peça</button>
          <button class="btn" type="button" onclick="c3CopiarResumo()">Copiar resumo</button>
          <span class="c3-msg" id="c3Msg"></span>
        </div>
      </div>

      <div class="calc-result c3-res">
        <h3>Preço sugerido por peça</h3>
        <div class="c3-preco" id="calcOutPrecoVenda">R$ 0,00</div>
        <div class="c3-sub" id="c3Sub"></div>
        <div class="c3-erro" id="c3Erro" hidden></div>
        <div class="c3-kpis">
          <div><b id="calcOutCustoTotal">R$ 0,00</b><small>Custo por peça</small></div>
          <div><b id="c3Lucro">R$ 0,00</b><small>Lucro líquido</small></div>
          <div><b id="c3PrecoMin">R$ 0,00</b><small>Preço mínimo (lucro zero)</small></div>
          <div><b id="c3Taxas">R$ 0,00</b><small>Taxas + impostos</small></div>
        </div>
        <label class="c3-pix"><input type="checkbox" id="c3Pix" onchange="calcularOrcamento3D()"> Cliente vai pagar no Pix <small>mesmo preço, sem taxa</small></label>
        <div class="c3-pill ok" id="c3PixExtra" hidden></div>
        <div id="c3Check"></div>

        <div class="c3-bloco">
          <div class="c3-mgtopo"><span>Margem de lucro</span><b id="c3MgVal">0%</b></div>
          <small class="c3-dica" id="c3MgSub"></small>
          <input type="range" id="c3MgRange" min="0" max="80" step="1" aria-label="Margem de lucro em porcentagem" oninput="c3SetMargem(this.value)">
          <div class="c3-chips" id="c3Chips">${[20,30,35,45,60].map(v => '<button type="button" data-v="' + v + '" onclick="c3SetMargem(' + v + ')">' + v + '%</button>').join('')}</div>
        </div>

        <div class="c3-bloco">
          <div class="c3-mgtopo"><span>Total do pedido</span><b id="calcOutTotalLote">R$ 0,00</b></div>
          <small class="c3-dica" id="c3PedSub"></small>
          <div id="c3Ped"></div>
        </div>

        <div class="c3-bloco">
          <div class="c3-mgtopo"><span>Simulação com taxa repassada</span></div>
          <small class="c3-dica" id="c3SimSub"></small>
          <div id="c3Sim"></div>
          <div class="calc-note">O cliente paga a taxa e você recebe o mesmo valor em qualquer forma de pagamento (mesma conta do app do banco).</div>
        </div>

        <div class="c3-bloco">
          <div class="c3-mgtopo"><span>Composição do custo (por peça)</span></div>
          <div id="c3Comp"></div>
        </div>

        <div class="form-actions" style="margin-top:14px;">
          <button class="btn" type="button" onclick="usarPrecoNoProduto()">Usar como novo produto</button>
        </div>
      </div>
    </div>`;

  const css = document.createElement('style');
  css.textContent = `
    .c3-col{display:flex;flex-direction:column;gap:14px;min-width:0}
    .c3-main{border:1.5px solid var(--navy)}
    .c3-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 14px}
    .c3-grid .field label{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px}
    .c3-tag{font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.05em;color:var(--navy);background:var(--box-bg);padding:1px 6px;border-radius:4px}
    .c3-dica{display:block;width:100%;font-weight:normal;color:var(--gray);font-size:11.5px}
    .c3-in{display:flex;align-items:stretch;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:var(--card)}
    .c3-in:focus-within{border-color:var(--navy)}
    .c3-in>span{display:flex;align-items:center;padding:0 8px;color:var(--gray);font-size:12px;background:var(--box-bg);white-space:nowrap}
    .c3-in input{flex:1;min-width:0;border:0 !important;border-radius:0 !important;box-shadow:none !important;margin:0 !important}
    .c3-trav input{color:var(--gray)}
    .c3-dupla{display:flex;gap:6px}.c3-dupla .c3-in{flex:1}
    .c3-fixos summary{cursor:pointer;display:flex;flex-direction:column;gap:2px;list-style:none}
    .c3-fixos summary::-webkit-details-marker{display:none}
    .c3-fixos summary b::before{content:"▸ ";color:var(--navy)}
    .c3-fixos[open] summary b::before{content:"▾ "}
    .c3-fixos h4{margin:16px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--navy)}
    .c3-acoes{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:0}
    .c3-msg{font-size:12px;color:var(--gray)}
    .c3-preco{font-size:34px;font-weight:bold;color:var(--navy);line-height:1.1}
    .c3-sub{font-size:12.5px;color:var(--gray);margin-top:2px}
    .c3-erro{color:var(--red);font-size:13px;margin-top:6px}
    .c3-kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    .c3-kpis div{background:var(--box-bg);border-radius:8px;padding:8px 10px}
    .c3-kpis b{display:block;font-size:15px}
    .c3-kpis small{color:var(--gray);font-size:11px}
    .c3-pix{display:flex;align-items:center;gap:8px;margin-top:12px;padding:9px 10px;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:13px}
    .c3-pix input{width:auto;margin:0}
    .c3-pix small{margin-left:auto;color:var(--gray)}
    .c3-pix:has(input:checked){border-color:var(--green)}
    .c3-pill{display:block;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:bold;margin-top:8px}
    .c3-pill.ok{background:var(--green-bg);color:var(--green)}
    .c3-pill.no{background:var(--red-bg);color:var(--red)}
    .c3-pill.mid{background:var(--amber-bg);color:var(--amber)}
    .c3-bloco{border-top:1px solid var(--line);margin-top:14px;padding-top:12px}
    .c3-mgtopo{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--gray);font-weight:bold}
    .c3-mgtopo b{font-size:20px;color:var(--text);text-transform:none;letter-spacing:0}
    .c3-bloco input[type=range]{width:100%;margin:8px 0 6px;accent-color:var(--navy);padding:0;border:0}
    .c3-chips{display:flex;flex-wrap:wrap;gap:6px}
    .c3-chips button{padding:4px 10px;font-size:12px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer}
    .c3-chips button.on{background:var(--navy);border-color:var(--navy);color:#fff}
    .c3-res .calc-linha span:last-child{text-align:right}
    [hidden]{display:none !important}`;
  document.head.appendChild(css);

  // valores iniciais: fixos salvos neste navegador (ou padrão) + campos da peça
  let salvo = {};
  try { salvo = JSON.parse(localStorage.getItem(C3_KEY)) || {}; } catch(e) { salvo = {}; }
  Object.keys(C3_FIXOS).forEach(id => { document.getElementById(id).value = salvo[id] != null ? salvo[id] : C3_FIXOS[id]; });
  Object.keys(C3_PECA).forEach(id => { document.getElementById(id).value = C3_PECA[id]; });
  try { if(localStorage.getItem(C3_KEY + ':aberto') === '1') document.getElementById('c3Fixos').open = true; } catch(e) {}
  document.getElementById('c3Fixos').addEventListener('toggle', function(){
    try { localStorage.setItem(C3_KEY + ':aberto', this.open ? '1' : '0'); } catch(e) {}
  });
}

function c3SalvarFixos(){
  try {
    const o = {};
    Object.keys(C3_FIXOS).forEach(id => { o[id] = document.getElementById(id).value; });
    localStorage.setItem(C3_KEY, JSON.stringify(o));
  } catch(e) {}
}

function aplicarModeloImpressora(){
  const v = document.getElementById('c3Modelo').value;
  if(v && v !== 'outro') document.getElementById('c3Watts').value = v;
  calcularOrcamento3D();
}
// mantida por compatibilidade: o lote agora é o campo "Peças por mesa"
function toggleCampoLote(){}
function c3SetMargem(v){ document.getElementById('c3Margem').value = String(v); calcularOrcamento3D(); }

let c3Ultimo = null;

function c3Calcular(){
  const porMesa = Math.max(1, Math.floor(c3Num('c3PorMesa')) || 1);
  const pedido = Math.max(1, Math.round(c3Num('c3Pedido')) || 1);
  const horas = c3Num('c3Horas') + c3Num('c3Min') / 60;
  const gramas = c3Num('c3Gramas');

  // custos da MESA inteira
  const filamento = gramas / 1000 * c3Num('c3Fil');
  const energia = c3Num('c3Watts') / 1000 * horas * c3Num('c3Kwh');
  const vida = c3Num('c3Vida');
  const deprecHora = vida > 0 ? c3Num('c3Maq') / vida : 0;
  const desgaste = deprecHora * horas;
  const manut = c3Num('c3Manut') * horas;
  // falha: só se perde o que uma tentativa que falha consome (filamento, energia, desgaste, manutenção)
  const falha = Math.min(c3Num('c3Falha'), 90) / 100;
  const perdas = (filamento + energia + desgaste + manut) * falha / (1 - falha);
  const maoDeObra = c3Num('c3Trab') / 60 * c3Num('c3Hora');
  const hMes = c3Num('c3HorasMes');
  const fixos = hMes > 0 ? c3Num('c3FixoMes') / hMes * horas : 0;

  const mesa = {'Filamento': filamento, 'Energia': energia, 'Desgaste da impressora': desgaste, 'Manutenção': manut,
                'Perdas por falha': perdas, 'Mão de obra': maoDeObra, 'Custos fixos': fixos};
  const itens = {};
  Object.keys(mesa).forEach(k => { itens[k] = mesa[k] / porMesa; });
  itens['Insumos e embalagem'] = c3Num('c3Insumos') + c3Num('c3Emb');
  const custo = Object.values(itens).reduce((a, b) => a + b, 0);

  const pTaxa = c3Num('c3Taxa') / 100, pImp = c3Num('c3Imp') / 100, pMg = c3Num('c3Margem') / 100;
  const fixa = c3Num('c3TaxaFixa');
  const pix = document.getElementById('c3Pix').checked;
  const r = {porMesa, pedido, horas, gramas, itens, custo, deprecHora, pix};
  const div = 1 - pTaxa - pImp - pMg;
  if(div <= 0.0001){ r.erro = 'Taxas + imposto + margem somam 100% ou mais. Reduza a margem.'; return r; }

  // preço arredondado para cima em R$ 0,10
  r.preco = Math.ceil((custo + fixa) / div * 10 - 1e-9) / 10;
  const divMin = 1 - pTaxa - pImp;
  r.min = divMin > 0 ? (custo + fixa) / divMin : Infinity;
  r.extra = r.preco * pTaxa + fixa;                       // taxa embutida que vira lucro no Pix
  r.taxas = pix ? r.preco * pImp : r.preco * (pTaxa + pImp) + fixa;
  r.lucro = r.preco - r.taxas - custo;

  // pedido
  const mesas = Math.ceil(pedido / porMesa);
  const dias = Math.ceil(mesas / Math.max(1, c3Num('c3MesasDia') || 1));
  const total = r.preco * pedido;
  const taxasTot = pix ? total * pImp : total * (pTaxa + pImp) + fixa * pedido;
  r.ped = {mesas, reserva: mesas * porMesa - pedido, horas: mesas * horas, kg: mesas * gramas / 1000,
           filCusto: mesas * filamento, custo: custo * pedido, total, taxasTot,
           lucro: total - taxasTot - custo * pedido, sinal: total / 2, dias, prazo: dias * 2 + 5};

  // simulação com taxa repassada ao cliente: parte do preço SEM taxa de cartão
  const dSem = 1 - pImp - pMg;
  if(dSem > 0.0001){
    const unit = Math.ceil((custo + fixa) / dSem * 10 - 1e-9) / 10;
    const liq = unit * pedido;
    r.sim = {unit, liq, rows: [['Pix', 0, 1], ['Débito', c3Num('c3Deb'), 1], ['Crédito 1x', c3Num('c3C1'), 1],
      ['Crédito 2x', c3Num('c3C2'), 2], ['Crédito 3x', c3Num('c3C3'), 3]].map(([n, t, x]) => {
        const parc = Math.ceil(liq / (1 - Math.min(t, 90) / 100) / x * 100 - 1e-9) / 100;
        return {n, t, x, parc, tot: parc * x};
      })};
  }

  const pr = c3Num('c3Pretendido');
  if(pr > 0){
    const t = pix ? pr * pImp : pr * (pTaxa + pImp) + fixa;
    r.check = {pr, lucro: pr - t - custo, margem: (pr - t - custo) / pr};
  }
  return r;
}

function c3Linhas(arr){
  return arr.map(([a, b, cls]) => '<div class="calc-linha' + (cls ? ' ' + cls : '') + '"><span>' + a + '</span><span>' + b + '</span></div>').join('');
}

function calcularOrcamento3D(){
  c3MontarTela();
  if(!document.getElementById('c3Nome')) return;
  c3SalvarFixos();
  const r = c3Calcular();
  c3Ultimo = r;
  document.getElementById('c3Deprec').value = c3R(r.deprecHora) + '/h';

  const erro = document.getElementById('c3Erro');
  erro.hidden = !r.erro; erro.textContent = r.erro || '';
  c3Set('calcOutCustoTotal', c3R(r.custo));

  const mg = c3Num('c3Margem');
  c3Set('c3MgVal', c3Pct(mg));
  const rng = document.getElementById('c3MgRange');
  if(document.activeElement !== rng) rng.value = Math.min(80, mg);
  document.querySelectorAll('#c3Chips button').forEach(b => b.classList.toggle('on', +b.dataset.v === mg));

  if(r.erro){
    ['calcOutPrecoVenda', 'c3Lucro', 'c3PrecoMin', 'c3Taxas', 'calcOutTotalLote'].forEach(id => c3Set(id, '—'));
    ['c3Sub', 'c3MgSub', 'c3PedSub', 'c3SimSub'].forEach(id => c3Set(id, ''));
    ['c3Ped', 'c3Sim', 'c3Check'].forEach(id => { document.getElementById(id).innerHTML = ''; });
    document.getElementById('c3PixExtra').hidden = true;
  } else {
    const nome = document.getElementById('c3Nome').value.trim();
    const hf = v => v.toLocaleString('pt-BR', {maximumFractionDigits: 1});
    c3Set('calcOutPrecoVenda', c3R(r.preco));
    c3Set('c3Sub', (nome ? nome + ' · ' : '') + (r.porMesa > 1 ? r.porMesa + ' por mesa · ' : '') + hf(r.horas) + ' h de impressão por mesa');
    c3Set('c3Lucro', c3R(r.lucro));
    c3Set('c3PrecoMin', isFinite(r.min) ? c3R(r.min) : '—');
    c3Set('c3Taxas', c3R(r.taxas));
    c3Set('c3MgSub', 'do preço final · equivale a ' + c3Pct(r.custo > 0 ? r.lucro / r.custo * 100 : 0) + ' acima do custo · ' + c3R(r.lucro) + ' por peça');

    const px = document.getElementById('c3PixExtra');
    px.hidden = !r.pix || r.extra <= 0;
    px.textContent = 'No Pix a taxa vira lucro: +' + c3R(r.extra) + ' por peça' +
      (r.pedido > 1 ? ' · +' + c3R(r.extra * r.pedido) + ' no pedido' : '') +
      ' · margem sobe de ' + c3Pct((r.lucro - r.extra) / r.preco * 100, 1) + ' para ' + c3Pct(r.lucro / r.preco * 100, 1);

    const p = r.ped;
    c3Set('calcOutTotalLote', c3R(p.total));
    c3Set('c3PedSub', r.pedido + ' un × ' + c3R(r.preco) + (r.pix ? ' · pagamento no Pix' : ' · taxa da maquininha incluída'));
    document.getElementById('c3Ped').innerHTML = c3Linhas([
      ['Lucro do pedido', c3R(p.lucro), 'destaque'],
      ['Sinal (50%)', c3R(p.sinal)],
      ['Mesas a imprimir', p.mesas + (p.reserva > 0 ? ' (+' + p.reserva + ' de reserva)' : '')],
      ['Horas de impressão', hf(p.horas) + ' h'],
      ['Filamento', hf(p.kg) + ' kg · ' + c3R(p.filCusto)],
      ['Custo total do pedido', c3R(p.custo)],
      ['Taxas da venda', c3R(p.taxasTot)],
      ['Dias imprimindo', p.dias + (p.dias > 1 ? ' dias' : ' dia')],
      ['Prazo para prometer', p.prazo + ' dias']
    ]);

    if(r.sim){
      c3Set('c3SimSub', 'Você recebe ' + c3R(r.sim.liq) + (r.pedido > 1 ? ' (' + c3R(r.sim.unit) + ' por unidade)' : ''));
      document.getElementById('c3Sim').innerHTML = c3Linhas(r.sim.rows.map(o => [
        o.n + ' <small style="color:var(--gray)">' + c3Pct(o.t, 2).replace(',00%', '%') + '</small>',
        o.x > 1 ? o.x + 'x de ' + c3R(o.parc) + '<br><small style="color:var(--gray);font-weight:normal">total ' + c3R(o.tot) + '</small>' : c3R(o.tot)
      ]));
    } else { c3Set('c3SimSub', ''); document.getElementById('c3Sim').innerHTML = ''; }

    const ck = document.getElementById('c3Check');
    if(r.check){
      const c = r.check;
      let cls = 'ok', txt = 'Com ' + c3R(c.pr) + ' você lucra ' + c3R(c.lucro) + ' por peça (' + c3Pct(c.margem * 100, 1) + ').';
      if(c.lucro < 0){ cls = 'no'; txt = 'Com ' + c3R(c.pr) + ' você tem PREJUÍZO de ' + c3R(-c.lucro) + ' por peça.'; }
      else if(c.pr < r.preco){ cls = 'mid'; txt += ' Abaixo da margem desejada.'; }
      ck.innerHTML = '<div class="c3-pill ' + cls + '">' + txt + '</div>';
    } else ck.innerHTML = '';
  }

  const tot = r.custo || 1;
  document.getElementById('c3Comp').innerHTML = c3Linhas(
    Object.keys(r.itens).filter(k => r.itens[k] > 0)
      .map(k => [k, c3R(r.itens[k]) + ' <small style="color:var(--gray);font-weight:normal">' + Math.round(r.itens[k] / tot * 100) + '%</small>'])
      .concat([['Custo total por peça', c3R(r.custo), 'destaque']]));
}

function c3NovaPeca(){
  Object.keys(C3_PECA).forEach(id => { if(id !== 'c3Margem') document.getElementById(id).value = C3_PECA[id]; });
  document.getElementById('c3Pix').checked = false;
  calcularOrcamento3D();
  document.getElementById('c3Nome').focus();
  c3Set('c3Msg', 'Campos da peça limpos. As configurações fixas continuam como estavam.');
}

function c3Resumo(){
  const r = c3Ultimo;
  if(!r || r.erro) return '';
  const n = document.getElementById('c3Nome').value.trim() || 'Peça 3D';
  const p = r.ped;
  let s = n + '\nPreço por unidade: ' + c3R(r.preco) + '\nPedido: ' + r.pedido + ' un = ' + c3R(p.total) +
    '\nSinal (50%): ' + c3R(p.sinal) + '\nPrazo: ' + p.prazo + ' dias';
  if(r.sim){
    s += '\n\nFormas de pagamento:\n';
    r.sim.rows.forEach(o => { s += '- ' + o.n + ': ' + (o.x > 1 ? o.x + 'x de ' + c3R(o.parc) + ' (total ' + c3R(o.tot) + ')' : c3R(o.tot)) + '\n'; });
  }
  return s;
}
function c3CopiarResumo(){
  const t = c3Resumo();
  if(!t){ c3Set('c3Msg', 'Corrija os campos antes de copiar.'); return; }
  const fb = () => {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch(e) {}
    ta.remove(); c3Set('c3Msg', ok ? 'Resumo copiado.' : 'Não foi possível copiar.');
  };
  try { navigator.clipboard.writeText(t).then(() => c3Set('c3Msg', 'Resumo copiado.'), fb); } catch(e) { fb(); }
}

function usarPrecoNoProduto(){
  const r = c3Ultimo || c3Calcular();
  if(r.erro) return;
  const nome = document.getElementById('c3Nome').value.trim();
  abrirFormProduto();
  if(nome) document.getElementById('fpNome').value = nome;
  document.getElementById('fpPreco').value = fmtMoeda(r.preco);
  document.getElementById('fpPrecoCusto').value = fmtMoeda(r.custo);
  const pesoPeca = r.gramas / r.porMesa;   // peso de UMA peça (o filamento é da mesa inteira)
  if(pesoPeca) document.getElementById('fpPeso').value = Math.round(pesoPeca * 10) / 10;
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', calcularOrcamento3D);
else calcularOrcamento3D();
