/* =========================================================
   PIX (QR Code + copia-e-cola no orçamento)
   ========================================================= */
function normalizarTextoPix(str, tamanho){
  const semAcento = (str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim();
  return semAcento.substring(0, tamanho) || (tamanho <= 15 ? 'MANAUS' : 'FORMATO 3D');
}
function crc16Pix(str){
  let crc = 0xFFFF;
  const polinomio = 0x1021;
  for(let i = 0; i < str.length; i++){
    crc ^= (str.charCodeAt(i) << 8);
    for(let j = 0; j < 8; j++){
      crc = (crc & 0x8000) ? ((crc << 1) ^ polinomio) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function tlvPix(id, value){
  return id + String(value.length).padStart(2, '0') + value;
}
function montarPayloadPix(chave, nomeRecebedor, cidade, valor, txid){
  const chaveLimpa = (chave || '').trim();
  if(!chaveLimpa) return null;
  const merchantAccount = tlvPix('00', 'br.gov.bcb.pix') + tlvPix('01', chaveLimpa);
  let payload = tlvPix('00', '01') + tlvPix('26', merchantAccount) + tlvPix('52', '0000') + tlvPix('53', '986');
  if(valor && valor > 0) payload += tlvPix('54', valor.toFixed(2));
  payload += tlvPix('58', 'BR');
  payload += tlvPix('59', normalizarTextoPix(nomeRecebedor, 25));
  payload += tlvPix('60', normalizarTextoPix(cidade, 15));
  const txidLimpo = (txid || '***').replace(/[^A-Za-z0-9]/g, '').substring(0, 25) || '***';
  payload += tlvPix('62', tlvPix('05', txidLimpo));
  payload += '6304';
  return payload + crc16Pix(payload);
}
function renderizarPixOrcamento(o){
  const wrap = document.getElementById('poPixWrap');
  const chave = state.empresa && state.empresa.chavePix;
  const temPix = (o.formasPagamento || []).includes('Pix');
  if(!chave || !temPix){
    wrap.classList.add('hidden');
    return;
  }
  const cidade = (state.empresa.cidadePadrao || '').split('/')[0];
  const nomeRecebedor = state.empresa.nomePix || state.empresa.nome;
  const payload = montarPayloadPix(chave, nomeRecebedor, cidade, o.total, 'ORC' + String(o.numero).padStart(4, '0'));
  if(!payload){ wrap.classList.add('hidden'); return; }
  document.getElementById('poPixCopiaCola').value = payload;
  const canvas = document.getElementById('poPixCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if(typeof qrcode === 'function'){
    try{
      const qr = qrcode(0, 'M');
      qr.addData(payload);
      qr.make();
      const count = qr.getModuleCount();
      const cell = canvas.width / count;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      for(let r = 0; r < count; r++){
        for(let cCol = 0; cCol < count; cCol++){
          if(qr.isDark(r, cCol)) ctx.fillRect(cCol * cell, r * cell, cell, cell);
        }
      }
    }catch(e){ console.error('Erro ao gerar QR Code Pix:', e); }
  }
  wrap.classList.remove('hidden');
}
function copiarPixCopiaCola(){
  const input = document.getElementById('poPixCopiaCola');
  input.select();
  const finalizar = () => {
    const btn = document.getElementById('btnCopiarPix');
    const txtOriginal = btn.textContent;
    btn.textContent = 'Copiado!';
    btn.classList.add('copiado');
    setTimeout(() => { btn.textContent = txtOriginal; btn.classList.remove('copiado'); }, 1500);
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(input.value).then(finalizar).catch(() => {
      try{ document.execCommand('copy'); finalizar(); }catch(e){}
    });
  } else {
    try{ document.execCommand('copy'); finalizar(); }catch(e){}
  }
}

/* =========================================================
   ENVIO DE ORÇAMENTO PELO WHATSAPP
   ========================================================= */
function formatarTelefoneWhatsApp(telefone){
  const digitos = (telefone || '').replace(/\D/g, '');
  if(digitos.length < 10) return null;
  if(digitos.length <= 11) return '55' + digitos;
  return digitos;
}
function montarMensagemWhatsApp(o){
  const c = state.clientes.find(x => x.id === o.clienteId) || {};
  const primeiroNome = (c.nome || '').trim().split(' ')[0];
  const linhas = [];
  linhas.push(`Olá${primeiroNome ? ', ' + primeiroNome : ''}! 👋`);
  linhas.push('');
  linhas.push(`Segue o orçamento *Nº ${String(o.numero).padStart(4, '0')}* da *${state.empresa.nome}*:`);
  linhas.push('');
  (o.itens || []).forEach(it => {
    const totalItem = (it.qtd || 0) * (it.valorUnit || 0);
    linhas.push(`• ${it.qtd}x ${it.descricao} — R$ ${fmtMoeda(totalItem)}`);
  });
  linhas.push('');
  if(o.frete) linhas.push(`Frete: R$ ${fmtMoeda(o.frete)}`);
  if(o.desconto) linhas.push(`Desconto: R$ ${fmtMoeda(o.desconto)}`);
  linhas.push(`*Total: R$ ${fmtMoeda(o.total)}*`);
  linhas.push('');
  linhas.push(`📅 Validade: ${o.validadeDias || 7} dias`);
  if(o.formasPagamento && o.formasPagamento.length){
    linhas.push(`💳 Pagamento: ${o.formasPagamento.join(', ')}${o.condicaoPagamento ? ' — ' + o.condicaoPagamento : ''}`);
  }
  linhas.push('');
  linhas.push('Qualquer dúvida, estou à disposição! 😊');
  linhas.push(state.empresa.nome);
  return linhas.join('\n');
}
function enviarOrcamentoWhatsApp(id){
  const o = state.orcamentos.find(x => x.id === id);
  if(!o) return;
  const c = state.clientes.find(x => x.id === o.clienteId) || {};
  const numero = formatarTelefoneWhatsApp(c.telefone);
  if(!numero){
    alert('Este cliente não tem um telefone válido cadastrado. Edite o cliente e informe o telefone com DDD antes de enviar pelo WhatsApp.');
    return;
  }
  const mensagem = montarMensagemWhatsApp(o);
  const url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensagem);
  window.open(url, '_blank');
}

/* Impressão do orçamento (mesmo modelo em PDF) */
function imprimirOrcamento(id){
  const o = state.orcamentos.find(x => x.id === id);
  if(!o) return;
  const c = state.clientes.find(x => x.id === o.clienteId) || {};
  document.getElementById('poNumero').textContent = o.numero;
  document.getElementById('poData').textContent = fmtDataExibir(o.data);
  document.getElementById('poValidade').textContent = (o.validadeDias || '7') + ' dias';
  document.getElementById('poCliente').textContent = c.nome || '';
  document.getElementById('poTelefone').textContent = c.telefone || '';
  document.getElementById('poEmail').textContent = c.email || '';
  document.getElementById('poCidade').textContent = c.cidade || state.empresa.cidadePadrao || '';
  document.getElementById('poFormaPagamento').textContent = (o.formasPagamento && o.formasPagamento.length) ? o.formasPagamento.join(', ') : '—';
  document.getElementById('poCondicaoPagamento').textContent = o.condicaoPagamento || '—';

  const corpo = document.getElementById('poItensBody');
  corpo.innerHTML = '';
  o.itens.forEach(it => {
    const total = (it.qtd || 0) * (it.valorUnit || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(it.cod || '')}</td><td>${esc(it.descricao)}</td><td>${it.qtd}</td><td>R$ ${fmtMoeda(it.valorUnit)}</td><td class="total">R$ ${fmtMoeda(total)}</td>`;
    corpo.appendChild(tr);
  });
  document.getElementById('poFrete').textContent = 'R$ ' + fmtMoeda(o.frete);
  document.getElementById('poDesconto').textContent = 'R$ ' + fmtMoeda(o.desconto);
  document.getElementById('poTotalGeral').textContent = 'R$ ' + fmtMoeda(o.total);
  document.getElementById('poObs').textContent = o.obs || '';
  renderizarPixOrcamento(o);

  document.getElementById('printArea').classList.add('ativo');
  const areaRecibo = document.getElementById('printAreaRecibo');
  if(areaRecibo) areaRecibo.classList.remove('ativo');
  document.body.classList.add('modo-impressao');
  window.print();
}
window.addEventListener('afterprint', function(){
  document.body.classList.remove('modo-impressao');
});

