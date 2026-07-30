/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */
if(sessaoAtual()){
  document.body.classList.add('autenticado');
  carregarDoServidor();
} else {
  carregando = false;
}
